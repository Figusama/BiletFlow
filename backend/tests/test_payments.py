import uuid
from unittest.mock import patch

import pytest
from fastapi import status

from backend.core.config import FRONTEND_URL

from test_auth import USER, client, verified_user, clean_user
from test_events import ADMIN, OTHER, admin_user, bearer, clean_all, other_user
from test_orders import buy_free_tickets, free_event, order_from, paid_event, reserve

PAYMENT_MAIL = "backend.modules.payments.router.queue_ticket_email"
SIMULATOR_FLAG = "backend.modules.payments.router.PAYMENT_SIMULATOR_ENABLED"


@pytest.fixture(autouse=True)
def payment_mail():
    with patch(PAYMENT_MAIL) as mocked:
        yield mocked


@pytest.fixture(autouse=True)
def simulator_on():
    with patch(SIMULATOR_FLAG, True):
        yield


@pytest.fixture
def pending_order(paid_event):
    reservation = reserve(paid_event, quantity=2)
    assert reservation.status_code == status.HTTP_201_CREATED, reservation.text
    order = order_from(reservation.json()["id"])
    assert order.status_code == status.HTTP_201_CREATED, order.text
    return order.json()


@pytest.fixture
def payment(pending_order):
    r = start_payment(pending_order["id"])
    assert r.status_code == status.HTTP_201_CREATED, r.text
    return r.json()


def start_payment(order_id, user=USER, key=None):
    headers = bearer(user)
    if key:
        headers["Idempotency-Key"] = key
    return client.post(f"/orders/{order_id}/payments", headers=headers)


def list_payments(order_id, user=USER):
    return client.get(f"/orders/{order_id}/payments", headers=bearer(user))


def read_order(order_id, user=USER):
    r = client.get(f"/orders/{order_id}", headers=bearer(user))
    assert r.status_code == status.HTTP_200_OK, r.text
    return r.json()


def simulate(payment_id, outcome):
    return client.post(f"/payments/simulator/{payment_id}", data={"outcome": outcome}, follow_redirects=False)


def decide(payment_id, outcome):
    return client.post(f"/payments/simulator/{payment_id}/decision", json={"outcome": outcome})


def test_start_payment_requires_auth(pending_order):
    r = client.post(f"/orders/{pending_order['id']}/payments")
    assert r.status_code == status.HTTP_401_UNAUTHORIZED, r.text


def test_start_payment(pending_order):
    r = start_payment(pending_order["id"])
    assert r.status_code == status.HTTP_201_CREATED, r.text
    body = r.json()
    assert body["order_id"] == pending_order["id"]
    assert body["status"] == "PENDING"
    assert body["amount_minor"] == pending_order["total_minor"] == 10000


def test_start_payment_without_provider(pending_order):
    with patch(SIMULATOR_FLAG, False):
        r = start_payment(pending_order["id"])
    assert r.status_code == status.HTTP_503_SERVICE_UNAVAILABLE, r.text


def test_start_payment_unknown_order(verified_user):
    r = start_payment(str(uuid.uuid4()))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_start_payment_invalid_order_id(verified_user):
    r = client.post("/orders/not-a-uuid/payments", headers=bearer(USER))
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text


def test_start_payment_for_another_users_order(pending_order, other_user):
    r = start_payment(pending_order["id"], user=OTHER)
    assert r.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND), r.text
    assert list_payments(pending_order["id"]).json() == []


def test_start_payment_for_free_order(free_event):
    order = buy_free_tickets(free_event)
    r = start_payment(order["id"])
    assert r.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_409_CONFLICT, status.HTTP_422_UNPROCESSABLE_ENTITY), r.text
    assert list_payments(order["id"]).json() == []


def test_start_payment_for_cancelled_order(pending_order):
    cancelled = client.post(f"/orders/{pending_order['id']}/cancel", headers=bearer(USER))
    assert cancelled.status_code == status.HTTP_200_OK, cancelled.text
    r = start_payment(pending_order["id"])
    assert r.status_code in (status.HTTP_409_CONFLICT, status.HTTP_422_UNPROCESSABLE_ENTITY), r.text


