import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("FOODHUNT_DB", str(tmp_path / "t.db"))
    from app.main import app
    with TestClient(app) as c:
        yield c


def test_login_change_number_and_logout(client):
    assert client.get("/api/v1/profile").json() is None
    r = client.put("/api/v1/profile", json={"name": "  Guru   Prakash ", "mobile": "+91 98765 43210"})
    assert r.status_code == 200 and r.json()["name"] == "Guru Prakash" and r.json()["mobile"] == "9876543210"
    client.put("/api/v1/profile", json={"name": "Guru Prakash", "mobile": "9123456780"})   # change the number
    assert client.get("/api/v1/profile").json()["mobile"] == "9123456780"
    assert client.delete("/api/v1/profile").json() == {"ok": True}
    assert client.get("/api/v1/profile").json() is None


@pytest.mark.parametrize("mobile", ["12345", "5876543210", "98765432101", "abcdefghij", ""])
def test_bad_numbers_are_rejected(client, mobile):
    assert client.put("/api/v1/profile", json={"name": "Guru", "mobile": mobile}).status_code == 422


def test_blank_name_is_rejected(client):
    assert client.put("/api/v1/profile", json={"name": "   ", "mobile": "9876543210"}).status_code == 422
