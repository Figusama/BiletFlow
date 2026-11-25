import re
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import RESERVATION_TTL_MINUTES
from backend.modules.audit import service as audit
from backend.modules.events.access import ensure_on_sale, ensure_purchase_access, get_event_or_404
from backend.modules.events.models import events, event_seats
from backend.modules.events.schemas import SeatingMode
from backend.modules.orders.models import reservations, reservation_items, orders, order_items
from backend.modules.orders.schemas import AttendeeLine, EventOrder, OrderItemPublic, ReservationCreate, ReservationStatus, OrderStatus
from backend.modules.payments.activation import paid_sales_active
from backend.modules.promotions import service as promo_service
from backend.modules.promotions.schemas import PromoRejection
from backend.modules.promotions.service import PricedLine, PROMO_MESSAGES
from backend.modules.refunds.models import refund_requests
from backend.modules.tickets import service as ticket_service
from backend.modules.tickets.models import ticket_types, tickets
from backend.modules.tickets.schemas import TicketKind, SalesStatus, TicketStatus
from backend.modules.tickets.notify import publish_order_confirmed
from backend.modules.users.user_model import profiles, users


OCCUPYING_TICKET_STATUSES = (TicketStatus.VALID, TicketStatus.CHECKED_IN)


def effective_hold_clause(now: datetime):
    return or_(
        and_(reservations.status == ReservationStatus.ACTIVE, reservations.expires_at > now),
        reservations.status == ReservationStatus.PROTECTED,
    )


def ga_occupancy(session: Session, event_id: uuid.UUID, now: datetime) -> dict[uuid.UUID, int]:
    occupied: dict[uuid.UUID, int] = {}
    issued = session.exec(
        select(tickets.ticket_type_id, func.count())
        .where(tickets.event_id == event_id, tickets.status.in_(OCCUPYING_TICKET_STATUSES))
        .group_by(tickets.ticket_type_id)
    ).all()
    for type_id, count in issued:
        occupied[type_id] = occupied.get(type_id, 0) + count
    held = session.exec(
        select(reservation_items.ticket_type_id, func.sum(reservation_items.quantity))
        .join(reservations, reservations.id == reservation_items.reservation_id)
        .where(reservations.event_id == event_id, effective_hold_clause(now))
        .group_by(reservation_items.ticket_type_id)
    ).all()
    for type_id, quantity in held:
        occupied[type_id] = occupied.get(type_id, 0) + int(quantity)
    return occupied


def taken_seat_ids(session: Session, event_id: uuid.UUID, now: datetime) -> set[uuid.UUID]:
    sold = session.exec(
        select(tickets.event_seat_id).where(
            tickets.event_id == event_id,
            tickets.event_seat_id.is_not(None),
            tickets.status.in_(OCCUPYING_TICKET_STATUSES),
        )
    ).all()
    held = session.exec(
        select(reservation_items.event_seat_id)
        .join(reservations, reservations.id == reservation_items.reservation_id)
        .where(reservations.event_id == event_id, reservation_items.event_seat_id.is_not(None), effective_hold_clause(now))
    ).all()
    return set(sold) | set(held)


def sale_state(event: events, ticket_type: ticket_types, now: datetime, available: int | None) -> str:
    if event.status.value != "PUBLISHED" or event.is_suspended:
        return "NOT_ON_SALE"
    if not ticket_type.is_active:
        return "DISABLED"
    if ticket_type.sales_status == SalesStatus.PAUSED:
        return "PAUSED"
    if now < as_aware(ticket_type.sales_start_at):
        return "NOT_STARTED"
    if now >= as_aware(ticket_type.sales_end_at) or now >= as_aware(event.ends_at):
        return "ENDED"
    if available is not None and available <= 0:
        return "SOLD_OUT"
    return "ON_SALE"


