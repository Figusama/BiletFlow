import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import CITEXT
from sqlmodel import Field, SQLModel

from core.timeutils import utcnow
from modules.events.models import EventVisibility, SeatingMode


class ApplicationStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    WITHDRAWN = "WITHDRAWN"


class EventApplication(SQLModel, table=True):
    __tablename__ = "event_applications"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    application_number: str = Field(unique=True, max_length=20)
    applicant_user_id: uuid.UUID = Field(foreign_key="users.id", index=True)

    title: str | None = None
    description: str | None = None

    venue_id: uuid.UUID | None = Field(default=None, foreign_key="venues.id")
    venue_name_snapshot: str | None = None
    venue_address_snapshot: str | None = None
    venue_city_snapshot: str | None = None

    starts_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    ends_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    timezone: str | None = Field(default=None, max_length=64)

    visibility: EventVisibility | None = None
    seating_mode: SeatingMode | None = None
    venue_layout_id: uuid.UUID | None = Field(default=None, foreign_key="venue_layouts.id")

    responsible_name: str | None = None
    responsible_email: str | None = Field(default=None, sa_type=CITEXT)
    responsible_phone: str | None = Field(default=None, max_length=16)

    intends_paid_sales: bool = False

    status: ApplicationStatus = Field(default=ApplicationStatus.DRAFT, index=True)

    organizer_terms_version: str | None = None
    organizer_terms_accepted_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    submitted_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))

    reviewed_by_user_id: uuid.UUID | None = Field(default=None, foreign_key="users.id")
    reviewed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    review_comment: str | None = None

    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
    updated_at: datetime = Field(
        default_factory=utcnow, sa_type=DateTime(timezone=True), sa_column_kwargs={"onupdate": utcnow}
    )


class EventApplicationCategory(SQLModel, table=True):
    __tablename__ = "event_application_categories"

    application_id: uuid.UUID = Field(foreign_key="event_applications.id", primary_key=True, ondelete="CASCADE")
    category_id: uuid.UUID = Field(foreign_key="categories.id", primary_key=True)


class EventApplicationImage(SQLModel, table=True):
    __tablename__ = "event_application_images"
    __table_args__ = (
        UniqueConstraint("application_id", "position", deferrable=True, initially="DEFERRED"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    application_id: uuid.UUID = Field(foreign_key="event_applications.id", index=True, ondelete="CASCADE")
    storage_key: str
    position: int
    created_at: datetime = Field(default_factory=utcnow, sa_type=DateTime(timezone=True))
