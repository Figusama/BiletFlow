import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from slugify import slugify
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.timeutils import as_utc, utcnow
from db.session import get_session
from modules.auth.dependencies import get_current_user, get_optional_user
from modules.events.models import Event, EventStatus, EventVisibility
from modules.events.schemas import EventCreate, EventRead, EventUpdate
from modules.users.models import OrganizerProfile, User

router = APIRouter(prefix="/events", tags=["events"])


async def get_organizer(session: AsyncSession, user: User) -> OrganizerProfile | None:
    result = await session.exec(select(OrganizerProfile).where(OrganizerProfile.user_id == user.id))
    return result.first()


async def is_owner(session: AsyncSession, user: User | None, event: Event) -> bool:
    if user is None:
        return False
    if user.is_platform_admin:
        return True
    organizer = await get_organizer(session, user)
    return organizer is not None and organizer.id == event.organizer_id


async def get_own_event(session: AsyncSession, user: User, event_id: uuid.UUID) -> Event:
    event = await session.get(Event, event_id)
    if event is None or not await is_owner(session, user, event):
        raise HTTPException(404, "Event not found")
    return event


async def save(session: AsyncSession, event: Event) -> Event:
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


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
        Event.status == EventStatus.PUBLISHED.value,
        Event.visibility == EventVisibility.PUBLIC.value,
        Event.ends_at > utcnow(),
    )
    if city:
        query = query.where(col(Event.city).ilike(city))
    if category:
        query = query.where(Event.category == category)
    if q:
        query = query.where(col(Event.title).ilike(f"%{q}%"))
    query = query.order_by(col(Event.starts_at)).offset(offset).limit(min(limit, 100))
    return (await session.exec(query)).all()


@router.post("", response_model=EventRead, status_code=201)
async def create_event(
    data: EventCreate, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    if user.email_verified_at is None:
        raise HTTPException(403, "Email is not verified")
    organizer = await get_organizer(session, user)
    if organizer is None:
        raise HTTPException(403, "Organizer profile is required")
    slug = f"{slugify(data.title, max_length=80) or 'event'}-{secrets.token_hex(3)}"
    return await save(session, Event(**data.model_dump(), organizer_id=organizer.id, slug=slug))


@router.get("/mine", response_model=list[EventRead])
async def my_events(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    organizer = await get_organizer(session, user)
    if organizer is None:
        return []
    query = select(Event).where(Event.organizer_id == organizer.id).order_by(col(Event.starts_at).desc())
    return (await session.exec(query)).all()


@router.get("/{event_id}", response_model=EventRead)
async def get_event(
    event_id: uuid.UUID, user: User | None = Depends(get_optional_user), session: AsyncSession = Depends(get_session)
):
    event = await session.get(Event, event_id)
    if event is None:
        raise HTTPException(404, "Event not found")
    hidden = event.status == EventStatus.DRAFT.value or event.visibility == EventVisibility.PRIVATE.value
    if hidden and not await is_owner(session, user, event):
        raise HTTPException(404, "Event not found")
    return event


@router.patch("/{event_id}", response_model=EventRead)
async def update_event(
    event_id: uuid.UUID,
    data: EventUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    event = await get_own_event(session, user, event_id)
    if event.status not in (EventStatus.DRAFT.value, EventStatus.PUBLISHED.value):
        raise HTTPException(409, "This event can no longer be edited")
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    starts_at = as_utc(changes.get("starts_at", event.starts_at))
    ends_at = as_utc(changes.get("ends_at", event.ends_at))
    if ends_at <= starts_at:
        raise HTTPException(422, "ends_at must be after starts_at")
    for field, value in changes.items():
        setattr(event, field, value)
    return await save(session, event)


@router.post("/{event_id}/publish", response_model=EventRead)
async def publish_event(
    event_id: uuid.UUID, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    event = await get_own_event(session, user, event_id)
    if event.status != EventStatus.DRAFT.value:
        raise HTTPException(409, "Only draft events can be published")
    if not event.venue_name:
        raise HTTPException(422, "Venue is required")
    event.status = EventStatus.PUBLISHED.value
    event.published_at = utcnow()
    return await save(session, event)


@router.post("/{event_id}/cancel", response_model=EventRead)
async def cancel_event(
    event_id: uuid.UUID, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    event = await get_own_event(session, user, event_id)
    if event.status not in (EventStatus.DRAFT.value, EventStatus.PUBLISHED.value):
        raise HTTPException(409, "This event cannot be cancelled")
    event.status = EventStatus.CANCELLED.value
    return await save(session, event)
