#!/usr/bin/env python3
"""Generate an IBMFS pedigree config JSON deterministically from a CSV file.

Expected CSV columns:
  quadrant    Required. One of I, II, III, IV or top_right, bottom_right,
              bottom_left, top_left.
  name        Required per quadrant; repeated on each row is OK.
  color       Required per quadrant; repeated on each row is OK.
  type        Required per quadrant; repeated on each row is OK.
  match_type  Required. One of: code, children_of.
  code        Required. Code or prefix to add.
  comment     Optional; ignored by the generated JSON.

Example:
  I,IBMFS,blue,disease,code,D6101
  II,Cancers,red,cancer,children_of,C

The generator intentionally normalizes all configured codes/prefixes by:
  - trimming whitespace
  - uppercasing
  - removing periods

This matches the intended runtime behavior:
  candidate code -> normalize -> exact code lookup -> children_of prefix lookup
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import OrderedDict
from pathlib import Path
from typing import Dict, Iterable, List, MutableMapping

QUADRANT_TO_POSITION = {
    "I": "top_right",
    "II": "bottom_right",
    "III": "bottom_left",
    "IV": "top_left",
    "TOP_RIGHT": "top_right",
    "BOTTOM_RIGHT": "bottom_right",
    "BOTTOM_LEFT": "bottom_left",
    "TOP_LEFT": "top_left",
}

QUADRANT_ORDER = ["top_right", "bottom_right", "bottom_left", "top_left"]

BASE_CONFIG = OrderedDict([
    ("api", {"baseUrl": "/api"}),
    ("session", {"warningSeconds": 300}),
    ("dataDir", "../data"),
    ("build_mode", True),
    ("debug_mode", True),
    ("study_name", "Inherited Bone Marrow Failure Syndrome (IBMFS)"),
    ("default_color", "lightyellow"),
    ("style", "compact"),
    ("margin", 100),
    ("size", 50),
    ("h_padding", 200),
    ("v_padding", 30),
    ("h_spacing", 120),
    ("v_spacing", 200),
])

CODE_MATCHING = OrderedDict([
    ("normalize", OrderedDict([
        ("trim", True),
        ("uppercase", True),
        ("remove_decimals", True),
    ])),
    ("match_order", ["exact_normalized_code", "children_of_prefix"]),
])


def normalize_code(value: object) -> str:
    """Return the canonical config representation of a code/prefix."""
    return str(value or "").strip().upper().replace(".", "")


def parse_quadrant(value: object) -> str:
    key = str(value or "").strip().upper().replace(" ", "_")
    try:
        return QUADRANT_TO_POSITION[key]
    except KeyError as exc:
        valid = ", ".join(QUADRANT_TO_POSITION)
        raise ValueError(f"Unknown quadrant {value!r}. Expected one of: {valid}") from exc


def clean_match_type(value: object) -> str:
    match_type = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "codes": "code",
        "exact": "code",
        "exact_code": "code",
        "child": "children_of",
        "children": "children_of",
        "prefix": "children_of",
        "childrenof": "children_of",
    }
    match_type = aliases.get(match_type, match_type)
    if match_type not in {"code", "children_of"}:
        raise ValueError(f"Unknown match_type {value!r}. Expected 'code' or 'children_of'.")
    return match_type


def dedupe_sorted(values: Iterable[str]) -> List[str]:
    """Deterministic output: unique, normalized, lexicographically sorted."""
    return sorted({normalize_code(v) for v in values if normalize_code(v)})


def read_csv_rows(csv_path: Path) -> List[dict]:
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        required = {"quadrant", "name", "color", "type", "match_type", "code"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV is missing required columns: {sorted(missing)}")
        return list(reader)


def build_config(rows: Iterable[dict]) -> OrderedDict:
    quadrant_work: Dict[str, MutableMapping[str, object]] = OrderedDict()

    for row_num, row in enumerate(rows, start=2):
        position = parse_quadrant(row.get("quadrant"))
        match_type = clean_match_type(row.get("match_type"))
        code = normalize_code(row.get("code"))
        if not code:
            raise ValueError(f"Row {row_num}: code is blank")

        name = str(row.get("name") or "").strip()
        color = str(row.get("color") or "").strip()
        qtype = str(row.get("type") or "").strip()
        if not (name and color and qtype):
            raise ValueError(f"Row {row_num}: name, color, and type are required")

        if position not in quadrant_work:
            quadrant_work[position] = OrderedDict([
                ("name", name),
                ("color", color),
                ("type", qtype),
                ("codes", []),
                ("children_of", []),
            ])
        else:
            q = quadrant_work[position]
            expected = (q["name"], q["color"], q["type"])
            actual = (name, color, qtype)
            if expected != actual:
                raise ValueError(
                    f"Row {row_num}: inconsistent metadata for {position}. "
                    f"Expected {expected}, got {actual}."
                )

        target_key = "codes" if match_type == "code" else "children_of"
        quadrant_work[position][target_key].append(code)  # type: ignore[index]

    missing_quadrants = [q for q in QUADRANT_ORDER if q not in quadrant_work]
    if missing_quadrants:
        raise ValueError(f"CSV does not define these quadrants: {missing_quadrants}")

    quadrants = OrderedDict()
    for position in QUADRANT_ORDER:
        q = quadrant_work[position]
        quadrants[position] = OrderedDict([
            ("name", q["name"]),
            ("color", q["color"]),
            ("type", q["type"]),
            ("codes", dedupe_sorted(q["codes"])),  # type: ignore[arg-type]
            ("children_of", dedupe_sorted(q["children_of"])),  # type: ignore[arg-type]
        ])

    config = OrderedDict(BASE_CONFIG)
    config["quadrants"] = quadrants
    config["code_matching"] = CODE_MATCHING
    return config


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate IBMFS pedigree config JSON from CSV.")
    parser.add_argument("input_csv", type=Path, help="Path to source CSV.")
    parser.add_argument("-o", "--output", type=Path, default=Path("ibmfs_pedigree_config.json"), help="Output JSON path.")
    parser.add_argument("--check", action="store_true", help="Validate only; do not write output.")
    args = parser.parse_args()

    rows = read_csv_rows(args.input_csv)
    config = build_config(rows)

    if args.check:
        print(json.dumps({
            "input_csv": str(args.input_csv),
            "quadrants": list(config["quadrants"].keys()),
            "code_counts": {k: len(v["codes"]) for k, v in config["quadrants"].items()},
            "children_of_counts": {k: len(v["children_of"]) for k, v in config["quadrants"].items()},
        }, indent=2))
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)
        handle.write("\n")

    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
