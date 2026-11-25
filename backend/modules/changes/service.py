import uuid
from datetime import datetime

from fastapi import HTTPException, status
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import delete
from sqlmodel import Session, select

from backend.core.clock import as_aware
from backend.modules.changes.schemas import TARGETED_FIELDS, ChangeField, ChangeItemInput
from backend.modules.events.models import event_change_request_items, event_seats, events
from backend.modules.events.schemas import SeatingMode
from backend.modules.orders.models import order_items, reservation_items, reservations
from backend.modules.orders.schemas import ReservationStatus
from backend.modules.payments.activation import paid_sales_active
from backend.modules.tickets.models import ticket_types, tickets
from backend.modules.tickets.schemas import TicketKind, TicketTypeCreate
from backend.modules.venues.models import venue_layouts, venues

EMAIL = TypeAdapter(EmailStr)


def bad(message: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, message)


def iso(value: datetime | None) -> str | None:
    return as_aware(value).isoformat() if value else None


def parse_dt(value, field: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        raise bad(f"{field} must be an ISO datetime")
    if parsed.tzinfo is None:
        raise bad(f"{field} must include a timezone")
    return parsed


def parse_uuid(value, field: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise bad(f"{field} must be an id")


def type_of(session: Session, event: events, target_id: uuid.UUID | None, lock: bool = False) -> ticket_types:
    if target_id is None:
        raise bad("Ticket type changes need target_id")
    query = select(ticket_types).where(ticket_types.id == target_id, ticket_types.event_id == event.id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    ticket_type = session.exec(query).first()
    if ticket_type is None:
        raise bad("Ticket type does not belong to this event")
    return ticket_type


def current_value(session: Session, event: events, field: ChangeField, target_id: uuid.UUID | None):
    if field == ChangeField.TITLE:
        return event.title
    if field == ChangeField.STARTS_AT:
        return iso(event.starts_at)
    if field == ChangeField.ENDS_AT:
        return iso(event.ends_at)
    if field == ChangeField.VENUE:
        return str(event.venue_id)
    if field == ChangeField.VENUE_LAYOUT:
        return str(event.venue_layout_id) if event.venue_layout_id else None
    if field == ChangeField.GA_CAPACITY:
        return event.ga_capacity
    if field == ChangeField.RESPONSIBLE_NAME:
        return event.responsible_name
    if field == ChangeField.RESPONSIBLE_EMAIL:
        return event.responsible_email
    if field == ChangeField.RESPONSIBLE_PHONE:
        return event.responsible_phone
    if field == ChangeField.REFUND_POLICY:
        return event.refund_policy or {}
    if field == ChangeField.CREATE_TICKET_TYPE:
        return {}
    ticket_type = type_of(session, event, target_id)
    if field == ChangeField.TICKET_TYPE_PRICE:
        return ticket_type.price_minor
    if field == ChangeField.TICKET_TYPE_QUANTITY:
        return ticket_type.quantity_total
    if field == ChangeField.TICKET_TYPE_ACTIVE:
        return ticket_type.is_active
    if field == ChangeField.TICKET_TYPE_SALES_WINDOW:
        return {"sales_start_at": iso(ticket_type.sales_start_at), "sales_end_at": iso(ticket_type.sales_end_at)}
    return {"name": ticket_type.name}


def check_shape(session: Session, event: events, item: ChangeItemInput) -> None:
    field, value = item.field, item.new_value
    if (field in TARGETED_FIELDS) != (item.target_id is not None):
        raise bad(f"{field.value}: target_id is {'required' if field in TARGETED_FIELDS else 'not allowed'}")
    if field in TARGETED_FIELDS:
        type_of(session, event, item.target_id)
    if field in (ChangeField.TITLE, ChangeField.RESPONSIBLE_NAME, ChangeField.RESPONSIBLE_PHONE):
        if not isinstance(value, str) or not value.strip() or len(value) > 200:
            raise bad(f"{field.value} must be a non-empty text")
    elif field == ChangeField.RESPONSIBLE_EMAIL:
        try:
            EMAIL.validate_python(value)
        except ValidationError:
            raise bad("RESPONSIBLE_EMAIL must be an email")
    elif field in (ChangeField.STARTS_AT, ChangeField.ENDS_AT):
        parse_dt(value, field.value)
    elif field in (ChangeField.VENUE, ChangeField.VENUE_LAYOUT):
        parse_uuid(value, field.value)
    elif field in (ChangeField.GA_CAPACITY, ChangeField.TICKET_TYPE_PRICE):
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise bad(f"{field.value} must be a non-negative integer")
    elif field == ChangeField.TICKET_TYPE_QUANTITY:
        if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value <= 0):
            raise bad("TICKET_TYPE_QUANTITY must be a positive integer or null")
    elif field == ChangeField.TICKET_TYPE_ACTIVE:
        if not isinstance(value, bool):
            raise bad("TICKET_TYPE_ACTIVE must be true or false")
    elif field == ChangeField.TICKET_TYPE_SALES_WINDOW:
        if not isinstance(value, dict):
            raise bad("TICKET_TYPE_SALES_WINDOW must be an object")
        parse_dt(value.get("sales_start_at"), "sales_start_at")
        parse_dt(value.get("sales_end_at"), "sales_end_at")
    elif field == ChangeField.REFUND_POLICY:
        hours = value.get("self_service_refund_until_hours_before_start") if isinstance(value, dict) else "bad"
        if not isinstance(value, dict) or (hours is not None and (not isinstance(hours, int) or isinstance(hours, bool) or hours < 0)):
            raise bad("REFUND_POLICY must be an object with optional self_service_refund_until_hours_before_start")
    elif field == ChangeField.CREATE_TICKET_TYPE:
        try:
            TicketTypeCreate.model_validate(value)
        except ValidationError as exc:
            raise bad(f"CREATE_TICKET_TYPE: {exc.errors()[0]['msg']}")


def replace_items(session: Session, event: events, request_id: uuid.UUID, items: list[ChangeItemInput]) -> None:
    seen = set()
    for item in items:
        key = (item.field, item.target_id)
        if item.field != ChangeField.CREATE_TICKET_TYPE and key in seen:
            raise bad(f"Duplicate change of {item.field.value}")
        seen.add(key)
        check_shape(session, event, item)
    session.exec(delete(event_change_request_items).where(event_change_request_items.change_request_id == request_id))
    for item in items:
        session.add(event_change_request_items(change_request_id=request_id, event_id=event.id, field=item.field.value, target_id=item.target_id,
                                               old_value=current_value(session, event, item.field, item.target_id), new_value=item.new_value))


def ever_issued(session: Session, event_id: uuid.UUID) -> bool:
    return session.exec(select(tickets.id).where(tickets.event_id == event_id).limit(1)).first() is not None


def apply(session: Session, event: events, items: list[event_change_request_items], now: datetime) -> set[ChangeField]:
    from backend.modules.orders.service import ga_occupancy

    fields = {ChangeField(i.field) for i in items}
    by_field = {ChangeField(i.field): i for i in items if i.target_id is None and i.field != ChangeField.CREATE_TICKET_TYPE.value}
    target_ids = sorted({i.target_id for i in items if i.target_id is not None})
    locked = {t.id: t for t in session.exec(select(ticket_types).where(ticket_types.id.in_(target_ids or [uuid.uuid4()]), ticket_types.event_id == event.id)
                                            .order_by(ticket_types.id).with_for_update().execution_options(populate_existing=True)).all()}
    if len(locked) != len(target_ids):
        raise HTTPException(status.HTTP_409_CONFLICT, "A ticket type in this request no longer exists")
    occupancy = ga_occupancy(session, event.id, now)

    starts = parse_dt(by_field[ChangeField.STARTS_AT].new_value, "STARTS_AT") if ChangeField.STARTS_AT in by_field else as_aware(event.starts_at)
    ends = parse_dt(by_field[ChangeField.ENDS_AT].new_value, "ENDS_AT") if ChangeField.ENDS_AT in by_field else as_aware(event.ends_at)
    if ends <= starts:
        raise bad("Event end must be after start")
    if ChangeField.STARTS_AT in fields and starts <= now:
        raise bad("New start must be in the future")

    venue = session.get(venues, event.venue_id)
    if ChangeField.VENUE in by_field:
        venue = session.get(venues, parse_uuid(by_field[ChangeField.VENUE].new_value, "VENUE"))
        if venue is None:
            raise bad("Venue not found")
        if event.seating_mode == SeatingMode.ASSIGNED_SEATING:
            if ever_issued(session, event.id):
                raise HTTPException(status.HTTP_409_CONFLICT, "Assigned seating venue cannot change after tickets were issued")
            if ChangeField.VENUE_LAYOUT not in by_field:
                raise bad("Changing the venue of a seated event requires a new layout")
    if ChangeField.VENUE_LAYOUT in by_field:
        if event.seating_mode != SeatingMode.ASSIGNED_SEATING:
            raise bad("Only seated events have a layout")
        if ever_issued(session, event.id):
            raise HTTPException(status.HTTP_409_CONFLICT, "Layout cannot change after tickets were issued")
        holds = session.exec(select(reservations.id).where(reservations.event_id == event.id, reservations.status.in_((ReservationStatus.ACTIVE, ReservationStatus.PROTECTED)),
                                                           reservations.expires_at > now).limit(1)).first()
        if holds:
            raise HTTPException(status.HTTP_409_CONFLICT, "Layout cannot change while seats are on hold")
        layout = session.get(venue_layouts, parse_uuid(by_field[ChangeField.VENUE_LAYOUT].new_value, "VENUE_LAYOUT"))
        if layout is None or layout.venue_id != venue.id or not layout.is_active:
            raise bad("Layout does not belong to the venue")
        if layout.id == event.venue_layout_id:
            raise bad("Event already uses this layout")

    capacity = event.ga_capacity
    if ChangeField.GA_CAPACITY in by_field:
        if event.seating_mode != SeatingMode.GENERAL_ADMISSION:
            raise bad("Capacity is derived from seats for seated events")
        capacity = by_field[ChangeField.GA_CAPACITY].new_value
    if event.seating_mode == SeatingMode.GENERAL_ADMISSION and capacity is not None:
        if capacity <= 0 or capacity > venue.max_capacity:
            raise bad(f"Capacity must be between 1 and {venue.max_capacity}")
        if capacity < sum(occupancy.values()):
            raise HTTPException(status.HTTP_409_CONFLICT, "Capacity is below tickets already sold or held")

    for item in items:
        field, value = ChangeField(item.field), item.new_value
        if field == ChangeField.TITLE:
            event.title = value.strip()
        elif field == ChangeField.RESPONSIBLE_NAME:
            event.responsible_name = value.strip()
        elif field == ChangeField.RESPONSIBLE_EMAIL:
            event.responsible_email = value
        elif field == ChangeField.RESPONSIBLE_PHONE:
            event.responsible_phone = value.strip()
        elif field == ChangeField.REFUND_POLICY:
            event.refund_policy = value
        elif field == ChangeField.TICKET_TYPE_PRICE:
            ticket_type = locked[item.target_id]
            if (ticket_type.kind == TicketKind.PAID) != (value > 0):
                raise bad("Price must stay positive for paid and zero for free tickets")
            ticket_type.price_minor = value
        elif field == ChangeField.TICKET_TYPE_QUANTITY:
            ticket_type = locked[item.target_id]
            if event.seating_mode == SeatingMode.ASSIGNED_SEATING:
                raise bad("Quantity is derived from assigned seats")
            if value is not None and value < occupancy.get(ticket_type.id, 0):
                raise HTTPException(status.HTTP_409_CONFLICT, f"'{ticket_type.name}' already has more tickets sold or held")
            ticket_type.quantity_total = value
        elif field == ChangeField.TICKET_TYPE_ACTIVE:
            locked[item.target_id].is_active = value
        elif field == ChangeField.TICKET_TYPE_SALES_WINDOW:
            start_at, end_at = parse_dt(value["sales_start_at"], "sales_start_at"), parse_dt(value["sales_end_at"], "sales_end_at")
            if end_at <= start_at:
                raise bad("Sales must end after they start")
            locked[item.target_id].sales_start_at, locked[item.target_id].sales_end_at = start_at, end_at
        elif field == ChangeField.DELETE_TICKET_TYPE:
            ticket_type = locked[item.target_id]
            used = session.exec(select(reservation_items.id).where(reservation_items.ticket_type_id == ticket_type.id).limit(1)).first() \
                or session.exec(select(order_items.id).where(order_items.ticket_type_id == ticket_type.id).limit(1)).first()
            if used:
                raise HTTPException(status.HTTP_409_CONFLICT, f"'{ticket_type.name}' was already used; deactivate it instead")
            for seat in session.exec(select(event_seats).where(event_seats.ticket_type_id == ticket_type.id)).all():
                seat.ticket_type_id = None
                session.add(seat)
            session.flush()
            session.delete(ticket_type)
        elif field == ChangeField.CREATE_TICKET_TYPE:
            spec = TicketTypeCreate.model_validate(value)
            if (spec.kind == TicketKind.PAID) != (spec.price_minor > 0):
                raise bad("Price must be positive for paid and zero for free tickets")
            if spec.kind == TicketKind.PAID and not paid_sales_active(session, event.id):
                raise HTTPException(status.HTTP_409_CONFLICT, "Paid Sales Activation must be ACTIVE to add paid tickets")
            if event.seating_mode == SeatingMode.ASSIGNED_SEATING and spec.quantity_total is not None:
                raise bad("Quantity is derived from assigned seats")
            session.add(ticket_types(event_id=event.id, **spec.model_dump()))
    for ticket_type in locked.values():
        if ticket_type.id in {i.target_id for i in items if i.field == ChangeField.DELETE_TICKET_TYPE.value}:
            continue
        session.add(ticket_type)

    event.starts_at, event.ends_at = starts, ends
    if ChangeField.VENUE in by_field:
        event.venue_id = venue.id
    if event.seating_mode == SeatingMode.GENERAL_ADMISSION:
        event.ga_capacity = capacity
    if ChangeField.VENUE_LAYOUT in by_field:
        from backend.modules.applications.service import generate_event_seats
        used_seats = set(session.exec(select(reservation_items.event_seat_id).where(reservation_items.event_id == event.id, reservation_items.event_seat_id.is_not(None))).all())
        for seat in session.exec(select(event_seats).where(event_seats.event_id == event.id)).all():
            if seat.id in used_seats:
                seat.is_enabled = False
                seat.ticket_type_id = None
                session.add(seat)
            else:
                session.delete(seat)
        session.flush()
        event.venue_layout_id = layout.id
        generate_event_seats(session, event.id, layout.id)
    session.flush()
    for ticket_type in session.exec(select(ticket_types).where(ticket_types.event_id == event.id)).all():
        if as_aware(ticket_type.sales_end_at) > ends:
            raise bad(f"Sales of '{ticket_type.name}' must end no later than the event")
    session.add(event)
    return fields
