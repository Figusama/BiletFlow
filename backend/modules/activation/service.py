import logging
import uuid
from datetime import timedelta

from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import FRONTEND_URL, PAYMENT_CHECK_INTERVAL_SECONDS
from backend.modules.audit import service as audit
from backend.modules.events.access import get_event_or_404
from backend.modules.events.models import events
from backend.modules.notifications import service as notify
from backend.modules.payments import bank, halyk
from backend.modules.payments.activation import get_activation
from backend.modules.payments.models import activation_fee_payments, paid_sales_activations
from backend.modules.payments.schemas import ActivationStatus
from backend.modules.users.user_model import EventRole, event_user_roles, users
from database.database import engine

log = logging.getLogger("biletflow.activation")

UNFINISHED_FEE = ("PENDING", "PROCESSING", "UNKNOWN")


def organizer_of(session: Session, event_id: uuid.UUID) -> uuid.UUID | None:
    return session.exec(select(event_user_roles.user_id).where(event_user_roles.event_id == event_id, event_user_roles.event_role == EventRole.ORGANIZER)).first()


def notify_organizer(session: Session, event: events, key: str, event_type: str, title: str, body: str) -> None:
    owner_id = organizer_of(session, event.id)
    owner = session.get(users, owner_id) if owner_id else None
    if owner is None:
        return
    notify.publish(session, notify.Notice(key=key, event_type=event_type, aggregate_type="EVENT", aggregate_id=event.id, title=title, body=body,
                                          action_url=f"{FRONTEND_URL}/events/{event.id}/paid-sales", inbox_user_ids=[owner.id],
                                          emails=[notify.Email(address=owner.email, user_id=owner.id)]))


def lock_fee(session: Session, payment_id: uuid.UUID) -> tuple[events, paid_sales_activations, activation_fee_payments]:
    snapshot = session.get(activation_fee_payments, payment_id)
    event_id = session.get(paid_sales_activations, snapshot.activation_id).event_id
    event = get_event_or_404(session, event_id, for_update=True)
    activation = get_activation(session, event.id, lock=True)
    payment = session.exec(select(activation_fee_payments).where(activation_fee_payments.id == payment_id).with_for_update().execution_options(populate_existing=True)).one()
    return event, activation, payment


def settle_fee(session: Session, event: events, activation: paid_sales_activations, payment: activation_fee_payments, outcome: str, now, actor_user_id: uuid.UUID | None = None) -> None:
    payment.status = outcome
    payment.finalized_at = now if outcome in ("SUCCEEDED", "FAILED") else None
    payment.next_check_at = None if payment.finalized_at else now + timedelta(seconds=PAYMENT_CHECK_INTERVAL_SECONDS)
    session.add(payment)
    if outcome != "SUCCEEDED":
        return
    audit.record(session, action="ACTIVATION_FEE_PAID", entity_type="ACTIVATION_FEE", entity_id=payment.id, event_id=event.id, actor_user_id=actor_user_id)
    if activation.status != ActivationStatus.FEE_PENDING or not bank.event_open(event):
        bank.incident(session, event_id=event.id, entity_type="ACTIVATION_FEE", entity_id=payment.id, code="FEE_AFTER_CLOSE",
                      message=f"Activation fee for \"{event.title}\" was paid, but paid sales could not be activated.")
        return
    activation.status = ActivationStatus.ACTIVE
    activation.activated_at = now
    session.add(activation)
    notify_organizer(session, event, f"PSA_ACTIVATED:{activation.id}", "PAID_SALES_ACTIVATED", "Paid sales activated",
                     f"Paid ticket sales are now available for \"{event.title}\".")
    audit.record(session, action="PAID_SALES_ACTIVATED", entity_type="PAID_SALES_ACTIVATION", entity_id=activation.id, event_id=event.id,
                 actor_user_id=actor_user_id, details={"fee_payment_id": str(payment.id), "amount_minor": payment.amount_minor})


