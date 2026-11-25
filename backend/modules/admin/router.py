import csv
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import AwareDatetime
from sqlalchemy import func, or_
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.modules.admin.schemas import AdminEvent, AdminOrder, AdminPayment, AdminPromo, AdminUser, SuspensionRequest
from backend.modules.audit import service as audit
from backend.modules.audit.models import audit_logs
from backend.modules.audit.router import history_filters, history_page
from backend.modules.audit.schemas import HistoryPage
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import get_event_or_404
from backend.modules.events.models import events
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.orders.models import orders
from backend.modules.orders.schemas import OrderStatus
from backend.modules.payments.models import payments
from backend.modules.payments.schemas import PaymentStatus, UNFINISHED_PAYMENT_STATUSES
from backend.modules.payments.service import is_simulated
from backend.modules.promotions.models import promo_codes, promo_holds, promotional_campaigns
from backend.modules.tickets.models import tickets
from backend.modules.users.user_model import EventRole, event_user_roles, profiles, users, Role
from database.database import get_session

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(current_user: users = Depends(get_current_user)) -> users:
    if current_user.personal_role != Role.PLATFORM_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return current_user


def _like(q: str) -> str:
    return f"%{q.strip()}%"


@router.get("/users", response_model=list[AdminUser])
def search_users(q: str | None = None, suspended: bool | None = None, limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                 session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    query = select(users, profiles.full_name).outerjoin(profiles, profiles.user_id == users.id)
    if q:
        query = query.where(or_(users.email.ilike(_like(q)), users.public_id.ilike(_like(q)), profiles.full_name.ilike(_like(q))))
    if suspended is not None:
        query = query.where(users.is_suspended.is_(suspended))
    rows = session.exec(query.order_by(users.created_at.desc(), users.id).limit(limit).offset(offset)).all()
    return [AdminUser(id=u.id, public_id=u.public_id, email=u.email, full_name=name, personal_role=u.personal_role, is_suspended=u.is_suspended, created_at=u.created_at) for u, name in rows]


def _admin_event(session: Session, event: events) -> AdminEvent:
    organizer_email = session.exec(
        select(users.email).join(event_user_roles, event_user_roles.user_id == users.id)
        .where(event_user_roles.event_id == event.id, event_user_roles.event_role == EventRole.ORGANIZER)
    ).first()
    issued = session.exec(select(func.count()).select_from(tickets).where(tickets.event_id == event.id)).one()
    return AdminEvent(id=event.id, public_id=event.public_id, title=event.title, status=event.status, is_suspended=event.is_suspended, suspended_at=event.suspended_at,
                      suspension_reason=event.suspension_reason, starts_at=event.starts_at, organizer_email=organizer_email, tickets_issued=issued)


@router.get("/events", response_model=list[AdminEvent])
def search_events(q: str | None = None, event_status: EventLifecycleStatus | None = Query(default=None, alias="status"), suspended: bool | None = None,
                  limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    query = select(events)
    if q:
        query = query.where(or_(events.title.ilike(_like(q)), events.public_id.ilike(_like(q)), events.slug.ilike(_like(q))))
    if event_status is not None:
        query = query.where(events.status == event_status)
    if suspended is not None:
        query = query.where(events.is_suspended.is_(suspended))
    rows = session.exec(query.order_by(events.starts_at.desc(), events.id).limit(limit).offset(offset)).all()
    return [_admin_event(session, event) for event in rows]


@router.post("/events/{event_id}/suspend", response_model=AdminEvent)
def suspend_event(event_id: uuid.UUID, data: SuspensionRequest, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    event = get_event_or_404(session, event_id, for_update=True)
    if event.status in (EventLifecycleStatus.CANCELLED, EventLifecycleStatus.COMPLETED):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Event is {event.status.value}")
    reason = data.reason.strip()
    if not reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Reason is required")
    if not event.is_suspended:
        now = db_now(session)
        event.is_suspended = True
        event.suspended_at = now
        event.suspension_reason = reason
        session.add(event)
        audit.record(session, action="EVENT_SUSPENDED", entity_type="EVENT", entity_id=event.id, event_id=event.id, actor_user_id=admin.id)
    session.commit()
    session.refresh(event)
    return _admin_event(session, event)


@router.post("/events/{event_id}/restore", response_model=AdminEvent)
def restore_event(event_id: uuid.UUID, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    event = get_event_or_404(session, event_id, for_update=True)
    if event.is_suspended:
        event.is_suspended = False
        event.suspended_at = None
        event.suspension_reason = None
        session.add(event)
        audit.record(session, action="EVENT_SUSPENSION_LIFTED", entity_type="EVENT", entity_id=event.id, event_id=event.id, actor_user_id=admin.id)
    session.commit()
    session.refresh(event)
    return _admin_event(session, event)


def _orders_query(q: str | None, order_status: OrderStatus | None, event_id: uuid.UUID | None, date_from=None, date_to=None):
    query = select(orders, events.title, users.email).join(events, events.id == orders.event_id).join(users, users.id == orders.buyer_user_id)
    if q:
        query = query.where(or_(orders.order_number.ilike(_like(q)), users.email.ilike(_like(q))))
    if order_status is not None:
        query = query.where(orders.status == order_status)
    if event_id is not None:
        query = query.where(orders.event_id == event_id)
    if date_from is not None:
        query = query.where(orders.created_at >= date_from)
    if date_to is not None:
        query = query.where(orders.created_at < date_to)
    return query.order_by(orders.created_at.desc(), orders.id)


def _admin_order(order: orders, title: str, email: str) -> AdminOrder:
    return AdminOrder(id=order.id, order_number=order.order_number, event_id=order.event_id, event_title=title, buyer_email=email, status=order.status,
                      subtotal_minor=order.subtotal_minor, discount_minor=order.discount_minor, total_minor=order.total_minor, created_at=order.created_at, confirmed_at=order.confirmed_at)


@router.get("/orders", response_model=list[AdminOrder])
def search_orders(q: str | None = None, order_status: OrderStatus | None = Query(default=None, alias="status"), event_id: uuid.UUID | None = None,
                  limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    rows = session.exec(_orders_query(q, order_status, event_id).limit(limit).offset(offset)).all()
    return [_admin_order(order, title, email) for order, title, email in rows]


def _admin_payment(payment: payments, order_number: str, now) -> AdminPayment:
    overdue = payment.status in UNFINISHED_PAYMENT_STATUSES and payment.next_check_at is not None and payment.next_check_at <= now
    return AdminPayment(id=payment.id, order_id=payment.order_id, order_number=order_number, status=payment.status, pending_operation=payment.pending_operation,
                        cancellation_reason=payment.cancellation_reason, amount_minor=payment.amount_minor, is_simulated=is_simulated(payment), is_overdue=overdue,
                        next_check_at=payment.next_check_at, created_at=payment.created_at, finalized_at=payment.finalized_at)


@router.get("/payments", response_model=list[AdminPayment])
def search_payments(payment_status: PaymentStatus | None = Query(default=None, alias="status"), problems_only: bool = False, q: str | None = None,
                    limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                    session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    now = db_now(session)
    query = select(payments, orders.order_number).join(orders, orders.id == payments.order_id)
    if payment_status is not None:
        query = query.where(payments.status == payment_status)
    if problems_only:
        query = query.where(or_(payments.status == PaymentStatus.FAILED, (payments.status.in_(UNFINISHED_PAYMENT_STATUSES)) & (payments.next_check_at <= now)))
    if q:
        query = query.where(or_(orders.order_number.ilike(_like(q)), payments.provider_invoice_id.ilike(_like(q))))
    rows = session.exec(query.order_by(payments.created_at.desc(), payments.id).limit(limit).offset(offset)).all()
    return [_admin_payment(payment, number, now) for payment, number in rows]


@router.get("/promo-codes", response_model=list[AdminPromo])
def promo_activity(event_id: uuid.UUID | None = None, limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                   session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    now = db_now(session)
    holds = (
        select(promo_holds.promo_code_id.label("promo_code_id"), func.count().label("active"))
        .where(promo_holds.consumed_at.is_(None), promo_holds.released_at.is_(None), promo_holds.expires_at > now)
        .group_by(promo_holds.promo_code_id).subquery()
    )
    query = (
        select(promo_codes, events.title, promotional_campaigns.name, func.coalesce(holds.c.active, 0))
        .join(events, events.id == promo_codes.event_id)
        .outerjoin(promotional_campaigns, promotional_campaigns.id == promo_codes.campaign_id)
        .outerjoin(holds, holds.c.promo_code_id == promo_codes.id)
    )
    if event_id is not None:
        query = query.where(promo_codes.event_id == event_id)
    rows = session.exec(query.order_by(promo_codes.redemption_count.desc(), promo_codes.code).limit(limit).offset(offset)).all()
    return [
        AdminPromo(id=p.id, code=p.code, event_id=p.event_id, event_title=title, campaign_name=campaign, is_active=p.is_active, max_redemptions=p.max_redemptions,
                   redemption_count=p.redemption_count, active_holds=active, valid_until=p.valid_until)
        for p, title, campaign, active in rows
    ]


@router.get("/audit", response_model=HistoryPage)
def audit_log(event_id: uuid.UUID | None = None, entity_id: uuid.UUID | None = None, result: str | None = Query(default=None, pattern="^(SUCCESS|DENIED)$"),
              date_from: AwareDatetime | None = Query(default=None, alias="from"), date_to: AwareDatetime | None = Query(default=None, alias="to"),
              category: list[str] | None = Query(default=None), action_type: list[str] | None = Query(default=None),
              limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
              session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    conditions = history_filters(date_from, date_to, category, action_type)
    if event_id is not None:
        conditions.append(audit_logs.event_id == event_id)
    if entity_id is not None:
        conditions.append(audit_logs.entity_id == entity_id)
    if result is not None:
        conditions.append(audit_logs.result == result)
    query = select(audit_logs).where(*conditions)
    count_query = select(func.count()).select_from(audit_logs).where(*conditions)
    return history_page(session, query, count_query, limit, offset, event_id, full_identity=True)


def _csv(filename: str, header: list[str], rows: list[list]) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    return Response(content="﻿" + buffer.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/reports/orders.csv")
def orders_report(date_from: AwareDatetime | None = Query(default=None, alias="from"), date_to: AwareDatetime | None = Query(default=None, alias="to"),
                  event_id: uuid.UUID | None = None, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    rows = session.exec(_orders_query(None, None, event_id, date_from, date_to).limit(10000)).all()
    return _csv("orders.csv",
                ["order_number", "event", "buyer_email", "status", "subtotal_minor", "discount_minor", "total_minor", "created_at", "confirmed_at"],
                [[o.order_number, title, email, o.status.value, o.subtotal_minor, o.discount_minor, o.total_minor, o.created_at.isoformat(), o.confirmed_at.isoformat() if o.confirmed_at else ""]
                 for o, title, email in rows])


@router.get("/reports/payments.csv")
def payments_report(date_from: AwareDatetime | None = Query(default=None, alias="from"), date_to: AwareDatetime | None = Query(default=None, alias="to"),
                    session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    query = select(payments, orders.order_number).join(orders, orders.id == payments.order_id)
    if date_from is not None:
        query = query.where(payments.created_at >= date_from)
    if date_to is not None:
        query = query.where(payments.created_at < date_to)
    rows = session.exec(query.order_by(payments.created_at.desc(), payments.id).limit(10000)).all()
    return _csv("payments.csv",
                ["order_number", "status", "cancellation_reason", "amount_minor", "processing_fee_minor", "simulated", "created_at", "finalized_at"],
                [[number, p.status.value, p.cancellation_reason.value if p.cancellation_reason else "", p.amount_minor, p.processing_fee_minor if p.processing_fee_minor is not None else "",
                  "yes" if is_simulated(p) else "no", p.created_at.isoformat(), p.finalized_at.isoformat() if p.finalized_at else ""]
                 for p, number in rows])
