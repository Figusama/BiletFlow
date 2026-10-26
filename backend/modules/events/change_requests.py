import uuid

from fastapi import APIRouter, Depends

from core.errors import not_implemented
from modules.auth.dependencies import get_current_user
from modules.users.models import User

router = APIRouter(prefix="/events/{event_id}/change-requests", tags=["event change requests"])


@router.get("")
async def list_change_requests(event_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("", status_code=201)
async def create_change_request(event_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.patch("/{request_id}")
async def update_change_request(event_id: uuid.UUID, request_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("/{request_id}/submit")
async def submit_change_request(event_id: uuid.UUID, request_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("/{request_id}/withdraw")
async def withdraw_change_request(
    event_id: uuid.UUID, request_id: uuid.UUID, user: User = Depends(get_current_user)
):
    raise not_implemented()
