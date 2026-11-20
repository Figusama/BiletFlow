import uuid
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import Column, func, UniqueConstraint
from sqlmodel import Field, SQLModel
from sqlalchemy.dialects import postgresql as pg
import sqlalchemy as sa
from backend.core.types import text_enum
from backend.modules.events.schemas import Visibility, EventStatus, EventLifecycleStatus, SeatingMode


def _now() -> datetime:
    return datetime.now(timezone.utc)


class event_applications(SQLModel, table=True):
    __tablename__ = "event_applications"

    id : UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    application_number : str = Field(sa_column=Column(pg.VARCHAR, unique=True, nullable=False))
    applicant_user_id : UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False))

    title : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    description : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))

    venue_id : UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("venues.id"), nullable=True))
    venue_name_snapshot : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    venue_address_snapshot : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    venue_city_snapshot : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))

    starts_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    ends_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    timezone : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))

    visibility : Visibility | None = Field(default=None, sa_column=Column(text_enum(Visibility), nullable=True))
    seating_mode : SeatingMode | None = Field(default=None, sa_column=Column(text_enum(SeatingMode), nullable=True))
    venue_layout_id : UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey('venue_layouts.id'), nullable=True))

    responsible_name : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    responsible_email : str | None = Field(default=None, sa_column=Column(pg.CITEXT, nullable=True))
    responsible_phone : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))

    intends_paid_sales : bool = Field(default=False, sa_column=Column(pg.BOOLEAN, nullable=False, server_default=sa.false()))

    status : EventStatus = Field(default=EventStatus.DRAFT, sa_column=Column(text_enum(EventStatus), nullable=False))

    submitted_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    reviewed_by_user_id : UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    reviewed_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    review_comment : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))

    created_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))

class categories(SQLModel, table=True):
    __tablename__ = 'categories'

    id : UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    name : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    slug : str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    is_active : bool = Field(default=True, sa_column=Column(pg.BOOLEAN, nullable=False, server_default=sa.true()))

class event_application_categories(SQLModel, table=True):
    __tablename__ = "event_application_categories"
    application_id : UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("event_applications.id"), primary_key=True))
    category_id : UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("categories.id"), primary_key=True))

class event_application_images(SQLModel, table=True):
    __tablename__ = "event_application_images"
    __table_args__ = (UniqueConstraint("application_id", "position"),)
    id : UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    application_id : UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey('event_applications.id'), nullable=False))
    storage_key : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    position : int = Field(sa_column=Column(pg.INTEGER, nullable=False))
    created_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))

class events(SQLModel, table=True):
    __tablename__ = "events"

    id : UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    public_id : str = Field(sa_column=Column(pg.VARCHAR, unique=True, nullable=False))
    slug : str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    source_application_id : UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey('event_applications.id'), unique=True, nullable=False))

    title : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    description : str = Field(sa_column=Column(pg.TEXT, nullable=False))

    venue_id : UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey('venues.id'), nullable=False))
    venue_layout_id : UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey('venue_layouts.id'), nullable=True))

    starts_at : datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    ends_at : datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    timezone : str = Field(sa_column=Column(pg.TEXT, nullable=False))

    visibility : Visibility = Field(sa_column=Column(text_enum(Visibility), nullable=False))
    seating_mode : SeatingMode = Field(sa_column=Column(text_enum(SeatingMode), nullable=False))

    responsible_name : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    responsible_email : str = Field(sa_column=Column(pg.CITEXT, nullable=False))
    responsible_phone : str = Field(sa_column=Column(pg.TEXT, nullable=False))

    public_contact_name : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    public_contact_email : str | None = Field(default=None, sa_column=Column(pg.CITEXT, nullable=True))
    public_contact_phone : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    public_instagram_url : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    public_telegram_url : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    public_website_url : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))

    refund_policy : dict = Field(default_factory=dict, sa_column=Column(pg.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")))

    status : EventLifecycleStatus = Field(default=EventLifecycleStatus.DRAFT, sa_column=Column(text_enum(EventLifecycleStatus), nullable=False))
    is_suspended : bool = Field(default=False, sa_column=Column(pg.BOOLEAN, nullable=False, server_default=sa.false()))
    suspended_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    suspension_reason : str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))

    ga_capacity : int | None = Field(default=None, sa_column=Column(pg.INTEGER, nullable=True))
    purchase_terms_version : int = Field(default=1, sa_column=Column(pg.INTEGER, nullable=False, server_default="1"))

    published_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    cancelled_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    completed_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))

    created_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))

class event_seats(SQLModel, table=True):
    __tablename__ = "event_seats"

    __table_args__ = (UniqueConstraint("event_id", "seat_id"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), nullable=False, index=True))
    seat_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("venue_seats.id"), nullable=False))
    ticket_type_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("ticket_types.id"), nullable=True))
    is_enabled: bool = Field(default=True, sa_column=Column(pg.BOOLEAN, nullable=False, server_default=sa.true()))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))

class event_change_requests(SQLModel, table=True):
    __tablename__ = "event_change_requests"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    request_number: str = Field(sa_column=Column(pg.VARCHAR, unique=True, nullable=False))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), nullable=False, index=True))
    requested_by_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False))
    status: EventStatus = Field(default=EventStatus.DRAFT, sa_column=Column(text_enum(EventStatus), nullable=False))
    comment: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    submitted_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    reviewed_by_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    reviewed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    review_comment: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))

class event_change_request_items(SQLModel, table=True):
    __tablename__ = "event_change_request_items"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    change_request_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("event_change_requests.id"), nullable=False, index=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), nullable=False))
    field: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    target_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), nullable=True))
    old_value: dict | list | str | int | float | bool | None = Field(sa_column=Column(pg.JSONB, nullable=False))
    new_value: dict | list | str | int | float | bool | None = Field(sa_column=Column(pg.JSONB, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
