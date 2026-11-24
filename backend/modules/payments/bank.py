import logging
import secrets
import uuid
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, text
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import PAYMENT_CHECK_INTERVAL_SECONDS, PUBLIC_API_URL
from backend.modules.audit import service as audit
from backend.modules.events.models import events
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.notifications import service as notify
from backend.modules.orders.models import orders, reservations
from backend.modules.orders.schemas import OrderStatus, ReservationStatus
from backend.modules.payments import halyk, service
from backend.modules.payments.models import activation_fee_payments, payment_webhook_events, payments
from backend.modules.payments.schemas import (
    CancellationReason, PaymentStatus, PendingOperation, UNFINISHED_PAYMENT_STATUSES, WebhookProcessingStatus, WebhookVerificationStatus,
)
from backend.modules.tickets.models import tickets
from backend.modules.users.user_model import Role, users

log = logging.getLogger("biletflow.payments")

INVOICE_LOCK_KEY = 724502
OPERATION_LEASE = timedelta(minutes=5)
PAYMENT_WINDOW = timedelta(hours=2)
MAX_BACKOFF = timedelta(hours=1)
MAX_STEPS = 5


def new_invoice(session: Session) -> str:
    session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": INVOICE_LOCK_KEY})
    for _ in range(50):
        number = str(secrets.randbelow(9 * 10 ** 14) + 10 ** 14)
        tail = number[-6:]
        used = session.exec(select(payments.id).where(func.right(payments.provider_invoice_id, 6) == tail).limit(1)).first()
        used = used or session.exec(select(activation_fee_payments.id).where(func.right(activation_fee_payments.provider_operation_ref, 6) == tail).limit(1)).first()
        if used is None:
            return number
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not allocate an invoice number")


def post_link() -> str:
    return f"{PUBLIC_API_URL}/payments/halyk/postlink"


def unpaid(state: halyk.BankState) -> bool:
    return state.status in (halyk.NOT_FOUND, halyk.DECLINED) or state.raw_status == "3D"


def event_open(event: events) -> bool:
    return event.status not in (EventLifecycleStatus.CANCELLED, EventLifecycleStatus.COMPLETED)


def incident(session: Session, *, event_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID, code: str, message: str) -> None:
    admins = list(session.exec(select(users.id).where(users.personal_role == Role.PLATFORM_ADMIN, users.is_suspended.is_(False))).all())
    created = notify.publish(session, notify.Notice(key=f"PAYMENT_INCIDENT:{entity_id}:{code}", event_type="PAYMENT_INCIDENT", aggregate_type=entity_type,
                                                    aggregate_id=entity_id, title="Payment needs manual review", body=message, inbox_user_ids=admins))
    if created is not None:
        log.error("payment incident %s %s %s", entity_type, entity_id, code)
        audit.record(session, action="PAYMENT_INCIDENT", entity_type=entity_type, entity_id=entity_id, event_id=event_id, details={"code": code})


def _payment_incident(session: Session, order: orders, payment: payments, code: str, message: str) -> None:
    incident(session, event_id=order.event_id, entity_type="PAYMENT", entity_id=payment.id, code=code, message=f"Order {order.order_number}: {message}")


def _schedule(session: Session, payment: payments, now, delay: timedelta | None = None) -> None:
    if payment.status in UNFINISHED_PAYMENT_STATUSES:
        payment.next_check_at = now + (delay or timedelta(seconds=PAYMENT_CHECK_INTERVAL_SECONDS))
        session.add(payment)


def _lookup_failed(session: Session, payment_id: uuid.UUID) -> None:
    payment = session.exec(select(payments).where(payments.id == payment_id).with_for_update().execution_options(populate_existing=True)).one()
    if payment.status in UNFINISHED_PAYMENT_STATUSES:
        payment.check_failure_count += 1
        delay = min(timedelta(seconds=PAYMENT_CHECK_INTERVAL_SECONDS * 2 ** min(payment.check_failure_count, 10)), MAX_BACKOFF)
        payment.next_check_at = db_now(session) + delay
        session.add(payment)
    session.commit()


