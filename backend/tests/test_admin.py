import csv
import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import status
from sqlalchemy import text

from database.database import engine

from .test_auth import USER, client, verified_user
from .test_events import ADMIN, OTHER, admin_user, bearer, clean_all, make_event, other_user, published_event
from .test_orders import buy_free_tickets, free_event, mail, reserve
from .test_payments import payment, payment_mail, pending_order, simulate, simulator_on

MISSING_ID = str(uuid.uuid4())
LIST_ENDPOINTS = [
    "/admin/users",
    "/admin/events",
    "/admin/orders",
    "/admin/payments",
    "/admin/promo-codes",
    "/admin/audit",
]
PROTECTED_ENDPOINTS = [
    ("get", "/admin/users"),
    ("get", "/admin/events"),
    ("get", "/admin/orders"),
    ("get", "/admin/payments"),
    ("get", "/admin/promo-codes"),
    ("get", "/admin/audit"),
    ("get", "/admin/reports/orders.csv"),
    ("get", "/admin/reports/payments.csv"),
    ("post", f"/admin/events/{MISSING_ID}/suspend"),
    ("post", f"/admin/events/{MISSING_ID}/restore"),
]


def admin_get(path, **params):
    return client.get(path, params=params, headers=bearer(ADMIN))


def suspend(event_id, reason="Policy violation", user=ADMIN):
    return client.post(f"/admin/events/{event_id}/suspend", json={"reason": reason}, headers=bearer(user))


def restore(event_id, user=ADMIN):
    return client.post(f"/admin/events/{event_id}/restore", headers=bearer(user))


def call_protected(method, path, headers=None):
    kwargs = {"headers": headers or {}}
    if path.endswith("/suspend"):
        kwargs["json"] = {"reason": "x"}
    return getattr(client, method)(path, **kwargs)


def db_value(sql, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).scalar_one_or_none()


def db_execute(sql, **params):
    with engine.begin() as conn:
        conn.execute(text(sql), params)


def csv_rows(response):
    return list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))


def ids(items):
    return [item["id"] for item in items]


def find_event(title):
    r = admin_get("/admin/events", q=title)
    assert r.status_code == status.HTTP_200_OK, r.text
    assert len(r.json()) == 1
    return r.json()[0]


def set_event_status(event_id, value):
    db_execute("update events set status = :s where id = cast(:i as uuid)", s=value, i=event_id)


@pytest.mark.parametrize("method,path", PROTECTED_ENDPOINTS)
def test_admin_endpoints_require_auth(method, path):
    assert call_protected(method, path).status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.parametrize("method,path", PROTECTED_ENDPOINTS)
def test_admin_endpoints_forbidden_for_regular_user(verified_user, method, path):
    r = call_protected(method, path, bearer(USER))
    assert r.status_code == status.HTTP_403_FORBIDDEN, r.text


@pytest.mark.parametrize("path", LIST_ENDPOINTS)
def test_list_endpoints_work_for_admin(admin_user, path):
    r = admin_get(path)
    assert r.status_code == status.HTTP_200_OK, r.text


@pytest.mark.parametrize("path", LIST_ENDPOINTS)
@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 201}, {"offset": -1}])
def test_list_endpoints_reject_bad_pagination(admin_user, path, params):
    assert admin_get(path, **params).status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_organizer_cannot_use_admin_actions(published_event):
    assert suspend(published_event["id"], user=USER).status_code == status.HTTP_403_FORBIDDEN
    assert restore(published_event["id"], user=USER).status_code == status.HTTP_403_FORBIDDEN


def test_search_users_by_email(admin_user, other_user):
    r = admin_get("/admin/users", q=OTHER["email"])
    assert r.status_code == status.HTTP_200_OK, r.text
    assert [u["email"] for u in r.json()] == [OTHER["email"]]
    found = r.json()[0]
    assert found["full_name"] == OTHER["full_name"]
    assert found["is_suspended"] is False
    assert found["public_id"]
    assert found["id"]
    assert found["created_at"]


def test_search_users_is_case_insensitive(admin_user, other_user):
    r = admin_get("/admin/users", q=OTHER["email"].upper())
    assert [u["email"] for u in r.json()] == [OTHER["email"]]


def test_search_users_by_full_name(admin_user, other_user):
    r = admin_get("/admin/users", q=OTHER["full_name"])
    assert OTHER["email"] in [u["email"] for u in r.json()]