def availability(session: Session, event: events, now: datetime) -> dict[uuid.UUID, int | None]:
    types = session.exec(select(ticket_types).where(ticket_types.event_id == event.id)).all()
    result: dict[uuid.UUID, int | None] = {}
    if event.seating_mode == SeatingMode.GENERAL_ADMISSION:
        occupied = ga_occupancy(session, event.id, now)
        shared_left = (event.ga_capacity or 0) - sum(occupied.values())
        for ticket_type in types:
            left = shared_left
            if ticket_type.quantity_total is not None:
                left = min(left, ticket_type.quantity_total - occupied.get(ticket_type.id, 0))
            result[ticket_type.id] = max(left, 0)
    else:
        taken = taken_seat_ids(session, event.id, now)
        seats = session.exec(select(event_seats.id, event_seats.ticket_type_id).where(event_seats.event_id == event.id, event_seats.is_enabled.is_(True), event_seats.ticket_type_id.is_not(None))).all()
        for ticket_type in types:
            result[ticket_type.id] = sum(1 for seat_id, type_id in seats if type_id == ticket_type.id and seat_id not in taken)
    return result


def _check_type_on_sale(event: events, ticket_type: ticket_types, now: datetime, session: Session) -> None:
    if ticket_type.event_id != event.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ticket type does not belong to this event")
    state = sale_state(event, ticket_type, now, None)
    if state != "ON_SALE":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Ticket type '{ticket_type.name}' is not on sale ({state})")
    if ticket_type.kind == TicketKind.PAID and not paid_sales_active(session, event.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Paid sales are not active for this event")


def create_reservation(session: Session, event_id: uuid.UUID, user: users, data: ReservationCreate) -> reservations:
    event = get_event_or_404(session, event_id, for_update=True)
    ensure_on_sale(event)
    ensure_purchase_access(session, event, user)
    now = db_now(session)

    if event.seating_mode == SeatingMode.GENERAL_ADMISSION:
        if not data.items:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "General admission requires ticket type quantities")
        requested = {line.ticket_type_id: line.quantity for line in data.items}
        locked = session.exec(
            select(ticket_types).where(ticket_types.id.in_(sorted(requested))).order_by(ticket_types.id).with_for_update().execution_options(populate_existing=True)
        ).all()
        if len(locked) != len(requested):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket type not found")
        for ticket_type in locked:
            _check_type_on_sale(event, ticket_type, now, session)
            if requested[ticket_type.id] > ticket_type.max_per_order:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"At most {ticket_type.max_per_order} tickets of '{ticket_type.name}' per order")
        occupied = ga_occupancy(session, event.id, now)
        if sum(occupied.values()) + sum(requested.values()) > (event.ga_capacity or 0):
            raise HTTPException(status.HTTP_409_CONFLICT, "Not enough tickets left")
        for ticket_type in locked:
            if ticket_type.quantity_total is not None and occupied.get(ticket_type.id, 0) + requested[ticket_type.id] > ticket_type.quantity_total:
                raise HTTPException(status.HTTP_409_CONFLICT, f"Not enough '{ticket_type.name}' tickets left")
        reservation = reservations(event_id=event.id, user_id=user.id, expires_at=now + timedelta(minutes=RESERVATION_TTL_MINUTES), purchase_terms_version=event.purchase_terms_version)
        session.add(reservation)
        session.flush()
        for ticket_type in locked:
            session.add(reservation_items(reservation_id=reservation.id, event_id=event.id, ticket_type_id=ticket_type.id, quantity=requested[ticket_type.id]))
    else:
        if not data.event_seat_ids:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Assigned seating requires seat selection")
        seats = session.exec(
            select(event_seats).where(event_seats.id.in_(sorted(data.event_seat_ids))).order_by(event_seats.id).with_for_update().execution_options(populate_existing=True)
        ).all()
        if len(seats) != len(data.event_seat_ids) or any(seat.event_id != event.id for seat in seats):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Seat not found")
        type_ids = sorted({seat.ticket_type_id for seat in seats if seat.ticket_type_id})
        types = {t.id: t for t in session.exec(select(ticket_types).where(ticket_types.id.in_(type_ids)).order_by(ticket_types.id).with_for_update().execution_options(populate_existing=True)).all()}
        per_type: dict[uuid.UUID, int] = {}
        for seat in seats:
            if not seat.is_enabled or seat.ticket_type_id is None:
                raise HTTPException(status.HTTP_409_CONFLICT, "Seat is not available")
            per_type[seat.ticket_type_id] = per_type.get(seat.ticket_type_id, 0) + 1
        for type_id, count in per_type.items():
            ticket_type = types[type_id]
            _check_type_on_sale(event, ticket_type, now, session)
            if count > ticket_type.max_per_order:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"At most {ticket_type.max_per_order} tickets of '{ticket_type.name}' per order")
        taken = taken_seat_ids(session, event.id, now)
        if any(seat.id in taken for seat in seats):
            raise HTTPException(status.HTTP_409_CONFLICT, "One or more selected seats are no longer available")
        reservation = reservations(event_id=event.id, user_id=user.id, expires_at=now + timedelta(minutes=RESERVATION_TTL_MINUTES), purchase_terms_version=event.purchase_terms_version)
        session.add(reservation)
        session.flush()
        for seat in seats:
            session.add(reservation_items(reservation_id=reservation.id, event_id=event.id, ticket_type_id=seat.ticket_type_id, event_seat_id=seat.id, quantity=1))

    session.commit()
    session.refresh(reservation)
    return reservation


