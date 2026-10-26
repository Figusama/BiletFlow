import uuid

from fastapi import APIRouter, Depends

from core.errors import not_implemented
from modules.auth.dependencies import get_current_user
from modules.users.models import User

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.get("/mine")
async def my_tickets(user: User = Depends(get_current_user)):
    raise not_implemented()


@router.get("/{ticket_id}")
async def get_ticket(ticket_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.get("/{ticket_id}/pdf")
async def ticket_pdf(ticket_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()
