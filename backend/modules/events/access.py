import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from backend.modules.events.models import events
from backend.modules.events.schemas import EventLifecycleStatus, Visibility
from backend.modules.users.user_model import users, event_user_roles, EventRole, Role


def get_event_or_404(session: Session, event_id: uuid.UUID, for_update: bool = False) -> events:
    query = select(events).where(events.id == event_id)
    if for_update:
        query = query.with_for_update().execution_options(populate_existing=True)
    event = session.exec(query).first()
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return event


def event_roles(session: Session, event_id: uuid.UUID, user: users) -> set[EventRole]:
    return set(session.exec(select(event_user_roles.event_role).where(event_user_roles.event_id == event_id, event_user_roles.user_id == user.id)).all())


def require_event_role(session: Session, event_id: uuid.UUID, user: users, allowed: tuple[EventRole, ...] = (EventRole.ORGANIZER,), allow_platform_admin: bool = True) -> events:
    event = get_event_or_404(session, event_id)
    if allow_platform_admin and user.personal_role == Role.PLATFORM_ADMIN:
        return event
    if not event_roles(session, event_id, user) & set(allowed):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not manage this event")
    return event


def require_organizer(session: Session, event_id: uuid.UUID, user: users) -> events:
    return require_event_role(session, event_id, user, (EventRole.ORGANIZER,))


def require_checkin_staff(session: Session, event_id: uuid.UUID, user: users, allow_platform_admin: bool = False) -> events:
    return require_event_role(session, event_id, user, (EventRole.ORGANIZER, EventRole.EVENT_ADMIN), allow_platform_admin)


def is_publicly_viewable(event: events) -> bool:
    return event.status in (EventLifecycleStatus.PUBLISHED, EventLifecycleStatus.COMPLETED, EventLifecycleStatus.CANCELLED) and event.visibility in (Visibility.PUBLIC, Visibility.UNLISTED)


def ensure_on_sale(event: events) -> None:
    if event.status == EventLifecycleStatus.CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is cancelled")
    if event.status != EventLifecycleStatus.PUBLISHED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is not on sale")
    if event.is_suspended:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is suspended")
