"""Tests for domain.operations — CRUD operations on pure data dicts."""
import copy

import pytest
from domain.operations import (
    DuplicateBuildError,
    FKConflictError,
    NotFoundError,
    ValidationError,
    batch_slots,
    clear_slot,
    create_build,
    create_team,
    delete_build,
    delete_team,
    ensure_boxes,
    get_box,
    get_build,
    get_team,
    list_builds,
    list_teams,
    move_slots,
    normalize_builds,
    rename_box,
    set_slot,
    sparse_inventory,
    update_build,
    update_team,
    validate_slot_body,
)

# ── Helpers ─────────────────────────────────────────────────────────

def _make_build_body(species="Pikachu", item="Light Ball", ability="Static",
                     nature="Timid", moves=None):
    """Minimal valid build body."""
    return {
        "build": {
            "species": species,
            "item": item or "",
            "ability": ability or "",
            "nature": nature or "",
            "moves": moves or ["Thunderbolt", "Volt Switch", "Surf", "Nasty Plot"],
        },
    }


def _empty_inventory(box_count=3, slots_per_box=5):
    """Small test inventory."""
    return {
        "version": 1,
        "box_count": box_count,
        "slots_per_box": slots_per_box,
        "columns": 5,
        "rows": 1,
        "boxes": [
            {"name": f"Box {i + 1}", "slots": [None] * slots_per_box}
            for i in range(box_count)
        ],
    }


def _no_teams():
    return {"teams": []}


# ── normalize_builds ────────────────────────────────────────────────

class TestNormalizeBuilds:
    def test_dict_with_builds(self):
        d = {"builds": [{"id": "1"}]}
        assert normalize_builds(d) is d

    def test_bare_list(self):
        result = normalize_builds([{"id": "1"}])
        assert result == {"builds": [{"id": "1"}]}

    def test_empty_dict(self):
        assert normalize_builds({}) == {"builds": []}

    def test_none(self):
        assert normalize_builds(None) == {"builds": []}


# ── Build CRUD lifecycle ───────────────────────────────────────────

class TestBuildCRUD:
    def test_create_get_update_delete(self):
        data = {"builds": []}
        body = _make_build_body()

        # Create
        data, record = create_build(data, body)
        assert "id" in record
        assert "fingerprint" in record
        build_id = record["id"]

        # Get
        found = get_build(data, build_id)
        assert found["id"] == build_id

        # List
        listed = list_builds(data)
        assert len(listed["builds"]) == 1

        # Update
        updated_body = _make_build_body(item="Choice Specs")
        data, updated = update_build(data, build_id, updated_body)
        assert updated["build"]["item"] == "Choice Specs"
        assert updated["id"] == build_id

        # Delete (no FK references)
        data = delete_build(data, build_id, _no_teams)
        assert len(data["builds"]) == 0

    def test_create_assigns_ulid(self):
        data, record = create_build({"builds": []}, _make_build_body())
        assert len(record["id"]) == 26  # ULID is 26 chars

    def test_create_stores_fingerprint(self):
        data, record = create_build({"builds": []}, _make_build_body())
        assert isinstance(record["fingerprint"], str)
        assert len(record["fingerprint"]) > 10


class TestBuildDedupe:
    def test_duplicate_raises(self):
        data = {"builds": []}
        body = _make_build_body()
        data, _ = create_build(data, copy.deepcopy(body))

        with pytest.raises(DuplicateBuildError) as exc_info:
            create_build(data, copy.deepcopy(body))
        assert exc_info.value.existing["id"]  # carries the existing record

    def test_different_moves_no_duplicate(self):
        data = {"builds": []}
        data, _ = create_build(data, _make_build_body(moves=["Thunderbolt"]))
        data, _ = create_build(data, _make_build_body(moves=["Flamethrower"]))
        assert len(data["builds"]) == 2

    def test_dedupe_without_stored_fingerprint(self):
        """Recomputes fingerprint when stored one is missing."""
        data = {"builds": []}
        body = _make_build_body()
        data, record = create_build(data, copy.deepcopy(body))
        del record["fingerprint"]  # simulate legacy data

        with pytest.raises(DuplicateBuildError):
            create_build(data, copy.deepcopy(body))


