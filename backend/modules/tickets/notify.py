from fastapi import BackgroundTasks
from sqlmodel import Session

from backend.core.config import FRONTEND_URL, PUBLIC_API_URL
from backend.modules.events.models import events
from backend.modules.notifications import service as notify
from backend.modules.orders.models import orders
from backend.modules.tickets.models import tickets
from backend.modules.tickets.service import seat_label
from backend.modules.users.user_model import users


def deliver_notices(background: BackgroundTasks) -> None:
    background.add_task(notify.deliver_due)


def publish_order_confirmed(session: Session, order: orders, issued: list[tickets]) -> None:
    event = session.get(events, order.event_id)
    buyer = session.get(users, order.buyer_user_id)
    lines = []
    for t in issued:
        seat = seat_label(t.section_snapshot, t.row_snapshot, t.seat_snapshot)
        lines.append(f"- {t.public_id} ({t.attendee_name}{', ' + seat if seat else ''})")
    body = (
        f"Your order {order.order_number} for \"{event.title}\" is confirmed.\n\n"
        f"Tickets:\n" + "\n".join(lines) + "\n\n"
        f"Add to calendar: {PUBLIC_API_URL}/events/{event.id}/calendar.ics\n\n"
        "Sign in to view, download and print them:"
    )
    notify.publish(session, notify.Notice(
        key=f"ORDER_CONFIRMED:{order.id}", event_type="ORDER_CONFIRMED", aggregate_type="ORDER", aggregate_id=order.id, title="Your tickets are ready",
        body=f"Order {order.order_number} for \"{event.title}\" is confirmed.", action_url=f"{FRONTEND_URL}/tickets", inbox_user_ids=[buyer.id],
        emails=[notify.Email(address=buyer.email, user_id=buyer.id, subject=f"BiletFlow: your tickets for {event.title}", body=body)]))
