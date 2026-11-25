import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy import func, or_, and_, exists
from sqlmodel import Session, select
import io
import csv
from datetime import timedelta
from backend.core.clock import as_aware, db_now
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import get_event_or_404, require_checkin_staff
from backend.modules.events.models import events
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.orders.models import orders
from backend.modules.promotions.models import promo_codes
from backend.modules.refunds import service as refund_service
from backend.modules.refunds.models import refund_requests
from backend.modules.tickets import service as ticket_service
from backend.modules.tickets.models import check_in_records, ticket_types, tickets
from backend.modules.tickets.schemas import AttendeeRow, CheckInStats, ScanRequest, ScanResponse, ScanResult, TicketStatus, UndoRequest
from backend.modules.users.user_model import users, profiles
from backend.modules.payments.models import payments
from database.database import get_session
from backend.modules.orders.schemas import OrderStatus

router = APIRouter(prefix="/checkin", tags=["check-in"])

CAMPAIGN_LINK = re.compile(r"/c/([0-9a-fA-F-]{36})/?(?:[?#].*)?$")
STATUS_RESULTS = {TicketStatus.CHECKED_IN: ScanResult.ALREADY_USED, TicketStatus.CANCELLED: ScanResult.CANCELLED, TicketStatus.REFUNDED: ScanResult.REFUNDED}


def _response(session: Session, result: ScanResult, ticket: tickets | None) -> ScanResponse:
    if ticket is None:
        return ScanResponse(result=result)
    ticket_type = session.get(ticket_types, ticket.ticket_type_id)
    check_in = ticket_service.effective_check_in(session, ticket.id)
    return ScanResponse(
        result=result,
        ticket_id=ticket.id,
        public_id=ticket.public_id,
        attendee_name=ticket.attendee_name,
        ticket_type_name=ticket_type.name if ticket_type else None,
        seat_label=ticket_service.seat_label(ticket.section_snapshot, ticket.row_snapshot, ticket.seat_snapshot),
        checked_in_at=check_in.checked_in_at if check_in else None,
    )


def _is_campaign_qr(session: Session, payload: str) -> bool:
    match = CAMPAIGN_LINK.search(payload.strip())
    if match is None:
        return False
    try:
        token = uuid.UUID(match.group(1))
    except ValueError:
        return False
    return session.exec(select(promo_codes.id).where(promo_codes.campaign_token == token)).first() is not None


def _event_block(event: events, now) -> ScanResult | None:
    if event.status == EventLifecycleStatus.CANCELLED:
        return ScanResult.EVENT_CANCELLED
    if event.status != EventLifecycleStatus.PUBLISHED or now >= as_aware(event.ends_at):
        return ScanResult.EVENT_NOT_ACTIVE
    if event.is_suspended:
        return ScanResult.EVENT_SUSPENDED
    return None


def _deny(session: Session, result: ScanResult, event_id: uuid.UUID, user: users, ticket: tickets | None) -> ScanResponse:
    response = _response(session, result, ticket)
    session.rollback()
    audit.record_denied(action="CHECK_IN_DENIED_SIGNIFICANT", entity_type="TICKET", entity_id=ticket.id if ticket else None, event_id=event_id,
                        actor_user_id=user.id, details={"reason_code": result.value, **({"ticket_public_id": ticket.public_id} if ticket else {})})
    return response


