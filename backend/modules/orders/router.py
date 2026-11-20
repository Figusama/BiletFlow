import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.models import events
from backend.modules.orders import service
from backend.modules.orders.models import orders, order_items, reservations, reservation_items
from backend.modules.orders.schemas import OrderCreate, OrderPublic, OrderItemPublic, ReservationCreate, ReservationItemPublic, ReservationPublic, ReservationStatus
from backend.modules.promotions.models import promo_codes
from backend.modules.tickets.models import tickets
from backend.modules.tickets.notify import queue_ticket_email
from backend.modules.tickets.service import seat_label
from backend.modules.users.user_model import users
from database.database import get_session

router = APIRouter(tags=["checkout"])


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
        items=[OrderItemPublic(id=i.id, ticket_type_id=i.ticket_type_id, ticket_type_name=i.ticket_type_name, event_seat_id=i.event_seat_id, seat_label=seat_label(i.section_snapshot, i.row_snapshot, i.seat_snapshot), unit_price_minor=i.unit_price_minor, quantity=i.quantity, line_subtotal_minor=i.line_subtotal_minor, line_discount_minor=i.line_discount_minor) for i in items],
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
    order, issued = service.create_order(session, reservation_id, current_user, data.promo_code)
    queue_ticket_email(background, session, issued)
    return order_to_public(session, order)


@router.get("/orders/mine", response_model=list[OrderPublic])
def my_orders(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    rows = session.exec(select(orders).where(orders.buyer_user_id == current_user.id).order_by(orders.created_at.desc())).all()
    changed = False
    for order in rows:
        changed = service.expire_if_stale(session, order) or changed
    if changed:
        session.commit()
    return [order_to_public(session, order) for order in rows]


@router.get("/orders/{order_id}", response_model=OrderPublic)
def read_order(order_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    order = get_own_order(session, order_id, current_user)
    if service.expire_if_stale(session, order):
        session.commit()
    return order_to_public(session, order)


@router.post("/orders/{order_id}/cancel", response_model=OrderPublic)
def cancel_order(order_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    return order_to_public(session, service.cancel_order(session, order_id, current_user))