def test_search_users_by_public_id(admin_user, other_user):
    public_id = db_value("select public_id from users where email = :e", e=OTHER["email"])
    r = admin_get("/admin/users", q=public_id)
    assert OTHER["email"] in [u["email"] for u in r.json()]


def test_search_users_shows_admin_role(admin_user):
    r = admin_get("/admin/users", q=ADMIN["email"])
    assert r.json()[0]["personal_role"] == "PLATFORM_ADMIN"


def test_search_users_no_match(admin_user):
    assert admin_get("/admin/users", q="nobody-at-all-xyz").json() == []


def test_search_users_treats_percent_literally(admin_user):
    assert admin_get("/admin/users", q="%").json() == []


def test_search_users_suspended_filter(admin_user, other_user):
    db_execute("update users set is_suspended = true where email = :e", e=OTHER["email"])
    suspended = admin_get("/admin/users", q=OTHER["email"], suspended="true").json()
    assert [u["email"] for u in suspended] == [OTHER["email"]]
    assert suspended[0]["is_suspended"] is True
    assert admin_get("/admin/users", q=OTHER["email"], suspended="false").json() == []


def test_search_users_newest_first(verified_user, other_user, admin_user):
    items = admin_get("/admin/users", q="ci-", limit=200).json()
    created = [u["created_at"] for u in items]
    assert len(items) >= 3
    assert created == sorted(created, reverse=True)


def test_search_users_pagination(verified_user, other_user, admin_user):
    full = ids(admin_get("/admin/users", q="ci-", limit=200).json())
    page_one = ids(admin_get("/admin/users", q="ci-", limit=2).json())
    page_two = ids(admin_get("/admin/users", q="ci-", limit=2, offset=2).json())
    assert len(page_one) == 2
    assert page_one + page_two == full[:4]


def test_search_events_by_title(draft_event_for_admin):
    found = find_event(draft_event_for_admin["title"])
    assert found["id"] == draft_event_for_admin["id"]
    assert found["status"] == "DRAFT"
    assert found["is_suspended"] is False
    assert found["suspended_at"] is None
    assert found["organizer_email"] == USER["email"]
    assert found["tickets_issued"] == 0


def test_search_events_by_public_id_and_slug(draft_event_for_admin):
    for key in ("public_id", "slug"):
        r = admin_get("/admin/events", q=draft_event_for_admin[key])
        assert draft_event_for_admin["id"] in ids(r.json())


def test_search_events_status_filter(admin_user, published_event):
    title = published_event["title"]
    assert ids(admin_get("/admin/events", q=title, status="PUBLISHED").json()) == [published_event["id"]]
    assert admin_get("/admin/events", q=title, status="DRAFT").json() == []


def test_search_events_rejects_unknown_status(admin_user):
    assert admin_get("/admin/events", status="NOPE").status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_search_events_suspended_filter(admin_user, published_event):
    title = published_event["title"]
    assert admin_get("/admin/events", q=title, suspended="true").json() == []
    suspend(published_event["id"])
    assert ids(admin_get("/admin/events", q=title, suspended="true").json()) == [published_event["id"]]
    assert admin_get("/admin/events", q=title, suspended="false").json() == []


def test_search_events_counts_issued_tickets(admin_user, free_event):
    buy_free_tickets(free_event, quantity=2)
    assert find_event(free_event["title"])["tickets_issued"] == 2


@pytest.fixture
def draft_event_for_admin(verified_user, admin_user):
    return make_event()


def test_suspend_event(admin_user, published_event):
    r = suspend(published_event["id"], "Fraud report")
    assert r.status_code == status.HTTP_200_OK, r.text
    body = r.json()
    assert body["id"] == published_event["id"]
    assert body["is_suspended"] is True
    assert body["suspension_reason"] == "Fraud report"
    assert body["suspended_at"] is not None


def test_suspend_strips_reason(admin_user, published_event):
    assert suspend(published_event["id"], "  spam  ").json()["suspension_reason"] == "spam"


@pytest.mark.parametrize("reason", ["", "   "])
def test_suspend_requires_a_reason(admin_user, published_event, reason):
    r = suspend(published_event["id"], reason)
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text
    assert find_event(published_event["title"])["is_suspended"] is False


def test_suspend_requires_request_body(admin_user, published_event):
    r = client.post(f"/admin/events/{published_event['id']}/suspend", json={}, headers=bearer(ADMIN))
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text


