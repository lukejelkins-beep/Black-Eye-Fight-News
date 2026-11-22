#!/usr/bin/env python3
"""Held-out test: does adjusting a fighter's rates for the opponents they faced tell us more?

Offline research. Reads `data/ufc-stats/fighters/*.json` only, calls no provider, writes no file and
belongs to no workflow. Run it by hand when the question comes up again:

    python3 scripts/evaluate-opponent-adjustment.py

The question. The rating engine (`scripts/ufc_ratings.py`, ported from `assets/fighter-power-index.js`)
adjusts exactly one thing for opponent strength: recent form, by at most +/-25% of a win. Everything
else - strikes landed, absorbed, takedowns - is counted the same whoever it was against. Should the
adjustment go further?

How it is tested. For each cutoff date, every fighter's measured fights strictly before the cutoff are
the history, and their first measured fight on or after it is the target. Each model predicts the
fighter's significant strikes landed (and absorbed) per minute of cage time in that target fight, and
is scored by mean absolute error, root mean squared error and the rank correlation with what actually
happened. Nothing after the cutoff is ever used to build a prediction, and when a past fight is being
adjusted the opponent's record for that same fight is left out.

The models.
  league       the league mean. Knows nothing about the fighter, and is the bar a model must clear.
  raw5         the mean of the fighter's last five fights, which is what the card shows today.
  rawW         the whole career, recency-weighted (18-month half-life), which is what the rating uses.
  adjW         rawW with each fight divided by what that opponent normally allows, so the result is
               the fighter's rate against a typical opponent.
  adjWxOpp     adjW scaled back up by what the NEXT opponent normally allows. A fight preview knows
               who the fight is against, so this is information we hold - but it is a forecast of one
               bout, not a description of a career.
Each adjusted model comes in two flavours: `_lg` measures an opponent against the whole league, and
`_div` against that opponent's own division, so that "hard to hit" does not just mean "flyweight".
Opponent factors are shrunk toward 1 by n/(n+SHRINK_K) so three fights cannot make an extreme.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import pathlib
import statistics

ROOT = pathlib.Path(__file__).resolve().parents[1]
HALF_LIFE_DAYS = 548        # same 18-month half-life as the stats build's weighted window
SHRINK_K = 3.0              # an opponent factor is pulled toward 1 until the opponent has fights
MIN_HISTORY = 3             # a fighter (and the target's opponent) needs this many measured fights
MIN_DIVISION_FIGHTS = 20    # a division mean needs this many measured fights to be used
CUTOFFS = ("2024-11-21", "2025-05-21", "2025-11-21", "2026-05-21")
MODELS = ("league", "raw5", "rawW", "adjW_lg", "adjWxOpp_lg", "adjW_div", "adjWxOpp_div")


def load_fighters(stats_dir: pathlib.Path) -> dict:
    """slug -> {name, division, fights: newest first}; one fight is a rate per minute for both sides."""
    out = {}
    for path in sorted(stats_dir.glob("*.json")):
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if d.get("slug") != path.stem:
            continue        # a stale copy ("name 2.json"), not a fighter
        landed_at = d["roundFields"].index("sigLanded")
        fights = []
        for f in d.get("fights", []):
            if not (f.get("statsComplete") and f.get("rounds") and f.get("seconds")):
                continue
            minutes = f["seconds"] / 60
            if minutes <= 0:
                continue
            own = sum((r[2][landed_at] or 0) for r in f["rounds"])
            against = sum((r[3][landed_at] or 0) for r in f["rounds"])
            fights.append({"date": dt.date.fromisoformat(f["date"]), "opponent": f.get("opponentSlug"),
                           "landed": own / minutes, "absorbed": against / minutes})
        if fights:
            out[d["slug"]] = {"name": d.get("name"), "division": d.get("divisionSlug"),
                              "fights": sorted(fights, key=lambda x: x["date"], reverse=True)}
    return out


def opponent_factor(fights: list[dict], key: str, base: float, exclude: dt.date | None = None) -> float:
    """What this opponent normally allows (or lands), as a multiple of `base`, shrunk toward 1.

    `exclude` drops the fight being adjusted, so a fighter's own big night never becomes the evidence
    that their opponent is easy to hit."""
    rows = [f for f in fights if f["date"] != exclude]
    if len(rows) < 2 or not base:
        return 1.0
    n = len(rows)
    return 1.0 + ((statistics.fmean(f[key] for f in rows) / base) - 1.0) * (n / (n + SHRINK_K))


def recency_weights(fights: list[dict], as_of: dt.date) -> list[float]:
    return [math.pow(0.5, max((as_of - f["date"]).days, 0) / HALF_LIFE_DAYS) for f in fights]


def weighted_mean(values, weights):
    total = sum(weights)
    return sum(v * w for v, w in zip(values, weights)) / total if total else None


def means(history: dict, key: str, divisions: dict) -> tuple[float, dict]:
    """League mean of `key` and, where there is enough of it, each division's mean."""
    rows = [f[key] for fs in history.values() for f in fs]
    league = statistics.fmean(rows) if rows else 0.0
    by_division: dict[str, list[float]] = {}
    for slug, fs in history.items():
        if divisions.get(slug):
            by_division.setdefault(divisions[slug], []).extend(f[key] for f in fs)
    return league, {k: statistics.fmean(v) for k, v in by_division.items() if len(v) >= MIN_DIVISION_FIGHTS}


