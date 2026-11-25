
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi import status
from sqlalchemy import text

from backend.modules.events.schemas import EventLifecycleStatus, SeatingMode
from database.database import engine

from test_auth import USER, client, verified_user, clean_user
from test_events import (  
    OTHER, admin_user, bearer, clean_all, draft_event, make_event, other_user, published_event,
)

EVER_ISSUED = "backend.modules.tickets.router.ever_issued"
PAUSED_SALES_STATUS = "PAUSED" 



def type_body(event: dict, **overrides) -> dict:
    body = {
        "name": "General",
        "kind": "FREE",
        "price_minor": 0,
        "sales_start_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        "sales_end_at": event["ends_at"].isoformat(),
        "quantity_total": 10,
    }
    body.update(overrides)
    return body


def create_type(event: dict, user: dict = USER, **overrides):
    return client.post(f"/events/{event['id']}/ticket-types", json=type_body(event, **overrides), headers=bearer(user))


def patch_type(event: dict, type_id: str, body: dict, user: dict = USER):
    return client.patch(f"/events/{event['id']}/ticket-types/{type_id}", json=body, headers=bearer(user))


def delete_type(event: dict, type_id: str, user: dict = USER):
    return client.delete(f"/events/{event['id']}/ticket-types/{type_id}", headers=bearer(user))


def set_event_status(event: dict, value: str) -> None:
    with engine.begin() as conn:
        conn.execute(text("update events set status = :s where id = cast(:i as uuid)"), {"s": value, "i": event["id"]})


def deactivate_type(type_id: str) -> None:
    with engine.begin() as conn:
        conn.execute(text("update ticket_types set is_active = false where id = cast(:i as uuid)"), {"i": type_id})


def build_assigned_event(status=EventLifecycleStatus.DRAFT) -> dict:
    """Assigned-seating event on a real layout that has seats. Skips if the test DB has none."""
    with engine.connect() as conn:
        row = conn.execute(text("""
            select l.id, l.venue_id from venue_layouts l
            where exists (select 1 from venue_sections s
                          join venue_rows r on r.section_id = s.id
                          join venue_seats vs on vs.row_id = r.id
                          where s.layout_id = l.id)
            limit 1
        """)).first()
        if row is None:
            pytest.skip("test database has no venue layout with seats")
        layout_id, venue_id = row
        seat_count = conn.execute(text("""
            select count(*) from venue_seats vs
            join venue_rows r on r.id = vs.row_id
            join venue_sections s on s.id = r.section_id
            where s.layout_id = :l
        """), {"l": layout_id}).scalar_one()
    event = make_event(status=status, seating=SeatingMode.ASSIGNED_SEATING)
    with engine.begin() as conn:
        conn.execute(
            text("update events set venue_id = :v, venue_layout_id = :l where id = cast(:i as uuid)"),
            {"v": venue_id, "l": layout_id, "i": event["id"]},
        )
    event["seat_count"] = seat_count
    return event


@pytest.fixture
def assigned_event(verified_user):
    return build_assigned_event()


def sync(event: dict, user: dict = USER):
    return client.post(f"/events/{event['id']}/seats/sync", headers=bearer(user))


def assign(event: dict, seat_ids: list[str], user: dict = USER, **body):
    return client.patch(f"/events/{event['id']}/seats", json={"event_seat_ids": seat_ids, **body}, headers=bearer(user))


def seats_by_id(response) -> dict:
    return {s["id"]: s for s in response.json()}



def test_list_ticket_types_hidden_for_draft_event_from_anonymous(draft_event):
    assert client.get(f"/events/{draft_event['id']}/ticket-types").status_code == status.HTTP_404_NOT_FOUND


