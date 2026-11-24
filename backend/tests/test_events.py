import pytest
from database.database import engine
from fastapi.testclient import TestClient
from backend.main import app
from fastapi import status
from sqlalchemy import text
from test_auth import verified_user, clean_user, login, USER

test_event = {
    
}
client = TestClient(app)

def test_list_events():
    r = client.get("/events/")
    assert r.status_code == status.HTTP_200_OK

def test_my_events(verified_user):
    token = login(email=USER['email'], password=USER['password'])
    r = client.get(url="/events/mine", headers={"Authentication": f"Bearer {token}"})

    assert r.status_code == status.HTTP_200_OK

def test_read_event(verified_user):
    token = login(email=USER['email'], password=USER['password'])
    event_ref = 1
    r = client.get(url=f"/events/{event_ref}")



