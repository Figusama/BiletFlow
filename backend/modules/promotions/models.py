import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, CheckConstraint, func
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field

from backend.modules.promotions.schemas import DiscountType


class promo_codes(SQLModel, table=True):
    __tablename__ = "promo_codes"
    __table_args__ = (
        CheckConstraint("discount_value > 0", name="ck_promo_codes_discount_positive"),
        CheckConstraint("discount_type <> 'PERCENTAGE' OR discount_value <= 100", name="ck_promo_codes_percentage_bounded"),
        CheckConstraint("max_redemptions IS NULL OR max_redemptions > 0", name="ck_promo_codes_max_redemptions"),
        CheckConstraint("redemption_count >= 0 AND (max_redemptions IS NULL OR redemption_count <= max_redemptions)", name="ck_promo_codes_redemption_count"),
        CheckConstraint("ticket_type_id IS NULL OR event_id IS NOT NULL", name="ck_promo_codes_no_orphan_type"),
        CheckConstraint("valid_until > valid_from", name="ck_promo_codes_window"),
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    code: str = Field(sa_column=Column(pg.CITEXT, unique=True, nullable=False))
    event_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=True, index=True))
    ticket_type_id: uuid.UUID | None = Field(default=None, sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("ticket_types.id"), nullable=True))
    discount_type: DiscountType = Field(sa_column=Column(pg.ENUM(DiscountType, name="discount_type"), nullable=False))
    discount_value: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    max_redemptions: int | None = Field(default=None, sa_column=Column(pg.INTEGER, nullable=True))
    redemption_count: int = Field(default=0, sa_column=Column(pg.INTEGER, nullable=False, server_default="0"))
    valid_from: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    valid_until: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    is_active: bool = Field(default=True, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="true"))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc)))


class promo_holds(SQLModel, table=True):
    __tablename__ = "promo_holds"
    __table_args__ = (CheckConstraint("NOT (released_at IS NOT NULL AND consumed_at IS NOT NULL)", name="ck_promo_holds_single_outcome"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    promo_code_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("promo_codes.id"), nullable=False, index=True))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), unique=True, nullable=False))
    expires_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False))
    released_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    consumed_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))


class promo_redemptions(SQLModel, table=True):
    __tablename__ = "promo_redemptions"
    __table_args__ = (CheckConstraint("discount_minor >= 0", name="ck_promo_redemptions_discount"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    promo_code_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("promo_codes.id"), nullable=False, index=True))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("orders.id"), unique=True, nullable=False))
    discount_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    redeemed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))


class promotional_campaigns(SQLModel, table=True):
    __tablename__ = "promotional_campaigns"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    event_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True))
    promo_code_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("promo_codes.id"), unique=True, nullable=False))
    name: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    token: str = Field(sa_column=Column(pg.VARCHAR, unique=True, nullable=False))
    is_active: bool = Field(default=True, sa_column=Column(pg.BOOLEAN, nullable=False, server_default="true"))
    created_by_user_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("users.id"), nullable=False))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc)))


class campaign_visits(SQLModel, table=True):
    __tablename__ = "campaign_visits"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    campaign_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), ForeignKey("promotional_campaigns.id"), nullable=False, index=True))
    visited_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
