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
    __table_args__ = (
        UniqueConstraint("id", "applicant_user_id"),
        sa.CheckConstraint("ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at"),
        sa.CheckConstraint("status <> 'REJECTED' OR length(btrim(coalesce(review_comment, ''))) > 0"),
    )

    id : UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
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

    id : UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
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
    id : UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    application_id : UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey('event_applications.id'), nullable=False))
    storage_key : str = Field(sa_column=Column(pg.TEXT, nullable=False))
    position : int = Field(sa_column=Column(pg.INTEGER, nullable=False))
    created_at : datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))

class events(SQLModel, table=True):
    __tablename__ = "events"

    id : UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
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
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), nullable=False, index=True))
    seat_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("venue_seats.id"), nullable=False))
    ticket_type_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("ticket_types.id"), nullable=True))
    is_enabled: bool = Field(default=True, sa_column=Column(pg.BOOLEAN, nullable=False, server_default=sa.true()))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))

class event_change_requests(SQLModel, table=True):
    __tablename__ = "event_change_requests"
    __table_args__ = (sa.Index("ux_pending_event_change", "event_id", unique=True, postgresql_where=sa.text("status = 'PENDING'")),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
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

    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    change_request_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("event_change_requests.id"), nullable=False, index=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), nullable=False))
    field: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    target_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), nullable=True))
    old_value: dict | list | str | int | float | bool | None = Field(sa_column=Column(pg.JSONB, nullable=False))
    new_value: dict | list | str | int | float | bool | None = Field(sa_column=Column(pg.JSONB, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))

class event_application_agreements(SQLModel, table=True):
    __tablename__ = "event_application_agreements"
    __table_args__ = (UniqueConstraint("application_id", "document_type"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    application_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("event_applications.id"), nullable=False, index=True))
    user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False))
    document_type: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    document_version: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    accepted_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))

class event_categories(SQLModel, table=True):
    __tablename__ = "event_categories"
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), primary_key=True))
    category_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("categories.id"), primary_key=True))

class event_images(SQLModel, table=True):
    __tablename__ = "event_images"
    __table_args__ = (UniqueConstraint("event_id", "position"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), nullable=False))
    storage_key: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    position: int = Field(sa_column=Column(pg.INTEGER, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))

class event_cancellation_requests(SQLModel, table=True):
    __tablename__ = "event_cancellation_requests"
    __table_args__ = (sa.Index("ux_pending_cancellation", "event_id", unique=True, postgresql_where=sa.text("status = 'PENDING'")),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), nullable=False))
    requested_by_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False))
    status: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    reason: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    refund_handling_mode: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    reviewed_by_user_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))
    reviewed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    review_comment: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))

class private_event_invitations(SQLModel, table=True):
    __tablename__ = "private_event_invitations"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), nullable=False, index=True))
    invited_email: str = Field(sa_column=Column(pg.CITEXT, nullable=False))
    invited_by_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False))
    token_hash: str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    expires_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))

class event_staff_invitations(SQLModel, table=True):
    __tablename__ = "event_staff_invitations"
    __table_args__ = (sa.Index("ux_pending_staff_invitation", "event_id", "invited_user_id", "invited_role", unique=True, postgresql_where=sa.text("status = 'PENDING'")),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("events.id"), nullable=False))
    invited_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True))
    invited_by_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False))
    invited_role: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    status: str = Field(default="PENDING", sa_column=Column(pg.TEXT, nullable=False, server_default="PENDING"))
    expires_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    accepted_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    declined_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    revoked_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