def order_item_to_public(item: order_items) -> OrderItemPublic:
    return OrderItemPublic(id=item.id, ticket_type_id=item.ticket_type_id, ticket_type_name=item.ticket_type_name, event_seat_id=item.event_seat_id,
                           seat_label=ticket_service.seat_label(item.section_snapshot, item.row_snapshot, item.seat_snapshot), unit_price_minor=item.unit_price_minor,
                           quantity=item.quantity, line_subtotal_minor=item.line_subtotal_minor, line_discount_minor=item.line_discount_minor,
                           attendee_names=item.attendee_names or [None] * item.quantity)


def list_event_orders(session: Session, event_id: uuid.UUID, q: str | None, order_status: OrderStatus | None, limit: int, offset: int) -> list[EventOrder]:
    quantity = select(order_items.order_id, func.sum(order_items.quantity).label("quantity")).group_by(order_items.order_id).subquery()
    query = (select(orders, users.email, profiles.full_name, quantity.c.quantity).join(users, users.id == orders.buyer_user_id)
             .outerjoin(profiles, profiles.user_id == users.id).outerjoin(quantity, quantity.c.order_id == orders.id).where(orders.event_id == event_id))
    if order_status is not None:
        query = query.where(orders.status == order_status)
    if q and q.strip():
        pattern = "%" + re.sub(r"([\\%_])", r"\\\1", q.strip()) + "%"
        query = query.where(or_(orders.order_number.ilike(pattern), users.email.ilike(pattern), profiles.full_name.ilike(pattern)))
    rows = session.exec(query.order_by(orders.created_at.desc(), orders.id).limit(limit).offset(offset)).all()
    latest = {}
    for request in session.exec(select(refund_requests).where(refund_requests.order_id.in_([order.id for order, *_ in rows])).order_by(refund_requests.created_at)).all():
        latest[request.order_id] = request
    now = db_now(session)
    expired = set(session.exec(select(reservations.id).where(reservations.id.in_([order.reservation_id for order, *_ in rows]), reservations.status == ReservationStatus.ACTIVE,
                                                             reservations.expires_at <= now)).all())
    result = []
    for order, email, name, count in rows:
        request = latest.get(order.id)
        shown = OrderStatus.EXPIRED if order.status == OrderStatus.PENDING and order.reservation_id in expired else order.status
        result.append(EventOrder(id=order.id, order_number=order.order_number, status=shown, buyer_name=name, buyer_email=email, tickets=int(count or 0),
                                 subtotal_minor=order.subtotal_minor, discount_minor=order.discount_minor, total_minor=order.total_minor,
                                 refund_status=request.status if request else None, refund_execution_status=request.execution_status if request else None,
                                 created_at=order.created_at, confirmed_at=order.confirmed_at))
    return result


def get_own_reservation(session: Session, reservation_id: uuid.UUID, user: users, for_update: bool = False) -> reservations:
    query = select(reservations).where(reservations.id == reservation_id)
    if for_update:
        query = query.with_for_update().execution_options(populate_existing=True)
    reservation = session.exec(query).first()
    if reservation is None or reservation.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reservation not found")
    return reservation