def _apply(session: Session, payment_id: uuid.UUID, state: halyk.BankState, last: tuple[str, str] | None) -> str | None:
    event, activation, payment = lock_fee(session, payment_id)
    now = db_now(session)
    held = state.status in (halyk.AUTH, halyk.CHARGE)
    if held and not state.matches(payment.amount_minor, payment.currency):
        bank.incident(session, event_id=event.id, entity_type="ACTIVATION_FEE", entity_id=payment.id, code="BANK_MISMATCH",
                      message=f"The bank reports a different amount, currency or terminal for the activation fee of \"{event.title}\".")
        if payment.status in UNFINISHED_FEE:
            payment.next_check_at = now + bank.MAX_BACKOFF
            session.add(payment)
        session.commit()
        return None
    if payment.status not in UNFINISHED_FEE:
        if payment.status == "FAILED" and held:
            bank.incident(session, event_id=event.id, entity_type="ACTIVATION_FEE", entity_id=payment.id, code="LATE_FEE",
                          message=f"The bank accepted an activation fee for \"{event.title}\" after the attempt was closed.")
        session.commit()
        return "cancel" if payment.status == "FAILED" and state.status == halyk.AUTH and not last else None
    action = None
    if state.status == halyk.CHARGE:
        settle_fee(session, event, activation, payment, "SUCCEEDED", now)
    elif state.status in (halyk.RELEASED, halyk.REFUNDED) or (state.status == halyk.DECLINED and payment.status != "PENDING"):
        settle_fee(session, event, activation, payment, "FAILED", now)
    elif state.status == halyk.AUTH:
        action = _next_fee_action(event, activation, payment, now, last)
        if last is not None and last[0] == "charge" and last[1] != halyk.REFUSED:
            payment.status = "UNKNOWN"
        elif action == "charge":
            payment.status = "PROCESSING"
        if action is not None or last is not None:
            payment.next_check_at = now + bank.OPERATION_LEASE
        session.add(payment)
    elif payment.status == "PENDING" and now - as_aware(payment.created_at) >= bank.PAYMENT_WINDOW and bank.unpaid(state):
        settle_fee(session, event, activation, payment, "FAILED", now)
    else:
        payment.next_check_at = now + timedelta(seconds=PAYMENT_CHECK_INTERVAL_SECONDS)
        session.add(payment)
    session.commit()
    return action


def _next_fee_action(event: events, activation: paid_sales_activations, payment: activation_fee_payments, now, last: tuple[str, str] | None) -> str | None:
    if last is not None:
        return "cancel" if last == ("charge", halyk.REFUSED) else None
    if payment.status != "PENDING" and payment.next_check_at is not None and as_aware(payment.next_check_at) > now:
        return None
    return "charge" if activation.status == ActivationStatus.FEE_PENDING and bank.event_open(event) else "cancel"


def sync_fee(session: Session, payment_id: uuid.UUID) -> bool:
    snapshot = session.get(activation_fee_payments, payment_id)
    if snapshot is None or snapshot.payment_mode != "SANDBOX":
        return False
    invoice = snapshot.provider_operation_ref
    session.commit()
    last: tuple[str, str] | None = None
    for _ in range(bank.MAX_STEPS):
        try:
            state = halyk.lookup(invoice)
        except halyk.HalykError as exc:
            log.warning("activation fee %s status check failed: %s", payment_id, exc)
            _, _, payment = lock_fee(session, payment_id)
            if payment.status in UNFINISHED_FEE:
                payment.next_check_at = db_now(session) + bank.OPERATION_LEASE
                session.add(payment)
            session.commit()
            return False
        action = _apply(session, payment_id, state, last)
        if action is None:
            break
        last = (action, halyk.charge(state.transaction_id) if action == "charge" else halyk.cancel(state.transaction_id))
    return session.get(activation_fee_payments, payment_id).status not in UNFINISHED_FEE


def process_due_fees(limit: int = 50) -> int:
    with Session(engine) as session:
        ids = session.exec(select(activation_fee_payments.id).where(activation_fee_payments.payment_mode == "SANDBOX", activation_fee_payments.status.in_(UNFINISHED_FEE),
                                                                    activation_fee_payments.next_check_at <= db_now(session)).limit(limit)).all()
    handled = 0
    for payment_id in ids:
        with Session(engine) as session:
            try:
                sync_fee(session, payment_id)
                handled += 1
            except Exception:
                log.exception("activation fee %s reconciliation failed", payment_id)
    return handled
