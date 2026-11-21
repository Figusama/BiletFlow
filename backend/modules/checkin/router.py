import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlmodel import Session, select

from backend.core.clock import as_aware, db_now
from backend.modules.audit import service as audit
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import get_event_or_404, require_checkin_staff
from backend.modules.events.models import events
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.orders.models import orders
from backend.modules.promotions.models import promo_codes
from backend.modules.tickets import service as ticket_service
from backend.modules.tickets.models import check_in_records, ticket_types, tickets
from backend.modules.tickets.schemas import AttendeeRow, CheckInStats, ScanRequest, ScanResponse, ScanResult, TicketStatus, UndoRequest
from backend.modules.users.user_model import users
from database.database import get_session

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


@router.get("/events/{event_id}/stats", response_model=CheckInStats)
def stats(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_checkin_staff(session, event_id, current_user)
    counts = dict(session.exec(select(tickets.status, func.count()).where(tickets.event_id == event_id).group_by(tickets.status)).all())
    checked_in = counts.get(TicketStatus.CHECKED_IN, 0)
    registered = checked_in + counts.get(TicketStatus.VALID, 0)
    return CheckInStats(registered=registered, checked_in=checked_in, absent=registered - checked_in, check_in_percentage=round(100 * checked_in / registered, 1) if registered else 0.0)
