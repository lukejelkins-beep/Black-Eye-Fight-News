#!/usr/bin/env python3
"""Build data/ufc-fight-predictions.json: model estimates for bouts on announced UFC cards (26 Nov 2026).

Owner decision (docs/design/DECISIONS.md, 26 Nov 2026): fight predictions are built, as a model estimate with a public track
record, reversing the earlier "descriptive only" decision #432. The BEFN rating itself stays descriptive.

Offline and read-only. Inputs: data/ufc-card-snapshots.json (bouts and fighter slugs), data/upcoming-cards.json (title
markers), data/ufc-stats/fighters/*.json, data/ufc-fighter-born.json and data/ufc-prediction-model.json (slopes and the track
record, from scripts/ufc-prediction-calibrate.py).

Three parts, one pool at a time (women and men have separate rating scales, so a bout is only predicted when both fighters
are in the same pool, and each pool has its own slope and its own record):
  winner  p(A) = logistic(k_pool * BEFN rating difference).
  finish  P(KO/TKO or submission), a logistic regression fitted on every earlier UFC bout (point-in-time features).
  method  how each fighter would win if they win: a multinomial fitted the same way.
The two models are scored separately, so their six-way product does not add up to the finish probability. The card shows the
finish model's probability for "ends in a finish" and the method split is rescaled to it, so the numbers add up: finish
cells are multiplied by F / R and decision cells by (1-F) / (1-R), where R is the raw product's finish total.

A bout is flagged `low` confidence when either fighter has fewer than 3 UFC fights or an unknown birth date, and is left out
(with a reason) when a fighter has no UFC record or the two are in different pools.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "ufc-fight-predictions.json"
MIN_FIGHTS = 3
sys.path.insert(0, str(ROOT / "scripts"))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# Shown on the page as "what decides it" (descriptive only; the winner odds come from the overall rating, which the
# 26 Nov 2026 weight sweep found already uses these stats at about the right amounts).
DRIVER_KEYS = (("diffPm", "striking"), ("ctrlShare", "grappling"), ("sub15", "grappling"), ("td15", "wrestling"))


def drivers_of(ratings) -> dict:
    out = {}
    skills = ratings.get("skills") or {}
    for key, skill in DRIVER_KEYS:
        for d in (skills.get(skill) or {}).get("drivers", []):
            if d.get("key") == key and d.get("value") is not None:
                out[key] = round(float(d["value"]), 3)
    return out


def is_title(cards_bout) -> bool:
    text = f"{cards_bout.get('division') or ''} {cards_bout.get('note') or ''}".lower()
    return "title" in text or "championship" in text


def reconcile(p_a, meth_a, meth_b, finish):
    """Six outcomes (who, how) that add up to 1 and whose finish total equals the finish model's probability."""
    cells = {}
    for side, p, meth in (("a", p_a, meth_a), ("b", 1 - p_a, meth_b)):
        for c, v in zip(("ko", "sub", "dec"), meth):
            cells[(side, c)] = p * v
    raw_fin = sum(v for (s, c), v in cells.items() if c != "dec")
    f_scale, d_scale = finish / raw_fin, (1 - finish) / (1 - raw_fin)
    return {k: v * (d_scale if k[1] == "dec" else f_scale) for k, v in cells.items()}