def test_start_payment_is_idempotent(pending_order):
    first = start_payment(pending_order["id"], key="ci-key-1")
    second = start_payment(pending_order["id"], key="ci-key-1")
    assert first.status_code == status.HTTP_201_CREATED, first.text
    assert second.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED), second.text
    assert second.json()["id"] == first.json()["id"]
    assert len(list_payments(pending_order["id"]).json()) == 1


def test_second_unfinished_attempt_is_not_created(pending_order):
    first = start_payment(pending_order["id"]).json()
    second = start_payment(pending_order["id"])
    assert second.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED, status.HTTP_409_CONFLICT), second.text
    assert [p["id"] for p in list_payments(pending_order["id"]).json()] == [first["id"]]


def test_list_payments_requires_auth(pending_order):
    r = client.get(f"/orders/{pending_order['id']}/payments")
    assert r.status_code == status.HTTP_401_UNAUTHORIZED, r.text


def test_list_payments_empty_before_payment_starts(pending_order):
    r = list_payments(pending_order["id"])
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json() == []


def test_list_payments_unknown_order(verified_user):
    r = list_payments(str(uuid.uuid4()))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_list_payments_of_another_users_order(payment, pending_order, other_user):
    r = list_payments(pending_order["id"], user=OTHER)
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_list_payments_returns_attempts_in_order(pending_order):
    first = start_payment(pending_order["id"]).json()
    assert decide(first["id"], "decline").status_code == status.HTTP_200_OK
    second = start_payment(pending_order["id"]).json()
    listed = list_payments(pending_order["id"]).json()
    assert [p["id"] for p in listed] == [first["id"], second["id"]]


def test_webhook_without_signature_is_rejected(verified_user):
    r = client.post("/payments/webhook", content=b'{"invoice_id": "x"}')
    assert r.status_code == status.HTTP_401_UNAUTHORIZED, r.text


def test_webhook_with_invalid_signature_is_rejected(verified_user):
    r = client.post("/payments/webhook", content=b'{"invoice_id": "x"}', headers={"X-Signature": "not-a-valid-signature"})
    assert r.status_code == status.HTTP_401_UNAUTHORIZED, r.text


def test_simulator_page(payment, pending_order):
    r = client.get(f"/payments/simulator/{payment['id']}")
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.headers["content-type"].startswith("text/html")
    assert "DEMO PAYMENT" in r.text
    assert pending_order["order_number"] in r.text
    assert "disabled" not in r.text


def test_simulator_page_unknown_payment(verified_user):
    assert client.get(f"/payments/simulator/{uuid.uuid4()}").status_code == status.HTTP_404_NOT_FOUND


def test_simulator_page_when_disabled(payment):
    with patch(SIMULATOR_FLAG, False):
        assert client.get(f"/payments/simulator/{payment['id']}").status_code == status.HTTP_404_NOT_FOUND


def test_simulator_page_locks_buttons_after_completion(payment):
    simulate(payment["id"], "approve")
    r = client.get(f"/payments/simulator/{payment['id']}")
    assert r.status_code == status.HTTP_200_OK, r.text
    assert "disabled" in r.text
    assert "SUCCEEDED" in r.text


def test_simulator_approve_confirms_order_and_issues_tickets(payment, pending_order, payment_mail):
    r = simulate(payment["id"], "approve")
    assert r.status_code == status.HTTP_303_SEE_OTHER, r.text
    assert r.headers["location"] == f"{FRONTEND_URL}/orders/{pending_order['id']}"
    order = read_order(pending_order["id"])
    assert order["status"] == "CONFIRMED"
    assert order["confirmed_at"] is not None
    assert len(order["ticket_ids"]) == 2
    assert list_payments(pending_order["id"]).json()[0]["status"] == "SUCCEEDED"
    payment_mail.assert_called_once()