def _finish_cancelled(session: Session, order: orders, reservation: reservations, payment: payments, now) -> None:
    reason = payment.cancellation_reason
    if reason != CancellationReason.CAPTURE_FAILED:
        service._finish(payment, PaymentStatus.CANCELLED, reason)
        session.add(payment)
        return
    service._finish(payment, PaymentStatus.FAILED, reason)
    session.add(payment)
    service.close_failed_checkout(session, order, reservation, payment, now)


def _charged_without_order(session: Session, order: orders, payment: payments) -> None:
    service._finish(payment, PaymentStatus.SUCCEEDED)
    payment.processing_fee_minor = service.estimate_processing_fee(payment.amount_minor)
    session.add(payment)
    _payment_incident(session, order, payment, "CHARGED_AFTER_CANCEL", "the bank charged the buyer after the order was closed; return the money in the bank cabinet.")


def _apply(session: Session, payment_id: uuid.UUID, state: halyk.BankState, last: tuple[str, str] | None) -> tuple[str | None, list[tickets]]:
    event, order, reservation, payment = service._lock_chain(session, payment_id, with_event=True)
    now = db_now(session)
    if payment.check_failure_count:
        payment.check_failure_count = 0
        session.add(payment)

    if state.status in (halyk.AUTH, halyk.CHARGE) and not state.matches(payment.amount_minor, payment.currency):
        _payment_incident(session, order, payment, "BANK_MISMATCH", "the bank reports a different amount, currency or terminal; tickets were not issued.")
        _schedule(session, payment, now, MAX_BACKOFF)
        session.commit()
        return None, []

    if payment.status not in UNFINISHED_PAYMENT_STATUSES:
        action = None
        if payment.status != PaymentStatus.SUCCEEDED and state.status in (halyk.AUTH, halyk.CHARGE):
            charged = state.status == halyk.CHARGE
            _payment_incident(session, order, payment, "LATE_CHARGE" if charged else "LATE_AUTH",
                              "the bank charged the buyer after the payment was closed; return the money in the bank cabinet." if charged
                              else "the bank held money after the payment was closed; the hold is being cancelled.")
            action = None if charged or last else "cancel"
        session.commit()
        return action, []

    if state.status in (halyk.AUTH, halyk.CHARGE) and payment.provider_payment_id is None:
        payment.provider_payment_id = state.transaction_id
        session.add(payment)

    if payment.status == PaymentStatus.PENDING:
        return _apply_pending(session, payment, state, now)
    if payment.status == PaymentStatus.CAPTURING:
        return _apply_capturing(session, payment, state, now, last)

    if payment.pending_operation != PendingOperation.CANCEL:
        _schedule(session, payment, now)
        session.commit()
        return None, []
    if state.status == halyk.AUTH:
        _schedule(session, payment, now)
        session.commit()
        return (None if last and last[0] == "cancel" else "cancel"), []
    if state.status == halyk.CHARGE:
        if payment.cancellation_reason == CancellationReason.CAPTURE_FAILED and order.status == OrderStatus.PENDING and reservation.status == ReservationStatus.PROTECTED:
            payment.status = PaymentStatus.CAPTURING
            payment.pending_operation = PendingOperation.CAPTURE
            payment.cancellation_reason = None
            session.add(payment)
            session.flush()
            return None, service.apply_capture(session, payment_id, True) or []
        _charged_without_order(session, order, payment)
    elif state.status in (halyk.RELEASED, halyk.DECLINED, halyk.REFUNDED):
        _finish_cancelled(session, order, reservation, payment, now)
    else:
        _schedule(session, payment, now)
    session.commit()
    return None, []


