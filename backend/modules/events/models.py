import uuid
from datetime import datetime, timezone
from enum import Enum
from uuid import UUID
from sqlalchemy import Column, func, UniqueConstraint
from sqlmodel import Field, SQLModel
from sqlalchemy.dialects import postgresql as pg
import sqlalchemy as sa
from backend.modules.events.schemas import Visibility, EventStatus, EventLifecycleStatus, SeatingMode, EventChangeField
import secrets

class event_applications(SQLModel, table=True):
    __tablename__ = "event_applications"

    id : UUID = Field(sa_column=Column(pg.UUID, primary_key=True, nullable=False, default=uuid.uuid4))
    application_number : str = Field(sa_column=Column(pg.VARCHAR, unique=True, nullable=False))
    applicant_user_id : UUID = Field(
        sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
        )
    
    title : str | None = Field(sa_column=Column(pg.TEXT, nullable=True))
    description : str | None = Field(sa_column=Column(pg.TEXT, nullable=True))

    venue_id : UUID = Field(sa_column=Column(pg.UUID, sa.ForeignKey('venues.id', ondelete='CASCADE'), nullable=False)) 
    venue_name_snapshot : str | None = Field(sa_column=Column(pg.TEXT, nullable=True))
    venue_address_snapshot : str | None = Field(sa_column=Column(pg.TEXT, nullable=True))
    venue_city_snapshot : str | None = Field(sa_column=Column(pg.TEXT, nullable=True))

    starts_at : datetime | None = Field(sa_column=Column(pg.TIMESTAMP, nullable=True))
    ends_at : datetime | None = Field(sa_column=Column(pg.TIMESTAMP, nullable=True))
    timezone : str | None = Field(sa_column=Column(pg.TEXT, nullable=True))

    visibility : Visibility | None = Field(sa_column=Column(pg.ENUM(Visibility, name="visibility"), nullable=True))
    seating_mode : SeatingMode | None = Field(sa_column=Column(pg.ENUM(SeatingMode, name="seatingmode"), nullable=True))
    venue_layout_id : UUID = Field(sa_column=Column(pg.UUID, sa.ForeignKey('venue_layouts.id', ondelete='CASCADE'), nullable=True))

    responsible_name : str | None = Field(sa_column=Column(pg.TEXT, nullable=True))
    responsible_email : str | None = Field(sa_column=Column(pg.CITEXT, nullable=True))
    responsible_phone : str | None = Field(sa_column=Column(pg.TEXT, nullable=True))

    intends_paid_sales : bool = Field(sa_column=Column(pg.BOOLEAN, nullable=False, default=False))

    status : EventStatus = Field(sa_column=Column(pg.ENUM(EventStatus, name="eventstatus"), nullable=False))

    organizer_terms_version : str = Field(sa_column=Column(pg.TEXT, nullable=True))
    organizer_terms_accepted_at : datetime | None = Field(sa_column=Column(pg.TIMESTAMP, nullable=True))
    submitted_at : datetime | None = Field(sa_column=Column(pg.TIMESTAMP, nullable=True))

    reviewed_by_user_id : UUID = Field(
        sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True))
    reviewed_at : datetime | None = Field(sa_column=Column(pg.TIMESTAMP, nullable=True))
    review_comment : str | None = Field(sa_column=Column(pg.TEXT, nullable=True))

    created_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, nullable=False, default=datetime.now))
    updated_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, nullable=False, default=datetime.now))

class categories(SQLModel, table=True):
    __tablename__ = 'categories'

    id : UUID = Field(sa_column=Column(pg.UUID, primary_key=True, default=uuid.uuid4))
    name : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    slug : str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    is_activate : bool = Field(sa_column=Column(pg.BOOLEAN, nullable=False))

class event_application_categories(SQLModel, table=True):
    __tablename__ = "event_application_categories"
    application_id : UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("event_applications.id", ondelete="CASCADE"), primary_key=True))
    category_id : UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True))

class event_application_images(SQLModel, table=True):
    __tablename__ = "event_application_images"
    id : UUID = Field(sa_column=Column(pg.UUID, primary_key=True, default=uuid.uuid4))
    application_id : UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey('event_applications.id', ondelete='CASCADE'), nullable=False, unique=True))
    storage_key : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    position : int = Field(sa_column=Column(pg.INTEGER, nullable=False, unique=True))
    created_at : datetime = Field(sa_column=Column(pg.TIMESTAMP, nullable=False))

