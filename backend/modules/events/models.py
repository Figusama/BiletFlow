import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import CITEXT
from sqlmodel import Field, SQLModel

from core.timeutils import utcnow


class EventStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class EventVisibility(str, Enum):
    PUBLIC = "PUBLIC"
    UNLISTED = "UNLISTED"
    PRIVATE = "PRIVATE"


class SeatingMode(str, Enum):
    GENERAL_ADMISSION = "GENERAL_ADMISSION"
    ASSIGNED_SEATING = "ASSIGNED_SEATING"


class Event(SQLModel, table=True):
    __tablename__ = "events"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    public_id: str = Field(unique=True, max_length=20)
    slug: str = Field(unique=True, max_length=120)
    source_application_id: uuid.UUID = Field(foreign_key="event_applications.id", unique=True)

    title: str
    description: str

    venue_id: uuid.UUID = Field(foreign_key="venues.id", index=True)
    venue_layout_id: uuid.UUID | None = Field(default=None, foreign_key="venue_layouts.id")

    starts_at: datetime = Field(sa_type=DateTime(timezone=True), index=True)
    ends_at: datetime = Field(sa_type=DateTime(timezone=True))
    timezone: str = Field(max_length=64)

    visibility: EventVisibility
    seating_mode: SeatingMode

    responsible_name: str
    responsible_email: str = Field(sa_type=CITEXT)
    responsible_phone: str = Field(max_length=16)

    public_contact_name: str | None = None
    public_contact_email: str | None = Field(default=None, sa_type=CITEXT)
    public_contact_phone: str | None = Field(default=None, max_length=16)

    status: EventStatus = Field(default=EventStatus.DRAFT, index=True)
    published_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    cancelled_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    completed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))

    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(
        default_factory=utcnow, sa_type=DateTime(timezone=True), sa_column_kwargs={"onupdate": utcnow}
    )


class EventCategory(SQLModel, table=True):
    __tablename__ = "event_categories"

    event_id: uuid.UUID = Field(foreign_key="events.id", primary_key=True, ondelete="CASCADE")
    category_id: uuid.UUID = Field(foreign_key="categories.id", primary_key=True)


class EventImage(SQLModel, table=True):
    __tablename__ = "event_images"
    __table_args__ = (
        UniqueConstraint("event_id", "position", deferrable=True, initially="DEFERRED"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    event_id: uuid.UUID = Field(foreign_key="events.id", index=True, ondelete="CASCADE")
    storage_key: str
    position: int
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
