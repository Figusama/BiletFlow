import uuid
from collections import defaultdict

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.storage import ImageRead, file_url
from modules.categories.models import Category
from modules.categories.schemas import CategoryRead
from modules.events.models import Event, EventCategory, EventImage
from modules.events.schemas import EventManageRead, EventRead
from modules.venues.models import Venue
from modules.venues.schemas import VenueRead


async def _load_related(session: AsyncSession, events: list[Event]):
    event_ids = [event.id for event in events]
    venue_ids = {event.venue_id for event in events}

    venues = (await session.exec(select(Venue).where(col(Venue.id).in_(venue_ids)))).all()

    categories: dict[uuid.UUID, list[CategoryRead]] = defaultdict(list)
    rows = await session.exec(
        select(EventCategory.event_id, Category)
        .join(Category, col(Category.id) == EventCategory.category_id)
        .where(col(EventCategory.event_id).in_(event_ids))
        .order_by(col(Category.name))
    )
    for event_id, category in rows.all():
        categories[event_id].append(CategoryRead.model_validate(category, from_attributes=True))

    images: dict[uuid.UUID, list[ImageRead]] = defaultdict(list)
    rows = await session.exec(
        select(EventImage).where(col(EventImage.event_id).in_(event_ids)).order_by(col(EventImage.position))
    )
    for image in rows.all():
        images[image.event_id].append(
            ImageRead(id=image.id, url=file_url(image.storage_key), position=image.position)
        )

    return {venue.id: VenueRead.model_validate(venue, from_attributes=True) for venue in venues}, categories, images


async def build_event_reads(
    session: AsyncSession, events: list[Event], schema: type[EventRead] = EventRead
) -> list[EventRead]:
    if not events:
        return []
    venues, categories, images = await _load_related(session, events)
    return [
        schema.model_validate(
            {
                **event.model_dump(),
                "venue": venues[event.venue_id],
                "categories": categories[event.id],
                "images": images[event.id],
            }
        )
        for event in events
    ]


async def build_event_read(session: AsyncSession, event: Event, manage: bool = False) -> EventRead:
    schema = EventManageRead if manage else EventRead
    return (await build_event_reads(session, [event], schema))[0]
