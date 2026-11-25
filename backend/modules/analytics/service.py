import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.modules.analytics.schemas import (
    AttendanceMetrics, Bucket, EventAnalytics, FinancialMetrics, InventoryMetrics, PromoMetrics, SalesPoint, TicketTypeMetrics,
)
from backend.modules.events.models import events, event_seats
from backend.modules.events.schemas import SeatingMode
from backend.modules.orders.models import orders, order_items, reservation_items, reservations
from backend.modules.orders.schemas import OrderStatus
from backend.modules.orders.service import OCCUPYING_TICKET_STATUSES, availability, effective_hold_clause, ga_occupancy, taken_seat_ids
from backend.modules.payments import halyk
from backend.modules.payments.models import payments
from backend.modules.payments.schemas import PaymentStatus
from backend.modules.payments.service import SIMULATED_INVOICE_PREFIX
from backend.modules.promotions.models import promo_codes, promo_redemptions, promotional_campaigns
from backend.modules.refunds.models import refunds
from backend.modules.tickets.models import ticket_types, tickets
from backend.modules.tickets.schemas import TicketStatus


def _in_range(column, date_from: datetime | None, date_to: datetime | None) -> list:
    conditions = []
    if date_from is not None:
        conditions.append(column >= date_from)
    if date_to is not None:
        conditions.append(column < date_to)
    return conditions


def _inventory(session: Session, event: events, ticket_type: ticket_types | None) -> InventoryMetrics:
    now = db_now(session)
    ticket_filter = [tickets.event_id == event.id] + ([tickets.ticket_type_id == ticket_type.id] if ticket_type else [])
    sold = session.exec(select(func.count()).select_from(tickets).where(*ticket_filter, tickets.status.in_(OCCUPYING_TICKET_STATUSES))).one()
    historical = session.exec(select(func.count()).select_from(tickets).where(*ticket_filter)).one()

    if event.seating_mode == SeatingMode.GENERAL_ADMISSION:
        occupied_by_type = ga_occupancy(session, event.id, now)
        if ticket_type is None:
            capacity = event.ga_capacity
            occupied = sum(occupied_by_type.values())
        else:
            capacity = ticket_type.quantity_total
            occupied = occupied_by_type.get(ticket_type.id, 0)
    else:
        seat_filter = [event_seats.event_id == event.id, event_seats.is_enabled.is_(True), event_seats.ticket_type_id.is_not(None)]
        if ticket_type is not None:
            seat_filter.append(event_seats.ticket_type_id == ticket_type.id)
        seat_ids = set(session.exec(select(event_seats.id).where(*seat_filter)).all())
        capacity = len(seat_ids)
        occupied = len(seat_ids & taken_seat_ids(session, event.id, now))

    remaining = max(0, capacity - occupied) if capacity is not None else None
    percent = round(100 * sold / capacity, 1) if capacity else None
    return InventoryMetrics(capacity=capacity, sold=sold, historical_confirmed_tickets=historical, inventory_occupied=occupied, remaining_inventory=remaining, percent_sold=percent)


def _confirmed_lines(event_id: uuid.UUID, date_from, date_to, ticket_type_id: uuid.UUID | None) -> list:
    conditions = [orders.event_id == event_id, orders.status == OrderStatus.CONFIRMED, *_in_range(orders.confirmed_at, date_from, date_to)]
    if ticket_type_id is not None:
        conditions.append(order_items.ticket_type_id == ticket_type_id)
    return conditions


def _financial(session: Session, event_id: uuid.UUID, date_from, date_to, ticket_type_id: uuid.UUID | None) -> FinancialMetrics:
    gross, discounts = session.exec(
        select(func.coalesce(func.sum(order_items.line_subtotal_minor), 0), func.coalesce(func.sum(order_items.line_discount_minor), 0))
        .join(orders, orders.id == order_items.order_id)
        .where(*_confirmed_lines(event_id, date_from, date_to, ticket_type_id))
    ).one()

    succeeded = [orders.event_id == event_id, orders.status == OrderStatus.CONFIRMED, payments.status == PaymentStatus.SUCCEEDED, *_in_range(payments.finalized_at, date_from, date_to)]
    collected, fees, simulated = session.exec(
        select(
            func.coalesce(func.sum(payments.amount_minor), 0),
            func.coalesce(func.sum(payments.processing_fee_minor), 0),
            func.count() if halyk.SANDBOX else func.count().filter(payments.provider_invoice_id.like(f"{SIMULATED_INVOICE_PREFIX}%")),
        ).join(orders, orders.id == payments.order_id).where(*succeeded)
    ).one()
    refunded = session.exec(
        select(func.coalesce(func.sum(refunds.amount_minor), 0))
        .join(orders, orders.id == refunds.order_id)
        .where(orders.event_id == event_id, refunds.status == "SUCCEEDED", *_in_range(refunds.finalized_at, date_from, date_to))
    ).one()

    if ticket_type_id is not None:
        return FinancialMetrics(gross_sales_minor=int(gross), discounts_minor=int(discounts), collected_minor=None, refunded_minor=None,
                                net_revenue_minor=None, estimated_processing_fees_minor=None, estimated_proceeds_minor=None, is_demonstration=simulated > 0)
    net = int(collected) - int(refunded)
    return FinancialMetrics(
        gross_sales_minor=int(gross), discounts_minor=int(discounts), collected_minor=int(collected), refunded_minor=int(refunded),
        net_revenue_minor=net, estimated_processing_fees_minor=int(fees), estimated_proceeds_minor=net - int(fees), is_demonstration=simulated > 0,
    )


