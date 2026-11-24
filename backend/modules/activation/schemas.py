import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, EmailStr, Field, field_validator


class OwnerType(str, Enum):
    INDIVIDUAL = "INDIVIDUAL"
    LEGAL_ENTITY = "LEGAL_ENTITY"


class FeeOutcome(str, Enum):
    APPROVE = "approve"
    DECLINE = "decline"
    TIMEOUT = "timeout"


class PayoutInput(BaseModel):
    owner_type: OwnerType
    owner_name: str = Field(min_length=2, max_length=200)
    identifier: str = Field(description="IIN or BIN, 12 digits")
    responsible_person_name: str = Field(min_length=2, max_length=200)
    contact_email: EmailStr
    contact_phone: str = Field(min_length=5, max_length=40)
    iban: str
    bank_name: str = Field(min_length=2, max_length=200)
    account_holder_name: str = Field(min_length=2, max_length=200)

    @field_validator("identifier")
    @classmethod
    def check_identifier(cls, value: str) -> str:
        value = value.strip()
        if len(value) != 12 or not value.isdigit():
            raise ValueError("IIN/BIN must be 12 digits")
        return value

    @field_validator("iban")
    @classmethod
    def check_iban(cls, value: str) -> str:
        value = value.replace(" ", "").upper()
        if len(value) != 20 or not value.startswith("KZ") or not value[2:4].isdigit() or not value[4:].isalnum():
            raise ValueError("IBAN must be a 20-character KZ IBAN")
        return value


class ActivationRequestCreate(BaseModel):
    payout: PayoutInput
    accept_paid_terms: bool


class RejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class SuspendRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


class FeePaymentCreate(BaseModel):
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=100)


class FeeDecision(BaseModel):
    outcome: FeeOutcome


class RequestPublic(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    event_title: str
    status: str
    verification_snapshot: dict
    terms_version: str
    submitted_at: datetime
    reviewed_at: datetime | None
    rejection_reason: str | None


class FeePaymentPublic(BaseModel):
    id: uuid.UUID
    amount_minor: int
    currency: str
    status: str
    payment_mode: str
    provider_operation_ref: str | None
    created_at: datetime
    finalized_at: datetime | None
    simulator_url: str | None = None
    payment_url: str | None = None


class ActivationPublic(BaseModel):
    event_id: uuid.UUID
    status: str
    fee_amount_minor: int
    fee_currency: str
    paid_terms_version: str | None
    activated_at: datetime | None
    suspended_at: datetime | None
    requests: list[RequestPublic]
    fee_payments: list[FeePaymentPublic]


class CurrentTerms(BaseModel):
    version: str
    fee_amount_minor: int
    fee_currency: str
