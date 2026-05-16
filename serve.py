"""
serve.py — Dev server for Pokémon HOME Tracker
Serves site/ as web root, data/ at /data/, REST API at /api/.

Usage:
    uv run serve.py              # http://localhost:8000
    uv run serve.py --port 3000  # http://localhost:3000

API:
    GET/POST       /api/builds
    GET/PUT/DELETE  /api/builds/{id}
    GET/POST       /api/teams
    GET/PUT/DELETE  /api/teams/{id}
    GET            /api/inventory
    GET/PUT        /api/inventory/{boxId}
    PUT/DELETE     /api/inventory/{boxId}/{slotIdx}
    POST           /api/inventory/move
"""

import argparse
import datetime
import json
import os
import shutil
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).parent
SITE_DIR = ROOT / "site"
DATA_DIR = ROOT / "data"
USER_DATA_DIR = ROOT / "userdata"
BACKUP_DIR = USER_DATA_DIR / "backups"
MAX_BACKUPS = 50  # rolling backups per file

# User data files that live in userdata/ (not git-tracked)
_USER_DATA_FILES = ("builds.json", "inventory.json", "teams.json")

# Shared domain modules live in api/domain/ — single source of truth for both
# the local dev server and the Azure Functions cloud backend.
sys.path.insert(0, str(ROOT / "api"))
from domain import operations as ops  # noqa: E402
from domain.operations import (  # noqa: E402
    DuplicateBuildError,
    FKConflictError,
    NotFoundError,
    ValidationError,
)

# Serialize all API write operations to prevent concurrent read-modify-write races
_api_lock = threading.Lock()


def _path_within_root(path: Path, root: Path) -> bool:
    """Return True when path resolves under root, False for traversal/outside roots."""
    try:
        return os.path.commonpath([path.resolve(), root.resolve()]) == str(root.resolve())
    except ValueError:
        return False


def read_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: dict):
    """Write JSON with timestamped rolling backup and atomic write."""
    if path.exists():
        ts = datetime.datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        backup = BACKUP_DIR / f"{path.stem}.{ts}{path.suffix}"
        shutil.copy2(path, backup)
        # Prune old backups for this file (keep MAX_BACKUPS most recent)
        existing = sorted(BACKUP_DIR.glob(f"{path.stem}.*{path.suffix}"))
        for old in existing[:-MAX_BACKUPS]:
            old.unlink(missing_ok=True)
    # Atomic write: write to temp, then replace
    tmp = path.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    tmp.replace(path)


