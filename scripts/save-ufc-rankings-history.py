#!/usr/bin/env python3
"""Save a dated copy of the official UFC rankings to data/ufc-rankings-history/<date>.json.

Run by the weekly rankings refresh (.github/workflows/refresh-ufc-rankings.yml) after data/ufc-divisions.json is
rebuilt, so a history builds up for a future "moved this week" strip on the Fighters hub (owner, 2026-11-24). One
small file per ranking date: division -> [[rank, slug], ...] with rank 0 the champion. Saving the same date twice
rewrites that day's file with the same content (deterministic), so re-runs are harmless.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "ufc-divisions.json"
DIR = ROOT / "data" / "ufc-rankings-history"


def snapshot(divisions: dict) -> tuple[str, dict]:
    dates = sorted({v.get("rankingDate") for v in divisions["divisions"].values() if v.get("rankingDate")})
    day = dates[-1] if dates else divisions.get("observedOn")
    ranks = {slug: [[r["rank"], r["slug"]] for r in v.get("ranked") or []]
             for slug, v in sorted(divisions["divisions"].items())}
    return day, {"schema": 1, "rankingDate": day, "observedOn": divisions.get("observedOn"),
                 "source": divisions.get("source"), "divisions": ranks}


def main() -> int:
    day, data = snapshot(json.loads(SRC.read_text(encoding="utf-8")))
    if not day:
        print("no ranking date; nothing saved")
        return 1
    DIR.mkdir(parents=True, exist_ok=True)
    path = DIR / f"{day}.json"
    path.write_text(json.dumps(data, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    print(f"saved {path.relative_to(ROOT)}: {sum(len(v) for v in data['divisions'].values())} ranked places")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
