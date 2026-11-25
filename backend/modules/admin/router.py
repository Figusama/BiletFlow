import csv
import io
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import AwareDatetime
from sqlalchemy import and_, case, exists, func, or_
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.core.paging import like_pattern, page
from backend.modules.admin.refs import event_like, event_refs, organizer_like, people, person_like
from backend.modules.admin.schemas import AdminEvent, AdminOrder, AdminPayment, AdminPromo, AdminUser, AdminUserEventRole, SuspensionRequest
from backend.modules.audit import service as audit
from backend.modules.audit.models import audit_logs
from backend.modules.audit.presentation import entity_like
from backend.modules.audit.router import history_filters, history_page
from backend.modules.audit.schemas import HistoryPage
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import get_event_or_404
from backend.modules.events.models import event_seats, events
from backend.modules.events.schemas import EventLifecycleStatus, SeatingMode, Visibility
from backend.modules.orders.models import orders
from backend.modules.orders.schemas import OrderStatus
from backend.modules.payments.models import paid_sales_activations, payments
from backend.modules.payments.schemas import ActivationStatus, PaymentStatus, UNFINISHED_PAYMENT_STATUSES
from backend.modules.payments.service import is_demonstration
from backend.modules.promotions.models import promo_codes, promo_holds, promotional_campaigns
from backend.modules.tickets.models import tickets
from backend.modules.tickets.schemas import TicketStatus
from backend.modules.users.user_model import EventRole, event_user_roles, profiles, users, Role
from backend.modules.venues.models import venues
from database.database import get_session

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(current_user: users = Depends(get_current_user)) -> users:
    if current_user.personal_role != Role.PLATFORM_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return current_user


def created_between(column, date_from, date_to) -> list:
    conditions = []
    if date_from is not None:
        conditions.append(column >= date_from)
    if date_to is not None:
        conditions.append(column < date_to)
    return conditions


