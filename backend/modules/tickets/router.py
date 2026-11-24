import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.modules.auth.dependencies import get_current_user, get_optional_user
from backend.modules.events.access import can_view_event, get_event_or_404, require_organizer
from backend.modules.events.models import events, event_seats
from backend.modules.events.router import ever_issued
from backend.modules.events.schemas import EventLifecycleStatus, SeatingMode
from backend.modules.orders.models import reservation_items, reservations, order_items, orders
from backend.modules.orders.service import availability, effective_hold_clause, sale_state, taken_seat_ids
from backend.modules.promotions.models import promo_code_ticket_types
from backend.modules.tickets import service as ticket_service
from backend.modules.tickets.models import ticket_types, tickets
from backend.modules.tickets.pdf import render_ticket_pdf
from backend.modules.tickets.schemas import TicketPublic, TicketTypeCreate, TicketTypePublic, TicketTypeUpdate, TicketKind
from backend.modules.users.user_model import users
from backend.modules.venues.models import venues, venue_rows, venue_seats, venue_sections
from database.database import get_session

router = APIRouter(tags=["tickets"])


def type_to_public(event: events, ticket_type: ticket_types, now, available: int | None) -> TicketTypePublic:
    return TicketTypePublic(**ticket_type.model_dump(), sale_state=sale_state(event, ticket_type, now, available), available=available)


def _validate_type(event: events, kind: TicketKind, price_minor: int, sales_start_at, sales_end_at, quantity_total: int | None) -> None:
    if kind == TicketKind.FREE and price_minor != 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Free tickets must have price 0")
    if kind == TicketKind.PAID and price_minor <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Paid tickets must have a positive price")
    if as_aware(sales_end_at) <= as_aware(sales_start_at):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sales must end after they start")
    if as_aware(sales_end_at) > as_aware(event.ends_at):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sales must end no later than the event")
    if event.seating_mode == SeatingMode.ASSIGNED_SEATING and quantity_total is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Quantity is derived from assigned seats")


def _require_draft(event: events) -> None:
    if event.status != EventLifecycleStatus.DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ticket configuration of a published event changes only through an Event Change Request")


@router.get("/events/{event_id}/ticket-types", response_model=list[TicketTypePublic])
def list_ticket_types(event_id: uuid.UUID, session: Session = Depends(get_session), viewer: users | None = Depends(get_optional_user)):
    event = get_event_or_404(session, event_id)
    if not can_view_event(session, event, viewer):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    now = db_now(session)
    left = availability(session, event, now)
    rows = session.exec(select(ticket_types).where(ticket_types.event_id == event.id, ticket_types.is_active.is_(True)).order_by(ticket_types.price_minor, ticket_types.name)).all()
    return [type_to_public(event, t, now, left.get(t.id)) for t in rows]


