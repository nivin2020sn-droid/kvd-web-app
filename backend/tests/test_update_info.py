"""Tests for /api/update-info endpoint (hot-reload from data/update.json)."""
import json
import os
import shutil
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://task-board-sync-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
UPDATE_FILE = Path("/app/backend/data/update.json")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def restore_update_file():
    """Backup update.json before, restore after."""
    backup = UPDATE_FILE.read_bytes() if UPDATE_FILE.exists() else None
    yield
    if backup is not None:
        UPDATE_FILE.write_bytes(backup)
    elif UPDATE_FILE.exists():
        UPDATE_FILE.unlink()


class TestUpdateInfo:
    """GET /api/update-info"""

    def test_endpoint_exists_and_default_shape(self, session):
        r = session.get(f"{API}/update-info", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        # Required keys per contract
        for k in ("latest_version", "download_url", "changelog", "mandatory"):
            assert k in data, f"missing key {k}"
        assert isinstance(data["latest_version"], str)
        assert isinstance(data["download_url"], str)
        assert isinstance(data["mandatory"], bool)

    def test_default_value_matches_file(self, session):
        r = session.get(f"{API}/update-info", timeout=10)
        assert r.status_code == 200
        with open(UPDATE_FILE, "r", encoding="utf-8") as f:
            on_disk = json.load(f)
        # Compare relevant fields
        assert r.json()["latest_version"] == on_disk["latest_version"]

    def test_hot_reload_without_restart(self, session, restore_update_file):
        """Modify update.json on disk and verify endpoint reflects it WITHOUT restart."""
        new_payload = {
            "latest_version": "2.0.0",
            "download_url": "https://example.com/app-2.0.0.apk",
            "changelog": "TEST hot-reload changelog",
            "mandatory": True,
        }
        UPDATE_FILE.write_text(json.dumps(new_payload), encoding="utf-8")

        r = session.get(f"{API}/update-info", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["latest_version"] == "2.0.0"
        assert data["download_url"] == "https://example.com/app-2.0.0.apk"
        assert data["changelog"] == "TEST hot-reload changelog"
        assert data["mandatory"] is True

    def test_revert_after_hot_reload(self, session):
        """After fixture restore, endpoint should be back to original."""
        r = session.get(f"{API}/update-info", timeout=10)
        assert r.status_code == 200
        # Should match disk again
        with open(UPDATE_FILE, "r", encoding="utf-8") as f:
            on_disk = json.load(f)
        assert r.json()["latest_version"] == on_disk["latest_version"]

    def test_no_auth_required(self, session):
        """Public endpoint - no auth header should still return 200."""
        r = requests.get(f"{API}/update-info", timeout=10)
        assert r.status_code == 200
