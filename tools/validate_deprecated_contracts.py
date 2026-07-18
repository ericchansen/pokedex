from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SCAN_PATHS = [
    ROOT / "AGENTS.md",
    ROOT / "README.md",
    ROOT / "serve.py",
    ROOT / "data",
    ROOT / "docs",
    ROOT / "scripts",
    ROOT / "site" / "js",
]

SKIP_DIRS = {
    ".git",
    ".scratch",
    "__pycache__",
    "node_modules",
    "data/reference",
}

DEPRECATED_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("deprecated inventory field", re.compile(r"\blinked_build_id\b")),
    ("deprecated multi-target field", re.compile(r"\btarget_build_ids\b")),
    ("legacy inventory projection", re.compile(r"\b_legacySlotFromV3\b")),
    ("legacy inventory projection", re.compile(r"\b_v3SlotFromLegacy\b")),
    ("legacy inventory projection", re.compile(r"\bprojectInventoryFromV3\b")),
    ("manual ownership model", re.compile(r"\bownership\.manual\b")),
    ("manual ownership API", re.compile(r"\btoggleOwned\b")),
    ("manual ownership API", re.compile(r"\bgetOwnershipState\b")),
    ("viewer compatibility wrapper", re.compile(r"\bopenBuildDetail\b")),
    ("viewer compatibility wrapper", re.compile(r"\bopenSpeciesDetail\b")),
    ("viewer compatibility wrapper", re.compile(r"\bopenDetail\s*\(")),
    ("flat EV fallback", re.compile(r"\bpickFlatLegacy\b")),
    ("flat EV fallback", re.compile(r"\bflatLegacy\b")),
    ("legacy renderer facade", re.compile(r"\bRenderer\.")),
    ("renderer-owned search", re.compile(r"\bRenderer\.applySearch\s*\(")),
    ("hidden inventory mode mutation", re.compile(r"\bInventoryView\.setMode\s*\(")),
    ("local species fallback helper", re.compile(r"\bfindPokedexEntry\s*\(")),
    ("manual sprite fallback sentinel", re.compile(r"\bdataset\.tried\b")),
)


def iter_files() -> list[Path]:
    files: list[Path] = []
    for path in SCAN_PATHS:
        if not path.exists():
            continue
        if path.is_file():
            files.append(path)
            continue
        for child in path.rglob("*"):
            if child.is_dir():
                continue
            rel = child.relative_to(ROOT).as_posix()
            if any(rel == skip or rel.startswith(f"{skip}/") for skip in SKIP_DIRS):
                continue
            if child.suffix.lower() not in {".js", ".json", ".md", ".py"}:
                continue
            files.append(child)
    return sorted(set(files))


def line_for(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def main() -> int:
    findings: list[str] = []
    for path in iter_files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        rel = path.relative_to(ROOT)
        for label, pattern in DEPRECATED_PATTERNS:
            for match in pattern.finditer(text):
                findings.append(f"{rel}:{line_for(text, match.start())}: {label}: {match.group(0)}")

    if findings:
        print("Deprecated contract validation failed:", file=sys.stderr)
        for finding in findings:
            print(f"  - {finding}", file=sys.stderr)
        return 1

    print("Deprecated contract validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
