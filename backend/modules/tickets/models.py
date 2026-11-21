import uuid
from datetime import datetime, timezone
from backend.core.types import text_enum
from backend.modules.tickets.schemas import TicketKind, SalesStatus, TicketStatus
from sqlalchemy import Column, ForeignKey, func
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ticket_types(SQLModel, table=True):
    __tablename__ = "ticket_types"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True))
    name: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    description: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    kind: TicketKind = Field(sa_column=Column(text_enum(TicketKind), nullable=False))
    price_minor: int = Field(default=0, sa_column=Column(pg.BIGINT, nullable=False))
    quantity_total: int | None = Field(default=None, sa_column=Column(pg.INTEGER, nullable=True))
    is_active: bool = Field(default=True, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="true"))
    sales_start_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    sales_end_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    sales_status: SalesStatus = Field(default=SalesStatus.ACTIVE, sa_column=Column(text_enum(SalesStatus), nullable=False, server_default=SalesStatus.ACTIVE.value))
    max_per_order: int = Field(sa_column=Column(pg.INTEGER, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))


class tickets(SQLModel, table=True):
    __tablename__ = "tickets"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    public_id: str = Field(sa_column=Column(pg.VARCHAR, unique=True, nullable=False))
    order_item_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("order_items.id"), nullable=False))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False))
    ticket_type_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("ticket_types.id"), nullable=False))
    event_seat_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("event_seats.id"), nullable=True))
    attendee_name: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    section_snapshot: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    row_snapshot: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    seat_snapshot: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    qr_key_id: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    status: TicketStatus = Field(default=TicketStatus.VALID, sa_column=Column(text_enum(TicketStatus), nullable=False, server_default=TicketStatus.VALID.value))
    issued_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))


class check_in_records(SQLModel, table=True):
    __tablename__ = "check_in_records"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    ticket_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("tickets.id"), nullable=False, index=True))
    checked_in_by: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False))
    checked_in_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    reversed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    reversed_by: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=True))
    reversal_reason: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
