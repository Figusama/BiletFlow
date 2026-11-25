import re
import uuid
from dataclasses import dataclass

from sqlalchemy import Uuid, and_, exists, func, literal, null, or_, union_all
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.modules.events.models import events
from backend.modules.orders.models import order_items, orders, reservations
from backend.modules.orders.schemas import (
    AttendeeCounts, AttendeePage, EventAttendee, EventOrderDetail, OrderPaymentInfo, OrderRefundInfo, OrderStatus, OrderTicket,
)
from backend.modules.orders.service import effective_hold_clause, order_item_to_public
from backend.modules.payments.models import payments
from backend.modules.promotions.models import promo_codes
from backend.modules.refunds import service as refund_service
from backend.modules.refunds.models import refund_requests
from backend.modules.tickets.models import check_in_records, ticket_types, tickets
from backend.modules.tickets.schemas import TicketStatus
from backend.modules.tickets.service import seat_label
from backend.modules.users.user_model import profiles, users


@dataclass
class AttendeeFilter:
    q: str | None = None
    ticket_status: TicketStatus | None = None
    ticket_type_id: uuid.UUID | None = None
    checked_in: bool | None = None
    has_promo: bool | None = None


def like_pattern(text: str) -> str:
    return "%" + re.sub(r"([\\%_])", r"\\\1", text.strip()) + "%"


def pending_clause(now):
    return and_(orders.status == OrderStatus.PENDING, exists().where(reservations.id == orders.reservation_id, effective_hold_clause(now)))


def _order_conditions(event_id: uuid.UUID, filters: AttendeeFilter) -> list:
    conditions = [orders.event_id == event_id]
    if filters.has_promo is not None:
        conditions.append(orders.promo_code_id.is_not(None) if filters.has_promo else orders.promo_code_id.is_(None))
    return conditions


def _rows(event_id: uuid.UUID, filters: AttendeeFilter, now):
    search = [orders.order_number, users.email, profiles.full_name]
    issued = (select(orders.id.label("order_id"), tickets.id.label("ticket_id"), orders.created_at.label("created_at"), tickets.public_id.label("position"))
              .join(orders, orders.id == tickets.order_id).join(users, users.id == orders.buyer_user_id).outerjoin(profiles, profiles.user_id == users.id)
              .where(*_order_conditions(event_id, filters)))
    waiting = (select(orders.id.label("order_id"), null().cast(Uuid).label("ticket_id"), orders.created_at.label("created_at"), literal("").label("position"))
               .join(users, users.id == orders.buyer_user_id).outerjoin(profiles, profiles.user_id == users.id)
               .where(*_order_conditions(event_id, filters), pending_clause(now)))
    if filters.q and filters.q.strip():
        pattern = like_pattern(filters.q)
        issued = issued.where(or_(*[c.ilike(pattern) for c in search + [tickets.attendee_name, tickets.public_id]]))
        waiting = waiting.where(or_(*[c.ilike(pattern) for c in search]))
    if filters.ticket_type_id is not None:
        issued = issued.where(tickets.ticket_type_id == filters.ticket_type_id)
        waiting = waiting.where(exists().where(order_items.order_id == orders.id, order_items.ticket_type_id == filters.ticket_type_id))
    if filters.ticket_status is not None:
        issued = issued.where(tickets.status == filters.ticket_status)
    if filters.checked_in is not None:
        issued = issued.where(tickets.status == TicketStatus.CHECKED_IN if filters.checked_in else tickets.status != TicketStatus.CHECKED_IN)
    parts = [issued] if filters.ticket_status is not None or filters.checked_in is not None else [issued, waiting]
    return union_all(*parts).subquery()


def last_payments(session: Session, order_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple[payments, int]]:
    result: dict[uuid.UUID, tuple[payments, int]] = {}
    for payment in session.exec(select(payments).where(payments.order_id.in_(order_ids)).order_by(payments.created_at, payments.id)).all():
        result[payment.order_id] = (payment, result[payment.order_id][1] + 1 if payment.order_id in result else 1)
    return result


def check_ins(session: Session, ticket_ids: list[uuid.UUID]) -> dict:
    return dict(session.exec(select(check_in_records.ticket_id, check_in_records.checked_in_at)
                             .where(check_in_records.ticket_id.in_(ticket_ids), check_in_records.reversed_at.is_(None))).all())