def spearman(xs, ys) -> float:
    def ranked(values):
        order = sorted(range(len(values)), key=lambda i: values[i])
        out = [0.0] * len(values)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
                j += 1
            for k in range(i, j + 1):
                out[order[k]] = (i + j) / 2 + 1
            i = j + 1
        return out
    rx, ry = ranked(xs), ranked(ys)
    mx, my = statistics.fmean(rx), statistics.fmean(ry)
    top = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    bottom = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return top / bottom if bottom else 0.0


def predictions(data: dict, cutoff: dt.date, metric: str) -> list[dict]:
    """One row per fighter with a fight on or after the cutoff: every model's number, and the truth."""
    other = "absorbed" if metric == "landed" else "landed"
    divisions = {s: v["division"] for s, v in data.items()}
    history = {s: [f for f in v["fights"] if f["date"] < cutoff] for s, v in data.items()}
    league_other, division_other = means(history, other, divisions)

    rows = []
    for slug, v in data.items():
        past = history[slug]
        later = [f for f in v["fights"] if f["date"] >= cutoff]
        if len(past) < MIN_HISTORY or not later:
            continue
        target = later[-1]                                  # the first fight after the cutoff
        opponent_past = history.get(target["opponent"]) or []
        if len(opponent_past) < MIN_HISTORY:
            continue

        def base_for(slug_, division_relative):
            if not division_relative:
                return league_other
            return division_other.get(divisions.get(slug_)) or league_other

        def adjusted(division_relative):
            return [f[metric] / opponent_factor(history.get(f["opponent"]) or [], other,
                                                base_for(f["opponent"], division_relative), f["date"])
                    for f in past]

        weights = recency_weights(past, cutoff)
        row = {"slug": slug, "actual": target[metric], "league": statistics.fmean(
            f[metric] for fs in history.values() for f in fs),
            "raw5": statistics.fmean(f[metric] for f in past[:5]),
            "rawW": weighted_mean([f[metric] for f in past], weights)}
        for suffix, division_relative in (("lg", False), ("div", True)):
            adj = weighted_mean(adjusted(division_relative), weights)
            next_factor = opponent_factor(opponent_past, other,
                                          base_for(target["opponent"], division_relative))
            row[f"adjW_{suffix}"] = adj
            row[f"adjWxOpp_{suffix}"] = adj * next_factor
        rows.append(row)
    return rows