class TestBuildValidation:
    def test_invalid_evs_on_create(self):
        body = _make_build_body()
        body["build"]["evs"] = {"classic": {"hp": 300}}  # over 252 limit
        with pytest.raises(ValidationError, match="EV validation"):
            create_build({"builds": []}, body)

    def test_invalid_evs_on_update(self):
        data = {"builds": []}
        data, record = create_build(data, _make_build_body())
        bad_body = _make_build_body()
        bad_body["build"]["evs"] = {"classic": {"hp": 300}}
        with pytest.raises(ValidationError, match="EV validation"):
            update_build(data, record["id"], bad_body)


class TestBuildNotFound:
    def test_get_missing(self):
        with pytest.raises(NotFoundError):
            get_build({"builds": []}, "nonexistent")

    def test_update_missing(self):
        with pytest.raises(NotFoundError):
            update_build({"builds": []}, "nonexistent", _make_build_body())

    def test_delete_missing(self):
        with pytest.raises(NotFoundError):
            delete_build({"builds": []}, "nonexistent", _no_teams)


class TestBuildFKConstraint:
    def test_delete_blocked_by_team(self):
        data = {"builds": []}
        data, record = create_build(data, _make_build_body())
        build_id = record["id"]

        teams = {"teams": [
            {"id": "team1", "name": "My Team", "members": [
                {"slot": 1, "build_id": build_id},
            ]},
        ]}

        with pytest.raises(FKConflictError, match="referenced by team"):
            delete_build(data, build_id, lambda: teams)


# ── Team CRUD lifecycle ────────────────────────────────────────────

class TestTeamCRUD:
    def test_create_get_update_delete(self):
        data = {"teams": []}
        body = {
            "name": "Rain Team",
            "members": [{"slot": 1, "build_id": "b1"}],
        }

        # Create
        data, record = create_team(data, body)
        assert "id" in record
        team_id = record["id"]

        # Get
        found = get_team(data, team_id)
        assert found["name"] == "Rain Team"

        # List
        listed = list_teams(data)
        assert len(listed["teams"]) == 1

        # Update
        update_body = {
            "name": "Sun Team",
            "members": [{"slot": 1, "build_id": "b2"}],
        }
        data, updated = update_team(data, team_id, update_body)
        assert updated["name"] == "Sun Team"

        # Delete
        data = delete_team(data, team_id)
        assert len(data["teams"]) == 0


class TestTeamValidation:
    def test_missing_build_id(self):
        body = {"name": "Bad Team", "members": [{"slot": 1}]}
        with pytest.raises(ValidationError, match="Team validation"):
            create_team({"teams": []}, body)


class TestTeamNotFound:
    def test_get_missing(self):
        with pytest.raises(NotFoundError):
            get_team({"teams": []}, "nonexistent")

    def test_update_missing(self):
        body = {"name": "X", "members": [{"slot": 1, "build_id": "b1"}]}
        with pytest.raises(NotFoundError):
            update_team({"teams": []}, "nonexistent", body)

    def test_delete_missing(self):
        with pytest.raises(NotFoundError):
            delete_team({"teams": []}, "nonexistent")


# ── Inventory operations ───────────────────────────────────────────

class TestEnsureBoxes:
    def test_fills_missing_boxes(self):
        data = {"box_count": 3, "slots_per_box": 5, "boxes": []}
        result = ensure_boxes(data)
        assert len(result["boxes"]) == 3
        assert len(result["boxes"][0]["slots"]) == 5

    def test_preserves_existing_boxes(self):
        data = _empty_inventory(box_count=3)
        data["boxes"][0]["name"] = "Custom Name"
        result = ensure_boxes(data)
        assert result["boxes"][0]["name"] == "Custom Name"


class TestSparseInventory:
    def test_returns_all_fields(self):
        data = _empty_inventory()
        result = sparse_inventory(data)
        assert "version" in result
        assert "box_count" in result
        assert "boxes" in result
        assert len(result["boxes"]) == 3


class TestGetBox:
    def test_valid_box(self):
        data = _empty_inventory()
        box = get_box(data, 0)
        assert box["name"] == "Box 1"

    def test_out_of_range(self):
        data = _empty_inventory()
        with pytest.raises(NotFoundError):
            get_box(data, 99)

    def test_negative_index(self):
        data = _empty_inventory()
        with pytest.raises(NotFoundError):
            get_box(data, -1)


class TestRenameBox:
    def test_rename(self):
        data = _empty_inventory()
        data, box = rename_box(data, 0, "My Box")
        assert box["name"] == "My Box"
        assert data["boxes"][0]["name"] == "My Box"

    def test_none_name_preserves(self):
        data = _empty_inventory()
        data, box = rename_box(data, 0, None)
        assert box["name"] == "Box 1"


