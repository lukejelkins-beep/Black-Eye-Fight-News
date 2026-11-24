#!/usr/bin/env python3
"""Research: tune the results part of the BEFN rating (scripts/ufc_ratings.py RESULTS) - who a fighter beat, title
fights, inactivity and a starting rating from the pre-UFC record - without overfitting.

Offline and read-only: no provider call, no data file written. Every variant is scored twice on decided UFC bouts,
each predicted only from earlier bouts (the Elo expected score): on 2016-2023 (where the live constants were fitted)
and on 2024 onward (never used for fitting). A change is only worth making if it helps on both.

Pre-UFC record: overall record (data/ufc-overall-records.json, all promotions) minus the UFC record. It exists only for
fighters active in the last 36 months, and fighters who stayed in the UFC tend to be the ones who won, so the
pre-UFC-record variants are scored on bouts where BOTH fighters have a record, to keep that from leaking results.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import math
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_build():
    sys.path.insert(0, str(ROOT / "scripts"))
    spec = importlib.util.spec_from_file_location("ufc_stats_build", ROOT / "scripts/build-ufc-stats.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def all_bouts(build):
    end = dt.date.fromisoformat(json.loads((ROOT / "data/ufc-stats/index.json").read_text())["asOf"])
    old, real, captured = build.ACTIVE_MONTHS, build.results_bouts, {}
    build.ACTIVE_MONTHS = 10 ** 4
    build.results_bouts = lambda pf: captured.setdefault("b", real(pf))
    try:
        with tempfile.TemporaryDirectory() as tmp:
            build.build(end, Path(tmp), None, True)
    finally:
        build.ACTIVE_MONTHS, build.results_bouts = old, real
    return captured["b"]


def pre_ufc_records():
    recs = json.loads((ROOT / "data/ufc-overall-records.json").read_text())["records"]
    out = {}
    for slug, r in recs.items():
        u = r.get("ufc") or {}
        w, l = r["W"] - u.get("W", 0), r["L"] - u.get("L", 0)
        if w >= 0 and l >= 0:
            out[slug] = (w, l)
    return out


def priors(records, scale):
    """Start = 1500 + scale * (shrunk pre-UFC win rate - its median); shrinkage (W+2)/(W+L+4)."""
    if not scale:
        return {}
    shr = {s: (w + 2) / (w + l + 4) for s, (w, l) in records.items()}
    mid = sorted(shr.values())[len(shr) // 2]
    return {s: 1500 + scale * (v - mid) for s, v in shr.items()}


def score(rows):
    n = len(rows)
    if not n:
        return None
    eps = 1e-9
    acc = sum((p > .5) == (y == 1) for p, y in rows) / n
    brier = sum((p - y) ** 2 for p, y in rows) / n
    ll = -sum(y * math.log(max(p, eps)) + (1 - y) * math.log(max(1 - p, eps)) for p, y in rows) / n
    return {"n": n, "acc": acc, "brier": brier, "ll": ll}


def evaluate(r, bouts, p, prior=None, need_records=None):
    _, pre = r.results_walk(bouts, p, prior)
    out = {}
    for name, lo, hi in (("2016-2023", "2016-01-01", "2024-01-01"), ("2024+", "2024-01-01", "9999")):
        rows_all, rows_new = [], []
        for b, ra, rb, na, nb in pre:
            if b["outcome"] not in ("W", "L") or not (lo <= b["date"] < hi):
                continue
            if need_records is not None and not (b["a"] in need_records and b["b"] in need_records):
                continue
            if need_records is None and not (na and nb):     # as the live fit: both fighters had a UFC fight before
                continue
            pr = 1 / (1 + 10 ** ((rb - ra) / 400))
            row = (pr, 1 if b["outcome"] == "W" else 0)
            rows_all.append(row)
            if min(na, nb) < 3:
                rows_new.append(row)
        out[name] = (score(rows_all), score(rows_new))
    return out


def line(label, res):
    cells = []
    for name in ("2016-2023", "2024+"):
        a, nw = res[name]
        cells.append(f"{a['ll']:.4f} / {100 * a['acc']:.1f}%" + (f" (few-fight {nw['ll']:.4f}, n={nw['n']})" if nw else ""))
    return f"| {label} | {cells[0]} | {cells[1]} |"


def main():
    build = load_build()
    r = build.ufc_ratings
    bouts = all_bouts(build)
    base = dict(r.RESULTS)
    head = ["| Variant | 2016-2023 log loss / accuracy | 2024+ log loss / accuracy |", "|---|---|---|"]
    out = ["# Results-part tuning study", "", f"Live constants: `{json.dumps(base)}`. Lower log loss is better.", ""]

    out += ["## Who they beat: K (how far one fight moves a rating), finishes, split decisions, title fights", ""] + head
    out.append(line("live", evaluate(r, bouts, base)))
    for key, vals in (("k", (48, 80)), ("finish", (1.0, 1.5)), ("split", (.75, 1.0)), ("title", (1.0, 2.0)), ("boost", (0.0, 2.0))):
        for v in vals:
            out.append(line(f"{key} = {v}", evaluate(r, bouts, {**base, key: v})))

    out += ["", "## Inactivity (drift back toward 1500 per year beyond one year out)", ""] + head
    for v in (0.0, 0.05, 0.1, 0.2, 0.3):
        out.append(line(f"idle = {v}" + (" (live)" if v == base["idle"] else ""), evaluate(r, bouts, {**base, "idle": v})))

    records = pre_ufc_records()
    have = set(records)
    out += ["", "## Few-fight fighters: start from the pre-UFC record instead of 1500",
            "Scored on bouts where both fighters have a saved record (debuts included). 'few-fight' = either fighter had "
            "fewer than 3 UFC fights before the bout.", ""] + head
    for scale in (0, 100, 200, 300, 400):
        out.append(line(f"prior scale {scale}" + (" (live: flat 1500)" if not scale else ""),
                        evaluate(r, bouts, base, priors(records, scale), need_records=have)))
    text = "\n".join(out) + "\n"
    print(text)
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
