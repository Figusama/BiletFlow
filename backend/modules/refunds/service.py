import logging
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import FRONTEND_URL
from backend.modules.admin.refs import event_refs, people
from backend.modules.audit import service as audit
from backend.modules.audit.models import audit_logs
from backend.modules.events.models import events
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.notifications import service as notify
from backend.modules.orders.models import orders
from backend.modules.orders.schemas import OrderStatus
from backend.modules.payments import halyk
from backend.modules.payments.models import payments
from backend.modules.payments.schemas import PaymentStatus
from backend.modules.payments.service import is_simulated
from backend.modules.refunds.models import refund_requests, refunds
from backend.modules.refunds.schemas import MANDATORY_SOURCES, AdminRefundAttempt, AdminRefundRequest, RefundAttemptPublic, RefundEligibility, RefundRequestPublic, RefundSource
from backend.modules.tickets.models import tickets
from backend.modules.tickets.schemas import TicketStatus
from backend.modules.users.user_model import EventRole, Role, event_user_roles, users
from database.database import engine

log = logging.getLogger("biletflow.refunds")

FAST_REFUND_WINDOW = timedelta(minutes=15)
FAST_REFUND_MIN_LEAD = timedelta(hours=24)
ESCALATE_AFTER = timedelta(hours=48)
REMIND_AFTER = timedelta(hours=24)
MAX_SYSTEM_ATTEMPTS = 5
STUCK_AFTER = timedelta(minutes=5)
UNKNOWN_SLOW_AFTER = timedelta(minutes=30)
UNKNOWN_ESCALATE_AFTER = timedelta(hours=24)
OPEN_EXECUTION = ("NOT_STARTED", "IN_PROGRESS")
UNFINISHED_ATTEMPT = ("PENDING", "PROCESSING", "UNKNOWN")
FAILURE_REASONS = {"FAILED": "BANK_REFUSED", "UNKNOWN": "BANK_NOT_CONFIRMED", "PENDING": "NOT_SENT"}

SIMULATED_OUTCOME = "SUCCEEDED"
SIMULATED_RECONCILE_OUTCOME = "SUCCEEDED"


def provider_refund(attempt: refunds, payment: payments) -> str:
    if is_simulated(payment):
        return SIMULATED_OUTCOME
    answer = halyk.refund(payment.provider_payment_id, attempt.provider_ref)
    if answer == halyk.NOT_SENT:
        return "NOT_SENT"
    outcome = provider_refund_status(attempt, payment)
    if outcome != "SUCCEEDED" and answer == halyk.REFUSED and _bank_status(payment) == halyk.CHARGE:
        return "FAILED"
    return outcome


def provider_refund_status(attempt: refunds, payment: payments) -> str:
    if is_simulated(payment):
        return SIMULATED_RECONCILE_OUTCOME
    return "SUCCEEDED" if _bank_status(payment) == halyk.REFUNDED else "UNKNOWN"


def _bank_status(payment: payments) -> str:
    state = halyk.lookup(payment.provider_invoice_id)
    return state.status if state.transaction_id == payment.provider_payment_id else halyk.IN_PROGRESS


def lock_order(session: Session, order_id: uuid.UUID) -> tuple[events, orders]:
    from backend.modules.orders.service import lock_order_chain
    event, order, _ = lock_order_chain(session, order_id)
    return event, order


