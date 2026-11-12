from fastapi import BackgroundTasks
from sqlmodel import Session

from backend.core.config import FRONTEND_URL, PUBLIC_API_URL
from backend.modules.auth.email import send_email
from backend.modules.events.models import events
from backend.modules.orders.models import orders
from backend.modules.tickets.models import tickets
from backend.modules.users.user_model import users


def queue_ticket_email(background: BackgroundTasks, session: Session, issued: list[tickets]) -> None:
    if not issued:
        return
    order = session.get(orders, issued[0].order_id)
    event = session.get(events, order.event_id)
    buyer = session.get(users, order.buyer_user_id)
    lines = [f"- {t.ticket_code} ({t.attendee_name}{', ' + t.seat_label if t.seat_label else ''})" for t in issued]
    body = (
        f"Your order {order.order_number} for \"{event.title}\" is confirmed.\n\n"
        f"Tickets:\n" + "\n".join(lines) + "\n\n"
        f"Sign in to view, download and print them: {FRONTEND_URL}/tickets\n"
        f"Add to calendar: {PUBLIC_API_URL}/events/{event.id}/calendar.ics\n"
    )
    background.add_task(send_email, buyer.email, f"BiletFlow: your tickets for {event.title}", body)
