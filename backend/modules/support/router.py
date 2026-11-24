import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.modules.admin.router import require_admin
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import can_view_event, get_event_or_404, require_event_role
from backend.modules.notifications import service as notify
from backend.modules.orders.models import orders
from backend.modules.support import service
from backend.modules.support.models import support_cases
from backend.modules.support.schemas import Assignment, CaseCreate, CaseDetail, CasePublic, CaseScope, CaseStatus, MessageCreate, ReadMark, StatusChange
from backend.modules.tickets.models import tickets
from backend.modules.users.user_model import EventRole, users
from database.database import get_session

router = APIRouter(tags=["support"])


@router.post("/support/cases", response_model=CaseDetail, status_code=status.HTTP_201_CREATED)
def open_case(data: CaseCreate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event_id = data.event_id
    if data.order_id:
        order = session.get(orders, data.order_id)
        if order is None or order.buyer_user_id != current_user.id or (event_id and order.event_id != event_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Order does not belong to you or to this event")
        event_id = order.event_id
    if data.ticket_id:
        ticket = session.get(tickets, data.ticket_id)
        ticket_order = session.get(orders, ticket.order_id) if ticket else None
        if ticket is None or ticket_order.buyer_user_id != current_user.id or (event_id and ticket.event_id != event_id) or (data.order_id and ticket.order_id != data.order_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ticket does not belong to you or to this event")
        event_id = ticket.event_id
    if event_id:
        event = get_event_or_404(session, event_id)
        if not (data.order_id or data.ticket_id) and not can_view_event(session, event, current_user):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    if data.case_scope == CaseScope.EVENT_SUPPORT and event_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Event support cases need an event")
    if data.previous_case_id:
        previous = session.get(support_cases, data.previous_case_id)
        if previous is None or previous.requester_user_id != current_user.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Previous case not found")
    subject = (data.custom_subject or "").strip() or None
    case = support_cases(requester_user_id=current_user.id, case_scope=data.case_scope.value, event_id=event_id, order_id=data.order_id, ticket_id=data.ticket_id,
                         previous_case_id=data.previous_case_id, category=data.category.value, custom_subject=subject, status="OPEN")
    session.add(case)
    session.flush()
    service.history(session, case, current_user.id, "CREATED", new_status="OPEN")
    service.append_message(session, case, current_user, data.message.strip(), data.client_message_id)
    session.commit()
    session.refresh(case)
    return service.to_detail(session, case, current_user)


@router.get("/support/cases/mine", response_model=list[CasePublic])
def my_cases(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    rows = session.exec(select(support_cases).where(support_cases.requester_user_id == current_user.id).order_by(support_cases.updated_at.desc())).all()
    return [service.to_public(session, c, current_user) for c in rows]


@router.get("/support/cases/assigned", response_model=list[CasePublic])
def assigned_cases(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    rows = session.exec(select(support_cases).where(support_cases.assigned_to_user_id == current_user.id, support_cases.status != "RESOLVED")
                        .order_by(support_cases.updated_at.desc())).all()
    return [service.to_public(session, c, current_user) for c in rows]


@router.get("/events/{event_id}/support/cases", response_model=list[CasePublic])
def event_queue(event_id: uuid.UUID, case_status: CaseStatus | None = Query(default=None, alias="status"), session: Session = Depends(get_session),
                current_user: users = Depends(get_current_user)):
    require_event_role(session, event_id, current_user, (EventRole.ORGANIZER, EventRole.EVENT_SUPPORT), allow_platform_admin=True)
    query = select(support_cases).where(support_cases.event_id == event_id, support_cases.case_scope == "EVENT_SUPPORT")
    if case_status:
        query = query.where(support_cases.status == case_status.value)
    return [service.to_public(session, c, current_user) for c in session.exec(query.order_by(support_cases.updated_at.desc())).all()]


@router.get("/admin/support/cases", response_model=list[CasePublic])
def platform_queue(case_status: CaseStatus | None = Query(default=None, alias="status"), session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    query = select(support_cases).where((support_cases.case_scope == "PLATFORM_SUPPORT") | support_cases.escalated_to_platform.is_(True))
    if case_status:
        query = query.where(support_cases.status == case_status.value)
    return [service.to_public(session, c, admin) for c in session.exec(query.order_by(support_cases.updated_at.desc())).all()]


@router.get("/support/cases/{case_id}", response_model=CaseDetail)
def read_case(case_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    return service.to_detail(session, service.get_case(session, case_id, current_user), current_user)


@router.post("/support/cases/{case_id}/messages", response_model=CaseDetail, status_code=status.HTTP_201_CREATED)
def send_message(case_id: uuid.UUID, data: MessageCreate, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    case = service.get_case(session, case_id, current_user, lock=True)
    body = data.body.strip()
    if not body:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Message is empty")
    if case.requester_user_id == current_user.id:
        if case.status == "RESOLVED":
            raise HTTPException(status.HTTP_409_CONFLICT, "Case is resolved; reopen it first")
        if case.status == "WAITING_FOR_CUSTOMER":
            service.history(session, case, current_user.id, "STATUS_CHANGED", old_status=case.status, new_status="IN_PROGRESS")
            case.status = "IN_PROGRESS"
    else:
        if not service.can_handle(session, case, current_user) or case.assigned_to_user_id != current_user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Take the case in work before replying")
        if case.status == "RESOLVED":
            raise HTTPException(status.HTTP_409_CONFLICT, "Case is resolved")
    service.append_message(session, case, current_user, body, data.client_message_id)
    session.commit()
    session.refresh(case)
    background.add_task(notify.deliver_due)
    return service.to_detail(session, case, current_user)


@router.post("/support/cases/{case_id}/read", response_model=CasePublic)
def read_up_to(case_id: uuid.UUID, data: ReadMark, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    case = service.get_case(session, case_id, current_user, lock=True)
    if case.requester_user_id != current_user.id and not service.can_handle(session, case, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    service.mark_read(session, case, current_user, data.up_to_seq)
    session.commit()
    session.refresh(case)
    return service.to_public(session, case, current_user)


def _staff_case(session: Session, case_id: uuid.UUID, user: users) -> support_cases:
    case = service.get_case(session, case_id, user, lock=True)
    if not service.can_handle(session, case, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not handle this case")
    return case


@router.post("/support/cases/{case_id}/claim", response_model=CaseDetail)
def claim(case_id: uuid.UUID, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    case = _staff_case(session, case_id, current_user)
    if case.assigned_to_user_id == current_user.id:
        return service.to_detail(session, case, current_user)
    if case.assigned_to_user_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Case is already taken")
    if case.status == "RESOLVED":
        raise HTTPException(status.HTTP_409_CONFLICT, "Case is resolved")
    service.history(session, case, current_user.id, "CLAIMED", old_status=case.status, new_status="IN_PROGRESS", new_assignee=current_user.id)
    case.assigned_to_user_id = current_user.id
    case.status = "IN_PROGRESS"
    session.add(case)
    service.notify_party(session, case, case.requester_user_id, f"SUPPORT_CLAIMED:{case.id}:{db_now(session).isoformat()}", "Support case taken",
                         "A support agent is now handling your case.", email=True)
    session.commit()
    session.refresh(case)
    background.add_task(notify.deliver_due)
    return service.to_detail(session, case, current_user)


@router.post("/support/cases/{case_id}/release", response_model=CaseDetail)
def release(case_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    case = _staff_case(session, case_id, current_user)
    if case.assigned_to_user_id is None:
        return service.to_detail(session, case, current_user)
    if case.assigned_to_user_id != current_user.id and not service.is_organizer(session, case, current_user) and not service.is_admin(current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the assignee or organizer can release the case")
    service.history(session, case, current_user.id, "RELEASED", old_assignee=case.assigned_to_user_id)
    case.assigned_to_user_id = None
    session.add(case)
    session.commit()
    session.refresh(case)
    return service.to_detail(session, case, current_user)


@router.post("/support/cases/{case_id}/assign", response_model=CaseDetail)
def assign(case_id: uuid.UUID, data: Assignment, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    case = _staff_case(session, case_id, current_user)
    manager = service.is_admin(current_user) if service.platform_handles(case) else service.is_organizer(session, case, current_user)
    if not manager:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the organizer or platform admin can reassign")
    assignee = session.get(users, data.user_id)
    if assignee is None or assignee.is_suspended or not service.can_handle(session, case, assignee):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Assignee is not allowed to handle this case")
    if case.status == "RESOLVED":
        raise HTTPException(status.HTTP_409_CONFLICT, "Case is resolved")
    old = case.assigned_to_user_id
    service.history(session, case, current_user.id, "ASSIGNED", old_status=case.status, new_status="IN_PROGRESS", old_assignee=old, new_assignee=assignee.id)
    case.assigned_to_user_id = assignee.id
    case.status = "IN_PROGRESS"
    session.add(case)
    stamp = db_now(session).isoformat()
    service.notify_party(session, case, assignee.id, f"SUPPORT_ASSIGNED:{case.id}:{stamp}", "Support case assigned", "A support case was assigned to you.", email=True)
    service.notify_party(session, case, case.requester_user_id, f"SUPPORT_REASSIGNED:{case.id}:{stamp}", "Support case reassigned",
                         "Your support case was passed to another agent.", email=True)
    session.commit()
    session.refresh(case)
    background.add_task(notify.deliver_due)
    return service.to_detail(session, case, current_user)


@router.post("/support/cases/{case_id}/status", response_model=CaseDetail)
def change_status(case_id: uuid.UUID, data: StatusChange, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    case = _staff_case(session, case_id, current_user)
    if case.assigned_to_user_id != current_user.id and not service.is_organizer(session, case, current_user) and not service.is_admin(current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Take the case in work first")
    if data.status == CaseStatus.OPEN or case.status == "RESOLVED":
        raise HTTPException(status.HTTP_409_CONFLICT, "Status change not allowed")
    if case.status == data.status.value:
        return service.to_detail(session, case, current_user)
    now = db_now(session)
    service.history(session, case, current_user.id, "STATUS_CHANGED", old_status=case.status, new_status=data.status.value)
    case.status = data.status.value
    case.resolved_at = now if data.status == CaseStatus.RESOLVED else None
    session.add(case)
    if data.status in (CaseStatus.WAITING_FOR_CUSTOMER, CaseStatus.RESOLVED):
        title = "Support case resolved" if data.status == CaseStatus.RESOLVED else "Support is waiting for your reply"
        service.notify_party(session, case, case.requester_user_id, f"SUPPORT_STATUS:{case.id}:{data.status.value}:{now.isoformat()}", title, title + ".", email=True)
    audit.record(session, action="SUPPORT_CASE_STATUS_CHANGED", entity_type="SUPPORT_CASE", entity_id=case.id, event_id=case.event_id, actor_user_id=current_user.id,
                 details={"status": data.status.value})
    session.commit()
    session.refresh(case)
    background.add_task(notify.deliver_due)
    return service.to_detail(session, case, current_user)


@router.post("/support/cases/{case_id}/reopen", response_model=CaseDetail)
def reopen(case_id: uuid.UUID, background: BackgroundTasks, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    case = service.get_case(session, case_id, current_user, lock=True)
    if case.requester_user_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the requester can reopen")
    now = db_now(session)
    if not service.can_reopen(case, now):
        raise HTTPException(status.HTTP_409_CONFLICT, "Case can be reopened only within 30 days after resolution; open a new case")
    service.history(session, case, current_user.id, "REOPENED", old_status="RESOLVED", new_status="OPEN")
    assignee = session.get(users, case.assigned_to_user_id) if case.assigned_to_user_id else None
    if assignee is not None and (assignee.is_suspended or not service.can_handle(session, case, assignee)):
        case.assigned_to_user_id = None
    case.status = "OPEN"
    case.resolved_at = None
    session.add(case)
    service.notify_party(session, case, case.assigned_to_user_id, f"SUPPORT_REOPENED:{case.id}:{now.isoformat()}", "Support case reopened",
                         "A resolved case was reopened by the customer.", email=True)
    session.commit()
    session.refresh(case)
    background.add_task(notify.deliver_due)
    return service.to_detail(session, case, current_user)


@router.post("/support/cases/{case_id}/escalate", response_model=CaseDetail)
def escalate(case_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    case = service.get_case(session, case_id, current_user, lock=True)
    if case.case_scope != "EVENT_SUPPORT" or case.escalated_to_platform:
        raise HTTPException(status.HTTP_409_CONFLICT, "Case cannot be escalated")
    if case.requester_user_id != current_user.id and not service.can_handle(session, case, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    service.history(session, case, current_user.id, "ESCALATED", old_assignee=case.assigned_to_user_id)
    case.escalated_to_platform = True
    case.assigned_to_user_id = None
    if case.status == "IN_PROGRESS":
        case.status = "OPEN"
    session.add(case)
    session.commit()
    session.refresh(case)
    return service.to_detail(session, case, current_user)


@router.post("/support/cases/{case_id}/return", response_model=CaseDetail)
def return_to_event(case_id: uuid.UUID, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    case = service.get_case(session, case_id, admin, lock=True)
    if not case.escalated_to_platform:
        raise HTTPException(status.HTTP_409_CONFLICT, "Case is not escalated")
    service.history(session, case, admin.id, "RETURNED_TO_EVENT", old_assignee=case.assigned_to_user_id)
    case.escalated_to_platform = False
    case.assigned_to_user_id = None
    if case.status == "IN_PROGRESS":
        case.status = "OPEN"
    session.add(case)
    session.commit()
    session.refresh(case)
    return service.to_detail(session, case, admin)