def report(data: dict, metric: str, cutoffs=CUTOFFS) -> dict:
    print(f"\n=== significant strikes {metric} per minute in the next fight ===")
    pooled = {m: [] for m in MODELS}
    rhos = {m: [] for m in MODELS}
    for c in cutoffs:
        rows = predictions(data, dt.date.fromisoformat(c), metric)
        if not rows:
            continue
        print(f"\ncutoff {c}: {len(rows)} fighters")
        base = statistics.fmean(abs(r["raw5"] - r["actual"]) for r in rows)
        print(f"  {'model':14s} {'MAE':>6s} {'RMSE':>6s} {'rho':>6s}   vs raw5")
        for m in MODELS:
            errors = [r[m] - r["actual"] for r in rows]
            mae = statistics.fmean(abs(e) for e in errors)
            rho = spearman([r[m] for r in rows], [r["actual"] for r in rows])
            print(f"  {m:14s} {mae:6.3f} {math.sqrt(statistics.fmean(e * e for e in errors)):6.3f} "
                  f"{rho:6.3f}   {100 * (mae - base) / base:+5.1f}%")
            pooled[m].extend(errors)
            rhos[m].append(rho)
    print(f"\npooled, {len(pooled['raw5'])} fighter-fights")
    base = statistics.fmean(abs(e) for e in pooled["raw5"])
    summary = {}
    for m in MODELS:
        mae = statistics.fmean(abs(e) for e in pooled[m])
        summary[m] = {"mae": mae, "rmse": math.sqrt(statistics.fmean(e * e for e in pooled[m])),
                      "rho": statistics.fmean(rhos[m]), "vsRaw5": 100 * (mae - base) / base}
        print(f"  {m:14s} MAE {mae:6.3f}  RMSE {summary[m]['rmse']:6.3f}  "
              f"rho {summary[m]['rho']:5.3f}  vs raw5 {summary[m]['vsRaw5']:+5.1f}%")
    return summary


def opposition_by_division(data: dict) -> None:
    """Shows why the opponent factor is measured against a division, not the league: without that,
    'my opponents are hard to hit' mostly means 'I fight in a low-volume division'."""
    divisions = {s: v["division"] for s, v in data.items()}
    fights = {s: v["fights"] for s, v in data.items()}
    as_of = max(f["date"] for v in fights.values() for f in v)
    league, by_division = means(fights, "absorbed", divisions)
    rows = {}
    for slug, fs in fights.items():
        if len(fs) < MIN_HISTORY:
            continue
        weights = recency_weights(fs, as_of)
        against_league = weighted_mean(
            [opponent_factor(fights.get(f["opponent"]) or [], "absorbed", league, f["date"]) for f in fs], weights)
        against_division = weighted_mean(
            [opponent_factor(fights.get(f["opponent"]) or [], "absorbed",
                             by_division.get(divisions.get(f["opponent"])) or league, f["date"]) for f in fs], weights)
        rows.setdefault(divisions.get(slug) or "(no division)", []).append((against_league, against_division))
    print("\n=== mean opposition factor by division (1.00 = a typical opponent) ===")
    print(f"  {'division':24s} {'vs league':>10s} {'vs division':>12s}   fighters")
    for key in sorted(rows, key=lambda k: statistics.fmean(x[0] for x in rows[k])):
        v = rows[key]
        print(f"  {key:24s} {statistics.fmean(x[0] for x in v):10.2f} "
              f"{statistics.fmean(x[1] for x in v):12.2f}   {len(v)}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--stats", default=str(ROOT / "data" / "ufc-stats" / "fighters"))
    ap.add_argument("--cutoff", action="append", help="repeatable; defaults to four six-month steps")
    args = ap.parse_args()
    data = load_fighters(pathlib.Path(args.stats))
    print(f"{len(data)} fighters, {sum(len(v['fights']) for v in data.values())} measured fighter-fights")
    for metric in ("landed", "absorbed"):
        report(data, metric, tuple(args.cutoff) if args.cutoff else CUTOFFS)
    opposition_by_division(data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
