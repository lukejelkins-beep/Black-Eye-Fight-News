#!/usr/bin/env python3
"""Build data/ufc-fighter-tape.json: height, reach, stance, listed weight and birth date for fighters on announced UFC cards.

Phase 3, "tale of the tape". No scores here.

Source: the free UFCStats.com fighter export (ufc_fighter_tott.csv) in the Greco1899/scrape_ufc_stats CSV export, the same
family the weight-class builder uses. No key, no quota, no paid worker. Only the card fighters in
data/ufc-card-snapshots.json are kept, not the export.

Rules
  * A fighter is matched on the name with accents and punctuation ignored. A name that appears more than once in the
    export is ambiguous and is left out, never guessed.
  * A missing value ("--" or blank) stays missing. Nothing is estimated and no zero is written.
  * Weight is the weight UFCStats lists for the fighter. It is not fight-day weight and can be out of date.
  * The birth date is stored, not the age, so the page can work out today's age.
  * Output is deterministic (sorted, no timestamps) so an unchanged input is a no-op.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ufc_card_aliases import load_aliases  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "ufc-fighter-tape.json"
SNAPSHOTS = DATA / "ufc-card-snapshots.json"
URL = "https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/ufc_fighter_tott.csv"
SOURCE_LABEL = "UFCStats.com via the Greco1899/scrape_ufc_stats CSV export"


def fold(name) -> str:
    text = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", text)


def parse_height(text):
    """'6' 3"' -> 75 inches; anything else -> None."""
    m = re.fullmatch(r"\s*(\d)'\s*(\d{1,2})\"?\s*", str(text or ""))
    if not m:
        return None
    inches = int(m.group(1)) * 12 + int(m.group(2))
    return inches if 54 <= inches <= 90 else None


def parse_reach(text):
    m = re.fullmatch(r"\s*(\d{2,3})\"?\s*", str(text or ""))
    if not m:
        return None
    inches = int(m.group(1))
    return inches if 50 <= inches <= 95 else None


def parse_weight(text):
    m = re.fullmatch(r"\s*(\d{2,3})\s*lbs?\.?\s*", str(text or ""), re.I)
    if not m:
        return None
    lbs = int(m.group(1))
    return lbs if 90 <= lbs <= 400 else None


def parse_born(text):
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%Y-%m-%d"):
        try:
            day = dt.datetime.strptime(str(text or "").strip(), fmt).date()
        except ValueError:
            continue
        return day.isoformat() if 1950 <= day.year <= 2010 else None
    return None


def parse_stance(text):
    value = str(text or "").strip()
    return value if value in ("Orthodox", "Southpaw", "Switch", "Open Stance", "Sideways") else None


def index_export(text: str) -> dict:
    """folded name -> list of rows, so duplicates can be told apart from unique names."""
    out = defaultdict(list)
    for row in csv.DictReader(io.StringIO(text)):
        out[fold(row.get("FIGHTER"))].append(row)
    return out


def build(card_names: dict, index: dict) -> dict:
    fighters, missing, ambiguous = {}, [], []
    for key in sorted(card_names):
        rows = index.get(key) or index.get(load_aliases().get(key, ""), [])
        if len(rows) > 1:
            ambiguous.append(card_names[key])
            continue
        if not rows:
            missing.append(card_names[key])
            continue
        r = rows[0]
        entry = {
            "heightIn": parse_height(r.get("HEIGHT")),
            "reachIn": parse_reach(r.get("REACH")),
            "weightLb": parse_weight(r.get("WEIGHT")),
            "stance": parse_stance(r.get("STANCE")),
            "born": parse_born(r.get("DOB")),
        }
        entry = {k: v for k, v in entry.items() if v is not None}
        if entry:
            fighters[key] = entry
    count = lambda k: sum(1 for f in fighters.values() if k in f)
    return {
        "schema": 1,
        "source": SOURCE_LABEL,
        "note": "Listed figures from UFCStats. Weight is the listed weight, not fight-day weight. Missing values are left out.",
        "fighters": fighters,
        "coverage": {
            "cardFighters": len(card_names),
            "matched": len(fighters),
            "notFound": sorted(missing),
            "ambiguous": sorted(ambiguous),
            "height": count("heightIn"), "reach": count("reachIn"), "weight": count("weightLb"),
            "stance": count("stance"), "born": count("born"),
        },
    }


def guard_problem(before: dict, out: dict) -> str | None:
    """Why the new tape must not replace the old one, or None if it may.

    Judged on coverage of the current card pool, not on the raw count: when the
    card rolls over to a smaller event (60 fighters -> 42) the matched count falls
    with it even though nearly every fighter still matches (QA audit A04, 24 Nov
    2026: 59/60 -> 41/42 was wrongly refused). Two checks:
      - the match rate must not fall below 70% of the previous rate;
      - fighters on both the old and the new card must not lose their match
        en masse (a corrupt or truncated export), checked when 5+ overlap.
    """
    old_cov, new_cov = before.get("coverage", {}), out["coverage"]
    old_pool, new_pool = old_cov.get("cardFighters") or 0, new_cov["cardFighters"] or 0
    if old_pool and new_pool and old_cov.get("matched"):
        old_rate = old_cov["matched"] / old_pool
        new_rate = new_cov["matched"] / new_pool
        if new_rate < old_rate * 0.7:
            return (f"match rate fell from {old_cov['matched']}/{old_pool} ({old_rate:.0%}) "
                    f"to {new_cov['matched']}/{new_pool} ({new_rate:.0%})")
    old_matched = set(before.get("fighters", {}))
    still_on_card = old_matched & set(out.get("cardKeys", []))
    if len(still_on_card) >= 5:
        lost = still_on_card - set(out["fighters"])
        if len(lost) > 0.3 * len(still_on_card):
            return f"{len(lost)} of {len(still_on_card)} fighters still on the card lost their match"
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--csv", help="local ufc_fighter_tott.csv (default: download)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    if args.csv:
        text = Path(args.csv).read_text(encoding="utf-8")
    else:
        with urllib.request.urlopen(URL, timeout=60) as r:
            text = r.read().decode("utf-8")
    snaps = json.loads(SNAPSHOTS.read_text())["fighters"]
    card_names = {k: v["name"] for k, v in snaps.items()}
    out = build(card_names, index_export(text))
    path = Path(args.out)
    # Never replace a good file with a bad download. Exit 3 means "kept the previous
    # file": the workflow warns and still publishes the other, independently built outputs.
    if path.exists():
        problem = guard_problem(json.loads(path.read_text()), {**out, "cardKeys": list(card_names)})
        if problem:
            print(f"refusing to write, previous tape kept: {problem}")
            return 3
    body = json.dumps(out, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    if not path.exists() or path.read_text() != body:
        path.write_text(body)
    c = out["coverage"]
    print(f"matched {c['matched']} of {c['cardFighters']}; height {c['height']}, reach {c['reach']}, born {c['born']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
