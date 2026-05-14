"""ULID generation — timestamp-sortable unique identifiers.

Ported from serve.py. Uses Crockford Base32 encoding:
10 chars timestamp (ms) + 16 chars randomness.
"""
from __future__ import annotations

import time
import uuid

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def generate_ulid() -> str:
    """Generate a new ULID (26-character Crockford Base32 string)."""
    ts = int(time.time() * 1000)
    t_part = ""
    for _ in range(10):
        t_part = CROCKFORD[ts & 0x1F] + t_part
        ts >>= 5
    rand_bytes = uuid.uuid4().bytes
    r_int = int.from_bytes(rand_bytes[:10], "big")
    r_part = ""
    for _ in range(16):
        r_part = CROCKFORD[r_int & 0x1F] + r_part
        r_int >>= 5
    return t_part + r_part
