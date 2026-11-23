import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class Bucket(str, Enum):
    HOUR = "hour"
    DAY = "day"
    WEEK = "week"


class InventoryMetrics(BaseModel):
    capacity: int | None
    sold: int
    historical_confirmed_tickets: int
    inventory_occupied: int
    remaining_inventory: int | None
    percent_sold: float | None


class FinancialMetrics(BaseModel):
    gross_sales_minor: int
    discounts_minor: int
    collected_minor: int | None
    refunded_minor: int | None
    net_revenue_minor: int | None
    estimated_processing_fees_minor: int | None
    estimated_proceeds_minor: int | None
    is_demonstration: bool


class SalesPoint(BaseModel):
    bucket_start: str
    orders: int
    tickets: int
    gross_sales_minor: int


class TicketTypeMetrics(BaseModel):
    ticket_type_id: uuid.UUID
    name: str
    sold: int
    confirmed_tickets: int
    gross_sales_minor: int
    discounts_minor: int
    net_sales_minor: int


class PromoMetrics(BaseModel):
    promo_code_id: uuid.UUID
    code: str
    campaign_id: uuid.UUID | None
    campaign_name: str | None
    redemptions: int
    tickets: int
    gross_sales_minor: int
    discounts_minor: int
    net_sales_minor: int


class AttendanceMetrics(BaseModel):
    eligible: int
    checked_in: int
    absent: int
    check_in_percentage: float | None


class EventAnalytics(BaseModel):
    event_id: uuid.UUID
    timezone: str
    date_from: datetime | None
    date_to: datetime | None
    ticket_type_id: uuid.UUID | None
    bucket: Bucket
    inventory: InventoryMetrics
    financial: FinancialMetrics
    sales_over_time: list[SalesPoint]
    by_ticket_type: list[TicketTypeMetrics]
    promotions: list[PromoMetrics]
    attendance: AttendanceMetrics
