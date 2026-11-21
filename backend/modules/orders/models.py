import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, func
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field

from backend.core.types import text_enum
from backend.modules.orders.schemas import ReservationStatus, OrderStatus


def _now() -> datetime:
    return datetime.now(timezone.utc)


class reservations(SQLModel, table=True):
    __tablename__ = "reservations"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True))
    user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False))
    expires_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    status: ReservationStatus = Field(default=ReservationStatus.ACTIVE, sa_column=Column(text_enum(ReservationStatus), nullable=False))
    purchase_terms_version: int = Field(sa_column=Column(pg.INTEGER, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    converted_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    released_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))


class reservation_items(SQLModel, table=True):
    __tablename__ = "reservation_items"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    reservation_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("reservations.id"), nullable=False, index=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False))
    ticket_type_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("ticket_types.id"), nullable=False))
    event_seat_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("event_seats.id"), nullable=True))
    quantity: int = Field(sa_column=Column(pg.INTEGER, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))


class orders(SQLModel, table=True):
    __tablename__ = "orders"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    order_number: str = Field(sa_column=Column(pg.VARCHAR, unique=True, nullable=False))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False))
    buyer_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True))
    reservation_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("reservations.id"), unique=True, nullable=False))
    status: OrderStatus = Field(default=OrderStatus.PENDING, sa_column=Column(text_enum(OrderStatus), nullable=False))
    subtotal_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    discount_minor: int = Field(default=0, sa_column=Column(pg.BIGINT, nullable=False, server_default="0"))
    total_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    promo_code_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("promo_codes.id"), nullable=True))
    purchase_terms_version: int = Field(sa_column=Column(pg.INTEGER, nullable=False))
    refund_policy_snapshot: dict = Field(sa_column=Column(pg.JSONB, nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    confirmed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    cancelled_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    expired_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))


class order_items(SQLModel, table=True):
    __tablename__ = "order_items"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False))
    ticket_type_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("ticket_types.id"), nullable=False))
    event_seat_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("event_seats.id"), nullable=True))
    ticket_type_name: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    unit_price_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    quantity: int = Field(sa_column=Column(pg.INTEGER, nullable=False))
    line_subtotal_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    line_discount_minor: int = Field(default=0, sa_column=Column(pg.BIGINT, nullable=False, server_default="0"))
    section_snapshot: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    row_snapshot: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    seat_snapshot: str | None = Field(default=None, sa_column=Column(pg.TEXT, nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