def priced_lines(session: Session, reservation: reservations) -> tuple[list[PricedLine], list[tuple[reservation_items, ticket_types]]]:
    rows = session.exec(
        select(reservation_items, ticket_types)
        .join(ticket_types, ticket_types.id == reservation_items.ticket_type_id)
        .where(reservation_items.reservation_id == reservation.id)
        .order_by(reservation_items.id)
    ).all()
    lines = [PricedLine(str(item.id), ticket_type.id, ticket_type.price_minor, item.quantity) for item, ticket_type in rows]
    return lines, list(rows)


def generate_order_number() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "BF-O-" + "".join(secrets.choice(alphabet) for _ in range(8))


def _promo_error(rejection: PromoRejection) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"code": rejection.value, "message": PROMO_MESSAGES[rejection]})


def _names_by_item(rows: list[tuple[reservation_items, ticket_types]], attendees: list[AttendeeLine]) -> dict[uuid.UUID, list[str | None]]:
    items = {(item.ticket_type_id, item.event_seat_id): item for item, _ in rows}
    result: dict[uuid.UUID, list[str | None]] = {}
    for line in attendees:
        item = items.get((line.ticket_type_id, line.event_seat_id))
        if item is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Attendee names do not match the reservation")
        if len(line.names) > item.quantity:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Too many attendee names for the selected tickets")
        if any(line.names):
            result[item.id] = [name or None for name in line.names] + [None] * (item.quantity - len(line.names))
    return result


