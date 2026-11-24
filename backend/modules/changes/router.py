import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import delete
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import FRONTEND_URL
from backend.modules.admin.router import require_admin
from backend.modules.applications.service import generate_number
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user
from backend.modules.changes import service
from backend.modules.changes.schemas import (SPECIAL_REFUND_FIELDS, TERMS_FIELDS, ChangeField, ChangeItemPublic, ChangeRejection, ChangeRequestInput,
                                             ChangeRequestPublic, ChangeReview)
from backend.modules.events.access import get_event_or_404, require_organizer
from backend.modules.events.models import event_change_request_items, event_change_requests, events
from backend.modules.events.schemas import EventLifecycleStatus, EventStatus
from backend.modules.notifications import service as notify
from backend.modules.orders.models import orders
from backend.modules.orders.schemas import OrderStatus
from backend.modules.refunds import service as refund_service
from backend.modules.refunds.schemas import RefundRequestPublic, RefundSource
from backend.modules.users.user_model import users
from database.database import get_session

router = APIRouter(tags=["event changes"])

SPECIAL_REFUND_HOURS = 24
CLOSED = (EventLifecycleStatus.CANCELLED, EventLifecycleStatus.COMPLETED)


def to_public(session: Session, request: event_change_requests) -> ChangeRequestPublic:
    items = session.exec(select(event_change_request_items).where(event_change_request_items.change_request_id == request.id).order_by(event_change_request_items.created_at)).all()
    return ChangeRequestPublic(id=request.id, request_number=request.request_number, event_id=request.event_id, status=request.status.value, comment=request.comment,
                               submitted_at=request.submitted_at, reviewed_at=request.reviewed_at, review_comment=request.review_comment, created_at=request.created_at,
                               items=[ChangeItemPublic(id=i.id, field=i.field, target_id=i.target_id, old_value=i.old_value, new_value=i.new_value) for i in items])


