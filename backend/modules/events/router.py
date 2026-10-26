import uuid

from fastapi import APIRouter, Depends
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.errors import AppError, not_found
from core.timeutils import as_utc, utcnow
from db.session import get_session
from modules.auth.dependencies import ensure_event_role, get_current_user, get_event_role, get_optional_user
from modules.categories.models import Category
from modules.events.models import Event, EventCategory, EventImage, EventStatus, EventVisibility
from modules.events.schemas import EventManageRead, EventRead, EventUpdate
from modules.events.service import build_event_read, build_event_reads
from modules.users.models import EventRole, EventUserRole, User
from modules.venues.models import Venue

router = APIRouter(prefix="/events", tags=["events"])


async def is_staff(session: AsyncSession, user: User | None, event: Event) -> bool:
    if user is None:
        return False
    return user.is_platform_admin or await get_event_role(session, user, event.id) is not None


async def get_event_for_organizer(session: AsyncSession, user: User, event_id: uuid.UUID, lock: bool = False) -> Event:
    query = select(Event).where(Event.id == event_id)
    if lock:
        query = query.with_for_update()
    event = (await session.exec(query)).first()
    if event is None:
        raise not_found("Event")
    await ensure_event_role(session, user, event.id, EventRole.ORGANIZER)
    return event


def ensure_event_status(event: Event, *allowed: EventStatus) -> None:
    if event.status not in allowed:
        raise AppError(409, "INVALID_EVENT_STATUS", f"Not allowed while the event is {event.status.value}")


@router.get("", response_model=list[EventRead])
async def list_events(
    city: str | None = None,
    category: str | None = None,
    q: str | None = None,
    limit: int = 20,
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
):
    query = select(Event).where(
        Event.status == EventStatus.PUBLISHED,
        Event.visibility == EventVisibility.PUBLIC,
        Event.ends_at > utcnow(),
    )
    if city:
        query = query.join(Venue, col(Venue.id) == Event.venue_id).where(col(Venue.city).ilike(city))
    if category:
        query = (
            query.join(EventCategory, col(EventCategory.event_id) == Event.id)
            .join(Category, col(Category.id) == EventCategory.category_id)
            .where(Category.slug == category)
        )
    if q:
        query = query.where(col(Event.title).ilike(f"%{q}%"))
    query = query.order_by(col(Event.starts_at)).offset(offset).limit(min(limit, 100))
    return await build_event_reads(session, list((await session.exec(query)).all()))


@router.get("/mine", response_model=list[EventManageRead])
async def my_events(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    query = (
        select(Event)
        .join(EventUserRole, col(EventUserRole.event_id) == Event.id)
        .where(EventUserRole.user_id == user.id)
        .order_by(col(Event.starts_at).desc())
    )
    return await build_event_reads(session, list((await session.exec(query)).all()), EventManageRead)


@router.get("/{event_id}", response_model=EventRead)
async def get_event(
    event_id: uuid.UUID, user: User | None = Depends(get_optional_user), session: AsyncSession = Depends(get_session)
):
    event = await session.get(Event, event_id)
    if event is None:
        raise not_found("Event")
    hidden = event.status == EventStatus.DRAFT or event.visibility == EventVisibility.PRIVATE
    if hidden and not await is_staff(session, user, event):
        raise not_found("Event")
    return await build_event_read(session, event)


@router.get("/{event_id}/manage", response_model=EventManageRead)
async def get_event_for_management(
    event_id: uuid.UUID, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    event = await session.get(Event, event_id)
    if event is None or not await is_staff(session, user, event):
        raise not_found("Event")
    return await build_event_read(session, event, manage=True)


@router.patch("/{event_id}", response_model=EventManageRead)
async def update_event(
    event_id: uuid.UUID,
    data: EventUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    event = await get_event_for_organizer(session, user, event_id, lock=True)
    ensure_event_status(event, EventStatus.DRAFT, EventStatus.PUBLISHED)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("visibility", event.visibility) is None:
        changes.pop("visibility")
    for field, value in changes.items():
        setattr(event, field, value)
    session.add(event)
    await session.commit()
    return await build_event_read(session, event, manage=True)


@router.post("/{event_id}/publish", response_model=EventManageRead)
async def publish_event(
    event_id: uuid.UUID, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    event = await get_event_for_organizer(session, user, event_id, lock=True)
    ensure_event_status(event, EventStatus.DRAFT)

    errors: list[str] = []
    if as_utc(event.ends_at) <= utcnow():
        errors.append("ends_at")
    if not (await session.exec(select(EventCategory).where(EventCategory.event_id == event.id))).first():
        errors.append("categories")
    if not (await session.exec(select(EventImage).where(EventImage.event_id == event.id))).first():
        errors.append("images")
    if not event.public_contact_name or not (event.public_contact_email or event.public_contact_phone):
        errors.append("public_contact")
    if errors:
        raise AppError(422, "EVENT_NOT_READY", "Event is not ready to be published", {"fields": errors})

    event.status = EventStatus.PUBLISHED
    event.published_at = utcnow()
    session.add(event)
    await session.commit()
    return await build_event_read(session, event, manage=True)


@router.post("/{event_id}/unpublish", response_model=EventManageRead)
async def unpublish_event(
    event_id: uuid.UUID, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    event = await get_event_for_organizer(session, user, event_id, lock=True)
    ensure_event_status(event, EventStatus.PUBLISHED)
    event.status = EventStatus.DRAFT
    event.published_at = None
    session.add(event)
    await session.commit()
    return await build_event_read(session, event, manage=True)


@router.post("/{event_id}/cancel", response_model=EventManageRead)
async def cancel_event(
    event_id: uuid.UUID, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    event = await get_event_for_organizer(session, user, event_id, lock=True)
    ensure_event_status(event, EventStatus.DRAFT, EventStatus.PUBLISHED)
    event.status = EventStatus.CANCELLED
    event.cancelled_at = utcnow()
    session.add(event)
    await session.commit()
    return await build_event_read(session, event, manage=True)
