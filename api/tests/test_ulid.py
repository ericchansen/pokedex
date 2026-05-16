"""Tests for ULID generation."""
import re
import time

from domain.ulid import CROCKFORD, generate_ulid


def test_ulid_length():
    """ULID must be exactly 26 characters."""
    assert len(generate_ulid()) == 26


def test_ulid_uses_crockford():
    """All characters must be from Crockford Base32 alphabet."""
    ulid = generate_ulid()
    for ch in ulid:
        assert ch in CROCKFORD, f"Unexpected char: {ch}"


def test_ulid_uniqueness():
    """1000 ULIDs should all be unique."""
    ids = {generate_ulid() for _ in range(1000)}
    assert len(ids) == 1000


def test_ulid_sortable():
    """ULIDs generated later should sort after earlier ones (timestamp prefix)."""
    a = generate_ulid()
    time.sleep(0.002)  # ensure different ms
    b = generate_ulid()
    assert b > a, f"Expected {b} > {a}"


def test_ulid_format():
    """ULID should be uppercase alphanumeric (Crockford excludes I, L, O, U)."""
    ulid = generate_ulid()
    assert re.match(r"^[0-9A-HJKMNP-TV-Z]{26}$", ulid)