def _apply_pending(session: Session, payment: payments, state: halyk.BankState, now) -> tuple[str | None, list[tickets]]:
    payment_id = payment.id
    if state.status in (halyk.AUTH, halyk.CHARGE):
        service.apply_auth(session, payment_id, True, state.transaction_id)
        payment = session.get(payments, payment_id)
        if payment.status == PaymentStatus.CAPTURING:
            if state.status == halyk.CHARGE:
                return None, service.apply_capture(session, payment_id, True) or []
            return "charge", []
        if payment.status == PaymentStatus.AUTHORIZED:
            return ("again" if state.status == halyk.CHARGE else "cancel"), []
        return None, []
    closed = now - as_aware(payment.created_at) >= PAYMENT_WINDOW
    if state.status in (halyk.RELEASED, halyk.REFUNDED) or (closed and unpaid(state)):
        service.apply_auth(session, payment_id, False, None)
        return None, []
    if state.status == halyk.DECLINED and payment.cancellation_reason is None:
        service.notify_payment_declined(session, session.get(orders, payment.order_id), payment, state.transaction_id)
    _schedule(session, payment, now)
    session.commit()
    return None, []


def _apply_capturing(session: Session, payment: payments, state: halyk.BankState, now, last: tuple[str, str] | None) -> tuple[str | None, list[tickets]]:
    payment_id = payment.id
    if state.status == halyk.CHARGE:
        return None, service.apply_capture(session, payment_id, True) or []
    if state.status in (halyk.RELEASED, halyk.DECLINED, halyk.REFUNDED):
        service.apply_capture(session, payment_id, False)
        return None, []
    if state.status == halyk.AUTH and last == ("charge", halyk.REFUSED):
        payment.status = PaymentStatus.AUTHORIZED
        payment.pending_operation = PendingOperation.CANCEL
        payment.cancellation_reason = CancellationReason.CAPTURE_FAILED
        _schedule(session, payment, now)
        session.commit()
        return "cancel", []
    if last is None and payment.next_check_at is not None and as_aware(payment.next_check_at) > now:
        session.rollback()
        return None, []
    if state.status == halyk.AUTH and last is None:
        _schedule(session, payment, now, OPERATION_LEASE)
        session.commit()
        return "charge", []
    _schedule(session, payment, now, OPERATION_LEASE)
    session.commit()
    return None, []


def sync(session: Session, payment_id: uuid.UUID) -> list[tickets]:
    snapshot = session.get(payments, payment_id)
    if snapshot is None or service.is_simulated(snapshot):
        return []
    invoice = snapshot.provider_invoice_id
    session.commit()
    last: tuple[str, str] | None = None
    for _ in range(MAX_STEPS):
        try:
            state = halyk.lookup(invoice)
        except halyk.HalykError as exc:
            log.warning("payment %s status check failed: %s", payment_id, exc)
            _lookup_failed(session, payment_id)
            return []
        action, issued = _apply(session, payment_id, state, last)
        session.commit()
        if action is None:
            return issued
        if action == "charge":
            last = ("charge", halyk.charge(state.transaction_id))
        elif action == "cancel":
            last = ("cancel", halyk.cancel(state.transaction_id))
    return []


def record_postlink(session: Session, payload: dict) -> tuple[payment_webhook_events, str | None]:
    invoice = str(payload.get("invoiceId") or "")
    invoice = invoice if halyk.INVOICE_PATTERN.fullmatch(invoice) else None
    safe = {"invoiceId": invoice}
    if payload.get("code") in ("ok", "error"):
        safe["code"] = payload["code"]
    if isinstance(payload.get("reasonCode"), int) and not isinstance(payload.get("reasonCode"), bool):
        safe["reasonCode"] = payload["reasonCode"]
    transaction_id = payload.get("id")
    if isinstance(transaction_id, str) and halyk.TRANSACTION_PATTERN.fullmatch(transaction_id):
        safe["id"] = transaction_id
    valid = invoice is not None and halyk.valid_secret(invoice, payload.get("secret_hash"))
    journal = payment_webhook_events(
        provider_invoice_id=invoice, payload=safe,
        verification_status=WebhookVerificationStatus.VALID if valid else WebhookVerificationStatus.INVALID,
        processing_status=WebhookProcessingStatus.PENDING if valid else WebhookProcessingStatus.REJECTED,
        processed_at=None if valid else db_now(session),
    )
    session.add(journal)
    session.commit()
    return journal, invoice if valid else None


def close_journal(session: Session, journal_id: uuid.UUID, processing: WebhookProcessingStatus, payment_id: uuid.UUID | None = None) -> None:
    service._mark(session, session.get(payment_webhook_events, journal_id), processing, payment_id)