class TestValidateSlotBody:
    def test_valid_body(self):
        body = {
            "build": {"species": "Pikachu"},
            "identity": {"ot": "Ash"},
            "target_build_id": "b1",
        }
        occupant = validate_slot_body(body)
        assert occupant["build"]["species"] == "Pikachu"
        assert occupant["identity"]["ot"] == "Ash"
        assert occupant["target_build_id"] == "b1"

    def test_missing_species(self):
        with pytest.raises(ValidationError, match="species"):
            validate_slot_body({"build": {}})

    def test_deprecated_keys_rejected(self):
        body = {"build": {"species": "Pikachu"}, "linked_build_id": "x"}
        with pytest.raises(ValidationError, match="deprecated"):
            validate_slot_body(body)

    def test_invalid_evs(self):
        body = {"build": {"species": "Pikachu", "evs": {"classic": {"hp": 999}}}}
        with pytest.raises(ValidationError, match="EV validation"):
            validate_slot_body(body)


class TestSetSlot:
    def test_place_occupant(self):
        data = _empty_inventory()
        occupant = {"build": {"species": "Pikachu"}, "identity": {}, "target_build_id": None}
        data, result = set_slot(data, 0, 0, occupant)
        assert data["boxes"][0]["slots"][0] == occupant

    def test_box_out_of_range(self):
        data = _empty_inventory()
        with pytest.raises(NotFoundError):
            set_slot(data, 99, 0, {})

    def test_slot_out_of_range(self):
        data = _empty_inventory()
        with pytest.raises(NotFoundError):
            set_slot(data, 0, 99, {})


class TestClearSlot:
    def test_clear(self):
        data = _empty_inventory()
        occupant = {"build": {"species": "Pikachu"}, "identity": {}, "target_build_id": None}
        data["boxes"][0]["slots"][0] = occupant
        data = clear_slot(data, 0, 0)
        assert data["boxes"][0]["slots"][0] is None


class TestMoveSlots:
    def test_swap(self):
        data = _empty_inventory()
        occ_a = {"build": {"species": "Pikachu"}, "identity": {}, "target_build_id": None}
        occ_b = {"build": {"species": "Charmander"}, "identity": {}, "target_build_id": None}
        data["boxes"][0]["slots"][0] = occ_a
        data["boxes"][1]["slots"][2] = occ_b

        data, result = move_slots(data, 0, 0, 1, 2)
        assert result["moved"] is True
        assert data["boxes"][0]["slots"][0] == occ_b
        assert data["boxes"][1]["slots"][2] == occ_a

    def test_box_out_of_range(self):
        data = _empty_inventory()
        with pytest.raises(NotFoundError, match="Box"):
            move_slots(data, 99, 0, 0, 0)


class TestBatchSlots:
    def test_mixed_set_and_clear(self):
        data = _empty_inventory()
        occ = {"build": {"species": "Pikachu"}, "identity": {}, "target_build_id": None}
        data["boxes"][0]["slots"][0] = occ

        ops = [
            {"op": "set", "box": 0, "slot": 1, "build": {"species": "Eevee"}},
            {"op": "clear", "box": 0, "slot": 0},
        ]
        data, results, errors = batch_slots(data, ops)
        assert len(results) == 2
        assert len(errors) == 0
        assert data["boxes"][0]["slots"][0] is None
        assert data["boxes"][0]["slots"][1]["build"]["species"] == "Eevee"

    def test_invalid_op_collected(self):
        data = _empty_inventory()
        ops = [
            {"op": "set", "box": 0, "slot": 0, "build": {}},  # no species
            {"op": "set", "box": 0, "slot": 1, "build": {"species": "Eevee"}},
        ]
        data, results, errors = batch_slots(data, ops)
        assert len(errors) == 1
        assert len(results) == 1

    def test_empty_operations_raises(self):
        with pytest.raises(ValidationError, match="operations"):
            batch_slots(_empty_inventory(), [])

    def test_out_of_range_collected(self):
        data = _empty_inventory()
        ops = [{"op": "set", "box": 99, "slot": 0, "build": {"species": "X"}}]
        data, results, errors = batch_slots(data, ops)
        assert len(errors) == 1
        assert "out of range" in errors[0]
