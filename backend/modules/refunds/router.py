import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.modules.admin.router import require_admin
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import event_roles, require_event_role, require_organizer
from backend.modules.notifications import service as notify
from backend.modules.orders.models import orders
from backend.modules.orders.schemas import OrderStatus
from backend.modules.refunds import service
from backend.modules.refunds.models import refund_requests
from backend.modules.tickets.models import tickets
from backend.modules.tickets.schemas import TicketStatus
from backend.modules.refunds.schemas import CustomerRefundCreate, RefundDecision, RefundEligibility, RefundRejection, RefundRequestPublic, RefundSource, StaffRefundCreate
from backend.modules.users.user_model import EventRole, Role, users
from database.database import get_session

router = APIRouter(tags=["refunds"])


def run_background(background: BackgroundTasks) -> None:
    background.add_task(service.process_due)
    background.add_task(notify.deliver_due)


def own_order(session: Session, order_id: uuid.UUID, user: users) -> orders:
    order = session.get(orders, order_id)
    if order is None or order.buyer_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


def can_see_order_refunds(session: Session, order: orders, user: users) -> bool:
    return order.buyer_user_id == user.id or user.personal_role == Role.PLATFORM_ADMIN or EventRole.ORGANIZER in event_roles(session, order.event_id, user)


@router.get("/orders/{order_id}/refund-eligibility", response_model=RefundEligibility)
def refund_eligibility(order_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    order = own_order(session, order_id, current_user)
    from backend.modules.events.models import events
    return service.eligibility(session, session.get(events, order.event_id), order, db_now(session))


@router.post("/orders/{order_id}/refund-requests", response_model=RefundRequestPublic, status_code=status.HTTP_201_CREATED)
def request_refund(order_id: uuid.UUID, data: CustomerRefundCreate, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    own_order(session, order_id, current_user)
    event, order = service.lock_order(session, order_id)
    now = db_now(session)
    check = service.eligibility(session, event, order, now)
    if not check.eligible:
        raise HTTPException(status.HTTP_409_CONFLICT, check.reason)
    if check.fast_refund:
        request = service.create_request(session, order, RefundSource.SYSTEM_FAST_REFUND, now, requested_by=current_user.id, approved=True,
                                         reason_code=data.reason_code.value, comment=data.comment)
    else:
        request = service.create_request(session, order, RefundSource.CUSTOMER, now, requested_by=current_user.id, approved=False,
                                         reason_code=data.reason_code.value, comment=data.comment)
    session.commit()
    run_background(background)
    return service.to_public(session, request)


@router.post("/orders/{order_id}/cancel-registration", status_code=status.HTTP_204_NO_CONTENT)
def cancel_free_registration(order_id: uuid.UUID, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    snapshot = session.get(orders, order_id)
    by_organizer = snapshot is not None and snapshot.buyer_user_id != current_user.id and EventRole.ORGANIZER in event_roles(session, snapshot.event_id, current_user)
    if snapshot is None or (snapshot.buyer_user_id != current_user.id and not by_organizer):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    event, order = service.lock_order(session, order_id)
    if order.status != OrderStatus.CONFIRMED or order.total_minor != 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only confirmed free registrations can be cancelled")
    now = db_now(session)
    if now >= as_aware(event.starts_at):
        raise HTTPException(status.HTTP_409_CONFLICT, "Event has already started")
    if service.has_checked_in(session, order.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Tickets of this order were already used")
    cancelled = False
    for ticket in session.exec(select(tickets).where(tickets.order_id == order.id, tickets.status == TicketStatus.VALID).with_for_update()).all():
        ticket.status = TicketStatus.CANCELLED
        session.add(ticket)
        audit.record(session, action="TICKET_INVALIDATED", entity_type="TICKET", entity_id=ticket.id, event_id=order.event_id, actor_user_id=current_user.id)
        cancelled = True
    if not cancelled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Registration is already cancelled")
    audit.record(session, action="REGISTRATION_CANCELLED", entity_type="ORDER", entity_id=order.id, event_id=order.event_id, actor_user_id=current_user.id)
    if by_organizer:
        service.notify_buyer(session, order, f"REGISTRATION_CANCELLED:{order.id}", "REGISTRATION_CANCELLED", "Registration cancelled",
                             f"The organizer cancelled your registration {order.order_number} for \"{event.title}\".")
    session.commit()
    background.add_task(notify.deliver_due)


@router.get("/orders/{order_id}/refund-requests", response_model=list[RefundRequestPublic])
def order_refunds(order_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    order = session.get(orders, order_id)
    if order is None or not can_see_order_refunds(session, order, current_user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    rows = session.exec(select(refund_requests).where(refund_requests.order_id == order_id).order_by(refund_requests.created_at.desc())).all()
    return [service.to_public(session, r) for r in rows]


@router.get("/refund-requests/mine", response_model=list[RefundRequestPublic])
def my_refunds(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    rows = session.exec(select(refund_requests).join(orders, orders.id == refund_requests.order_id).where(orders.buyer_user_id == current_user.id)
                        .order_by(refund_requests.created_at.desc())).all()
    return [service.to_public(session, r) for r in rows]


@router.post("/refund-requests/{request_id}/withdraw", response_model=RefundRequestPublic)
def withdraw_refund(request_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    snapshot = session.get(refund_requests, request_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Refund request not found")
    own_order(session, snapshot.order_id, current_user)
    _, order, request = service.lock_request(session, request_id)
    if request.status not in ("PENDING", "PENDING_ADMIN") or request.source != RefundSource.CUSTOMER.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only undecided requests can be withdrawn")
    request.status = "WITHDRAWN"
    session.add(request)
    session.commit()
    return service.to_public(session, request)


@router.get("/events/{event_id}/refund-requests", response_model=list[RefundRequestPublic])
def event_refunds(event_id: uuid.UUID, request_status: str | None = Query(default=None, alias="status"), session: Session = Depends(get_session),
                  current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    query = select(refund_requests).join(orders, orders.id == refund_requests.order_id).where(orders.event_id == event_id)
    if request_status:
        query = query.where(refund_requests.status == request_status)
    return [service.to_public(session, r) for r in session.exec(query.order_by(refund_requests.created_at.desc())).all()]


def _decide(session: Session, request_id: uuid.UUID, user: users) -> tuple:
    snapshot = session.get(refund_requests, request_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Refund request not found")
    order_snapshot = session.get(orders, snapshot.order_id)
    is_admin = user.personal_role == Role.PLATFORM_ADMIN
    is_organizer = EventRole.ORGANIZER in event_roles(session, order_snapshot.event_id, user)
    event, order, request = service.lock_request(session, request_id)
    if request.status == "PENDING" and not is_organizer:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the organizer decides on this request")
    if request.status == "PENDING_ADMIN" and not is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This request was escalated to platform administration")
    if request.status not in ("PENDING", "PENDING_ADMIN"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Request is already decided")
    return event, order, request


@router.post("/refund-requests/{request_id}/approve", response_model=RefundRequestPublic)
def approve_refund(request_id: uuid.UUID, data: RefundDecision, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    _, order, request = _decide(session, request_id, current_user)
    if service.succeeded_payment(session, order.id) is None or service.is_refunded(session, order.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Order cannot be refunded")
    if request.source == RefundSource.CUSTOMER.value and service.has_checked_in(session, order.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Tickets of this order were already used")
    service.approve(session, order, request, current_user.id, db_now(session))
    session.commit()
    run_background(background)
    return service.to_public(session, request)


@router.post("/refund-requests/{request_id}/reject", response_model=RefundRequestPublic)
def reject_refund(request_id: uuid.UUID, data: RefundRejection, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    _, order, request = _decide(session, request_id, current_user)
    service.reject(session, order, request, current_user.id, data.comment.strip(), db_now(session))
    session.commit()
    background.add_task(notify.deliver_due)
    return service.to_public(session, request)


@router.post("/orders/{order_id}/organizer-refund", response_model=RefundRequestPublic, status_code=status.HTTP_201_CREATED)
def organizer_refund(order_id: uuid.UUID, data: StaffRefundCreate, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    order = session.get(orders, order_id)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    require_event_role(session, order.event_id, current_user, (EventRole.ORGANIZER,), allow_platform_admin=False)
    _, order = service.lock_order(session, order_id)
    service.ensure_refundable(session, order, allow_checked_in=True)
    if service.has_checked_in(session, order.id):
        audit.record(session, action="REFUND_EXCEPTION_DECIDED", entity_type="ORDER", entity_id=order.id, event_id=order.event_id, actor_user_id=current_user.id,
                     details={"order_number": order.order_number})
    request = service.create_request(session, order, RefundSource.ORGANIZER_INITIATED, db_now(session), requested_by=current_user.id,
                                     approved_by=current_user.id, comment=data.comment)
    session.commit()
    run_background(background)
    return service.to_public(session, request)


@router.get("/admin/refund-requests", response_model=list[RefundRequestPublic])
def admin_refunds(request_status: str = Query(default="PENDING_ADMIN", alias="status"), execution_status: str | None = None, limit: int = Query(default=50, ge=1, le=200),
                  session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    query = select(refund_requests).where(refund_requests.status == request_status)
    if execution_status:
        query = query.where(refund_requests.execution_status == execution_status)
    return [service.to_public(session, r) for r in session.exec(query.order_by(refund_requests.created_at).limit(limit)).all()]


@router.post("/admin/orders/{order_id}/refund", response_model=RefundRequestPublic, status_code=status.HTTP_201_CREATED)
def admin_refund(order_id: uuid.UUID, data: StaffRefundCreate, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    if session.get(orders, order_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    _, order = service.lock_order(session, order_id)
    service.ensure_refundable(session, order, allow_checked_in=True)
    if service.has_checked_in(session, order.id):
        audit.record(session, action="REFUND_EXCEPTION_DECIDED", entity_type="ORDER", entity_id=order.id, event_id=order.event_id, actor_user_id=admin.id,
                     details={"order_number": order.order_number})
    request = service.create_request(session, order, RefundSource.PLATFORM_ADMIN, db_now(session), requested_by=admin.id, approved_by=admin.id, comment=data.comment)
    session.commit()
    run_background(background)
    return service.to_public(session, request)


@router.post("/admin/refund-requests/{request_id}/retry", response_model=RefundRequestPublic)
def admin_retry(request_id: uuid.UUID, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    request = session.get(refund_requests, request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Refund request not found")
    if request.execution_status != "IN_PROGRESS":
        raise HTTPException(status.HTTP_409_CONFLICT, "Refund is not awaiting a retry")
    session.rollback()
    if not service.run_request(request_id, manual_admin=True):
        raise HTTPException(status.HTTP_409_CONFLICT, "A refund attempt is still unresolved")
    background.add_task(notify.deliver_due)
    session.expire_all()
    return service.to_public(session, session.get(refund_requests, request_id))
