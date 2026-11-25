import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.modules.admin.router import payment_fields, require_admin
from backend.modules.admin.schemas import AdminCounters, AdminPaymentDetail, PaymentCheck, PaymentRefundAttempt, PaymentWebhook, TimelineEntry
from backend.modules.audit.catalog import canonical, describe
from backend.modules.audit.models import audit_logs
from backend.modules.audit.presentation import safe_details
from backend.modules.events.models import event_applications, event_cancellation_requests, event_change_requests
from backend.modules.events.schemas import EventStatus
from backend.modules.orders.models import orders
from backend.modules.payments import halyk, service
from backend.modules.payments.models import paid_sales_activation_requests, payment_webhook_events, payments
from backend.modules.payments.schemas import PaymentStatus, UNFINISHED_PAYMENT_STATUSES
from backend.modules.refunds.models import refund_requests, refunds
from backend.modules.support.models import support_cases
from backend.modules.tickets.notify import deliver_notices
from backend.modules.users.user_model import users
from database.database import get_session

router = APIRouter(prefix="/admin", tags=["admin"])

FINISHED_ACTIONS = {PaymentStatus.SUCCEEDED: "PAYMENT_SUCCEEDED", PaymentStatus.FAILED: "PAYMENT_FAILED_FINAL", PaymentStatus.CANCELLED: "PAYMENT_CANCELLED"}


@router.get("/counters", response_model=AdminCounters)
def counters(session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    def count(model, *conditions) -> int:
        return session.exec(select(func.count()).select_from(model).where(*conditions)).one()

    platform = or_(support_cases.case_scope == "PLATFORM_SUPPORT", support_cases.escalated_to_platform.is_(True))
    opened = and_(platform, support_cases.status != "RESOLVED")
    return AdminCounters(
        event_applications=count(event_applications, event_applications.status == EventStatus.PENDING),
        change_requests=count(event_change_requests, event_change_requests.status == EventStatus.PENDING),
        paid_sales_requests=count(paid_sales_activation_requests, paid_sales_activation_requests.status == "PENDING"),
        refund_requests=count(refund_requests, refund_requests.status == "PENDING_ADMIN"),
        cancellation_requests=count(event_cancellation_requests, event_cancellation_requests.status == "PENDING"),
        support_cases=count(support_cases, opened),
        support_unassigned=count(support_cases, opened, support_cases.assigned_to_user_id.is_(None)),
        payments_overdue=count(payments, payments.status.in_(UNFINISHED_PAYMENT_STATUSES), payments.next_check_at <= db_now(session)),
    )


def get_payment(session: Session, payment_id: uuid.UUID) -> payments:
    payment = session.get(payments, payment_id)
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    return payment


def payment_detail(session: Session, payment: payments) -> AdminPaymentDetail:
    order = session.get(orders, payment.order_id)
    attempts = session.exec(select(refunds).where(refunds.payment_id == payment.id).order_by(refunds.created_at, refunds.id)).all()
    mine = [payment_webhook_events.payment_id == payment.id]
    if payment.provider_invoice_id:
        mine.append(and_(payment_webhook_events.payment_id.is_(None), payment_webhook_events.provider_invoice_id == payment.provider_invoice_id))
    hooks = session.exec(select(payment_webhook_events).where(or_(*mine)).order_by(payment_webhook_events.received_at, payment_webhook_events.id)).all()
    return AdminPaymentDetail(
        **payment_fields(session, [(payment, order)], db_now(session))[0], order_status=order.status, currency=payment.currency,
        provider_invoice_id=payment.provider_invoice_id, provider_payment_id=payment.provider_payment_id, processing_fee_minor=payment.processing_fee_minor,
        check_failure_count=payment.check_failure_count, updated_at=payment.updated_at,
        refunds=[PaymentRefundAttempt(id=a.id, refund_request_id=a.refund_request_id, status=a.status, amount_minor=a.amount_minor, created_at=a.created_at,
                                      finalized_at=a.finalized_at) for a in attempts],
        timeline=timeline(session, payment, order, attempts, hooks),
        webhooks=[PaymentWebhook(id=h.id, received_at=h.received_at, processed_at=h.processed_at, verification_status=h.verification_status.value,
                                 processing_status=h.processing_status.value, payload=h.payload) for h in hooks],
    )


def timeline(session: Session, payment: payments, order: orders, attempts: list[refunds], hooks: list[payment_webhook_events]) -> list[TimelineEntry]:
    entries = [TimelineEntry(at=order.created_at, type="ORDER_CREATED", title="Order created", details={"order_number": order.order_number}),
               TimelineEntry(at=payment.created_at, type="PAYMENT_CREATED", title="Payment started", details={"amount_minor": payment.amount_minor})]
    for at, kind, title in ((order.cancelled_at, "ORDER_CANCELLED", "Order cancelled"), (order.expired_at, "ORDER_EXPIRED", "Reservation expired")):
        if at is not None:
            entries.append(TimelineEntry(at=at, type=kind, title=title, details={}))
    for hook in hooks:
        entries.append(TimelineEntry(at=hook.received_at, type="WEBHOOK_RECEIVED", title="Bank notification received",
                                     details={"verification_status": hook.verification_status.value, "processing_status": hook.processing_status.value}))
    for attempt in attempts:
        entries.append(TimelineEntry(at=attempt.created_at, type="REFUND_STARTED", title="Refund sent to the bank", details={"amount_minor": attempt.amount_minor}))
        if attempt.status == "FAILED" and attempt.finalized_at is not None:
            entries.append(TimelineEntry(at=attempt.finalized_at, type="REFUND_ATTEMPT_FAILED", title="Refund attempt failed", details={}))
    related = [payment.id, order.id, *[a.id for a in attempts], *session.exec(select(refund_requests.id).where(refund_requests.order_id == order.id)).all()]
    rows = session.exec(select(audit_logs).where(audit_logs.entity_id.in_(related))).all()
    for row in rows:
        details = {"code": row.details.get("code")} if row.action_type == "PAYMENT_INCIDENT" else safe_details(row)
        entries.append(TimelineEntry(at=row.created_at, type=canonical(row.action_type), title=describe(row.action_type)[1], details=details))
    final = FINISHED_ACTIONS.get(payment.status)
    if payment.finalized_at is not None and not any(row.entity_id == payment.id and row.action_type == final for row in rows):
        entries.append(TimelineEntry(at=payment.finalized_at, type=final, title=f"Payment {payment.status.value.lower()}",
                                     details={"reason": payment.cancellation_reason.value} if payment.cancellation_reason else {}))
    return sorted(entries, key=lambda e: as_aware(e.at))


@router.get("/payments/{payment_id}", response_model=AdminPaymentDetail)
def read_payment(payment_id: uuid.UUID, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    return payment_detail(session, get_payment(session, payment_id))


@router.post("/payments/{payment_id}/check-status", response_model=PaymentCheck)
def check_payment(payment_id: uuid.UUID, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    payment = get_payment(session, payment_id)
    before, simulated, invoice = payment.status, service.is_simulated(payment), payment.provider_invoice_id
    bank_status = None
    if not simulated:
        if invoice is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Payment was not sent to the bank")
        session.commit()
        try:
            state = halyk.lookup(invoice)
        except halyk.HalykError:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The bank is not available, please try again")
        bank_status = state.raw_status or state.status
    service.reconcile_payment(session, payment_id)
    deliver_notices(background)
    session.expire_all()
    payment = get_payment(session, payment_id)
    return PaymentCheck(bank_status=bank_status, changed=payment.status != before, payment=payment_detail(session, payment))