def _hydrate(session: Session, page) -> list[EventAttendee]:
    order_ids = list({row.order_id for row in page})
    ticket_ids = [row.ticket_id for row in page if row.ticket_id is not None]
    info = {order.id: (order, email, name, code) for order, email, name, code in session.exec(
        select(orders, users.email, profiles.full_name, promo_codes.code).join(users, users.id == orders.buyer_user_id).outerjoin(profiles, profiles.user_id == users.id)
        .outerjoin(promo_codes, promo_codes.id == orders.promo_code_id).where(orders.id.in_(order_ids))).all()}
    found = {ticket.id: (ticket, type_name) for ticket, type_name in session.exec(
        select(tickets, ticket_types.name).join(ticket_types, ticket_types.id == tickets.ticket_type_id).where(tickets.id.in_(ticket_ids))).all()}
    waiting_ids = [row.order_id for row in page if row.ticket_id is None]
    lines: dict[uuid.UUID, list[order_items]] = {}
    for item in session.exec(select(order_items).where(order_items.order_id.in_(waiting_ids)).order_by(order_items.id)).all():
        lines.setdefault(item.order_id, []).append(item)
    paid = last_payments(session, order_ids)
    scanned = check_ins(session, ticket_ids)
    result = []
    for row in page:
        order, email, name, code = info[row.order_id]
        payment = paid.get(order.id)
        common = dict(order_id=order.id, order_number=order.order_number, order_status=order.status, buyer_name=name, buyer_email=email, paid_minor=order.total_minor,
                      promo_code=code, payment_status=payment[0].status if payment else None)
        if row.ticket_id is None:
            own = lines.get(order.id, [])
            same_type = own[0] if len({i.ticket_type_id for i in own}) == 1 else None
            result.append(EventAttendee(ticket_id=None, ticket_public_id=None, attendee_name=None, ticket_type_id=same_type.ticket_type_id if same_type else None,
                                        ticket_type_name=same_type.ticket_type_name if same_type else None, seat_label=None, ticket_status=None, checked_in_at=None,
                                        quantity=sum(i.quantity for i in own), **common))
            continue
        ticket, type_name = found[row.ticket_id]
        result.append(EventAttendee(ticket_id=ticket.id, ticket_public_id=ticket.public_id, attendee_name=ticket.attendee_name, ticket_type_id=ticket.ticket_type_id,
                                    ticket_type_name=type_name, seat_label=seat_label(ticket.section_snapshot, ticket.row_snapshot, ticket.seat_snapshot),
                                    ticket_status=ticket.status, checked_in_at=scanned.get(ticket.id), quantity=1, **common))
    return result


def list_attendees(session: Session, event_id: uuid.UUID, filters: AttendeeFilter, limit: int, offset: int) -> AttendeePage:
    now = db_now(session)
    rows = _rows(event_id, filters, now)
    total = session.exec(select(func.count()).select_from(rows)).one()
    page = session.exec(select(rows.c.order_id, rows.c.ticket_id).order_by(rows.c.created_at.desc(), rows.c.order_id, rows.c.position).limit(limit).offset(offset)).all()
    issued, checked_in = session.exec(select(func.count(), func.count().filter(tickets.status == TicketStatus.CHECKED_IN)).select_from(tickets)
                                      .where(tickets.event_id == event_id)).one()
    waiting = session.exec(select(func.count()).select_from(orders).where(orders.event_id == event_id, pending_clause(now))).one()
    return AttendeePage(items=_hydrate(session, page), total=total, counts=AttendeeCounts(all=issued + waiting, checked_in=checked_in, pending_orders=waiting))


def export_attendees(session: Session, event_id: uuid.UUID, filters: AttendeeFilter, limit: int) -> list[EventAttendee]:
    rows = _rows(event_id, filters, db_now(session))
    return _hydrate(session, session.exec(select(rows.c.order_id, rows.c.ticket_id).order_by(rows.c.created_at.desc(), rows.c.order_id, rows.c.position).limit(limit)).all())


def order_detail(session: Session, event: events, order: orders) -> EventOrderDetail:
    buyer = session.get(users, order.buyer_user_id)
    profile = session.exec(select(profiles).where(profiles.user_id == buyer.id)).first()
    promo = session.get(promo_codes, order.promo_code_id) if order.promo_code_id else None
    items = session.exec(select(order_items).where(order_items.order_id == order.id).order_by(order_items.created_at, order_items.id)).all()
    own = session.exec(select(tickets, ticket_types.name).join(ticket_types, ticket_types.id == tickets.ticket_type_id)
                       .where(tickets.order_id == order.id).order_by(tickets.public_id)).all()
    scanned = check_ins(session, [ticket.id for ticket, _ in own])
    payment = last_payments(session, [order.id]).get(order.id)
    request = session.exec(select(refund_requests).where(refund_requests.order_id == order.id).order_by(refund_requests.created_at.desc(), refund_requests.id)).first()
    held = session.exec(select(pending_clause(db_now(session))).select_from(orders).where(orders.id == order.id)).one()
    return EventOrderDetail(
        id=order.id, event_id=order.event_id, order_number=order.order_number, status=OrderStatus.EXPIRED if order.status == OrderStatus.PENDING and not held else order.status,
        created_at=order.created_at, confirmed_at=order.confirmed_at, buyer_name=profile.full_name if profile else None, buyer_email=buyer.email,
        items=[order_item_to_public(i) for i in items],
        tickets=[OrderTicket(ticket_id=t.id, ticket_public_id=t.public_id, attendee_name=t.attendee_name, ticket_type_id=t.ticket_type_id, ticket_type_name=type_name,
                             seat_label=seat_label(t.section_snapshot, t.row_snapshot, t.seat_snapshot), status=t.status, checked_in_at=scanned.get(t.id)) for t, type_name in own],
        subtotal_minor=order.subtotal_minor, discount_minor=order.discount_minor, total_minor=order.total_minor, promo_code=promo.code if promo else None,
        payment=OrderPaymentInfo(id=payment[0].id, status=payment[0].status, attempt_number=payment[1], created_at=payment[0].created_at,
                                 finalized_at=payment[0].finalized_at) if payment else None,
        refund_policy=order.refund_policy_snapshot or {}, refund_deadline=refund_service.policy_deadline(event, order),
        refund=OrderRefundInfo(id=request.id, source=request.source, status=request.status, execution_status=request.execution_status, reason_code=request.reason_code,
                               comment=request.comment, created_at=request.created_at, reviewed_at=request.reviewed_at,
                               escalates_at=refund_service.escalates_at(request)) if request else None,
    )