def _bucket_start(moment: datetime, zone: ZoneInfo, bucket: Bucket) -> datetime:
    local = moment.astimezone(zone).replace(tzinfo=None)
    if bucket == Bucket.HOUR:
        return local.replace(minute=0, second=0, microsecond=0)
    day = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return day - timedelta(days=day.weekday()) if bucket == Bucket.WEEK else day


def _sales_over_time(session: Session, event: events, date_from, date_to, ticket_type_id, bucket: Bucket) -> list[SalesPoint]:
    per_order = session.exec(
        select(orders.id, orders.confirmed_at, func.sum(order_items.quantity), func.sum(order_items.line_subtotal_minor))
        .join(orders, orders.id == order_items.order_id)
        .where(*_confirmed_lines(event.id, date_from, date_to, ticket_type_id))
        .group_by(orders.id, orders.confirmed_at)
    ).all()
    zone = ZoneInfo(event.timezone)
    buckets: dict[datetime, list[int]] = {}
    for _, confirmed_at, quantity, gross in per_order:
        point = buckets.setdefault(_bucket_start(confirmed_at, zone, bucket), [0, 0, 0])
        point[0] += 1
        point[1] += int(quantity)
        point[2] += int(gross)
    return [SalesPoint(bucket_start=start.isoformat(), orders=values[0], tickets=values[1], gross_sales_minor=values[2]) for start, values in sorted(buckets.items())]


def _by_ticket_type(session: Session, event: events, date_from, date_to, ticket_type_id) -> list[TicketTypeMetrics]:
    event_id = event.id
    type_filter = [ticket_types.event_id == event_id] + ([ticket_types.id == ticket_type_id] if ticket_type_id else [])
    types = session.exec(select(ticket_types).where(*type_filter).order_by(ticket_types.created_at, ticket_types.id)).all()
    sales = {
        type_id: (int(quantity), int(gross), int(discount))
        for type_id, quantity, gross, discount in session.exec(
            select(order_items.ticket_type_id, func.sum(order_items.quantity), func.sum(order_items.line_subtotal_minor), func.sum(order_items.line_discount_minor))
            .join(orders, orders.id == order_items.order_id)
            .where(*_confirmed_lines(event_id, date_from, date_to, ticket_type_id))
            .group_by(order_items.ticket_type_id)
        ).all()
    }
    statuses = {(type_id, ticket_status): count for type_id, ticket_status, count in session.exec(
        select(tickets.ticket_type_id, tickets.status, func.count()).where(tickets.event_id == event_id).group_by(tickets.ticket_type_id, tickets.status)
    ).all()}
    now = db_now(session)
    left = availability(session, event, now)
    reserved = dict(session.exec(
        select(reservation_items.ticket_type_id, func.sum(reservation_items.quantity)).join(reservations, reservations.id == reservation_items.reservation_id)
        .where(reservations.event_id == event_id, effective_hold_clause(now)).group_by(reservation_items.ticket_type_id)
    ).all())
    result = []
    for ticket_type in types:
        quantity, gross, discount = sales.get(ticket_type.id, (0, 0, 0))
        result.append(TicketTypeMetrics(ticket_type_id=ticket_type.id, name=ticket_type.name,
                                        sold=sum(statuses.get((ticket_type.id, s), 0) for s in OCCUPYING_TICKET_STATUSES), available=left.get(ticket_type.id) or 0,
                                        reserved=int(reserved.get(ticket_type.id, 0)), refunded=statuses.get((ticket_type.id, TicketStatus.REFUNDED), 0),
                                        cancelled=statuses.get((ticket_type.id, TicketStatus.CANCELLED), 0), checked_in=statuses.get((ticket_type.id, TicketStatus.CHECKED_IN), 0),
                                        confirmed_tickets=quantity,
                                        gross_sales_minor=gross, discounts_minor=discount, net_sales_minor=gross - discount))
    return result


