#!/usr/bin/env python3
"""Fit the BEFN rating model 2026-11 constants (RESULTS and BLEND in scripts/ufc_ratings.py) on fights before 2024 only.

Offline and read-only: no provider call, no collector write, no data file written. Prints the constants and the
fit diagnostics; a person pastes them into scripts/ufc_ratings.py. Nothing from 2024 on is used, so
scripts/ufc-rating-evaluate.py can test the frozen model on 2024+ fights honestly.

Step 1, results rating: grid search of the Elo-type parameters on every decided archived UFC bout from 2016 to 2023
(each bout predicted from the bouts before it), minimising log loss.
Step 2, blend: for each quarter from 2019 to 2023 the stats build is re-run as it stood that day (build(...,
before=cutoff)), and each decided bout in the next quarter between two fighters with a results rating and a skills
composite is a case. A two-feature logistic regression (results points / 400, skills composite / 100, no intercept)
on all those cases gives the blend weights.

Owner choices (PR #453, 2026-11-23) are passed as fixed values rather than fitted:
  --fix idle=0.1 --fix title=1.5   hold these results parameters (the rest of the grid is still searched)
  --mix 0.6                        rescale the fitted blend so results carry this share of the spread (skills the
                                   rest), keeping the total spread the same, so the headline's range is unchanged
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import itertools
import json
import math
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIT_FROM, FIT_TO = "2016-01-01", "2024-01-01"
BLEND_FROM = dt.date(2019, 1, 1)
GRID = {"start": [1450, 1500], "k": [32, 48, 64, 80, 96], "boost": [0.0, 1.0, 2.0], "finish": [1.0, 1.25, 1.5],
        "split": [0.5, 0.75, 1.0], "idle": [0.0, 0.1, 0.2, 0.35], "title": [1.0]}


def load_build():
    sys.path.insert(0, str(ROOT / "scripts"))
    spec = importlib.util.spec_from_file_location("ufc_stats_build", ROOT / "scripts/build-ufc-stats.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def logistic(z):
    return 1 / (1 + math.exp(-max(-30.0, min(30.0, z))))


def fit_logistic(xs, ys, iters=60):
    """Logistic regression through the origin (Newton), any small number of features."""
    dim = len(xs[0])
    w = [0.0] * dim
    for _ in range(iters):
        g = [0.0] * dim
        h = [[0.0] * dim for _ in range(dim)]
        for x, y in zip(xs, ys):
            p = logistic(sum(a * b for a, b in zip(w, x)))
            for i in range(dim):
                g[i] += (y - p) * x[i]
                for j in range(dim):
                    h[i][j] += p * (1 - p) * x[i] * x[j]
        step = solve(h, g)
        w = [a + b for a, b in zip(w, step)]
        if max(abs(s) for s in step) < 1e-10:
            break
    return w


def solve(a, b):
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[piv] = m[piv], m[c]
        for r in range(n):
            if r != c and m[c][c]:
                f = m[r][c] / m[c][c]
                m[r] = [x - f * y for x, y in zip(m[r], m[c])]
    return [m[i][n] / m[i][i] if m[i][i] else 0.0 for i in range(n)]


def logloss(ps, ys):
    eps = 1e-9
    return -sum(y * math.log(max(p, eps)) + (1 - y) * math.log(max(1 - p, eps)) for p, y in zip(ps, ys)) / len(ys)


def all_bouts(build_mod, end: dt.date):
    """Every archived UFC bout (active filter lifted), the same list the build feeds the results rating."""
    old = build_mod.ACTIVE_MONTHS
    build_mod.ACTIVE_MONTHS = 10 ** 4
    captured = {}
    real = build_mod.results_bouts

    def spy(per_fighter):
        captured["bouts"] = real(per_fighter)
        return captured["bouts"]
    build_mod.results_bouts = spy
    try:
        with tempfile.TemporaryDirectory() as tmp:
            build_mod.build(end, Path(tmp), None, True)
    finally:
        build_mod.ACTIVE_MONTHS = old
        build_mod.results_bouts = real
    return captured["bouts"]


def fit_results(r, bouts):
    train = [b for b in bouts if b["date"] < FIT_TO]
    best = None
    for vals in itertools.product(*GRID.values()):
        p = dict(zip(GRID, vals))
        _, pre = r.results_walk(train, p)
        rows = [(ra - rb, 1 if b["outcome"] == "W" else 0) for b, ra, rb, na, nb in pre
                if b["outcome"] in ("W", "L") and b["date"] >= FIT_FROM and na and nb]
        ll = logloss([1 / (1 + 10 ** (-d / 400)) for d, _ in rows], [y for _, y in rows])
        if best is None or ll < best[0]:
            best = (ll, p, len(rows))
    return best


def quarter_starts(first, last):
    out, d = [], first
    while d <= last:
        out.append(d)
        m = d.month + 3
        d = dt.date(d.year + (m - 1) // 12, (m - 1) % 12 + 1, 1)
    return out


def snapshot(build_mod, cut):
    with tempfile.TemporaryDirectory() as tmp:
        build_mod.build(cut, Path(tmp), None, True, before=cut)
        out = {}
        for p in (Path(tmp) / "fighters").glob("*.json"):
            d = json.loads(p.read_text(encoding="utf-8"))
            rt = d["ratings"] or {}
            out[d["slug"]] = {"results": (rt.get("results") or {}).get("rating"), "skills": rt.get("skillsComposite")}
        return out


def fit_blend(build_mod, bouts):
    cuts = quarter_starts(BLEND_FROM, dt.date(2023, 10, 1))
    xs, ys = [], []
    for i, cut in enumerate(cuts):
        stop = cuts[i + 1] if i + 1 < len(cuts) else dt.date.fromisoformat(FIT_TO)
        snap = snapshot(build_mod, cut)
        for b in bouts:
            if not (cut.isoformat() <= b["date"] < stop.isoformat()) or b["outcome"] not in ("W", "L"):
                continue
            a, o = snap.get(b["a"]), snap.get(b["b"])
            if not a or not o or None in (a["results"], o["results"], a["skills"], o["skills"]):
                continue
            xs.append([(a["results"] - o["results"]) / 400, (a["skills"] - o["skills"]) / 100])
            ys.append(1 if b["outcome"] == "W" else 0)
    return fit_logistic(xs, ys), len(ys), xs, ys


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fix", action="append", default=[], help="name=value: hold a results parameter (owner choice)")
    ap.add_argument("--mix", type=float, help="share of the spread carried by results, e.g. 0.6")
    args = ap.parse_args()
    for item in args.fix:
        key, value = item.split("=")
        GRID[key] = [float(value)]
    build_mod = load_build()
    r = build_mod.ufc_ratings
    end = dt.date.fromisoformat(json.loads((ROOT / "data/ufc-stats/index.json").read_text())["asOf"])
    bouts = all_bouts(build_mod, end)
    ll, params, n = fit_results(r, bouts)
    print(f"Step 1: results parameters on {n} decided bouts {FIT_FROM} to {FIT_TO} (log loss {ll:.4f})")
    print("RESULTS =", json.dumps(params))
    r.RESULTS.clear()
    r.RESULTS.update(params)
    w, n2, xs, ys = fit_blend(build_mod, bouts)
    print(f"Step 2: blend on {n2} decided bouts, quarters from {BLEND_FROM} to 2023 (walk-forward snapshots)")
    print("BLEND =", json.dumps({"results": round(w[0], 3), "skills": round(w[1], 3)}))
    only_r = fit_logistic([[x[0]] for x in xs], ys)
    only_s = fit_logistic([[x[1]] for x in xs], ys)
    print(f"  log loss: blend {logloss([logistic(w[0] * a + w[1] * b) for a, b in xs], ys):.4f}, "
          f"results only {logloss([logistic(only_r[0] * a) for a, _ in xs], ys):.4f}, "
          f"skills only {logloss([logistic(only_s[0] * b) for _, b in xs], ys):.4f}")
    sd = lambda v: (sum((x - sum(v) / len(v)) ** 2 for x in v) / len(v)) ** .5
    cr, cs = abs(w[0]) * sd([x[0] for x in xs]), abs(w[1]) * sd([x[1] for x in xs])
    print(f"  share of the spread: results {cr / (cr + cs):.0%}, skills {cs / (cr + cs):.0%}")
    if args.mix:
        sr, ss = sd([x[0] for x in xs]), sd([x[1] for x in xs])
        total = cr + cs
        wr, ws = args.mix * total / sr, (1 - args.mix) * total / ss
        print(f"Owner mix {args.mix:.0%} results / {1 - args.mix:.0%} skills, same total spread:")
        print("BLEND =", json.dumps({"results": round(wr, 3), "skills": round(ws, 3)}))
        print(f"  log loss with the owner mix: {logloss([logistic(wr * a + ws * b) for a, b in xs], ys):.4f} "
              f"(fitted mix {logloss([logistic(w[0] * a + w[1] * b) for a, b in xs], ys):.4f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
