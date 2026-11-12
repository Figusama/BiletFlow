import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import PAYMENT_CHECK_INTERVAL_SECONDS, PAYMENT_WEBHOOK_SECRET, PROCESSING_FEE_RATE_BPS, PUBLIC_API_URL
from backend.modules.events.access import get_event_or_404
from backend.modules.orders.models import orders, reservations
from backend.modules.orders.schemas import OrderStatus, ReservationStatus
from backend.modules.payments.activation import paid_sales_active
from backend.modules.payments.models import payments, payment_webhook_events
from backend.modules.payments.schemas import (
    PaymentStatus, PendingOperation, CancellationReason, UNFINISHED_PAYMENT_STATUSES,
    WebhookVerificationStatus, WebhookProcessingStatus, SimulatedOutcome, PaymentPublic,
)
from backend.modules.promotions import service as promo_service
from backend.modules.tickets.models import tickets
from backend.modules.users.user_model import users


SIMULATED_PROVIDER = "SIMULATED"


def sign(body: bytes) -> str:
    return hmac.new(PAYMENT_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


def estimate_processing_fee(amount_minor: int) -> int:
    return amount_minor * PROCESSING_FEE_RATE_BPS // 10000


def to_public(payment: payments) -> PaymentPublic:
    unfinished = payment.status in UNFINISHED_PAYMENT_STATUSES
    return PaymentPublic(
        id=payment.id,
        order_id=payment.order_id,
        status=payment.status,
        pending_operation=payment.pending_operation,
        cancellation_reason=payment.cancellation_reason,
        amount_minor=payment.amount_minor,
        currency=payment.currency,
        is_simulated=payment.is_simulated,
        payment_url=f"{PUBLIC_API_URL}/payments/simulator/{payment.id}" if unfinished and payment.status == PaymentStatus.PENDING else None,
        created_at=payment.created_at,
    )


def unfinished_payment(session: Session, order_id: uuid.UUID, lock: bool = False) -> payments | None:
    query = select(payments).where(payments.order_id == order_id, payments.status.in_(UNFINISHED_PAYMENT_STATUSES))
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return session.exec(query).first()


def _finish(payment: payments, status_: PaymentStatus, reason: CancellationReason | None = None) -> None:
    payment.status = status_
    payment.pending_operation = None
    payment.cancellation_reason = reason
    payment.next_check_at = None


def cancel_unfinished_payment(session: Session, order: orders, reason: str, now: datetime) -> None:
    payment = unfinished_payment(session, order.id, lock=True)
    if payment is None:
        return
    if payment.status == PaymentStatus.PENDING:
        _finish(payment, PaymentStatus.CANCELLED, CancellationReason(reason))
        session.add(payment)
    elif payment.status == PaymentStatus.AUTHORIZED and payment.pending_operation is None:
        payment.pending_operation = PendingOperation.CANCEL
        payment.cancellation_reason = CancellationReason(reason)
        session.add(payment)
        session.flush()
        _finish(payment, PaymentStatus.CANCELLED, CancellationReason(reason))
        session.add(payment)


def start_payment(session: Session, order_id: uuid.UUID, user: users) -> payments:
    from backend.modules.orders.service import expire_if_stale

    order = session.get(orders, order_id)
    if order is None or order.buyer_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    event = get_event_or_404(session, order.event_id, for_update=True)
    order = session.exec(select(orders).where(orders.id == order_id).with_for_update().execution_options(populate_existing=True)).one()
    reservation = session.exec(select(reservations).where(reservations.id == order.reservation_id).with_for_update().execution_options(populate_existing=True)).one()

    if expire_if_stale(session, order):
        session.commit()
        raise HTTPException(status.HTTP_409_CONFLICT, "Reservation expired; please start a new checkout")
    if order.status != OrderStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Order is {order.status.value}")
    if order.total_minor <= 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Order does not require payment")

    existing = unfinished_payment(session, order.id, lock=True)
    if existing is not None:
        return existing

    if event.status.value != "PUBLISHED":
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is not on sale")
    if not paid_sales_active(session, event.id, lock=True):
        raise HTTPException(status.HTTP_409_CONFLICT, "Paid sales are suspended for this event")

    now = db_now(session)
    if reservation.status != ReservationStatus.ACTIVE or as_aware(reservation.expires_at) <= now:
        raise HTTPException(status.HTTP_409_CONFLICT, "Reservation is no longer active")

    if order.promo_code_id is not None:
        hold = session.exec(select(promo_service.promo_holds).where(promo_service.promo_holds.order_id == order.id)).first()
        if hold is None or hold.released_at is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Promo allocation is no longer valid; please start a new checkout")

    payment = payments(
        order_id=order.id,
        provider=SIMULATED_PROVIDER,
        is_simulated=True,
        provider_invoice_id="SIM-" + secrets.token_hex(8).upper(),
        amount_minor=order.total_minor,
        next_check_at=now + timedelta(seconds=PAYMENT_CHECK_INTERVAL_SECONDS),
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def record_webhook(session: Session, body: bytes, signature: str | None) -> payment_webhook_events:
    try:
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise ValueError
    except ValueError:
        payload = {"unparseable": True}
    safe_payload = {key: payload.get(key) for key in ("invoice_id", "event", "result", "provider_payment_id") if key in payload}
    event = payment_webhook_events(provider_invoice_id=safe_payload.get("invoice_id"), payload=safe_payload or {"unparseable": True})
    session.add(event)
    session.commit()

    if not signature or not hmac.compare_digest(signature, sign(body)):
        event.verification_status = WebhookVerificationStatus.INVALID
        event.processing_status = WebhookProcessingStatus.REJECTED
        event.processed_at = db_now(session)
        session.add(event)
        session.commit()
        return event

    event.verification_status = WebhookVerificationStatus.VALID
    session.add(event)
    session.commit()
    return event


def process_webhook(session: Session, journal: payment_webhook_events, capture_outcome: SimulatedOutcome = SimulatedOutcome.APPROVE) -> list[tickets]:
    if journal.verification_status != WebhookVerificationStatus.VALID:
        return []
    payload = journal.payload
    payment = session.exec(select(payments).where(payments.provider_invoice_id == payload.get("invoice_id"))).first()
    if payment is None:
        _mark(session, journal, WebhookProcessingStatus.IGNORED)
        return []
    payment_id = payment.id
    kind = payload.get("event")
    approved = payload.get("result") == "approved"
    if kind == "AUTH":
        applied = apply_auth(session, payment_id, approved, payload.get("provider_payment_id"))
        _mark(session, journal, WebhookProcessingStatus.PROCESSED if applied else WebhookProcessingStatus.IGNORED, payment_id)
        if applied and approved:
            return run_capture(session, payment_id, capture_outcome)
        return []
    if kind == "CAPTURE":
        issued = apply_capture(session, payment_id, approved)
        _mark(session, journal, WebhookProcessingStatus.PROCESSED if issued is not None else WebhookProcessingStatus.IGNORED, payment_id)
        return issued or []
    _mark(session, journal, WebhookProcessingStatus.IGNORED, payment_id)
    return []


def _mark(session: Session, journal: payment_webhook_events, processing: WebhookProcessingStatus, payment_id: uuid.UUID | None = None) -> None:
    if payment_id is not None:
        journal.payment_id = payment_id
    journal.processing_status = processing
    journal.processed_at = db_now(session)
    session.add(journal)
    session.commit()


def _lock_chain(session: Session, payment_id: uuid.UUID):
    payment = session.get(payments, payment_id)
    order = session.get(orders, payment.order_id)
    get_event_or_404(session, order.event_id, for_update=True)
    order = session.exec(select(orders).where(orders.id == order.id).with_for_update().execution_options(populate_existing=True)).one()
    reservation = session.exec(select(reservations).where(reservations.id == order.reservation_id).with_for_update().execution_options(populate_existing=True)).one()
    payment = session.exec(select(payments).where(payments.id == payment_id).with_for_update().execution_options(populate_existing=True)).one()
    return order, reservation, payment


def apply_auth(session: Session, payment_id: uuid.UUID, approved: bool, provider_payment_id: str | None) -> bool:
    order, reservation, payment = _lock_chain(session, payment_id)
    if payment.status != PaymentStatus.PENDING:
        session.rollback()
        return False
    now = db_now(session)
    if provider_payment_id:
        payment.provider_payment_id = provider_payment_id
    if not approved:
        _finish(payment, PaymentStatus.FAILED)
        session.add(payment)
        session.commit()
        return True

    payment.authorized_at = now
    reservation_live = reservation.status == ReservationStatus.ACTIVE and as_aware(reservation.expires_at) > now
    if payment.cancellation_reason is not None or order.status != OrderStatus.PENDING or not reservation_live:
        reason = payment.cancellation_reason or (CancellationReason.RESERVATION_EXPIRED if not reservation_live else CancellationReason.USER_REQUESTED)
        payment.status = PaymentStatus.AUTHORIZED
        payment.pending_operation = PendingOperation.CANCEL
        payment.cancellation_reason = reason
        session.add(payment)
        session.flush()
        _finish(payment, PaymentStatus.CANCELLED, reason)
        if order.status == OrderStatus.PENDING:
            order.status = OrderStatus.EXPIRED
            order.expired_at = now
            session.add(order)
            promo_service.release_hold(session, order.id, now)
        session.add(payment)
        session.commit()
        return True

    reservation.status = ReservationStatus.PROTECTED
    payment.status = PaymentStatus.CAPTURING
    payment.pending_operation = PendingOperation.CAPTURE
    payment.next_check_at = now + timedelta(seconds=PAYMENT_CHECK_INTERVAL_SECONDS)
    session.add(reservation)
    session.add(payment)
    session.commit()
    return True


def run_capture(session: Session, payment_id: uuid.UUID, outcome: SimulatedOutcome) -> list[tickets]:
    payment = session.get(payments, payment_id)
    if payment.status != PaymentStatus.CAPTURING:
        return []
    body = json.dumps({"invoice_id": payment.provider_invoice_id, "event": "CAPTURE", "result": "approved" if outcome == SimulatedOutcome.APPROVE else "declined"}).encode()
    journal = record_webhook(session, body, sign(body))
    return process_webhook(session, journal)


def apply_capture(session: Session, payment_id: uuid.UUID, approved: bool) -> list[tickets] | None:
    from backend.modules.orders.service import confirm_order

    order, reservation, payment = _lock_chain(session, payment_id)
    if payment.status != PaymentStatus.CAPTURING:
        session.rollback()
        return None
    now = db_now(session)
    if approved:
        _finish(payment, PaymentStatus.SUCCEEDED)
        payment.succeeded_at = now
        payment.processing_fee_minor = estimate_processing_fee(payment.amount_minor)
        session.add(payment)
        issued: list[tickets] = []
        if order.status == OrderStatus.PENDING:
            issued = confirm_order(session, order, reservation, now)
        session.commit()
        return issued

    payment.status = PaymentStatus.AUTHORIZED
    payment.pending_operation = PendingOperation.CANCEL
    payment.cancellation_reason = CancellationReason.CAPTURE_FAILED
    session.add(payment)
    session.flush()
    _finish(payment, PaymentStatus.FAILED, CancellationReason.CAPTURE_FAILED)
    order.status = OrderStatus.CANCELLED
    order.cancelled_at = now
    reservation.status = ReservationStatus.RELEASED
    reservation.released_at = now
    promo_service.release_hold(session, order.id, now)
    session.add_all([payment, order, reservation])
    session.commit()
    return []


def simulate_bank(session: Session, payment_id: uuid.UUID, outcome: SimulatedOutcome) -> list[tickets]:
    payment = session.get(payments, payment_id)
    if payment is None or not payment.is_simulated:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    body = json.dumps({
        "invoice_id": payment.provider_invoice_id,
        "event": "AUTH",
        "result": "declined" if outcome == SimulatedOutcome.DECLINE else "approved",
        "provider_payment_id": "SIMPAY-" + secrets.token_hex(6).upper(),
    }).encode()
    journal = record_webhook(session, body, sign(body))
    capture = SimulatedOutcome.DECLINE if outcome == SimulatedOutcome.CAPTURE_FAIL else SimulatedOutcome.APPROVE
    return process_webhook(session, journal, capture_outcome=capture)


def reconcile_due(session: Session) -> int:
    from backend.modules.orders.service import expire_if_stale

    now = db_now(session)
    due = session.exec(select(payments.id).where(payments.status.in_(UNFINISHED_PAYMENT_STATUSES), payments.next_check_at <= now)).all()
    handled = 0
    for payment_id in due:
        payment = session.get(payments, payment_id)
        order = session.get(orders, payment.order_id)
        if payment.status == PaymentStatus.PENDING:
            get_event_or_404(session, order.event_id, for_update=True)
            order = session.exec(select(orders).where(orders.id == order.id).with_for_update().execution_options(populate_existing=True)).one()
            if not expire_if_stale(session, order):
                payment = session.exec(select(payments).where(payments.id == payment_id).with_for_update().execution_options(populate_existing=True)).one()
                if payment.status == PaymentStatus.PENDING:
                    payment.next_check_at = now + timedelta(seconds=PAYMENT_CHECK_INTERVAL_SECONDS)
                    payment.check_failure_count = 0
                    session.add(payment)
            session.commit()
            handled += 1
    return handled
