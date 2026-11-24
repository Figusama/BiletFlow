import secrets
import uuid
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.core import crypto
from backend.core.clock import as_aware, db_now
from backend.core.config import ACTIVATION_FEE_MINOR, FRONTEND_URL, PAID_SALES_TERMS_VERSION, PAYMENT_SIMULATOR_ENABLED, PUBLIC_API_URL
from backend.modules.activation.schemas import (ActivationPublic, ActivationRequestCreate, CurrentTerms, FeeDecision, FeeOutcome, FeePaymentCreate,
                                                FeePaymentPublic, RejectRequest, RequestPublic, SuspendRequest)
from backend.modules.activation.service import UNFINISHED_FEE, lock_fee, notify_organizer, settle_fee, sync_fee
from backend.modules.admin.router import require_admin
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import get_event_or_404, require_event_role, require_organizer
from backend.modules.events.models import events
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.notifications import service as notify
from backend.modules.payments import bank, halyk, pages
from backend.modules.payments.activation import get_activation
from backend.modules.payments.models import activation_fee_payments, paid_sales_activation_requests, paid_sales_activations, payout_accounts
from backend.modules.payments.schemas import ActivationStatus
from backend.modules.users.user_model import EventRole, Role, event_user_roles, users
from database.database import get_session

router = APIRouter(tags=["paid sales"])

FEE_PAGE_TTL = timedelta(minutes=30)


def mask(value: str, keep: int = 4) -> str:
    return "*" * max(len(value) - keep, 0) + value[-keep:]


