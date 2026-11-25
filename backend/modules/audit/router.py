import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import AwareDatetime
from sqlalchemy import func
from sqlmodel import Session, select

from backend.modules.audit.catalog import ACTIONS, CATEGORIES, describe
from backend.modules.audit.models import audit_logs
from backend.modules.audit.presentation import entity_labels, safe_details
from backend.modules.audit.schemas import HistoryActor, HistoryEntry, HistoryPage
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import require_organizer
from backend.modules.users.user_model import event_user_roles, profiles, users, Role
from database.database import get_session

router = APIRouter(tags=["history"])


def actors_for(session: Session, rows: list[audit_logs], event_id: uuid.UUID | None, full_identity: bool) -> dict[uuid.UUID, HistoryActor]:
    ids = {row.actor_user_id for row in rows if row.actor_user_id}
    if not ids:
        return {}
    people = {user.id: user for user in session.exec(select(users).where(users.id.in_(ids))).all()}
    names = dict(session.exec(select(profiles.user_id, profiles.full_name).where(profiles.user_id.in_(ids))).all())
    staff = {}
    if event_id is not None:
        for user_id, role in session.exec(select(event_user_roles.user_id, event_user_roles.event_role).where(event_user_roles.event_id == event_id, event_user_roles.user_id.in_(ids))).all():
            staff.setdefault(user_id, []).append(role.value)
    result = {}
    for user_id in ids:
        user = people.get(user_id)
        name = names.get(user_id) or "User"
        if full_identity:
            label = f"{name} <{user.email}>" if user else name
            result[user_id] = HistoryActor(kind="user", user_id=user_id, display_name=label)
        elif user is not None and user.personal_role == Role.PLATFORM_ADMIN:
            result[user_id] = HistoryActor(kind="platform_admin", user_id=None, display_name="Platform administrator")
        elif user_id in staff:
            result[user_id] = HistoryActor(kind="staff", user_id=user_id, display_name=f"{name} ({', '.join(sorted(staff[user_id]))})")
        else:
            result[user_id] = HistoryActor(kind="attendee", user_id=None, display_name="Attendee")
    return result


def history_page(session: Session, query, count_query, limit: int, offset: int, event_id: uuid.UUID | None, full_identity: bool) -> HistoryPage:
    total = session.exec(count_query).one()
    rows = session.exec(query.order_by(audit_logs.created_at.desc(), audit_logs.id.desc()).limit(limit).offset(offset)).all()
    actors = actors_for(session, rows, event_id, full_identity)
    labels = entity_labels(session, rows)
    items = []
    for row in rows:
        category, description = describe(row.action_type)
        actor = actors.get(row.actor_user_id) if row.actor_user_id else HistoryActor(kind="system", user_id=None, display_name="System")
        items.append(HistoryEntry(
            id=row.id, created_at=row.created_at, action_type=row.action_type, category=category, description=description,
            result=row.result, actor=actor, entity_type=row.entity_type, entity_id=row.entity_id,
            entity_label=labels.get((row.entity_type, row.entity_id)), details=safe_details(row),
        ))
    return HistoryPage(total=total, limit=limit, offset=offset, items=items)


def history_filters(date_from, date_to, categories: list[str] | None, action_types: list[str] | None) -> list:
    conditions = []
    if date_from is not None:
        conditions.append(audit_logs.created_at >= date_from)
    if date_to is not None:
        conditions.append(audit_logs.created_at < date_to)
    wanted = set(action_types or [])
    if categories:
        unknown = set(categories) - set(CATEGORIES)
        if unknown:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown categories: {', '.join(sorted(unknown))}")
        wanted |= {action for action, (category, _) in ACTIONS.items() if category in categories}
    if categories or action_types:
        conditions.append(audit_logs.action_type.in_(sorted(wanted)))
    return conditions


@router.get("/events/{event_id}/history", response_model=HistoryPage)
def event_history(
    event_id: uuid.UUID,
    date_from: AwareDatetime | None = Query(default=None, alias="from"),
    date_to: AwareDatetime | None = Query(default=None, alias="to"),
    category: list[str] | None = Query(default=None),
    action_type: list[str] | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: users = Depends(get_current_user),
):
    require_organizer(session, event_id, current_user)
    is_admin = current_user.personal_role == Role.PLATFORM_ADMIN
    conditions = [audit_logs.event_id == event_id, *history_filters(date_from, date_to, category, action_type)]
    if not is_admin:
        conditions.append(audit_logs.result == "SUCCESS")
    query = select(audit_logs).where(*conditions)
    count_query = select(func.count()).select_from(audit_logs).where(*conditions)
    return history_page(session, query, count_query, limit, offset, event_id, full_identity=False)


@router.get("/history/categories", response_model=list[str])
def history_categories():
    return CATEGORIES
