import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi import status
from sqlalchemy import inspect, text
from sqlmodel import Session, select

from backend.core.config import MAX_APPLICATION_IMAGES
from backend.modules.events.models import categories, event_applications, event_categories, event_images, events
from backend.modules.events.schemas import EventLifecycleStatus, EventStatus, SeatingMode, Visibility
from backend.modules.users.user_model import EventRole, event_user_roles
from backend.modules.venues.models import venues
from database.database import engine

from test_auth import SEND_PATH, USER, client, delete_user, login, token_from_email, verified_user, clean_user

OTHER = {"email": "ci-other@example.com", "password": "stringst12332", "full_name": "CI Other", "phone": "+77011234568"}
ADMIN = {"email": "ci-admin@example.com", "password": "stringst12332", "full_name": "CI Admin", "phone": "+77011234569"}
ALL_USERS = (USER, OTHER, ADMIN)



def delete_event_data(email: str):
    uid = "(select id from users where email = :e)"
    apps = f"(select id from event_applications where applicant_user_id in {uid})"
    evs = f"(select id from events where source_application_id in {apps})"
    statements = [
        ("audit_logs", f"delete from audit_logs where event_id in {evs} or actor_user_id in {uid}"),
        ("ticket_types", f"delete from ticket_types where event_id in {evs}"),
        ("event_user_roles", f"delete from event_user_roles where event_id in {evs} or user_id in {uid}"),
        ("event_categories", f"delete from event_categories where event_id in {evs}"),
        ("event_images", f"delete from event_images where event_id in {evs}"),
        ("events", f"delete from events where id in {evs}"),
        ("event_application_agreements", f"delete from event_application_agreements where application_id in {apps}"),
        ("event_application_categories", f"delete from event_application_categories where application_id in {apps}"),
        ("event_application_images", f"delete from event_application_images where application_id in {apps}"),
        ("event_applications", f"delete from event_applications where id in {apps}"),
    ]
    existing = inspect(engine)
    with engine.begin() as conn:
        for table, sql in statements:
            if existing.has_table(table):
                conn.execute(text(sql), {"e": email})


@pytest.fixture(autouse=True)
def clean_all():
    for u in ALL_USERS:
        delete_event_data(u["email"])
        delete_user(u["email"])
    yield
    for u in ALL_USERS:
        delete_event_data(u["email"])
        delete_user(u["email"])



def create_verified_user(user: dict) -> None:
    with patch(SEND_PATH) as mock_send:
        r = client.post("/auth/register", json=user)
    assert r.status_code == status.HTTP_202_ACCEPTED, r.text
    r = client.get("/auth/verify-email", params={"token": token_from_email(mock_send)})
    assert r.status_code == status.HTTP_200_OK, r.text


@pytest.fixture
def other_user():
    create_verified_user(OTHER)


@pytest.fixture
def admin_user():
    create_verified_user(ADMIN)
    with engine.begin() as conn:
        conn.execute(text("update users set personal_role = 'PLATFORM_ADMIN' where email = :e"), {"e": ADMIN["email"]})


def bearer(user: dict = USER) -> dict:
    token = login(user["email"], user["password"]).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def user_id(email: str):
    with engine.connect() as conn:
        return conn.execute(text("select id from users where email = :e"), {"e": email}).scalar_one()


