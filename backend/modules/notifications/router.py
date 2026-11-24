import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, update
from sqlmodel import Session, select

from backend.core.clock import db_now
from backend.modules.auth.dependencies import get_current_user
from backend.modules.notifications.models import notifications
from backend.modules.notifications.schemas import NotificationPublic, UnreadCount
from backend.modules.users.user_model import users
from database.database import get_session

router = APIRouter(prefix="/notifications", tags=["notifications"])


def to_public(n: notifications) -> NotificationPublic:
    return NotificationPublic(id=n.id, type=n.type, title=n.title, body=n.body, action_url=n.action_url, read_at=n.read_at, created_at=n.created_at)


@router.get("", response_model=list[NotificationPublic])
def inbox(unread_only: bool = False, limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
          session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    query = select(notifications).where(notifications.user_id == current_user.id)
    if unread_only:
        query = query.where(notifications.read_at.is_(None))
    rows = session.exec(query.order_by(notifications.created_at.desc(), notifications.id).limit(limit).offset(offset)).all()
    return [to_public(n) for n in rows]


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    count = session.exec(select(func.count()).select_from(notifications).where(notifications.user_id == current_user.id, notifications.read_at.is_(None))).one()
    return UnreadCount(unread=count)


@router.post("/{notification_id}/read", response_model=NotificationPublic)
def mark_read(notification_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    notification = session.get(notifications, notification_id)
    if notification is None or notification.user_id != current_user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    if notification.read_at is None:
        notification.read_at = db_now(session)
        session.add(notification)
        session.commit()
        session.refresh(notification)
    return to_public(notification)


@router.post("/read-all", response_model=UnreadCount)
def mark_all_read(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    session.exec(update(notifications).where(notifications.user_id == current_user.id, notifications.read_at.is_(None)).values(read_at=db_now(session)))
    session.commit()
    return UnreadCount(unread=0)
