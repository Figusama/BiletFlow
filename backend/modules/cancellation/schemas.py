import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class RefundHandlingMode(str, Enum):
    AUTOMATIC_FULL = "AUTOMATIC_FULL"
    ADMIN_REVIEW = "ADMIN_REVIEW"


class CancellationCreate(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class CancellationApproval(BaseModel):
    refund_handling_mode: RefundHandlingMode | None = None
    review_comment: str | None = Field(default=None, max_length=2000)


class CancellationRejection(BaseModel):
    review_comment: str = Field(min_length=3, max_length=2000)


class CancellationPublic(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    event_title: str
    status: str
    reason: str
    refund_handling_mode: str | None
    review_comment: str | None
    reviewed_at: datetime | None
    created_at: datetime
