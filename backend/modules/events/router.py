import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from database.database import get_session
from backend.modules.auth.dependencies import get_current_user
from backend.modules.users.user_model import users
from backend.modules.events.models import events
from backend.modules.events.schemas import EventCreate, EventUpdate, EventPublic, EventStatus

router = APIRouter(prefix="/events", tags=["events"])

def get_own_event(session: Session, event_id: uuid.UUID, user: users) -> events:
    event = session.get(events, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    if event.created_by_user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your event")
    return event

@router.post("/", response_model=EventPublic, status_code=status.HTTP_201_CREATED)
def create_event(data: EventCreate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = events(**data.model_dump(), status=EventStatus.DRAFT, created_by_user_id=current_user.id)
    session.add(event)
    session.commit()
    session.refresh(event)
    return event

@router.get("/", response_model=list[EventPublic])
def list_events(session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    return session.exec(select(events).where(events.created_by_user_id == current_user.id)).all()

@router.get("/{event_id}", response_model=EventPublic)
def read_event(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    return get_own_event(session, event_id, current_user)

@router.patch("/{event_id}", response_model=EventPublic)
def update_event(event_id: uuid.UUID, data: EventUpdate, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = get_own_event(session, event_id, current_user)
    if event.status != EventStatus.DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only draft events can be edited directly. Use a change request.")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    session.add(event)
    session.commit()
    session.refresh(event)
    return event

@router.post("/{event_id}/submit", response_model=EventPublic)
def submit_event(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = get_own_event(session, event_id, current_user)
    if event.status != EventStatus.DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only draft events can be submitted")
    if not event.title:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Title is required to submit")
    event.status = EventStatus.PENDING
    session.add(event)
    session.commit()
    session.refresh(event)
    return event

@router.post("/{event_id}/withdraw", response_model=EventPublic)
def withdraw_event(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = get_own_event(session, event_id, current_user)
    if event.status != EventStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only pending events can be withdrawn")
    event.status = EventStatus.WITHDRAWN
    session.add(event)
    session.commit()
    session.refresh(event)
    return event

@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: uuid.UUID, session: Session = Depends(get_session), current_user: users = Depends(get_current_user)):
    event = get_own_event(session, event_id, current_user)
    if event.status != EventStatus.DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only draft events can be deleted")
    session.delete(event)
    session.commit()