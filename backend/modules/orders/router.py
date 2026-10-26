import uuid

from fastapi import APIRouter, Depends

from core.errors import not_implemented
from modules.auth.dependencies import get_current_user
from modules.users.models import User

router = APIRouter(tags=["checkout"])


@router.post("/events/{event_id}/reservations", status_code=201)
async def create_reservation(event_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.delete("/reservations/{reservation_id}", status_code=204)
async def release_reservation(reservation_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("/reservations/{reservation_id}/order", status_code=201)
async def create_order(reservation_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.get("/orders/mine")
async def my_orders(user: User = Depends(get_current_user)):
    raise not_implemented()


@router.get("/orders/{order_id}")
async def get_order(order_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("/orders/{order_id}/payments", status_code=201)
async def start_payment(order_id: uuid.UUID, user: User = Depends(get_current_user)):
    raise not_implemented()


@router.post("/payments/webhook")
async def payment_webhook():
    raise not_implemented()