def test_suspend_unknown_event(admin_user):
    assert suspend(MISSING_ID).status_code == status.HTTP_404_NOT_FOUND


def test_suspend_invalid_event_id(admin_user):
    r = client.post("/admin/events/not-a-uuid/suspend", json={"reason": "x"}, headers=bearer(ADMIN))
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text


@pytest.mark.parametrize("final_status", ["CANCELLED", "COMPLETED"])
def test_suspend_finished_event_is_conflict(admin_user, published_event, final_status):
    set_event_status(published_event["id"], final_status)
    assert suspend(published_event["id"]).status_code == status.HTTP_409_CONFLICT


def test_suspend_draft_event(draft_event_for_admin):
    assert suspend(draft_event_for_admin["id"]).status_code == status.HTTP_200_OK


def test_suspending_twice_keeps_original_reason(admin_user, published_event):
    first = suspend(published_event["id"], "first").json()
    second = suspend(published_event["id"], "second")
    assert second.status_code == status.HTTP_200_OK, second.text
    assert second.json()["suspension_reason"] == "first"
    assert second.json()["suspended_at"] == first["suspended_at"]


def test_suspended_event_disappears_from_public_list(admin_user, published_event):
    params = {"q": published_event["title"]}
    assert ids(client.get("/events/", params=params).json()) == [published_event["id"]]
    suspend(published_event["id"])
    assert client.get("/events/", params=params).json() == []


def test_suspended_event_cannot_be_bought(admin_user, free_event):
    suspend(free_event["id"])
    assert reserve(free_event).status_code in (status.HTTP_404_NOT_FOUND, status.HTTP_409_CONFLICT)


def test_restore_event(admin_user, published_event):
    suspend(published_event["id"])
    r = restore(published_event["id"])
    assert r.status_code == status.HTTP_200_OK, r.text
    body = r.json()
    assert body["is_suspended"] is False
    assert body["suspended_at"] is None
    assert body["suspension_reason"] is None
    listed = client.get("/events/", params={"q": published_event["title"]}).json()
    assert ids(listed) == [published_event["id"]]


def test_restore_event_that_is_not_suspended(admin_user, published_event):
    r = restore(published_event["id"])
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["is_suspended"] is False


def test_restore_unknown_event(admin_user):
    assert restore(MISSING_ID).status_code == status.HTTP_404_NOT_FOUND


def test_search_orders_by_order_number(admin_user, free_event):
    order = buy_free_tickets(free_event, quantity=2)
    r = admin_get("/admin/orders", q=order["order_number"])
    assert r.status_code == status.HTTP_200_OK, r.text
    assert len(r.json()) == 1
    found = r.json()[0]
    assert found["id"] == order["id"]
    assert found["order_number"] == order["order_number"]
    assert found["event_id"] == free_event["id"]
    assert found["event_title"] == free_event["title"]
    assert found["buyer_email"] == USER["email"]
    assert found["status"] == "CONFIRMED"
    assert found["total_minor"] == 0
    assert found["confirmed_at"] is not None


def test_search_orders_by_buyer_email(admin_user, free_event):
    order = buy_free_tickets(free_event)
    r = admin_get("/admin/orders", q=USER["email"])
    assert order["id"] in ids(r.json())


def test_search_orders_status_filter(admin_user, free_event):
    order = buy_free_tickets(free_event)
    number = order["order_number"]
    assert ids(admin_get("/admin/orders", q=number, status="CONFIRMED").json()) == [order["id"]]
    assert admin_get("/admin/orders", q=number, status="PENDING").json() == []


def test_search_orders_finds_pending_order(admin_user, pending_order):
    r = admin_get("/admin/orders", q=pending_order["order_number"], status="PENDING")
    assert ids(r.json()) == [pending_order["id"]]
    assert r.json()[0]["total_minor"] == 10000


def test_search_orders_event_filter(admin_user, free_event):
    order = buy_free_tickets(free_event)
    assert ids(admin_get("/admin/orders", event_id=free_event["id"]).json()) == [order["id"]]
    assert admin_get("/admin/orders", event_id=MISSING_ID).json() == []


@pytest.mark.parametrize("params", [{"status": "NOPE"}, {"event_id": "not-a-uuid"}])
def test_search_orders_rejects_bad_filters(admin_user, params):
    assert admin_get("/admin/orders", **params).status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_search_orders_newest_first(admin_user, free_event):
    first = buy_free_tickets(free_event)
    second = buy_free_tickets(free_event)
    assert ids(admin_get("/admin/orders", event_id=free_event["id"]).json()) == [second["id"], first["id"]]


