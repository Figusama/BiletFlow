import uuid
from dataclasses import dataclass

from sqlalchemy import exists, or_
from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from backend.modules.events.models import events
from backend.modules.users.user_model import EventRole, event_user_roles, profiles, users


@dataclass(frozen=True)
class EventRef:
    title: str
    public_id: str
    organizer_id: uuid.UUID | None = None
    organizer_name: str | None = None
    organizer_email: str | None = None


def event_refs(session: Session, event_ids) -> dict[uuid.UUID, EventRef]:
    ids = {i for i in event_ids if i is not None}
    if not ids:
        return {}
    owners = {event_id: (user_id, name, email) for event_id, user_id, name, email in session.exec(
        select(event_user_roles.event_id, users.id, profiles.full_name, users.email).join(users, users.id == event_user_roles.user_id)
        .outerjoin(profiles, profiles.user_id == users.id).where(event_user_roles.event_id.in_(ids), event_user_roles.event_role == EventRole.ORGANIZER)).all()}
    return {event_id: EventRef(title, public_id, *owners.get(event_id, (None, None, None)))
            for event_id, title, public_id in session.exec(select(events.id, events.title, events.public_id).where(events.id.in_(ids))).all()}


def people(session: Session, user_ids) -> dict[uuid.UUID, tuple[str | None, str]]:
    ids = {i for i in user_ids if i is not None}
    if not ids:
        return {}
    return {user_id: (name, email) for user_id, name, email in session.exec(
        select(users.id, profiles.full_name, users.email).outerjoin(profiles, profiles.user_id == users.id).where(users.id.in_(ids))).all()}


def person_like(user_id, pattern: str):
    person, profile = aliased(users), aliased(profiles)
    return or_(exists().where(person.id == user_id, or_(person.email.ilike(pattern), person.public_id.ilike(pattern))),
               exists().where(profile.user_id == user_id, profile.full_name.ilike(pattern)))


def organizer_like(event_id, pattern: str):
    role = aliased(event_user_roles)
    return exists().where(role.event_id == event_id, role.event_role == EventRole.ORGANIZER, person_like(role.user_id, pattern))


def event_like(event_id, pattern: str):
    event = aliased(events)
    return or_(exists().where(event.id == event_id, or_(event.title.ilike(pattern), event.public_id.ilike(pattern), event.slug.ilike(pattern))),
               organizer_like(event_id, pattern))
