import uuid

from sqlalchemy import Text, and_, cast, or_
from sqlmodel import Session, select

from backend.core.paging import like_pattern
from backend.modules.audit.catalog import canonical
from backend.modules.audit.models import audit_logs
from backend.modules.events.models import event_applications, event_cancellation_requests, event_change_requests, event_staff_invitations, events
from backend.modules.orders.models import orders
from backend.modules.payments.models import activation_fee_payments, paid_sales_activations, payments
from backend.modules.promotions.models import promo_codes, promotional_campaigns
from backend.modules.refunds.models import refund_requests, refunds
from backend.modules.support.models import support_cases
from backend.modules.tickets.models import ticket_types, tickets
from backend.modules.users.user_model import profiles, users

SAFE_DETAILS = {
    "TICKET_PRICE_CHANGED": {"ticket_type_id", "old_price_minor", "new_price_minor"},
    "TICKET_CAPACITY_CHANGED": {"ticket_type_id", "old_capacity", "new_capacity"},
    "TICKET_TYPE_AVAILABILITY_CHANGED": {"ticket_type_id", "old_is_active", "new_is_active", "old_sales_status", "new_sales_status"},
    "EVENT_DETAILS_UPDATED": {"fields"},
    "EVENT_MATERIAL_DETAILS_CHANGED": {"fields"},
    "EVENT_CHANGE_REQUEST_SUBMITTED": {"request_number"},
    "EVENT_CHANGE_REQUEST_APPROVED": {"request_number", "fields"},
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
    "PAID_SALES_APPLICATION_APPROVED": {"fee_amount_minor"},
    "PAID_SALES_ACTIVATED": {"amount_minor"},
}


def safe_details(row: audit_logs) -> dict:
    allowed = SAFE_DETAILS.get(canonical(row.action_type), set())
    return {key: value for key, value in (row.details or {}).items() if key in allowed}


def _plain(query):
    return query


SOURCES = {
    "ORDER": (orders.id, orders.order_number, _plain),
    "PAYMENT": (payments.id, orders.order_number, lambda q: q.join(orders, orders.id == payments.order_id)),
    "REFUND": (refunds.id, orders.order_number, lambda q: q.join(orders, orders.id == refunds.order_id)),
    "REFUND_REQUEST": (refund_requests.id, orders.order_number, lambda q: q.join(orders, orders.id == refund_requests.order_id)),
    "TICKET": (tickets.id, tickets.public_id, _plain),
    "TICKET_TYPE": (ticket_types.id, ticket_types.name, _plain),
    "PROMO_CODE": (promo_codes.id, promo_codes.code, _plain),
    "CAMPAIGN": (promotional_campaigns.id, promotional_campaigns.name, _plain),
    "SUPPORT_CASE": (support_cases.id, support_cases.case_number, _plain),
    "EVENT": (events.id, events.title, _plain),
    "EVENT_APPLICATION": (event_applications.id, event_applications.application_number, _plain),
    "EVENT_CHANGE_REQUEST": (event_change_requests.id, event_change_requests.request_number, _plain),
    "EVENT_CANCELLATION_REQUEST": (event_cancellation_requests.id, events.title, lambda q: q.join(events, events.id == event_cancellation_requests.event_id)),
    "PAID_SALES_ACTIVATION": (paid_sales_activations.id, events.title, lambda q: q.join(events, events.id == paid_sales_activations.event_id)),
    "ACTIVATION_FEE": (activation_fee_payments.id, events.title,
                       lambda q: q.join(paid_sales_activations, paid_sales_activations.id == activation_fee_payments.activation_id)
                       .join(events, events.id == paid_sales_activations.event_id)),
    "EVENT_STAFF_INVITATION": (event_staff_invitations.id, profiles.full_name, lambda q: q.join(profiles, profiles.user_id == event_staff_invitations.invited_user_id)),
    "EVENT_USER_ROLE": (profiles.user_id, profiles.full_name, _plain),
    "USER": (profiles.user_id, profiles.full_name, _plain),
}


def entity_labels(session: Session, rows: list[audit_logs]) -> dict[tuple[str, uuid.UUID], str]:
    ids: dict[str, set[uuid.UUID]] = {}
    for row in rows:
        if row.entity_id is not None:
            ids.setdefault(row.entity_type, set()).add(row.entity_id)
    labels = {}
    for entity_type, wanted in ids.items():
        if entity_type in SOURCES:
            key, label_column, joined = SOURCES[entity_type]
            for entity_id, label in session.exec(joined(select(key, label_column)).where(key.in_(wanted))).all():
                labels[(entity_type, entity_id)] = f"#{label}" if entity_type == "SUPPORT_CASE" else label
    return labels


def entity_like(text: str):
    text = text.strip()
    pattern = like_pattern(text)
    case_number = like_pattern(text.lstrip("#"))
    found = [and_(audit_logs.entity_type == entity_type,
                  audit_logs.entity_id.in_(joined(select(key)).where(cast(label, Text).ilike(case_number if entity_type == "SUPPORT_CASE" else pattern))))
             for entity_type, (key, label, joined) in SOURCES.items()]
    found.append(and_(audit_logs.entity_type.in_(("USER", "EVENT_USER_ROLE")), audit_logs.entity_id.in_(select(users.id).where(users.email.ilike(pattern)))))
    found.append(audit_logs.event_id.in_(select(events.id).where(or_(events.title.ilike(pattern), events.public_id.ilike(pattern)))))
    try:
        found.append(audit_logs.entity_id == uuid.UUID(text))
    except ValueError:
        pass
    return or_(*found)
