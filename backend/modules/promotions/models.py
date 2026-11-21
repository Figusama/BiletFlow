import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, func
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field

from backend.core.types import text_enum
from backend.modules.promotions.schemas import ApplicationScope, DiscountType


def _now() -> datetime:
    return datetime.now(timezone.utc)


class promotional_campaigns(SQLModel, table=True):
    __tablename__ = "promotional_campaigns"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True))
    name: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    created_by_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))


class promo_codes(SQLModel, table=True):
    __tablename__ = "promo_codes"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True))
    campaign_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("promotional_campaigns.id"), nullable=True))
    code: str = Field(sa_column=Column(pg.CITEXT, unique=True, nullable=False))
    discount_type: DiscountType = Field(sa_column=Column(text_enum(DiscountType), nullable=False))
    application_scope: ApplicationScope = Field(sa_column=Column(text_enum(ApplicationScope), nullable=False))
    percentage_bps: int | None = Field(default=None, sa_column=Column(pg.INTEGER, nullable=True))
    fixed_amount_minor: int | None = Field(default=None, sa_column=Column(pg.BIGINT, nullable=True))
    max_redemptions: int | None = Field(default=None, sa_column=Column(pg.INTEGER, nullable=True))
    redemption_count: int = Field(default=0, sa_column=Column(pg.INTEGER, nullable=False, server_default="0"))
    valid_from: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    valid_until: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    is_active: bool = Field(default=True, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="true"))
    campaign_token: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), unique=True, nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=_now))


class promo_code_ticket_types(SQLModel, table=True):
    __tablename__ = "promo_code_ticket_types"
    promo_code_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("promo_codes.id"), primary_key=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False))
    ticket_type_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("ticket_types.id"), primary_key=True))


class promo_holds(SQLModel, table=True):
    __tablename__ = "promo_holds"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    promo_code_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("promo_codes.id"), nullable=False, index=True))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), unique=True, nullable=False))
    expires_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    released_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    consumed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))


class promo_redemptions(SQLModel, table=True):
    __tablename__ = "promo_redemptions"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    promo_code_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("promo_codes.id"), nullable=False, index=True))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), unique=True, nullable=False))
    discount_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    redeemed_at: datetime = Field(default_factory=_now, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
