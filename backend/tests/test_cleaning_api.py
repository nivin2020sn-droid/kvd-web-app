"""Backend tests for Cleaning Tasks API (admin + tablet, WebSocket out-of-scope here)."""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://task-board-sync-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PASSWORD = "admin123"


# ---------- Shared fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def token(session):
    r = session.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Health / root ----------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert "message" in r.json()


# ---------- Auth ----------
class TestAuth:
    def test_login_correct(self, session):
        r = session.post(f"{API}/admin/login", json={"password": ADMIN_PASSWORD}, timeout=10)
        assert r.status_code == 200
        assert r.json().get("token") == "admin-session-token"

    def test_login_wrong(self, session):
        r = session.post(f"{API}/admin/login", json={"password": "wrong"}, timeout=10)
        assert r.status_code == 401


# ---------- Settings ----------
class TestSettings:
    def test_get_public_settings(self, session):
        r = session.get(f"{API}/settings", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "background_type" in data
        assert "background_value" in data
        assert "logo_base64" in data

    def test_update_requires_auth(self, session):
        r = session.put(f"{API}/settings", json={"background_value": "dark"}, timeout=10)
        assert r.status_code == 401

    def test_update_with_auth(self, session, auth_headers):
        r = session.put(
            f"{API}/settings",
            json={"background_type": "preset", "background_value": "dark"},
            headers=auth_headers,
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["background_type"] == "preset"
        assert data["background_value"] == "dark"


# ---------- Lookup lists (seeded) ----------
class TestSeeded:
    @pytest.mark.parametrize("kind,expected_contains", [
        ("task-types", "Grundreiniger"),
        ("houses", "A"),
        ("stations", "10"),
    ])
    def test_seeded_list(self, session, kind, expected_contains):
        r = session.get(f"{API}/{kind}", timeout=10)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and len(items) > 0
        names = [it["name"] for it in items]
        assert expected_contains in names
        # no _id leak
        for it in items:
            assert "_id" not in it
            assert "id" in it and "name" in it

    def test_persons_empty_or_list(self, session):
        r = session.get(f"{API}/persons", timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- CRUD for simple items ----------
class TestSimpleCRUD:
    @pytest.mark.parametrize("kind", ["task-types", "houses", "stations", "persons"])
    def test_add_requires_auth(self, session, kind):
        r = session.post(f"{API}/{kind}", json={"name": "TEST_unauth"}, timeout=10)
        assert r.status_code == 401

    @pytest.mark.parametrize("kind", ["task-types", "houses", "stations", "persons"])
    def test_add_and_delete(self, session, auth_headers, kind):
        name = f"TEST_{kind}_{datetime.now().timestamp()}"
        r = session.post(f"{API}/{kind}", json={"name": name}, headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["name"] == name and "id" in item
        # Verify in list
        lst = session.get(f"{API}/{kind}", timeout=10).json()
        assert any(i["id"] == item["id"] for i in lst)
        # Delete
        d = session.delete(f"{API}/{kind}/{item['id']}", headers=auth_headers, timeout=10)
        assert d.status_code == 200
        # Verify gone
        lst2 = session.get(f"{API}/{kind}", timeout=10).json()
        assert not any(i["id"] == item["id"] for i in lst2)


# ---------- Tasks ----------
class TestTasks:
    @pytest.fixture(scope="class")
    def lookups(self, session):
        tt = session.get(f"{API}/task-types").json()
        h = session.get(f"{API}/houses").json()
        st = session.get(f"{API}/stations").json()
        return tt[0]["name"], h[0]["name"], st[0]["name"]

    @pytest.fixture(scope="class")
    def person_id(self, session, auth_headers):
        name = f"TEST_person_{datetime.now().timestamp()}"
        r = session.post(f"{API}/persons", json={"name": name}, headers=auth_headers, timeout=10)
        assert r.status_code == 200
        pid = r.json()["id"]
        yield pid
        session.delete(f"{API}/persons/{pid}", headers=auth_headers, timeout=10)

    def _create_task(self, session, auth_headers, lookups, person_id):
        tt, haus, st = lookups
        payload = {
            "task_type": tt,
            "haus": haus,
            "station": st,
            "description": "TEST task",
            "person_ids": [person_id],
            "time_from": "08:00",
            "time_to": "12:00",
        }
        r = session.post(f"{API}/tasks", json=payload, headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        return r.json()

    def test_create_requires_auth(self, session, lookups, person_id):
        tt, haus, st = lookups
        r = session.post(
            f"{API}/tasks",
            json={"task_type": tt, "haus": haus, "station": st,
                  "description": "x", "person_ids": [person_id],
                  "time_from": "08:00", "time_to": "09:00"},
            timeout=10,
        )
        assert r.status_code == 401

    def test_create_and_today_flow(self, session, auth_headers, lookups, person_id):
        task = self._create_task(session, auth_headers, lookups, person_id)
        assert task["status"] == "pending"
        assert task["archived"] is False
        assert task["task_date"] == datetime.now(timezone.utc).strftime("%Y-%m-%d")
        tid = task["id"]

        today = session.get(f"{API}/tasks/today", timeout=10).json()
        assert any(t["id"] == tid for t in today)
        # no _id leak
        for t in today:
            assert "_id" not in t

    def test_status_accepted(self, session, auth_headers, lookups, person_id):
        t = self._create_task(session, auth_headers, lookups, person_id)
        r = session.patch(f"{API}/tasks/{t['id']}/status", json={"status": "accepted"}, timeout=10)
        assert r.status_code == 200
        # Verify
        today = session.get(f"{API}/tasks/today").json()
        got = next(x for x in today if x["id"] == t["id"])
        assert got["status"] == "accepted"
        assert got["accepted_at"] is not None

    def test_status_finished(self, session, auth_headers, lookups, person_id):
        t = self._create_task(session, auth_headers, lookups, person_id)
        r = session.patch(f"{API}/tasks/{t['id']}/status", json={"status": "finished"}, timeout=10)
        assert r.status_code == 200
        today = session.get(f"{API}/tasks/today").json()
        got = next(x for x in today if x["id"] == t["id"])
        assert got["status"] == "finished"
        assert got["finished_at"] is not None

    @pytest.mark.parametrize("status,reason_field", [
        ("cannot_accept", "accept_reason"),
        ("not_finished", "not_finished_reason"),
        ("not_done", "not_done_reason"),
    ])
    def test_status_with_reason(self, session, auth_headers, lookups, person_id, status, reason_field):
        t = self._create_task(session, auth_headers, lookups, person_id)
        reason = f"TEST reason {status}"
        r = session.patch(
            f"{API}/tasks/{t['id']}/status",
            json={"status": status, "reason": reason},
            timeout=10,
        )
        assert r.status_code == 200
        today = session.get(f"{API}/tasks/today").json()
        got = next(x for x in today if x["id"] == t["id"])
        assert got["status"] == status
        assert got[reason_field] == reason

    def test_invalid_status(self, session, auth_headers, lookups, person_id):
        t = self._create_task(session, auth_headers, lookups, person_id)
        r = session.patch(f"{API}/tasks/{t['id']}/status", json={"status": "bogus"}, timeout=10)
        assert r.status_code == 400

    def test_status_not_found(self, session):
        r = session.patch(f"{API}/tasks/nonexistent-id/status", json={"status": "accepted"}, timeout=10)
        assert r.status_code == 404


# ---------- Archive ----------
class TestArchive:
    @pytest.fixture(scope="class")
    def auth_headers(self, token):
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def test_archive_requires_auth(self, session):
        r = session.post(f"{API}/tasks/archive-now", timeout=10)
        assert r.status_code == 401

    def test_archive_now_and_list(self, session, auth_headers):
        # Create one task to make sure there's something to archive
        tt = session.get(f"{API}/task-types").json()[0]["name"]
        haus = session.get(f"{API}/houses").json()[0]["name"]
        st = session.get(f"{API}/stations").json()[0]["name"]
        created = session.post(
            f"{API}/tasks",
            json={"task_type": tt, "haus": haus, "station": st,
                  "description": "TEST archive", "person_ids": [],
                  "time_from": "08:00", "time_to": "09:00"},
            headers=auth_headers, timeout=10,
        )
        assert created.status_code == 200
        tid = created.json()["id"]

        # archive-now
        r = session.post(f"{API}/tasks/archive-now", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json().get("archived", 0) >= 1

        # Today list should no longer contain this task
        today = session.get(f"{API}/tasks/today").json()
        assert not any(t["id"] == tid for t in today)

        # Archive dates list
        dates = session.get(f"{API}/tasks/archive", timeout=10).json()
        assert "dates" in dates and isinstance(dates["dates"], list)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        assert today_str in dates["dates"]

        # Archive for today
        day = session.get(f"{API}/tasks/archive", params={"date": today_str}, timeout=10).json()
        assert day["date"] == today_str
        assert any(t["id"] == tid for t in day["tasks"])