def lock_request(session: Session, request_id: uuid.UUID) -> tuple[events, orders, refund_requests]:
    snapshot = session.get(refund_requests, request_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Refund request not found")
    event, order = lock_order(session, snapshot.order_id)
    request = session.exec(select(refund_requests).where(refund_requests.id == request_id).with_for_update().execution_options(populate_existing=True)).one()
    return event, order, request


def succeeded_payment(session: Session, order_id: uuid.UUID) -> payments | None:
    return session.exec(select(payments).where(payments.order_id == order_id, payments.status == PaymentStatus.SUCCEEDED)).first()


def open_request(session: Session, order_id: uuid.UUID) -> refund_requests | None:
    return session.exec(select(refund_requests).where(refund_requests.order_id == order_id, or_(
        refund_requests.status.in_(("PENDING", "PENDING_ADMIN")),
        and_(refund_requests.status == "APPROVED", refund_requests.execution_status.in_(OPEN_EXECUTION)),
    ))).first()


def is_refunded(session: Session, order_id: uuid.UUID) -> bool:
    return session.exec(select(refunds.id).where(refunds.order_id == order_id, refunds.status == "SUCCEEDED")).first() is not None


def is_checkin_blocked(session: Session, order_id: uuid.UUID) -> bool:
    return session.exec(select(refund_requests.id).where(refund_requests.order_id == order_id, refund_requests.status == "APPROVED",
                                                         refund_requests.execution_status.in_(OPEN_EXECUTION))).first() is not None


def has_checked_in(session: Session, order_id: uuid.UUID) -> bool:
    return session.exec(select(tickets.id).where(tickets.order_id == order_id, tickets.status == TicketStatus.CHECKED_IN)).first() is not None


def ensure_refundable(session: Session, order: orders, allow_checked_in: bool) -> payments:
    if order.status != OrderStatus.CONFIRMED or order.total_minor <= 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only confirmed paid orders can be refunded")
    payment = succeeded_payment(session, order.id)
    if payment is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No successful payment for this order")
    if is_refunded(session, order.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Order is already refunded")
    if open_request(session, order.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A refund for this order is already in progress")
    if not allow_checked_in and has_checked_in(session, order.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Tickets of this order were already used")
    return payment


def policy_deadline(event: events, order: orders) -> datetime | None:
    hours = (order.refund_policy_snapshot or {}).get("self_service_refund_until_hours_before_start")
    if not isinstance(hours, int) or hours < 0:
        return None
    return as_aware(event.starts_at) - timedelta(hours=hours)


def fast_refund_available(event: events, order: orders, now: datetime) -> bool:
    return (order.confirmed_at is not None and now - as_aware(order.confirmed_at) <= FAST_REFUND_WINDOW
            and as_aware(event.starts_at) - now >= FAST_REFUND_MIN_LEAD)


def eligibility(session: Session, event: events, order: orders, now: datetime) -> RefundEligibility:
    deadline = policy_deadline(event, order)
    try:
        ensure_refundable(session, order, allow_checked_in=False)
    except HTTPException as exc:
        return RefundEligibility(eligible=False, fast_refund=False, reason=exc.detail, deadline=deadline)
    if event.status == EventLifecycleStatus.CANCELLED:
        return RefundEligibility(eligible=False, fast_refund=False, reason="Event is cancelled; refund is issued automatically", deadline=None)
    if fast_refund_available(event, order, now):
        return RefundEligibility(eligible=True, fast_refund=True, reason=None, deadline=as_aware(order.confirmed_at) + FAST_REFUND_WINDOW)
    if now >= as_aware(event.starts_at):
        return RefundEligibility(eligible=False, fast_refund=False, reason="Event has already started", deadline=deadline)
    if deadline is None:
        return RefundEligibility(eligible=False, fast_refund=False, reason="The organizer does not offer voluntary refunds; contact support", deadline=None)
    if now > deadline:
        return RefundEligibility(eligible=False, fast_refund=False, reason="Refund deadline has passed", deadline=deadline)
    return RefundEligibility(eligible=True, fast_refund=False, reason=None, deadline=deadline)


def organizer_id(session: Session, event_id: uuid.UUID) -> uuid.UUID | None:
    return session.exec(select(event_user_roles.user_id).where(event_user_roles.event_id == event_id, event_user_roles.event_role == EventRole.ORGANIZER)).first()


def admin_ids(session: Session) -> list[uuid.UUID]:
    return list(session.exec(select(users.id).where(users.personal_role == Role.PLATFORM_ADMIN, users.is_suspended.is_(False))).all())


def organizer_email(session: Session, user_id: uuid.UUID) -> list[notify.Email]:
    owner = session.get(users, user_id)
    return [notify.Email(address=owner.email, user_id=owner.id)]


def notify_buyer(session: Session, order: orders, key: str, event_type: str, title: str, body: str) -> None:
    buyer = session.get(users, order.buyer_user_id)
    notify.publish(session, notify.Notice(key=key, event_type=event_type, aggregate_type="ORDER", aggregate_id=order.id, title=title, body=body,
                                          action_url=f"{FRONTEND_URL}/orders/{order.id}", inbox_user_ids=[buyer.id],
                                          emails=[notify.Email(address=buyer.email, user_id=buyer.id)]))


def create_request(session: Session, order: orders, source: RefundSource, now: datetime, *, requested_by: uuid.UUID | None, approved_by: uuid.UUID | None = None,
                   approved: bool = True, reason_code: str | None = None, comment: str | None = None, change_request_id: uuid.UUID | None = None,
                   pending_status: str = "PENDING") -> refund_requests:
    request = refund_requests(order_id=order.id, requested_by_user_id=requested_by, source=source.value, status="APPROVED" if approved else pending_status,
                              execution_status="NOT_STARTED" if approved else None, reason_code=reason_code, comment=(comment or "").strip() or None,
                              event_change_request_id=change_request_id, reviewed_by_user_id=approved_by if approved else None, reviewed_at=now if approved else None)
    session.add(request)
    session.flush()
    action = "REFUND_APPROVED" if approved else "REFUND_REQUESTED"
    audit.record(session, action=action, entity_type="REFUND_REQUEST", entity_id=request.id, event_id=order.event_id, actor_user_id=approved_by or requested_by,
                 details={"order_number": order.order_number, "source": source.value})
    if approved:
        notify_buyer(session, order, f"REFUND_APPROVED:{request.id}", "REFUND_APPROVED", "Refund approved",
                     f"A full refund for order {order.order_number} was approved and is being processed.")
    else:
        owner = organizer_id(session, order.event_id)
        if owner and pending_status == "PENDING":
            notify.publish(session, notify.Notice(key=f"REFUND_REQUESTED:{request.id}", event_type="REFUND_REQUESTED", aggregate_type="REFUND_REQUEST", aggregate_id=request.id,
                                                  title="New refund request", body=f"Refund requested for order {order.order_number}.",
                                                  action_url=f"{FRONTEND_URL}/events/{order.event_id}/refunds", inbox_user_ids=[owner], emails=organizer_email(session, owner)))
        elif pending_status == "PENDING_ADMIN":
            notify.publish(session, notify.Notice(key=f"REFUND_NEEDS_ADMIN:{request.id}", event_type="REFUND_ESCALATED", aggregate_type="REFUND_REQUEST", aggregate_id=request.id,
                                                  title="Refund needs review", body=f"Refund for order {order.order_number} needs an administrator decision.",
                                                  inbox_user_ids=admin_ids(session)))
    return request


def approve(session: Session, order: orders, request: refund_requests, reviewer_id: uuid.UUID, now: datetime) -> None:
    request.status = "APPROVED"
    request.execution_status = "NOT_STARTED"
    request.reviewed_by_user_id = reviewer_id
    request.reviewed_at = now
    session.add(request)
    audit.record(session, action="REFUND_APPROVED", entity_type="REFUND_REQUEST", entity_id=request.id, event_id=order.event_id, actor_user_id=reviewer_id,
                 details={"order_number": order.order_number, "source": request.source})
    notify_buyer(session, order, f"REFUND_APPROVED:{request.id}", "REFUND_APPROVED", "Refund approved",
                 f"A full refund for order {order.order_number} was approved and is being processed.")


def reject(session: Session, order: orders, request: refund_requests, reviewer_id: uuid.UUID, comment: str, now: datetime) -> None:
    request.status = "REJECTED"
    request.reviewed_by_user_id = reviewer_id
    request.reviewed_at = now
    session.add(request)
    audit.record(session, action="REFUND_REJECTED", entity_type="REFUND_REQUEST", entity_id=request.id, event_id=order.event_id, actor_user_id=reviewer_id,
                 details={"order_number": order.order_number, "comment": comment})
    notify_buyer(session, order, f"REFUND_REJECTED:{request.id}", "REFUND_REJECTED", "Refund rejected",
                 f"The refund request for order {order.order_number} was rejected: {comment}")


def escalates_at(request: refund_requests) -> datetime | None:
    return as_aware(request.created_at) + ESCALATE_AFTER if request.status == "PENDING" else None


def request_number(request_id: uuid.UUID) -> str:
    return f"BF-RR-{request_id.hex[:8].upper()}"


def to_public(session: Session, request: refund_requests) -> RefundRequestPublic:
    order = session.get(orders, request.order_id)
    attempts = session.exec(select(refunds).where(refunds.refund_request_id == request.id).order_by(refunds.created_at)).all()
    return RefundRequestPublic(id=request.id, request_number=request_number(request.id), order_id=order.id, order_number=order.order_number, event_id=order.event_id, source=request.source, status=request.status,
                               execution_status=request.execution_status, reason_code=request.reason_code, comment=request.comment, amount_minor=order.total_minor,
                               created_at=request.created_at, reviewed_at=request.reviewed_at, execution_finalized_at=request.execution_finalized_at,
                               escalates_at=escalates_at(request),
                               attempts=[RefundAttemptPublic(id=a.id, amount_minor=a.amount_minor, status=a.status, attempt_actor=a.attempt_actor, created_at=a.created_at,
                                                             finalized_at=a.finalized_at) for a in attempts])


def to_admin(session: Session, rows: list[refund_requests]) -> list[AdminRefundRequest]:
    ids, order_ids = [r.id for r in rows], {r.order_id for r in rows}
    found = {order.id: (order, event) for order, event in session.exec(select(orders, events).join(events, events.id == orders.event_id).where(orders.id.in_(order_ids))).all()}
    refs = event_refs(session, [event.id for _, event in found.values()])
    buyers = people(session, [order.buyer_user_id for order, _ in found.values()])
    attempts: dict[uuid.UUID, list[AdminRefundAttempt]] = {}
    for a in session.exec(select(refunds).where(refunds.refund_request_id.in_(ids)).order_by(refunds.created_at, refunds.id)).all():
        attempts.setdefault(a.refund_request_id, []).append(AdminRefundAttempt(
            id=a.id, amount_minor=a.amount_minor, status=a.status, attempt_actor=a.attempt_actor, created_at=a.created_at, finalized_at=a.finalized_at,
            provider_ref=a.provider_ref, failure_reason=FAILURE_REASONS.get(a.status), next_check_at=a.next_check_at, next_retry_at=a.next_retry_at))
    counts: dict[uuid.UUID, dict[TicketStatus, int]] = {}
    for order_id, ticket_status, number in session.exec(select(tickets.order_id, tickets.status, func.count()).where(tickets.order_id.in_(order_ids))
                                                        .group_by(tickets.order_id, tickets.status)).all():
        counts.setdefault(order_id, {})[ticket_status] = number
    escalated = dict(session.exec(select(audit_logs.entity_id, audit_logs.created_at).where(audit_logs.entity_id.in_(ids), audit_logs.action_type == "REFUND_ESCALATED")).all())
    result = []
    for r in rows:
        order, event = found[r.order_id]
        ref, (name, email) = refs[event.id], buyers[order.buyer_user_id]
        created, voluntary = as_aware(r.created_at), r.source == RefundSource.CUSTOMER.value
        own = counts.get(order.id, {})
        result.append(AdminRefundRequest(
            id=r.id, request_number=request_number(r.id), order_id=order.id, order_number=order.order_number, event_id=event.id, source=r.source, status=r.status,
            execution_status=r.execution_status, reason_code=r.reason_code, comment=r.comment, amount_minor=order.total_minor, created_at=r.created_at,
            reviewed_at=r.reviewed_at, execution_finalized_at=r.execution_finalized_at, escalates_at=escalates_at(r), event_title=ref.title, event_public_id=ref.public_id,
            organizer_name=ref.organizer_name, buyer_name=name, buyer_email=email, refund_policy=order.refund_policy_snapshot or {},
            refund_deadline=policy_deadline(event, order), tickets_total=sum(own.values()), tickets_checked_in=own.get(TicketStatus.CHECKED_IN, 0),
            reminder_at=created + REMIND_AFTER if voluntary else None, escalation_at=created + ESCALATE_AFTER if voluntary else None,
            escalated_at=escalated.get(r.id), attempts=attempts.get(r.id, [])))
    return result


def check_attempt(session: Session, request_id: uuid.UUID) -> None:
    attempt = session.exec(select(refunds).where(refunds.refund_request_id == request_id).order_by(refunds.created_at.desc(), refunds.id).limit(1)).first()
    if attempt is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The refund was not sent to the bank yet")
    attempt_id, stuck = attempt.id, as_aware(attempt.updated_at) <= db_now(session) - STUCK_AFTER
    if attempt.status == "PROCESSING" and not stuck:
        raise HTTPException(status.HTTP_409_CONFLICT, "The bank is still processing this refund, please try again in a few minutes")
    unresolved = attempt.status in ("UNKNOWN", "PROCESSING")
    session.rollback()
    if unresolved:
        _execute(attempt_id, reconcile=True)


def _attempt_actor(request: refund_requests, manual_admin: bool) -> str:
    if manual_admin or request.source == RefundSource.PLATFORM_ADMIN.value:
        return "PLATFORM_ADMIN"
    if request.source == RefundSource.ORGANIZER_INITIATED.value:
        return "ORGANIZER"
    return "SYSTEM"


def start_attempt(session: Session, order: orders, request: refund_requests, now: datetime, manual_admin: bool = False) -> refunds | None:
    if request.status != "APPROVED" or request.execution_status not in OPEN_EXECUTION:
        return None
    history = session.exec(select(refunds).where(refunds.refund_request_id == request.id).order_by(refunds.created_at)).all()
    if any(a.status in UNFINISHED_ATTEMPT or a.status == "SUCCEEDED" for a in history):
        return None
    if history and not manual_admin:
        last = history[-1]
        if request.source not in MANDATORY_SOURCES or last.next_retry_at is None or as_aware(last.next_retry_at) > now:
            return None
        if sum(a.attempt_actor == "SYSTEM" for a in history) >= MAX_SYSTEM_ATTEMPTS:
            return None
    if session.exec(select(refunds.id).where(refunds.order_id == order.id, refunds.status.in_(UNFINISHED_ATTEMPT + ("SUCCEEDED",)))).first() is not None:
        return None
    payment = succeeded_payment(session, order.id)
    if payment is None:
        return None
    attempt = refunds(refund_request_id=request.id, order_id=order.id, payment_id=payment.id, amount_minor=payment.amount_minor, status="PROCESSING",
                      attempt_actor=_attempt_actor(request, manual_admin), provider_ref=("SIMREF-" if is_simulated(payment) else "BFREF-") + secrets.token_hex(8).upper(),
                      idempotency_key=f"refund:{request.id}:{len(history) + 1}")
    for previous in history:
        previous.next_retry_at = None
        session.add(previous)
    session.add(attempt)
    request.execution_status = "IN_PROGRESS"
    session.add(request)
    session.flush()
    return attempt


def _finalize(session: Session, attempt_id: uuid.UUID, outcome: str) -> None:
    snapshot = session.get(refunds, attempt_id)
    event, order, request = lock_request(session, snapshot.refund_request_id)
    attempt = session.exec(select(refunds).where(refunds.id == attempt_id).with_for_update().execution_options(populate_existing=True)).one()
    if attempt.status not in UNFINISHED_ATTEMPT:
        session.rollback()
        return
    now = db_now(session)
    if outcome in ("UNKNOWN", "NOT_SENT"):
        attempt.status = "PENDING" if outcome == "NOT_SENT" else "UNKNOWN"
        age = now - as_aware(attempt.created_at)
        attempt.next_check_at = now + (timedelta(minutes=1) if age < UNKNOWN_SLOW_AFTER else UNKNOWN_SLOW_AFTER)
        session.add(attempt)
        if age >= UNKNOWN_ESCALATE_AFTER:
            notify.publish(session, notify.Notice(key=f"REFUND_UNKNOWN:{attempt.id}", event_type="REFUND_ESCALATED", aggregate_type="REFUND_REQUEST",
                                                  aggregate_id=request.id, title="Refund result is unknown",
                                                  body=f"The bank has not confirmed the refund for order {order.order_number}. Check it in the bank cabinet.",
                                                  inbox_user_ids=admin_ids(session)))
        session.commit()
        return
    attempt.status = outcome
    attempt.finalized_at = now
    attempt.next_check_at = None
    session.add(attempt)
    if outcome == "SUCCEEDED":
        request.execution_status = "SUCCEEDED"
        request.execution_finalized_at = now
        for ticket in session.exec(select(tickets).where(tickets.order_id == order.id, tickets.status.in_((TicketStatus.VALID, TicketStatus.CHECKED_IN)))
                                   .order_by(tickets.id).with_for_update()).all():
            ticket.status = TicketStatus.REFUNDED
            session.add(ticket)
            audit.record(session, action="TICKET_INVALIDATED", entity_type="TICKET", entity_id=ticket.id, event_id=order.event_id)
        audit.record(session, action="REFUND_SUCCEEDED", entity_type="REFUND", entity_id=attempt.id, event_id=order.event_id,
                     details={"order_number": order.order_number, "amount_minor": attempt.amount_minor})
        notify_buyer(session, order, f"REFUND_SUCCEEDED:{request.id}", "REFUND_SUCCEEDED", "Refund completed",
                     f"The refund for order {order.order_number} was completed.")
    elif request.source in MANDATORY_SOURCES:
        system_attempts = session.exec(select(func.count()).select_from(refunds).where(refunds.refund_request_id == request.id, refunds.attempt_actor == "SYSTEM")).one()
        if system_attempts < MAX_SYSTEM_ATTEMPTS:
            attempt.next_retry_at = now + timedelta(minutes=2 ** system_attempts)
        else:
            notify.publish(session, notify.Notice(key=f"REFUND_RETRIES_EXHAUSTED:{request.id}", event_type="REFUND_ESCALATED", aggregate_type="REFUND_REQUEST",
                                                  aggregate_id=request.id, title="Mandatory refund failing", body=f"Refund for order {order.order_number} failed {system_attempts} times.",
                                                  inbox_user_ids=admin_ids(session)))
    else:
        request.execution_status = "FAILED_FINAL"
        request.execution_finalized_at = now
        audit.record(session, action="REFUND_FAILED_FINAL", entity_type="REFUND_REQUEST", entity_id=request.id, event_id=order.event_id,
                     details={"order_number": order.order_number})
        notify_buyer(session, order, f"REFUND_FAILED:{request.id}", "REFUND_FAILED", "Refund failed",
                     f"The refund for order {order.order_number} could not be completed. Please contact support.")
        owner = organizer_id(session, order.event_id)
        if owner:
            notify.publish(session, notify.Notice(key=f"REFUND_FAILED_ORG:{request.id}", event_type="REFUND_FAILED", aggregate_type="REFUND_REQUEST", aggregate_id=request.id,
                                                  title="Refund failed", body=f"Refund for order {order.order_number} failed.", inbox_user_ids=[owner],
                                                  emails=organizer_email(session, owner)))
        if event.status == EventLifecycleStatus.CANCELLED:
            session.flush()
            create_request(session, order, RefundSource.EVENT_CANCELLATION, now, requested_by=None, approved=False, pending_status="PENDING_ADMIN")
    session.add(attempt)
    session.add(request)
    session.commit()


def _execute(attempt_id: uuid.UUID, reconcile: bool = False) -> None:
    with Session(engine, expire_on_commit=False) as session:
        attempt = session.get(refunds, attempt_id)
        payment = session.get(payments, attempt.payment_id)
        session.commit()
    try:
        outcome = provider_refund_status(attempt, payment) if reconcile else provider_refund(attempt, payment)
    except Exception:
        log.warning("refund attempt %s bank request failed", attempt_id, exc_info=True)
        outcome = "UNKNOWN"
    with Session(engine) as session:
        _finalize(session, attempt_id, outcome)


def resend(attempt_id: uuid.UUID) -> bool:
    with Session(engine) as session:
        attempt = session.exec(select(refunds).where(refunds.id == attempt_id).with_for_update().execution_options(populate_existing=True)).one()
        if attempt.status != "PENDING":
            return False
        attempt.status = "PROCESSING"
        session.add(attempt)
        session.commit()
    _execute(attempt_id)
    return True


def run_request(request_id: uuid.UUID, manual_admin: bool = False) -> bool:
    with Session(engine) as session:
        _, order, request = lock_request(session, request_id)
        attempt = start_attempt(session, order, request, db_now(session), manual_admin)
        if attempt is None:
            session.rollback()
            return False
        attempt_id = attempt.id
        session.commit()
    _execute(attempt_id)
    return True


def due_request_ids(session: Session, now: datetime, limit: int) -> list[uuid.UUID]:
    fresh = session.exec(select(refund_requests.id).where(refund_requests.status == "APPROVED", refund_requests.execution_status == "NOT_STARTED")
                         .order_by(refund_requests.reviewed_at).limit(limit)).all()
    retry = session.exec(
        select(refunds.refund_request_id).join(refund_requests, refund_requests.id == refunds.refund_request_id)
        .where(refund_requests.execution_status == "IN_PROGRESS", refund_requests.source.in_(MANDATORY_SOURCES), refunds.status == "FAILED",
               refunds.next_retry_at.is_not(None), refunds.next_retry_at <= now)
        .order_by(refunds.next_retry_at).limit(limit)
    ).all()
    return list(dict.fromkeys([*fresh, *retry]))


def process_due(limit: int = 50) -> int:
    with Session(engine) as session:
        now = db_now(session)
        request_ids = due_request_ids(session, now, limit)
        to_reconcile = session.exec(select(refunds.id).where(or_(
            and_(refunds.status == "UNKNOWN", refunds.next_check_at <= now),
            and_(refunds.status == "PROCESSING", refunds.updated_at <= now - STUCK_AFTER),
        )).limit(limit)).all()
        unsent = session.exec(select(refunds.id).where(refunds.status == "PENDING", refunds.next_check_at <= now).limit(limit)).all()
    handled = 0
    for request_id in request_ids:
        try:
            handled += run_request(request_id)
        except Exception:
            log.exception("refund request %s failed", request_id)
    for attempt_id in unsent:
        try:
            handled += resend(attempt_id)
        except Exception:
            log.exception("refund attempt %s resend failed", attempt_id)
    for attempt_id in to_reconcile:
        try:
            _execute(attempt_id, reconcile=True)
            handled += 1
        except Exception:
            log.exception("refund attempt %s reconciliation failed", attempt_id)
    return handled


def escalate_overdue() -> int:
    handled = 0
    with Session(engine) as session:
        now = db_now(session)
        pending = session.exec(select(refund_requests.id, refund_requests.created_at).where(refund_requests.status == "PENDING", refund_requests.created_at <= now - REMIND_AFTER)).all()
    for request_id, created_at in pending:
        with Session(engine) as session:
            _, order, request = lock_request(session, request_id)
            now = db_now(session)
            if request.status != "PENDING":
                session.rollback()
                continue
            if as_aware(request.created_at) <= now - ESCALATE_AFTER:
                request.status = "PENDING_ADMIN"
                session.add(request)
                audit.record(session, action="REFUND_ESCALATED", entity_type="REFUND_REQUEST", entity_id=request.id, event_id=order.event_id,
                             details={"order_number": order.order_number})
                notify.publish(session, notify.Notice(key=f"REFUND_NEEDS_ADMIN:{request.id}", event_type="REFUND_ESCALATED", aggregate_type="REFUND_REQUEST",
                                                      aggregate_id=request.id, title="Refund needs review",
                                                      body=f"Organizer did not decide on the refund for order {order.order_number} within 48 hours.", inbox_user_ids=admin_ids(session)))
            else:
                owner = organizer_id(session, order.event_id)
                if owner:
                    notify.publish(session, notify.Notice(key=f"REFUND_REMINDER:{request.id}", event_type="REFUND_REMINDER", aggregate_type="REFUND_REQUEST",
                                                          aggregate_id=request.id, title="Refund decision pending",
                                                          body=f"Please decide on the refund request for order {order.order_number}.", inbox_user_ids=[owner],
                                                          emails=organizer_email(session, owner)))
            session.commit()
            handled += 1
    return handled
