import base64
import hashlib
import hmac
import io
import secrets
import uuid

import qrcode
from sqlmodel import Session, select

from backend.core.config import PUBLIC_API_URL, TICKET_QR_CURRENT_KEY, TICKET_QR_KEYS
from backend.modules.events.models import events, event_seats
from backend.modules.orders.models import orders, order_items
from backend.modules.tickets.models import check_in_records, tickets, ticket_types
from backend.modules.tickets.schemas import TicketPublic
from backend.modules.users.user_model import profiles, users
from backend.modules.venues.models import venues, venue_rows, venue_seats, venue_sections


QR_PREFIX = "BFT1"


def _signature(key_id: str, public_id: str) -> str | None:
    secret = TICKET_QR_KEYS.get(key_id)
    if secret is None:
        return None
    digest = hmac.new(secret.encode(), f"{QR_PREFIX}.{key_id}.{public_id}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")[:32]


def qr_payload(ticket: tickets) -> str:
    return f"{QR_PREFIX}.{ticket.qr_key_id}.{ticket.public_id}.{_signature(ticket.qr_key_id, ticket.public_id)}"


def parse_qr_payload(payload: str) -> str | None:
    parts = payload.strip().split(".")
    if len(parts) != 4 or parts[0] != QR_PREFIX:
        return None
    _, key_id, public_id, signature = parts
    expected = _signature(key_id, public_id)
    if expected is None or not hmac.compare_digest(signature, expected):
        return None
    return public_id


def generate_public_id() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "BF-T-" + "".join(secrets.choice(alphabet) for _ in range(10))


def qr_png(data: str, box_size: int = 10) -> bytes:
    image = qrcode.make(data, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=box_size, border=4)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def seat_parts(session: Session, event_seat_id: uuid.UUID | None) -> tuple[str | None, str | None, str | None]:
    if event_seat_id is None:
        return None, None, None
    row = session.exec(
        select(venue_sections.name, venue_rows.label, venue_seats.seat_number)
        .select_from(event_seats)
        .join(venue_seats, venue_seats.id == event_seats.seat_id)
        .join(venue_rows, venue_rows.id == venue_seats.row_id)
        .join(venue_sections, venue_sections.id == venue_rows.section_id)
        .where(event_seats.id == event_seat_id)
    ).first()
    return tuple(row) if row else (None, None, None)


def seat_label(section: str | None, row: str | None, seat: str | None) -> str | None:
    if not (section or row or seat):
        return None
    return f"Section {section}, Row {row}, Seat {seat}"


def issue_for_order(session: Session, order: orders) -> list[tickets]:
    existing = session.exec(select(tickets).where(tickets.order_id == order.id)).all()
    if existing:
        return []
    profile = session.get(profiles, order.buyer_user_id)
    attendee_name = profile.full_name if profile and profile.full_name else "Ticket holder"
    issued = []
    items = session.exec(select(order_items).where(order_items.order_id == order.id).order_by(order_items.created_at, order_items.id)).all()
    for item in items:
        names = item.attendee_names or []
        for index in range(item.quantity):
            ticket = tickets(
                public_id=generate_public_id(),
                order_item_id=item.id,
                order_id=order.id,
                event_id=order.event_id,
                ticket_type_id=item.ticket_type_id,
                event_seat_id=item.event_seat_id,
                attendee_name=(names[index] if index < len(names) else None) or attendee_name,
                section_snapshot=item.section_snapshot,
                row_snapshot=item.row_snapshot,
                seat_snapshot=item.seat_snapshot,
                qr_key_id=TICKET_QR_CURRENT_KEY,
            )
            session.add(ticket)
            issued.append(ticket)
    session.flush()
    return issued


def effective_check_in(session: Session, ticket_id: uuid.UUID) -> check_in_records | None:
    return session.exec(select(check_in_records).where(check_in_records.ticket_id == ticket_id, check_in_records.reversed_at.is_(None))).first()


def ticket_owner_id(session: Session, ticket: tickets) -> uuid.UUID:
    return session.get(orders, ticket.order_id).buyer_user_id


def to_public(session: Session, ticket: tickets) -> TicketPublic:
    event = session.get(events, ticket.event_id)
    venue = session.get(venues, event.venue_id)
    order = session.get(orders, ticket.order_id)
    ticket_type = session.get(ticket_types, ticket.ticket_type_id)
    check_in = effective_check_in(session, ticket.id)
    return TicketPublic(
        id=ticket.id,
        public_id=ticket.public_id,
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
        seat_label=seat_label(ticket.section_snapshot, ticket.row_snapshot, ticket.seat_snapshot),
        status=ticket.status,
        issued_at=ticket.issued_at,
        checked_in_at=check_in.checked_in_at if check_in else None,
        qr_payload=qr_payload(ticket),
        pdf_url=f"{PUBLIC_API_URL}/tickets/{ticket.id}/pdf",
    )


def buyer_email(session: Session, user_id: uuid.UUID) -> str:
    user = session.get(users, user_id)
    return user.email if user else ""