def make_event(owner_email: str = USER["email"], *, status=EventLifecycleStatus.DRAFT, visibility=Visibility.PUBLIC,
               seating=SeatingMode.GENERAL_ADMISSION, ga_capacity=None, starts_in_days=7, public_contact=True) -> dict:
    """Creates an event directly in the DB (there is no public create route) with the owner as ORGANIZER."""
    token = uuid.uuid4().hex[:10]
    now = datetime.now(timezone.utc)
    starts = now + timedelta(days=starts_in_days)
    with Session(engine) as s:
        venue = s.exec(select(venues).limit(1)).first()
        if venue is None:
            pytest.skip("test database has no venue")
        owner_id = user_id(owner_email)
        application = event_applications(
            application_number=f"APP-TEST-{token.upper()}", applicant_user_id=owner_id,
            status=EventStatus.APPROVED, title=f"CI Event {token}",
        )
        s.add(application)
        s.flush()
        event = events(
            public_id=f"T{token.upper()}", slug=f"ci-event-{token}", source_application_id=application.id,
            title=f"CI Event {token}", description="CI description", venue_id=venue.id,
            starts_at=starts, ends_at=starts + timedelta(hours=3), timezone="Asia/Almaty",
            visibility=visibility, seating_mode=seating,
            responsible_name="Resp Name", responsible_email="resp@example.com", responsible_phone="+77000000000",
            public_contact_name="Contact" if public_contact else None,
            public_contact_email="contact@example.com" if public_contact else None,
            public_contact_phone="+77000000001" if public_contact else None,
            status=status, ga_capacity=ga_capacity,
            published_at=now if status == EventLifecycleStatus.PUBLISHED else None,
        )
        s.add(event)
        s.flush()
        s.add(event_user_roles(event_id=event.id, user_id=owner_id, event_role=EventRole.ORGANIZER))
        s.commit()
        return {"id": str(event.id), "slug": event.slug, "public_id": event.public_id,
                "title": event.title, "max_capacity": venue.max_capacity,
                "ends_at": event.ends_at}


def add_role(event_id: str, email: str, role: EventRole) -> None:
    with Session(engine) as s:
        s.add(event_user_roles(event_id=uuid.UUID(event_id), user_id=user_id(email), event_role=role))
        s.commit()


def first_category_id() -> str:
    with Session(engine) as s:
        category = s.exec(select(categories).where(categories.is_active.is_(True))).first()
        if category is None:
            pytest.skip("test database has no active category")
        return str(category.id)


def attach_category(event_id: str) -> None:
    with Session(engine) as s:
        s.add(event_categories(event_id=uuid.UUID(event_id), category_id=uuid.UUID(first_category_id())))
        s.commit()


def attach_image(event_id: str) -> None:
    with Session(engine) as s:
        s.add(event_images(event_id=uuid.UUID(event_id), storage_key=f"tests/{uuid.uuid4().hex}.jpg", position=0))
        s.commit()


def add_free_ticket_type(event: dict) -> None:
    """ADJUST to the real required columns of your ticket_types model."""
    from backend.modules.tickets.models import ticket_types
    from backend.modules.tickets.schemas import TicketKind
    now = datetime.now(timezone.utc)
    with Session(engine) as s:
        s.add(ticket_types(
            event_id=uuid.UUID(event["id"]), name="General", kind=TicketKind.FREE, price_minor=0,
            quantity=10, sales_start_at=now, sales_end_at=event["ends_at"], is_active=True,
        ))
        s.commit()


@pytest.fixture
def draft_event(verified_user):
    return make_event(public_contact=False)


@pytest.fixture
def published_event(verified_user):
    return make_event(status=EventLifecycleStatus.PUBLISHED, ga_capacity=1)



def test_list_events_is_public(verified_user):
    r = client.get("/events/")
    assert r.status_code == status.HTTP_200_OK, r.text
    assert isinstance(r.json(), list)


def test_list_events_shows_published_and_hides_draft(published_event, draft_event):
    r = client.get("/events/", params={"q": published_event["title"], "limit": 200})
    assert [e["id"] for e in r.json()] == [published_event["id"]]
    r = client.get("/events/", params={"q": draft_event["title"]})
    assert r.json() == []


def test_list_events_hides_suspended(published_event):
    with engine.begin() as conn:
        conn.execute(text("update events set is_suspended = true where id = :i"), {"i": published_event["id"]})
    r = client.get("/events/", params={"q": published_event["title"]})
    assert r.json() == []


def test_list_events_hides_ended_event(verified_user):
    ended = make_event(status=EventLifecycleStatus.PUBLISHED, starts_in_days=-2)
    r = client.get("/events/", params={"q": ended["title"]})
    assert r.json() == []


def test_list_events_hides_non_public_visibility(verified_user):
    event = make_event(status=EventLifecycleStatus.PUBLISHED, visibility=Visibility.UNLISTED)
    r = client.get("/events/", params={"q": event["title"]})
    assert r.json() == []


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 201}, {"offset": -1}, {"q": "x" * 201}])
def test_list_events_rejects_bad_params(params):
    r = client.get("/events/", params=params)
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT, r.text



