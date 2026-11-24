import uuid
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import and_, or_
from sqlmodel import Session, select

from backend.core import crypto
from backend.core.clock import as_aware, db_now
from backend.core.config import EMAIL_MAX_ATTEMPTS
from backend.modules.auth import email as mailer
from backend.modules.events.models import private_event_invitations
from backend.modules.notifications.models import notification_deliveries, notifications, outbox_events
from database.database import engine

LEASE = timedelta(minutes=5)
SECRET_PLACEHOLDER = "{secret_link}"


@dataclass
class Email:
    address: str
    user_id: uuid.UUID | None = None
    subject: str | None = None
    body: str | None = None
    secret_link: str | None = None
    invitation_id: uuid.UUID | None = None
    purpose: str = "default"


@dataclass
class Notice:
    key: str
    event_type: str
    aggregate_type: str
    aggregate_id: uuid.UUID
    title: str
    body: str
    action_url: str | None = None
    inbox_user_ids: list[uuid.UUID] = field(default_factory=list)
    emails: list[Email] = field(default_factory=list)
    payload: dict = field(default_factory=dict)


def publish(session: Session, notice: Notice) -> outbox_events | None:
    if session.exec(select(outbox_events.id).where(outbox_events.business_event_key == notice.key)).first() is not None:
        return None
    now = db_now(session)
    event = outbox_events(business_event_key=notice.key, aggregate_type=notice.aggregate_type, aggregate_id=notice.aggregate_id,
                          event_type=notice.event_type, payload=notice.payload, status="COMPLETED", processed_at=now)
    session.add(event)
    session.flush()
    for user_id in dict.fromkeys(notice.inbox_user_ids):
        session.add(notifications(outbox_event_id=event.id, user_id=user_id, type=notice.event_type, title=notice.title, body=notice.body, action_url=notice.action_url))
    seen = set()
    for email in notice.emails:
        identity = (email.address.lower(), email.purpose)
        if identity in seen:
            continue
        seen.add(identity)
        body = email.body or notice.body
        if notice.action_url and not email.secret_link:
            body = f"{body}\n\n{notice.action_url}"
        session.add(notification_deliveries(
            outbox_event_id=event.id, recipient_user_id=email.user_id, recipient_email=email.address, purpose_key=email.purpose,
            template_key=notice.event_type, template_version="1", locale="en",
            template_data={"subject": email.subject or f"BiletFlow: {notice.title}", "body": body},
            encrypted_secret_payload=crypto.encrypt(email.secret_link) if email.secret_link else None,
            secret_key_version=crypto.KEY_VERSION if email.secret_link else None,
            invitation_id=email.invitation_id,
        ))
    return event


def _purge_secret(delivery: notification_deliveries) -> None:
    delivery.encrypted_secret_payload = None
    delivery.secret_key_version = None


def _claim(limit: int) -> list[uuid.UUID]:
    with Session(engine) as session:
        now = db_now(session)
        due = or_(
            and_(notification_deliveries.status == "PENDING", or_(notification_deliveries.next_attempt_at.is_(None), notification_deliveries.next_attempt_at <= now)),
            and_(notification_deliveries.status == "PROCESSING", notification_deliveries.processing_until < now),
        )
        rows = session.exec(select(notification_deliveries).where(due).order_by(notification_deliveries.created_at, notification_deliveries.id)
                            .limit(limit).with_for_update(skip_locked=True)).all()
        claimed = []
        for delivery in rows:
            if delivery.attempt_count >= EMAIL_MAX_ATTEMPTS:
                delivery.status = "FAILED"
                delivery.last_error_code = delivery.last_error_code or "MAX_ATTEMPTS"
                delivery.processing_until = None
                _purge_secret(delivery)
            elif delivery.invitation_id is not None and _invitation_expired(session, delivery.invitation_id, now):
                delivery.status = "SKIPPED"
                delivery.skipped_at = now
                delivery.skip_reason = "INVITATION_EXPIRED"
                delivery.processing_until = None
                _purge_secret(delivery)
            else:
                delivery.status = "PROCESSING"
                delivery.attempt_count += 1
                delivery.processing_until = now + LEASE
                claimed.append(delivery.id)
            session.add(delivery)
        session.commit()
        return claimed


def _invitation_expired(session: Session, invitation_id: uuid.UUID, now) -> bool:
    invitation = session.exec(select(private_event_invitations).where(private_event_invitations.id == invitation_id).with_for_update()).first()
    return invitation is None or as_aware(invitation.expires_at) <= now


def _send(delivery_id: uuid.UUID) -> None:
    with Session(engine) as session:
        delivery = session.get(notification_deliveries, delivery_id)
        if delivery is None or delivery.status != "PROCESSING":
            return
        address = delivery.recipient_email
        subject = delivery.template_data.get("subject", "BiletFlow")
        body = delivery.template_data.get("body", "")
        if delivery.encrypted_secret_payload:
            body = body.replace(SECRET_PLACEHOLDER, crypto.decrypt(delivery.encrypted_secret_payload))
    error = None
    try:
        mailer.send_email(address, subject, body)
    except Exception as exc:
        error = type(exc).__name__
    with Session(engine) as session:
        delivery = session.exec(select(notification_deliveries).where(notification_deliveries.id == delivery_id).with_for_update()).first()
        if delivery is None or delivery.status != "PROCESSING":
            return
        now = db_now(session)
        delivery.processing_until = None
        if error is None:
            delivery.status = "SENT"
            delivery.sent_at = now
            _purge_secret(delivery)
        elif delivery.attempt_count >= EMAIL_MAX_ATTEMPTS:
            delivery.status = "FAILED"
            delivery.last_error_code = error
            _purge_secret(delivery)
        else:
            delivery.status = "PENDING"
            delivery.last_error_code = error
            delivery.next_attempt_at = now + timedelta(minutes=2 ** delivery.attempt_count)
        session.add(delivery)
        session.commit()


def deliver_due(limit: int = 50) -> int:
    claimed = _claim(limit)
    for delivery_id in claimed:
        _send(delivery_id)
    return len(claimed)