@router.post("/scan", response_model=ScanResponse)
def scan(data: ScanRequest, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_checkin_staff(session, data.event_id, current_user)

    if _is_campaign_qr(session, data.payload):
        return _deny(session, ScanResult.CAMPAIGN_QR_NOT_ADMISSION, data.event_id, current_user, None)
    public_id = ticket_service.parse_qr_payload(data.payload)
    snapshot = session.exec(select(tickets).where(tickets.public_id == public_id)).first() if public_id else None
    if snapshot is None:
        return _deny(session, ScanResult.INVALID, data.event_id, current_user, None)
    if snapshot.event_id != data.event_id:
        return _deny(session, ScanResult.WRONG_EVENT, data.event_id, current_user, snapshot)

    event = get_event_or_404(session, data.event_id, for_update=True)
    require_checkin_staff(session, data.event_id, current_user)
    session.exec(select(orders).where(orders.id == snapshot.order_id).with_for_update().execution_options(populate_existing=True)).one()
    ticket = session.exec(select(tickets).where(tickets.id == snapshot.id).with_for_update().execution_options(populate_existing=True)).one()
    now = db_now(session)

    blocked = _event_block(event, now)
    if blocked is not None:
        return _deny(session, blocked, event.id, current_user, ticket)
    if ticket.status != TicketStatus.VALID:
        return _deny(session, STATUS_RESULTS.get(ticket.status, ScanResult.INVALID), event.id, current_user, ticket)
    if refund_service.is_checkin_blocked(session, ticket.order_id):
        return _deny(session, ScanResult.REFUND_IN_PROGRESS, event.id, current_user, ticket)

    record = check_in_records(ticket_id=ticket.id, checked_in_by=current_user.id, checked_in_at=now)
    ticket.status = TicketStatus.CHECKED_IN
    session.add(record)
    session.add(ticket)
    session.flush()
    audit.record(session, action="CHECK_IN_SUCCEEDED", entity_type="TICKET", entity_id=ticket.id, event_id=event.id, actor_user_id=current_user.id, details={"check_in_record_id": str(record.id)})
    session.commit()
    session.refresh(ticket)
    return _response(session, ScanResult.ADMITTED, ticket)


@router.post("/tickets/{ticket_id}/undo", response_model=ScanResponse)
def undo(ticket_id: uuid.UUID, data: UndoRequest, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    snapshot = session.get(tickets, ticket_id)
    if snapshot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    require_checkin_staff(session, snapshot.event_id, current_user, allow_platform_admin=True)
    event = get_event_or_404(session, snapshot.event_id, for_update=True)
    require_checkin_staff(session, event.id, current_user, allow_platform_admin=True)
    session.exec(select(orders).where(orders.id == snapshot.order_id).with_for_update().execution_options(populate_existing=True)).one()
    ticket = session.exec(select(tickets).where(tickets.id == ticket_id).with_for_update().execution_options(populate_existing=True)).one()
    record = session.exec(
        select(check_in_records).where(check_in_records.ticket_id == ticket.id, check_in_records.reversed_at.is_(None)).with_for_update().execution_options(populate_existing=True)
    ).first()
    if record is None or ticket.status != TicketStatus.CHECKED_IN:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ticket is not checked in")
    now = db_now(session)
    record.reversed_at = now
    record.reversed_by = current_user.id
    record.reversal_reason = data.reason.strip()
    ticket.status = TicketStatus.VALID
    session.add(record)
    session.add(ticket)
    audit.record(session, action="CHECK_IN_REVERSED", entity_type="TICKET", entity_id=ticket.id, event_id=event.id, actor_user_id=current_user.id, details={"check_in_record_id": str(record.id)})
    session.commit()
    session.refresh(ticket)
    return _response(session, ScanResult.UNDONE, ticket)


@router.get("/events/{event_id}/attendees", response_model=list[AttendeeRow])
def search_attendees(event_id: uuid.UUID, q: str | None = None, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_checkin_staff(session, event_id, current_user)
    query = (
        select(tickets, ticket_types.name, users.email)
        .join(ticket_types, ticket_types.id == tickets.ticket_type_id)
        .join(orders, orders.id == tickets.order_id)
        .join(users, users.id == orders.buyer_user_id)
        .where(tickets.event_id == event_id)
    )
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(or_(tickets.attendee_name.ilike(pattern), tickets.public_id.ilike(pattern), users.email.ilike(pattern)))
    rows = session.exec(query.order_by(tickets.attendee_name).limit(200)).all()
    result = [] 
    for ticket, type_name, email in rows:
        check_in = ticket_service.effective_check_in(session, ticket.id)
        result.append(AttendeeRow(
            ticket_id=ticket.id, public_id=ticket.public_id, attendee_name=ticket.attendee_name, buyer_email=email, ticket_type_name=type_name,
            seat_label=ticket_service.seat_label(ticket.section_snapshot, ticket.row_snapshot, ticket.seat_snapshot),
            status=ticket.status, checked_in_at=check_in.checked_in_at if check_in else None,
        ))
    return result

from backend.modules.events.access import require_organizer
from fastapi import Query


def seat_label(section: str | None, row: str | None, seat: str | None) -> str | None:
    parts = [p for p in (section, row, seat) if p]
    return " / ".join(parts) or None  # для GA пусто


def last_payment_status_col():
    return (
        select(payments.status)
        .where(payments.order_id == orders.id)
        .order_by(payments.created_at.desc())
        .limit(1)
        .correlate(orders)
        .scalar_subquery()
        .label("payment_status")
    )


ATTENDEE_COLUMNS = [
    tickets.id.label("ticket_id"),
    tickets.public_id.label("ticket_public_id"),
    tickets.attendee_name,
    tickets.ticket_type_id,
    ticket_types.name.label("ticket_type_name"),
    tickets.section_snapshot,
    tickets.row_snapshot,
    tickets.seat_snapshot,
    tickets.status.label("ticket_status"),
    check_in_records.checked_in_at,
    orders.id.label("order_id"),
    orders.order_number,
    orders.status.label("order_status"),
    users.email.label("buyer_email"),
    orders.total_minor.label("paid_minor"),
    promo_codes.code.label("promo_code"),
    last_payment_status_col(),
]

def attendee_item(r) -> dict:
    return {
        "ticket_id": r.ticket_id,
        "ticket_public_id": r.ticket_public_id,
        "attendee_name": r.attendee_name,
        "ticket_type_id": r.ticket_type_id,
        "ticket_type_name": r.ticket_type_name,
        "seat_label": seat_label(r.section_snapshot, r.row_snapshot, r.seat_snapshot),
        "ticket_status": r.ticket_status,
        "checked_in_at": r.checked_in_at,
        "order_id": r.order_id,
        "order_number": r.order_number,
        "order_status": r.order_status,
        "buyer_email": r.buyer_email,
        "paid_minor": r.paid_minor,
        "promo_code": r.promo_code,
        "payment_status": r.payment_status,
    }
def attendee_stmt(columns, event_id: uuid.UUID):
    return (
        select(*columns)
        .select_from(orders)
        .outerjoin(tickets, tickets.order_id == orders.id)
        .outerjoin(ticket_types, ticket_types.id == tickets.ticket_type_id)
        .outerjoin(check_in_records, and_(check_in_records.ticket_id == tickets.id,
                                          check_in_records.reversed_at.is_(None)))
        .outerjoin(promo_codes, promo_codes.id == orders.promo_code_id)
        .join(users, users.id == orders.buyer_user_id)
        .where(
            orders.event_id == event_id,
            or_(
                tickets.id.is_not(None),
                and_(orders.status == OrderStatus.PENDING, exists().where(payments.order_id == orders.id)),
            ),
        )
    )

def attendee_filters(q, ticket_status, ticket_type_id, checked_in, has_promo) -> list:
    f = []
    if q and q.strip():
        s = q.strip()
        f.append(or_(
            tickets.attendee_name.icontains(s, autoescape=True),
            users.email.icontains(s, autoescape=True),
            orders.order_number.icontains(s, autoescape=True),
            tickets.public_id.icontains(s, autoescape=True),
        ))
    if ticket_status:
        f.append(tickets.status == ticket_status)
    if ticket_type_id:
        f.append(tickets.ticket_type_id == ticket_type_id)
    if checked_in is True:
        f.append(check_in_records.id.is_not(None))
    elif checked_in is False:
        f.append(and_(tickets.id.is_not(None), check_in_records.id.is_(None)))
    if has_promo is not None:
        f.append(orders.promo_code_id.is_not(None) if has_promo else orders.promo_code_id.is_(None))
    return f

ATTENDEE_ORDER = (orders.created_at.desc(), orders.id, tickets.issued_at, tickets.id)

@router.get("/events/{event_id}/participants")
def list_event_attendees(
    event_id: uuid.UUID,
    q: str | None = Query(default=None, max_length=200),
    ticket_status: TicketStatus | None = None,
    ticket_type_id: uuid.UUID | None = None,
    checked_in: bool | None = None,
    has_promo: bool | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: users = Depends(get_current_user),
):
    require_organizer(session, event_id, current_user)
    filters = attendee_filters(q, ticket_status, ticket_type_id, checked_in, has_promo)

    total = session.exec(attendee_stmt([func.count()], event_id).where(*filters)).one()
    rows = session.exec(
        attendee_stmt(ATTENDEE_COLUMNS, event_id).where(*filters)
        .order_by(*ATTENDEE_ORDER).limit(limit).offset(offset)
    ).all()

    all_rows, checked_in_rows, pending_rows = session.exec(attendee_stmt(
        [func.count(), func.count(check_in_records.id), func.count(orders.id).filter(tickets.id.is_(None))],
        event_id,
    )).one()

    return {
        "items": [attendee_item(r) for r in rows],
        "total": total,
        "counts": {"total": all_rows, "checked_in": checked_in_rows, "pending_orders": pending_rows},
    }

@router.get("/{event_id}/orders/{order_id}")
def read_event_order(event_id: uuid.UUID, order_id: uuid.UUID, session: Session = Depends(get_session),
                     current_user: users = Depends(get_current_user)):
    event = require_organizer(session, event_id, current_user)
    order = session.get(orders, order_id)
    if order is None or order.event_id != event_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")  # чужой заказ не раскрываем

    buyer = session.exec(
        select(users.email, profiles.full_name).select_from(users)
        .outerjoin(profiles, profiles.user_id == users.id).where(users.id == order.buyer_user_id)
    ).first()

    ticket_rows = session.exec(
        select(tickets, ticket_types.name).join(ticket_types, ticket_types.id == tickets.ticket_type_id)
        .where(tickets.order_id == order.id).order_by(tickets.issued_at, tickets.id)
    ).all()

    payment_statuses = session.exec(
        select(payments.status).where(payments.order_id == order.id).order_by(payments.created_at.desc())
    ).all()

    promo = session.get(promo_codes, order.promo_code_id) if order.promo_code_id else None

    policy = order.refund_policy_snapshot or {}
    hours = policy.get("self_service_refund_until_hours_before_start")
    refund_deadline = (
        as_aware(event.starts_at) - timedelta(hours=hours)
        if isinstance(hours, int) and not isinstance(hours, bool) else None
    )

    refund = session.exec(
        select(refund_requests).where(refund_requests.order_id == order.id)
        .order_by(refund_requests.created_at.desc())
    ).first()

    return {
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "created_at": order.created_at,
        "confirmed_at": order.confirmed_at,
        "buyer": {"full_name": buyer[1] if buyer else None, "email": buyer[0] if buyer else None},
        "tickets": [
            {
                "ticket_id": t.id,
                "ticket_public_id": t.public_id,
                "attendee_name": t.attendee_name,
                "ticket_type_name": type_name,
                "seat_label": seat_label(t.section_snapshot, t.row_snapshot, t.seat_snapshot),
                "status": t.status,
            }
            for t, type_name in ticket_rows
        ],
        "money": {
            "subtotal_minor": order.subtotal_minor,
            "discount_minor": order.discount_minor,
            "promo_code": promo.code if promo else None,
            "total_minor": order.total_minor,
        },
        "payment": {"status": payment_statuses[0], "attempt_number": len(payment_statuses)} if payment_statuses else None,
        "refund_policy": policy,
        "refund_deadline": refund_deadline,
        "refund_request": (
            {"id": refund.id, "status": refund.status, "execution_status": refund.execution_status,
             "source": refund.source, "created_at": refund.created_at}
            if refund else None
        ),
    }


def csv_safe(value) -> str:
    s = "" if value is None else str(value)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s  # защита от формул в Excel


@router.get("/{event_id}/attendees/export.csv")
def export_event_attendees(
    event_id: uuid.UUID,
    q: str | None = Query(default=None, max_length=200),
    ticket_status: TicketStatus | None = None,
    ticket_type_id: uuid.UUID | None = None,
    checked_in: bool | None = None,
    has_promo: bool | None = None,
    session: Session = Depends(get_session),
    current_user: users = Depends(get_current_user),
):
    event = require_organizer(session, event_id, current_user)
    filters = attendee_filters(q, ticket_status, ticket_type_id, checked_in, has_promo)
    rows = session.exec(
        attendee_stmt(ATTENDEE_COLUMNS, event_id).where(*filters).order_by(*ATTENDEE_ORDER).limit(50000)
    ).all()

    header = ["ticket_public_id", "attendee_name", "ticket_type", "seat", "ticket_status", "checked_in_at",
              "order_number", "order_status", "buyer_email", "paid_minor", "promo_code", "payment_status"]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    for r in rows:
        i = attendee_item(r)
        writer.writerow([csv_safe(v) for v in (
            i["ticket_public_id"], i["attendee_name"], i["ticket_type_name"], i["seat_label"], i["ticket_status"],
            i["checked_in_at"], i["order_number"], i["order_status"], i["buyer_email"], i["paid_minor"],
            i["promo_code"], i["payment_status"])])
    return Response(
        content="\ufeff" + buf.getvalue(),  # BOM, чтобы Excel правильно открыл кириллицу
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="attendees-{event.slug}.csv"'},
    )

@router.get("/events/{event_id}/stats", response_model=CheckInStats)
def stats(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_checkin_staff(session, event_id, current_user)
    counts = dict(session.exec(select(tickets.status, func.count()).where(tickets.event_id == event_id).group_by(tickets.status)).all())
    checked_in = counts.get(TicketStatus.CHECKED_IN, 0)
    registered = checked_in + counts.get(TicketStatus.VALID, 0)
    return CheckInStats(registered=registered, checked_in=checked_in, absent=registered - checked_in, check_in_percentage=round(100 * checked_in / registered, 1) if registered else 0.0)
