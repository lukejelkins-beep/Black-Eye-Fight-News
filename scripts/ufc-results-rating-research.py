#!/usr/bin/env python3
"""Research: a results-based UFC strength rating (who you beat, how, and how strong they were) against the live rating.

RESEARCH ONLY. Nothing here is shown on the site, changes a rating or approves a release (tracker #171, R4). Offline and
read-only: no provider call, no collector write. Question asked by the owner on 2026-11-23: the live BEFN rating puts
champions low (Sean Strickland 40, Carlos Ulberg 61) because it measures how much of each thing a fighter does, not
whom they beat. Does a rating built on results and opponent strength describe fighters better, judged objectively?

Method
  * Every archived UFC bout (the stats build run once with the active filter lifted, so fighters who left are kept).
  * Elo-type rating, updated in date order. Each fight moves both fighters by K * margin * (result - expected), so
    beating a strong opponent gains a lot and losing to a weak one costs a lot. Margin: a finish counts more than a
    unanimous decision, a split or majority decision less. K is larger for a fighter's first fights (less is known).
    Draws count as half a win. No-contests are skipped.
  * Parameters are chosen ONLY on fights before 2024 (grid search, log loss). They are then frozen and the rating is
    scored on every decided fight from 2024 on using only the fights before each one (walk-forward by construction).
  * The live rating and the career win rate are scored on the same 2024+ fights exactly as in
    scripts/ufc-r4-calibration.py (quarterly rebuilds, one slope fitted on earlier quarters only), so the comparison is
    like for like. A blend (results rating + live rating) is also fitted walk-forward to see whether the measured skills
    add anything once results are known.
Output: Markdown to stdout or --out. Deterministic.

Historical: written against the ratings v2 engine (commit e60369c), where "overall" was the 0-100 skills-and-form
average. On later commits "overall" is the 2026-11 blended rating; use scripts/ufc-rating-evaluate.py instead.
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import itertools
import json
import math
import tempfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
TEST_FROM = "2024-01-01"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def all_bouts(stats_mod, end: dt.date) -> list:
    """One row per archived UFC bout, from fighter A's side: date, a, b, outcome, method, decision type."""
    old = stats_mod.ACTIVE_MONTHS
    stats_mod.ACTIVE_MONTHS = 10 ** 4
    rows, seen = [], set()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            stats_mod.build(end, Path(tmp), None, True)
            for p in sorted((Path(tmp) / "fighters").glob("*.json")):
                d = json.loads(p.read_text(encoding="utf-8"))
                for f in d["fights"]:
                    if not f.get("opponentSlug") or f["boutId"] in seen:
                        continue
                    seen.add(f["boutId"])
                    rows.append({"bout": f["boutId"], "date": f["date"], "a": d["slug"], "b": f["opponentSlug"],
                                 "outcome": f["outcome"], "method": f.get("method"),
                                 "detail": (f.get("methodDetail") or "").lower(), "title": bool(f.get("titleFight"))})
    finally:
        stats_mod.ACTIVE_MONTHS = old
    return sorted(rows, key=lambda r: (r["date"], r["bout"]))


def margin(row, p) -> float:
    if row["outcome"] in ("D",) or row["method"] == "draw":
        return 1.0
    if row["method"] in ("ko", "sub"):
        return p["finish"]
    if row["method"] == "dec" and row["detail"] in ("split", "majority"):
        return p["split"]
    return 1.0


def run_elo(bouts: list, p: dict):
    """Walk through bouts in order. Returns (pre-fight rows, final ratings, fight counts, last fight date)."""
    rating, count, last = {}, defaultdict(int), {}
    pre = []
    for r in bouts:
        if r["outcome"] not in ("W", "L", "D"):
            continue
        a, b = r["a"], r["b"]
        ra, rb = rating.get(a, p["start"]), rating.get(b, p["start"])
        e = 1 / (1 + 10 ** ((rb - ra) / 400))
        pre.append({**r, "diff": ra - rb, "na": count[a], "nb": count[b]})
        y = 1.0 if r["outcome"] == "W" else 0.0 if r["outcome"] == "L" else 0.5
        m = margin(r, p)
        ka = p["k"] * (1 + p["boost"] / (count[a] + 1))
        kb = p["k"] * (1 + p["boost"] / (count[b] + 1))
        rating[a] = ra + ka * m * (y - e)
        rating[b] = rb - kb * m * (y - e)
        count[a] += 1
        count[b] += 1
        last[a] = last[b] = r["date"]
    return pre, rating, count, last


def logistic(z):
    return 1 / (1 + math.exp(-max(-30.0, min(30.0, z))))


