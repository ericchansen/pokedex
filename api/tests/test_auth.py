"""Tests for authentication helper."""
import os
from unittest.mock import MagicMock, patch

import azure.functions as func
from shared.auth import get_user_id, require_auth


def _make_request(headers: dict | None = None) -> func.HttpRequest:
    """Create a mock HTTP request with given headers."""
    req = MagicMock(spec=func.HttpRequest)
    req.headers = headers or {}
    return req


class TestGetUserId:
    def test_swa_header(self):
        """Extracts user ID from SWA Easy Auth header."""
        req = _make_request({"x-ms-client-principal-id": "abc-123"})
        assert get_user_id(req) == "abc-123"

    def test_local_user_id_fallback(self):
        """Falls back to LOCAL_USER_ID env var."""
        req = _make_request({})
        with patch.dict(os.environ, {"LOCAL_USER_ID": "dev-user"}):
            assert get_user_id(req) == "dev-user"

    def test_no_auth(self):
        """Returns None when no auth available."""
        req = _make_request({})
        with patch.dict(os.environ, {}, clear=True):
            # Ensure LOCAL_USER_ID is not set
            os.environ.pop("LOCAL_USER_ID", None)
            assert get_user_id(req) is None

    def test_swa_header_takes_priority(self):
        """SWA header wins over LOCAL_USER_ID."""
        req = _make_request({"x-ms-client-principal-id": "swa-id"})
        with patch.dict(os.environ, {"LOCAL_USER_ID": "local-id"}):
            assert get_user_id(req) == "swa-id"


class TestRequireAuth:
    def test_authenticated(self):
        """Returns (user_id, None) on success."""
        req = _make_request({"x-ms-client-principal-id": "user-1"})
        user_id, error = require_auth(req)
        assert user_id == "user-1"
        assert error is None

    def test_unauthenticated(self):
        """Returns ('', 401 response) on failure."""
        req = _make_request({})
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("LOCAL_USER_ID", None)
            user_id, error = require_auth(req)
            assert user_id == ""
            assert error is not None
            assert error.status_code == 401
