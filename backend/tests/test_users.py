import pytest
from unittest.mock import patch
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy import text
from database.database import engine
from backend.main import app
from test_auth import login, USER, verified_user, NEW_PASSWORD, clean_user
client = TestClient(app)

update_json = {
    "full_name" : "Almaz Baktygali",
    "phone" : "+77777777777",
    "locale" : "kz"
}


def test_read_me(verified_user):
    token = login(USER['email'], USER['password']).json()['access_token']
    r = client.get(url="/users/me", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == status.HTTP_200_OK

def test_delete_me(verified_user):
    token = login(USER['email'], USER['password']).json()['access_token']
    r = client.delete(url="/users/me", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == status.HTTP_204_NO_CONTENT

def test_update_me(verified_user):
    token = login(USER['email'], USER['password']).json()['access_token']
    r = client.patch(url="/users/me", params=update_json ,headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == status.HTTP_200_OK

def test_change_password(verified_user):
    token = login(USER["email"], USER["password"]).json()["access_token"]
    r = client.post(
        "/users/me/password",
        json={"current_password": USER["password"], "new_password": NEW_PASSWORD},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == status.HTTP_204_NO_CONTENT, r.text
    assert login(USER["email"], USER["password"]).status_code == status.HTTP_401_UNAUTHORIZED
    assert login(USER["email"], NEW_PASSWORD).status_code == status.HTTP_200_OK

def test_list_users(verified_user):
    token = login(USER['email'], USER['password']).json()["access_token"]
    r = client.get(url="/users/", headers={'Authorization': f"Bearer {token}"})

    assert r.status_code == status.HTTP_200_OK

def get_user_id(email : str):
    with engine.connect() as conn:
        row = conn.execute(text("select id from users where email = :e"), {"e": email}).scalar_one()
    return str(row)






def test_read_user(verified_user):
    token = login(USER['email'], USER['password']).json()['access_token']
    user_id = get_user_id(USER['email'])
    r = client.get(url=f"/users/{user_id}", headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == status.HTTP_200_OK

    