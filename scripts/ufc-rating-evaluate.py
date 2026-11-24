#!/usr/bin/env python3
"""Evaluate the BEFN rating model 2026-11 (results + effectiveness skills) against the previous rating.

Offline and read-only: no provider call, no collector write, no data file written. The previous engine is read from
git (default `origin/main:scripts/ufc_ratings.py`), so both are scored on exactly the same fights.

1. Walk-forward test, the R4 method (scripts/ufc-r4-calibration.py): for each quarter from 2023-10-01 the stats build is
   re-run as it stood that day, once with each engine, and every decided UFC bout in the next quarter is scored with
   p = logistic(k * rating difference). k is fitted on earlier quarters only, so the first quarter only trains and the
   test period is 2024-01-01 onward. The new model's constants were fitted on fights before 2024
   (scripts/ufc-rating-fit.py), so nothing it is tested on was used to build it.
2. Agreement with the official UFC rankings (current build).
3. Examples: named fighters, previous and new numbers side by side.
Prediction is the test only. The rating stays descriptive, never presented as a forecast (owner decision #432).
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import math
import random
import subprocess
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIRST_CUT = dt.date(2023, 10, 1)
TEST_FROM = "2024-01-01"
EXAMPLES = ["sean-strickland", "khamzat-chimaev", "anthony-hernandez", "dricus-du-plessis", "carlos-ulberg",
            "alex-pereira", "magomed-ankalaev", "ciryl-gane", "islam-makhachev", "ilia-topuria", "arman-tsarukyan",
            "justin-gaethje", "alexander-volkanovski", "merab-dvalishvili", "petr-yan", "joshua-van",
            "kayla-harrison", "valentina-shevchenko", "jon-jones", "quillan-salkilld", "jacobe-smith"]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def old_engine(ref: str, new):
    src = subprocess.run(["git", "show", f"{ref}:scripts/ufc_ratings.py"], cwd=ROOT, check=True,
                         capture_output=True, text=True).stdout
    tmp = Path(tempfile.mkdtemp()) / "ufc_ratings_previous.py"
    tmp.write_text(src, encoding="utf-8")
    old = load_module("ufc_ratings_previous", tmp)
    shim = types.ModuleType("ufc_ratings_shim")
    shim.__dict__.update(new.__dict__)          # constants the build reads (MODEL, HEADLINE_CENTRE, ...)
    shim.__dict__.update({k: v for k, v in old.__dict__.items() if not k.startswith("__")})
    import inspect
    takes_bouts = len(inspect.signature(old.rate_roster).parameters) > 1   # model 2026-11 or later
    shim.rate_roster = (lambda fighters, bouts=None, as_of=None: old.rate_roster(fighters, bouts, as_of)) if takes_bouts \
        else (lambda fighters, bouts=None, as_of=None: old.rate_roster(fighters))
    return shim


def quarter_starts(first, last):
    out, d = [], first
    while d <= last:
        out.append(d)
        m = d.month + 3
        d = dt.date(d.year + (m - 1) // 12, (m - 1) % 12 + 1, 1)
    return out


def snapshot(build, engine, cut):
    real = build.ufc_ratings
    build.ufc_ratings = engine
    try:
        with tempfile.TemporaryDirectory() as tmp:
            build.build(cut, Path(tmp), None, True, before=cut)
            out = {}
            for p in (Path(tmp) / "fighters").glob("*.json"):
                d = json.loads(p.read_text(encoding="utf-8"))
                r, c = d["ratings"] or {}, d["windows"]["career"]
                pcts = {k: (r.get("skills") or {}).get(k, {}).get("roster") for k in ("striking", "grappling", "wrestling", "defence")}
                have = [k for k, v in pcts.items() if v is not None]
                w = {"striking": .25, "grappling": .15, "wrestling": .20, "defence": .25}
                out[d["slug"]] = {
                    # the full-precision rating where the engine has one (2026-11 model), else the old 0-100 headline
                    "overall": r.get("overallRating", r.get("overall")) if (r.get("eligible") or r.get("provisional")) else None,
                    "skills": sum(pcts[k] * w[k] for k in have) / sum(w[k] for k in have) if len(have) >= 3 else None,
                    "winrate": c["W"] / (c["W"] + c["L"]) if c["W"] + c["L"] else None}
            return out
    finally:
        build.ufc_ratings = real


def logistic(z):
    return 1 / (1 + math.exp(-max(-30.0, min(30.0, z))))


def fit_k(xs, ys):
    k = 0.0
    for _ in range(60):
        g = sum((y - logistic(k * x)) * x for x, y in zip(xs, ys))
        h = -sum(logistic(k * x) * (1 - logistic(k * x)) * x * x for x in xs)
        if not h:
            break
        step = g / h
        k -= step
        if abs(step) < 1e-10:
            break
    return k


def score(ps, ys):
    n, eps = len(ys), 1e-9
    return {"n": n, "acc": sum((p > .5) == (y == 1) for p, y in zip(ps, ys)) / n,
            "brier": sum((p - y) ** 2 for p, y in zip(ps, ys)) / n,
            "logloss": -sum(y * math.log(max(p, eps)) + (1 - y) * math.log(max(1 - p, eps)) for p, y in zip(ps, ys)) / n}


def bootstrap(pa, pb, ys, reps=2000, seed=7):
    """95% interval of Brier(b) - Brier(a): positive means a is better."""
    rnd, n = random.Random(seed), len(ys)
    d = [(b - y) ** 2 - (a - y) ** 2 for a, b, y in zip(pa, pb, ys)]
    xs = sorted(sum(d[rnd.randrange(n)] for _ in range(n)) / n for _ in range(reps))
    return sum(d) / n, xs[int(.025 * reps)], xs[int(.975 * reps) - 1]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--previous", default="origin/main", help="git ref holding the previous scripts/ufc_ratings.py")
    ap.add_argument("--out")
    ap.add_argument("--json", help="write the example rows here")
    args = ap.parse_args()
    sys.path.insert(0, str(ROOT / "scripts"))
    build = load_module("ufc_stats_build", ROOT / "scripts/build-ufc-stats.py")
    new = build.ufc_ratings
    old = old_engine(args.previous, new)
    stats_dir = ROOT / "data/ufc-stats"
    end = dt.date.fromisoformat(json.loads((stats_dir / "index.json").read_text())["asOf"])

    # every archived bout, from the build's own list (fighters who left included)
    captured = {}
    real_rb = build.results_bouts
    build.results_bouts = lambda pf: captured.setdefault("b", real_rb(pf))
    saved = build.ACTIVE_MONTHS
    build.ACTIVE_MONTHS = 10 ** 4
    with tempfile.TemporaryDirectory() as tmp:
        build.build(end, Path(tmp), None, True)
    build.ACTIVE_MONTHS = saved
    build.results_bouts = real_rb
    bouts = sorted(captured["b"], key=lambda b: (b["date"], str(b["boutId"])))

    cuts = quarter_starts(FIRST_CUT, end - dt.timedelta(days=45))
    folds = []
    for i, cut in enumerate(cuts):
        stop = cuts[i + 1] if i + 1 < len(cuts) else end + dt.timedelta(days=1)
        sn, so = snapshot(build, new, cut), snapshot(build, old, cut)
        fold = []
        for b in bouts:
            if not (cut.isoformat() <= b["date"] < stop.isoformat()) or b["outcome"] not in ("W", "L"):
                continue
            na, nb, oa, ob = sn.get(b["a"]), sn.get(b["b"]), so.get(b["a"]), so.get(b["b"])
            if not (na and nb and oa and ob):
                continue
            row = {"y": 1 if b["outcome"] == "W" else 0, "date": b["date"]}
            for tag, x, z in (("new", na, nb), ("old", oa, ob)):
                row[tag] = None if None in (x["overall"], z["overall"]) else x["overall"] - z["overall"]
                row[tag + "Skills"] = None if None in (x["skills"], z["skills"]) else x["skills"] - z["skills"]
            row["winrate"] = None if None in (na["winrate"], nb["winrate"]) else na["winrate"] - nb["winrate"]
            fold.append(row)
        folds.append(fold)
        print(f"  {cut}: {len(fold)} fights", file=sys.stderr)

    feats = ("new", "old", "newSkills", "oldSkills", "winrate")
    tested = []
    for i, fold in enumerate(folds):
        train = [c for f in folds[:i] for c in f]
        if len(train) < 100:
            continue
        ks = {f: fit_k([c[f] for c in train if c[f] is not None], [c["y"] for c in train if c[f] is not None]) for f in feats}
        for c in fold:
            if all(c[f] is not None for f in feats):
                c["p"] = {f: logistic(ks[f] * c[f]) for f in feats}
                tested.append(c)
    ys = [c["y"] for c in tested]
    P = {f: [c["p"][f] for c in tested] for f in feats}
    S = {f: score(P[f], ys) for f in feats}

    out = ["# BEFN rating model 2026-11: effectiveness test", "",
           "Research output, offline. Reproduce: `python3 scripts/ufc-rating-evaluate.py` (about 3 minutes).", "",
           f"Previous engine read from `{args.previous}`. Test fights: every decided UFC bout from {TEST_FROM} to "
           f"{end} where both fighters had a rating under both engines, scored walk-forward ({len(tested)} fights).", "",
           "## 1. Predicting the next fight (the objective test)", "",
           "| Model | Fights | Accuracy | Brier (lower is better) | Log loss |", "|---|---:|---:|---:|---:|",
           f"| Coin flip | {len(ys)} | 50.0% | 0.2500 | 0.6931 |"]
    for f, label in (("winrate", "Career win rate"), ("old", "Previous BEFN rating (skills + form, 0-100)"),
                     ("oldSkills", "Previous skill scores only"), ("newSkills", "New effectiveness skill scores only"),
                     ("new", "**New BEFN rating (results + skills)**")):
        s = S[f]
        out.append(f"| {label} | {s['n']} | {100 * s['acc']:.1f}% | {s['brier']:.4f} | {s['logloss']:.4f} |")
    out.append("")
    for a, b, label in (("new", "old", "New rating vs previous rating"), ("new", "winrate", "New rating vs career win rate"),
                        ("newSkills", "oldSkills", "New skill scores vs previous skill scores")):
        mean, lo, hi = bootstrap(P[a], P[b], ys)
        verdict = "clearly better" if lo > 0 else "clearly worse" if hi < 0 else "not clearly different"
        out.append(f"- {label}: Brier improvement {mean:+.4f} (95% interval {lo:+.4f} to {hi:+.4f}), {verdict}.")
    # Each fight counted from both corners, so the bins do not depend on which corner the source lists first.
    both = [(p, y) for p, y in zip(P["new"], ys)] + [(1 - p, 1 - y) for p, y in zip(P["new"], ys)]
    out += ["", "Calibration of the new rating (each fight counted from both sides):", "",
            "| Predicted | Fighter-fights | Mean predicted | Won |", "|---|---:|---:|---:|"]
    for lo_b, hi_b in ((0, .3), (.3, .4), (.4, .5), (.5, .6), (.6, .7), (.7, 1.01)):
        sel = [(p, y) for p, y in both if lo_b <= p < hi_b]
        if sel:
            out.append(f"| {lo_b:.1f} to {min(hi_b, 1):.1f} | {len(sel)} | {sum(p for p, _ in sel) / len(sel):.3f} | "
                       f"{sum(y for _, y in sel) / len(sel):.3f} |")
    by_year = {}
    for c in tested:
        by_year.setdefault(c["date"][:4], []).append(c)
    out += ["", "By year (accuracy, new / previous): " + ", ".join(
        f"{y} {100 * score([c['p']['new'] for c in v], [c['y'] for c in v])['acc']:.1f}% / "
        f"{100 * score([c['p']['old'] for c in v], [c['y'] for c in v])['acc']:.1f}% ({len(v)})" for y, v in sorted(by_year.items()))]

    # 2. Agreement with the official rankings, current build
    with tempfile.TemporaryDirectory() as tmp:
        build.build(end, Path(tmp), None, True)
        cur = {p.stem: json.loads(p.read_text()) for p in (Path(tmp) / "fighters").glob("*.json")}
    real = build.ufc_ratings
    build.ufc_ratings = old
    with tempfile.TemporaryDirectory() as tmp:
        build.build(end, Path(tmp), None, True)
        prev = {p.stem: json.loads(p.read_text()) for p in (Path(tmp) / "fighters").glob("*.json")}
    build.ufc_ratings = real

    def ranked(d):
        return d["champion"] or d["officialRank"] is not None

    def table_for(src):
        rows = [(d["ratings"].get("overallRating", d["ratings"]["overall"]), s) for s, d in src.items()
                if d.get("ratings") and d["ratings"].get("eligible")]
        return [s for _, s in sorted(rows, reverse=True)]

    def spearman(src):
        """Mean, over divisions, of the rank correlation between rating and official position (champion = 0)."""
        divs = {}
        for s, d in src.items():
            if ranked(d) and d.get("ratings") and d["ratings"].get("overall") is not None and d.get("divisionSlug"):
                divs.setdefault(d["divisionSlug"], []).append((0 if d["champion"] else d["officialRank"], d["ratings"]["overall"]))
        vals = []
        for rows in divs.values():
            if len(rows) < 6:
                continue
            def ranks(v):
                order = sorted(range(len(v)), key=lambda i: v[i])
                rk = [0.0] * len(v)
                for pos, i in enumerate(order):
                    rk[i] = pos
                return rk
            a, b = ranks([r[0] for r in rows]), ranks([-r[1] for r in rows])
            n = len(rows)
            vals.append(1 - 6 * sum((x - y) ** 2 for x, y in zip(a, b)) / (n * (n * n - 1)))
        return sum(vals) / len(vals), len(vals)

    tn, tp = table_for(cur), table_for(prev)
    champs = [s for s, d in cur.items() if d["champion"]]
    pos_new = {s: i + 1 for i, s in enumerate(tn)}
    pos_old = {s: i + 1 for i, s in enumerate(tp)}
    sn_, nd = spearman(cur)
    so_, _ = spearman(prev)
    out += ["", "## 2. Agreement with the official UFC rankings (as of " + str(end) + ")", "",
            "| Check | Previous | New |", "|---|---:|---:|",
            f"| Ranked fighters or champions in the top 50 | {sum(ranked(cur[s]) for s in tp[:50])} | {sum(ranked(cur[s]) for s in tn[:50])} |",
            f"| Ranked fighters or champions in the top 100 | {sum(ranked(cur[s]) for s in tp[:100])} | {sum(ranked(cur[s]) for s in tn[:100])} |",
            f"| Champions in the top 50 (of {len(champs)}) | {sum(1 for c in champs if pos_old.get(c, 999) <= 50)} | {sum(1 for c in champs if pos_new.get(c, 999) <= 50)} |",
            f"| Median position of a champion among {len(tn)} rated fighters | {sorted(pos_old.get(c, 999) for c in champs)[len(champs) // 2]} | {sorted(pos_new.get(c, 999) for c in champs)[len(champs) // 2]} |",
            f"| Rank correlation with official order inside each division (mean of {nd}) | {so_:.2f} | {sn_:.2f} |", "",
            "The official rankings are a panel's opinion, not ground truth; this shows whether the number now looks like a "
            "fighter's standing, which was the owner's complaint.", ""]

    # 3. Examples
    out += ["## 3. Examples", "",
            "| Fighter | Status | Previous (0-100) | New rating | New percentile | Results part | Previous wrestling / grappling | New wrestling / grappling | Position (previous to new) |",
            "|---|---|---:|---:|---:|---:|---|---|---|"]
    rows = []
    for s in EXAMPLES:
        d, o = cur.get(s), prev.get(s)
        if not d or not d.get("ratings"):
            continue
        r, q = d["ratings"], o["ratings"]
        status = "Champion" if d["champion"] else f"#{d['officialRank']}" if d["officialRank"] is not None else "unranked"
        row = {"slug": s, "name": d["name"], "status": status, "division": d["division"],
               "previous": q.get("overall"), "new": r.get("overall"), "percentile": r.get("overallPercentile"),
               "results": (r.get("results") or {}).get("rating"), "resultsPct": (r.get("results") or {}).get("percentile"),
               "prevW": q["skills"]["wrestling"]["roster"], "prevG": q["skills"]["grappling"]["roster"],
               "newW": r["skills"]["wrestling"]["roster"], "newG": r["skills"]["grappling"]["roster"],
               "posOld": pos_old.get(s), "posNew": pos_new.get(s), "lastFight": d["lastFight"]}
        rows.append(row)
        out.append(f"| {row['name']} | {status} | {row['previous']} | {row['new']} | {row['percentile']} | {row['results']} "
                   f"({row['resultsPct']}th) | {row['prevW']} / {row['prevG']} | {row['newW']} / {row['newG']} | "
                   f"{row['posOld'] or '-'} to {row['posNew'] or '-'} |")
    out += ["", f"Top 20 by the new rating ({len(tn)} rated fighters):", "",
            "| # | Fighter | Division | Status | New rating | Previous |", "|---:|---|---|---|---:|---:|"]
    for i, s in enumerate(tn[:20], 1):
        d = cur[s]
        status = "Champion" if d["champion"] else f"#{d['officialRank']}" if d["officialRank"] is not None else "unranked"
        out.append(f"| {i} | {d['name']} | {d['division']} | {status} | {d['ratings']['overall']} | {prev[s]['ratings'].get('overall')} |")
    biggest = sorted(((cur[s]["ratings"]["overallPercentile"] - pct_old, s) for s, pct_old in
                      ((s, _pct(prev[s]["ratings"]["overall"], [prev[x]["ratings"]["overall"] for x in tp])) for s in tn)),
                     key=lambda x: x[0])
    out += ["", "Biggest moves by percentile (previous headline percentile to new):", ""]
    for delta, s in biggest[:8] + biggest[-8:]:
        d = cur[s]
        out.append(f"- {d['name']} ({d['division']}, {'Champion' if d['champion'] else '#' + str(d['officialRank']) if d['officialRank'] is not None else 'unranked'}): "
                   f"{delta:+d} points; record {d['windows']['career']['W']}-{d['windows']['career']['L']}, "
                   f"results {cur[s]['ratings']['results']['rating']}, skills composite {cur[s]['ratings']['skillsComposite']}")
    text = "\n".join(out) + "\n"
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        print(text)
    if args.json:
        Path(args.json).write_text(json.dumps(rows, indent=1), encoding="utf-8")
    return 0


def _pct(v, pop):
    pop = sorted(pop)
    below = sum(1 for x in pop if x < v)
    eq = sum(1 for x in pop if x == v)
    return max(1, min(99, round(100 * (below + eq / 2) / len(pop))))


if __name__ == "__main__":
    raise SystemExit(main())
