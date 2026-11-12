import uuid
from datetime import datetime, timezone
from backend.modules.tickets.schemas import TicketKind, SalesStatus, TicketStatus, CheckInAction, ScanResult
from sqlalchemy import Column, ForeignKey, CheckConstraint, Index, UniqueConstraint, func, text
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field


class ticket_types(SQLModel, table=True):
    __tablename__ = "ticket_types"
    __table_args__ = (CheckConstraint("price_minor >= 0", name="ck_ticket_types_price_non_negative"), CheckConstraint("kind <> 'FREE' OR price_minor = 0", name="ck_ticket_types_free_price_zero"), CheckConstraint("kind <> 'PAID' OR price_minor > 0", name="ck_ticket_types_paid_price_positive"), CheckConstraint("quantity_total IS NULL OR quantity_total > 0", name="ck_ticket_types_quantity_positive"), CheckConstraint("sales_end_at > sales_start_at", name="ck_ticket_types_sales_window"), CheckConstraint("max_per_order > 0", name="ck_ticket_types_max_per_order_positive"), UniqueConstraint("id", "event_id", name="uq_ticket_types_id_event"))
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True))
    name: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    description: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    kind: TicketKind = Field(sa_column=Column(pg.ENUM(TicketKind, name="ticket_kind"), nullable=False))
    price_minor: int = Field(default=0, sa_column=Column(pg.BIGINT, nullable=False))
    quantity_total: int | None = Field(default=None, sa_column=Column(pg.INTEGER, nullable=True))
    is_active: bool = Field(default=True, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="true"))
    sales_start_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    sales_end_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    sales_status: SalesStatus = Field(default=SalesStatus.ACTIVE, sa_column=Column(pg.ENUM(SalesStatus, name="sales_status"), nullable=False, server_default=SalesStatus.ACTIVE.value))
    max_per_order: int = Field(sa_column=Column(pg.INTEGER, nullable=False))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc)))


class tickets(SQLModel, table=True):
    __tablename__ = "tickets"
    __table_args__ = (
        Index("uq_tickets_occupied_seat", "event_seat_id", unique=True, postgresql_where=text("event_seat_id IS NOT NULL AND status IN ('VALID', 'CHECKED_IN')")),
        UniqueConstraint("order_item_id", "sequence_no", name="uq_tickets_order_item_sequence"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    ticket_code: str = Field(sa_column=Column(pg.VARCHAR, unique=True, nullable=False))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True))
    order_item_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("order_items.id"), nullable=False))
    sequence_no: int = Field(sa_column=Column(pg.INTEGER, nullable=False))
    ticket_type_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("ticket_types.id"), nullable=False, index=True))
    event_seat_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("event_seats.id"), nullable=True))
    holder_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True))
    attendee_name: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    seat_label: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    status: TicketStatus = Field(default=TicketStatus.VALID, sa_column=Column(pg.ENUM(TicketStatus, name="ticket_status"), nullable=False, server_default=TicketStatus.VALID.value))
    issued_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    checked_in_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    cancelled_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc)))


class check_in_records(SQLModel, table=True):
    __tablename__ = "check_in_records"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True))
    ticket_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("tickets.id"), nullable=True, index=True))
    action: CheckInAction = Field(sa_column=Column(pg.ENUM(CheckInAction, name="check_in_action"), nullable=False))
    result: ScanResult = Field(sa_column=Column(pg.ENUM(ScanResult, name="scan_result", values_callable=lambda e: [m.value for m in e]), nullable=False))
    performed_by_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
