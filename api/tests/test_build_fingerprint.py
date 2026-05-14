"""Tests for build fingerprint hashing."""
from shared.build_fingerprint import build_fingerprint, fingerprint_record


class TestBuildFingerprint:
    def test_deterministic(self):
        """Same build always produces same fingerprint."""
        build = {"species": "Pikachu", "item": "Light Ball", "nature": "Timid"}
        fp1 = build_fingerprint(build)
        fp2 = build_fingerprint(build)
        assert fp1 == fp2

    def test_sha1_format(self):
        """Fingerprint is 40-char hex SHA-1."""
        fp = build_fingerprint({"species": "Ditto"})
        assert len(fp) == 40
        assert all(c in "0123456789abcdef" for c in fp)

    def test_different_species(self):
        """Different species → different fingerprint."""
        fp1 = build_fingerprint({"species": "Pikachu"})
        fp2 = build_fingerprint({"species": "Raichu"})
        assert fp1 != fp2

    def test_order_independent_evs(self):
        """EV keys order doesn't affect fingerprint."""
        evs_a = {"classic": {"hp": 252, "atk": 4, "spe": 252}}
        evs_b = {"classic": {"spe": 252, "hp": 252, "atk": 4}}
        fp1 = build_fingerprint({"species": "X", "evs": evs_a})
        fp2 = build_fingerprint({"species": "X", "evs": evs_b})
        assert fp1 == fp2

    def test_egg_moves_affect_fingerprint(self):
        """Different egg moves → different fingerprint."""
        build = {"species": "Tyranitar"}
        fp1 = build_fingerprint(build, egg_moves=["Dragon Dance"])
        fp2 = build_fingerprint(build, egg_moves=["Stealth Rock"])
        assert fp1 != fp2

    def test_egg_moves_order_independent(self):
        """Egg move order doesn't matter (sorted internally)."""
        build = {"species": "Tyranitar"}
        fp1 = build_fingerprint(build, egg_moves=["Dragon Dance", "Stealth Rock"])
        fp2 = build_fingerprint(build, egg_moves=["Stealth Rock", "Dragon Dance"])
        assert fp1 == fp2

    def test_empty_build(self):
        """Empty build dict doesn't crash."""
        fp = build_fingerprint({})
        assert len(fp) == 40

    def test_none_fields_treated_as_none(self):
        """Missing fields are treated as None, same fingerprint."""
        fp1 = build_fingerprint({"species": None, "item": None})
        fp2 = build_fingerprint({})
        assert fp1 == fp2

    def test_fingerprint_record(self):
        """fingerprint_record extracts build and egg_moves from record."""
        record = {
            "id": "abc",
            "slug": "pikachu",
            "build": {"species": "Pikachu", "item": "Light Ball"},
            "egg_moves": ["Volt Tackle"],
        }
        fp = fingerprint_record(record)
        expected = build_fingerprint(record["build"], record["egg_moves"])
        assert fp == expected

    def test_moves_included(self):
        """Moves affect fingerprint."""
        fp1 = build_fingerprint({"species": "X", "moves": ["A", "B"]})
        fp2 = build_fingerprint({"species": "X", "moves": ["A", "C"]})
        assert fp1 != fp2

    def test_item_matters(self):
        """Item affects fingerprint."""
        fp1 = build_fingerprint({"species": "X", "item": "Leftovers"})
        fp2 = build_fingerprint({"species": "X", "item": "Choice Band"})
        assert fp1 != fp2
