"""Seed Azurite blob storage with template data for local development.

Usage:
    uv run python scripts/seed_azurite.py

Requires Azurite running: azurite --silent --location .azurite

Uploads empty template files to the local blob container so the
app has valid initial data. Uses the dev-user namespace matching
LOCAL_USER_ID in api/local.settings.json.
"""
from __future__ import annotations

import json
from pathlib import Path

from azure.storage.blob import BlobServiceClient

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "data"
CONNECTION_STRING = "UseDevelopmentStorage=true"
CONTAINER = "userdata"
USER_ID = "dev-user"


def seed():
    client = BlobServiceClient.from_connection_string(CONNECTION_STRING)
    container = client.get_container_client(CONTAINER)

    # Create container if missing
    try:
        container.create_container()
        print(f"Created container: {CONTAINER}")
    except Exception:
        print(f"Container already exists: {CONTAINER}")

    # Seed template files
    files = {
        f"users/{USER_ID}/builds/_index.json": json.dumps([]),
        f"users/{USER_ID}/teams.json": json.dumps(
            json.loads((TEMPLATES / "teams.template.json").read_text("utf-8"))
        ),
        f"users/{USER_ID}/inventory.json": json.dumps(
            json.loads((TEMPLATES / "inventory.template.json").read_text("utf-8"))
        ),
    }

    for blob_path, content in files.items():
        blob = container.get_blob_client(blob_path)
        blob.upload_blob(content, overwrite=True)
        print(f"  Uploaded: {blob_path} ({len(content)} bytes)")

    print("\nDone! Azurite is seeded for local dev.")


if __name__ == "__main__":
    seed()