def fit_slopes(xs: list, ys: list) -> list:
    """Logistic regression through the origin on one or more features (Newton steps)."""
    dim = len(xs[0]) if xs else 0
    w = [0.0] * dim
    for _ in range(60):
        g = [0.0] * dim
        h = [[0.0] * dim for _ in range(dim)]
        for x, y in zip(xs, ys):
            pr = logistic(sum(wi * xi for wi, xi in zip(w, x)))
            for i in range(dim):
                g[i] += (y - pr) * x[i]
                for j in range(dim):
                    h[i][j] -= pr * (1 - pr) * x[i] * x[j]
        # solve h * step = g (dim <= 2)
        if dim == 1:
            if h[0][0] == 0:
                break
            step = [g[0] / h[0][0]]
        else:
            det = h[0][0] * h[1][1] - h[0][1] * h[1][0]
            if det == 0:
                break
            step = [(g[0] * h[1][1] - g[1] * h[0][1]) / det, (h[0][0] * g[1] - h[1][0] * g[0]) / det]
        w = [wi - si for wi, si in zip(w, step)]
        if max(abs(s) for s in step) < 1e-9:
            break
    return w


def score(ps, ys):
    n = len(ys)
    eps = 1e-6
    return {"n": n, "acc": sum((p > .5) == (y == 1) for p, y in zip(ps, ys)) / n,
            "brier": sum((p - y) ** 2 for p, y in zip(ps, ys)) / n,
            "logloss": -sum(y * math.log(max(p, eps)) + (1 - y) * math.log(max(1 - p, eps)) for p, y in zip(ps, ys)) / n}


def elo_prob(diff):
    return 1 / (1 + 10 ** (-diff / 400))


def train_logloss(pre):
    rows = [r for r in pre if r["outcome"] in ("W", "L") and "2016-01-01" <= r["date"] < TEST_FROM and r["na"] and r["nb"]]
    ys = [1 if r["outcome"] == "W" else 0 for r in rows]
    return score([elo_prob(r["diff"]) for r in rows], ys)["logloss"], len(rows)


GRID = {"start": [1500], "k": [24, 32, 40, 48, 64], "boost": [0, 1, 2, 3], "finish": [1.0, 1.25, 1.5, 1.75],
        "split": [0.5, 0.75, 1.0]}


def choose_params(bouts):
    best = None
    for vals in itertools.product(*GRID.values()):
        p = dict(zip(GRID.keys(), vals))
        ll, n = train_logloss(run_elo(bouts, p)[0])
        if best is None or ll < best[0]:
            best = (ll, p, n)
    return best