def _promotions(session: Session, event_id: uuid.UUID, date_from, date_to, ticket_type_id) -> list[PromoMetrics]:
    lines = select(order_items.order_id.label("order_id"), func.sum(order_items.quantity).label("quantity"), func.sum(order_items.line_subtotal_minor).label("gross"),
                   func.sum(order_items.line_discount_minor).label("discount"))
    if ticket_type_id is not None:
        lines = lines.where(order_items.ticket_type_id == ticket_type_id)
    tickets_per_order = lines.group_by(order_items.order_id).subquery()
    refunded_per_order = (select(refunds.order_id.label("order_id"), func.sum(refunds.amount_minor).label("amount")).where(refunds.status == "SUCCEEDED")
                          .group_by(refunds.order_id).subquery())
    rows = session.exec(
        select(
            promo_codes.id, promo_codes.code, promo_codes.campaign_id, promotional_campaigns.name,
            func.count(orders.id), func.coalesce(func.sum(tickets_per_order.c.quantity), 0),
            func.coalesce(func.sum(tickets_per_order.c.gross), 0), func.coalesce(func.sum(tickets_per_order.c.discount), 0),
            func.coalesce(func.sum(refunded_per_order.c.amount), 0),
        )
        .select_from(promo_redemptions)
        .join(orders, orders.id == promo_redemptions.order_id)
        .join(promo_codes, promo_codes.id == promo_redemptions.promo_code_id)
        .join(tickets_per_order, tickets_per_order.c.order_id == orders.id)
        .outerjoin(refunded_per_order, refunded_per_order.c.order_id == orders.id)
        .outerjoin(promotional_campaigns, promotional_campaigns.id == promo_codes.campaign_id)
        .where(orders.event_id == event_id, orders.status == OrderStatus.CONFIRMED, *_in_range(orders.confirmed_at, date_from, date_to))
        .group_by(promo_codes.id, promo_codes.code, promo_codes.campaign_id, promotional_campaigns.name)
        .order_by(promo_codes.code)
    ).all()
    return [
        PromoMetrics(promo_code_id=promo_id, code=code, campaign_id=campaign_id, campaign_name=campaign_name, redemptions=redemptions,
                     tickets=int(quantity), gross_sales_minor=int(gross), discounts_minor=int(discount), net_sales_minor=int(gross) - int(discount),
                     refunded_minor=int(refunded) if ticket_type_id is None else None,
                     net_after_refunds_minor=int(gross) - int(discount) - int(refunded) if ticket_type_id is None else None)
        for promo_id, code, campaign_id, campaign_name, redemptions, quantity, gross, discount, refunded in rows
    ]


def _attendance(session: Session, event_id: uuid.UUID, ticket_type_id) -> AttendanceMetrics:
    conditions = [tickets.event_id == event_id] + ([tickets.ticket_type_id == ticket_type_id] if ticket_type_id else [])
    counts = dict(session.exec(select(tickets.status, func.count()).where(*conditions).group_by(tickets.status)).all())
    checked_in = counts.get(TicketStatus.CHECKED_IN, 0)
    eligible = checked_in + counts.get(TicketStatus.VALID, 0)
    return AttendanceMetrics(eligible=eligible, checked_in=checked_in, absent=eligible - checked_in,
                             check_in_percentage=round(100 * checked_in / eligible, 1) if eligible else None)


def event_analytics(session: Session, event: events, date_from: datetime | None, date_to: datetime | None, ticket_type: ticket_types | None, bucket: Bucket) -> EventAnalytics:
    type_id = ticket_type.id if ticket_type else None
    return EventAnalytics(
        event_id=event.id,
        timezone=event.timezone,
        date_from=date_from,
        date_to=date_to,
        ticket_type_id=type_id,
        bucket=bucket,
        inventory=_inventory(session, event, ticket_type),
        financial=_financial(session, event.id, date_from, date_to, type_id),
        sales_over_time=_sales_over_time(session, event, date_from, date_to, type_id, bucket),
        by_ticket_type=_by_ticket_type(session, event, date_from, date_to, type_id),
        promotions=_promotions(session, event.id, date_from, date_to, type_id),
        attendance=_attendance(session, event.id, type_id),
    )
