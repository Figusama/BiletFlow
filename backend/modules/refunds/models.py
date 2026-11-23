import uuid
from datetime import datetime

from sqlalchemy import Column, func
from sqlalchemy.dialects import postgresql as pg
from sqlmodel import SQLModel, Field


class refunds(SQLModel, table=True):
    __tablename__ = "refunds"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, sa_column=Column(pg.UUID(as_uuid=True), primary_key=True))
    refund_request_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), nullable=False))
    order_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), nullable=False, index=True))
    payment_id: uuid.UUID = Field(sa_column=Column(pg.UUID(as_uuid=True), nullable=False))
    amount_minor: int = Field(sa_column=Column(pg.BIGINT, nullable=False))
    status: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    attempt_actor: str = Field(sa_column=Column(pg.TEXT, nullable=False))
    provider_ref: str | None = Field(default=None, sa_column=Column(pg.TEXT, unique=True, nullable=True))
    idempotency_key: str = Field(sa_column=Column(pg.TEXT, unique=True, nullable=False))
    next_retry_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    next_check_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
    created_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    updated_at: datetime = Field(sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=False, server_default=func.now()))
    finalized_at: datetime | None = Field(default=None, sa_column=Column(pg.TIMESTAMP(timezone=True), nullable=True))