def create_order(session: Session, reservation_id: uuid.UUID, user: users, promo_code: str | None, attendees: list[AttendeeLine] | None = None) -> tuple[orders, list[tickets]]:
    reservation = get_own_reservation(session, reservation_id, user)
    existing = session.exec(select(orders).where(orders.reservation_id == reservation.id)).first()
    if existing is not None:
        return existing, []

    event = get_event_or_404(session, reservation.event_id, for_update=True)
    promo = promo_service.find_promo(session, promo_code, for_update=True) if promo_code else None
    if promo_code and promo is None:
        raise _promo_error(PromoRejection.NOT_FOUND)
    reservation = get_own_reservation(session, reservation_id, user, for_update=True)

    existing = session.exec(select(orders).where(orders.reservation_id == reservation.id)).first()
    if existing is not None:
        return existing, []

    ensure_on_sale(event)
    ensure_purchase_access(session, event, user)
    now = db_now(session)
    if not (reservation.status == ReservationStatus.ACTIVE and as_aware(reservation.expires_at) > now):
        raise HTTPException(status.HTTP_409_CONFLICT, "Reservation has expired or is no longer active")
    if reservation.purchase_terms_version != event.purchase_terms_version:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event purchase terms changed; please start a new checkout")

    lines, rows = priced_lines(session, reservation)
    names = _names_by_item(rows, attendees or [])
    for _, ticket_type in rows:
        if sale_state(event, ticket_type, now, None) != "ON_SALE":
            raise HTTPException(status.HTTP_409_CONFLICT, f"Ticket type '{ticket_type.name}' is no longer on sale")

    quote = promo_service.quote(session, promo, event.id, lines, now)
    if quote.rejection:
        raise _promo_error(quote.rejection)
    if promo is not None and not promo_service.has_capacity(session, promo, now):
        raise _promo_error(PromoRejection.EXHAUSTED)
    if quote.total_minor > 0 and not paid_sales_active(session, event.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Paid sales are not active for this event")

    order = orders(
        order_number=generate_order_number(),
        event_id=event.id,
        buyer_user_id=user.id,
        reservation_id=reservation.id,
        subtotal_minor=quote.subtotal_minor,
        discount_minor=quote.discount_minor,
        total_minor=quote.total_minor,
        promo_code_id=promo.id if promo else None,
        purchase_terms_version=reservation.purchase_terms_version,
        refund_policy_snapshot=dict(event.refund_policy or {}),
    )
    session.add(order)
    session.flush()
    for item, ticket_type in rows:
        section, row, seat = ticket_service.seat_parts(session, item.event_seat_id)
        session.add(order_items(
            order_id=order.id,
            event_id=event.id,
            ticket_type_id=ticket_type.id,
            event_seat_id=item.event_seat_id,
            ticket_type_name=ticket_type.name,
            unit_price_minor=ticket_type.price_minor,
            quantity=item.quantity,
            line_subtotal_minor=ticket_type.price_minor * item.quantity,
            line_discount_minor=quote.line_discounts.get(str(item.id), 0),
            section_snapshot=section,
            row_snapshot=row,
            seat_snapshot=seat,
            attendee_names=names.get(item.id),
        ))
    session.flush()

    issued: list[tickets] = []
    if quote.total_minor == 0:
        issued = confirm_order(session, order, reservation, now, actor_user_id=user.id)
    elif promo is not None:
        promo_service.place_hold(session, promo, order.id, reservation.expires_at)

    session.commit()
    session.refresh(order)
    return order, issued


def confirm_order(session: Session, order: orders, reservation: reservations, now: datetime, actor_user_id: uuid.UUID | None = None) -> list[tickets]:
    if order.status == OrderStatus.CONFIRMED:
        return []
    order.status = OrderStatus.CONFIRMED
    order.confirmed_at = now
    reservation.status = ReservationStatus.CONVERTED
    reservation.converted_at = now
    session.add(order)
    session.add(reservation)
    if order.promo_code_id is not None:
        promo_service.redeem(session, order.promo_code_id, order.id, order.discount_minor, now)
    issued = ticket_service.issue_for_order(session, order)
    publish_order_confirmed(session, order, issued)
    audit.record(session, action="ORDER_CONFIRMED", entity_type="ORDER", entity_id=order.id, event_id=order.event_id, actor_user_id=actor_user_id)
    return issued


def lock_order_chain(session: Session, order_id: uuid.UUID) -> tuple[events, orders, reservations]:
    snapshot = session.get(orders, order_id)
    event = get_event_or_404(session, snapshot.event_id, for_update=True)
    if snapshot.promo_code_id is not None:
        promo_service.lock_promo(session, snapshot.promo_code_id)
    order = session.exec(select(orders).where(orders.id == order_id).with_for_update().execution_options(populate_existing=True)).one()
    reservation = session.exec(select(reservations).where(reservations.id == order.reservation_id).with_for_update().execution_options(populate_existing=True)).one()
    return event, order, reservation


def expire_if_stale(session: Session, order: orders) -> bool:
    if order.status != OrderStatus.PENDING:
        return False
    _, order, reservation = lock_order_chain(session, order.id)
    if order.status != OrderStatus.PENDING:
        return False
    now = db_now(session)
    if reservation.status == ReservationStatus.ACTIVE and as_aware(reservation.expires_at) <= now:
        from backend.modules.payments.service import request_payment_cancellation
        request_payment_cancellation(session, order, reason="RESERVATION_EXPIRED", now=now)
        order.status = OrderStatus.EXPIRED
        order.expired_at = now
        session.add(order)
        promo_service.release_hold(session, order.id, now)
        return True
    return False


def cancel_order(session: Session, order_id: uuid.UUID, user: users) -> orders:
    order = session.get(orders, order_id)
    if order is None or order.buyer_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    _, order, reservation = lock_order_chain(session, order_id)
    if order.status == OrderStatus.CONFIRMED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Confirmed orders can only be refunded, not cancelled")
    if order.status != OrderStatus.PENDING:
        return order
    if reservation.status == ReservationStatus.PROTECTED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Payment is being processed and cannot be cancelled now")
    now = db_now(session)
    from backend.modules.payments.service import request_payment_cancellation
    request_payment_cancellation(session, order, reason="USER_REQUESTED", now=now)
    order.status = OrderStatus.CANCELLED
    order.cancelled_at = now
    if reservation.status == ReservationStatus.ACTIVE:
        reservation.status = ReservationStatus.RELEASED
        reservation.released_at = now
    session.add(order)
    session.add(reservation)
    promo_service.release_hold(session, order.id, now)
    session.commit()
    session.refresh(order)
    return order


def release_reservation(session: Session, reservation_id: uuid.UUID, user: users) -> None:
    reservation = get_own_reservation(session, reservation_id, user)
    order = session.exec(select(orders).where(orders.reservation_id == reservation.id)).first()
    if order is not None:
        cancel_order(session, order.id, user)
        return
    get_event_or_404(session, reservation.event_id, for_update=True)
    reservation = get_own_reservation(session, reservation_id, user, for_update=True)
    if reservation.status == ReservationStatus.ACTIVE:
        reservation.status = ReservationStatus.RELEASED
        reservation.released_at = db_now(session)
        session.add(reservation)
        session.commit()
