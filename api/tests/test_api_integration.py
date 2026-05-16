"""Integration tests — exercises serve.py HTTP endpoints end-to-end.

Starts serve.py as a subprocess on a random port with a temporary userdata
directory, then tests CRUD lifecycle, error responses, and FK constraints via
real HTTP requests.  Uses only stdlib (urllib, json, subprocess).
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]  # repo root


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _request(url: str, *, method: str = "GET", body: dict | None = None) -> tuple[int, dict]:
    """Send an HTTP request and return (status_code, parsed_json_body)."""
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"} if body else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            parsed = {"error": raw}
        return e.code, parsed


@pytest.fixture(scope="module")
def server():
    """Start serve.py on a random port with an isolated userdata dir."""
    port = _free_port()
    base = f"http://127.0.0.1:{port}"

    # Create temp userdata with seed templates
    tmpdir = tempfile.mkdtemp(prefix="poketest_")
    userdata = Path(tmpdir) / "userdata"
    userdata.mkdir()
    for fname in ("builds.json", "inventory.json", "teams.json"):
        template = ROOT / "data" / fname.replace(".json", ".template.json")
        if template.exists():
            shutil.copy2(template, userdata / fname)
        else:
            (userdata / fname).write_text("{}", encoding="utf-8")

    env = {**os.environ, "USERDATA_DIR": str(userdata)}
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "serve.py"), "--port", str(port)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        cwd=str(ROOT),
    )

    # Wait for server to be ready
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"{base}/api/builds")
            break
        except (urllib.error.URLError, ConnectionRefusedError):
            time.sleep(0.2)
    else:
        proc.kill()
        pytest.fail("Server did not start within 10s")

    yield {"base": base, "proc": proc, "tmpdir": tmpdir, "userdata": userdata}

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    shutil.rmtree(tmpdir, ignore_errors=True)


# ── Build CRUD ──────────────────────────────────────────────────────

class TestBuildHTTP:
    def test_list_empty(self, server):
        status, body = _request(f"{server['base']}/api/builds")
        assert status == 200
        assert "builds" in body

    def test_create_get_update_delete(self, server):
        base = server["base"]
        build_body = {
            "build": {
                "species": "Garchomp",
                "item": "Choice Scarf",
                "ability": "Rough Skin",
                "nature": "Jolly",
                "moves": ["Earthquake", "Outrage", "Stone Edge", "Swords Dance"],
            },
        }

        # POST create
        status, created = _request(f"{base}/api/builds", method="POST", body=build_body)
        assert status == 201
        build_id = created["id"]
        assert build_id

        # GET single
        status, fetched = _request(f"{base}/api/builds/{build_id}")
        assert status == 200
        assert fetched["build"]["species"] == "Garchomp"

        # PUT update
        updated_body = {
            "build": {
                "species": "Garchomp",
                "item": "Life Orb",
                "ability": "Rough Skin",
                "nature": "Jolly",
                "moves": ["Earthquake", "Outrage", "Stone Edge", "Swords Dance"],
            },
        }
        status, updated = _request(f"{base}/api/builds/{build_id}", method="PUT", body=updated_body)
        assert status == 200
        assert updated["build"]["item"] == "Life Orb"

        # DELETE
        status, _ = _request(f"{base}/api/builds/{build_id}", method="DELETE")
        assert status == 200

        # GET after delete → 404
        status, _ = _request(f"{base}/api/builds/{build_id}")
        assert status == 404

    def test_duplicate_returns_200(self, server):
        base = server["base"]
        body = {
            "build": {
                "species": "Toxapex",
                "item": "Black Sludge",
                "ability": "Regenerator",
                "nature": "Bold",
                "moves": ["Scald", "Recover", "Haze", "Toxic Spikes"],
            },
        }
        status1, created = _request(f"{base}/api/builds", method="POST", body=body)
        assert status1 == 201

        status2, existing = _request(f"{base}/api/builds", method="POST", body=body)
        assert status2 == 200
        assert existing["id"] == created["id"]

        # Cleanup
        _request(f"{base}/api/builds/{created['id']}", method="DELETE")

    def test_get_nonexistent_returns_404(self, server):
        status, _ = _request(f"{server['base']}/api/builds/nonexistent")
        assert status == 404


# ── Team CRUD ───────────────────────────────────────────────────────

class TestTeamHTTP:
    def test_create_get_update_delete(self, server):
        base = server["base"]
        team_body = {
            "name": "Integration Test Team",
            "members": [{"slot": 1, "build_id": "dummy_build_1"}],
        }

        # POST create
        status, created = _request(f"{base}/api/teams", method="POST", body=team_body)
        assert status == 201
        team_id = created["id"]

        # GET single
        status, fetched = _request(f"{base}/api/teams/{team_id}")
        assert status == 200
        assert fetched["name"] == "Integration Test Team"

        # PUT update
        update_body = {
            "name": "Updated Team",
            "members": [{"slot": 1, "build_id": "dummy_build_2"}],
        }
        status, updated = _request(f"{base}/api/teams/{team_id}", method="PUT", body=update_body)
        assert status == 200
        assert updated["name"] == "Updated Team"

        # DELETE
        status, _ = _request(f"{base}/api/teams/{team_id}", method="DELETE")
        assert status == 200

    def test_fk_constraint_blocks_build_delete(self, server):
        """Deleting a build referenced by a team returns 409."""
        base = server["base"]

        # Create a build
        build_body = {
            "build": {
                "species": "Ferrothorn",
                "item": "Leftovers",
                "ability": "Iron Barbs",
                "nature": "Relaxed",
                "moves": ["Stealth Rock", "Leech Seed", "Gyro Ball", "Power Whip"],
            },
        }
        _, created_build = _request(f"{base}/api/builds", method="POST", body=build_body)
        build_id = created_build["id"]

        # Create a team referencing that build
        team_body = {
            "name": "FK Test Team",
            "members": [{"slot": 1, "build_id": build_id}],
        }
        _, created_team = _request(f"{base}/api/teams", method="POST", body=team_body)
        team_id = created_team["id"]

        # Try to delete the build → should be blocked
        status, _ = _request(f"{base}/api/builds/{build_id}", method="DELETE")
        assert status == 409

        # Cleanup: delete team first, then build
        _request(f"{base}/api/teams/{team_id}", method="DELETE")
        _request(f"{base}/api/builds/{build_id}", method="DELETE")


# ── Inventory ───────────────────────────────────────────────────────

class TestInventoryHTTP:
    def test_list_inventory(self, server):
        status, body = _request(f"{server['base']}/api/inventory")
        assert status == 200
        assert "boxes" in body

    def test_get_box(self, server):
        status, body = _request(f"{server['base']}/api/inventory/0")
        assert status == 200
        assert "name" in body
        assert "slots" in body

    def test_set_and_clear_slot(self, server):
        base = server["base"]
        slot_body = {
            "build": {"species": "Magikarp", "item": "", "ability": "Swift Swim"},
            "identity": {},
            "target_build_id": None,
        }

        # PUT slot
        status, _ = _request(f"{base}/api/inventory/0/0", method="PUT", body=slot_body)
        assert status == 200

        # Verify the slot is filled
        status, box = _request(f"{base}/api/inventory/0")
        assert status == 200
        assert box["slots"][0] is not None
        assert box["slots"][0]["build"]["species"] == "Magikarp"

        # DELETE slot
        status, _ = _request(f"{base}/api/inventory/0/0", method="DELETE")
        assert status == 200

        # Verify cleared
        status, box = _request(f"{base}/api/inventory/0")
        assert box["slots"][0] is None

    def test_box_out_of_range(self, server):
        status, _ = _request(f"{server['base']}/api/inventory/9999")
        assert status == 404

    def test_move(self, server):
        base = server["base"]
        # Place something in 0/0
        slot_body = {
            "build": {"species": "Ditto", "item": "", "ability": "Imposter"},
            "identity": {},
            "target_build_id": None,
        }
        _request(f"{base}/api/inventory/0/0", method="PUT", body=slot_body)

        # Move from 0/0 to 1/0
        status, result = _request(
            f"{base}/api/inventory/move",
            method="POST",
            body={"from_box": 0, "from_slot": 0, "to_box": 1, "to_slot": 0},
        )
        assert status == 200
        assert result.get("moved") is True

        # Cleanup
        _request(f"{base}/api/inventory/1/0", method="DELETE")
