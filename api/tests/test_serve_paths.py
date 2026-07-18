import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from serve import resolve_user_data_dir  # noqa: E402


def test_userdata_environment_override_wins(tmp_path: Path):
    repo_root = tmp_path / "checkout"
    repo_root.mkdir()
    configured = tmp_path / "isolated" / "userdata"

    resolved = resolve_user_data_dir(
        repo_root,
        {"USERDATA_DIR": str(configured)},
    )

    assert resolved == configured.resolve()


def test_normal_checkout_uses_its_userdata(tmp_path: Path):
    repo_root = tmp_path / "checkout"
    (repo_root / ".git").mkdir(parents=True)

    resolved = resolve_user_data_dir(repo_root, {})

    assert resolved == (repo_root / "userdata").resolve()


def test_linked_worktree_uses_canonical_checkout_userdata(tmp_path: Path):
    canonical_root = tmp_path / "canonical"
    common_git_dir = canonical_root / ".git"
    worktree_git_dir = common_git_dir / "worktrees" / "feature"
    worktree_git_dir.mkdir(parents=True)
    (worktree_git_dir / "commondir").write_text("../..", encoding="utf-8")

    worktree_root = tmp_path / "feature-worktree"
    worktree_root.mkdir()
    (worktree_root / ".git").write_text(
        f"gitdir: {worktree_git_dir}\n",
        encoding="utf-8",
    )

    resolved = resolve_user_data_dir(worktree_root, {})

    assert resolved == (canonical_root / "userdata").resolve()


def test_malformed_worktree_marker_falls_back_to_local_userdata(tmp_path: Path):
    repo_root = tmp_path / "checkout"
    repo_root.mkdir()
    (repo_root / ".git").write_text("not a gitdir", encoding="utf-8")

    resolved = resolve_user_data_dir(repo_root, {})

    assert resolved == (repo_root / "userdata").resolve()
