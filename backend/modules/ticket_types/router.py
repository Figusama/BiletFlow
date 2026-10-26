import uuid

from fastapi import APIRouter, Depends

from core.errors import not_implemented
from modules.auth.dependencies import get_current_user, get_optional_user
from modules.users.models import User

router = APIRouter(prefix="/events/{event_id}/ticket-types", tags=["ticket types"])


@router.get("")
async def list_ticket_types(event_id: uuid.UUID, user: User | None = Depends(get_optional_user)):
    raise not_implemented()


@router.post("", status_code=201)
async def create_ticket_type(event_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.patch("/{ticket_type_id}")
async def update_ticket_type(event_id: uuid.UUID, ticket_type_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("/{ticket_type_id}/pause")
async def pause_sales(event_id: uuid.UUID, ticket_type_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("/{ticket_type_id}/resume")
async def resume_sales(event_id: uuid.UUID, ticket_type_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()
