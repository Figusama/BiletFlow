import pytest
from unittest.mock import patch
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy import text
import re
from backend.main import app
from database.database import engine

client = TestClient(app)

USER = {
    "email": "ci-user@example.com",
    "password": "stringst12332",
    "full_name": "CI User",
    "phone": "+77011234567",
}
NEW_PASSWORD = "stringster112"


SEND_PATH = "backend.modules.auth.router.send_email"


def delete_user(email: str):
    with engine.begin() as conn:
        conn.execute(text("delete from pending_registrations where email = :e"), {"e": email})
        conn.execute(
            text("delete from refresh_sessions where user_id in (select id from users where email = :e)"),
            {"e": email},
        )
        conn.execute(
            text("delete from profiles where user_id in (select id from users where email = :e)"),
            {"e": email},
        )
        conn.execute(text("delete from users where email = :e"), {"e": email})


@pytest.fixture(autouse=True)
def clean_user():
    delete_user(USER["email"])
    yield
    delete_user(USER["email"])


def token_from_email(mock_send) -> str:
    body = mock_send.call_args.args[2]  # send_email(to, subject, body)
    m = re.search(r"token=([\w\-]+)", body)
    assert m, f"no token in email body: {body}"
    return m.group(1)


def register_with_mock():
    with patch(SEND_PATH) as mock_send:
        r = client.post("/auth/register", json=USER)
    return r, mock_send


@pytest.fixture
def verified_user():
    r, mock_send = register_with_mock()
    assert r.status_code == status.HTTP_202_ACCEPTED, r.text
    r = client.get("/auth/verify-email", params={"token": token_from_email(mock_send)})
    assert r.status_code == status.HTTP_200_OK, r.text


def test_registration():
    r, mock_send = register_with_mock()
    assert r.status_code == status.HTTP_202_ACCEPTED, r.text
    mock_send.assert_called_once()
    assert mock_send.call_args.args[0] == USER["email"]
    assert "/auth/verify-email?token=" in mock_send.call_args.args[2]


def test_verify_email_returns_token():
    r, mock_send = register_with_mock()
    r = client.get("/auth/verify-email", params={"token": token_from_email(mock_send)})
    assert r.status_code == status.HTTP_200_OK, r.text
    assert "access_token" in r.json()


def test_verify_email_invalid_token():
    r = client.get("/auth/verify-email", params={"token": "not-a-real-token"})
    assert r.status_code == status.HTTP_400_BAD_REQUEST

def login(email, password):
    return client.post("/auth/token", data={"username": email, "password": password})

def test_login(verified_user):
    r = login(USER["email"], USER["password"])
    assert r.status_code == status.HTTP_200_OK, r.text
    assert "access_token" in r.json()



def test_login_unverified_user_gets_403():
    r, _ = register_with_mock()
    assert r.status_code == status.HTTP_202_ACCEPTED, r.text

    r = login(USER["email"], USER["password"])
    assert r.status_code == status.HTTP_403_FORBIDDEN, r.text


def test_login_wrong_password(verified_user):
    r = login(USER["email"], "definitely-wrong-password")
    assert r.status_code == status.HTTP_401_UNAUTHORIZED, r.text


def test_login_unknown_email():
    r = login("nobody@example.com", "whatever12345")
    assert r.status_code == status.HTTP_401_UNAUTHORIZED, r.text


def test_login_suspended_user(verified_user):
    with engine.begin() as conn:
        conn.execute(
            text("update users set is_suspended = true where email = :e"),
            {"e": USER["email"]},
        )
    r = login(USER["email"], USER["password"])
    assert r.status_code == status.HTTP_403_FORBIDDEN, r.text