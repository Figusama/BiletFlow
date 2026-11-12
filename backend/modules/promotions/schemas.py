import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, model_validator


class DiscountType(str, Enum):
    PERCENTAGE = "PERCENTAGE"
    FIXED_AMOUNT = "FIXED_AMOUNT"


class PromoRejection(str, Enum):
    NOT_FOUND = "promo_not_found"
    INACTIVE = "promo_inactive"
    NOT_STARTED = "promo_not_started"
    EXPIRED = "promo_expired"
    WRONG_EVENT = "promo_wrong_event"
    NOT_APPLICABLE = "promo_not_applicable"
    EXHAUSTED = "promo_exhausted"


class PromoCodeCreate(BaseModel):
    code: str | None = Field(default=None, min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    ticket_type_id: uuid.UUID | None = None
    discount_type: DiscountType
    discount_value: int = Field(gt=0)
    max_redemptions: int | None = Field(default=None, gt=0)
    valid_from: datetime
    valid_until: datetime

    @model_validator(mode="after")
    def check(self):
        if self.discount_type == DiscountType.PERCENTAGE and self.discount_value > 100:
            raise ValueError("Percentage discount must be between 1 and 100")
        if self.valid_until <= self.valid_from:
            raise ValueError("valid_until must be after valid_from")
        return self


class PromoCodeUpdate(BaseModel):
    is_active: bool | None = None
    max_redemptions: int | None = Field(default=None, gt=0)
    valid_until: datetime | None = None


class PromoCodePublic(BaseModel):
    id: uuid.UUID
    code: str
    event_id: uuid.UUID | None
    ticket_type_id: uuid.UUID | None
    discount_type: DiscountType
    discount_value: int
    max_redemptions: int | None
    redemption_count: int
    valid_from: datetime
    valid_until: datetime
    is_active: bool


class PromoValidateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    reservation_id: uuid.UUID


class PromoValidateResponse(BaseModel):
    valid: bool
    code: str
    reason: PromoRejection | None = None
    message: str | None = None
    subtotal_minor: int
    discount_minor: int
    total_minor: int


class CampaignCreate(PromoCodeCreate):
    name: str = Field(min_length=2, max_length=120)


class CampaignPublic(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    is_active: bool
    link: str
    qr_png_url: str
    promo: PromoCodePublic
    created_at: datetime


class CampaignStats(BaseModel):
    campaign_id: uuid.UUID
    visits: int
    redemptions: int
    orders: int
    tickets_sold: int
    gross_minor: int
    discount_minor: int
    net_minor: int
