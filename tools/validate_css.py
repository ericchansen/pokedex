from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSS_PATH = ROOT / "site" / "css" / "styles.css"
JS_DIR = ROOT / "site" / "js"

DEPRECATED_CONTRACTS = re.compile(
    r"\b(?:slot-complete|slot-partial|preset-match|preset-mismatch|"
    r"search-match|search-match-unowned|game-badge--[a-z0-9_-]+|"
    r"applyCompletenessClass)\b"
)
INVALID_BACKGROUND = re.compile(r"background\s*:\s*transparent\s+padding-box", re.IGNORECASE)
COMPOUND_INDICATOR_SELECTOR = re.compile(
    r"\[[^\]]*data-(?:border|preset|glow)[^\]]*\][^{,]*"
    r"\[[^\]]*data-(?:border|preset|glow)[^\]]*\]",
    re.IGNORECASE,
)
HARD_CODED_CHANNEL_VALUE = re.compile(
    r"(?<![-\w])(?:#[0-9a-fA-F]{3,8}|rgba?\([^;{}]+\)|hsla?\([^;{}]+\))"
)


def line_for(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def add_regex_findings(findings: list[str], label: str, path: Path, text: str, pattern: re.Pattern[str]) -> None:
    for match in pattern.finditer(text):
        findings.append(f"{path.relative_to(ROOT)}:{line_for(text, match.start())}: {label}: {match.group(0)}")


def iter_rule_blocks(text: str):
    for match in re.finditer(r"([^{}]+)\{([^{}]*)\}", text, re.MULTILINE):
        yield match.start(), match.group(1).strip(), match.group(2)


def validate_mask_pairing(findings: list[str], text: str) -> None:
    for start, selector, body in iter_rule_blocks(text):
        has_webkit = "-webkit-mask-composite" in body
        has_standard = re.search(r"(?<!-)mask-composite\s*:", body) is not None
        if has_webkit != has_standard:
            line = line_for(text, start)
            findings.append(
                f"{CSS_PATH.relative_to(ROOT)}:{line}: mask-composite pairing mismatch in selector {selector!r}"
            )


def validate_channel_layers(findings: list[str], text: str) -> None:
    for match in re.finditer(r"@layer\s+channel-[^{]+", text):
        layer_start = text.find("{", match.end())
        if layer_start == -1:
            continue
        depth = 1
        pos = layer_start + 1
        while pos < len(text) and depth:
            if text[pos] == "{":
                depth += 1
            elif text[pos] == "}":
                depth -= 1
            pos += 1
        body = text[layer_start + 1 : pos - 1]
        for value_match in HARD_CODED_CHANNEL_VALUE.finditer(body):
            line = line_for(text, layer_start + 1 + value_match.start())
            findings.append(
                f"{CSS_PATH.relative_to(ROOT)}:{line}: hardcoded channel value outside :root: {value_match.group(0)}"
            )


def main() -> int:
    findings: list[str] = []
    css = CSS_PATH.read_text(encoding="utf-8")

    add_regex_findings(findings, "invalid background syntax", CSS_PATH, css, INVALID_BACKGROUND)
    add_regex_findings(findings, "deprecated visual indicator contract", CSS_PATH, css, DEPRECATED_CONTRACTS)
    add_regex_findings(findings, "compound indicator selector", CSS_PATH, css, COMPOUND_INDICATOR_SELECTOR)
    validate_mask_pairing(findings, css)
    validate_channel_layers(findings, css)

    for js_path in sorted(JS_DIR.rglob("*.js")):
        js = js_path.read_text(encoding="utf-8")
        add_regex_findings(findings, "deprecated visual indicator contract", js_path, js, DEPRECATED_CONTRACTS)

    if findings:
        print("CSS visual indicator validation failed:", file=sys.stderr)
        for finding in findings:
            print(f"  - {finding}", file=sys.stderr)
        return 1

    print("CSS visual indicator validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
