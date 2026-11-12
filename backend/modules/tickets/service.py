import base64
import hashlib
import hmac
import io
import secrets
import uuid

import qrcode
from sqlmodel import Session, select

from backend.core.config import TICKET_QR_SECRET, PUBLIC_API_URL
from backend.modules.events.models import events, event_seats
from backend.modules.orders.models import orders, order_items
from backend.modules.tickets.models import tickets, ticket_types
from backend.modules.tickets.schemas import TicketPublic
from backend.modules.users.user_model import profiles, users
from backend.modules.venues.models import venues, venue_rows, venue_seats, venue_sections


QR_PREFIX = "BFT1"


def _signature(ticket_code: str) -> str:
    digest = hmac.new(TICKET_QR_SECRET.encode(), f"{QR_PREFIX}.{ticket_code}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")[:32]


def qr_payload(ticket_code: str) -> str:
    return f"{QR_PREFIX}.{ticket_code}.{_signature(ticket_code)}"


def parse_qr_payload(payload: str) -> str | None:
    parts = payload.strip().split(".")
    if len(parts) != 3 or parts[0] != QR_PREFIX:
        return None
    if not hmac.compare_digest(parts[2], _signature(parts[1])):
        return None
    return parts[1]


def generate_ticket_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "BF-T-" + "".join(secrets.choice(alphabet) for _ in range(10))


def qr_png(data: str, box_size: int = 10) -> bytes:
    image = qrcode.make(data, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=box_size, border=4)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def seat_label(session: Session, event_seat_id: uuid.UUID | None) -> str | None:
    if event_seat_id is None:
        return None
    row = session.exec(
        select(venue_sections.name, venue_rows.label, venue_seats.seat_number)
        .select_from(event_seats)
        .join(venue_seats, venue_seats.id == event_seats.seat_id)
        .join(venue_rows, venue_rows.id == venue_seats.row_id)
        .join(venue_sections, venue_sections.id == venue_rows.section_id)
        .where(event_seats.id == event_seat_id)
    ).first()
    if row is None:
        return None
    section, row_label, number = row
    return f"Section {section}, Row {row_label}, Seat {number}"


def issue_for_order(session: Session, order: orders) -> list[tickets]:
    existing = session.exec(select(tickets).where(tickets.order_id == order.id)).all()
    if existing:
        return list(existing)
    profile = session.get(profiles, order.buyer_user_id)
    attendee_name = profile.full_name if profile and profile.full_name else "Ticket holder"
    issued = []
    items = session.exec(select(order_items).where(order_items.order_id == order.id).order_by(order_items.created_at, order_items.id)).all()
    for item in items:
        for sequence in range(1, item.quantity + 1):
            ticket = tickets(
                ticket_code=generate_ticket_code(),
                event_id=order.event_id,
                order_id=order.id,
                order_item_id=item.id,
                sequence_no=sequence,
                ticket_type_id=item.ticket_type_id,
                event_seat_id=item.event_seat_id,
                holder_user_id=order.buyer_user_id,
                attendee_name=attendee_name,
                seat_label=item.seat_label,
            )
            session.add(ticket)
            issued.append(ticket)
    session.flush()
    return issued


def to_public(session: Session, ticket: tickets) -> TicketPublic:
    event = session.get(events, ticket.event_id)
    venue = session.get(venues, event.venue_id)
    order = session.get(orders, ticket.order_id)
    ticket_type = session.get(ticket_types, ticket.ticket_type_id)
    return TicketPublic(
        id=ticket.id,
        ticket_code=ticket.ticket_code,
        event_id=event.id,
        event_title=event.title,
        event_starts_at=event.starts_at,
        event_timezone=event.timezone,
        venue_name=venue.name if venue else "",
        order_id=order.id,
        order_number=order.order_number,
        ticket_type_id=ticket_type.id,
        ticket_type_name=ticket_type.name,
        attendee_name=ticket.attendee_name,
        seat_label=ticket.seat_label,
        status=ticket.status,
        issued_at=ticket.issued_at,
        checked_in_at=ticket.checked_in_at,
        qr_payload=qr_payload(ticket.ticket_code),
        pdf_url=f"{PUBLIC_API_URL}/tickets/{ticket.id}/pdf",
    )


def buyer_email(session: Session, user_id: uuid.UUID) -> str:
    user = session.get(users, user_id)
    return user.email if user else ""
