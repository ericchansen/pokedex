"""Authentication helper for Azure Functions behind SWA Easy Auth.

In production (SWA), the x-ms-client-principal-id header is injected
automatically after authentication. Locally, falls back to LOCAL_USER_ID
environment variable for Azurite testing.
"""
from __future__ import annotations

import os

import azure.functions as func


def get_user_id(req: func.HttpRequest) -> str | None:
    """Extract authenticated user ID from request.

    Returns the stable principal ID (GUID) from SWA Easy Auth headers,
    or LOCAL_USER_ID env var for local development.
    """
    # SWA injects this header for authenticated requests
    user_id = req.headers.get("x-ms-client-principal-id")
    if user_id:
        return user_id

    # Local dev fallback
    local_id = os.environ.get("LOCAL_USER_ID")
    if local_id:
        return local_id

    return None


def require_auth(req: func.HttpRequest) -> tuple[str, func.HttpResponse | None]:
    """Require authentication. Returns (user_id, None) on success or ("", error_response) on failure."""
    user_id = get_user_id(req)
    if not user_id:
        return "", func.HttpResponse(
            '{"error": "Authentication required"}',
            status_code=401,
            mimetype="application/json",
        )
    return user_id, None
