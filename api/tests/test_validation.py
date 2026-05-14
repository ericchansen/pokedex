"""Tests for EV and team validation."""
from shared.validation import validate_evs, validate_team_members


class TestValidateEvs:
    def test_empty_evs(self):
        """Empty dict is valid — no systems to check."""
        assert validate_evs({}) == []

    def test_valid_classic_max(self):
        """252/252/4 is the standard competitive spread."""
        evs = {"classic": {"hp": 252, "atk": 252, "spe": 4}}
        assert validate_evs(evs) == []

    def test_valid_champions_max(self):
        """32/32/2 is valid (66 total)."""
        evs = {"champions": {"hp": 32, "atk": 32, "spe": 2}}
        assert validate_evs(evs) == []

    def test_classic_over_per_stat(self):
        """Single stat > 252 should error."""
        evs = {"classic": {"hp": 253}}
        errors = validate_evs(evs)
        assert any("253 > 252" in e for e in errors)

    def test_classic_over_total(self):
        """Total > 510 should error."""
        evs = {"classic": {"hp": 252, "atk": 252, "def": 252}}
        errors = validate_evs(evs)
        assert any("total" in e and "510" in e for e in errors)

    def test_champions_over_per_stat(self):
        """Single stat > 32 should error."""
        evs = {"champions": {"hp": 33}}
        errors = validate_evs(evs)
        assert any("33 > 32" in e for e in errors)

    def test_champions_over_total(self):
        """Total > 66 should error."""
        evs = {"champions": {"hp": 32, "atk": 32, "def": 3}}
        errors = validate_evs(evs)
        assert any("total" in e and "66" in e for e in errors)

    def test_negative_value(self):
        """Negative EV should error."""
        evs = {"classic": {"hp": -1}}
        errors = validate_evs(evs)
        assert any("negative" in e for e in errors)

    def test_non_number_value(self):
        """Non-numeric EV should error."""
        evs = {"classic": {"hp": "max"}}
        errors = validate_evs(evs)
        assert any("not a number" in e for e in errors)

    def test_valid_ivs(self):
        """IVs in 0-31 are valid."""
        evs = {"classic_ivs": {"hp": 31, "atk": 0, "def": 15}}
        assert validate_evs(evs) == []

    def test_ivs_out_of_range(self):
        """IVs outside 0-31 should error."""
        evs = {"classic_ivs": {"hp": 32}}
        errors = validate_evs(evs)
        assert any("not in 0-31" in e for e in errors)

    def test_combined_systems(self):
        """Both classic and champions validated independently."""
        evs = {
            "classic": {"hp": 252, "atk": 252, "spe": 4},
            "champions": {"hp": 32, "def": 32, "spd": 2},
        }
        assert validate_evs(evs) == []


class TestValidateTeamMembers:
    def test_empty_body(self):
        """No members key is valid."""
        assert validate_team_members({"name": "My Team"}) == []

    def test_valid_members(self):
        """Proper FK members are valid."""
        body = {
            "members": [
                {"slot": 1, "build_id": "01ABC"},
                {"slot": 2, "build_id": "01DEF"},
            ]
        }
        assert validate_team_members(body) == []

    def test_missing_build_id(self):
        """Member without build_id should error."""
        body = {"members": [{"slot": 1}]}
        errors = validate_team_members(body)
        assert any("build_id is required" in e for e in errors)

    def test_empty_build_id(self):
        """Empty string build_id should error."""
        body = {"members": [{"slot": 1, "build_id": "   "}]}
        errors = validate_team_members(body)
        assert any("build_id is required" in e for e in errors)

    def test_extra_keys(self):
        """Non-standard keys should be flagged."""
        body = {"members": [{"slot": 1, "build_id": "X", "species": "Pikachu"}]}
        errors = validate_team_members(body)
        assert any("unexpected keys" in e for e in errors)

    def test_evs_migration_field(self):
        """evs_migration_needed field is not allowed."""
        body = {"evs_migration_needed": True, "members": []}
        errors = validate_team_members(body)
        assert any("evs_migration_needed" in e for e in errors)

    def test_non_object_member(self):
        """Non-dict member should error."""
        body = {"members": ["invalid"]}
        errors = validate_team_members(body)
        assert any("must be an object" in e for e in errors)