class events(SQLModel, table=True):
    __tablename__ = "events"

    id : UUID = Field(sa_column=Column(pg.UUID, primary_key=True, nullable=False, default=uuid.uuid4))
    public_id : str = Field(sa_column=Column(pg.VARCHAR, unique=True, nullable=False))
    slug : str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    source_application_id : UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey('event_applications.id', ondelete='CASCADE'), unique=True, nullable=False))
    
    title : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    description : str = Field(sa_column=Column(pg.TEXT, nullable=False))

    venue_id : UUID = Field(sa_column=Column(pg.UUID, sa.ForeignKey('venues.id', ondelete='CASCADE'), nullable=False))
    venue_layout_id : UUID | None = Field(default=None, sa_column=Column(pg.UUID, sa.ForeignKey('venue_layouts.id', ondelete='CASCADE'), nullable=True))

    starts_at : datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    ends_at : datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    timezone : str = Field(sa_column=Column(pg.TEXT, nullable=False))

    visibility : Visibility = Field(sa_column=Column(pg.ENUM(Visibility, name="visibility"), nullable=False))
    seating_mode : SeatingMode = Field(sa_column=Column(pg.ENUM(SeatingMode, name="seatingmode"), nullable=False))
    ga_capacity : int | None = Field(default=None, sa_column=Column(pg.INTEGER, sa.CheckConstraint("ga_capacity IS NULL OR ga_capacity > 0", name="ck_events_ga_capacity_positive"), nullable=True))

    responsible_name : str= Field(sa_column=Column(pg.TEXT, nullable=False))
    responsible_email : str = Field(sa_column=Column(pg.CITEXT, nullable=False))
    responsible_phone : str = Field(sa_column=Column(pg.TEXT, nullable=False))

    public_contact_name : str = Field(sa_column=Column(pg.TEXT, nullable=True))
    public_contact_email : str = Field(sa_column=Column(pg.CITEXT, nullable=True))
    public_contact_phone : str = Field(sa_column=Column(pg.TEXT, nullable=True))

    status : EventLifecycleStatus = Field(default=EventLifecycleStatus.DRAFT, sa_column=Column(pg.ENUM(EventLifecycleStatus, name="event_lifecycle_status"), nullable=False))
    published_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    cancelled_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    completed_at : datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))

    created_at : datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at : datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc)))

class event_change_requests(SQLModel, table=True):
    __tablename__ = "event_change_requests"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    request_number: str = Field(default_factory=lambda: "CR-" + secrets.token_hex(4).upper(), sa_column=Column(sa.String, unique=True, nullable=False))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), nullable=False, index=True))
    requested_by_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True))
    status: EventStatus = Field(default=EventStatus.DRAFT, sa_column=Column(pg.ENUM(EventStatus, name="eventstatus"), nullable=False, server_default=EventStatus.DRAFT.value))
    comment: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    submitted_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    reviewed_by_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    reviewed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    review_comment: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc)))

class event_change_request_items(SQLModel, table=True):
    __tablename__ = "event_change_request_items"

    __table_args__ = (UniqueConstraint("change_request_id", "field", name="uq_change_request_field"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    change_request_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("event_change_requests.id", ondelete="CASCADE"), nullable=False, index=True))
    field: EventChangeField = Field(sa_column=Column(pg.ENUM(EventChangeField, name="event_change_field"), nullable=False))
    old_value: dict | list | str | int | float | bool | None = Field(sa_column=Column(pg.JSONB, nullable=False))
    new_value: dict | list | str | int | float | bool | None = Field(sa_column=Column(pg.JSONB, nullable=False))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))

class event_seats(SQLModel, table=True):
    __tablename__ = "event_seats"

    __table_args__ = (UniqueConstraint("event_id", "seat_id", name="uq_event_seat"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True))
    seat_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("venue_seats.id"), nullable=False, index=True))
    ticket_type_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("ticket_types.id"), nullable=True, index=True))
    is_enabled: bool = Field(default=True, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="true"))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc)))