def ensure_event_open(event: events) -> None:
    if event.status in (EventLifecycleStatus.CANCELLED, EventLifecycleStatus.COMPLETED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is already finished or cancelled")


def request_to_public(session: Session, request: paid_sales_activation_requests) -> RequestPublic:
    activation = session.get(paid_sales_activations, request.activation_id)
    event = session.get(events, activation.event_id)
    return RequestPublic(id=request.id, event_id=event.id, event_title=event.title, status=request.status, verification_snapshot=request.verification_snapshot,
                         terms_version=request.terms_version, submitted_at=request.submitted_at, reviewed_at=request.reviewed_at, rejection_reason=request.rejection_reason)


def fee_to_public(payment: activation_fee_payments) -> FeePaymentPublic:
    unfinished = payment.status in UNFINISHED_FEE and payment.payment_mode == "SIMULATION"
    payable = payment.status == "PENDING" and payment.payment_mode == "SANDBOX"
    return FeePaymentPublic(id=payment.id, amount_minor=payment.amount_minor, currency=payment.currency, status=payment.status, payment_mode=payment.payment_mode,
                            provider_operation_ref=payment.provider_operation_ref, created_at=payment.created_at, finalized_at=payment.finalized_at,
                            simulator_url=f"{FRONTEND_URL}/paid-sales/fee-payments/{payment.id}/simulator" if unfinished else None,
                            payment_url=f"{PUBLIC_API_URL}/paid-sales/fee-payments/{payment.id}/halyk" if payable else None)


def activation_to_public(session: Session, event_id: uuid.UUID) -> ActivationPublic:
    activation = get_activation(session, event_id)
    if activation is None:
        return ActivationPublic(event_id=event_id, status=ActivationStatus.NOT_REQUESTED.value, fee_amount_minor=ACTIVATION_FEE_MINOR, fee_currency="KZT",
                                paid_terms_version=None, activated_at=None, suspended_at=None, requests=[], fee_payments=[])
    requests = session.exec(select(paid_sales_activation_requests).where(paid_sales_activation_requests.activation_id == activation.id)
                            .order_by(paid_sales_activation_requests.submitted_at.desc())).all()
    fees = session.exec(select(activation_fee_payments).where(activation_fee_payments.activation_id == activation.id)
                        .order_by(activation_fee_payments.created_at.desc())).all()
    return ActivationPublic(event_id=event_id, status=activation.status.value, fee_amount_minor=activation.fee_amount_minor or ACTIVATION_FEE_MINOR,
                            fee_currency=activation.fee_currency, paid_terms_version=activation.paid_terms_version, activated_at=activation.activated_at,
                            suspended_at=activation.suspended_at, requests=[request_to_public(session, r) for r in requests], fee_payments=[fee_to_public(f) for f in fees])


@router.get("/paid-sales/terms/current", response_model=CurrentTerms)
def current_terms():
    return CurrentTerms(version=PAID_SALES_TERMS_VERSION, fee_amount_minor=ACTIVATION_FEE_MINOR, fee_currency="KZT")


@router.get("/events/{event_id}/paid-sales", response_model=ActivationPublic)
def read_activation(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_event_role(session, event_id, current_user, (EventRole.ORGANIZER,))
    return activation_to_public(session, event_id)


@router.post("/events/{event_id}/paid-sales/requests", response_model=ActivationPublic, status_code=status.HTTP_201_CREATED)
def submit_request(event_id: uuid.UUID, data: ActivationRequestCreate, background: BackgroundTasks, session: Session = Depends(get_session),
                   current_user: users = Depends(get_current_user)):
    require_event_role(session, event_id, current_user, (EventRole.ORGANIZER,), allow_platform_admin=False)
    if not data.accept_paid_terms:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Paid sales terms must be accepted")
    event = get_event_or_404(session, event_id, for_update=True)
    ensure_event_open(event)
    activation = get_activation(session, event.id, lock=True)
    if activation is None:
        activation = paid_sales_activations(event_id=event.id, status=ActivationStatus.PENDING_VERIFICATION)
        session.add(activation)
        try:
            with session.begin_nested():
                session.flush()
        except IntegrityError:
            activation = get_activation(session, event.id, lock=True)
    if activation.status != ActivationStatus.PENDING_VERIFICATION:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Paid sales are already {activation.status.value}")
    pending = session.exec(select(paid_sales_activation_requests.id).where(paid_sales_activation_requests.activation_id == activation.id,
                                                                           paid_sales_activation_requests.status == "PENDING")).first()
    if pending is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A verification request is already under review")
    now = db_now(session)
    payout = data.payout
    account = payout_accounts(owner_user_id=current_user.id, owner_type=payout.owner_type.value, owner_name=payout.owner_name.strip(),
                              identifier_encrypted=crypto.encrypt(payout.identifier), responsible_person_name=payout.responsible_person_name.strip(),
                              contact_email=payout.contact_email, contact_phone=payout.contact_phone.strip(), iban_encrypted=crypto.encrypt(payout.iban),
                              bank_name=payout.bank_name.strip(), account_holder_name=payout.account_holder_name.strip())
    session.add(account)
    session.flush()
    snapshot = {"owner_type": payout.owner_type.value, "owner_name": account.owner_name, "identifier_masked": mask(payout.identifier),
                "iban_masked": mask(payout.iban), "bank_name": account.bank_name, "account_holder_name": account.account_holder_name,
                "responsible_person_name": account.responsible_person_name, "contact_email": account.contact_email, "contact_phone": account.contact_phone}
    request = paid_sales_activation_requests(activation_id=activation.id, submitted_by_user_id=current_user.id, payout_account_id=account.id, status="PENDING",
                                             verification_snapshot=snapshot, terms_version=PAID_SALES_TERMS_VERSION, terms_accepted_at=now, submitted_at=now)
    session.add(request)
    session.flush()
    admin_ids = list(session.exec(select(users.id).where(users.personal_role == Role.PLATFORM_ADMIN, users.is_suspended.is_(False))).all())
    notify.publish(session, notify.Notice(key=f"PSA_REQUEST_SUBMITTED:{request.id}", event_type="PAID_SALES_REQUEST_SUBMITTED", aggregate_type="EVENT", aggregate_id=event.id,
                                          title="Paid sales verification request", body=f"Verification requested for \"{event.title}\".", inbox_user_ids=admin_ids))
    audit.record(session, action="PAID_SALES_REQUESTED", entity_type="PAID_SALES_ACTIVATION", entity_id=activation.id, event_id=event.id, actor_user_id=current_user.id,
                 details={"request_id": str(request.id)})
    session.commit()
    background.add_task(notify.deliver_due)
    return activation_to_public(session, event.id)


def lock_request_chain(session: Session, request_id: uuid.UUID) -> tuple[events, paid_sales_activations, paid_sales_activation_requests]:
    snapshot = session.get(paid_sales_activation_requests, request_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    activation_snapshot = session.get(paid_sales_activations, snapshot.activation_id)
    event = get_event_or_404(session, activation_snapshot.event_id, for_update=True)
    activation = get_activation(session, event.id, lock=True)
    request = session.exec(select(paid_sales_activation_requests).where(paid_sales_activation_requests.id == request_id)
                           .with_for_update().execution_options(populate_existing=True)).first()
    return event, activation, request


@router.get("/admin/paid-sales/requests", response_model=list[RequestPublic])
def admin_requests(request_status: str = Query(default="PENDING", alias="status", pattern="^(PENDING|APPROVED|REJECTED)$"), session: Session = Depends(get_session),
                   admin: users = Depends(require_admin)):
    rows = session.exec(select(paid_sales_activation_requests).where(paid_sales_activation_requests.status == request_status)
                        .order_by(paid_sales_activation_requests.submitted_at)).all()
    return [request_to_public(session, r) for r in rows]


@router.post("/admin/paid-sales/requests/{request_id}/approve", response_model=ActivationPublic)
def approve_request(request_id: uuid.UUID, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    event, activation, request = lock_request_chain(session, request_id)
    if request.status != "PENDING" or activation.status != ActivationStatus.PENDING_VERIFICATION:
        raise HTTPException(status.HTTP_409_CONFLICT, "Request is not under review")
    if request.submitted_by_user_id == admin.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot review your own request")
    ensure_event_open(event)
    now = db_now(session)
    request.status = "APPROVED"
    request.reviewed_by_user_id = admin.id
    request.reviewed_at = now
    session.add(request)
    activation.status = ActivationStatus.FEE_PENDING
    activation.approved_request_id = request.id
    activation.approved_payout_id = request.payout_account_id
    activation.fee_amount_minor = ACTIVATION_FEE_MINOR
    activation.paid_terms_version = request.terms_version
    activation.paid_terms_accepted_at = request.terms_accepted_at
    session.add(activation)
    notify_organizer(session, event, f"PSA_APPROVED:{request.id}", "PAID_SALES_VERIFICATION_APPROVED", "Paid sales verification approved",
                     f"Verification for \"{event.title}\" was approved. Pay the activation fee to start paid sales.")
    audit.record(session, action="PAID_SALES_VERIFICATION_APPROVED", entity_type="PAID_SALES_ACTIVATION", entity_id=activation.id, event_id=event.id,
                 actor_user_id=admin.id, details={"request_id": str(request.id), "fee_amount_minor": ACTIVATION_FEE_MINOR})
    session.commit()
    background.add_task(notify.deliver_due)
    return activation_to_public(session, event.id)


@router.post("/admin/paid-sales/requests/{request_id}/reject", response_model=ActivationPublic)
def reject_request(request_id: uuid.UUID, data: RejectRequest, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    event, activation, request = lock_request_chain(session, request_id)
    if request.status != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, "Request is not under review")
    if request.submitted_by_user_id == admin.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot review your own request")
    now = db_now(session)
    request.status = "REJECTED"
    request.reviewed_by_user_id = admin.id
    request.reviewed_at = now
    request.rejection_reason = data.reason.strip()
    session.add(request)
    notify_organizer(session, event, f"PSA_REJECTED:{request.id}", "PAID_SALES_VERIFICATION_REJECTED", "Paid sales verification rejected",
                     f"Verification for \"{event.title}\" was rejected: {request.rejection_reason}")
    audit.record(session, action="PAID_SALES_VERIFICATION_REJECTED", entity_type="PAID_SALES_ACTIVATION", entity_id=activation.id, event_id=event.id,
                 actor_user_id=admin.id, details={"request_id": str(request.id), "reason": request.rejection_reason})
    session.commit()
    background.add_task(notify.deliver_due)
    return activation_to_public(session, event.id)


@router.post("/events/{event_id}/paid-sales/fee-payments", response_model=FeePaymentPublic, status_code=status.HTTP_201_CREATED)
def start_fee_payment(event_id: uuid.UUID, data: FeePaymentCreate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_event_role(session, event_id, current_user, (EventRole.ORGANIZER,), allow_platform_admin=False)
    if not PAYMENT_SIMULATOR_ENABLED and not halyk.enabled():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Payment provider is not configured")
    if data.idempotency_key:
        same = session.exec(select(activation_fee_payments).where(activation_fee_payments.idempotency_key == data.idempotency_key)).first()
        if same is not None:
            owner = session.get(paid_sales_activations, same.activation_id)
            if owner.event_id != event_id:
                raise HTTPException(status.HTTP_409_CONFLICT, "Idempotency key was used for another event")
            return fee_to_public(same)
    event = get_event_or_404(session, event_id, for_update=True)
    ensure_event_open(event)
    activation = get_activation(session, event.id, lock=True)
    if activation is None or activation.status != ActivationStatus.FEE_PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Activation fee is not due")
    attempts = session.exec(select(activation_fee_payments).where(activation_fee_payments.activation_id == activation.id)
                            .order_by(activation_fee_payments.id).with_for_update()).all()
    if any(a.status == "SUCCEEDED" for a in attempts):
        raise HTTPException(status.HTTP_409_CONFLICT, "Activation fee is already paid")
    unfinished = next((a for a in attempts if a.status in UNFINISHED_FEE), None)
    if unfinished is not None:
        if unfinished.status == "UNKNOWN":
            raise HTTPException(status.HTTP_409_CONFLICT, "Previous fee payment is being verified with the bank")
        return fee_to_public(unfinished)
    payment = activation_fee_payments(activation_id=activation.id, amount_minor=activation.fee_amount_minor, currency=activation.fee_currency, status="PENDING",
                                      idempotency_key=data.idempotency_key or secrets.token_urlsafe(24), payment_mode="SANDBOX" if halyk.enabled() else "SIMULATION",
                                      provider_operation_ref=bank.new_invoice(session) if halyk.enabled() else "SIMFEE-" + secrets.token_hex(8).upper(),
                                      next_check_at=db_now(session) + bank.OPERATION_LEASE if halyk.enabled() else None)
    session.add(payment)
    session.commit()
    session.refresh(payment)
    return fee_to_public(payment)


@router.post("/paid-sales/fee-payments/{payment_id}/simulate", response_model=ActivationPublic)
def simulate_fee(payment_id: uuid.UUID, data: FeeDecision, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    if not PAYMENT_SIMULATOR_ENABLED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Simulator is disabled")
    snapshot = session.get(activation_fee_payments, payment_id)
    if snapshot is None or snapshot.payment_mode != "SIMULATION":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fee payment not found")
    activation_snapshot = session.get(paid_sales_activations, snapshot.activation_id)
    require_event_role(session, activation_snapshot.event_id, current_user, (EventRole.ORGANIZER,))
    event, activation, payment = lock_fee(session, payment_id)
    if payment.status not in UNFINISHED_FEE:
        return activation_to_public(session, event.id)
    outcome = {FeeOutcome.TIMEOUT: "UNKNOWN", FeeOutcome.DECLINE: "FAILED"}.get(data.outcome, "SUCCEEDED")
    settle_fee(session, event, activation, payment, outcome, db_now(session), current_user.id)
    session.commit()
    background.add_task(notify.deliver_due)
    return activation_to_public(session, event.id)


def get_sandbox_fee(session: Session, payment_id: uuid.UUID) -> tuple[activation_fee_payments, events]:
    payment = session.get(activation_fee_payments, payment_id)
    if payment is None or payment.payment_mode != "SANDBOX":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fee payment not found")
    return payment, session.get(events, session.get(paid_sales_activations, payment.activation_id).event_id)


@router.get("/paid-sales/fee-payments/{payment_id}/halyk", response_class=HTMLResponse)
def halyk_fee_page(payment_id: uuid.UUID, session: Session = Depends(get_session)):
    payment, event = get_sandbox_fee(session, payment_id)
    activation = session.get(paid_sales_activations, payment.activation_id)
    recent = db_now(session) - as_aware(payment.created_at) < FEE_PAGE_TTL
    if payment.status != "PENDING" or activation.status != ActivationStatus.FEE_PENDING or not bank.event_open(event) or not recent or not halyk.enabled():
        return RedirectResponse(f"{FRONTEND_URL}/events/{event.id}/paid-sales", status_code=status.HTTP_303_SEE_OTHER)
    invoice, amount, currency = payment.provider_operation_ref, payment.amount_minor, payment.currency
    session.commit()
    try:
        return pages.halyk_page(invoice, amount, currency, "BiletFlow paid sales activation", f"{PUBLIC_API_URL}/paid-sales/fee-payments/{payment_id}/halyk/return")
    except halyk.HalykError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The bank is not available, please try again")


@router.get("/paid-sales/fee-payments/{payment_id}/halyk/return")
def halyk_fee_return(payment_id: uuid.UUID, background: BackgroundTasks, session: Session = Depends(get_session)):
    payment, event = get_sandbox_fee(session, payment_id)
    event_id = event.id
    if payment.status in UNFINISHED_FEE:
        sync_fee(session, payment_id)
        background.add_task(notify.deliver_due)
    return RedirectResponse(f"{FRONTEND_URL}/events/{event_id}/paid-sales", status_code=status.HTTP_303_SEE_OTHER)


def _set_suspension(session: Session, event_id: uuid.UUID, admin: users, suspend: bool, reason: str | None) -> ActivationPublic:
    event = get_event_or_404(session, event_id, for_update=True)
    activation = get_activation(session, event.id, lock=True)
    expected = ActivationStatus.ACTIVE if suspend else ActivationStatus.SUSPENDED
    if activation is None or activation.status != expected:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Paid sales must be {expected.value}")
    now = db_now(session)
    if not suspend:
        ensure_event_open(event)
        paid = session.exec(select(activation_fee_payments.id).where(activation_fee_payments.activation_id == activation.id, activation_fee_payments.status == "SUCCEEDED")).first()
        if paid is None or activation.approved_request_id is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Activation is not eligible to resume")
    activation.status = ActivationStatus.SUSPENDED if suspend else ActivationStatus.ACTIVE
    activation.suspended_at = now if suspend else None
    session.add(activation)
    action = "PAID_SALES_SUSPENDED" if suspend else "PAID_SALES_RESTORED"
    notify_organizer(session, event, f"{action}:{activation.id}:{now.isoformat()}", action, "Paid sales suspended" if suspend else "Paid sales restored",
                     f"Paid sales for \"{event.title}\" were {'suspended' + (': ' + reason if reason else '') if suspend else 'restored'}.")
    audit.record(session, action=action, entity_type="PAID_SALES_ACTIVATION", entity_id=activation.id, event_id=event.id, actor_user_id=admin.id,
                 details={"reason": reason} if reason else {})
    session.commit()
    return activation_to_public(session, event.id)


@router.post("/admin/events/{event_id}/paid-sales/suspend", response_model=ActivationPublic)
def suspend_paid_sales(event_id: uuid.UUID, data: SuspendRequest, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    result = _set_suspension(session, event_id, admin, True, data.reason.strip())
    background.add_task(notify.deliver_due)
    return result


@router.post("/admin/events/{event_id}/paid-sales/resume", response_model=ActivationPublic)
def resume_paid_sales(event_id: uuid.UUID, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    result = _set_suspension(session, event_id, admin, False, None)
    background.add_task(notify.deliver_due)
    return result
