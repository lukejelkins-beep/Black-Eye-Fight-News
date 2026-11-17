#!/usr/bin/env python3
"""Build the small public round-evidence summary the Fighters page needs.

The full research archive (data/ufc-research-archive.json, tens of MB) is
research input, not a page asset. The Fighters page only shows the four most
recent bouts, five rounds each, plus a bout count, so publish just that.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "ufc-research-archive.json"
OUT = ROOT / "data" / "ufc-round-evidence-summary.json"
SHOW, MAX_ROUNDS = 4, 5
SOURCE_LABEL = {"cito": "Cito", "ufcalendar": "UFCalendar"}
ROUND_FIELDS = ("sigLanded", "takedowns", "controlSec")


def trim_round(r):
    out = {"round": r.get("round")}
    for side in ("a", "b"):
        s = r.get(side) or {}
        out[side] = {k: s[k] for k in ROUND_FIELDS if isinstance(s.get(k), (int, float))}
    return out


def build(archive):
    fights = [
        (fid, f) for fid, f in (archive.get("fights") or {}).items()
        if isinstance(f, dict) and isinstance(f.get("rounds"), list) and f["rounds"]
    ]
    fights.sort(key=lambda kv: str(kv[1].get("date") or ""), reverse=True)
    shown = {}
    for fid, f in fights[:SHOW]:
        names = " + ".join(
            SOURCE_LABEL.get(x, "UFC Stats API") for x in (f.get("sources") or {})
        )
        shown[fid] = {
            "date": f.get("date"), "event": f.get("event"),
            "division": f.get("division") or "UFC",
            "fighterA": {"name": f.get("fighterA")},
            "fighterB": {"name": f.get("fighterB")},
            "sourceNames": names,
            "rounds": [trim_round(r) for r in f["rounds"][:MAX_ROUNDS]],
        }
    return {"schema": 1, "total": len(fights), "fights": shown,
            "sourceUpdatedAt": archive.get("updatedAt")}


def main():
    archive = json.loads(SRC.read_text())
    summary = build(archive)
    OUT.write_text(json.dumps(summary, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {summary['total']} bouts, "
          f"{len(summary['fights'])} shown, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    sys.exit(main())
