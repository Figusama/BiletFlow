import uuid
from datetime import datetime
from enum import Enum

from pydantic import AwareDatetime, BaseModel, EmailStr, Field

from backend.modules.events.schemas import EventStatus, SeatingMode, Visibility


class AgreementType(str, Enum):
    ORGANIZER_RULES = "ORGANIZER_RULES"
    TICKET_SALES_FINANCIAL_TERMS = "TICKET_SALES_FINANCIAL_TERMS"


class ApplicationInput(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=20000)
    venue_id: uuid.UUID | None = None
    venue_layout_id: uuid.UUID | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    timezone: str | None = Field(default=None, max_length=64)
    visibility: Visibility | None = None
    seating_mode: SeatingMode | None = None
    responsible_name: str | None = Field(default=None, max_length=200)
    responsible_email: EmailStr | None = None
    responsible_phone: str | None = Field(default=None, max_length=40)
    intends_paid_sales: bool | None = None
    category_ids: list[uuid.UUID] | None = None


class AgreementAcceptance(BaseModel):
    documents: list[AgreementType] = Field(min_length=1)


class AgreementPublic(BaseModel):
    document_type: AgreementType
    document_version: str
    accepted_at: datetime
    is_current: bool


class ImagePublic(BaseModel):
    id: uuid.UUID
    position: int
    url: str


class CategoryRef(BaseModel):
    id: uuid.UUID
    name: str
    slug: str


class ApplicationPublic(BaseModel):
    id: uuid.UUID
    application_number: str
    applicant_user_id: uuid.UUID
    status: EventStatus
    title: str | None
    description: str | None
    venue_id: uuid.UUID | None
    venue_name_snapshot: str | None
    venue_address_snapshot: str | None
    venue_city_snapshot: str | None
    venue_layout_id: uuid.UUID | None
    starts_at: datetime | None
    ends_at: datetime | None
    timezone: str | None
    visibility: Visibility | None
    seating_mode: SeatingMode | None
    responsible_name: str | None
    responsible_email: str | None
    responsible_phone: str | None
    intends_paid_sales: bool
    categories: list[CategoryRef]
    images: list[ImagePublic]
    agreements: list[AgreementPublic]
    submitted_at: datetime | None
    reviewed_at: datetime | None
    review_comment: str | None
    event_id: uuid.UUID | None
    missing_for_submit: list[str]
    created_at: datetime
    updated_at: datetime


class CurrentAgreement(BaseModel):
    document_type: AgreementType
    document_version: str


class ApprovalRequest(BaseModel):
    confirm_responsible_organizer: bool
    review_comment: str | None = Field(default=None, max_length=2000)


class RejectionRequest(BaseModel):
    review_comment: str = Field(min_length=3, max_length=2000)
