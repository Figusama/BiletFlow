import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, update
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import require_checkin_staff, get_event_or_404
from backend.modules.events.schemas import EventLifecycleStatus
from backend.modules.promotions.models import promotional_campaigns
from backend.modules.tickets import service as ticket_service
from backend.modules.tickets.models import check_in_records, ticket_types, tickets
from backend.modules.tickets.schemas import AttendeeRow, CheckInAction, CheckInStats, ScanRequest, ScanResponse, ScanResult, TicketStatus
from backend.modules.users.user_model import users
from database.database import get_session

router = APIRouter(prefix="/checkin", tags=["check-in"])

CAMPAIGN_LINK = re.compile(r"/c/([A-Za-z0-9_-]{8,})/?(?:[?#].*)?$")


def _log(session: Session, event_id: uuid.UUID, ticket_id: uuid.UUID | None, action: CheckInAction, result: ScanResult, user: users) -> None:
    session.add(check_in_records(event_id=event_id, ticket_id=ticket_id, action=action, result=result, performed_by_user_id=user.id))


def _response(session: Session, result: ScanResult, ticket: tickets | None) -> ScanResponse:
    if ticket is None:
        return ScanResponse(result=result)
    ticket_type = session.get(ticket_types, ticket.ticket_type_id)
    return ScanResponse(result=result, ticket_id=ticket.id, ticket_code=ticket.ticket_code, attendee_name=ticket.attendee_name, ticket_type_name=ticket_type.name if ticket_type else None, seat_label=ticket.seat_label, checked_in_at=ticket.checked_in_at)


def _is_campaign_qr(session: Session, payload: str) -> bool:
    match = CAMPAIGN_LINK.search(payload.strip())
    if match is None:
        return False
    return session.exec(select(promotional_campaigns.id).where(promotional_campaigns.token == match.group(1))).first() is not None


@router.post("/scan", response_model=ScanResponse)
def scan(data: ScanRequest, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = require_checkin_staff(session, data.event_id, current_user)

    if _is_campaign_qr(session, data.payload):
        _log(session, event.id, None, CheckInAction.SCAN, ScanResult.CAMPAIGN_QR_NOT_ADMISSION, current_user)
        session.commit()
        return ScanResponse(result=ScanResult.CAMPAIGN_QR_NOT_ADMISSION)

    code = ticket_service.parse_qr_payload(data.payload)
    ticket = session.exec(select(tickets).where(tickets.ticket_code == code)).first() if code else None
    if ticket is None:
        _log(session, event.id, None, CheckInAction.SCAN, ScanResult.INVALID, current_user)
        session.commit()
        return ScanResponse(result=ScanResult.INVALID)
    if ticket.event_id != event.id:
        _log(session, event.id, ticket.id, CheckInAction.SCAN, ScanResult.WRONG_EVENT, current_user)
        session.commit()
        return ScanResponse(result=ScanResult.WRONG_EVENT)
    if event.status == EventLifecycleStatus.CANCELLED:
        _log(session, event.id, ticket.id, CheckInAction.SCAN, ScanResult.EVENT_CANCELLED, current_user)
        session.commit()
        return _response(session, ScanResult.EVENT_CANCELLED, ticket)

    now = db_now(session)
    admitted = session.execute(
        update(tickets).where(tickets.id == ticket.id, tickets.status == TicketStatus.VALID)
        .values(status=TicketStatus.CHECKED_IN, checked_in_at=now, updated_at=now)
        .returning(tickets.id)
    ).first()
    session.refresh(ticket)
    if admitted:
        result = ScanResult.ADMITTED
    else:
        result = {
            TicketStatus.CHECKED_IN: ScanResult.ALREADY_USED,
            TicketStatus.CANCELLED: ScanResult.CANCELLED,
            TicketStatus.REFUNDED: ScanResult.REFUNDED,
        }.get(ticket.status, ScanResult.INVALID)
    _log(session, event.id, ticket.id, CheckInAction.SCAN, result, current_user)
    session.commit()
    session.refresh(ticket)
    return _response(session, result, ticket)


@router.post("/tickets/{ticket_id}/undo", response_model=ScanResponse)
def undo(ticket_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    ticket = session.get(tickets, ticket_id)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    event = require_checkin_staff(session, ticket.event_id, current_user)
    if event.status == EventLifecycleStatus.CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is cancelled")
    now = db_now(session)
    reverted = session.execute(
        update(tickets).where(tickets.id == ticket.id, tickets.status == TicketStatus.CHECKED_IN)
        .values(status=TicketStatus.VALID, checked_in_at=None, updated_at=now)
        .returning(tickets.id)
    ).first()
    if not reverted:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ticket is not checked in")
    _log(session, event.id, ticket.id, CheckInAction.UNDO, ScanResult.UNDONE, current_user)
    session.commit()
    session.refresh(ticket)
    return _response(session, ScanResult.UNDONE, ticket)


@router.get("/events/{event_id}/attendees", response_model=list[AttendeeRow])
def search_attendees(event_id: uuid.UUID, q: str | None = None, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_checkin_staff(session, event_id, current_user)
    query = (
        select(tickets, ticket_types.name, users.email)
        .join(ticket_types, ticket_types.id == tickets.ticket_type_id)
        .join(users, users.id == tickets.holder_user_id)
        .where(tickets.event_id == event_id)
    )
    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(or_(tickets.attendee_name.ilike(pattern), tickets.ticket_code.ilike(pattern), users.email.ilike(pattern)))
    rows = session.exec(query.order_by(tickets.attendee_name).limit(200)).all()
    return [
        AttendeeRow(ticket_id=t.id, ticket_code=t.ticket_code, attendee_name=t.attendee_name, buyer_email=email, ticket_type_name=type_name, seat_label=t.seat_label, status=t.status, checked_in_at=t.checked_in_at)
        for t, type_name, email in rows
    ]


@router.get("/events/{event_id}/stats", response_model=CheckInStats)
def stats(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    require_checkin_staff(session, event_id, current_user)
    counts = dict(session.exec(select(tickets.status, func.count()).where(tickets.event_id == event_id).group_by(tickets.status)).all())
    checked_in = counts.get(TicketStatus.CHECKED_IN, 0)
    registered = checked_in + counts.get(TicketStatus.VALID, 0)
    return CheckInStats(registered=registered, checked_in=checked_in, absent=registered - checked_in, check_in_percentage=round(100 * checked_in / registered, 1) if registered else 0.0)