def test_my_events_requires_auth():
    assert client.get("/events/mine").status_code == status.HTTP_401_UNAUTHORIZED


def test_my_events_lists_only_own(draft_event, other_user):
    r = client.get("/events/mine", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert draft_event["id"] in [e["id"] for e in r.json()]
    r = client.get("/events/mine", headers=bearer(OTHER))
    assert draft_event["id"] not in [e["id"] for e in r.json()]



@pytest.mark.parametrize("ref", ["id", "slug", "public_id"])
def test_read_published_event_anonymous(published_event, ref):
    r = client.get(f"/events/{published_event[ref]}")
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["id"] == published_event["id"]


def test_read_event_not_found(verified_user):
    assert client.get("/events/does-not-exist").status_code == status.HTTP_404_NOT_FOUND
    assert client.get(f"/events/{uuid.uuid4()}").status_code == status.HTTP_404_NOT_FOUND


def test_read_draft_hidden_from_anonymous_and_strangers(draft_event, other_user):
    assert client.get(f"/events/{draft_event['slug']}").status_code == status.HTTP_404_NOT_FOUND
    r = client.get(f"/events/{draft_event['slug']}", headers=bearer(OTHER))
    assert r.status_code == status.HTTP_404_NOT_FOUND


def test_read_draft_visible_to_organizer(draft_event):
    r = client.get(f"/events/{draft_event['slug']}", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["status"] == "DRAFT"


def test_read_draft_visible_to_platform_admin(draft_event, admin_user):
    r = client.get(f"/events/{draft_event['slug']}", headers=bearer(ADMIN))
    assert r.status_code == status.HTTP_200_OK, r.text


def test_read_unlisted_event_by_link(verified_user):
    event = make_event(status=EventLifecycleStatus.PUBLISHED, visibility=Visibility.UNLISTED)
    assert client.get(f"/events/{event['slug']}").status_code == status.HTTP_200_OK


def test_read_private_event_needs_invitation(verified_user):
    event = make_event(status=EventLifecycleStatus.PUBLISHED, visibility=Visibility.PRIVATE)
    assert client.get(f"/events/{event['slug']}").status_code == status.HTTP_404_NOT_FOUND
    assert client.get(f"/events/{event['slug']}", headers=bearer(USER)).status_code == status.HTTP_200_OK  # organizer



def test_manage_requires_auth(draft_event):
    assert client.get(f"/events/{draft_event['id']}/manage").status_code == status.HTTP_401_UNAUTHORIZED


def test_manage_invalid_uuid(verified_user):
    r = client.get("/events/not-a-uuid/manage", headers=bearer(USER))
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT, r.text


def test_manage_organizer_sees_responsible_and_tickets_flag(draft_event):
    r = client.get(f"/events/{draft_event['id']}/manage", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    body = r.json()
    assert body["responsible_email"] == "resp@example.com"
    assert body["tickets_issued"] is False


def test_manage_forbidden_for_stranger(draft_event, other_user):
    r = client.get(f"/events/{draft_event['id']}/manage", headers=bearer(OTHER))
    assert r.status_code == status.HTTP_403_FORBIDDEN, r.text


def test_manage_hides_responsible_from_non_organizer_staff(draft_event, other_user):
    add_role(draft_event["id"], OTHER["email"], EventRole.EVENT_ADMIN)
    r = client.get(f"/events/{draft_event['id']}/manage", headers=bearer(OTHER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["responsible_email"] is None


def test_manage_allowed_for_platform_admin(draft_event, admin_user):
    r = client.get(f"/events/{draft_event['id']}/manage", headers=bearer(ADMIN))
    assert r.status_code == status.HTTP_200_OK, r.text



def patch_event(event, body, user=USER):
    return client.patch(f"/events/{event['id']}", json=body, headers=bearer(user))


def test_update_requires_auth(draft_event):
    r = client.patch(f"/events/{draft_event['id']}", json={"public_contact_name": "X"})
    assert r.status_code == status.HTTP_401_UNAUTHORIZED


def test_update_forbidden_for_stranger(draft_event, other_user):
    r = patch_event(draft_event, {"public_contact_name": "X"}, OTHER)
    assert r.status_code == status.HTTP_403_FORBIDDEN, r.text


def test_update_public_contact(draft_event):
    r = patch_event(draft_event, {"public_contact_name": "New Name", "public_contact_email": "new@example.com"})
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["public_contact_name"] == "New Name"
    assert r.json()["public_contact_email"] == "new@example.com"


@pytest.mark.parametrize("body", [
    {"description": None},
    {"description": ""},
    {"public_contact_email": "not-an-email"},
    {"public_instagram_url": "https://example.com/x"},
    {"public_telegram_url": "http://t.me/x"},
    {"visibility": None},
])
def test_update_rejects_invalid_values(draft_event, body):
    assert patch_event(draft_event, body).status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_update_visibility(draft_event):
    r = patch_event(draft_event, {"visibility": "UNLISTED"})
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["visibility"] == "UNLISTED"


def test_update_ga_capacity_in_draft(draft_event):
    r = patch_event(draft_event, {"ga_capacity": 1})
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["ga_capacity"] == 1


@pytest.mark.parametrize("delta", ["zero", "negative", "over_max"])
def test_update_ga_capacity_out_of_range(draft_event, delta):
    value = {"zero": 0, "negative": -5, "over_max": draft_event["max_capacity"] + 1}[delta]
    assert patch_event(draft_event, {"ga_capacity": value}).status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_update_ga_capacity_on_published_event_is_conflict(published_event):
    assert patch_event(published_event, {"ga_capacity": 1}).status_code == status.HTTP_409_CONFLICT


def test_update_ga_capacity_for_assigned_seating(verified_user):
    event = make_event(seating=SeatingMode.ASSIGNED_SEATING)
    assert patch_event(event, {"ga_capacity": 1}).status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_update_refund_policy(draft_event):
    policy = {"self_service_refund_until_hours_before_start": 24}
    r = patch_event(draft_event, {"refund_policy": policy})
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["refund_policy"] == policy


@pytest.mark.parametrize("hours", [-1, "24", True, 1.5])
def test_update_refund_policy_invalid_hours(draft_event, hours):
    body = {"refund_policy": {"self_service_refund_until_hours_before_start": hours}}
    assert patch_event(draft_event, body).status_code == status.HTTP_422_UNPROCESSABLE_CONTENT



def put_categories(event, ids, user=USER):
    return client.put(f"/events/{event['id']}/categories", json=ids, headers=bearer(user))


def test_set_categories(draft_event):
    category_id = first_category_id()
    r = put_categories(draft_event, [category_id, category_id])
    assert r.status_code == status.HTTP_200_OK, r.text
    assert [c["id"] for c in r.json()["categories"]] == [category_id]


def test_set_categories_requires_at_least_one(draft_event):
    assert put_categories(draft_event, []).status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_set_categories_unknown_category(draft_event):
    assert put_categories(draft_event, [str(uuid.uuid4())]).status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_set_categories_forbidden_for_stranger(draft_event, other_user):
    assert put_categories(draft_event, [first_category_id()], OTHER).status_code == status.HTTP_403_FORBIDDEN


@pytest.fixture
def fake_storage():
    with patch("backend.modules.events.router.save_image", side_effect=lambda f, d: f"{d}/{uuid.uuid4().hex}.jpg"):
        yield


def upload(event, user=USER):
    return client.post(f"/events/{event['id']}/images", files={"file": ("a.jpg", b"fake", "image/jpeg")}, headers=bearer(user))


def test_add_image(draft_event, fake_storage):
    r = upload(draft_event)
    assert r.status_code == status.HTTP_201_CREATED, r.text
    assert len(r.json()["images"]) == 1
    assert r.json()["cover_image_url"] == r.json()["images"][0]["url"]


def test_add_image_forbidden_for_stranger(draft_event, other_user, fake_storage):
    assert upload(draft_event, OTHER).status_code == status.HTTP_403_FORBIDDEN


def test_add_image_limit(draft_event, fake_storage):
    for _ in range(MAX_APPLICATION_IMAGES):
        assert upload(draft_event).status_code == status.HTTP_201_CREATED
    assert upload(draft_event).status_code == status.HTTP_409_CONFLICT


def test_remove_image(draft_event, fake_storage):
    image_id = upload(draft_event).json()["images"][0]["id"]
    r = client.delete(f"/events/{draft_event['id']}/images/{image_id}", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["images"] == []


def test_remove_unknown_image(draft_event):
    r = client.delete(f"/events/{draft_event['id']}/images/{uuid.uuid4()}", headers=bearer(USER))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def test_remove_image_of_another_event(draft_event, fake_storage):
    other_event = make_event()
    image_id = upload(other_event).json()["images"][0]["id"]
    r = client.delete(f"/events/{draft_event['id']}/images/{image_id}", headers=bearer(USER))
    assert r.status_code == status.HTTP_404_NOT_FOUND, r.text


def publish(event, user=USER):
    return client.post(f"/events/{event['id']}/publish", headers=bearer(user))


def test_publish_requires_auth(draft_event):
    assert client.post(f"/events/{draft_event['id']}/publish").status_code == status.HTTP_401_UNAUTHORIZED


def test_publish_forbidden_for_stranger(draft_event, other_user):
    assert publish(draft_event, OTHER).status_code == status.HTTP_403_FORBIDDEN


def test_publish_not_ready_lists_all_problems(draft_event):
    r = publish(draft_event)
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT, r.text
    detail = r.json()["detail"]
    assert detail["code"] == "not_ready"
    for message in (
        "At least one active ticket type is required",
        "GA capacity must be positive and within venue maximum",
        "At least one category is required",
        "At least one image is required",
        "Public contact information is required",
    ):
        assert message in detail["problems"]


def test_publish_assigned_seating_not_ready(verified_user):
    event = make_event(seating=SeatingMode.ASSIGNED_SEATING)
    r = publish(event)
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT, r.text
    assert "Assigned seating publish readiness validator is not yet integrated" in r.json()["detail"]["problems"]


def test_publish_ready_event(verified_user):
    event = make_event(ga_capacity=1)
    attach_category(event["id"])
    attach_image(event["id"])
    add_free_ticket_type(event)

    r = publish(event)
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["status"] == "PUBLISHED"
    assert r.json()["published_at"] is not None
    assert client.get(f"/events/{event['slug']}").status_code == status.HTTP_200_OK
    assert publish(event).status_code == status.HTTP_409_CONFLICT


def test_publish_already_published_is_conflict(published_event):
    assert publish(published_event).status_code == status.HTTP_409_CONFLICT


def test_unpublish_published_event(published_event):
    r = client.post(f"/events/{published_event['id']}/unpublish", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.json()["status"] == "DRAFT"
    assert r.json()["published_at"] is None
    assert client.get(f"/events/{published_event['slug']}").status_code == status.HTTP_404_NOT_FOUND


def test_unpublish_draft_is_conflict(draft_event):
    r = client.post(f"/events/{draft_event['id']}/unpublish", headers=bearer(USER))
    assert r.status_code == status.HTTP_409_CONFLICT, r.text


def test_unpublish_forbidden_for_stranger(published_event, other_user):
    r = client.post(f"/events/{published_event['id']}/unpublish", headers=bearer(OTHER))
    assert r.status_code == status.HTTP_403_FORBIDDEN, r.text


def test_calendar_for_published_event(published_event):
    r = client.get(f"/events/{published_event['id']}/calendar.ics")
    assert r.status_code == status.HTTP_200_OK, r.text
    assert r.headers["content-type"].startswith("text/calendar")
    assert "BEGIN:VCALENDAR" in r.text
    assert f'{published_event["slug"]}.ics' in r.headers["content-disposition"]


def test_calendar_hides_draft_from_anonymous(draft_event):
    assert client.get(f"/events/{draft_event['id']}/calendar.ics").status_code == status.HTTP_404_NOT_FOUND


def test_calendar_draft_visible_to_organizer(draft_event):
    r = client.get(f"/events/{draft_event['id']}/calendar.ics", headers=bearer(USER))
    assert r.status_code == status.HTTP_200_OK, r.text