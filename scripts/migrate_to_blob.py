"""Migrate local userdata/ to Azure Blob Storage.

Usage:
    # Dry run (default):
    uv run python scripts/migrate_to_blob.py --user-id <principalId>

    # Actual upload:
    uv run python scripts/migrate_to_blob.py --user-id <principalId> --execute

Requires:
    - AZURE_STORAGE_CONNECTION_STRING env var (or az login for DefaultAzureCredential)
    - pip install azure-storage-blob azure-identity

Uploads:
    - userdata/builds.json → individual per-build blobs + _index.json
    - userdata/teams.json  → users/{userId}/teams.json
    - userdata/inventory.json → users/{userId}/inventory.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Add api/ to path for shared modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "api"))

from shared.build_fingerprint import fingerprint_record  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
USERDATA = ROOT / "userdata"
CONTAINER = "userdata"


def get_blob_client(connection_string: str | None):
    """Create BlobServiceClient with connection string or DefaultAzureCredential."""
    if connection_string:
        from azure.storage.blob import BlobServiceClient
        return BlobServiceClient.from_connection_string(connection_string)
    else:
        raise SystemExit(
            "ERROR: Set AZURE_STORAGE_CONNECTION_STRING or pass --connection-string"
        )


def migrate_builds(container_client, user_id: str, dry_run: bool):
    """Migrate builds.json to per-build blobs + index."""
    builds_file = USERDATA / "builds.json"
    if not builds_file.exists():
        print("  SKIP: builds.json not found")
        return 0

    builds = json.loads(builds_file.read_text("utf-8"))
    if not isinstance(builds, list):
        print("  SKIP: builds.json is not a list")
        return 0

    index_entries = []
    count = 0

    for record in builds:
        build_id = record.get("id")
        if not build_id:
            print(f"  WARN: build without id, skipping: {record.get('slug', '?')}")
            continue

        # Compute fingerprint if missing
        if not record.get("fingerprint"):
            record["fingerprint"] = fingerprint_record(record)

        # Individual blob
        blob_path = f"users/{user_id}/builds/{build_id}.json"
        content = json.dumps(record, ensure_ascii=False, indent=2)

        if dry_run:
            print(f"  DRY: {blob_path} ({len(content)} bytes)")
        else:
            blob = container_client.get_blob_client(blob_path)
            blob.upload_blob(content, overwrite=True)
            print(f"  UP:  {blob_path} ({len(content)} bytes)")

        # Index entry
        index_entries.append({
            "id": build_id,
            "slug": record.get("slug", ""),
            "species": record.get("build", {}).get("species", ""),
            "fingerprint": record.get("fingerprint", ""),
            "updated": record.get("updated", ""),
        })
        count += 1

    # Write index
    index_path = f"users/{user_id}/builds/_index.json"
    index_content = json.dumps(index_entries, ensure_ascii=False, indent=2)
    if dry_run:
        print(f"  DRY: {index_path} ({len(index_content)} bytes, {count} entries)")
    else:
        blob = container_client.get_blob_client(index_path)
        blob.upload_blob(index_content, overwrite=True)
        print(f"  UP:  {index_path} ({len(index_content)} bytes, {count} entries)")

    return count


def migrate_file(container_client, user_id: str, filename: str, dry_run: bool):
    """Migrate a single JSON file to blob storage."""
    local_path = USERDATA / filename
    if not local_path.exists():
        print(f"  SKIP: {filename} not found")
        return False

    content = local_path.read_text("utf-8")
    blob_path = f"users/{user_id}/{filename}"

    if dry_run:
        print(f"  DRY: {blob_path} ({len(content)} bytes)")
    else:
        blob = container_client.get_blob_client(blob_path)
        blob.upload_blob(content, overwrite=True)
        print(f"  UP:  {blob_path} ({len(content)} bytes)")

    return True


def main():
    parser = argparse.ArgumentParser(description="Migrate local userdata to Azure Blob Storage")
    parser.add_argument("--user-id", required=True, help="Azure principal ID for the user namespace")
    parser.add_argument(
        "--connection-string", default=None,
        help="Storage connection string (or set AZURE_STORAGE_CONNECTION_STRING)",
    )
    parser.add_argument("--execute", action="store_true", help="Actually upload (default is dry run)")
    args = parser.parse_args()

    import os
    conn_str = args.connection_string or os.environ.get("AZURE_STORAGE_CONNECTION_STRING")
    if not conn_str:
        print("ERROR: Provide --connection-string or set AZURE_STORAGE_CONNECTION_STRING")
        sys.exit(1)

    dry_run = not args.execute
    if dry_run:
        print("=== DRY RUN (pass --execute to upload) ===\n")

    client = get_blob_client(conn_str)
    container = client.get_container_client(CONTAINER)

    # Ensure container exists
    if not dry_run:
        try:
            container.create_container()
        except Exception:
            pass

    print(f"Migrating to: users/{args.user_id}/")
    print()

    print("[builds]")
    build_count = migrate_builds(container, args.user_id, dry_run)
    print(f"  Total: {build_count} builds\n")

    print("[teams]")
    migrate_file(container, args.user_id, "teams.json", dry_run)
    print()

    print("[inventory]")
    migrate_file(container, args.user_id, "inventory.json", dry_run)
    print()

    if dry_run:
        print("=== DRY RUN COMPLETE — pass --execute to upload ===")
    else:
        print("=== MIGRATION COMPLETE ===")


if __name__ == "__main__":
    main()
