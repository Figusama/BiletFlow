import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi import status
from sqlalchemy import text

from database.database import engine

from .test_auth import USER, client, verified_user
from .test_events import OTHER, admin_user, bearer, clean_all, make_event, other_user, ADMIN

QUEUE_EMAIL = "backend.modules.orders.router.queue_ticket_email"
CAPACITY = 10


@pytest.fixture(autouse=True)
def mail():
    with patch(QUEUE_EMAIL) as mocked:
        yield mocked


def type_payload(event, **overrides):
    body = {
        "name": "General",
        "kind": "FREE",
        "price_minor": 0,
        "quantity_total": CAPACITY,
        "sales_start_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        "sales_end_at": event["ends_at"].isoformat(),
    }
    body.update(overrides)
    return body


def make_buyable_event(organizer, kind="FREE", price_minor=0):
    event = make_event(organizer["email"], ga_capacity=CAPACITY)
    r = client.post(
        f"/events/{event['id']}/ticket-types",
        json=type_payload(event, kind=kind, price_minor=price_minor),
        headers=bearer(organizer),
    )
    assert r.status_code == status.HTTP_201_CREATED, r.text
    event["type_id"] = r.json()["id"]
    with engine.begin() as conn:
        conn.execute(
            text("update events set status = 'PUBLISHED', published_at = now() where id = cast(:i as uuid)"),
            {"i": event["id"]},
        )
    return event


@pytest.fixture
def free_event(verified_user, other_user):
    return make_buyable_event(OTHER)


@pytest.fixture
def paid_event(verified_user, other_user):
    return make_buyable_event(OTHER, kind="PAID", price_minor=5000)


def reserve(event, quantity=1, user=USER, type_id=None):
    body = {"items": [{"ticket_type_id": type_id or event["type_id"], "quantity": quantity}]}
    return client.post(f"/events/{event['id']}/reservations", json=body, headers=bearer(user))


def order_from(reservation_id, user=USER, promo_code=None):
    body = {} if promo_code is None else {"promo_code": promo_code}
    return client.post(f"/reservations/{reservation_id}/order", json=body, headers=bearer(user))


def buy_free_tickets(event, quantity=1, user=USER):
    reservation = reserve(event, quantity, user)
    assert reservation.status_code == status.HTTP_201_CREATED, reservation.text
    order = order_from(reservation.json()["id"], user)
    assert order.status_code == status.HTTP_201_CREATED, order.text
    return order.json()


def expire_reservation(reservation_id):
    with engine.begin() as conn:
        conn.execute(
            text("update reservations set expires_at = now() - interval '1 hour' where id = cast(:i as uuid)"),
            {"i": reservation_id},
        )


@pytest.mark.parametrize("method,path", [
    ("post", "/events/{id}/reservations"),
    ("get", "/reservations/{id}"),
    ("delete", "/reservations/{id}"),
    ("post", "/reservations/{id}/order"),
    ("get", "/orders/mine"),
    ("get", "/orders/{id}"),
    ("post", "/orders/{id}/cancel"),
])
def test_endpoints_require_auth(method, path):
    kwargs = {"json": {"items": []}} if method == "post" else {}
    r = getattr(client, method)(path.format(id=uuid.uuid4()), **kwargs)
    assert r.status_code == status.HTTP_401_UNAUTHORIZED, r.text


def test_create_reservation(free_event):
    r = reserve(free_event, quantity=2)
    assert r.status_code == status.HTTP_201_CREATED, r.text
    body = r.json()
    assert body["event_id"] == free_event["id"]
    assert body["status"] == "ACTIVE"
    assert body["is_expired"] is False
    assert [(i["ticket_type_id"], i["quantity"]) for i in body["items"]] == [(free_event["type_id"], 2)]


def test_create_reservation_unknown_event(verified_user):
    body = {"items": [{"ticket_type_id": str(uuid.uuid4()), "quantity": 1}]}
    r = client.post(f"/events/{uuid.uuid4()}/reservations", json=body, headers=bearer(USER))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_create_reservation_for_draft_event(verified_user, other_user):
    event = make_buyable_event(OTHER)
    with engine.begin() as conn:
        conn.execute(text("update events set status = 'DRAFT' where id = cast(:i as uuid)"), {"i": event["id"]})
    assert reserve(event).status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_409_CONFLICT)


def test_create_reservation_unknown_ticket_type(free_event):
    r = reserve(free_event, type_id=str(uuid.uuid4()))
    assert r.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_422_UNPROCESSABLE_ENTITY), r.text


@pytest.mark.parametrize("quantity", [0, -1])
def test_create_reservation_invalid_quantity(free_event, quantity):
    r = reserve(free_event, quantity=quantity)
    assert r.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_422_UNPROCESSABLE_ENTITY), r.text


def test_create_reservation_empty_items(free_event):
    r = client.post(f"/events/{free_event['id']}/reservations", json={"items": []}, headers=bearer(USER))
    assert r.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_422_UNPROCESSABLE_ENTITY), r.text


def test_create_reservation_over_capacity(free_event):
    assert reserve(free_event, quantity=CAPACITY + 1).status_code == status.HTTP_409_CONFLICT


def test_reservations_share_capacity(free_event, admin_user):
    assert reserve(free_event, quantity=CAPACITY).status_code == status.HTTP_201_CREATED
    assert reserve(free_event, quantity=1, user=ADMIN).status_code == status.HTTP_409_CONFLICT


