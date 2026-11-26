#!/usr/bin/env python3
"""Calibrate and score the UFC fight predictions: writes data/ufc-prediction-model.json (26 Nov 2026).

Offline and slow (it re-runs the rating walk-forward, about as long as scripts/ufc-rating-evaluate.py), so it is run by
hand when the rating engine or the fight data change materially, not by the bot workflow. The fast generator
(scripts/build-ufc-fight-predictions.py) reads its output.

What it does, all walk-forward (a quarter is predicted by models fitted on earlier bouts only; test = 2024-01-01 onward):
  winner  p(A beats B) = logistic(k * BEFN rating difference). k per fold is fitted on earlier quarters; the file keeps the
          k fitted on every scored bout, which the generator applies to the upcoming card.
  finish  KO/TKO or submission against a decision: logistic regression on pairing features (L2 chosen on 2021-2023 only).
  method  how the winner wins given who wins: multinomial on the winner's offence against the loser's defence.
Each part is scored against a base rate and the file records accuracy, Brier or log loss, the gain with a 95% bootstrap
interval, and a reliability table, which the page shows as the public track record.

  python3 scripts/ufc-prediction-calibrate.py [--reuse]   # --reuse: keep /tmp/ufc-variants/current.json if present
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/ufc-prediction-model.json"
sys.path.insert(0, str(ROOT / "scripts"))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def reliability(p_fav, hit, edges=(0.5, 0.6, 0.7, 0.8, 1.0001)):
    rows = []
    for lo, hi in zip(edges, edges[1:]):
        idx = [i for i, p in enumerate(p_fav) if lo <= p < hi]
        if idx:
            rows.append({"from": round(lo, 2), "to": round(min(hi, 1.0), 2), "n": len(idx),
                         "predicted": round(float(np.mean([p_fav[i] for i in idx])), 4),
                         "actual": round(float(np.mean([hit[i] for i in idx])), 4)})
    return rows


def winner_part(ev, vr, reuse, women):
    """One slope and one track record per rating pool: the women's and men's ratings are separate scales."""
    path = vr.OUT / "current.json"
    if not (reuse and path.exists()):
        vr.run(["current"])
    allrows = {r["id"]: r for r in json.loads(path.read_text())}
    return {pool: winner_pool(ev, {i: r for i, r in allrows.items() if bool(women.get(i)) == (pool == "women")})
            for pool in ("men", "women")}


def winner_pool(ev, data):
    ids = sorted(data, key=lambda i: (data[i]["date"], i))
    folds = sorted({data[i]["fold"] for i in ids})
    ps, ys, fav, hit, years = [], [], [], [], defaultdict(list)
    for f in folds:
        train = [i for i in ids if data[i]["fold"] < f]
        if len(train) < 60:
            continue
        k = ev.fit_k([data[i]["d"] for i in train], [data[i]["y"] for i in train])
        for i in ids:
            if data[i]["fold"] != f:
                continue
            p = ev.logistic(k * data[i]["d"])
            ps.append(p); ys.append(data[i]["y"])
            pf = max(p, 1 - p)
            fav.append(pf); hit.append(1 if (p >= .5) == (data[i]["y"] == 1) else 0)
            years[data[i]["date"][:4]].append(hit[-1])
    s = ev.score(ps, ys)
    k_all = ev.fit_k([data[i]["d"] for i in ids], [data[i]["y"] for i in ids])
    ece = sum(r["n"] * abs(r["predicted"] - r["actual"]) for r in reliability(fav, hit)) / len(fav)
    return {"k": round(float(k_all), 6), "bouts": len(ys), "accuracy": round(s["acc"], 4), "brier": round(s["brier"], 4),
            "logLoss": round(s["logloss"], 4), "coinFlipBrier": 0.25, "calibrationError": round(ece, 4),
            "byYear": {y: {"bouts": len(v), "accuracy": round(float(np.mean(v)), 4)} for y, v in sorted(years.items())},
            "reliability": reliability(fav, hit)}


def finish_and_method(m, rows):
    pred = m.pred
    rows = [r for r in rows if r["method"] in ("ko", "sub", "dec")]
    dates = [r["date"] for r in rows]
    qof = np.array([pred.quarter_of(d) for d in dates])
    quarters = sorted(set(qof))
    divs = [r["div"] or "none" for r in rows]
    fin = np.array([1.0 if r["method"] in ("ko", "sub") else 0.0 for r in rows])
    Xp = np.array([m.pair_features(r["a"], r["b"], r) for r in rows])
    mu, sd = Xp.mean(0), Xp.std(0) + 1e-9
    Z = (Xp - mu) / sd
    l2s = [10, 50, 200, 800]
    P = {name: {} for name in ["division", *l2s]}
    for q in quarters:
        if q < pred.FIRST_PRED_QUARTER:
            continue
        tr, te = np.where(qof < q)[0], np.where(qof == q)[0]
        if len(tr) < 300 or not len(te):
            continue
        rate = fin[tr].mean()
        n, s = defaultdict(float), defaultdict(float)
        for i in tr:
            n[divs[i]] += 1; s[divs[i]] += fin[i]
        for i in te:
            P["division"][i] = (s[divs[i]] + 30 * rate) / (n[divs[i]] + 30)
        for l2 in l2s:
            w = m.fit_binary(Z[tr], fin[tr], l2)
            for i in te:
                P[l2][i] = float(m.logistic(np.append(Z[i], 1.0) @ w))
    brier_in = lambda k, lo, hi: np.mean([(P[k][i] - fin[i]) ** 2 for i in P[k] if lo <= dates[i] <= hi])
    l2 = min(l2s, key=lambda k: brier_in(k, "2021-01-01", "2023-12-31"))
    idx = [i for i in range(len(rows)) if dates[i] >= m.TEST_FROM and i in P[l2] and i in P["division"]]
    y = fin[idx]
    pf = np.array([P[l2][i] for i in idx]); pd = np.array([P["division"][i] for i in idx])
    gain = m.bootstrap(pf, pd, lambda p: (p - y) ** 2)
    fav = [max(p, 1 - p) for p in pf]; hit = [1 if (p > .5) == (v == 1) else 0 for p, v in zip(pf, y)]
    pc = np.clip(pf, 1e-9, 1 - 1e-9)
    byp = {}
    for pool in ("men", "women"):
        sel = [j for j, i in enumerate(idx) if bool(rows[i]["women"]) == (pool == "women")]
        if len(sel) > 40:
            ys_, a_, b_ = y[sel], pf[sel], pd[sel]
            g_ = m.bootstrap(a_, b_, lambda p: (p - ys_) ** 2)
            byp[pool] = {"bouts": len(sel), "finishRate": round(float(ys_.mean()), 4),
                         "brier": round(float(np.mean((a_ - ys_) ** 2)), 4), "divisionBrier": round(float(np.mean((b_ - ys_) ** 2)), 4),
                         "brierGain": round(g_[0], 4), "gainInterval": [round(g_[1], 4), round(g_[2], 4)]}
    finish = {"byPool": byp, "l2": l2, "bouts": len(idx), "finishRate": round(float(y.mean()), 4),
              "accuracy": round(float(np.mean(hit)), 4), "brier": round(float(np.mean((pf - y) ** 2)), 4),
              "divisionBrier": round(float(np.mean((pd - y) ** 2)), 4),
              "brierGain": round(gain[0], 4), "gainInterval": [round(gain[1], 4), round(gain[2], 4)],
              "logLoss": round(float(-np.mean(y * np.log(pc) + (1 - y) * np.log(1 - pc))), 4)}
    # method of victory given the winner
    wins = []
    for r in rows:
        w, l = (r["a"], r["b"]) if r["y"] == 1 else (r["b"], r["a"])
        wins.append(m.winner_features(w, l, r))
    Xw = np.array(wins); mw, sw = Xw.mean(0), Xw.std(0) + 1e-9
    Zw = (Xw - mw) / sw
    yc = np.array([m.CLASSES.index(r["method"]) for r in rows])
    PM = {"division": {}, "model": {}}
    for q in quarters:
        if q < pred.FIRST_PRED_QUARTER:
            continue
        tr, te = np.where(qof < q)[0], np.where(qof == q)[0]
        if len(tr) < 300 or not len(te):
            continue
        base = np.bincount(yc[tr], minlength=3) / len(tr)
        dn = defaultdict(lambda: np.zeros(3))
        for i in tr:
            dn[divs[i]][yc[i]] += 1
        W = m.fit_multi(Zw[tr], yc[tr], 3, l2=len(tr) * 0.02)
        for i in te:
            c = dn[divs[i]]
            PM["division"][i] = (c + 30 * base) / (c.sum() + 30)
            PM["model"][i] = m.softmax(np.append(Zw[i], 1.0)[None, :] @ W)[0]
    idx2 = [i for i in range(len(rows)) if dates[i] >= m.TEST_FROM and i in PM["model"] and i in PM["division"]]
    pm = np.array([PM["model"][i][yc[i]] for i in idx2]); pdv = np.array([PM["division"][i][yc[i]] for i in idx2])
    g2 = m.bootstrap(pm, pdv, lambda p: -np.log(np.clip(p, 1e-9, 1)))
    mbp = {}
    for pool in ("men", "women"):
        sel = [j for j, i in enumerate(idx2) if bool(rows[i]["women"]) == (pool == "women")]
        if len(sel) > 40:
            a_, b_ = pm[sel], pdv[sel]
            g_ = m.bootstrap(a_, b_, lambda p: -np.log(np.clip(p, 1e-9, 1)))
            mbp[pool] = {"bouts": len(sel), "logLoss": round(float(-np.mean(np.log(np.clip(a_, 1e-9, 1)))), 4),
                         "divisionLogLoss": round(float(-np.mean(np.log(np.clip(b_, 1e-9, 1)))), 4),
                         "logLossGain": round(g_[0], 4), "gainInterval": [round(g_[1], 4), round(g_[2], 4)]}
    method = {"byPool": mbp, "bouts": len(idx2), "l2PerBout": 0.02,
              "logLoss": round(float(-np.mean(np.log(np.clip(pm, 1e-9, 1)))), 4),
              "divisionLogLoss": round(float(-np.mean(np.log(np.clip(pdv, 1e-9, 1)))), 4),
              "logLossGain": round(g2[0], 4), "gainInterval": [round(g2[1], 4), round(g2[2], 4)],
              "topMethodAccuracy": round(float(np.mean([np.argmax(PM["model"][i]) == yc[i] for i in idx2])), 4),
              "classRates": {c: round(float(np.mean(yc[idx2] == k)), 4) for k, c in enumerate(m.CLASSES)}}
    return finish, method


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--reuse", action="store_true")
    args = ap.parse_args()
    ev = load("ufc_eval", "scripts/ufc-rating-evaluate.py")
    vr = load("ufc_variants", "scripts/ufc-rating-variants.py")
    m = load("ufc_method", "scripts/ufc-method-research.py")
    as_of = json.loads((ROOT / "data/ufc-stats/index.json").read_text())["asOf"]
    rows = m.pred.build_rows()
    women = {r["id"]: r["women"] for r in rows}
    winner = winner_part(ev, vr, args.reuse, women)
    finish, method = finish_and_method(m, rows)
    # Would models fitted inside one pool do better than the joint model (which carries a women flag)?
    sep = {}
    for pool in ("men", "women"):
        f_, m_ = finish_and_method(m, [r for r in rows if bool(r["women"]) == (pool == "women")])
        sep[pool] = {"finishBrier": f_["brier"], "finishDivisionBrier": f_["divisionBrier"], "finishBouts": f_["bouts"],
                     "methodLogLoss": m_["logLoss"], "methodDivisionLogLoss": m_["divisionLogLoss"], "methodBouts": m_["bouts"]}
    out = {"schema": 1, "statsAsOf": as_of, "testFrom": m.TEST_FROM, "winner": winner, "finish": finish, "method": method,
           "separateFitCheck": sep}
    OUT.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
    print(json.dumps(out, indent=1, sort_keys=True))


if __name__ == "__main__":
    main()
