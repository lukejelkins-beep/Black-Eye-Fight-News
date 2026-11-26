#!/usr/bin/env python3
"""Backtest the Form points score: does the fighter with the higher Form the day before a UFC bout win it?

Research only; writes nothing. Each fighter is scored from their earlier fights alone, with the results-rating history
(point-in-time) and each fight's own statistics, so nothing from after the bout leaks in. Prints accuracy and the
log loss of a one-parameter logistic fit on the points difference, with the BEFN pre-bout rating as a reference.
Used for Form v2, v3 and v4 (docs/design/FIGHTERS-HUB-FORM.md section 3). Takes about 15 seconds.

  python3 scripts/ufc-form-backtest.py --start 2022-01-01
  python3 scripts/ufc-form-backtest.py --start 2018-01-01 --end 2021-12-31
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_form():
    spec = importlib.util.spec_from_file_location("fighter_form", ROOT / "scripts/build-ufc-fighter-form.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def report(name, pairs):
    pts = [(y, d) for y, d in pairs if d]
    if not pts:
        print(f"{name:34s} no bouts")
        return
    acc = sum((d > 0) == (y == 1) for y, d in pts) / len(pts)
    ll, best = min((sum(math.log1p(math.exp(-k * d * (1 if y else -1))) for y, d in pts) / len(pts), k)
                   for k in [i / 2000 for i in range(1, 400)])
    brier = sum((1 / (1 + math.exp(-best * d)) - y) ** 2 for y, d in pts) / len(pts)   # at the log-loss-best k
    print(f"{name:34s} n={len(pts):5d}  accuracy {acc:.3f}  log loss {ll:.4f}  Brier {brier:.4f}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--start", default="2022-01-01")
    ap.add_argument("--end", default="9999-12-31")
    ap.add_argument("--old-drift", action="store_true",
                    help="results ratings drift while idle after a title fight too (the engine before 26 Nov 2026)")
    args = ap.parse_args()
    sys.path.insert(0, str(ROOT / "scripts"))
    import ufc_ratings
    ufc_ratings.TITLE_NO_DRIFT = not args.old_drift   # the build module imports this same module
    fb = load_form()
    as_of = json.loads((ROOT / "data/ufc-stats/index.json").read_text())["asOf"]
    ratings, after, timeline = fb.rating_history(fb.load_build(), dt.date.fromisoformat(as_of))
    strength = fb.Strength(timeline)
    born = json.loads((ROOT / "data/ufc-fighter-born.json").read_text())["fighters"]
    files = {}
    for p in sorted((ROOT / "data/ufc-stats/fighters").glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        files[d["slug"]] = d["fights"]
    seen, form, rating = set(), [], []
    for slug, fights in files.items():
        for f in fights:
            bout, opp = str(f["boutId"]), f.get("opponentSlug")
            if (bout in seen or f["outcome"] not in ("W", "L") or opp not in files
                    or not args.start <= f["date"] <= args.end):
                continue
            seen.add(bout)
            day = (dt.date.fromisoformat(f["date"]) - dt.timedelta(days=1)).isoformat()
            mine = [x for x in fights if x["date"] < f["date"]]
            theirs = [x for x in files[opp] if x["date"] < f["date"]]
            if not mine or not theirs:
                continue
            a = fb.points_for(slug, mine, day, ratings, strength, None, after, born.get(slug))[0]
            b = fb.points_for(opp, theirs, day, ratings, strength, None, after, born.get(opp))[0]
            if a is None or b is None:
                continue
            y = 1 if f["outcome"] == "W" else 0
            form.append((y, a - b))
            r = ratings.get(bout) or {}
            if r.get(slug) is not None and r.get(opp) is not None:
                rating.append((y, r[slug] - r[opp]))
    print(f"UFC bouts {args.start} to {min(args.end, as_of)}, both fighters with a Form score")
    report("Form points", form)
    report("BEFN pre-bout rating (reference)", rating)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
