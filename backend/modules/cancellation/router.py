import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.core.paging import like_pattern, page
from backend.modules.admin.refs import event_like, event_refs
from backend.modules.admin.router import require_admin
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user
from backend.modules.cancellation import service
from backend.modules.cancellation.schemas import CancellationApproval, CancellationCreate, CancellationDetail, CancellationPublic, CancellationRejection
from backend.modules.events.access import get_event_or_404, require_organizer
from backend.modules.events.models import event_cancellation_requests, events
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.notifications import service as notify
from backend.modules.refunds import service as refund_service
from backend.modules.tickets.models import tickets
from backend.modules.users.user_model import users
from database.database import get_session

router = APIRouter(tags=["cancellation"])


def run_background(background: BackgroundTasks) -> None:
    background.add_task(service.process_cancellations)
    background.add_task(refund_service.process_due)
    background.add_task(notify.deliver_due)


def to_public_list(session: Session, rows: list[event_cancellation_requests]) -> list[CancellationPublic]:
    refs = event_refs(session, [r.event_id for r in rows])
    return [CancellationPublic(id=r.id, event_id=r.event_id, event_title=refs[r.event_id].title, event_public_id=refs[r.event_id].public_id,
                               organizer_name=refs[r.event_id].organizer_name, status=r.status, reason=r.reason, refund_handling_mode=r.refund_handling_mode,
                               review_comment=r.review_comment, reviewed_at=r.reviewed_at, created_at=r.created_at) for r in rows]


def to_public(session: Session, request: event_cancellation_requests) -> CancellationPublic:
    return to_public_list(session, [request])[0]


def ever_issued(session: Session, event_id: uuid.UUID) -> bool:
    return session.exec(select(tickets.id).where(tickets.event_id == event_id).limit(1)).first() is not None