class DevHandler(SimpleHTTPRequestHandler):
    """Serves site/ + data/ + REST API."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE_DIR), **kwargs)

    def _resolve_static_path(self, path: str) -> Path | None:
        request_path = unquote(urlparse(path).path)
        if ".." in [segment for segment in request_path.split("/") if segment not in ("", ".")]:
            return None
        if request_path.startswith("/data/"):
            rel = request_path[len("/data/"):]
            # User data files are served from userdata/ (outside git)
            if rel in _USER_DATA_FILES:
                resolved = (USER_DATA_DIR / rel).resolve()
                allowed_root = USER_DATA_DIR
            else:
                resolved = (DATA_DIR / rel).resolve()
                allowed_root = DATA_DIR
            return resolved if _path_within_root(resolved, allowed_root) else None

        resolved = Path(super().translate_path(request_path)).resolve()
        return resolved if _path_within_root(resolved, SITE_DIR) else None

    def translate_path(self, path):
        resolved = self._resolve_static_path(path)
        return str(resolved) if resolved is not None else str(SITE_DIR / "__blocked__")

    def do_HEAD(self):
        if self.path.startswith("/api/"):
            self.send_error(405)
            return
        if self._resolve_static_path(self.path) is None:
            self.send_error(403, "Forbidden")
            return
        super().do_HEAD()

    def end_headers(self):
        # API and user data: never cache (mutable state)
        # Static assets: revalidate each request (dev server, no fingerprinting)
        path = self.path.split("?")[0]
        if path.startswith("/api/") or path.startswith("/data/"):
            self.send_header("Cache-Control", "no-store")
        else:
            self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self._handle_api("GET")
        else:
            if self._resolve_static_path(self.path) is None:
                self.send_error(403, "Forbidden")
                return
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self._handle_api("POST")
        else:
            self.send_error(405)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self._handle_api("PUT")
        else:
            self.send_error(405)

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self._handle_api("DELETE")
        else:
            self.send_error(405)

    # ── API Router ──────────────────────────────────────────────

    def _handle_api(self, method: str):
        with _api_lock:
            self._handle_api_locked(method)

    def _handle_api_locked(self, method: str):
        parsed = urlparse(self.path)
        parts = [p for p in parsed.path.split("/") if p]
        # parts: ["api", resource, maybe_id]
        if len(parts) < 2:
            return self._json_error(404, "Not found")

        resource = parts[1]
        item_id = parts[2] if len(parts) > 2 else None

        if resource == "builds":
            self._handle_builds(method, item_id)
        elif resource == "teams":
            self._handle_teams(method, item_id)
        elif resource == "inventory":
            sub_parts = parts[2:]  # everything after "inventory"
            self._handle_inventory(method, sub_parts)
        else:
            self._json_error(404, f"Unknown resource: {resource}")

    def _read_body(self) -> dict | None:
        """Read and parse JSON body. Returns None and sends 400 on parse failure.

        Rejects non-dict bodies (arrays, strings, etc.) to prevent TypeErrors
        downstream when callers use .get() or key access.
        """
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            self._json_error(400, f"Invalid JSON body: {e}")
            return None
        if not isinstance(parsed, dict):
            self._json_error(400, "Request body must be a JSON object")
            return None
        return parsed

    def _json_response(self, code: int, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json_error(self, code: int, message: str):
        self._json_response(code, {"error": message})

    # ── Builds CRUD ─────────────────────────────────────────────

    def _builds_path(self) -> Path:
        return USER_DATA_DIR / "builds.json"

    def _handle_builds(self, method: str, item_id: str | None):
        if method == "GET" and item_id is None:
            data = read_json(self._builds_path())
            return self._json_response(200, ops.list_builds(data))

        if method == "GET" and item_id:
            data = read_json(self._builds_path())
            try:
                return self._json_response(200, ops.get_build(data, item_id))
            except NotFoundError as e:
                return self._json_error(404, str(e))

        if method == "POST" and item_id is None:
            body = self._read_body()
            if body is None: return
            data = read_json(self._builds_path())
            try:
                data, record = ops.create_build(data, body)
            except DuplicateBuildError as e:
                return self._json_response(200, e.existing)
            except ValidationError as e:
                return self._json_error(400, str(e))
            write_json(self._builds_path(), data)
            return self._json_response(201, record)

        if method == "PUT" and item_id:
            body = self._read_body()
            if body is None: return
            data = read_json(self._builds_path())
            try:
                data, record = ops.update_build(data, item_id, body)
            except NotFoundError as e:
                return self._json_error(404, str(e))
            except ValidationError as e:
                return self._json_error(400, str(e))
            write_json(self._builds_path(), data)
            return self._json_response(200, record)

        if method == "DELETE" and item_id:
            data = read_json(self._builds_path())
            try:
                data = ops.delete_build(
                    data, item_id,
                    teams_reader=lambda: read_json(self._teams_path()),
                )
            except NotFoundError as e:
                return self._json_error(404, str(e))
            except FKConflictError as e:
                return self._json_error(409, str(e))
            write_json(self._builds_path(), data)
            return self._json_response(200, {"deleted": item_id})

        self._json_error(405, "Method not allowed")

    # ── Teams CRUD ──────────────────────────────────────────────

    def _teams_path(self) -> Path:
        return USER_DATA_DIR / "teams.json"

    def _handle_teams(self, method: str, item_id: str | None):
        if method == "GET" and item_id is None:
            data = read_json(self._teams_path())
            return self._json_response(200, ops.list_teams(data))

        if method == "GET" and item_id:
            data = read_json(self._teams_path())
            try:
                return self._json_response(200, ops.get_team(data, item_id))
            except NotFoundError as e:
                return self._json_error(404, str(e))

        if method == "POST" and item_id is None:
            body = self._read_body()
            if body is None: return
            data = read_json(self._teams_path())
            try:
                data, record = ops.create_team(data, body)
            except ValidationError as e:
                return self._json_error(400, str(e))
            write_json(self._teams_path(), data)
            return self._json_response(201, record)

        if method == "PUT" and item_id:
            body = self._read_body()
            if body is None: return
            data = read_json(self._teams_path())
            try:
                data, record = ops.update_team(data, item_id, body)
            except NotFoundError as e:
                return self._json_error(404, str(e))
            except ValidationError as e:
                return self._json_error(400, str(e))
            write_json(self._teams_path(), data)
            return self._json_response(200, record)

        if method == "DELETE" and item_id:
            data = read_json(self._teams_path())
            try:
                data = ops.delete_team(data, item_id)
            except NotFoundError as e:
                return self._json_error(404, str(e))
            write_json(self._teams_path(), data)
            return self._json_response(200, {"deleted": item_id})

        self._json_error(405, "Method not allowed")

    # ── Inventory CRUD ─────────────────────────────────────

    def _inventory_path(self) -> Path:
        return USER_DATA_DIR / "inventory.json"

    def _handle_inventory(self, method: str, parts: list[str]):
        """Route inventory sub-paths.

        GET  /api/inventory              → all boxes (sparse)
        GET  /api/inventory/{boxId}      → single box
        PUT  /api/inventory/{boxId}      → rename box (body: {name})
        PUT  /api/inventory/{boxId}/{slot} → set slot
        DELETE /api/inventory/{boxId}/{slot} → clear slot
        POST /api/inventory/move         → move slot
        POST /api/inventory/batch        → batch set/clear
        """
        # POST /api/inventory/move
        if method == "POST" and len(parts) == 1 and parts[0] == "move":
            return self._inventory_move()

        # POST /api/inventory/batch
        if method == "POST" and len(parts) == 1 and parts[0] == "batch":
            return self._inventory_batch()

        # GET /api/inventory
        if method == "GET" and len(parts) == 0:
            data = read_json(self._inventory_path())
            return self._json_response(200, ops.sparse_inventory(data))

        # Parse box ID
        if len(parts) < 1:
            return self._json_error(400, "Missing box ID")

        try:
            box_id = int(parts[0])
        except ValueError:
            return self._json_error(400, f"Invalid box ID: {parts[0]}")

        # GET /api/inventory/{boxId}
        if method == "GET" and len(parts) == 1:
            data = read_json(self._inventory_path())
            try:
                return self._json_response(200, ops.get_box(data, box_id))
            except NotFoundError as e:
                return self._json_error(404, str(e))

        # PUT /api/inventory/{boxId} — rename box
        if method == "PUT" and len(parts) == 1:
            body = self._read_body()
            if body is None: return
            data = read_json(self._inventory_path())
            try:
                data, box_dict = ops.rename_box(data, box_id, body.get("name"))
            except NotFoundError as e:
                return self._json_error(404, str(e))
            write_json(self._inventory_path(), data)
            return self._json_response(200, box_dict)

        # Slot-level operations: /api/inventory/{boxId}/{slotIdx}
        if len(parts) == 2:
            try:
                slot_idx = int(parts[1])
            except ValueError:
                return self._json_error(400, f"Invalid slot index: {parts[1]}")

            # PUT — set slot occupant
            if method == "PUT":
                body = self._read_body()
                if body is None: return
                try:
                    occupant = ops.validate_slot_body(body)
                except ValidationError as e:
                    return self._json_error(400, str(e))
                data = read_json(self._inventory_path())
                try:
                    data, occupant = ops.set_slot(data, box_id, slot_idx, occupant)
                except NotFoundError as e:
                    return self._json_error(404, str(e))
                write_json(self._inventory_path(), data)
                return self._json_response(200, occupant)

            # DELETE — clear slot
            if method == "DELETE":
                data = read_json(self._inventory_path())
                try:
                    data = ops.clear_slot(data, box_id, slot_idx)
                except NotFoundError as e:
                    return self._json_error(404, str(e))
                write_json(self._inventory_path(), data)
                return self._json_response(200, {"cleared": True, "box": box_id, "slot": slot_idx})

        self._json_error(405, "Method not allowed")

    def _inventory_move(self):
        """Move a Pokémon from one slot to another (swap if target occupied)."""
        body = self._read_body()
        if body is None: return
        from_box = body.get("from_box")
        from_slot = body.get("from_slot")
        to_box = body.get("to_box")
        to_slot = body.get("to_slot")

        if any(v is None for v in (from_box, from_slot, to_box, to_slot)):
            return self._json_error(400, "from_box, from_slot, to_box, to_slot required")
        if not all(isinstance(v, int) for v in (from_box, from_slot, to_box, to_slot)):
            return self._json_error(400, "from_box, from_slot, to_box, to_slot must be integers")

        data = read_json(self._inventory_path())
        try:
            data, result = ops.move_slots(data, from_box, from_slot, to_box, to_slot)
        except NotFoundError as e:
            return self._json_error(404, str(e))
        write_json(self._inventory_path(), data)
        return self._json_response(200, result)

    def _inventory_batch(self):
        """Apply multiple slot set/clear operations in a single disk write."""
        body = self._read_body()
        if body is None: return
        data = read_json(self._inventory_path())
        try:
            data, results, errors = ops.batch_slots(data, body.get("operations"))
        except ValidationError as e:
            return self._json_error(400, str(e))

        if errors and not results:
            return self._json_error(400, "; ".join(errors))

        write_json(self._inventory_path(), data)
        resp = {"applied": len(results), "results": results}
        if errors:
            resp["errors"] = errors
        return self._json_response(200, resp)

    def log_message(self, format, *args):
        path = ""
        if args and isinstance(args[0], str):
            parts = args[0].split()
            if len(parts) > 1:
                path = parts[1]
        if path and any(path.endswith(ext) for ext in (".css", ".svg", ".png", ".ico", ".js")):
            return
        super().log_message(format, *args)


def main():
    parser = argparse.ArgumentParser(description="Pokémon HOME Tracker dev server")
    parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    parser.add_argument("--bind", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    args = parser.parse_args()

    if not SITE_DIR.exists():
        print(f"ERROR: {SITE_DIR} not found", file=sys.stderr)
        sys.exit(1)
    if not DATA_DIR.exists():
        print(f"ERROR: {DATA_DIR} not found", file=sys.stderr)
        sys.exit(1)

    # ── Migrate user data to userdata/ (outside git) ──────
    USER_DATA_DIR.mkdir(exist_ok=True)
    BACKUP_DIR.mkdir(exist_ok=True)
    migrated = []
    for fname in _USER_DATA_FILES:
        dest = USER_DATA_DIR / fname
        src = DATA_DIR / fname
        template = DATA_DIR / fname.replace(".json", ".template.json")
        if not dest.exists():
            if src.exists():
                shutil.copy2(src, dest)
                migrated.append(fname)
            elif template.exists():
                shutil.copy2(template, dest)
                migrated.append(f"{fname} (from template)")
    if migrated:
        print(f"  ✓ Migrated to userdata/: {', '.join(migrated)}")
        print("    Git can no longer touch your data.")

    # ThreadingHTTPServer prevents ERR_EMPTY_RESPONSE on the parallel
    # /data/reference/*.json fetches the app fires on startup. Single-threaded
    # HTTPServer reliably chokes under that concurrent load on Windows.
    server = ThreadingHTTPServer((args.bind, args.port), DevHandler)
    url = f"http://{args.bind}:{args.port}"
    print("Pokémon HOME Tracker")
    print(f"  Site:      {SITE_DIR}")
    print(f"  Ref data:  {DATA_DIR}")
    print(f"  User data: {USER_DATA_DIR}")
    print(f"  Backups:   {BACKUP_DIR}")
    print(f"  API:       {url}/api/builds | /api/teams | /api/inventory")
    print(f"  URL:   {url}")
    print("\nPress Ctrl+C to stop.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