def lock_request(session: Session, request_id: uuid.UUID) -> tuple[events, event_change_requests]:
    snapshot = session.get(event_change_requests, request_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Change request not found")
    event = get_event_or_404(session, snapshot.event_id, for_update=True)
    request = session.exec(select(event_change_requests).where(event_change_requests.id == request_id).with_for_update().execution_options(populate_existing=True)).one()
    return event, request


def own_request(session: Session, request_id: uuid.UUID, user: users) -> tuple[events, event_change_requests]:
    snapshot = session.get(event_change_requests, request_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Change request not found")
    require_organizer(session, snapshot.event_id, user)
    return lock_request(session, request_id)


@router.post("/events/{event_id}/change-requests", response_model=ChangeRequestPublic, status_code=status.HTTP_201_CREATED)
def create_change(event_id: uuid.UUID, data: ChangeRequestInput, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    if event.status in CLOSED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is finished or cancelled")
    request = event_change_requests(request_number=generate_number("BF-C-"), event_id=event.id, requested_by_user_id=current_user.id, status=EventStatus.DRAFT,
                                    comment=(data.comment or "").strip() or None)
    session.add(request)
    session.flush()
    service.replace_items(session, event, request.id, data.items)
    session.commit()
    session.refresh(request)
    return to_public(session, request)


@router.get("/events/{event_id}/change-requests", response_model=list[ChangeRequestPublic])
def list_changes(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    rows = session.exec(select(event_change_requests).where(event_change_requests.event_id == event_id).order_by(event_change_requests.created_at.desc())).all()
    return [to_public(session, r) for r in rows]


@router.get("/change-requests/{request_id}", response_model=ChangeRequestPublic)
def read_change(request_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    request = session.get(event_change_requests, request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Change request not found")
    require_organizer(session, request.event_id, current_user)
    return to_public(session, request)


@router.put("/change-requests/{request_id}", response_model=ChangeRequestPublic)
def update_change(request_id: uuid.UUID, data: ChangeRequestInput, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event, request = own_request(session, request_id, current_user)
    if request.status != EventStatus.DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only drafts can be edited")
    request.comment = (data.comment or "").strip() or None
    session.add(request)
    service.replace_items(session, event, request.id, data.items)
    session.commit()
    session.refresh(request)
    return to_public(session, request)


@router.delete("/change-requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_change(request_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    _, request = own_request(session, request_id, current_user)
    if request.status != EventStatus.DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only drafts can be deleted")
    session.exec(delete(event_change_request_items).where(event_change_request_items.change_request_id == request.id))
    session.delete(request)
    session.commit()


@router.post("/change-requests/{request_id}/submit", response_model=ChangeRequestPublic)
def submit_change(request_id: uuid.UUID, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event, request = own_request(session, request_id, current_user)
    if request.status != EventStatus.DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only drafts can be submitted")
    if event.status in CLOSED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is finished or cancelled")
    if session.exec(select(event_change_requests.id).where(event_change_requests.event_id == event.id, event_change_requests.status == EventStatus.PENDING)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Another change request is already under review")
    now = db_now(session)
    request.status = EventStatus.PENDING
    request.submitted_at = now
    session.add(request)
    notify.publish(session, notify.Notice(key=f"CHANGE_SUBMITTED:{request.id}", event_type="EVENT_CHANGE_SUBMITTED", aggregate_type="EVENT", aggregate_id=event.id,
                                          title="Event change request", body=f"Changes to \"{event.title}\" await review.", inbox_user_ids=refund_service.admin_ids(session)))
    audit.record(session, action="EVENT_CHANGE_SUBMITTED", entity_type="EVENT_CHANGE_REQUEST", entity_id=request.id, event_id=event.id, actor_user_id=current_user.id,
                 details={"request_number": request.request_number})
    session.commit()
    session.refresh(request)
    background.add_task(notify.deliver_due)
    return to_public(session, request)


@router.post("/change-requests/{request_id}/withdraw", response_model=ChangeRequestPublic)
def withdraw_change(request_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event, request = own_request(session, request_id, current_user)
    if request.status != EventStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only pending requests can be withdrawn")
    request.status = EventStatus.WITHDRAWN
    session.add(request)
    session.commit()
    session.refresh(request)
    return to_public(session, request)


@router.get("/admin/change-requests", response_model=list[ChangeRequestPublic])
def admin_changes(request_status: EventStatus = Query(default=EventStatus.PENDING, alias="status"), session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    rows = session.exec(select(event_change_requests).where(event_change_requests.status == request_status).order_by(event_change_requests.submitted_at)).all()
    return [to_public(session, r) for r in rows]


@router.post("/admin/change-requests/{request_id}/approve", response_model=ChangeRequestPublic)
def approve_change(request_id: uuid.UUID, data: ChangeReview, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    event, request = lock_request(session, request_id)
    if request.status == EventStatus.APPROVED:
        return to_public(session, request)
    if request.status != EventStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Request is not pending")
    if event.status in CLOSED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is finished or cancelled")
    if request.requested_by_user_id == admin.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot review your own request")
    now = db_now(session)
    items = list(session.exec(select(event_change_request_items).where(event_change_request_items.change_request_id == request.id)).all())
    fields = service.apply(session, event, items, now)
    if fields & TERMS_FIELDS:
        event.purchase_terms_version += 1
        session.add(event)
    request.status = EventStatus.APPROVED
    request.reviewed_by_user_id = admin.id
    request.reviewed_at = now
    request.review_comment = (data.review_comment or "").strip() or None
    session.add(request)
    audit.record(session, action="EVENT_CHANGE_APPROVED", entity_type="EVENT_CHANGE_REQUEST", entity_id=request.id, event_id=event.id, actor_user_id=admin.id,
                 details={"request_number": request.request_number, "fields": sorted(f.value for f in fields)})
    owner = refund_service.organizer_id(session, event.id)
    if owner:
        notify.publish(session, notify.Notice(key=f"CHANGE_APPROVED:{request.id}", event_type="EVENT_CHANGE_APPROVED", aggregate_type="EVENT", aggregate_id=event.id,
                                              title="Changes approved", body=f"Changes to \"{event.title}\" were approved.", inbox_user_ids=[owner]))
    if fields & (TERMS_FIELDS | {ChangeField.TITLE}):
        buyers = session.exec(select(users).join(orders, orders.buyer_user_id == users.id)
                              .where(orders.event_id == event.id, orders.status == OrderStatus.CONFIRMED).distinct()).all()
        special = bool(fields & SPECIAL_REFUND_FIELDS)
        body = f"\"{event.title}\" was updated."
        if special:
            body += f" You may request a full refund within {SPECIAL_REFUND_HOURS} hours."
        if buyers:
            notify.publish(session, notify.Notice(key=f"EVENT_CHANGED:{request.id}", event_type="EVENT_CHANGED", aggregate_type="EVENT", aggregate_id=event.id,
                                                  title="Event updated", body=body, action_url=f"{FRONTEND_URL}/orders", inbox_user_ids=[u.id for u in buyers],
                                                  emails=[notify.Email(address=u.email, user_id=u.id) for u in buyers]))
    session.commit()
    session.refresh(request)
    background.add_task(notify.deliver_due)
    return to_public(session, request)


@router.post("/admin/change-requests/{request_id}/reject", response_model=ChangeRequestPublic)
def reject_change(request_id: uuid.UUID, data: ChangeRejection, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    event, request = lock_request(session, request_id)
    if request.status != EventStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Request is not pending")
    now = db_now(session)
    request.status = EventStatus.REJECTED
    request.reviewed_by_user_id = admin.id
    request.reviewed_at = now
    request.review_comment = data.review_comment.strip()
    session.add(request)
    owner = refund_service.organizer_id(session, event.id)
    if owner:
        notify.publish(session, notify.Notice(key=f"CHANGE_REJECTED:{request.id}", event_type="EVENT_CHANGE_REJECTED", aggregate_type="EVENT", aggregate_id=event.id,
                                              title="Changes rejected", body=f"Changes to \"{event.title}\" were rejected: {request.review_comment}", inbox_user_ids=[owner]))
    audit.record(session, action="EVENT_CHANGE_REJECTED", entity_type="EVENT_CHANGE_REQUEST", entity_id=request.id, event_id=event.id, actor_user_id=admin.id,
                 details={"comment": request.review_comment})
    session.commit()
    session.refresh(request)
    background.add_task(notify.deliver_due)
    return to_public(session, request)


def special_refund_change(session: Session, order: orders, now) -> event_change_requests | None:
    candidates = session.exec(select(event_change_requests).where(event_change_requests.event_id == order.event_id, event_change_requests.status == EventStatus.APPROVED)
                              .order_by(event_change_requests.reviewed_at.desc())).all()
    for change in candidates:
        reviewed = as_aware(change.reviewed_at)
        if (now - reviewed).total_seconds() > SPECIAL_REFUND_HOURS * 3600 or as_aware(order.confirmed_at) >= reviewed:
            continue
        fields = set(session.exec(select(event_change_request_items.field).where(event_change_request_items.change_request_id == change.id)).all())
        if fields & {f.value for f in SPECIAL_REFUND_FIELDS}:
            return change
    return None


@router.post("/orders/{order_id}/special-refund", response_model=RefundRequestPublic, status_code=status.HTTP_201_CREATED)
def special_refund(order_id: uuid.UUID, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    order = session.get(orders, order_id)
    if order is None or order.buyer_user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    _, order = refund_service.lock_order(session, order_id)
    now = db_now(session)
    change = special_refund_change(session, order, now) if order.confirmed_at else None
    if change is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "No special refund window is open for this order")
    refund_service.ensure_refundable(session, order, allow_checked_in=False)
    request = refund_service.create_request(session, order, RefundSource.EVENT_CHANGED, now, requested_by=current_user.id, change_request_id=change.id)
    session.commit()
    background.add_task(refund_service.process_due)
    background.add_task(notify.deliver_due)
    return refund_service.to_public(session, request)
