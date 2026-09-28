import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


class EventStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class EventVisibility(str, Enum):
    PUBLIC = "public"
    UNLISTED = "unlisted"
    PRIVATE = "private"


class SeatingType(str, Enum):
    GENERAL_ADMISSION = "general_admission"
    ASSIGNED = "assigned"


class Event(SQLModel, table=True):
    __tablename__ = "events"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organizer_profile_id: uuid.UUID = Field(foreign_key="organizer_profiles.id", index=True)
    title: str = Field(max_length=200)
    slug: str = Field(unique=True, max_length=120)
    description: str | None = None
    category: str | None = Field(default=None, max_length=50)
    venue_id: uuid.UUID | None = Field(default=None, foreign_key="venues.id")
    visibility: str = Field(default=EventVisibility.PUBLIC.value, max_length=20)
    status: str = Field(default=EventStatus.DRAFT.value, max_length=20)
    seating_type: str = Field(default=SeatingType.GENERAL_ADMISSION.value, max_length=20)
    capacity: int | None = None
    registration_opens_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    registration_closes_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    event_start_at: datetime = Field(sa_type=DateTime(timezone=True))
    event_end_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    paid_sales_active: bool = False
