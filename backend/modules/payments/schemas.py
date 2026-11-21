import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class PaymentStatus(str, Enum):
    PENDING = "PENDING"
    AUTHORIZED = "AUTHORIZED"
    CAPTURING = "CAPTURING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

class PendingOperation(str, Enum):
    CAPTURE = "CAPTURE"
    CANCEL = "CANCEL"

class CancellationReason(str, Enum):
    USER_REQUESTED = "USER_REQUESTED"
    RESERVATION_EXPIRED = "RESERVATION_EXPIRED"
    CAPTURE_FAILED = "CAPTURE_FAILED"

class WebhookVerificationStatus(str, Enum):
    PENDING = "PENDING"
    VALID = "VALID"
    INVALID = "INVALID"

class WebhookProcessingStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSED = "PROCESSED"
    IGNORED = "IGNORED"
    REJECTED = "REJECTED"

class ActivationStatus(str, Enum):
    NOT_REQUESTED = "NOT_REQUESTED"
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    FEE_PENDING = "FEE_PENDING"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"

class SimulatedOutcome(str, Enum):
    APPROVE = "approve"
    DECLINE = "decline"
    CAPTURE_FAIL = "capture_fail"


UNFINISHED_PAYMENT_STATUSES = (PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURING)


class PaymentPublic(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    status: PaymentStatus
    pending_operation: PendingOperation | None
    cancellation_reason: CancellationReason | None
    amount_minor: int
    currency: str
    is_simulated: bool
    payment_url: str | None
    created_at: datetime


class SimulatorDecision(BaseModel):
    outcome: SimulatedOutcome