def test_search_orders_pagination(admin_user, free_event):
    first = buy_free_tickets(free_event)
    second = buy_free_tickets(free_event)
    page_one = admin_get("/admin/orders", event_id=free_event["id"], limit=1).json()
    page_two = admin_get("/admin/orders", event_id=free_event["id"], limit=1, offset=1).json()
    assert ids(page_one) == [second["id"]]
    assert ids(page_two) == [first["id"]]


def test_search_payments_by_order_number(admin_user, payment, pending_order):
    r = admin_get("/admin/payments", q=pending_order["order_number"])
    assert r.status_code == status.HTTP_200_OK, r.text
    assert ids(r.json()) == [payment["id"]]
    found = r.json()[0]
    assert found["order_id"] == pending_order["id"]
    assert found["order_number"] == pending_order["order_number"]
    assert found["status"] == "PENDING"
    assert found["amount_minor"] == 10000
    assert found["is_simulated"] is True
    assert found["is_overdue"] is False


def test_search_payments_by_invoice_id(admin_user, payment):
    invoice_id = db_value("select provider_invoice_id from payments where id = cast(:i as uuid)", i=payment["id"])
    if invoice_id is None:
        pytest.skip("simulated payments have no provider_invoice_id")
    assert payment["id"] in ids(admin_get("/admin/payments", q=invoice_id).json())


def test_search_payments_status_filter(admin_user, payment, pending_order):
    number = pending_order["order_number"]
    assert ids(admin_get("/admin/payments", q=number, status="PENDING").json()) == [payment["id"]]
    assert admin_get("/admin/payments", q=number, status="SUCCEEDED").json() == []


def test_search_payments_rejects_unknown_status(admin_user):
    assert admin_get("/admin/payments", status="NOPE").status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_problems_only_hides_healthy_payment(admin_user, payment, pending_order):
    r = admin_get("/admin/payments", q=pending_order["order_number"], problems_only="true")
    assert r.json() == []


def test_problems_only_shows_failed_payment(admin_user, payment, pending_order):
    simulate(payment["id"], "decline")
    r = admin_get("/admin/payments", q=pending_order["order_number"], problems_only="true")
    assert ids(r.json()) == [payment["id"]]
    assert r.json()[0]["status"] == "FAILED"


def test_problems_only_shows_overdue_payment(admin_user, payment, pending_order):
    db_execute("update payments set next_check_at = now() - interval '1 hour' where id = cast(:i as uuid)", i=payment["id"])
    r = admin_get("/admin/payments", q=pending_order["order_number"], problems_only="true")
    assert ids(r.json()) == [payment["id"]]
    assert r.json()[0]["is_overdue"] is True


def test_promo_activity_for_event_without_codes(admin_user, published_event):
    r = admin_get("/admin/promo-codes", event_id=published_event["id"])
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json() == []


def test_promo_activity_rejects_invalid_event_id(admin_user):
    assert admin_get("/admin/promo-codes", event_id="not-a-uuid").status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_audit_log_shape(admin_user):
    r = admin_get("/admin/audit")
    assert r.status_code == status.HTTP_200_OK, r.text
    body = r.json()
    assert "items" in body
    assert "total" in body


def test_audit_log_records_suspension_and_restore(admin_user, published_event):
    suspend(published_event["id"])
    restore(published_event["id"])
    r = admin_get("/admin/audit", event_id=published_event["id"])
    assert r.status_code == status.HTTP_200_OK, r.text
    assert "EVENT_SUSPENDED" in r.text
    assert "EVENT_SUSPENSION_LIFTED" in r.text


def test_audit_log_event_filter_excludes_other_events(admin_user, published_event):
    suspend(published_event["id"])
    r = admin_get("/admin/audit", event_id=MISSING_ID)
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["items"] == []
    assert r.json()["total"] == 0


def test_audit_log_date_filters(admin_user, published_event):
    suspend(published_event["id"])
    future = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    past = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    after = admin_get("/admin/audit", event_id=published_event["id"], **{"from": future})
    before = admin_get("/admin/audit", event_id=published_event["id"], to=past)
    within = admin_get("/admin/audit", event_id=published_event["id"], **{"from": past})
    assert after.json()["items"] == []
    assert before.json()["items"] == []
    assert within.json()["total"] >= 1


