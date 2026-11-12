import html
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Form, Header, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.core.config import ACTIVATION_FEE_MINOR, FRONTEND_URL, PAYMENT_SIMULATOR_ENABLED
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import get_event_or_404, require_organizer
from backend.modules.orders.models import orders
from backend.modules.payments import service
from backend.modules.payments.activation import get_activation
from backend.modules.payments.models import payments, paid_sales_activations
from backend.modules.payments.schemas import ActivationPublic, ActivationRequest, ActivationStatus, PaymentPublic, PaymentStatus, SimulatedOutcome, SimulatorDecision, SuspendRequest
from backend.modules.tickets.notify import queue_ticket_email
from backend.modules.users.user_model import users, Role
from database.database import get_session

router = APIRouter(tags=["payments"])


def require_simulator() -> None:
    if not PAYMENT_SIMULATOR_ENABLED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment simulator is disabled")


@router.post("/orders/{order_id}/payments", response_model=PaymentPublic, status_code=status.HTTP_201_CREATED)
def start_payment(order_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    if not PAYMENT_SIMULATOR_ENABLED:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No payment provider is configured")
    return service.to_public(service.start_payment(session, order_id, current_user))


@router.get("/orders/{order_id}/payments", response_model=list[PaymentPublic])
def list_payments(order_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    order = session.get(orders, order_id)
    if order is None or order.buyer_user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    rows = session.exec(select(payments).where(payments.order_id == order_id).order_by(payments.created_at)).all()
    return [service.to_public(p) for p in rows]


@router.post("/payments/webhook")
async def payment_webhook(request: Request, background: BackgroundTasks, x_signature: str | None = Header(default=None), session: Session = Depends(get_session)):
    body = await request.body()
    journal = service.record_webhook(session, body, x_signature)
    if journal.processing_status.value == "REJECTED":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid signature")
    issued = service.process_webhook(session, journal)
    queue_ticket_email(background, session, issued)
    return {"status": journal.processing_status.value}


@router.get("/payments/simulator/{payment_id}", response_class=HTMLResponse)
def simulator_page(payment_id: uuid.UUID, session: Session = Depends(get_session)):
    require_simulator()
    payment = session.get(payments, payment_id)
    if payment is None or not payment.is_simulated:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    order = session.get(orders, payment.order_id)
    amount = f"{payment.amount_minor / 100:,.2f}".replace(",", " ")
    disabled = "" if payment.status == PaymentStatus.PENDING else "disabled"
    buttons = "".join(
        f'<button name="outcome" value="{value}" {disabled}>{label}</button>'
        for value, label in (("approve", "Approve payment"), ("decline", "Decline (card refused)"), ("capture_fail", "Approve, then capture fails"))
    )
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BiletFlow demo payment</title>
<style>body{{font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#111}}.demo{{background:#fff3cd;border:1px solid #e0b100;padding:12px;border-radius:8px}}button{{display:block;width:100%;margin:8px 0;padding:12px;font-size:16px;border-radius:8px;border:1px solid #888;background:#fff;cursor:pointer}}button:first-of-type{{background:#111;color:#fff}}</style></head>
<body><p class="demo"><b>DEMO PAYMENT.</b> This is a simulated bank page for the academic MVP. No real money is charged.</p>
<h1>{amount} {html.escape(payment.currency)}</h1><p>Order {html.escape(order.order_number)} · status {payment.status.value}</p>
<form method="post">{buttons}</form></body></html>"""


@router.post("/payments/simulator/{payment_id}")
def simulator_submit(payment_id: uuid.UUID, background: BackgroundTasks, outcome: SimulatedOutcome = Form(...), session: Session = Depends(get_session)):
    require_simulator()
    payment = session.get(payments, payment_id)
    if payment is None or not payment.is_simulated:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    issued = service.simulate_bank(session, payment_id, outcome)
    queue_ticket_email(background, session, issued)
    return RedirectResponse(f"{FRONTEND_URL}/orders/{payment.order_id}", status_code=status.HTTP_303_SEE_OTHER)


@router.post("/payments/simulator/{payment_id}/decision", response_model=PaymentPublic)
def simulator_decision(payment_id: uuid.UUID, data: SimulatorDecision, background: BackgroundTasks, session: Session = Depends(get_session)):
    require_simulator()
    issued = service.simulate_bank(session, payment_id, data.outcome)
    queue_ticket_email(background, session, issued)
    session.expire_all()
    return service.to_public(session.get(payments, payment_id))


def activation_to_public(event_id: uuid.UUID, activation: paid_sales_activations | None) -> ActivationPublic:
    if activation is None:
        return ActivationPublic(event_id=event_id, status=ActivationStatus.NOT_REQUESTED, activation_fee_minor=ACTIVATION_FEE_MINOR, fee_paid_at=None, is_simulated=True,
                                checklist={"payout_details_confirmed": False, "activation_fee_paid": False})
    return ActivationPublic(event_id=event_id, status=activation.status, activation_fee_minor=activation.activation_fee_minor, fee_paid_at=activation.fee_paid_at, is_simulated=activation.is_simulated,
                            checklist={"payout_details_confirmed": activation.payout_details_confirmed, "activation_fee_paid": activation.fee_paid_at is not None})


@router.get("/events/{event_id}/paid-sales", response_model=ActivationPublic)
def read_activation(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    return activation_to_public(event_id, get_activation(session, event_id))


@router.post("/events/{event_id}/paid-sales", response_model=ActivationPublic)
def request_activation(event_id: uuid.UUID, data: ActivationRequest, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    get_event_or_404(session, event_id, for_update=True)
    if not data.payout_details_confirmed:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Payout details must be confirmed")
    activation = get_activation(session, event_id, lock=True)
    if activation is not None and activation.status in (ActivationStatus.ACTIVE, ActivationStatus.SUSPENDED):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Paid sales are already {activation.status.value}")
    if activation is None:
        activation = paid_sales_activations(event_id=event_id, activation_fee_minor=ACTIVATION_FEE_MINOR)
    activation.legal_name = data.legal_name
    activation.payout_details_confirmed = True
    activation.status = ActivationStatus.FEE_PENDING
    session.add(activation)
    session.commit()
    session.refresh(activation)
    return activation_to_public(event_id, activation)


@router.post("/events/{event_id}/paid-sales/pay-fee", response_model=ActivationPublic)
def pay_activation_fee(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    if not PAYMENT_SIMULATOR_ENABLED:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No payment provider is configured")
    get_event_or_404(session, event_id, for_update=True)
    activation = get_activation(session, event_id, lock=True)
    if activation is None or activation.status != ActivationStatus.FEE_PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Activation fee is not due")
    activation.fee_paid_at = db_now(session)
    activation.status = ActivationStatus.ACTIVE
    session.add(activation)
    session.commit()
    session.refresh(activation)
    return activation_to_public(event_id, activation)


def _require_admin(user: users) -> None:
    if user.personal_role != Role.PLATFORM_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")


@router.post("/admin/events/{event_id}/paid-sales/suspend", response_model=ActivationPublic)
def suspend_paid_sales(event_id: uuid.UUID, data: SuspendRequest, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    _require_admin(current_user)
    get_event_or_404(session, event_id, for_update=True)
    activation = get_activation(session, event_id, lock=True)
    if activation is None or activation.status != ActivationStatus.ACTIVE:
        raise HTTPException(status.HTTP_409_CONFLICT, "Paid sales are not active")
    activation.status = ActivationStatus.SUSPENDED
    activation.suspended_reason = data.reason
    activation.suspended_by_user_id = current_user.id
    session.add(activation)
    session.commit()
    session.refresh(activation)
    return activation_to_public(event_id, activation)


@router.post("/admin/events/{event_id}/paid-sales/resume", response_model=ActivationPublic)
def resume_paid_sales(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    _require_admin(current_user)
    get_event_or_404(session, event_id, for_update=True)
    activation = get_activation(session, event_id, lock=True)
    if activation is None or activation.status != ActivationStatus.SUSPENDED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Paid sales are not suspended")
    activation.status = ActivationStatus.ACTIVE
    activation.suspended_reason = None
    session.add(activation)
    session.commit()
    session.refresh(activation)
    return activation_to_public(event_id, activation)


@router.post("/admin/payments/reconcile")
def reconcile(background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    _require_admin(current_user)
    handled, issued_batches = service.reconcile_due(session)
    for issued in issued_batches:
        queue_ticket_email(background, session, issued)
    return {"handled": handled}
