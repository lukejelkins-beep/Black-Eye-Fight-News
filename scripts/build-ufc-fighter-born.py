#!/usr/bin/env python3
"""Build data/ufc-fighter-born.json: birth dates (and heights) for every fighter in the UFC stats build.

Source: the free UFCStats.com fighter export (ufc_fighter_tott.csv) in the Greco1899/scrape_ufc_stats CSV export, the
same file scripts/build-ufc-fighter-tape.py uses. Names are matched on the folded name (ASCII, lower case, letters and
digits only), with the display-name aliases the tape builder uses. A name that appears twice in the export is left out,
never guessed. Used by scripts/build-ufc-fighter-form.py for age and UFC debut age (Fighters hub stages), and by
scripts/build-ufc-stats.py for the BEFN rating's age and height adjustments (`heightInches`, 25 Nov 2026).

Like the tape builder, it refuses to overwrite the saved file if the number of dated fighters falls by 30% or more.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "ufc-fighter-born.json"


def load_tape():
    spec = importlib.util.spec_from_file_location("ufc_tape", ROOT / "scripts/build-ufc-fighter-tape.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def stats_names() -> dict:
    """slug -> display name for every fighter in the stats build."""
    out = {}
    for p in sorted((DATA / "ufc-stats" / "fighters").glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        out[d["slug"]] = d["name"]
    return out


def build(names: dict, index: dict, tape) -> dict:
    aliases = tape.load_aliases()
    fighters, heights, missing, ambiguous = {}, {}, [], []
    for slug, name in sorted(names.items()):
        key = tape.fold(name)
        rows = index.get(key) or index.get(aliases.get(key, ""), [])
        if len(rows) > 1:
            ambiguous.append(slug)
            continue
        height = tape.parse_height(rows[0].get("HEIGHT")) if rows else None
        if height:
            heights[slug] = height
        born = tape.parse_born(rows[0].get("DOB")) if rows else None
        if not born:
            missing.append(slug)
            continue
        fighters[slug] = born
    return {"schema": 1, "source": tape.SOURCE_LABEL,
            "note": "Birth dates from UFCStats, matched on the folded name. Names that appear twice in the export, "
                    "and fighters without a listed date, are left out.",
            "fighters": fighters,
            "heightInches": heights,
            "coverage": {"statsFighters": len(names), "dated": len(fighters),
                         "ambiguous": ambiguous, "notFound": missing}}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--csv", help="local ufc_fighter_tott.csv (default: download)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    tape = load_tape()
    if args.csv:
        text = Path(args.csv).read_text(encoding="utf-8")
    else:
        with urllib.request.urlopen(tape.URL, timeout=60) as resp:
            text = resp.read().decode("utf-8")
    result = build(stats_names(), tape.index_export(text), tape)
    out = Path(args.out)
    if out.exists():
        before = len(json.loads(out.read_text(encoding="utf-8")).get("fighters") or {})
        if before and len(result["fighters"]) < before * 0.7:
            print(f"refusing to overwrite: dated fighters fell from {before} to {len(result['fighters'])}", file=sys.stderr)
            return 1
    out.write_text(json.dumps(result, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    c = result["coverage"]
    print(f"{c['dated']} of {c['statsFighters']} dated; {len(c['ambiguous'])} ambiguous, {len(c['notFound'])} not found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
