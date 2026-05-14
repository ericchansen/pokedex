"""Azure Blob Storage client with ETag-based atomic updates.

Auth branching:
- If AZURE_STORAGE_CONNECTION_STRING is set → use connection string (Azurite / dev)
- Otherwise → use DefaultAzureCredential (production managed identity)
"""
from __future__ import annotations

import copy
import json
import os
import time
from typing import Any

from azure.core.exceptions import ResourceExistsError, ResourceModifiedError, ResourceNotFoundError
from azure.storage.blob import BlobServiceClient, ContainerClient

_client: BlobServiceClient | None = None
_container: ContainerClient | None = None

CONTAINER_NAME = os.environ.get("BLOB_CONTAINER_NAME", "userdata")
MAX_RETRIES = 5
BASE_DELAY = 0.1  # seconds


def _get_client() -> BlobServiceClient:
    """Get or create the BlobServiceClient singleton."""
    global _client
    if _client is not None:
        return _client

    conn_str = os.environ.get("AZURE_STORAGE_CONNECTION_STRING")
    if conn_str:
        _client = BlobServiceClient.from_connection_string(conn_str)
    else:
        from azure.identity import DefaultAzureCredential
        account_name = os.environ.get("AZURE_STORAGE_ACCOUNT_NAME", "stpokemontracker")
        _client = BlobServiceClient(
            account_url=f"https://{account_name}.blob.core.windows.net",
            credential=DefaultAzureCredential(),
        )
    return _client


def get_container() -> ContainerClient:
    """Get the userdata container client."""
    global _container
    if _container is not None:
        return _container
    _container = _get_client().get_container_client(CONTAINER_NAME)
    return _container


def read_blob(path: str) -> tuple[Any, str]:
    """Read a JSON blob. Returns (parsed_data, etag).

    Raises ResourceNotFoundError if blob does not exist.
    """
    blob = get_container().get_blob_client(path)
    stream = blob.download_blob()
    data = stream.readall()
    return json.loads(data), stream.properties.etag


def read_blob_or_default(path: str, default: Any) -> tuple[Any, str | None]:
    """Read a JSON blob, returning a deep copy of default if it doesn't exist."""
    try:
        return read_blob(path)
    except ResourceNotFoundError:
        return copy.deepcopy(default), None


def write_blob(path: str, data: Any, *, etag: str | None = None, if_none_match: str | None = None) -> str:
    """Write a JSON blob. Returns the new ETag.

    Args:
        path: Blob path within container
        data: JSON-serializable data
        etag: If provided, only succeeds if blob's current ETag matches (optimistic concurrency)
        if_none_match: If "*", only succeeds if blob does NOT exist (create-only)

    Raises:
        ResourceModifiedError: ETag mismatch (concurrent modification)
        ResourceExistsError: Blob already exists (when if_none_match="*")
    """
    blob = get_container().get_blob_client(path)
    content = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    kwargs: dict[str, Any] = {"overwrite": True}
    if etag:
        kwargs["etag"] = etag
        kwargs["match_condition"] = "IfMatch"
    elif if_none_match:
        kwargs["etag"] = if_none_match
        kwargs["match_condition"] = "IfNoneMatch"

    props = blob.upload_blob(content.encode("utf-8"), **kwargs)
    return props["etag"]


def delete_blob(path: str) -> None:
    """Delete a blob. Silently succeeds if already gone."""
    blob = get_container().get_blob_client(path)
    try:
        blob.delete_blob()
    except ResourceNotFoundError:
        pass


def atomic_update(path: str, updater: callable, *, default: Any = None) -> tuple[Any, str]:
    """Read-modify-write with ETag retry loop.

    Args:
        path: Blob path
        updater: Function(current_data) → new_data. Called on each retry with fresh data.
        default: Default value if blob doesn't exist

    Returns:
        (new_data, new_etag)

    Raises:
        RuntimeError: All retries exhausted (concurrent modification)
    """
    for attempt in range(MAX_RETRIES):
        data, etag = read_blob_or_default(path, default)
        new_data = updater(data)

        try:
            if etag is None:
                # Blob doesn't exist yet — create it
                new_etag = write_blob(path, new_data, if_none_match="*")
            else:
                new_etag = write_blob(path, new_data, etag=etag)
            return new_data, new_etag
        except (ResourceModifiedError, ResourceExistsError):
            if attempt < MAX_RETRIES - 1:
                time.sleep(BASE_DELAY * (2 ** attempt))
                continue
            raise RuntimeError(f"atomic_update failed after {MAX_RETRIES} retries: {path}")

    raise RuntimeError(f"atomic_update exhausted retries: {path}")  # unreachable


def user_path(user_id: str, *parts: str) -> str:
    """Build a blob path within a user's namespace.

    Example: user_path("abc-123", "builds", "_index.json") → "users/abc-123/builds/_index.json"
    """
    return f"users/{user_id}/{'/'.join(parts)}"
