import uuid

from fastapi import HTTPException, status
from sqlmodel import Session, select

from backend.modules.events.models import events, event_applications, private_event_invitations
from backend.modules.events.schemas import EventLifecycleStatus, Visibility, EventStatus
from backend.modules.users.user_model import users, event_user_roles, EventRole, Role
import secrets
import re
from backend.core.clock import db_now
from sqlalchemy import func


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

def has_private_invitation(session: Session, event: events, user: users | None) -> bool:
    if user is None:
        return False
    return session.exec(select(private_event_invitations.id).where(
        private_event_invitations.event_id == event.id, func.lower(private_event_invitations.invited_email) == user.email.lower(),
        private_event_invitations.expires_at > db_now(session),
    ).limit(1)).first() is not None


def can_view_event(session: Session, event: events, user: users | None) -> bool:
    if user is not None and (user.personal_role == Role.PLATFORM_ADMIN or event_roles(session, event.id, user)):
        return True
    if is_publicly_viewable(event):
        return True
    return (event.visibility == Visibility.PRIVATE and event.status in (EventLifecycleStatus.PUBLISHED, EventLifecycleStatus.COMPLETED, EventLifecycleStatus.CANCELLED)
            and has_private_invitation(session, event, user))


def ensure_purchase_access(session: Session, event: events, user: users) -> None:
    if event.visibility == Visibility.PRIVATE and not has_private_invitation(session, event, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "A valid invitation is required for this private event")
_PUBLIC_ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_public_id(length: int = 8) -> str:
    return "".join(secrets.choice(_PUBLIC_ID_ALPHABET) for _ in range(length))

def generate_slug(title: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60] or "event"
    return f"{base}-{secrets.token_hex(3)}"


def require_platform_admin(user: users) -> None:
    if user.personal_role != Role.PLATFORM_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform admin only")


def load_pending_application(session: Session, application_number: str) -> event_applications:
    application = session.exec(
        select(event_applications)
        .where(event_applications.application_number == application_number)
        .with_for_update() 
    ).first()
    if application is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    if application.status != EventStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only pending applications can be reviewed")
    return application