@router.get("/users", response_model=list[AdminUser])
def search_users(response: Response, q: str | None = None, suspended: bool | None = None, role: Role | None = None, event_role: EventRole | None = None,
                 date_from: AwareDatetime | None = Query(default=None, alias="from"), date_to: AwareDatetime | None = Query(default=None, alias="to"),
                 limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                 session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    query = select(users, profiles.full_name, profiles.phone).outerjoin(profiles, profiles.user_id == users.id).where(*created_between(users.created_at, date_from, date_to))
    if q and q.strip():
        pattern = like_pattern(q)
        query = query.where(or_(users.email.ilike(pattern), users.public_id.ilike(pattern), profiles.full_name.ilike(pattern), profiles.phone.ilike(pattern)))
    if suspended is not None:
        query = query.where(users.is_suspended.is_(suspended))
    if role is not None:
        query = query.where(users.personal_role == role)
    if event_role is not None:
        query = query.where(exists().where(event_user_roles.user_id == users.id, event_user_roles.event_role == event_role))
    rows = page(session, response, query.order_by(users.created_at.desc(), users.id), limit, offset)
    roles: dict[uuid.UUID, list[AdminUserEventRole]] = {}
    for user_id, event_id, public_id, title, held in session.exec(
            select(event_user_roles.user_id, events.id, events.public_id, events.title, event_user_roles.event_role).join(events, events.id == event_user_roles.event_id)
            .where(event_user_roles.user_id.in_([u.id for u, *_ in rows])).order_by(events.starts_at.desc(), events.id, event_user_roles.event_role)).all():
        roles.setdefault(user_id, []).append(AdminUserEventRole(event_id=event_id, event_public_id=public_id, event_title=title, role=held))
    return [AdminUser(id=u.id, public_id=u.public_id, email=u.email, full_name=name, phone=phone, personal_role=u.personal_role, is_suspended=u.is_suspended,
                      created_at=u.created_at, event_roles=roles.get(u.id, [])) for u, name, phone in rows]


def _admin_events(session: Session, rows: list[events]) -> list[AdminEvent]:
    ids = [event.id for event in rows]
    refs = event_refs(session, ids)
    places = {venue.id: venue for venue in session.exec(select(venues).where(venues.id.in_({event.venue_id for event in rows}))).all()}
    sold = case((tickets.status.in_((TicketStatus.VALID, TicketStatus.CHECKED_IN)), 1))
    counts = {event_id: (issued, active) for event_id, issued, active in session.exec(
        select(tickets.event_id, func.count(), func.count(sold)).where(tickets.event_id.in_(ids)).group_by(tickets.event_id)).all()}
    seats = dict(session.exec(select(event_seats.event_id, func.count()).where(event_seats.event_id.in_(ids), event_seats.is_enabled.is_(True)).group_by(event_seats.event_id)).all())
    paid = dict(session.exec(select(paid_sales_activations.event_id, paid_sales_activations.status).where(paid_sales_activations.event_id.in_(ids))).all())
    blockers = dict(session.exec(select(audit_logs.event_id, audit_logs.actor_user_id).where(
        audit_logs.event_id.in_([event.id for event in rows if event.is_suspended]), audit_logs.action_type == "EVENT_SUSPENDED").order_by(audit_logs.created_at, audit_logs.id)).all())
    names = people(session, blockers.values())
    result = []
    for event in rows:
        ref, venue = refs[event.id], places[event.venue_id]
        issued, active = counts.get(event.id, (0, 0))
        blocker = names.get(blockers.get(event.id))
        result.append(AdminEvent(
            id=event.id, public_id=event.public_id, title=event.title, status=event.status, is_suspended=event.is_suspended, suspended_at=event.suspended_at,
            suspension_reason=event.suspension_reason, suspended_by_name=(blocker[0] or blocker[1]) if blocker else None, starts_at=event.starts_at,
            visibility=event.visibility, venue_name=venue.name, city=venue.city,
            capacity=event.ga_capacity or 0 if event.seating_mode == SeatingMode.GENERAL_ADMISSION else seats.get(event.id, 0),
            organizer_id=ref.organizer_id, organizer_name=ref.organizer_name, organizer_email=ref.organizer_email, tickets_issued=issued, tickets_sold=active,
            paid_sales_status=paid.get(event.id, ActivationStatus.NOT_REQUESTED).value))
    return result


@router.get("/events", response_model=list[AdminEvent])
def search_events(response: Response, q: str | None = None, event_status: EventLifecycleStatus | None = Query(default=None, alias="status"), suspended: bool | None = None,
                  visibility: Visibility | None = None, city: str | None = None, paid_sales: ActivationStatus | None = None,
                  date_from: AwareDatetime | None = Query(default=None, alias="from"), date_to: AwareDatetime | None = Query(default=None, alias="to"),
                  limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    query = select(events).join(venues, venues.id == events.venue_id).outerjoin(paid_sales_activations, paid_sales_activations.event_id == events.id)
    query = query.where(*created_between(events.starts_at, date_from, date_to))
    if q and q.strip():
        pattern = like_pattern(q)
        query = query.where(or_(events.title.ilike(pattern), events.public_id.ilike(pattern), events.slug.ilike(pattern), organizer_like(events.id, pattern)))
    if event_status is not None:
        query = query.where(events.status == event_status)
    if suspended is not None:
        query = query.where(events.is_suspended.is_(suspended))
    if visibility is not None:
        query = query.where(events.visibility == visibility)
    if city and city.strip():
        query = query.where(venues.city.ilike(like_pattern(city)))
    if paid_sales == ActivationStatus.NOT_REQUESTED:
        query = query.where(or_(paid_sales_activations.id.is_(None), paid_sales_activations.status == paid_sales))
    elif paid_sales is not None:
        query = query.where(paid_sales_activations.status == paid_sales)
    return _admin_events(session, page(session, response, query.order_by(events.starts_at.desc(), events.id), limit, offset))


@router.get("/events/{event_id}", response_model=AdminEvent)
def read_event(event_id: uuid.UUID, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    return _admin_events(session, [get_event_or_404(session, event_id)])[0]


@router.post("/events/{event_id}/suspend", response_model=AdminEvent)
def suspend_event(event_id: uuid.UUID, data: SuspensionRequest, session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    event = get_event_or_404(session, event_id, for_update=True)
    if event.status in (EventLifecycleStatus.CANCELLED, EventLifecycleStatus.COMPLETED):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Event is {event.status.value}")
    reason = data.reason.strip()
    if not reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Reason is required")
    if not event.is_suspended:
        now = db_now(session)
        event.is_suspended = True
        event.suspended_at = now
        event.suspension_reason = reason
        session.add(event)
        audit.record(session, action="EVENT_SUSPENDED", entity_type="EVENT", entity_id=event.id, event_id=event.id, actor_user_id=admin.id)
    session.commit()
    session.refresh(event)
    return _admin_events(session, [event])[0]


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
    return _admin_events(session, [event])[0]


def _orders_query(q: str | None, order_status: OrderStatus | None, event_id: uuid.UUID | None, date_from=None, date_to=None):
    query = select(orders, events.title, users.email).join(events, events.id == orders.event_id).join(users, users.id == orders.buyer_user_id)
    if q and q.strip():
        pattern = like_pattern(q)
        query = query.where(or_(orders.order_number.ilike(pattern), person_like(orders.buyer_user_id, pattern), event_like(orders.event_id, pattern)))
    if order_status is not None:
        query = query.where(orders.status == order_status)
    if event_id is not None:
        query = query.where(orders.event_id == event_id)
    return query.where(*created_between(orders.created_at, date_from, date_to)).order_by(orders.created_at.desc(), orders.id)


@router.get("/orders", response_model=list[AdminOrder])
def search_orders(response: Response, q: str | None = None, order_status: OrderStatus | None = Query(default=None, alias="status"), event_id: uuid.UUID | None = None,
                  date_from: AwareDatetime | None = Query(default=None, alias="from"), date_to: AwareDatetime | None = Query(default=None, alias="to"),
                  limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    rows = page(session, response, _orders_query(q, order_status, event_id, date_from, date_to), limit, offset)
    refs = event_refs(session, [order.event_id for order, *_ in rows])
    buyers = people(session, [order.buyer_user_id for order, *_ in rows])
    return [AdminOrder(id=order.id, order_number=order.order_number, event_id=order.event_id, event_title=title, event_public_id=refs[order.event_id].public_id,
                       organizer_name=refs[order.event_id].organizer_name, buyer_name=buyers[order.buyer_user_id][0], buyer_email=email, status=order.status,
                       subtotal_minor=order.subtotal_minor, discount_minor=order.discount_minor, total_minor=order.total_minor, created_at=order.created_at,
                       confirmed_at=order.confirmed_at) for order, title, email in rows]


def payment_fields(session: Session, rows: list[tuple[payments, orders]], now) -> list[dict]:
    refs = event_refs(session, [order.event_id for _, order in rows])
    buyers = people(session, [order.buyer_user_id for _, order in rows])
    result = []
    for payment, order in rows:
        ref, (name, email) = refs[order.event_id], buyers[order.buyer_user_id]
        overdue = payment.status in UNFINISHED_PAYMENT_STATUSES and payment.next_check_at is not None and payment.next_check_at <= now
        result.append(dict(id=payment.id, order_id=order.id, order_number=order.order_number, event_id=order.event_id, event_title=ref.title, event_public_id=ref.public_id,
                           organizer_name=ref.organizer_name, buyer_name=name, buyer_email=email, status=payment.status, pending_operation=payment.pending_operation,
                           cancellation_reason=payment.cancellation_reason, amount_minor=payment.amount_minor, is_simulated=is_demonstration(payment), is_overdue=overdue,
                           next_check_at=payment.next_check_at, created_at=payment.created_at, finalized_at=payment.finalized_at))
    return result


@router.get("/payments", response_model=list[AdminPayment])
def search_payments(response: Response, payment_status: PaymentStatus | None = Query(default=None, alias="status"), problems_only: bool = False, q: str | None = None,
                    event_id: uuid.UUID | None = None, date_from: AwareDatetime | None = Query(default=None, alias="from"),
                    date_to: AwareDatetime | None = Query(default=None, alias="to"), limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                    session: Session = Depends(get_session), admin: users = Depends(require_admin)):
    now = db_now(session)
    query = select(payments, orders).join(orders, orders.id == payments.order_id).where(*created_between(payments.created_at, date_from, date_to))
    if payment_status is not None:
        query = query.where(payments.status == payment_status)
    if problems_only:
        query = query.where(or_(payments.status == PaymentStatus.FAILED, and_(payments.status.in_(UNFINISHED_PAYMENT_STATUSES), payments.next_check_at <= now)))
    if event_id is not None:
        query = query.where(orders.event_id == event_id)
    if q and q.strip():
        pattern = like_pattern(q)
        query = query.where(or_(orders.order_number.ilike(pattern), payments.provider_invoice_id.ilike(pattern), payments.provider_payment_id.ilike(pattern),
                                person_like(orders.buyer_user_id, pattern), event_like(orders.event_id, pattern)))
    rows = page(session, response, query.order_by(payments.created_at.desc(), payments.id), limit, offset)
    return [AdminPayment(**fields) for fields in payment_fields(session, rows, now)]


@router.get("/promo-codes", response_model=list[AdminPromo])
def promo_activity(response: Response, event_id: uuid.UUID | None = None, q: str | None = None, active: bool | None = None,
                   limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
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
    if active is not None:
        query = query.where(promo_codes.is_active.is_(active))
    if q and q.strip():
        pattern = like_pattern(q)
        query = query.where(or_(promo_codes.code.ilike(pattern), promotional_campaigns.name.ilike(pattern), event_like(promo_codes.event_id, pattern)))
    rows = page(session, response, query.order_by(promo_codes.redemption_count.desc(), promo_codes.code, promo_codes.id), limit, offset)
    refs = event_refs(session, [p.event_id for p, *_ in rows])
    return [
        AdminPromo(id=p.id, code=p.code, event_id=p.event_id, event_title=title, event_public_id=refs[p.event_id].public_id,
                   organizer_name=refs[p.event_id].organizer_name, campaign_name=campaign, is_active=p.is_active, max_redemptions=p.max_redemptions,
                   redemption_count=p.redemption_count, active_holds=active, valid_until=p.valid_until)
        for p, title, campaign, active in rows
    ]


@router.get("/audit", response_model=HistoryPage)
def audit_log(response: Response, q: str | None = Query(default=None, max_length=200), actor: str | None = Query(default=None, max_length=200),
              actor_id: uuid.UUID | None = None, event_id: uuid.UUID | None = None, entity_id: uuid.UUID | None = None,
              result: str | None = Query(default=None, pattern="^(SUCCESS|DENIED)$"),
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
    if actor_id is not None:
        conditions.append(audit_logs.actor_user_id == actor_id)
    if actor and actor.strip():
        conditions.append(person_like(audit_logs.actor_user_id, like_pattern(actor)))
    if q and q.strip():
        conditions.append(entity_like(q))
    query = select(audit_logs).where(*conditions)
    count_query = select(func.count()).select_from(audit_logs).where(*conditions)
    result = history_page(session, query, count_query, limit, offset, event_id, full_identity=True)
    response.headers["X-Total-Count"] = str(result.total)
    return result


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
                  "yes" if is_demonstration(p) else "no", p.created_at.isoformat(), p.finalized_at.isoformat() if p.finalized_at else ""]
                 for p, number in rows])
