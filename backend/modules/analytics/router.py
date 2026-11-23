import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import AwareDatetime
from sqlmodel import Session

from backend.modules.analytics.schemas import Bucket, EventAnalytics
from backend.modules.analytics.service import event_analytics
from backend.modules.auth.dependencies import get_current_user
from backend.modules.events.access import require_organizer
from backend.modules.tickets.models import ticket_types
from backend.modules.users.user_model import users
from database.database import get_session

router = APIRouter(tags=["analytics"])


@router.get("/events/{event_id}/analytics", response_model=EventAnalytics)
def read_event_analytics(
    event_id: uuid.UUID,
    date_from: AwareDatetime | None = Query(default=None, alias="from"),
    date_to: AwareDatetime | None = Query(default=None, alias="to"),
    ticket_type_id: uuid.UUID | None = None,
    bucket: Bucket = Bucket.DAY,
    session: Session = Depends(get_session),
    current_user: users = Depends(get_current_user),
):
    event = require_organizer(session, event_id, current_user)
    if date_from is not None and date_to is not None and date_to <= date_from:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "'to' must be after 'from'")
    ticket_type = None
    if ticket_type_id is not None:
        ticket_type = session.get(ticket_types, ticket_type_id)
        if ticket_type is None or ticket_type.event_id != event.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket type not found")
    return event_analytics(session, event, date_from, date_to, ticket_type, bucket)
