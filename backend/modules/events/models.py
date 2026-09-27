import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel

from core.timeutils import utcnow


class EventStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class EventVisibility(str, Enum):
    PUBLIC = "public"
    UNLISTED = "unlisted"
    PRIVATE = "private"


class Event(SQLModel, table=True):
    __tablename__ = "events"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organizer_id: uuid.UUID = Field(foreign_key="organizer_profiles.id", index=True)
    slug: str = Field(unique=True, max_length=120)
    title: str = Field(max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=50)
    cover_image_url: str | None = None
    venue_name: str | None = Field(default=None, max_length=200)
    venue_address: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=100)
    starts_at: datetime = Field(sa_type=DateTime(timezone=True))
    ends_at: datetime = Field(sa_type=DateTime(timezone=True))
    timezone: str = "Asia/Almaty"
    status: str = Field(default=EventStatus.DRAFT.value, max_length=20)
    visibility: str = Field(default=EventVisibility.PUBLIC.value, max_length=20)
    paid_sales_active: bool = False
    published_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