def test_list_ticket_types_visible_to_organizer_on_draft(draft_event):
    r = client.get(f"/events/{draft_event['id']}/ticket-types", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json() == []


def test_list_ticket_types_public_shows_only_active(verified_user):
    event = make_event()
    active = create_type(event, name="Active").json()
    inactive = create_type(event, name="Inactive").json()
    deactivate_type(inactive["id"])
    set_event_status(event, "PUBLISHED")

    r = client.get(f"/events/{event['id']}/ticket-types")
    assert r.status_code == status.HTTP_200_OK, r.text
    assert [t["id"] for t in r.json()] == [active["id"]]



def test_manage_ticket_types_requires_auth(draft_event):
    assert client.get(f"/events/{draft_event['id']}/ticket-types/manage").status_code == status.HTTP_401_UNAUTHORIZED


def test_manage_ticket_types_forbidden_for_stranger(draft_event, other_user):
    r = client.get(f"/events/{draft_event['id']}/ticket-types/manage", headers=bearer(OTHER))
    assert r.status_code == status.HTTP_403_FORBIDDEN, r.text


def test_manage_ticket_types_includes_inactive(draft_event):
    type_id = create_type(draft_event).json()["id"]
    deactivate_type(type_id)
    r = client.get(f"/events/{draft_event['id']}/ticket-types/manage", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert [t["id"] for t in r.json()] == [type_id]



def test_create_free_ticket_type(draft_event):
    r = create_type(draft_event)
    assert r.status_code == status.HTTP_201_CREATED, r.text
    body = r.json()
    assert body["name"] == "General"
    assert body["kind"] == "FREE"
    assert body["price_minor"] == 0
    assert body["quantity_total"] == 10
    assert "sale_state" in body and "available" in body


def test_create_paid_ticket_type(draft_event):
    r = create_type(draft_event, kind="PAID", price_minor=5000)
    assert r.status_code == status.HTTP_201_CREATED, r.text
    assert r.json()["price_minor"] == 5000


def test_create_requires_auth(draft_event):
    r = client.post(f"/events/{draft_event['id']}/ticket-types", json=type_body(draft_event))
    assert r.status_code == status.HTTP_401_UNAUTHORIZED


def test_create_forbidden_for_stranger(draft_event, other_user):
    assert create_type(draft_event, OTHER).status_code == status.HTTP_403_FORBIDDEN


def test_create_missing_fields(draft_event):
    r = client.post(f"/events/{draft_event['id']}/ticket-types", json={}, headers=bearer(USER))
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT, r.text


@pytest.mark.parametrize("override", [
    {"kind": "FREE", "price_minor": 100},
    {"kind": "PAID", "price_minor": 0},
    {"kind": "PAID", "price_minor": -1},
], ids=["free_with_price", "paid_without_price", "paid_negative_price"])
def test_create_rejects_invalid_price(draft_event, override):
    assert create_type(draft_event, **override).status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_create_rejects_sales_end_before_start(draft_event):
    start = datetime.now(timezone.utc)
    r = create_type(draft_event, sales_start_at=start.isoformat(), sales_end_at=(start - timedelta(hours=1)).isoformat())
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT, r.text


def test_create_rejects_sales_end_after_event_end(draft_event):
    r = create_type(draft_event, sales_end_at=(draft_event["ends_at"] + timedelta(days=1)).isoformat())
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT, r.text


def test_create_on_published_event_is_conflict(published_event):
    assert create_type(published_event).status_code == status.HTTP_409_CONFLICT


def test_create_assigned_seating_rejects_quantity(assigned_event):
    assert create_type(assigned_event, quantity_total=10).status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert create_type(assigned_event, quantity_total=None).status_code == status.HTTP_201_CREATED



def test_update_ticket_type_in_draft(draft_event):
    type_id = create_type(draft_event).json()["id"]
    r = patch_type(draft_event, type_id, {"name": "Renamed"})
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["name"] == "Renamed"


def test_update_requires_auth(draft_event):
    type_id = create_type(draft_event).json()["id"]
    r = client.patch(f"/events/{draft_event['id']}/ticket-types/{type_id}", json={"name": "X"})
    assert r.status_code == status.HTTP_401_UNAUTHORIZED


def test_update_forbidden_for_stranger(draft_event, other_user):
    type_id = create_type(draft_event).json()["id"]
    assert patch_type(draft_event, type_id, {"name": "X"}, OTHER).status_code == status.HTTP_403_FORBIDDEN


def test_update_unknown_ticket_type(draft_event):
    assert patch_type(draft_event, str(uuid.uuid4()), {"name": "X"}).status_code == status.HTTP_404_NOT_FOUND


def test_update_ticket_type_of_another_event_is_404(draft_event):
    other_event = make_event()
    type_id = create_type(other_event).json()["id"]
    assert patch_type(draft_event, type_id, {"name": "X"}).status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.parametrize("body", [{"price_minor": 500}, {"kind": "PAID"}], ids=["free_gets_price", "paid_without_price"])
def test_update_revalidates_the_whole_ticket_type(draft_event, body):
    type_id = create_type(draft_event).json()["id"]
    assert patch_type(draft_event, type_id, body).status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_update_sales_end_after_event_end(draft_event):
    type_id = create_type(draft_event).json()["id"]
    body = {"sales_end_at": (draft_event["ends_at"] + timedelta(days=1)).isoformat()}
    assert patch_type(draft_event, type_id, body).status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_update_published_event_needs_change_request(verified_user):
    event = make_event()
    type_id = create_type(event, kind="PAID", price_minor=1000).json()["id"]
    set_event_status(event, "PUBLISHED")
    assert patch_type(event, type_id, {"price_minor": 2000}).status_code == status.HTTP_409_CONFLICT


def test_update_sales_status_allowed_after_publish(verified_user):
    event = make_event()
    type_id = create_type(event).json()["id"]
    set_event_status(event, "PUBLISHED")
    r = patch_type(event, type_id, {"sales_status": PAUSED_SALES_STATUS})
    assert r.status_code == status.HTTP_200_OK, r.text


def test_delete_ticket_type(draft_event):
    type_id = create_type(draft_event).json()["id"]
    assert delete_type(draft_event, type_id).status_code == status.HTTP_204_NO_CONTENT
    r = client.get(f"/events/{draft_event['id']}/ticket-types/manage", headers=bearer(USER))
    assert r.json() == []


def test_delete_requires_auth(draft_event):
    type_id = create_type(draft_event).json()["id"]
    assert client.delete(f"/events/{draft_event['id']}/ticket-types/{type_id}").status_code == status.HTTP_401_UNAUTHORIZED


def test_delete_forbidden_for_stranger(draft_event, other_user):
    type_id = create_type(draft_event).json()["id"]
    assert delete_type(draft_event, type_id, OTHER).status_code == status.HTTP_403_FORBIDDEN


def test_delete_unknown_ticket_type(draft_event):
    assert delete_type(draft_event, str(uuid.uuid4())).status_code == status.HTTP_404_NOT_FOUND


def test_delete_on_published_event_is_conflict(verified_user):
    event = make_event()
    type_id = create_type(event).json()["id"]
    set_event_status(event, "PUBLISHED")
    assert delete_type(event, type_id).status_code == status.HTTP_409_CONFLICT


def test_delete_ticket_type_in_use_by_seats_is_conflict(assigned_event):
    type_id = create_type(assigned_event, quantity_total=None).json()["id"]
    seat_id = next(iter(seats_by_id(sync(assigned_event))))
    assert assign(assigned_event, [seat_id], ticket_type_id=type_id).status_code == status.HTTP_200_OK
    assert delete_type(assigned_event, type_id).status_code == status.HTTP_409_CONFLICT


def test_sync_seats_creates_seats_from_layout(assigned_event):
    r = sync(assigned_event)
    assert r.status_code == status.HTTP_200_OK, r.text
    assert len(r.json()) == assigned_event["seat_count"]
    assert {s["state"] for s in r.json()} == {"UNAVAILABLE"}


def test_sync_seats_is_idempotent(assigned_event):
    sync(assigned_event)
    assert len(sync(assigned_event).json()) == assigned_event["seat_count"]


def test_sync_seats_requires_auth(assigned_event):
    assert client.post(f"/events/{assigned_event['id']}/seats/sync").status_code == status.HTTP_401_UNAUTHORIZED


def test_sync_seats_forbidden_for_stranger(assigned_event, other_user):
    assert sync(assigned_event, OTHER).status_code == status.HTTP_403_FORBIDDEN


def test_sync_seats_for_general_admission_is_conflict(draft_event):
    assert sync(draft_event).status_code == status.HTTP_409_CONFLICT


def test_sync_seats_locked_after_issuance(assigned_event):
    with patch(EVER_ISSUED, return_value=True):
        assert sync(assigned_event).status_code == status.HTTP_409_CONFLICT


def test_list_seats_manage_requires_auth(assigned_event):
    assert client.get(f"/events/{assigned_event['id']}/seats/manage").status_code == status.HTTP_401_UNAUTHORIZED


def test_list_seats_manage_forbidden_for_stranger(assigned_event, other_user):
    r = client.get(f"/events/{assigned_event['id']}/seats/manage", headers=bearer(OTHER))
    assert r.status_code == status.HTTP_403_FORBIDDEN, r.text


def test_list_seats_manage_for_organizer(assigned_event):
    sync(assigned_event)
    r = client.get(f"/events/{assigned_event['id']}/seats/manage", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert len(r.json()) == assigned_event["seat_count"]


def test_list_seats_public_hidden_for_draft_event(assigned_event):
    assert client.get(f"/events/{assigned_event['id']}/seats").status_code == status.HTTP_404_NOT_FOUND


def test_list_seats_public_for_published_event(verified_user):
    event = build_assigned_event(status=EventLifecycleStatus.PUBLISHED)
    sync(event)
    r = client.get(f"/events/{event['id']}/seats")
    assert r.status_code == status.HTTP_200_OK, r.text
    assert len(r.json()) == event["seat_count"]



def test_assign_ticket_type_makes_seats_available(assigned_event):
    type_id = create_type(assigned_event, quantity_total=None).json()["id"]
    seat_ids = list(seats_by_id(sync(assigned_event)))
    chosen = seat_ids[:2]

    r = assign(assigned_event, chosen, ticket_type_id=type_id)
    assert r.status_code == status.HTTP_200_OK, r.text
    seats = seats_by_id(r)
    for seat_id in chosen:
        assert seats[seat_id]["ticket_type_id"] == type_id
        assert seats[seat_id]["state"] == "AVAILABLE"
    for seat_id in seat_ids[2:]:
        assert seats[seat_id]["state"] == "UNAVAILABLE"


def test_assign_disable_seat(assigned_event):
    type_id = create_type(assigned_event, quantity_total=None).json()["id"]
    seat_id = next(iter(seats_by_id(sync(assigned_event))))
    assign(assigned_event, [seat_id], ticket_type_id=type_id)
    r = assign(assigned_event, [seat_id], is_enabled=False)
    assert seats_by_id(r)[seat_id]["state"] == "UNAVAILABLE"
    assert seats_by_id(r)[seat_id]["ticket_type_id"] == type_id 


def test_assign_null_ticket_type_unassigns(assigned_event):
    type_id = create_type(assigned_event, quantity_total=None).json()["id"]
    seat_id = next(iter(seats_by_id(sync(assigned_event))))
    assign(assigned_event, [seat_id], ticket_type_id=type_id)
    r = assign(assigned_event, [seat_id], ticket_type_id=None)
    assert seats_by_id(r)[seat_id]["ticket_type_id"] is None
    assert seats_by_id(r)[seat_id]["state"] == "UNAVAILABLE"


def test_assign_unknown_ticket_type(assigned_event):
    seat_id = next(iter(seats_by_id(sync(assigned_event))))
    r = assign(assigned_event, [seat_id], ticket_type_id=str(uuid.uuid4()))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_assign_ticket_type_of_another_event(assigned_event):
    other_event = make_event()
    foreign_type = create_type(other_event).json()["id"]
    seat_id = next(iter(seats_by_id(sync(assigned_event))))
    assert assign(assigned_event, [seat_id], ticket_type_id=foreign_type).status_code == status.HTTP_404_NOT_FOUND


def test_assign_unknown_seat(assigned_event):
    sync(assigned_event)
    assert assign(assigned_event, [str(uuid.uuid4())]).status_code == status.HTTP_404_NOT_FOUND


def test_assign_requires_auth(assigned_event):
    r = client.patch(f"/events/{assigned_event['id']}/seats", json={"event_seat_ids": []})
    assert r.status_code == status.HTTP_401_UNAUTHORIZED


def test_assign_forbidden_for_stranger(assigned_event, other_user):
    seat_id = next(iter(seats_by_id(sync(assigned_event))))
    assert assign(assigned_event, [seat_id], OTHER, is_enabled=False).status_code == status.HTTP_403_FORBIDDEN


def test_assign_locked_after_issuance(assigned_event):
    seat_id = next(iter(seats_by_id(sync(assigned_event))))
    with patch(EVER_ISSUED, return_value=True):
        assert assign(assigned_event, [seat_id], is_enabled=False).status_code == status.HTTP_409_CONFLICT


# ---------- tickets: access rules that need no ticket ----------

def test_my_tickets_requires_auth():
    assert client.get("/tickets/mine").status_code == status.HTTP_401_UNAUTHORIZED


def test_my_tickets_empty_for_new_user(verified_user):
    r = client.get("/tickets/mine", headers=bearer(USER))  # also proves /tickets/mine is not read as a ticket id
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json() == []


@pytest.mark.parametrize("suffix", ["", "/qr.png", "/pdf"])
def test_ticket_endpoints_require_auth(suffix):
    assert client.get(f"/tickets/{uuid.uuid4()}{suffix}").status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.parametrize("suffix", ["", "/qr.png", "/pdf"])
def test_unknown_ticket_is_404(verified_user, suffix):
    r = client.get(f"/tickets/{uuid.uuid4()}{suffix}", headers=bearer(USER))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def create_issued_ticket(event: dict, buyer_email: str) -> str:
    """Return the id of a VALID ticket owned by buyer_email for this event.

    Fill this in once you have the order/checkout flow: create a free order through the API (or insert
    reservation, order, order_item and ticket rows), then return str(ticket.id). Also extend
    delete_event_data in test_events.py to delete tickets, order_items, orders and reservations first.
    """
    pytest.skip("implement create_issued_ticket (needs the order/checkout flow)")


@pytest.fixture
def issued_ticket(published_event, other_user):
    return {"id": create_issued_ticket(published_event, USER["email"]), "event": published_event}


def test_read_own_ticket(issued_ticket):
    r = client.get(f"/tickets/{issued_ticket['id']}", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["id"] == issued_ticket["id"]


def test_read_ticket_of_another_user_is_404(issued_ticket):
    for suffix in ("", "/qr.png", "/pdf"):
        r = client.get(f"/tickets/{issued_ticket['id']}{suffix}", headers=bearer(OTHER))
        assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_my_tickets_lists_own_ticket_only(issued_ticket):
    mine = client.get("/tickets/mine", headers=bearer(USER)).json()
    assert issued_ticket["id"] in [t["id"] for t in mine]
    theirs = client.get("/tickets/mine", headers=bearer(OTHER)).json()
    assert issued_ticket["id"] not in [t["id"] for t in theirs]


def test_ticket_qr_png(issued_ticket):
    r = client.get(f"/tickets/{issued_ticket['id']}/qr.png", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.headers["content-type"] == "image/png"
    assert r.headers["cache-control"] == "no-store"
    assert r.content.startswith(b"\x89PNG")


def test_ticket_pdf(issued_ticket):
    ticket = client.get(f"/tickets/{issued_ticket['id']}", headers=bearer(USER)).json()
    r = client.get(f"/tickets/{issued_ticket['id']}/pdf", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.headers["cache-control"] == "no-store"
    assert r.content.startswith(b"%PDF")
    assert ticket["public_id"] in r.headers["content-disposition"]