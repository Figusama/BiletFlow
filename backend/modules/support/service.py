import uuid
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.core.config import FRONTEND_URL
from backend.modules.admin.refs import event_refs
from backend.modules.audit import service as audit
from backend.modules.notifications import service as notify
from backend.modules.orders.models import orders
from backend.modules.support.models import support_case_history, support_cases, support_messages
from backend.modules.support.schemas import CaseAssignee, CaseDetail, CasePublic, HistoryPublic, MessagePublic
from backend.modules.users.user_model import EventRole, Role, event_user_roles, profiles, users

REOPEN_WINDOW = timedelta(days=30)
EVENT_HANDLER_ROLES = (EventRole.ORGANIZER, EventRole.EVENT_SUPPORT)


def release_assignments(session: Session, event_id: uuid.UUID, user_id: uuid.UUID, actor_user_id: uuid.UUID | None = None) -> int:
    rows = session.exec(select(support_cases).where(support_cases.event_id == event_id, support_cases.assigned_to_user_id == user_id,
                                                    support_cases.status != "RESOLVED").order_by(support_cases.id).with_for_update()).all()
    for case in rows:
        session.add(support_case_history(support_case_id=case.id, actor_user_id=actor_user_id, action="UNASSIGNED", old_status=case.status, new_status=case.status,
                                         old_assignee_user_id=user_id, new_assignee_user_id=None, details={"reason": "ROLE_REVOKED"}))
        case.assigned_to_user_id = None
        session.add(case)
    return len(rows)


def event_roles_of(session: Session, event_id: uuid.UUID | None, user_id: uuid.UUID) -> set:
    if event_id is None:
        return set()
    return set(session.exec(select(event_user_roles.event_role).where(event_user_roles.event_id == event_id, event_user_roles.user_id == user_id)).all())


def is_admin(user: users) -> bool:
    return user.personal_role == Role.PLATFORM_ADMIN


def platform_handles(case: support_cases) -> bool:
    return case.case_scope == "PLATFORM_SUPPORT" or case.escalated_to_platform


def can_handle(session: Session, case: support_cases, user: users) -> bool:
    if platform_handles(case):
        return is_admin(user)
    return bool(event_roles_of(session, case.event_id, user.id) & set(EVENT_HANDLER_ROLES))


def is_organizer(session: Session, case: support_cases, user: users) -> bool:
    return EventRole.ORGANIZER in event_roles_of(session, case.event_id, user.id)


def can_view(session: Session, case: support_cases, user: users) -> bool:
    if case.requester_user_id == user.id or is_admin(user):
        return True
    return case.case_scope == "EVENT_SUPPORT" and bool(event_roles_of(session, case.event_id, user.id) & set(EVENT_HANDLER_ROLES))