def bootstrap_diff(a, b, ys, reps=1000, seed=7):
    import random
    rnd, n = random.Random(seed), len(ys)
    d = [(pb - y) ** 2 - (pa - y) ** 2 for pa, pb, y in zip(a, b, ys)]
    diffs = sorted(sum(d[rnd.randrange(n)] for _ in range(n)) / n for _ in range(reps))
    return diffs[int(.025 * reps)], diffs[int(.975 * reps) - 1]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out")
    ap.add_argument("--json", help="write current ratings for the active roster here")
    args = ap.parse_args()
    stats_dir = DATA / "ufc-stats"
    end = dt.date.fromisoformat(json.loads((stats_dir / "index.json").read_text())["asOf"])
    stats_mod = _load("ufc_stats_build", ROOT / "scripts/build-ufc-stats.py")
    r4 = _load("ufc_r4", ROOT / "scripts/ufc-r4-calibration.py")

    bouts = all_bouts(stats_mod, end)
    train_ll, params, n_train = choose_params(bouts)
    pre, rating, count, last = run_elo(bouts, params)
    pre_by_bout = {r["bout"]: r for r in pre}

    # Live rating on the same test fights, exactly as the R4 study scores it.
    cutoffs = r4.quarter_starts(dt.date.fromisoformat(TEST_FROM), end - dt.timedelta(days=45))
    snaps = {c: r4.snapshot(stats_mod, c) for c in cutoffs}
    truth = [{"bout": b["bout"], "date": b["date"], "a": b["a"], "b": b["b"], "outcome": b["outcome"]} for b in bouts]
    ev = r4.evaluate(truth, snaps, cutoffs, end)
    cases = []
    # evaluate() drops a/b from rows; recompute the pairing in the same order
    rows_ab = []
    for i, cut in enumerate(cutoffs):
        stop = cutoffs[i + 1] if i + 1 < len(cutoffs) else end + dt.timedelta(days=1)
        for t in truth:
            if cut.isoformat() <= t["date"] < stop.isoformat() and t["outcome"] in ("W", "L") \
                    and snaps[cut].get(t["a"]) and snaps[cut].get(t["b"]):
                rows_ab.append((cut, t))
    # evaluate() appends rows in exactly this order, then skips the first folds that have too little training data
    all_rows = []
    folds = defaultdict(list)
    for cut, t in rows_ab:
        folds[cut].append(t)
    for i, cut in enumerate(cutoffs):
        train_n = sum(len(folds[c]) for c in cutoffs[:i])
        if train_n < 100:
            continue
        all_rows.extend((cut, t) for t in folds[cut])
    assert len(all_rows) == len(ev["tested"]), (len(all_rows), len(ev["tested"]))
    for (cut, t), c in zip(all_rows, ev["tested"]):
        e = pre_by_bout.get(t["bout"])
        if c["overall"] is None or c["winrate"] is None or e is None:
            continue
        cases.append({**c, "elo": e["diff"], "na": e["na"], "nb": e["nb"], "a": t["a"], "b": t["b"], "dt": t["date"]})

    # Walk-forward slopes per quarter for the results rating and the blend (same rule as R4: earlier quarters only;
    # quarters with <100 earlier test cases use all pre-2024 fights as the training set for the results rating).
    pre_train = [r for r in pre if r["outcome"] in ("W", "L") and r["date"] < TEST_FROM and r["na"] and r["nb"]]
    ys, p_live, p_win, p_elo, p_blend, p_raw = [], [], [], [], [], []
    for i, cut in enumerate(cutoffs):
        fold = [c for c in cases if c["cut"] == cut]
        earlier = [c for c in cases if c["cut"] < cut]
        tr_elo = [[r["diff"] / 400] for r in pre_train] + [[c["elo"] / 400] for c in earlier]
        tr_y = [1 if r["outcome"] == "W" else 0 for r in pre_train] + [c["y"] for c in earlier]
        k_elo = fit_slopes(tr_elo, tr_y)[0]
        if len(earlier) >= 100:
            w_blend = fit_slopes([[c["elo"] / 400, c["overall"] / 100] for c in earlier], [c["y"] for c in earlier])
        else:
            w_blend = None
        for c in fold:
            ys.append(c["y"])
            p_live.append(logistic(c["k"]["overall"] * c["overall"] / 100))
            p_win.append(logistic(c["k"]["winrate"] * c["winrate"] / 100))
            p_elo.append(logistic(k_elo * c["elo"] / 400))
            p_raw.append(elo_prob(c["elo"]))
            p_blend.append(logistic(w_blend[0] * c["elo"] / 400 + w_blend[1] * c["overall"] / 100) if w_blend else None)

    have_blend = [i for i, p in enumerate(p_blend) if p is not None]
    final_w = fit_slopes([[c["elo"] / 400, c["overall"] / 100] for c in cases], [c["y"] for c in cases])
    out = ["# Results-based strength rating: research (23 November 2026)", "",
           "**Research only. Nothing here changes a rating or the site.** Reproduce: "
           "`python3 scripts/ufc-results-rating-research.py`.", "",
           f"Archived UFC bouts: {len(bouts)} (all fighters, including those who have left). "
           f"Parameters chosen on {n_train} decided fights from 2016 to 2023 only (log loss {train_ll:.4f}): "
           f"`{json.dumps(params)}`. Then frozen.", "",
           f"## Same test fights as the R4 study (from {TEST_FROM}, walk-forward)", "",
           "| Model | Fights | Accuracy | Brier | Log loss |", "|---|---:|---:|---:|---:|",
           ]
    for label, ps in (("Coin flip", [.5] * len(ys)), ("Career win rate", p_win), ("Live BEFN overall rating", p_live),
                      ("Results rating (Elo scale, no fitting)", p_raw), ("Results rating (slope fitted walk-forward)", p_elo)):
        s = score(ps, ys)
        out.append(f"| {label} | {s['n']} | {s['acc']:.3f} | {s['brier']:.4f} | {s['logloss']:.4f} |")
    if have_blend:
        yb = [ys[i] for i in have_blend]
        sb = score([p_blend[i] for i in have_blend], yb)
        se = score([p_elo[i] for i in have_blend], yb)
        out.append(f"| Blend: results + live rating (fitted walk-forward; {sb['n']} fights) | {sb['n']} | {sb['acc']:.3f} | "
                   f"{sb['brier']:.4f} | {sb['logloss']:.4f} |")
        out.append(f"| Results rating on those same {se['n']} fights | {se['n']} | {se['acc']:.3f} | {se['brier']:.4f} | "
                   f"{se['logloss']:.4f} |")
        sl = score([p_live[i] for i in have_blend], yb)
        out.append(f"| Live BEFN rating on those same {sl['n']} fights | {sl['n']} | {sl['acc']:.3f} | {sl['brier']:.4f} | "
                   f"{sl['logloss']:.4f} |")
    lo, hi = bootstrap_diff(p_elo, p_live, ys)
    lo2, hi2 = bootstrap_diff(p_elo, p_win, ys)
    out += ["", f"- Brier improvement of the results rating over the live rating: "
            f"{score(p_live, ys)['brier'] - score(p_elo, ys)['brier']:+.4f} (95% interval {lo:+.4f} to {hi:+.4f}).",
            f"- Over the career win rate: {score(p_win, ys)['brier'] - score(p_elo, ys)['brier']:+.4f} "
            f"(95% interval {lo2:+.4f} to {hi2:+.4f}).", ""]
    if have_blend:
        lo3, hi3 = bootstrap_diff([p_blend[i] for i in have_blend], [p_elo[i] for i in have_blend], [ys[i] for i in have_blend])
        out.append(f"- Does adding the live (skills) rating to the results rating help? Brier change "
                   f"{score([p_elo[i] for i in have_blend], [ys[i] for i in have_blend])['brier'] - score([p_blend[i] for i in have_blend], [ys[i] for i in have_blend])['brier']:+.4f} "
                   f"(95% interval {lo3:+.4f} to {hi3:+.4f}).")
    if have_blend:
        lo4, hi4 = bootstrap_diff([p_blend[i] for i in have_blend], [p_live[i] for i in have_blend], [ys[i] for i in have_blend])
        out.append(f"- Does adding the results rating to the live rating help? Brier change "
                   f"{score([p_live[i] for i in have_blend], [ys[i] for i in have_blend])['brier'] - score([p_blend[i] for i in have_blend], [ys[i] for i in have_blend])['brier']:+.4f} "
                   f"(95% interval {lo4:+.4f} to {hi4:+.4f}).")
        out.append(f"- Blend weights fitted on all {len(cases)} test fights (for design only, not used to score): "
                   f"{final_w[0]:.3f} per 400 results points, {final_w[1]:.3f} per 100 live-rating points.")
    # calibration of the fitted results rating
    out += ["", "### Calibration of the results rating", "", "| Predicted | Fights | Mean predicted | Observed |", "|---|---:|---:|---:|"]
    for lo_b, hi_b in ((0, .4), (.4, .5), (.5, .6), (.6, .7), (.7, 1.01)):
        idx = [i for i, p in enumerate(p_elo) if lo_b <= p < hi_b]
        if idx:
            out.append(f"| {lo_b:.1f} to {min(hi_b, 1):.1f} | {len(idx)} | {sum(p_elo[i] for i in idx) / len(idx):.3f} | "
                       f"{sum(ys[i] for i in idx) / len(idx):.3f} |")

    # Current ratings for the active roster
    active = {}
    for p in (stats_dir / "fighters").glob("*.json"):
        d = json.loads(p.read_text(encoding="utf-8"))
        active[d["slug"]] = d
    rated = {s: rating[s] for s in active if count.get(s, 0) >= 3}
    vals = sorted(rated.values())

    def pct(v):
        below = sum(1 for x in vals if x < v)
        eq = sum(1 for x in vals if x == v)
        return max(1, min(99, round(100 * (below + eq / 2) / len(vals))))

    table = []
    for s, v in rated.items():
        d = active[s]
        table.append({"slug": s, "name": d["name"], "division": d.get("divisionSlug"), "champion": bool(d.get("champion")),
                      "rank": d.get("officialRank"), "elo": round(v), "pct": pct(v), "fights": count[s],
                      "live": (d.get("ratings") or {}).get("overall")})
    table.sort(key=lambda r: -r["elo"])
    out += ["", f"## Current results rating, active roster ({len(rated)} fighters with 3+ archived UFC fights)", "",
            "### Champions", "", "| Fighter | Division | Results rating | Percentile | Live BEFN |", "|---|---|---:|---:|---:|"]
    for r in [r for r in table if r["champion"]]:
        out.append(f"| {r['name']} | {r['division']} | {r['elo']} | {r['pct']} | {r['live']} |")
    out += ["", "### Top 25", "", "| # | Fighter | Division | Results rating | Live BEFN | UFC rank |", "|---:|---|---|---:|---:|---|"]
    for i, r in enumerate(table[:25], 1):
        out.append(f"| {i} | {r['name']} | {r['division']} | {r['elo']} | {r['live']} | "
                   f"{'C' if r['champion'] else r['rank'] if r['rank'] is not None else ''} |")
    # agreement with the official rankings
    ranked = [r for r in table if r["rank"] is not None or r["champion"]]
    out += ["", f"Ranked or champion fighters in the top 100 by results rating: "
            f"{sum(1 for r in table[:100] if r['rank'] is not None or r['champion'])} of 100 "
            f"(live rating top 100: {sum(1 for r in sorted([x for x in table if x['live'] is not None], key=lambda x: -x['live'])[:100] if r['rank'] is not None or r['champion'])} of 100).", ""]
    text = "\n".join(out) + "\n"
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        print(text)
    if args.json:
        Path(args.json).write_text(json.dumps(table, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
