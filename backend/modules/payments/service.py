import hashlib
import hmac
import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import FRONTEND_URL, PAYMENT_CHECK_INTERVAL_SECONDS, PAYMENT_WEBHOOK_SECRET, PROCESSING_FEE_RATE_BPS, PUBLIC_API_URL
from backend.modules.audit import service as audit
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.events.access import ensure_on_sale, ensure_purchase_access, get_event_or_404
from backend.modules.notifications import service as notify
from backend.modules.orders.models import orders, reservations
from backend.modules.orders.schemas import OrderStatus, ReservationStatus
from backend.modules.payments import halyk
from backend.modules.payments.activation import paid_sales_active
from backend.modules.payments.models import payments, payment_webhook_events
from backend.modules.payments.schemas import (
    PaymentStatus, PendingOperation, CancellationReason, UNFINISHED_PAYMENT_STATUSES,
    WebhookVerificationStatus, WebhookProcessingStatus, SimulatedOutcome, PaymentPublic,
)
from backend.modules.promotions import service as promo_service
from backend.modules.tickets.models import tickets
from backend.modules.users.user_model import users


log = logging.getLogger("biletflow.payments")

SIMULATED_INVOICE_PREFIX = "SIM-"
CAPTURE_LEASE = timedelta(minutes=5)
RECONCILE_LIMIT = 100


def is_simulated(payment: payments) -> bool:
    return (payment.provider_invoice_id or "").startswith(SIMULATED_INVOICE_PREFIX)