@pytest.mark.parametrize("result", ["SUCCESS", "DENIED"])
def test_audit_log_result_filter(admin_user, result):
    assert admin_get("/admin/audit", result=result).status_code == status.HTTP_200_OK


def test_audit_log_rejects_unknown_result(admin_user):
    assert admin_get("/admin/audit", result="MAYBE").status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_audit_log_rejects_naive_date(admin_user):
    r = admin_get("/admin/audit", **{"from": "2026-01-01T00:00:00"})
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text


def test_audit_log_rejects_invalid_ids(admin_user):
    assert admin_get("/admin/audit", event_id="nope").status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert admin_get("/admin/audit", entity_id="nope").status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


ORDERS_HEADER = ["order_number", "event", "buyer_email", "status", "subtotal_minor", "discount_minor", "total_minor", "created_at", "confirmed_at"]
PAYMENTS_HEADER = ["order_number", "status", "cancellation_reason", "amount_minor", "processing_fee_minor", "simulated", "created_at", "finalized_at"]


def test_orders_report_format(admin_user):
    r = admin_get("/admin/reports/orders.csv")
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert 'filename="orders.csv"' in r.headers["content-disposition"]
    assert r.content.startswith(b"\xef\xbb\xbf")
    assert csv_rows(r)[0] == ORDERS_HEADER


def test_orders_report_contains_order(admin_user, free_event):
    order = buy_free_tickets(free_event)
    rows = csv_rows(admin_get("/admin/reports/orders.csv", event_id=free_event["id"]))
    assert len(rows) == 2
    row = dict(zip(rows[0], rows[1]))
    assert row["order_number"] == order["order_number"]
    assert row["event"] == free_event["title"]
    assert row["buyer_email"] == USER["email"]
    assert row["status"] == "CONFIRMED"
    assert row["total_minor"] == "0"
    assert row["confirmed_at"] != ""


def test_orders_report_event_filter(admin_user, free_event):
    buy_free_tickets(free_event)
    assert len(csv_rows(admin_get("/admin/reports/orders.csv", event_id=MISSING_ID))) == 1


def test_orders_report_date_filters(admin_user, free_event):
    buy_free_tickets(free_event)
    future = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    past = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert len(csv_rows(admin_get("/admin/reports/orders.csv", event_id=free_event["id"], **{"from": future}))) == 1
    assert len(csv_rows(admin_get("/admin/reports/orders.csv", event_id=free_event["id"], to=past))) == 1
    assert len(csv_rows(admin_get("/admin/reports/orders.csv", event_id=free_event["id"], **{"from": past}))) == 2


def test_orders_report_rejects_bad_params(admin_user):
    assert admin_get("/admin/reports/orders.csv", event_id="nope").status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    r = admin_get("/admin/reports/orders.csv", **{"from": "2026-01-01T00:00:00"})
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text


def test_orders_report_neutralizes_spreadsheet_formulas(admin_user, free_event):
    db_execute("update events set title = :t where id = cast(:i as uuid)", t="=HYPERLINK(\"http://evil.example\")", i=free_event["id"])
    buy_free_tickets(free_event)
    rows = csv_rows(admin_get("/admin/reports/orders.csv", event_id=free_event["id"]))
    assert not rows[1][1].startswith("=")


def test_payments_report_format(admin_user):
    r = admin_get("/admin/reports/payments.csv")
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert 'filename="payments.csv"' in r.headers["content-disposition"]
    assert r.content.startswith(b"\xef\xbb\xbf")
    assert csv_rows(r)[0] == PAYMENTS_HEADER


def test_payments_report_contains_payment(admin_user, payment, pending_order):
    rows = csv_rows(admin_get("/admin/reports/payments.csv"))
    header = rows[0]
    mine = [dict(zip(header, row)) for row in rows[1:] if row[0] == pending_order["order_number"]]
    assert len(mine) == 1
    assert mine[0]["status"] == "PENDING"
    assert mine[0]["amount_minor"] == "10000"
    assert mine[0]["simulated"] == "yes"
    assert mine[0]["finalized_at"] == ""


def test_payments_report_date_filters(admin_user, payment, pending_order):
    future = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    past = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    number = pending_order["order_number"]

    def contains(**params):
        return any(row[0] == number for row in csv_rows(admin_get("/admin/reports/payments.csv", **params))[1:])

    assert contains(**{"from": past}) is True
    assert contains(**{"from": future}) is False
    assert contains(to=past) is False
    assert contains(to=future) is True