import uuid

from fastapi import APIRouter, Depends

from core.errors import not_implemented
from modules.auth.dependencies import get_current_user
from modules.users.models import User

router = APIRouter(prefix="/events/{event_id}/check-in", tags=["check-in"])


@router.post("/scan")
async def scan(event_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("/tickets/{ticket_id}/undo")
async def undo_check_in(event_id: uuid.UUID, ticket_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.get("/attendees")
async def search_attendees(event_id: uuid.UUID, q: str | None = None, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.get("/stats")
async def stats(event_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()