def build(as_of_override=None):
    m = load("ufc_method", "scripts/ufc-method-research.py")
    pred = m.pred
    model = json.loads((DATA / "ufc-prediction-model.json").read_text())
    snaps = json.loads((DATA / "ufc-card-snapshots.json").read_text())
    cards = json.loads((DATA / "upcoming-cards.json").read_text())
    born = json.loads((DATA / "ufc-fighter-born.json").read_text())
    heights, births = born.get("heightInches") or {}, born["fighters"]
    title_by_bout = {(e["id"], b.get("id")): is_title(b) for e in cards["events"] for b in e.get("bouts", [])}

    rows = [r for r in pred.build_rows() if r["method"] in ("ko", "sub", "dec")]
    Xp = np.array([m.pair_features(r["a"], r["b"], r) for r in rows]); mu, sd = Xp.mean(0), Xp.std(0) + 1e-9
    fin = np.array([1.0 if r["method"] in ("ko", "sub") else 0.0 for r in rows])
    w_fin = m.fit_binary((Xp - mu) / sd, fin, model["finish"]["l2"])
    wins = []
    for r in rows:
        w, l = (r["a"], r["b"]) if r["y"] == 1 else (r["b"], r["a"])
        wins.append(m.winner_features(w, l, r))
    Xw = np.array(wins); mw, sw = Xw.mean(0), Xw.std(0) + 1e-9
    yc = np.array([m.CLASSES.index(r["method"]) for r in rows])
    w_meth = m.fit_multi((Xw - mw) / sw, yc, 3, l2=len(rows) * model["method"]["l2PerBout"])

    fighters_dir = DATA / "ufc-stats" / "fighters"

    def fighter_file(slug):
        p = fighters_dir / f"{slug}.json"
        return json.loads(p.read_text(encoding="utf-8")) if slug and p.exists() else None

    events = []
    for e in snaps["events"]:
        out_bouts = []
        for b in e["bouts"]:
            keys = b["fighters"]
            entries = [snaps["fighters"].get(k) or {} for k in keys]
            base = {"id": b["id"], "division": b.get("division"), "fighters": [{"name": x.get("name"), "slug": x.get("slug")} for x in entries]}
            files = [fighter_file(x.get("slug")) for x in entries]
            if not all(files):
                out_bouts.append({**base, "status": "skipped", "reason": "A fighter has no UFC record here yet"})
                continue
            rts = [f["ratings"] for f in files]
            pools = {r.get("pool") for r in rts}
            if len(pools) != 1 or None in pools or any(r.get("overallRating") is None for r in rts):
                out_bouts.append({**base, "status": "skipped", "reason": "The two fighters are not on the same rating scale"})
                continue
            pool = pools.pop()
            sts = []
            for f in files:
                fl = sorted(f["fights"], key=lambda x: (x["date"], str(x["boutId"])))
                sts.append(pred.fighter_state(fl, births.get(f["slug"]), heights.get(f["slug"]), e["date"], False))
            if any(s is None for s in sts):
                out_bouts.append({**base, "status": "skipped", "reason": "A fighter has no earlier UFC fights"})
                continue
            a, c = sts
            title = title_by_bout.get((e["id"], b["id"]), False)
            p_a = float(m.logistic(model["winner"][pool]["k"] * (rts[0]["overallRating"] - rts[1]["overallRating"])))
            row = {"eloA": rts[0]["results"]["rating"], "eloB": rts[1]["results"]["rating"], "title": 1.0 if title else 0.0, "women": 1.0 if pool == "women" else 0.0}
            f_prob = float(m.logistic(np.append((np.array(m.pair_features(a, c, row)) - mu) / sd, 1.0) @ w_fin))
            meth = []
            for wf, lf in ((a, c), (c, a)):
                x = (np.array(m.winner_features(wf, lf, row)) - mw) / sw
                meth.append(m.softmax(np.append(x, 1.0)[None, :] @ w_meth)[0])
            cells = reconcile(p_a, meth[0], meth[1], f_prob)
            low = [x.get("name") for x, s, r in zip(entries, sts, rts) if s["n"] < MIN_FIGHTS or s["age"] is None or r.get("provisional")]
            out_bouts.append({
                **base, "status": "ok", "pool": pool, "title": title,
                "winProbability": [round(p_a, 4), round(1 - p_a, 4)],
                "finishProbability": round(f_prob, 4),
                "outcomes": {f"{s}-{c_}": round(v, 4) for (s, c_), v in cells.items()},
                "confidence": "low" if low else "normal",
                "lowConfidenceFor": low,
                "details": [{"rating": r["overall"], "rank": r.get("overallRank"), "rankOf": r.get("rankOf"),
                             "age": None if s["age"] is None else round(s["age"], 1), "ufcFights": s["n"],
                             "drivers": drivers_of(r)}
                            for r, s in zip(rts, sts)],
            })
        events.append({"id": e["id"], "title": e.get("title"), "date": e["date"], "bouts": out_bouts})
    stats_as_of = json.loads((DATA / "ufc-stats/index.json").read_text())["asOf"]
    return {"schema": 1, "statsAsOf": stats_as_of, "modelStatsAsOf": model["statsAsOf"], "events": events}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    result = build()
    text = json.dumps(result, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    out = Path(args.out)
    if not out.exists() or out.read_text() != text:
        out.write_text(text)
    ok = sum(1 for e in result["events"] for b in e["bouts"] if b["status"] == "ok")
    skipped = sum(1 for e in result["events"] for b in e["bouts"] if b["status"] != "ok")
    print(f"{len(result['events'])} UFC cards: {ok} bouts predicted, {skipped} skipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
