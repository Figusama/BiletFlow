import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import and_, or_
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import FRONTEND_URL
from backend.modules.audit import service as audit
from backend.modules.events.models import event_change_requests, events
from backend.modules.events.schemas import EventLifecycleStatus, EventStatus
from backend.modules.notifications import service as notify
from backend.modules.notifications.models import outbox_events
from backend.modules.orders.models import orders, reservations
from backend.modules.orders.schemas import OrderStatus, ReservationStatus
from backend.modules.refunds import service as refund_service
from backend.modules.refunds.schemas import RefundSource
from backend.modules.tickets.models import tickets
from backend.modules.tickets.schemas import TicketStatus
from backend.modules.users.user_model import users
from database.database import engine

log = logging.getLogger("biletflow.cancellation")

PROCESSING_TYPE = "EVENT_CANCELLATION_PROCESSING"
LEASE = timedelta(minutes=10)


def default_mode(event: events, now: datetime) -> str:
    return "AUTOMATIC_FULL" if now < as_aware(event.starts_at) else "ADMIN_REVIEW"


def cancel_event(session: Session, event: events, actor_user_id: uuid.UUID | None, mode: str, reason: str, now: datetime) -> None:
    event.status = EventLifecycleStatus.CANCELLED
    event.cancelled_at = now
    session.add(event)
    for change in session.exec(select(event_change_requests).where(event_change_requests.event_id == event.id, event_change_requests.status == EventStatus.PENDING)
                               .with_for_update()).all():
        change.status = EventStatus.REJECTED
        change.reviewed_at = now
        change.review_comment = "EVENT_CANCELLED"
        session.add(change)
    session.add(outbox_events(business_event_key=f"EVENT_CANCELLATION:{event.id}", aggregate_type="EVENT", aggregate_id=event.id, event_type=PROCESSING_TYPE,
                              payload={"refund_handling_mode": mode}, status="PENDING"))
    audit.record(session, action="EVENT_CANCELLED", entity_type="EVENT", entity_id=event.id, event_id=event.id, actor_user_id=actor_user_id,
                 details={"reason": reason, "refund_handling_mode": mode})


def _process_order(order_id: uuid.UUID, mode: str) -> None:
    from backend.modules.orders.service import lock_order_chain
    from backend.modules.payments.service import request_payment_cancellation

    with Session(engine) as session:
        event, order, reservation = lock_order_chain(session, order_id)
        now = db_now(session)
        if order.status == OrderStatus.PENDING:
            if reservation.status == ReservationStatus.PROTECTED:
                session.rollback()
                return
            request_payment_cancellation(session, order, reason="USER_REQUESTED", now=now)
            order.status = OrderStatus.CANCELLED
            order.cancelled_at = now
            if reservation.status == ReservationStatus.ACTIVE:
                reservation.status = ReservationStatus.RELEASED
                reservation.released_at = now
            from backend.modules.promotions import service as promo_service
            promo_service.release_hold(session, order.id, now)
            session.add_all([order, reservation])
        elif order.status == OrderStatus.CONFIRMED:
            if order.total_minor == 0:
                for ticket in session.exec(select(tickets).where(tickets.order_id == order.id, tickets.status == TicketStatus.VALID).with_for_update()).all():
                    ticket.status = TicketStatus.CANCELLED
                    session.add(ticket)
            elif not refund_service.is_refunded(session, order.id) and refund_service.succeeded_payment(session, order.id) is not None:
                current = refund_service.open_request(session, order.id)
                if current is not None and current.status == "APPROVED":
                    session.rollback()
                    return
                if current is not None and current.source == RefundSource.EVENT_CANCELLATION.value:
                    session.rollback()
                    return
                if current is not None:
                    current.status = "WITHDRAWN"
                    session.add(current)
                    session.flush()
                refund_service.create_request(session, order, RefundSource.EVENT_CANCELLATION, now, requested_by=None,
                                              approved=mode == "AUTOMATIC_FULL", pending_status="PENDING_ADMIN")
        session.commit()


def _claim() -> list[uuid.UUID]:
    with Session(engine) as session:
        now = db_now(session)
        rows = session.exec(select(outbox_events).where(outbox_events.event_type == PROCESSING_TYPE, or_(
            outbox_events.status == "PENDING", and_(outbox_events.status == "PROCESSING", outbox_events.processing_until < now),
        )).with_for_update(skip_locked=True).limit(10)).all()
        for row in rows:
            row.status = "PROCESSING"
            row.processing_until = now + LEASE
            session.add(row)
        session.commit()
        return [row.id for row in rows]


def process_cancellations() -> int:
    handled = 0
    for outbox_id in _claim():
        with Session(engine) as session:
            job = session.get(outbox_events, outbox_id)
            event_id, mode = job.aggregate_id, job.payload.get("refund_handling_mode", "AUTOMATIC_FULL")
            order_ids = session.exec(select(orders.id).where(orders.event_id == event_id, orders.status.in_((OrderStatus.PENDING, OrderStatus.CONFIRMED)))
                                     .order_by(orders.id)).all()
        complete = True
        for order_id in order_ids:
            try:
                _process_order(order_id, mode)
            except Exception:
                log.exception("order %s of cancelled event %s failed", order_id, event_id)
                complete = False
        with Session(engine) as session:
            now = db_now(session)
            for reservation in session.exec(select(reservations).where(reservations.event_id == event_id, reservations.status == ReservationStatus.ACTIVE)
                                            .with_for_update(skip_locked=True)).all():
                if session.exec(select(orders.id).where(orders.reservation_id == reservation.id)).first() is None:
                    reservation.status = ReservationStatus.RELEASED
                    reservation.released_at = now
                    session.add(reservation)
            event = session.get(events, event_id)
            recipients = session.exec(select(users).where(users.id.in_(
                select(orders.buyer_user_id).where(orders.event_id == event_id, orders.status == OrderStatus.CONFIRMED)))).all()
            if recipients:
                notify.publish(session, notify.Notice(
                    key=f"EVENT_CANCELLED:{event_id}", event_type="EVENT_CANCELLED", aggregate_type="EVENT", aggregate_id=event_id, title="Event cancelled",
                    body=f"\"{event.title}\" was cancelled. Paid orders are refunded in full; free registrations are cancelled.",
                    action_url=f"{FRONTEND_URL}/orders", inbox_user_ids=[u.id for u in recipients],
                    emails=[notify.Email(address=u.email, user_id=u.id) for u in recipients],
                ))
            job = session.exec(select(outbox_events).where(outbox_events.id == outbox_id).with_for_update()).one()
            if complete:
                job.status = "COMPLETED"
                job.processed_at = now
                job.processing_until = None
            else:
                job.status = "PENDING"
                job.processing_until = None
                job.last_error_code = "ORDER_PROCESSING_FAILED"
            session.add(job)
            session.commit()
        handled += 1
    return handled
