import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, model_validator


class RefundSource(str, Enum):
    CUSTOMER = "CUSTOMER"
    PLATFORM_ADMIN = "PLATFORM_ADMIN"
    EVENT_CANCELLATION = "EVENT_CANCELLATION"
    EVENT_CHANGED = "EVENT_CHANGED"
    SYSTEM_FAST_REFUND = "SYSTEM_FAST_REFUND"
    ORGANIZER_INITIATED = "ORGANIZER_INITIATED"
    EVENT_SUSPENSION = "EVENT_SUSPENSION"


class RefundReason(str, Enum):
    CANNOT_ATTEND = "CANNOT_ATTEND"
    CHANGED_PLANS = "CHANGED_PLANS"
    DUPLICATE_PURCHASE = "DUPLICATE_PURCHASE"
    EVENT_DISSATISFACTION = "EVENT_DISSATISFACTION"
    OTHER = "OTHER"


MANDATORY_SOURCES = {RefundSource.EVENT_CANCELLATION.value, RefundSource.EVENT_CHANGED.value, RefundSource.SYSTEM_FAST_REFUND.value, RefundSource.EVENT_SUSPENSION.value}


class CustomerRefundCreate(BaseModel):
    reason_code: RefundReason
    comment: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def comment_for_other(self):
        if self.reason_code == RefundReason.OTHER and not (self.comment or "").strip():
            raise ValueError("Comment is required for OTHER")
        return self


class StaffRefundCreate(BaseModel):
    comment: str | None = Field(default=None, max_length=2000)


class RefundDecision(BaseModel):
    comment: str | None = Field(default=None, max_length=2000)


class RefundRejection(BaseModel):
    comment: str = Field(min_length=3, max_length=2000)


class RefundAttemptPublic(BaseModel):
    id: uuid.UUID
    amount_minor: int
    status: str
    attempt_actor: str
    created_at: datetime
    finalized_at: datetime | None


class RefundRequestPublic(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    order_number: str
    event_id: uuid.UUID
    source: RefundSource
    status: str
    execution_status: str | None
    reason_code: str | None
    comment: str | None
    amount_minor: int
    created_at: datetime
    reviewed_at: datetime | None
    execution_finalized_at: datetime | None
    attempts: list[RefundAttemptPublic]


class RefundEligibility(BaseModel):
    eligible: bool
    fast_refund: bool
    reason: str | None
    deadline: datetime | None