def test_issued_tickets_after_payment_belong_to_buyer(payment, pending_order):
    simulate(payment["id"], "approve")
    ticket_id = read_order(pending_order["id"])["ticket_ids"][0]
    r = client.get(f"/tickets/{ticket_id}", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text


def test_simulator_decline_keeps_order_pending(payment, pending_order, payment_mail):
    r = simulate(payment["id"], "decline")
    assert r.status_code == status.HTTP_303_SEE_OTHER, r.text
    order = read_order(pending_order["id"])
    assert order["status"] == "PENDING"
    assert order["ticket_ids"] == []
    assert list_payments(pending_order["id"]).json()[0]["status"] == "FAILED"
    payment_mail.assert_not_called()


def test_simulator_capture_failure_does_not_confirm_order(payment, pending_order, payment_mail):
    r = simulate(payment["id"], "capture_fail")
    assert r.status_code == status.HTTP_303_SEE_OTHER, r.text
    order = read_order(pending_order["id"])
    assert order["status"] != "CONFIRMED"
    assert order["ticket_ids"] == []
    assert list_payments(pending_order["id"]).json()[0]["status"] in ("FAILED", "CANCELLED")
    payment_mail.assert_not_called()


def test_simulator_rejects_unknown_outcome(payment):
    r = simulate(payment["id"], "teleport")
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text


def test_simulator_requires_outcome(payment):
    r = client.post(f"/payments/simulator/{payment['id']}", follow_redirects=False)
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text


def test_simulator_unknown_payment(verified_user):
    assert simulate(str(uuid.uuid4()), "approve").status_code == status.HTTP_404_NOT_FOUND


def test_simulator_submit_when_disabled(payment, pending_order):
    with patch(SIMULATOR_FLAG, False):
        assert simulate(payment["id"], "approve").status_code == status.HTTP_404_NOT_FOUND
    assert read_order(pending_order["id"])["status"] == "PENDING"


def test_approving_twice_does_not_issue_tickets_twice(payment, pending_order):
    simulate(payment["id"], "approve")
    simulate(payment["id"], "approve")
    order = read_order(pending_order["id"])
    assert order["status"] == "CONFIRMED"
    assert len(order["ticket_ids"]) == 2


def test_declined_payment_cannot_be_approved_afterwards(payment, pending_order):
    simulate(payment["id"], "decline")
    simulate(payment["id"], "approve")
    order = read_order(pending_order["id"])
    assert order["status"] == "PENDING"
    assert order["ticket_ids"] == []


def test_retry_after_decline_can_succeed(pending_order):
    first = start_payment(pending_order["id"]).json()
    simulate(first["id"], "decline")
    retry = start_payment(pending_order["id"])
    assert retry.status_code == status.HTTP_201_CREATED, retry.text
    assert retry.json()["id"] != first["id"]
    simulate(retry.json()["id"], "approve")
    order = read_order(pending_order["id"])
    assert order["status"] == "CONFIRMED"
    assert len(order["ticket_ids"]) == 2
    assert len(list_payments(pending_order["id"]).json()) == 2


def test_decision_approve(payment, pending_order, payment_mail):
    r = decide(payment["id"], "approve")
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["id"] == payment["id"]
    assert r.json()["status"] == "SUCCEEDED"
    assert read_order(pending_order["id"])["status"] == "CONFIRMED"
    payment_mail.assert_called_once()


def test_decision_decline(payment, pending_order):
    r = decide(payment["id"], "decline")
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["status"] == "FAILED"
    assert read_order(pending_order["id"])["status"] == "PENDING"


def test_decision_rejects_unknown_outcome(payment):
    assert decide(payment["id"], "teleport").status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_decision_requires_body(payment):
    r = client.post(f"/payments/simulator/{payment['id']}/decision", json={})
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text


def test_decision_unknown_payment(verified_user):
    assert decide(str(uuid.uuid4()), "approve").status_code == status.HTTP_404_NOT_FOUND


def test_decision_when_disabled(payment):
    with patch(SIMULATOR_FLAG, False):
        assert decide(payment["id"], "approve").status_code == status.HTTP_404_NOT_FOUND


def test_reconcile_requires_auth():
    assert client.post("/admin/payments/reconcile").status_code == status.HTTP_401_UNAUTHORIZED


def test_reconcile_forbidden_for_regular_user(verified_user):
    r = client.post("/admin/payments/reconcile", headers=bearer(USER))
    assert r.status_code == status.HTTP_403_FORBIDDEN, r.text


def test_reconcile_as_platform_admin(admin_user):
    r = client.post("/admin/payments/reconcile", headers=bearer(ADMIN))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert isinstance(r.json()["handled"], int)