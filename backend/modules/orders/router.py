import csv
import io
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import require_organizer
from backend.modules.events.models import events
from backend.modules.orders import organizer, service
from backend.modules.orders.models import orders, order_items, reservations, reservation_items
from backend.modules.orders.schemas import AttendeePage, EventOrder, EventOrderDetail, OrderCreate, OrderPublic, OrderStatus, ReservationCreate, ReservationItemPublic, ReservationPublic, ReservationStatus
from backend.modules.promotions.models import promo_codes
from backend.modules.tickets.models import tickets
from backend.modules.tickets.notify import deliver_notices
from backend.modules.tickets.schemas import TicketStatus
from backend.modules.users.user_model import users
from database.database import get_session

router = APIRouter(tags=["checkout"])

EXPORT_LIMIT = 20000


def reservation_to_public(session: Session, reservation: reservations) -> ReservationPublic:
    items = session.exec(select(reservation_items).where(reservation_items.reservation_id == reservation.id)).all()
    now = db_now(session)
    return ReservationPublic(
        id=reservation.id,
        event_id=reservation.event_id,
        status=reservation.status,
        expires_at=reservation.expires_at,
        is_expired=reservation.status == ReservationStatus.ACTIVE and as_aware(reservation.expires_at) <= now,
        items=[ReservationItemPublic(ticket_type_id=i.ticket_type_id, event_seat_id=i.event_seat_id, quantity=i.quantity) for i in items],
    )


def order_to_public(session: Session, order: orders) -> OrderPublic:
    event = session.get(events, order.event_id)
    reservation = session.get(reservations, order.reservation_id)
    promo = session.get(promo_codes, order.promo_code_id) if order.promo_code_id else None
    items = session.exec(select(order_items).where(order_items.order_id == order.id).order_by(order_items.created_at, order_items.id)).all()
    ticket_ids = session.exec(select(tickets.id).where(tickets.order_id == order.id).order_by(tickets.issued_at)).all()
    return OrderPublic(
        id=order.id,
        order_number=order.order_number,
        event_id=order.event_id,
        event_title=event.title,
        reservation_id=order.reservation_id,
        status=order.status,
        subtotal_minor=order.subtotal_minor,
        discount_minor=order.discount_minor,
        total_minor=order.total_minor,
        promo_code=promo.code if promo else None,
        requires_payment=order.total_minor > 0,
        reservation_expires_at=reservation.expires_at,
        created_at=order.created_at,
        confirmed_at=order.confirmed_at,
        items=[service.order_item_to_public(i) for i in items],
        ticket_ids=list(ticket_ids),
    )


def get_own_order(session: Session, order_id: uuid.UUID, user: users) -> orders:
    order = session.get(orders, order_id)
    if order is None or order.buyer_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


@router.post("/events/{event_id}/reservations", response_model=ReservationPublic, status_code=status.HTTP_201_CREATED)
def create_reservation(event_id: uuid.UUID, data: ReservationCreate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    reservation = service.create_reservation(session, event_id, current_user, data)
    return reservation_to_public(session, reservation)


@router.get("/reservations/{reservation_id}", response_model=ReservationPublic)
def read_reservation(reservation_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    return reservation_to_public(session, service.get_own_reservation(session, reservation_id, current_user))


@router.delete("/reservations/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def release_reservation(reservation_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    service.release_reservation(session, reservation_id, current_user)


@router.post("/reservations/{reservation_id}/order", response_model=OrderPublic, status_code=status.HTTP_201_CREATED)
def create_order(reservation_id: uuid.UUID, data: OrderCreate, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    order, issued = service.create_order(session, reservation_id, current_user, data.promo_code, data.attendees)
    deliver_notices(background)
    return order_to_public(session, order)


@router.get("/orders/mine", response_model=list[OrderPublic])
def my_orders(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    rows = session.exec(select(orders).where(orders.buyer_user_id == current_user.id).order_by(orders.created_at.desc())).all()
    for order in rows:
        if order.status == OrderStatus.PENDING:
            service.expire_if_stale(session, order)
            session.commit()
    return [order_to_public(session, order) for order in rows]


@router.get("/events/{event_id}/orders", response_model=list[EventOrder])
def event_orders(event_id: uuid.UUID, q: str | None = Query(default=None, max_length=200), order_status: OrderStatus | None = Query(default=None, alias="status"),
                 limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0), session: Session = Depends(get_session),
                 current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    return service.list_event_orders(session, event_id, q, order_status, limit, offset)


@router.get("/events/{event_id}/orders/{order_id}", response_model=EventOrderDetail)
def event_order(event_id: uuid.UUID, order_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = require_organizer(session, event_id, current_user)
    order = session.get(orders, order_id)
    if order is None or order.event_id != event.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return organizer.order_detail(session, event, order)


def attendee_filter(q: str | None = Query(default=None, max_length=200), ticket_status: TicketStatus | None = None, ticket_type_id: uuid.UUID | None = None,
                    checked_in: bool | None = None, has_promo: bool | None = None) -> organizer.AttendeeFilter:
    return organizer.AttendeeFilter(q=q, ticket_status=ticket_status, ticket_type_id=ticket_type_id, checked_in=checked_in, has_promo=has_promo)


@router.get("/events/{event_id}/attendees", response_model=AttendeePage)
def event_attendees(event_id: uuid.UUID, filters: organizer.AttendeeFilter = Depends(attendee_filter), limit: int = Query(default=50, ge=1, le=200),
                    offset: int = Query(default=0, ge=0), session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    return organizer.list_attendees(session, event_id, filters, limit, offset)


def csv_cell(value) -> str:
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


@router.get("/events/{event_id}/attendees/export.csv")
def export_attendees(event_id: uuid.UUID, filters: organizer.AttendeeFilter = Depends(attendee_filter), session: Session = Depends(get_session),
                     current_user: users = Depends(get_current_user)):
    event = require_organizer(session, event_id, current_user)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["ticket", "attendee", "ticket_type", "seat", "ticket_status", "checked_in_at", "order", "order_status", "payment_status", "buyer_name", "buyer_email",
                     "quantity", "paid_kzt", "promo_code"])
    for row in organizer.export_attendees(session, event_id, filters, EXPORT_LIMIT):
        writer.writerow([csv_cell(v) for v in (
            row.ticket_public_id, row.attendee_name, row.ticket_type_name, row.seat_label, row.ticket_status.value if row.ticket_status else None,
            row.checked_in_at.isoformat() if row.checked_in_at else None, row.order_number, row.order_status.value, row.payment_status.value if row.payment_status else None,
            row.buyer_name, row.buyer_email, row.quantity, f"{row.paid_minor / 100:.2f}", row.promo_code)])
    return Response(content="\ufeff" + buffer.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="attendees-{event.public_id}.csv"'})


@router.get("/orders/{order_id}", response_model=OrderPublic)
def read_order(order_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    order = get_own_order(session, order_id, current_user)
    if service.expire_if_stale(session, order):
        session.commit()
    return order_to_public(session, order)


@router.post("/orders/{order_id}/cancel", response_model=OrderPublic)
def cancel_order(order_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    return order_to_public(session, service.cancel_order(session, order_id, current_user))
