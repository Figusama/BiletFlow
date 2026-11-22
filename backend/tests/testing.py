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

def test_registration():
    with engine.connect() as conn:
        conn.execute(text("delete from pending_registrations where email = :e", {"e": test_json['email']}))
        conn.execute(text("delete from users where email = :e", {"e": test_json['email']}))
        conn.execute(text("delete from profiles where email = :e", {"e": test_json['email']}))
    response = client.post(url="auth/register", json=test_json)

    assert response.status_code == status.HTTP_202_ACCEPTED



