import html
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Form, Header, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session, select

from backend.core.config import FRONTEND_URL, PAYMENT_SIMULATOR_ENABLED
from backend.modules.auth.dependencies import get_current_user
from backend.modules.orders.models import orders
from backend.modules.payments import service
from backend.modules.payments.models import payments
from backend.modules.payments.schemas import PaymentPublic, PaymentStatus, SimulatedOutcome, SimulatorDecision
from backend.modules.tickets.notify import queue_ticket_email
from backend.modules.users.user_model import users, Role
from database.database import get_session

router = APIRouter(tags=["payments"])


def require_simulator() -> None:
    if not PAYMENT_SIMULATOR_ENABLED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment simulator is disabled")


def get_simulated_payment(session: Session, payment_id: uuid.UUID) -> payments:
    require_simulator()
    payment = session.get(payments, payment_id)
    if payment is None or not service.is_simulated(payment):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    return payment


@router.post("/orders/{order_id}/payments", response_model=PaymentPublic, status_code=status.HTTP_201_CREATED)
def start_payment(order_id: uuid.UUID, idempotency_key: str | None = Header(default=None, max_length=200), session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    if not PAYMENT_SIMULATOR_ENABLED:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No payment provider is configured")
    return service.to_public(service.start_payment(session, order_id, current_user, idempotency_key))


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
    payment = get_simulated_payment(session, payment_id)
    order = session.get(orders, payment.order_id)
    amount = f"{payment.amount_minor / 100:,.2f}".replace(",", " ")
    disabled = "" if payment.status == PaymentStatus.PENDING and payment.cancellation_reason is None else "disabled"
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
    payment = get_simulated_payment(session, payment_id)
    issued = service.simulate_bank(session, payment_id, outcome)
    queue_ticket_email(background, session, issued)
    return RedirectResponse(f"{FRONTEND_URL}/orders/{payment.order_id}", status_code=status.HTTP_303_SEE_OTHER)


@router.post("/payments/simulator/{payment_id}/decision", response_model=PaymentPublic)
def simulator_decision(payment_id: uuid.UUID, data: SimulatorDecision, background: BackgroundTasks, session: Session = Depends(get_session)):
    get_simulated_payment(session, payment_id)
    issued = service.simulate_bank(session, payment_id, data.outcome)
    queue_ticket_email(background, session, issued)
    session.expire_all()
    return service.to_public(session.get(payments, payment_id))


@router.post("/admin/payments/reconcile")
def reconcile(background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    if current_user.personal_role != Role.PLATFORM_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    handled, issued_batches = service.reconcile_due(session)
    for issued in issued_batches:
        queue_ticket_email(background, session, issued)
    return {"handled": handled}
