import uuid
from datetime import datetime
from enum import Enum

from pydantic import AwareDatetime, BaseModel, Field, model_validator


class DiscountType(str, Enum):
    PERCENTAGE = "PERCENTAGE"
    FIXED_AMOUNT = "FIXED_AMOUNT"


class ApplicationScope(str, Enum):
    ORDER = "ORDER"
    SELECTED_TICKET_TYPES = "SELECTED_TICKET_TYPES"


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
    campaign_id: uuid.UUID | None = None
    discount_type: DiscountType
    percentage_bps: int | None = Field(default=None, ge=1, le=10000)
    fixed_amount_minor: int | None = Field(default=None, gt=0, le=10 ** 12)
    application_scope: ApplicationScope = ApplicationScope.ORDER
    ticket_type_ids: list[uuid.UUID] = Field(default_factory=list)
    max_redemptions: int | None = Field(default=None, gt=0, le=10 ** 9)
    valid_from: AwareDatetime
    valid_until: AwareDatetime

    @model_validator(mode="after")
    def check(self):
        if self.discount_type == DiscountType.PERCENTAGE and (self.percentage_bps is None or self.fixed_amount_minor is not None):
            raise ValueError("Percentage discount requires percentage_bps only")
        if self.discount_type == DiscountType.FIXED_AMOUNT and (self.fixed_amount_minor is None or self.percentage_bps is not None):
            raise ValueError("Fixed discount requires fixed_amount_minor only")
        if self.application_scope == ApplicationScope.SELECTED_TICKET_TYPES and not self.ticket_type_ids:
            raise ValueError("Selected ticket types scope requires at least one ticket type")
        if self.application_scope == ApplicationScope.ORDER and self.ticket_type_ids:
            raise ValueError("Order scope cannot list ticket types")
        if len(set(self.ticket_type_ids)) != len(self.ticket_type_ids):
            raise ValueError("Duplicate ticket types")
        if self.valid_until <= self.valid_from:
            raise ValueError("valid_until must be after valid_from")
        return self


class PromoCodeToggle(BaseModel):
    is_active: bool


class PromoCodePublic(BaseModel):
    id: uuid.UUID
    code: str
    event_id: uuid.UUID
    campaign_id: uuid.UUID | None
    discount_type: DiscountType
    percentage_bps: int | None
    fixed_amount_minor: int | None
    application_scope: ApplicationScope
    ticket_type_ids: list[uuid.UUID]
    max_redemptions: int | None
    redemption_count: int
    valid_from: datetime
    valid_until: datetime
    is_active: bool
    campaign_link: str | None
    campaign_qr_png_url: str | None


class PromoPreviewLine(BaseModel):
    ticket_type_id: uuid.UUID
    quantity: int = Field(gt=0, le=1000)


class PromoValidateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    reservation_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    items: list[PromoPreviewLine] = Field(default_factory=list, max_length=50)
    event_seat_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def one_source(self):
        if self.reservation_id is not None:
            if self.event_id or self.items or self.event_seat_ids:
                raise ValueError("Provide either reservation_id or a selection")
            return self
        if self.event_id is None or bool(self.items) == bool(self.event_seat_ids):
            raise ValueError("Provide reservation_id, or event_id with items or event_seat_ids")
        if len({line.ticket_type_id for line in self.items}) != len(self.items) or len(set(self.event_seat_ids)) != len(self.event_seat_ids):
            raise ValueError("Duplicate selection")
        return self


class PromoValidateResponse(BaseModel):
    valid: bool
    code: str
    reason: PromoRejection | None = None
    message: str | None = None
    subtotal_minor: int
    discount_minor: int
    total_minor: int


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class CampaignPublic(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    created_at: datetime
    codes: list[PromoCodePublic]


class CampaignStats(BaseModel):
    campaign_id: uuid.UUID
    redemptions: int
    tickets_sold: int
    gross_minor: int
    discount_minor: int
    net_minor: int
    refunded_minor: int
    net_after_refunds_minor: int