def sign(body: bytes) -> str:
    return hmac.new(PAYMENT_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


def is_demonstration(payment: payments) -> bool:
    return is_simulated(payment) or halyk.SANDBOX


def estimate_processing_fee(amount_minor: int) -> int:
    return amount_minor * PROCESSING_FEE_RATE_BPS // 10000


def to_public(payment: payments) -> PaymentPublic:
    payable = payment.status == PaymentStatus.PENDING and payment.cancellation_reason is None
    return PaymentPublic(
        id=payment.id,
        order_id=payment.order_id,
        status=payment.status,
        pending_operation=payment.pending_operation,
        cancellation_reason=payment.cancellation_reason,
        amount_minor=payment.amount_minor,
        currency=payment.currency,
        is_simulated=is_demonstration(payment),
        payment_url=f"{PUBLIC_API_URL}/payments/{'simulator' if is_simulated(payment) else 'halyk'}/{payment.id}" if payable else None,
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
    if status_ in (PaymentStatus.SUCCEEDED, PaymentStatus.FAILED, PaymentStatus.CANCELLED):
        payment.finalized_at = datetime.now(timezone.utc)


def request_payment_cancellation(session: Session, order: orders, reason: str, now: datetime) -> None:
    payment = unfinished_payment(session, order.id, lock=True)
    if payment is None:
        return
    if payment.status == PaymentStatus.PENDING:
        payment.cancellation_reason = CancellationReason(reason)
        payment.next_check_at = now + timedelta(seconds=PAYMENT_CHECK_INTERVAL_SECONDS)
        session.add(payment)
    elif payment.status == PaymentStatus.AUTHORIZED and payment.pending_operation is None:
        payment.pending_operation = PendingOperation.CANCEL
        payment.cancellation_reason = CancellationReason(reason)
        payment.next_check_at = now
        session.add(payment)
        session.flush()
        if is_simulated(payment):
            _finish(payment, PaymentStatus.CANCELLED, CancellationReason(reason))
            session.add(payment)


def start_payment(session: Session, order_id: uuid.UUID, user: users, idempotency_key: str | None = None) -> payments:
    from backend.modules.orders.service import expire_if_stale, lock_order_chain
    from backend.modules.payments.bank import new_invoice

    order = session.get(orders, order_id)
    if order is None or order.buyer_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if idempotency_key:
        same = session.exec(select(payments).where(payments.idempotency_key == idempotency_key)).first()
        if same is not None:
            if same.order_id != order.id:
                raise HTTPException(status.HTTP_409_CONFLICT, "Idempotency key was used for another order")
            return same
    event, order, reservation = lock_order_chain(session, order_id)

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

    ensure_on_sale(event)
    ensure_purchase_access(session, event, user)
    if not paid_sales_active(session, event.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Paid sales are suspended for this event")
    if order.purchase_terms_version != event.purchase_terms_version:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event purchase terms changed; please start a new checkout")

    now = db_now(session)
    if reservation.status != ReservationStatus.ACTIVE or as_aware(reservation.expires_at) <= now:
        raise HTTPException(status.HTTP_409_CONFLICT, "Reservation is no longer active")

    if order.promo_code_id is not None:
        hold = session.exec(select(promo_service.promo_holds).where(promo_service.promo_holds.order_id == order.id)).first()
        if hold is None or hold.released_at is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Promo allocation is no longer valid; please start a new checkout")

    payment = payments(
        order_id=order.id,
        provider_invoice_id=new_invoice(session) if halyk.enabled() else SIMULATED_INVOICE_PREFIX + secrets.token_hex(8).upper(),
        idempotency_key=idempotency_key or str(uuid.uuid4()),
        amount_minor=order.total_minor,
        next_check_at=now + timedelta(seconds=PAYMENT_CHECK_INTERVAL_SECONDS),
    )
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return payment


def plain_text(value) -> bool:
    return isinstance(value, str) and len(value) <= 200 and value.isprintable()


def record_webhook(session: Session, body: bytes, signature: str | None) -> payment_webhook_events:
    try:
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise ValueError
    except ValueError:
        payload = {"unparseable": True}
    safe_payload = {key: payload[key] for key in ("invoice_id", "event", "result", "provider_payment_id") if plain_text(payload.get(key))}
    event = payment_webhook_events(provider_invoice_id=safe_payload.get("invoice_id"), payload=safe_payload or {"unparseable": True})
    session.add(event)
    session.commit()

    if not signature or not hmac.compare_digest(signature.encode("utf-8", "replace"), sign(body).encode()):
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
    if payment is None or not is_simulated(payment):
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


def _lock_chain(session: Session, payment_id: uuid.UUID, with_event: bool = False):
    from backend.modules.orders.service import lock_order_chain

    snapshot = session.get(payments, payment_id)
    event, order, reservation = lock_order_chain(session, snapshot.order_id)
    payment = session.exec(select(payments).where(payments.id == payment_id).with_for_update().execution_options(populate_existing=True)).one()
    if with_event:
        return event, order, reservation, payment
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
        if payment.cancellation_reason is not None:
            _finish(payment, PaymentStatus.CANCELLED, payment.cancellation_reason)
        else:
            _finish(payment, PaymentStatus.FAILED)
            audit.record(session, action="PAYMENT_FAILED_FINAL", entity_type="PAYMENT", entity_id=payment.id, event_id=order.event_id)
            notify_payment_failed(session, order, payment, retry=True)
        session.add(payment)
        session.commit()
        return True

    reservation_live = reservation.status == ReservationStatus.ACTIVE and as_aware(reservation.expires_at) > now
    if payment.cancellation_reason is not None or order.status != OrderStatus.PENDING or not reservation_live:
        reason = payment.cancellation_reason or (CancellationReason.RESERVATION_EXPIRED if not reservation_live else CancellationReason.USER_REQUESTED)
        payment.status = PaymentStatus.AUTHORIZED
        payment.pending_operation = PendingOperation.CANCEL
        payment.cancellation_reason = reason
        session.add(payment)
        session.flush()
        if is_simulated(payment):
            _finish(payment, PaymentStatus.CANCELLED, reason)
        else:
            payment.next_check_at = now
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
    payment.next_check_at = now + (timedelta(seconds=PAYMENT_CHECK_INTERVAL_SECONDS) if is_simulated(payment) else CAPTURE_LEASE)
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

    event, order, reservation, payment = _lock_chain(session, payment_id, with_event=True)
    if payment.status != PaymentStatus.CAPTURING:
        session.rollback()
        return None
    now = db_now(session)
    if approved:
        _finish(payment, PaymentStatus.SUCCEEDED)
        payment.processing_fee_minor = estimate_processing_fee(payment.amount_minor)
        session.add(payment)
        audit.record(session, action="PAYMENT_SUCCEEDED", entity_type="PAYMENT", entity_id=payment.id, event_id=order.event_id)
        issued: list[tickets] = []
        if order.status == OrderStatus.PENDING:
            if event.status == EventLifecycleStatus.CANCELLED or event.is_suspended:
                _refund_without_issuing(session, event, order, reservation, now)
            else:
                issued = confirm_order(session, order, reservation, now)
        session.commit()
        return issued

    payment.status = PaymentStatus.AUTHORIZED
    payment.pending_operation = PendingOperation.CANCEL
    payment.cancellation_reason = CancellationReason.CAPTURE_FAILED
    session.add(payment)
    session.flush()
    _finish(payment, PaymentStatus.FAILED, CancellationReason.CAPTURE_FAILED)
    session.add(payment)
    close_failed_checkout(session, order, reservation, payment, now)
    session.commit()
    return []


def close_failed_checkout(session: Session, order: orders, reservation: reservations, payment: payments, now) -> None:
    if order.status == OrderStatus.PENDING:
        order.status = OrderStatus.CANCELLED
        order.cancelled_at = now
    if reservation.status == ReservationStatus.PROTECTED:
        reservation.status = ReservationStatus.RELEASED
        reservation.released_at = now
    promo_service.release_hold(session, order.id, now)
    session.add_all([order, reservation])
    audit.record(session, action="PAYMENT_FAILED_FINAL", entity_type="PAYMENT", entity_id=payment.id, event_id=order.event_id)
    notify_payment_failed(session, order, payment, retry=False)


def notify_payment_declined(session: Session, order: orders, payment: payments, transaction_id: str | None) -> None:
    notify_payment_failed(session, order, payment, retry=True, attempt=transaction_id)


def notify_payment_failed(session: Session, order: orders, payment: payments, retry: bool, attempt: str | None = None) -> None:
    buyer = session.get(users, order.buyer_user_id)
    key = f"PAYMENT_FAILED:{payment.id}" + (f":{attempt}" if attempt else "")
    hint = "You can try again while your reservation is active." if retry else "The order was closed; please start a new checkout."
    notify.publish(session, notify.Notice(key=key, event_type="PAYMENT_FAILED", aggregate_type="ORDER", aggregate_id=order.id,
                                          title="Payment failed", body=f"Payment for order {order.order_number} was not completed. {hint}",
                                          action_url=f"{FRONTEND_URL}/orders/{order.id}", inbox_user_ids=[buyer.id],
                                          emails=[notify.Email(address=buyer.email, user_id=buyer.id)]))


def _refund_without_issuing(session: Session, event, order: orders, reservation, now) -> None:
    from backend.modules.refunds import service as refund_service
    from backend.modules.refunds.schemas import RefundSource

    order.status = OrderStatus.CONFIRMED
    order.confirmed_at = now
    reservation.status = ReservationStatus.RELEASED
    reservation.released_at = now
    session.add_all([order, reservation])
    promo_service.release_hold(session, order.id, now)
    source = RefundSource.EVENT_CANCELLATION if event.status == EventLifecycleStatus.CANCELLED else RefundSource.EVENT_SUSPENSION
    refund_service.create_request(session, order, source, now, requested_by=None)


def simulate_bank(session: Session, payment_id: uuid.UUID, outcome: SimulatedOutcome) -> list[tickets]:
    payment = session.get(payments, payment_id)
    if payment is None or not is_simulated(payment):
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


def reconcile_due(session: Session) -> tuple[int, list[list[tickets]]]:
    from backend.modules.orders.service import expire_if_stale

    now = db_now(session)
    due = session.exec(select(payments.id).where(payments.status.in_(UNFINISHED_PAYMENT_STATUSES), payments.next_check_at <= now)
                       .order_by(payments.next_check_at).limit(RECONCILE_LIMIT)).all()
    handled = 0
    issued_batches: list[list[tickets]] = []
    for payment_id in due:
        payment = session.get(payments, payment_id)
        order = session.get(orders, payment.order_id)
        if not is_simulated(payment):
            issued = reconcile_bank(session, payment_id)
            if issued:
                issued_batches.append(issued)
            handled += 1
        elif payment.status == PaymentStatus.PENDING:
            order, _, payment = _lock_chain(session, payment_id)
            if payment.status == PaymentStatus.PENDING:
                bank_has_no_authorization = is_simulated(payment) and payment.cancellation_reason is not None
                if bank_has_no_authorization:
                    _finish(payment, PaymentStatus.CANCELLED, payment.cancellation_reason)
                elif not expire_if_stale(session, order):
                    payment.next_check_at = now + timedelta(seconds=PAYMENT_CHECK_INTERVAL_SECONDS)
                    payment.check_failure_count = 0
                session.add(payment)
            session.commit()
            handled += 1
        elif payment.status == PaymentStatus.CAPTURING and is_simulated(payment):
            issued = run_capture(session, payment_id, SimulatedOutcome.APPROVE)
            if issued:
                issued_batches.append(issued)
            handled += 1
    return handled, issued_batches


def reconcile_bank(session: Session, payment_id: uuid.UUID) -> list[tickets]:
    from backend.modules.orders.service import expire_if_stale
    from backend.modules.payments import bank

    try:
        payment = session.get(payments, payment_id)
        if payment.status == PaymentStatus.PENDING:
            expire_if_stale(session, session.get(orders, payment.order_id))
            session.commit()
        return bank.sync(session, payment_id)
    except Exception:
        session.rollback()
        log.exception("payment %s reconciliation failed", payment_id)
        bank.postpone(session, payment_id)
        return []
