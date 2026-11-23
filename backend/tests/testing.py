import pytest
from unittest.mock import patch
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy import text

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


def delete_user(email: str):
    with engine.begin() as conn:
        for table in ("pending_registrations", "users", "profiles"):
            conn.execute(text(f"delete from {table} where email = :e"), {"e": email})


@pytest.fixture(autouse=True)
def clean_user():
    delete_user(USER["email"])
    yield
    delete_user(USER["email"])


def test_registration():
    with patch("backend.modules.auth.router.send_verification_email") as mock_send:
        response = client.post("/auth/register", json=USER)

    assert response.status_code == status.HTTP_202_ACCEPTED
    mock_send.assert_called_once()


def login(email, password):
    return client.post("/auth/token", data={"username": email, "password": password})


def test_login():
    response = login(USER["email"], USER["password"])
    assert response.status_code == status.HTTP_200_OK
    assert "access_token" in response.json()


def test_change_password():
    token = login(USER["email"], USER["password"]).json()["access_token"]
    response = client.post(
        "/users/me/password",
        json={"current_password": USER["password"], "new_password": NEW_PASSWORD},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT


def test_list_events():
    response = client.get("/events")
    assert response.status_code == status.HTTP_200_OK