def get_case(session: Session, case_id: uuid.UUID, user: users, lock: bool = False) -> support_cases:
    query = select(support_cases).where(support_cases.id == case_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    case = session.exec(query).first()
    if case is None or not can_view(session, case, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Support case not found")
    return case


def history(session: Session, case: support_cases, actor_id: uuid.UUID | None, action: str, *, old_status=None, new_status=None, old_assignee=None,
            new_assignee=None, details: dict | None = None) -> None:
    session.add(support_case_history(support_case_id=case.id, actor_user_id=actor_id, action=action, old_status=old_status, new_status=new_status,
                                     old_assignee_user_id=old_assignee, new_assignee_user_id=new_assignee, details=details))
    audit_case(session, case, actor_id, action, old_status, new_status)


AUDIT_ACTIONS = {"CREATED": "SUPPORT_CASE_CREATED", "CLAIMED": "SUPPORT_CASE_CLAIMED", "ASSIGNED": "SUPPORT_CASE_REASSIGNED", "RELEASED": "SUPPORT_CASE_RELEASED",
                 "ESCALATED": "SUPPORT_CASE_ESCALATED", "RETURNED_TO_EVENT": "SUPPORT_CASE_RETURNED_TO_EVENT", "STATUS_CHANGED": "SUPPORT_CASE_STATUS_CHANGED",
                 "REOPENED": "SUPPORT_CASE_STATUS_CHANGED"}


def audit_case(session: Session, case: support_cases, actor_id: uuid.UUID | None, action: str, old_status, new_status) -> None:
    if action not in AUDIT_ACTIONS:
        return
    name = AUDIT_ACTIONS[action]
    audit.record(session, action=name, entity_type="SUPPORT_CASE", entity_id=case.id, event_id=case.event_id if case.case_scope == "EVENT_SUPPORT" else None,
                 actor_user_id=actor_id, details={"old_status": old_status, "new_status": new_status} if name == "SUPPORT_CASE_STATUS_CHANGED" else None)


def incoming_unread(session: Session, case: support_cases, for_requester: bool, cursor: int) -> bool:
    sender_filter = support_messages.sender_user_id != case.requester_user_id if for_requester else support_messages.sender_user_id == case.requester_user_id
    return session.exec(select(support_messages.id).where(support_messages.support_case_id == case.id, support_messages.message_seq > cursor, sender_filter).limit(1)).first() is not None


def unread_count(session: Session, case: support_cases, user: users) -> int:
    for_requester = case.requester_user_id == user.id
    cursor = case.requester_last_read_seq if for_requester else case.support_last_read_seq
    sender_filter = support_messages.sender_user_id != case.requester_user_id if for_requester else support_messages.sender_user_id == case.requester_user_id
    return session.exec(select(func.count()).select_from(support_messages).where(support_messages.support_case_id == case.id, support_messages.message_seq > cursor,
                                                                                  sender_filter)).one()


def notify_party(session: Session, case: support_cases, user_id: uuid.UUID | None, key: str, title: str, body: str, email: bool) -> None:
    if user_id is None:
        return
    user = session.get(users, user_id)
    notify.publish(session, notify.Notice(key=key, event_type="SUPPORT_CASE", aggregate_type="SUPPORT_CASE", aggregate_id=case.id, title=title, body=body,
                                          action_url=f"{FRONTEND_URL}/support/{case.id}", inbox_user_ids=[user.id],
                                          emails=[notify.Email(address=user.email, user_id=user.id)] if email else []))


def append_message(session: Session, case: support_cases, sender: users, body: str, client_message_id: uuid.UUID) -> support_messages:
    existing = session.exec(select(support_messages).where(support_messages.support_case_id == case.id, support_messages.sender_user_id == sender.id,
                                                           support_messages.client_message_id == client_message_id)).first()
    if existing is not None:
        if existing.body != body:
            raise HTTPException(status.HTTP_409_CONFLICT, "client_message_id was already used for a different message")
        return existing
    case.last_message_seq += 1
    message = support_messages(support_case_id=case.id, message_seq=case.last_message_seq, sender_user_id=sender.id, client_message_id=client_message_id, body=body)
    session.add(message)
    from_requester = sender.id == case.requester_user_id
    if from_requester:
        case.requester_last_read_seq = case.last_message_seq
        if not case.support_unread_notified and case.assigned_to_user_id is not None:
            case.support_unread_notified = True
            case.support_notice_generation += 1
            notify_party(session, case, case.assigned_to_user_id, f"SUPPORT_UNREAD:{case.id}:support:{case.support_notice_generation}", "New support message",
                         "The customer replied in a support case.", email=False)
    else:
        case.support_last_read_seq = case.last_message_seq
        if not case.requester_unread_notified:
            case.requester_unread_notified = True
            case.requester_notice_generation += 1
            notify_party(session, case, case.requester_user_id, f"SUPPORT_UNREAD:{case.id}:requester:{case.requester_notice_generation}", "Support replied",
                         "You have a new reply in your support case.", email=False)
    session.add(case)
    return message


def mark_read(session: Session, case: support_cases, user: users, up_to_seq: int) -> None:
    if up_to_seq > case.last_message_seq:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown message sequence")
    if case.requester_user_id == user.id:
        case.requester_last_read_seq = max(case.requester_last_read_seq, up_to_seq)
        if not incoming_unread(session, case, True, case.requester_last_read_seq):
            case.requester_unread_notified = False
    else:
        case.support_last_read_seq = max(case.support_last_read_seq, up_to_seq)
        if not incoming_unread(session, case, False, case.support_last_read_seq):
            case.support_unread_notified = False
    session.add(case)


def can_reopen(case: support_cases, now) -> bool:
    return case.status == "RESOLVED" and case.resolved_at is not None and now - as_aware(case.resolved_at) <= REOPEN_WINDOW


def full_names(session: Session, user_ids) -> dict[uuid.UUID, str]:
    return dict(session.exec(select(profiles.user_id, profiles.full_name).where(profiles.user_id.in_({i for i in user_ids if i is not None}))).all())


def to_public_list(session: Session, cases: list[support_cases], viewer: users) -> list[CasePublic]:
    names = full_names(session, [i for c in cases for i in (c.requester_user_id, c.assigned_to_user_id)])
    numbers = dict(session.exec(select(orders.id, orders.order_number).where(orders.id.in_({c.order_id for c in cases if c.order_id is not None}))).all())
    refs = event_refs(session, [c.event_id for c in cases])
    computed = {"unread", "requester_name", "assignee_name", "order_number", "event_title", "event_public_id", "organizer_name"}
    return [CasePublic(**case.model_dump(include=set(CasePublic.model_fields) - computed), event_title=refs[case.event_id].title if case.event_id else None,
                       event_public_id=refs[case.event_id].public_id if case.event_id else None,
                       organizer_name=refs[case.event_id].organizer_name if case.event_id and is_admin(viewer) else None,
                       unread=unread_count(session, case, viewer), requester_name=names.get(case.requester_user_id), assignee_name=names.get(case.assigned_to_user_id),
                       order_number=numbers.get(case.order_id)) for case in cases]


def to_public(session: Session, case: support_cases, viewer: users) -> CasePublic:
    return to_public_list(session, [case], viewer)[0]


def platform_staff(session: Session) -> list[users]:
    return list(session.exec(select(users).where(users.personal_role == Role.PLATFORM_ADMIN, users.is_suspended.is_(False))).all())


def assignees(session: Session, case: support_cases) -> list[CaseAssignee]:
    if platform_handles(case):
        rows = [(u, "PLATFORM_ADMIN") for u in platform_staff(session)]
    else:
        rows = [(u, role.value) for u, role in session.exec(select(users, event_user_roles.event_role).join(event_user_roles, event_user_roles.user_id == users.id).where(
            event_user_roles.event_id == case.event_id, event_user_roles.event_role.in_(EVENT_HANDLER_ROLES), users.is_suspended.is_(False))).all()]
    names = full_names(session, [u.id for u, _ in rows])
    people: dict[uuid.UUID, CaseAssignee] = {}
    for user, role in rows:
        people.setdefault(user.id, CaseAssignee(user_id=user.id, full_name=names.get(user.id), roles=[], is_current=user.id == case.assigned_to_user_id)).roles.append(role)
    return sorted(people.values(), key=lambda p: (p.full_name or "", str(p.user_id)))


def to_detail(session: Session, case: support_cases, viewer: users) -> CaseDetail:
    messages = session.exec(select(support_messages).where(support_messages.support_case_id == case.id).order_by(support_messages.message_seq)).all()
    entries = session.exec(select(support_case_history).where(support_case_history.support_case_id == case.id).order_by(support_case_history.created_at)).all()
    names = full_names(session, [m.sender_user_id for m in messages] + [i for h in entries for i in (h.actor_user_id, h.old_assignee_user_id, h.new_assignee_user_id)])
    base = to_public(session, case, viewer)
    return CaseDetail(**base.model_dump(),
                      messages=[MessagePublic(id=m.id, seq=m.message_seq, sender_user_id=m.sender_user_id, sender_name=names.get(m.sender_user_id),
                                              from_requester=m.sender_user_id == case.requester_user_id, body=m.body, created_at=m.created_at) for m in messages],
                      history=[HistoryPublic(action=h.action, actor_user_id=h.actor_user_id, actor_name=names.get(h.actor_user_id), old_status=h.old_status, new_status=h.new_status,
                                             old_assignee_user_id=h.old_assignee_user_id, old_assignee_name=names.get(h.old_assignee_user_id),
                                             new_assignee_user_id=h.new_assignee_user_id, new_assignee_name=names.get(h.new_assignee_user_id),
                                             created_at=h.created_at) for h in entries])


def now_of(session: Session):
    return db_now(session)
