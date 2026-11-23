#!/usr/bin/env python3
"""Build data/ufc-overall-records.json: each stats-build fighter's overall (all promotions) record.

Offline and read-only. Never calls a provider.

Inputs
  data/ufcalendar-fighter-research.json   saved UFCalendar profile "record" ("W-L-D", all promotions) and the date it was observed
  data/ufc-stats/fighters/*.json          each fighter's UFC fights (the stats build; feeder-series bouts already left out)

Rules
  * The overall record is the saved UFCalendar record plus every UFC fight dated AFTER the day it was observed, so a
    fight since then is counted once and a fight before it is never counted twice.
  * UFCalendar's string has no no-contest figure. NC is counted from the fighter's UFC bouts only and says so
    ("ncScope": "ufc"): a no-contest outside the UFC is not known, and is not guessed.
  * A record that cannot be true is left out, never repaired: if the overall wins, losses or draws are fewer than the
    fighter's own UFC wins, losses or draws, the fighter gets no overall record and the page keeps showing the UFC record.
  * A fighter with no saved record gets no overall record. Nothing is estimated and no zero is written.
  * Output is deterministic (sorted, no timestamps) so an unchanged input is a no-op.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "ufc-overall-records.json"
RESEARCH = DATA / "ufcalendar-fighter-research.json"
STATS = DATA / "ufc-stats"
RECORD = re.compile(r"^(\d+)-(\d+)-(\d+)$")
OUTCOME = {"W": "W", "L": "L", "D": "D", "NC": "NC"}


def ufc_counts(fights, after: str | None = None) -> dict:
    c = {"W": 0, "L": 0, "D": 0, "NC": 0}
    for f in fights:
        key = OUTCOME.get(f.get("outcome"))
        if key and (after is None or str(f.get("date") or "") > after):
            c[key] += 1
    return c


def build_one(profile: dict, fighter: dict) -> dict | None:
    m = RECORD.match(str(profile.get("record") or "").strip())
    observed = str(profile.get("observedOn") or "")
    if not m or not re.match(r"^\d{4}-\d{2}-\d{2}$", observed):
        return None
    w, l, d = (int(x) for x in m.groups())
    fights = fighter.get("fights") or []
    since = ufc_counts(fights, observed)
    ufc = ufc_counts(fights)
    overall = {"W": w + since["W"], "L": l + since["L"], "D": d + since["D"]}
    if any(overall[k] < ufc[k] for k in ("W", "L", "D")):
        return None
    return {
        "W": overall["W"], "L": overall["L"], "D": overall["D"], "NC": ufc["NC"], "ncScope": "ufc",
        "observedOn": observed, "sinceObserved": sum(since[k] for k in ("W", "L", "D", "NC")),
        "ufc": {"W": ufc["W"], "L": ufc["L"], "D": ufc["D"], "NC": ufc["NC"], "fights": len(fights)},
    }


def build(research: dict, fighters: dict) -> dict:
    out, missing, inconsistent = {}, [], []
    for slug in sorted(fighters):
        profile = research.get(slug)
        if not profile or not profile.get("record"):
            missing.append(slug)
            continue
        one = build_one(profile, fighters[slug])
        if one is None:
            inconsistent.append(slug)
            continue
        out[slug] = one
    return {
        "schema": 1,
        "source": "UFCalendar saved profile record (all promotions) plus UFC fights since it was observed",
        "note": ("Overall record across promotions. NC counts UFC bouts only. A fighter with no saved record, or whose "
                 "saved record is lower than their own UFC results, is left out."),
        "coverage": {"fighters": len(fighters), "withOverall": len(out), "noSavedRecord": sorted(missing),
                     "recordBelowUfcResults": sorted(inconsistent)},
        "records": out,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    research = json.loads(RESEARCH.read_text())["profiles"]
    fighters = {p.stem: json.loads(p.read_text()) for p in sorted((STATS / "fighters").glob("*.json"))}
    result = build(research, fighters)
    text = json.dumps(result, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    path = Path(args.out)
    if not path.exists() or path.read_text() != text:
        path.write_text(text)
    c = result["coverage"]
    print(f"{c['withOverall']} of {c['fighters']} fighters have an overall record; "
          f"{len(c['noSavedRecord'])} no saved record, {len(c['recordBelowUfcResults'])} record below UFC results")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