def lock_request(session: Session, request_id: uuid.UUID) -> tuple[events, event_cancellation_requests]:
    snapshot = session.get(event_cancellation_requests, request_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cancellation request not found")
    event = get_event_or_404(session, snapshot.event_id, for_update=True)
    request = session.exec(select(event_cancellation_requests).where(event_cancellation_requests.id == request_id)
                           .with_for_update().execution_options(populate_existing=True)).one()
    return event, request


@router.post("/events/{event_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
def cancel_directly(event_id: uuid.UUID, data: CancellationCreate, background: BackgroundTasks, session: Session = Depends(get_session),
                    current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    if event.status in (EventLifecycleStatus.CANCELLED, EventLifecycleStatus.COMPLETED):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Event is already {event.status.value}")
    if ever_issued(session, event.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Tickets were already issued; submit a cancellation request for administrator review")
    now = db_now(session)
    service.cancel_event(session, event, current_user.id, service.default_mode(event, now), data.reason.strip(), now)
    session.commit()
    run_background(background)
    return {"status": "CANCELLED"}


@router.post("/events/{event_id}/cancellation-requests", response_model=CancellationPublic, status_code=status.HTTP_201_CREATED)
def request_cancellation(event_id: uuid.UUID, data: CancellationCreate, background: BackgroundTasks, session: Session = Depends(get_session),
                         current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event = get_event_or_404(session, event_id, for_update=True)
    if event.status != EventLifecycleStatus.PUBLISHED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only published events need a cancellation request")
    if session.exec(select(event_cancellation_requests.id).where(event_cancellation_requests.event_id == event.id, event_cancellation_requests.status == "PENDING")).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "A cancellation request is already pending")
    request = event_cancellation_requests(event_id=event.id, requested_by_user_id=current_user.id, status="PENDING", reason=data.reason.strip())
    session.add(request)
    session.flush()
    notify.publish(session, notify.Notice(key=f"CANCELLATION_REQUESTED:{request.id}", event_type="EVENT_CANCELLATION_REQUESTED", aggregate_type="EVENT", aggregate_id=event.id,
                                          title="Event cancellation requested", body=f"Organizer requested cancellation of \"{event.title}\".",
                                          inbox_user_ids=refund_service.admin_ids(session)))
    audit.record(session, action="EVENT_CANCELLATION_REQUESTED", entity_type="EVENT_CANCELLATION_REQUEST", entity_id=request.id, event_id=event.id,
                 actor_user_id=current_user.id, details={"reason": request.reason})
    session.commit()
    background.add_task(notify.deliver_due)
    return to_public(session, request)


@router.get("/events/{event_id}/cancellation-requests", response_model=list[CancellationPublic])
def list_event_cancellations(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    rows = session.exec(select(event_cancellation_requests).where(event_cancellation_requests.event_id == event_id).order_by(event_cancellation_requests.created_at.desc())).all()
    return to_public_list(session, rows)


@router.post("/events/{event_id}/cancellation-requests/{request_id}/withdraw", response_model=CancellationPublic)
def withdraw_cancellation(event_id: uuid.UUID, request_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_organizer(session, event_id, current_user)
    event, request = lock_request(session, request_id)
    if request.event_id != event_id or request.status != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only pending requests can be withdrawn")
    request.status = "WITHDRAWN"
    session.add(request)
    audit.record(session, action="EVENT_CANCELLATION_WITHDRAWN", entity_type="EVENT_CANCELLATION_REQUEST", entity_id=request.id, event_id=event.id, actor_user_id=current_user.id)
    session.commit()
    return to_public(session, request)


@router.get("/admin/cancellation-requests", response_model=list[CancellationPublic])
def admin_cancellations(response: Response, request_status: str = Query(default="PENDING", alias="status"), q: str | None = None,
                        limit: int = Query(default=200, ge=1, le=200), offset: int = Query(default=0, ge=0), session: Session = Depends(get_session),
                        admin: users = Depends(require_admin)):
    query = select(event_cancellation_requests)
    if request_status != "ALL":
        query = query.where(event_cancellation_requests.status == request_status)
    if q and q.strip():
        query = query.where(event_like(event_cancellation_requests.event_id, like_pattern(q)))
    return to_public_list(session, page(session, response, query.order_by(event_cancellation_requests.created_at, event_cancellation_requests.id), limit, offset))


@router.get("/admin/cancellation-requests/{request_id}", response_model=CancellationDetail)
def admin_cancellation(request_id: uuid.UUID, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    request = session.get(event_cancellation_requests, request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cancellation request not found")
    return CancellationDetail(**to_public(session, request).model_dump(), impact=service.impact(session, session.get(events, request.event_id), db_now(session)))


@router.post("/admin/cancellation-requests/{request_id}/approve", response_model=CancellationPublic)
def approve_cancellation(request_id: uuid.UUID, data: CancellationApproval, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    event, request = lock_request(session, request_id)
    if request.status == "APPROVED":
        return to_public(session, request)
    if request.status != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, "Request is not pending")
    if event.status == EventLifecycleStatus.CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is already cancelled")
    now = db_now(session)
    mode = data.refund_handling_mode.value if data.refund_handling_mode else service.default_mode(event, now)
    request.status = "APPROVED"
    request.refund_handling_mode = mode
    request.reviewed_by_user_id = admin.id
    request.reviewed_at = now
    request.review_comment = (data.review_comment or "").strip() or None
    session.add(request)
    audit.record(session, action="EVENT_CANCELLATION_APPROVED", entity_type="EVENT_CANCELLATION_REQUEST", entity_id=request.id, event_id=event.id, actor_user_id=admin.id,
                 details={"refund_handling_mode": mode})
    service.cancel_event(session, event, admin.id, mode, request.reason, now)
    session.commit()
    run_background(background)
    return to_public(session, request)


@router.post("/admin/cancellation-requests/{request_id}/reject", response_model=CancellationPublic)
def reject_cancellation(request_id: uuid.UUID, data: CancellationRejection, background: BackgroundTasks, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    event, request = lock_request(session, request_id)
    if request.status != "PENDING":
        raise HTTPException(status.HTTP_409_CONFLICT, "Request is not pending")
    now = db_now(session)
    request.status = "REJECTED"
    request.reviewed_by_user_id = admin.id
    request.reviewed_at = now
    request.review_comment = data.review_comment.strip()
    session.add(request)
    owner = refund_service.organizer_id(session, event.id)
    if owner:
        notify.publish(session, notify.Notice(key=f"CANCELLATION_REJECTED:{request.id}", event_type="EVENT_CANCELLATION_REJECTED", aggregate_type="EVENT", aggregate_id=event.id,
                                              title="Cancellation rejected", body=f"Cancellation of \"{event.title}\" was rejected: {request.review_comment}", inbox_user_ids=[owner]))
    audit.record(session, action="EVENT_CANCELLATION_REJECTED", entity_type="EVENT_CANCELLATION_REQUEST", entity_id=request.id, event_id=event.id,
                 actor_user_id=admin.id, details={"comment": request.review_comment})
    session.commit()
    background.add_task(notify.deliver_due)
    return to_public(session, request)