def test_read_own_reservation(free_event):
    reservation_id = reserve(free_event).json()["id"]
    r = client.get(f"/reservations/{reservation_id}", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["id"] == reservation_id


def test_read_reservation_of_another_user(free_event):
    reservation_id = reserve(free_event).json()["id"]
    r = client.get(f"/reservations/{reservation_id}", headers=bearer(OTHER))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_read_expired_reservation(free_event):
    reservation_id = reserve(free_event).json()["id"]
    expire_reservation(reservation_id)
    r = client.get(f"/reservations/{reservation_id}", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["is_expired"] is True


def test_release_reservation_frees_capacity(free_event):
    reservation_id = reserve(free_event, quantity=CAPACITY).json()["id"]
    r = client.delete(f"/reservations/{reservation_id}", headers=bearer(USER))
    assert r.status_code == status.HTTP_204_NO_CONTENT, r.text
    after = client.get(f"/reservations/{reservation_id}", headers=bearer(USER)).json()
    assert after["status"] != "ACTIVE"
    assert reserve(free_event, quantity=CAPACITY).status_code == status.HTTP_201_CREATED


def test_release_reservation_of_another_user(free_event):
    reservation_id = reserve(free_event).json()["id"]
    r = client.delete(f"/reservations/{reservation_id}", headers=bearer(OTHER))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_free_order_is_confirmed_and_issues_tickets(free_event, mail):
    order = buy_free_tickets(free_event, quantity=2)
    assert order["status"] == "CONFIRMED"
    assert order["requires_payment"] is False
    assert order["subtotal_minor"] == 0
    assert order["discount_minor"] == 0
    assert order["total_minor"] == 0
    assert order["promo_code"] is None
    assert order["order_number"]
    assert order["event_id"] == free_event["id"]
    assert order["event_title"] == free_event["title"]
    assert order["confirmed_at"] is not None
    assert len(order["ticket_ids"]) == 2
    assert sum(i["quantity"] for i in order["items"]) == 2
    mail.assert_called_once()


def test_issued_tickets_belong_to_buyer(free_event):
    order = buy_free_tickets(free_event)
    r = client.get(f"/tickets/{order['ticket_ids'][0]}", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text


def test_order_from_another_users_reservation(free_event):
    reservation_id = reserve(free_event).json()["id"]
    assert order_from(reservation_id, user=OTHER).status_code == status.HTTP_404_NOT_FOUND


def test_order_from_unknown_reservation(verified_user):
    assert order_from(str(uuid.uuid4())).status_code == status.HTTP_404_NOT_FOUND


def test_second_order_from_same_reservation(free_event):
    reservation_id = reserve(free_event).json()["id"]
    assert order_from(reservation_id).status_code == status.HTTP_201_CREATED
    assert order_from(reservation_id).status_code == status.HTTP_409_CONFLICT


def test_order_from_expired_reservation(free_event):
    reservation_id = reserve(free_event).json()["id"]
    expire_reservation(reservation_id)
    r = order_from(reservation_id)
    assert r.status_code in (status.HTTP_409_CONFLICT, status.HTTP_410_GONE), r.text


def test_order_with_unknown_promo_code(free_event):
    reservation_id = reserve(free_event).json()["id"]
    r = order_from(reservation_id, promo_code="DOES-NOT-EXIST")
    assert r.status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_422_UNPROCESSABLE_ENTITY), r.text


def test_paid_order_waits_for_payment(paid_event, mail):
    reservation = reserve(paid_event, quantity=2)
    assert reservation.status_code == status.HTTP_201_CREATED, reservation.text
    r = order_from(reservation.json()["id"])
    assert r.status_code == status.HTTP_201_CREATED, r.text
    order = r.json()
    assert order["status"] == "PENDING"
    assert order["requires_payment"] is True
    assert order["subtotal_minor"] == 10000
    assert order["total_minor"] == 10000
    assert order["ticket_ids"] == []
    assert order["confirmed_at"] is None
    mail.assert_not_called()


def test_cancel_pending_order_frees_capacity(paid_event):
    reservation_id = reserve(paid_event, quantity=CAPACITY).json()["id"]
    order_id = order_from(reservation_id).json()["id"]
    r = client.post(f"/orders/{order_id}/cancel", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["status"] == "CANCELLED"
    assert reserve(paid_event, quantity=CAPACITY).status_code == status.HTTP_201_CREATED


def test_cancel_order_of_another_user(paid_event):
    reservation_id = reserve(paid_event).json()["id"]
    order_id = order_from(reservation_id).json()["id"]
    r = client.post(f"/orders/{order_id}/cancel", headers=bearer(OTHER))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_read_own_order(free_event):
    order = buy_free_tickets(free_event)
    r = client.get(f"/orders/{order['id']}", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["order_number"] == order["order_number"]


def test_read_order_of_another_user(free_event):
    order = buy_free_tickets(free_event)
    r = client.get(f"/orders/{order['id']}", headers=bearer(OTHER))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_read_unknown_order(verified_user):
    r = client.get(f"/orders/{uuid.uuid4()}", headers=bearer(USER))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_read_order_invalid_id(verified_user):
    r = client.get("/orders/not-a-uuid", headers=bearer(USER))
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text


def test_my_orders_empty_for_new_user(verified_user):
    r = client.get("/orders/mine", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json() == []


def test_my_orders_lists_only_own_orders(free_event):
    order = buy_free_tickets(free_event)
    mine = client.get("/orders/mine", headers=bearer(USER)).json()
    assert [o["id"] for o in mine] == [order["id"]]
    theirs = client.get("/orders/mine", headers=bearer(OTHER)).json()
    assert theirs == []


def test_my_orders_newest_first(free_event):
    first = buy_free_tickets(free_event)
    second = buy_free_tickets(free_event)
    mine = client.get("/orders/mine", headers=bearer(USER)).json()
    assert [o["id"] for o in mine] == [second["id"], first["id"]]