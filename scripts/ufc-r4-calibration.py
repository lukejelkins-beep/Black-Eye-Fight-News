#!/usr/bin/env python3
"""R4 research: walk-forward calibration of the BEFN rating (scripts/ufc_ratings.py) against what happened next.

RESEARCH ONLY. Nothing here is shown on the site, changes a rating, or approves a release (tracker #171, R4). Offline
and read-only: no provider call, no collector write.

Method
  * For each quarterly cutoff the stats build is re-run as it stood on that day (`build(..., before=cutoff)`: fights from
    the cutoff on are left out), so every rating uses only earlier fights, with the production algorithm unchanged.
  * Every decided UFC fight in the next quarter between two fighters in that build is a test case. A fight is scored with
    p(A wins) = logistic(k * (rating A - rating B) / 100). k is fitted only on EARLIER quarters (walk-forward), one
    parameter, no intercept, so the model cannot memorise.
  * Baselines on the same fights: a coin flip, the career win rate, and recent form alone.
  * Reported: coverage, accuracy, Brier score, log loss, calibration bins, and the same by pair type (both established
    ratings, any provisional rating), division, sex and year, with groups under MIN_GROUP fights pooled and flagged.
  * No-contests and draws are not scored; they are counted.
Output: Markdown to stdout or --out. Deterministic (fixed bootstrap seed).
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import math
import random
import tempfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MIN_GROUP = 30
BINS = ((0.0, 0.4), (0.4, 0.5), (0.5, 0.6), (0.6, 0.7), (0.7, 1.01))


def load_stats_module():
    spec = importlib.util.spec_from_file_location("ufc_stats_build", ROOT / "scripts/build-ufc-stats.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def quarter_starts(first: dt.date, last: dt.date) -> list:
    out, d = [], first
    while d <= last:
        out.append(d)
        month = d.month + 3
        d = dt.date(d.year + (month - 1) // 12, (month - 1) % 12 + 1, 1)
    return out


def truth_fights(stats_dir: Path) -> list:
    """Decided and undecided fights between two fighters in the current build, one row per bout."""
    rows, seen = [], set()
    for p in sorted((stats_dir / "fighters").glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        for f in d["fights"]:
            slug_b = f.get("opponentSlug")
            if not slug_b or f["boutId"] in seen:
                continue
            seen.add(f["boutId"])
            rows.append({"bout": f["boutId"], "date": f["date"], "a": d["slug"], "b": slug_b, "outcome": f["outcome"]})
    return sorted(rows, key=lambda r: (r["date"], r["bout"]))


def snapshot(mod, cutoff: dt.date) -> dict:
    """slug -> {overall, form, winrate, status, division, sex} from the stats as they stood on `cutoff`."""
    with tempfile.TemporaryDirectory() as tmp:
        mod.build(cutoff, Path(tmp), None, True, before=cutoff)
        out = {}
        for p in (Path(tmp) / "fighters").glob("*.json"):
            d = json.loads(p.read_text(encoding="utf-8"))
            r, c = d["ratings"], d["windows"]["career"]
            decided = c["W"] + c["L"]
            out[d["slug"]] = {
                "overall": r.get("overall"), "form": (r.get("form") or {}).get("score"),
                "winrate": c["W"] / decided if decided else None, "stat": (r.get("sample") or {}).get("statFights", 0),
                "status": "established" if r.get("eligible") else "provisional" if r.get("provisional") else "none",
                "division": d.get("divisionSlug"),
                "sex": "women" if str(d.get("divisionSlug") or "").startswith("womens") else "men" if d.get("divisionSlug") else None,
            }
        return out


def logistic(z: float) -> float:
    return 1 / (1 + math.exp(-max(-30.0, min(30.0, z))))


def fit_k(cases: list, feature: str) -> float:
    """Maximum-likelihood slope through the origin on (feature difference / 100), by Newton steps; 0 when no data."""
    xs = [(c[feature] / 100.0, c["y"]) for c in cases if c.get(feature) is not None]
    if len(xs) < 20:
        return 0.0
    k = 0.0
    for _ in range(50):
        g = sum((y - logistic(k * x)) * x for x, y in xs)
        h = -sum(logistic(k * x) * (1 - logistic(k * x)) * x * x for x, y in xs)
        if h == 0:
            break
        step = g / h
        k -= step
        if abs(step) < 1e-9:
            break
    return k


def score(ps: list, ys: list) -> dict:
    n = len(ys)
    if not n:
        return {"n": 0}
    eps = 1e-6
    return {"n": n,
            "acc": sum(1 for p, y in zip(ps, ys) if (p > 0.5) == (y == 1) and p != 0.5) / n + sum(0.5 for p in ps if p == 0.5) / n,
            "brier": sum((p - y) ** 2 for p, y in zip(ps, ys)) / n,
            "logloss": -sum(y * math.log(max(p, eps)) + (1 - y) * math.log(max(1 - p, eps)) for p, y in zip(ps, ys)) / n}


def bootstrap_diff(a: list, b: list, ys: list, reps: int = 1000, seed: int = 7) -> tuple:
    """95% interval for mean Brier(b) - mean Brier(a) (positive: a is better), paired bootstrap."""
    rnd, n, diffs = random.Random(seed), len(ys), []
    if n < 2:
        return (None, None)
    d = [(pb - y) ** 2 - (pa - y) ** 2 for pa, pb, y in zip(a, b, ys)]
    for _ in range(reps):
        diffs.append(sum(d[rnd.randrange(n)] for _ in range(n)) / n)
    diffs.sort()
    return diffs[int(0.025 * reps)], diffs[int(0.975 * reps) - 1]


def evaluate(truth: list, snaps: dict, cutoffs: list, end: dt.date) -> dict:
    folds, cases_all, notscored = [], [], defaultdict(int)
    for i, cut in enumerate(cutoffs):
        stop = cutoffs[i + 1] if i + 1 < len(cutoffs) else end + dt.timedelta(days=1)
        snap = snaps[cut]
        fold = []
        for t in truth:
            if not (cut.isoformat() <= t["date"] < stop.isoformat()):
                continue
            if t["outcome"] not in ("W", "L"):
                notscored[t["outcome"]] += 1
                continue
            a, b = snap.get(t["a"]), snap.get(t["b"])
            if not a or not b:
                notscored["not in the roster at the cutoff"] += 1
                continue
            row = {"y": 1 if t["outcome"] == "W" else 0, "date": t["date"], "cut": cut,
                   "division": a["division"] if a["division"] == b["division"] else "(different divisions)",
                   "sex": a["sex"] if a["sex"] == b["sex"] else None,
                   "pair": ("established" if a["status"] == b["status"] == "established" else
                            "any provisional" if "none" not in (a["status"], b["status"]) else "unrated"),
                   "depth": ("1-2 measured fights" if min(a["stat"], b["stat"]) < 3 else
                             "3-5" if min(a["stat"], b["stat"]) < 6 else "6 or more"),
                   "overall": None if None in (a["overall"], b["overall"]) else a["overall"] - b["overall"],
                   "form": None if None in (a["form"], b["form"]) else a["form"] - b["form"],
                   "winrate": None if None in (a["winrate"], b["winrate"]) else 100 * (a["winrate"] - b["winrate"])}
            fold.append(row)
        folds.append(fold)
        cases_all.append(fold)
    tested = []
    for i, fold in enumerate(folds):
        train = [c for f in folds[:i] for c in f]
        if len(train) < 100:           # no honest fit yet: the first quarters only train
            continue
        ks = {f: fit_k(train, f) for f in ("overall", "form", "winrate")}
        for c in fold:
            c["k"] = ks
            tested.append(c)
    return {"tested": tested, "notscored": dict(notscored), "folds": [len(f) for f in folds]}


def table(rows: list, title: str) -> str:
    out = [f"\n#### {title}\n", "| Group | Fights | Accuracy (95% range) | Brier | Log loss |", "|---|---:|---:|---:|---:|"]
    for name, s in rows:
        if s["n"]:
            flag = "" if s["n"] >= MIN_GROUP else " (small)"
            pm = 1.96 * math.sqrt(max(s["acc"] * (1 - s["acc"]), 1e-9) / s["n"])
            out.append(f"| {name}{flag} | {s['n']} | {s['acc']:.3f} ± {pm:.3f} | {s['brier']:.3f} | {s['logloss']:.3f} |")
    return "\n".join(out)


def report(result: dict, cutoffs: list, end: dt.date) -> str:
    tested = result["tested"]
    covered = [c for c in tested if c["overall"] is not None]
    ys = [c["y"] for c in covered]
    p_model = [logistic(c["k"]["overall"] * c["overall"] / 100) for c in covered]
    p_flat = [0.5] * len(covered)
    have_w = [c for c in covered if c["winrate"] is not None]
    have_f = [c for c in covered if c["form"] is not None]
    lines = ["# UFC rating calibration (R4 research, walk-forward)", "",
             "Research only. Nothing here is on the site, changes a rating or approves a release (tracker #171, R4).", "",
             f"Cutoffs: {', '.join(c.isoformat() for c in cutoffs)}. Test period to {end.isoformat()}. "
             "Each quarter's ratings use only fights before it; the slope is fitted on earlier quarters only.", ""]
    lines += [f"- Fights per quarter (decided, both in the roster): {result['folds']}",
              f"- Scored (a fitted slope exists and both fighters have an overall rating): **{len(covered)}** "
              f"of {len(tested)} decided test fights ({100 * len(covered) / max(len(tested), 1):.0f}% coverage)",
              f"- Not scored: {json.dumps(result['notscored'])}", ""]
    m, c0 = score(p_model, ys), score(p_flat, ys)
    lo, hi = bootstrap_diff(p_model, p_flat, ys)
    lines += ["### Overall", "", "| Model | Fights | Accuracy | Brier | Log loss |", "|---|---:|---:|---:|---:|",
              f"| Coin flip | {c0['n']} | {c0['acc']:.3f} | {c0['brier']:.3f} | {c0['logloss']:.3f} |",
              f"| BEFN overall rating | {m['n']} | {m['acc']:.3f} | {m['brier']:.3f} | {m['logloss']:.3f} |"]
    for label, rows, feat in (("Career win rate", have_w, "winrate"), ("Recent form alone", have_f, "form")):
        if rows:
            pr = [logistic(c["k"][feat] * c[feat] / 100) for c in rows]
            s = score(pr, [c["y"] for c in rows])
            lines.append(f"| {label} | {s['n']} | {s['acc']:.3f} | {s['brier']:.3f} | {s['logloss']:.3f} |")
    if lo is not None:
        lines += ["", f"Brier improvement over a coin flip (positive is better): {c0['brier'] - m['brier']:+.4f}, "
                  f"95% interval {lo:+.4f} to {hi:+.4f} (paired bootstrap).", ""]
    if have_w:
        pw = [logistic(c["k"]["winrate"] * c["winrate"] / 100) for c in have_w]
        pm_ = [logistic(c["k"]["overall"] * c["overall"] / 100) for c in have_w]
        lo2, hi2 = bootstrap_diff(pm_, pw, [c["y"] for c in have_w])
        lines += [f"Brier improvement over the career win rate (positive is better): "
                  f"{score(pw, [c['y'] for c in have_w])['brier'] - score(pm_, [c['y'] for c in have_w])['brier']:+.4f}, "
                  f"95% interval {lo2:+.4f} to {hi2:+.4f}.", ""]
    # calibration bins
    lines += ["### Calibration (does a 70% call win about 70%?)", "", "| Predicted | Fights | Mean predicted | Observed win rate |", "|---|---:|---:|---:|"]
    for lo_b, hi_b in BINS:
        idx = [i for i, p in enumerate(p_model) if lo_b <= p < hi_b]
        if idx:
            lines.append(f"| {lo_b:.1f} to {min(hi_b, 1.0):.1f} | {len(idx)} | {sum(p_model[i] for i in idx) / len(idx):.3f} | "
                         f"{sum(ys[i] for i in idx) / len(idx):.3f} |")
    def grouped(key, title):
        g = defaultdict(list)
        for c, p in zip(covered, p_model):
            g[key(c)].append((p, c["y"]))
        rows = [(name, score([x[0] for x in v], [x[1] for x in v])) for name, v in sorted(g.items(), key=lambda kv: str(kv[0])) if name]
        return table(rows, title)
    lines += ["", "### By sample size of the ratings", grouped(lambda c: c["pair"], "Pair type"),
              grouped(lambda c: c["depth"], "Fewer measured fights of the two fighters"),
              "", "### Fairness checks", grouped(lambda c: c["sex"], "Sex (men's / women's divisions)"),
              grouped(lambda c: c["date"][:4], "Year"), grouped(lambda c: c["division"], "Division")]
    # pooled small divisions
    return "\n".join(x for x in lines if x is not None)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--first", default="2024-01-01")
    ap.add_argument("--end", default=None, help="last test day (default: the stats build's as-of date)")
    ap.add_argument("--out")
    args = ap.parse_args()
    stats_dir = DATA / "ufc-stats"
    end = dt.date.fromisoformat(args.end or json.loads((stats_dir / "index.json").read_text())["asOf"])
    cutoffs = quarter_starts(dt.date.fromisoformat(args.first), end - dt.timedelta(days=45))
    mod = load_stats_module()
    snaps = {c: snapshot(mod, c) for c in cutoffs}
    text = report(evaluate(truth_fights(stats_dir), snaps, cutoffs, end), cutoffs, end) + "\n"
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
