import uuid

from sqlmodel import Session, select

from backend.modules.audit.models import audit_logs
from backend.modules.events.models import event_applications, event_change_requests, event_staff_invitations, events
from backend.modules.orders.models import orders
from backend.modules.payments.models import payments
from backend.modules.promotions.models import promo_codes, promotional_campaigns
from backend.modules.refunds.models import refund_requests, refunds
from backend.modules.support.models import support_cases
from backend.modules.tickets.models import ticket_types, tickets
from backend.modules.users.user_model import profiles

SAFE_DETAILS = {
    "TICKET_PRICE_CHANGED": {"ticket_type_id", "old_price_minor", "new_price_minor"},
    "TICKET_CAPACITY_CHANGED": {"ticket_type_id", "old_capacity", "new_capacity"},
    "TICKET_TYPE_AVAILABILITY_CHANGED": {"ticket_type_id", "old_is_active", "new_is_active", "old_sales_status", "new_sales_status"},
    "EVENT_DETAILS_UPDATED": {"fields"},
    "EVENT_MATERIAL_DETAILS_CHANGED": {"fields"},
    "EVENT_CHANGE_SUBMITTED": {"request_number"},
    "EVENT_CHANGE_APPROVED": {"request_number", "fields"},
    "EVENT_CANCELLATION_APPROVED": {"refund_handling_mode"},
    "EVENT_CANCELLED": {"refund_handling_mode"},
    "REFUND_REQUESTED": {"order_number", "source"},
    "REFUND_APPROVED": {"order_number", "source"},
    "REFUND_REJECTED": {"order_number"},
    "REFUND_SUCCEEDED": {"order_number", "amount_minor"},
    "REFUND_FAILED_FINAL": {"order_number"},
    "REFUND_ESCALATED": {"order_number"},
    "REFUND_EXCEPTION_DECIDED": {"order_number"},
    "PROMO_CODE_DISABLED": {"promo_code_id", "old_is_active", "new_is_active"},
    "PROMO_CODE_REENABLED": {"promo_code_id", "old_is_active", "new_is_active"},
    "EVENT_STAFF_INVITED": {"role"},
    "EVENT_STAFF_INVITATION_REVOKED": {"role"},
    "EVENT_STAFF_INVITATION_DECLINED": {"role"},
    "EVENT_ROLE_ASSIGNED": {"role"},
    "EVENT_ROLE_REVOKED": {"role"},
    "PRIVATE_INVITATIONS_SENT": {"count"},
    "SUPPORT_CASE_STATUS_CHANGED": {"old_status", "new_status"},
    "PAID_SALES_VERIFICATION_APPROVED": {"fee_amount_minor"},
    "PAID_SALES_ACTIVATED": {"amount_minor"},
}


def safe_details(row: audit_logs) -> dict:
    allowed = SAFE_DETAILS.get(row.action_type, set())
    return {key: value for key, value in (row.details or {}).items() if key in allowed}


def entity_labels(session: Session, rows: list[audit_logs]) -> dict[tuple[str, uuid.UUID], str]:
    ids: dict[str, set[uuid.UUID]] = {}
    for row in rows:
        if row.entity_id is not None:
            ids.setdefault(row.entity_type, set()).add(row.entity_id)
    queries = {
        "ORDER": lambda i: select(orders.id, orders.order_number).where(orders.id.in_(i)),
        "PAYMENT": lambda i: select(payments.id, orders.order_number).join(orders, orders.id == payments.order_id).where(payments.id.in_(i)),
        "REFUND": lambda i: select(refunds.id, orders.order_number).join(orders, orders.id == refunds.order_id).where(refunds.id.in_(i)),
        "REFUND_REQUEST": lambda i: select(refund_requests.id, orders.order_number).join(orders, orders.id == refund_requests.order_id).where(refund_requests.id.in_(i)),
        "TICKET": lambda i: select(tickets.id, tickets.public_id).where(tickets.id.in_(i)),
        "TICKET_TYPE": lambda i: select(ticket_types.id, ticket_types.name).where(ticket_types.id.in_(i)),
        "PROMO_CODE": lambda i: select(promo_codes.id, promo_codes.code).where(promo_codes.id.in_(i)),
        "CAMPAIGN": lambda i: select(promotional_campaigns.id, promotional_campaigns.name).where(promotional_campaigns.id.in_(i)),
        "SUPPORT_CASE": lambda i: select(support_cases.id, support_cases.case_number).where(support_cases.id.in_(i)),
        "EVENT": lambda i: select(events.id, events.title).where(events.id.in_(i)),
        "EVENT_APPLICATION": lambda i: select(event_applications.id, event_applications.application_number).where(event_applications.id.in_(i)),
        "EVENT_CHANGE_REQUEST": lambda i: select(event_change_requests.id, event_change_requests.request_number).where(event_change_requests.id.in_(i)),
        "EVENT_STAFF_INVITATION": lambda i: select(event_staff_invitations.id, profiles.full_name).join(profiles, profiles.user_id == event_staff_invitations.invited_user_id)
        .where(event_staff_invitations.id.in_(i)),
        "EVENT_USER_ROLE": lambda i: select(profiles.user_id, profiles.full_name).where(profiles.user_id.in_(i)),
    }
    labels = {}
    for entity_type, wanted in ids.items():
        if entity_type in queries:
            for entity_id, label in session.exec(queries[entity_type](wanted)).all():
                labels[(entity_type, entity_id)] = f"#{label}" if entity_type == "SUPPORT_CASE" else label
    return labels
