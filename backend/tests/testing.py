from fastapi.testclient import TestClient
from backend.main import app
from database.database import engine
from fastapi import status
from sqlalchemy import text
client = TestClient(app)
test_json = {
    "email": "sqdflarry@gmail.com",
    "password": "stringst12332",
    "full_name": "Ebalo",
    "phone": "+87711881608"
    }

test_login_json = {
    "username" : "brawlerflqmy@gmail.com",
    "password" : "stringst12332"
}
new_password = "stringster112"


def delete_current_user(jason):
    with engine.connect() as conn:
        conn.execute(text("delete from pending_registrations where email = :e", {"e": jason['email']}))
        conn.execute(text("delete from users where email = :e", {"e": jason['email']}))
        conn.execute(text("delete from profiles where email = :e", {"e": jason['email']}))

def test_registration():
    delete_current_user(test_json)
    response = client.post(url="auth/register", json=test_json)

    assert response.status_code == status.HTTP_202_ACCEPTED

def test_login():
    delete_current_user(test_login_json)
    response = client.post(url="auth/token", json=test_login_json)

    assert response.status_code == status.HTTP_200_OK


def test_change_password():
    response = client.post(url="/users/me/password", json={"current_password": test_login_json["password"], "new_password": new_password})

    assert response.status_code == status.HTTP_204_NO_CONTENT

def test_list_events():
    response = client.get(url="/events")

    assert response.status_code == status.HTTP_200_OK