@router.get("/events/{event_id}/ticket-types/manage", response_model=list[TicketTypePublic])
def list_ticket_types_for_organizer(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = require_organizer(session, event_id, current_user)
    now = db_now(session)
    left = availability(session, event, now)
    rows = session.exec(select(ticket_types).where(ticket_types.event_id == event.id).order_by(ticket_types.created_at)).all()
    return [type_to_public(event, t, now, left.get(t.id)) for t in rows]


@router.post("/events/{event_id}/ticket-types", response_model=TicketTypePublic, status_code=status.HTTP_201_CREATED)
def create_ticket_type(event_id: uuid.UUID, data: TicketTypeCreate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    _require_draft(event)
    _validate_type(event, data.kind, data.price_minor, data.sales_start_at, data.sales_end_at, data.quantity_total)
    ticket_type = ticket_types(event_id=event.id, **data.model_dump())
    session.add(ticket_type)
    session.commit()
    session.refresh(ticket_type)
    now = db_now(session)
    return type_to_public(event, ticket_type, now, availability(session, event, now).get(ticket_type.id))


@router.patch("/events/{event_id}/ticket-types/{ticket_type_id}", response_model=TicketTypePublic)
def update_ticket_type(event_id: uuid.UUID, ticket_type_id: uuid.UUID, data: TicketTypeUpdate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    ticket_type = session.exec(select(ticket_types).where(ticket_types.id == ticket_type_id, ticket_types.event_id == event.id).with_for_update().execution_options(populate_existing=True)).first()
    if ticket_type is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket type not found")
    changes = data.model_dump(exclude_unset=True)
    if set(changes) - {"sales_status"}:
        _require_draft(event)
    for key, value in changes.items():
        setattr(ticket_type, key, value)
    _validate_type(event, ticket_type.kind, ticket_type.price_minor, ticket_type.sales_start_at, ticket_type.sales_end_at, ticket_type.quantity_total)
    session.add(ticket_type)
    session.commit()
    session.refresh(ticket_type)
    now = db_now(session)
    return type_to_public(event, ticket_type, now, availability(session, event, now).get(ticket_type.id))


@router.delete("/events/{event_id}/ticket-types/{ticket_type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket_type(event_id: uuid.UUID, ticket_type_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    _require_draft(event)
    ticket_type = session.exec(select(ticket_types).where(ticket_types.id == ticket_type_id, ticket_types.event_id == event.id).with_for_update().execution_options(populate_existing=True)).first()
    if ticket_type is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket type not found")
    referenced = (
        session.exec(select(order_items.id).where(order_items.ticket_type_id == ticket_type.id).limit(1)).first()
        or session.exec(select(reservation_items.id).where(reservation_items.ticket_type_id == ticket_type.id).limit(1)).first()
        or session.exec(select(event_seats.id).where(event_seats.ticket_type_id == ticket_type.id).limit(1)).first()
        or session.exec(select(promo_code_ticket_types.promo_code_id).where(promo_code_ticket_types.ticket_type_id == ticket_type.id).limit(1)).first()
    )
    if referenced:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ticket type is in use; disable it instead")
    session.delete(ticket_type)
    session.commit()


class SeatPublic(BaseModel):
    id: uuid.UUID
    section: str
    row: str
    seat_number: str
    is_accessible: bool
    ticket_type_id: uuid.UUID | None
    state: str


class SeatAssignment(BaseModel):
    event_seat_ids: list[uuid.UUID]
    ticket_type_id: uuid.UUID | None = None
    is_enabled: bool | None = None


def _seat_rows(session: Session, event_id: uuid.UUID):
    return session.exec(
        select(event_seats, venue_sections.name, venue_rows.label, venue_seats.seat_number, venue_seats.is_accessible)
        .join(venue_seats, venue_seats.id == event_seats.seat_id)
        .join(venue_rows, venue_rows.id == venue_seats.row_id)
        .join(venue_sections, venue_sections.id == venue_rows.section_id)
        .where(event_seats.event_id == event_id)
        .order_by(venue_sections.name, venue_rows.label, venue_seats.seat_number)
    ).all()


@router.get("/events/{event_id}/seats", response_model=list[SeatPublic])
def list_seats(event_id: uuid.UUID, session: Session = Depends(get_session), viewer: users | None = Depends(get_optional_user)):
    event = get_event_or_404(session, event_id)
    if not can_view_event(session, event, viewer):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    taken = taken_seat_ids(session, event.id, db_now(session))
    result = []
    for seat, section, row, number, accessible in _seat_rows(session, event.id):
        state = "UNAVAILABLE" if not seat.is_enabled or seat.ticket_type_id is None else ("TAKEN" if seat.id in taken else "AVAILABLE")
        result.append(SeatPublic(id=seat.id, section=section, row=row, seat_number=number, is_accessible=accessible, ticket_type_id=seat.ticket_type_id, state=state))
    return result


@router.post("/events/{event_id}/seats/sync", response_model=list[SeatPublic])
def sync_seats(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    if event.seating_mode != SeatingMode.ASSIGNED_SEATING or event.venue_layout_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event has no assigned-seating layout")
    if ever_issued(session, event.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Seat configuration is locked after the first ticket issuance")
    existing = set(session.exec(select(event_seats.seat_id).where(event_seats.event_id == event.id)).all())
    layout_seats = session.exec(
        select(venue_seats.id).join(venue_rows, venue_rows.id == venue_seats.row_id).join(venue_sections, venue_sections.id == venue_rows.section_id).where(venue_sections.layout_id == event.venue_layout_id)
    ).all()
    for seat_id in layout_seats:
        if seat_id not in existing:
            session.add(event_seats(event_id=event.id, seat_id=seat_id))
    session.commit()
    return list_seats_for_organizer(event_id, session, current_user)


@router.get("/events/{event_id}/seats/manage", response_model=list[SeatPublic])
def list_seats_for_organizer(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = require_organizer(session, event_id, current_user)
    taken = taken_seat_ids(session, event.id, db_now(session))
    return [
        SeatPublic(id=seat.id, section=section, row=row, seat_number=number, is_accessible=accessible, ticket_type_id=seat.ticket_type_id,
                   state="UNAVAILABLE" if not seat.is_enabled or seat.ticket_type_id is None else ("TAKEN" if seat.id in taken else "AVAILABLE"))
        for seat, section, row, number, accessible in _seat_rows(session, event.id)
    ]


@router.patch("/events/{event_id}/seats", response_model=list[SeatPublic])
def assign_seats(event_id: uuid.UUID, data: SeatAssignment, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    if ever_issued(session, event.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Seat configuration is locked after the first ticket issuance")
    if data.ticket_type_id is not None:
        ticket_type = session.get(ticket_types, data.ticket_type_id)
        if ticket_type is None or ticket_type.event_id != event.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket type not found")
    seats = session.exec(select(event_seats).where(event_seats.id.in_(sorted(data.event_seat_ids))).order_by(event_seats.id).with_for_update().execution_options(populate_existing=True)).all()
    if len(seats) != len(set(data.event_seat_ids)) or any(seat.event_id != event.id for seat in seats):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seat not found")
    held = set(session.exec(
        select(reservation_items.event_seat_id).join(reservations, reservations.id == reservation_items.reservation_id)
        .where(reservations.event_id == event.id, reservation_items.event_seat_id.in_([s.id for s in seats]), effective_hold_clause(db_now(session)))
    ).all())
    if held:
        raise HTTPException(status.HTTP_409_CONFLICT, "Some seats are currently held by buyers")
    for seat in seats:
        if "ticket_type_id" in data.model_fields_set:
            seat.ticket_type_id = data.ticket_type_id
        if data.is_enabled is not None:
            seat.is_enabled = data.is_enabled
        session.add(seat)
    session.commit()
    return list_seats_for_organizer(event_id, session, current_user)


def get_own_ticket(session: Session, ticket_id: uuid.UUID, user: users) -> tickets:
    ticket = session.get(tickets, ticket_id)
    if ticket is None or ticket_service.ticket_owner_id(session, ticket) != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return ticket


@router.get("/tickets/mine", response_model=list[TicketPublic])
def my_tickets(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    rows = session.exec(
        select(tickets).join(orders, orders.id == tickets.order_id).join(events, events.id == tickets.event_id)
        .where(orders.buyer_user_id == current_user.id).order_by(events.starts_at, tickets.issued_at)
    ).all()
    return [ticket_service.to_public(session, ticket) for ticket in rows]


@router.get("/tickets/{ticket_id}", response_model=TicketPublic)
def read_ticket(ticket_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    return ticket_service.to_public(session, get_own_ticket(session, ticket_id, current_user))


@router.get("/tickets/{ticket_id}/qr.png")
def ticket_qr(ticket_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    ticket = get_own_ticket(session, ticket_id, current_user)
    return Response(content=ticket_service.qr_png(ticket_service.qr_payload(ticket)), media_type="image/png", headers={"Cache-Control": "no-store"})


@router.get("/tickets/{ticket_id}/pdf")
def ticket_pdf(ticket_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    ticket = get_own_ticket(session, ticket_id, current_user)
    event = session.get(events, ticket.event_id)
    venue = session.get(venues, event.venue_id)
    order = session.get(orders, ticket.order_id)
    ticket_type = session.get(ticket_types, ticket.ticket_type_id)
    body = render_ticket_pdf(
        event_title=event.title,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        tz_name=event.timezone,
        venue_name=venue.name if venue else "",
        venue_address=", ".join(p for p in [venue.address, venue.city] if p) if venue else "",
        ticket_type_name=ticket_type.name,
        attendee_name=ticket.attendee_name,
        seat_label=ticket_service.seat_label(ticket.section_snapshot, ticket.row_snapshot, ticket.seat_snapshot),
        ticket_code=ticket.public_id,
        order_number=order.order_number,
        status=ticket.status.value,
        qr_payload=ticket_service.qr_payload(ticket),
    )
    return Response(content=body, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{ticket.public_id}.pdf"', "Cache-Control": "no-store"})
