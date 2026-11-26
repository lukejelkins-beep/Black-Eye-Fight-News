#!/usr/bin/env python3
"""Walk-forward Brier test of rating variants against the current engine (26 Nov 2026, owner: "test both versions").

Offline and read-only, same protocol as scripts/ufc-rating-evaluate.py: quarterly point-in-time snapshots from 2023-10-01,
k fitted on earlier quarters only, tested on 2024-01-01 onward. A variant is the current engine with experiment knobs set
(TITLE_NO_DRIFT, AGE_TITLE_FACTOR in scripts/ufc_ratings.py).

  python3 scripts/ufc-rating-variants.py run base title_no_drift   # writes /tmp/ufc-variants/<name>.json
  python3 scripts/ufc-rating-variants.py compare base title_no_drift age_title0 age_title_half
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import math
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = Path("/tmp/ufc-variants")
VARIANTS = {
    "base": {},
    "title_no_drift": {"TITLE_NO_DRIFT": True},
    "age_title0": {"AGE_TITLE_FACTOR": 0.0},
    "age_title_half": {"AGE_TITLE_FACTOR": 0.5},
    "both": {"TITLE_NO_DRIFT": True, "AGE_TITLE_FACTOR": 0.0},
}


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run(names):
    sys.path.insert(0, str(ROOT / "scripts"))
    ev = load("ufc_eval", ROOT / "scripts/ufc-rating-evaluate.py")
    build = load("ufc_build", ROOT / "scripts/build-ufc-stats.py")
    stats_dir = ROOT / "data/ufc-stats"
    end = dt.date.fromisoformat(json.loads((stats_dir / "index.json").read_text())["asOf"])
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
    cuts = ev.quarter_starts(ev.FIRST_CUT, end - dt.timedelta(days=45))
    OUT.mkdir(exist_ok=True)
    for name in names:
        engine = load("ufc_ratings_" + name, ROOT / "scripts/ufc_ratings.py")
        for k, v in VARIANTS[name].items():
            setattr(engine, k, v)
        rows = []
        for i, cut in enumerate(cuts):
            stop = cuts[i + 1] if i + 1 < len(cuts) else end + dt.timedelta(days=1)
            sn = ev.snapshot(build, engine, cut)
            for b in bouts:
                if not (cut.isoformat() <= b["date"] < stop.isoformat()) or b["outcome"] not in ("W", "L"):
                    continue
                x, z = sn.get(b["a"]), sn.get(b["b"])
                if not (x and z) or x["overall"] is None or z["overall"] is None:
                    continue
                rows.append({"id": str(b["boutId"]), "fold": i, "date": b["date"], "y": 1 if b["outcome"] == "W" else 0,
                             "d": x["overall"] - z["overall"]})
            print(name, cut, len(rows), file=sys.stderr, flush=True)
        (OUT / (name + ".json")).write_text(json.dumps(rows))


def compare(names):
    ev = load("ufc_eval", ROOT / "scripts/ufc-rating-evaluate.py")
    data = {n: {r["id"]: r for r in json.loads((OUT / (n + ".json")).read_text())} for n in names}
    common = set.intersection(*[set(d) for d in data.values()])
    folds = sorted({data[names[0]][i]["fold"] for i in common})
    P, ys, meta = {n: [] for n in names}, [], []
    for f in folds:
        train_ids = [i for i in common if data[names[0]][i]["fold"] < f]
        if len(train_ids) < 100:
            continue
        ks = {n: ev.fit_k([data[n][i]["d"] for i in train_ids], [data[n][i]["y"] for i in train_ids]) for n in names}
        for i in sorted(common):
            if data[names[0]][i]["fold"] != f:
                continue
            ys.append(data[names[0]][i]["y"])
            for n in names:
                P[n].append(ev.logistic(ks[n] * data[n][i]["d"]))
    print(f"{len(ys)} fights from {folds[0]}")
    print("| Variant | Accuracy | Brier | Log loss | Brier gain vs base (95% interval) |\n|---|---:|---:|---:|---|")
    for n in names:
        s = ev.score(P[n], ys)
        gain = "" if n == names[0] else "%+.4f (%+.4f to %+.4f)" % ev.bootstrap(P[n], P[names[0]], ys)
        print(f"| {n} | {100 * s['acc']:.1f}% | {s['brier']:.4f} | {s['logloss']:.4f} | {gain} |")


if __name__ == "__main__":
    cmd, names = sys.argv[1], sys.argv[2:]
    run(names) if cmd == "run" else compare(names)
