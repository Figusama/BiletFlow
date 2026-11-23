ACTIONS = {
    "EVENT_PUBLISHED": ("lifecycle", "Event published"),
    "EVENT_UNPUBLISHED": ("lifecycle", "Event returned to draft"),
    "EVENT_CANCELLED": ("lifecycle", "Event cancelled"),
    "EVENT_COMPLETED": ("lifecycle", "Event completed"),
    "EVENT_SUSPENDED": ("moderation", "Event suspended by platform administration"),
    "EVENT_SUSPENSION_LIFTED": ("moderation", "Event suspension lifted"),
    "TICKET_PRICE_CHANGED": ("tickets", "Ticket price changed"),
    "TICKET_CAPACITY_CHANGED": ("tickets", "Ticket capacity changed"),
    "TICKET_TYPE_AVAILABILITY_CHANGED": ("tickets", "Ticket type availability changed"),
    "ORDER_CONFIRMED": ("orders", "Order confirmed"),
    "PAYMENT_SUCCEEDED": ("orders", "Payment succeeded"),
    "PAYMENT_FAILED_FINAL": ("orders", "Payment failed"),
    "REFUND_REQUESTED": ("refunds", "Refund requested"),
    "REFUND_APPROVED": ("refunds", "Refund approved"),
    "REFUND_REJECTED": ("refunds", "Refund rejected"),
    "REFUND_SUCCEEDED": ("refunds", "Refund completed"),
    "REFUND_FAILED_FINAL": ("refunds", "Refund failed"),
    "CHECK_IN_SUCCEEDED": ("check_in", "Attendee checked in"),
    "CHECK_IN_REVERSED": ("check_in", "Check-in reversed"),
    "CHECK_IN_DENIED_SIGNIFICANT": ("check_in", "Admission denied"),
    "CAMPAIGN_CREATED": ("promotions", "Campaign created"),
    "PROMO_CODE_CREATED": ("promotions", "Promo code created"),
    "PROMO_CODE_DISABLED": ("promotions", "Promo code disabled"),
    "PROMO_CODE_REENABLED": ("promotions", "Promo code re-enabled"),
    "EVENT_STAFF_INVITED": ("staff", "Staff member invited"),
    "EVENT_ROLE_ASSIGNED": ("staff", "Staff role assigned"),
    "EVENT_ROLE_REVOKED": ("staff", "Staff role revoked"),
    "SUPPORT_CASE_STATUS_CHANGED": ("support", "Support case status changed"),
    "PAID_SALES_ACTIVATED": ("paid_sales", "Paid sales activated"),
    "PAID_SALES_SUSPENDED": ("paid_sales", "Paid sales suspended"),
    "PAID_SALES_RESTORED": ("paid_sales", "Paid sales restored"),
}

CATEGORIES = sorted({category for category, _ in ACTIONS.values()})


def describe(action_type: str) -> tuple[str, str]:
    return ACTIONS.get(action_type, ("other", action_type.replace("_", " ").capitalize()))
