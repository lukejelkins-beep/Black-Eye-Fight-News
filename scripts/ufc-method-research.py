#!/usr/bin/env python3
"""Method and finish prediction research (26 Nov 2026; the second half of the fight prediction research).

RESEARCH ONLY: offline, read-only, nothing is shown on the site. Same point-in-time bout table and the same quarterly
walk-forward as scripts/ufc-prediction-research.py (models for a quarter are fitted on earlier bouts only; test = 2024-01-01
onward; the L2 strength and any scale are chosen on 2021-2023 predictions only).

Two questions, each against a base-rate baseline:
  1. Does the fight end in a finish (KO/TKO or submission) or go the distance?  Binary; baselines: the overall finish rate and
     the fighter-pair's division finish rate.
  2. Given who wins, how: KO/TKO, submission or decision?  Three classes; baseline: the division's rates.
Combined with the winner probability they give the six-way outcome the fight card would show (who, and how).

  python3 scripts/ufc-method-research.py [--out report.md]
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("pred", ROOT / "scripts/ufc-prediction-research.py")
pred = importlib.util.module_from_spec(spec)
sys.modules["pred"] = pred
spec.loader.exec_module(pred)

TEST_FROM = "2024-01-01"
CLASSES = ("ko", "sub", "dec")


def pair_features(a, b, row):
    """Symmetric features of a pairing (the fight's finishing potential): means and sums over the two fighters."""
    m = lambda k: (a[k] + b[k]) / 2
    return [m("finish"), m("koWin"), m("subWin"), m("koLoss"), m("subLoss"), m("r1Finish"), m("lateFinish"), m("kd15"),
            m("kdAbs15"), m("sub15"), m("subAbs15"), m("slpm"), m("sapm"), m("td15"), m("ctrl"), m("standing"),
            abs(row["eloA"] - row["eloB"]) / 100, (row["eloA"] + row["eloB"]) / 2 - 1500, row["title"], row["women"],
            ((a["age"] or 31) + (b["age"] or 31)) / 2, min(a["n"], b["n"]), m("decWin")]


def winner_features(w, l, row):
    """Winner's offence against the loser's defence, for the method of victory (the winner is known when scoring)."""
    return [w["koWin"], w["subWin"], w["decWin"], w["kd15"], w["slpm"], w["td15"], w["sub15"], w["ctrl"], w["r1Finish"],
            l["koLoss"], l["subLoss"], l["kdAbs15"], l["sapm"], 1 - l["tdDef"], l["subAbs15"], l["ctrlAgainst"],
            (row["eloA"] - row["eloB"]) / 100 * 0, row["title"], row["women"], w["n"], l["n"]]


def logistic(z):
    return 1 / (1 + np.exp(-np.clip(z, -30, 30)))


def fit_binary(X, y, l2):
    X1 = np.hstack([X, np.ones((len(X), 1))])
    w = np.zeros(X1.shape[1])
    reg = np.full(X1.shape[1], l2); reg[-1] = 0.0
    for _ in range(200):
        p = logistic(X1 @ w)
        g = X1.T @ (p - y) + reg * w
        H = (X1 * (p * (1 - p))[:, None]).T @ X1 + np.diag(reg)
        step = np.linalg.solve(H, g)
        w -= step
        if np.abs(step).max() < 1e-9:
            break
    return w


def softmax(Z):
    Z = Z - Z.max(1, keepdims=True)
    E = np.exp(Z)
    return E / E.sum(1, keepdims=True)


def fit_multi(X, y, k, l2, iters=300, lr=0.5):
    """Multinomial logistic by gradient descent with L2 (small data, three classes)."""
    n, d = X.shape
    W = np.zeros((d + 1, k))
    X1 = np.hstack([X, np.ones((n, 1))])
    Y = np.eye(k)[y]
    for _ in range(iters):
        P = softmax(X1 @ W)
        G = X1.T @ (P - Y) / n
        G[:-1] += l2 * W[:-1] / n
        W -= lr * G
    return W


def quarter_of(date):
    return pred.quarter_of(date)


def bootstrap(pa, pb, loss, reps=2000, seed=7):
    """Interval of mean loss(b) - mean loss(a): positive means a is better. loss arrays are per-bout losses."""
    d = loss(pb) - loss(pa)
    rnd = np.random.default_rng(seed)
    n = len(d)
    xs = np.sort([d[rnd.integers(0, n, n)].mean() for _ in range(reps)])
    return float(d.mean()), float(xs[int(.025 * reps)]), float(xs[int(.975 * reps) - 1])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out")
    args = ap.parse_args()
    rows = pred.build_rows()
    rows = [r for r in rows if r["method"] in ("ko", "sub", "dec")]
    dates = [r["date"] for r in rows]
    quarters = sorted({quarter_of(d) for d in dates})
    qof = np.array([quarter_of(d) for d in dates])
    fin = np.array([1.0 if r["method"] in ("ko", "sub") else 0.0 for r in rows])
    Xp = np.array([pair_features(r["a"], r["b"], r) for r in rows])
    mu, sd = Xp.mean(0), Xp.std(0) + 1e-9
    divs = [r["div"] or "none" for r in rows]
    import lightgbm as lgb

    # ---- 1. finish or distance
    base_all, base_div, lr = {}, {}, {}
    l2s = [10, 50, 200, 800]
    P = {name: {} for name in ["base", "division", *[f"logistic l2={v}" for v in l2s], "lgbm"]}
    for q in quarters:
        if q < pred.FIRST_PRED_QUARTER:
            continue
        tr, te = np.where(qof < q)[0], np.where(qof == q)[0]
        if len(tr) < 300 or not len(te):
            continue
        rate = fin[tr].mean()
        d_n, d_s = defaultdict(float), defaultdict(float)
        for i in tr:
            d_n[divs[i]] += 1; d_s[divs[i]] += fin[i]
        for i in te:
            P["base"][i] = rate
            P["division"][i] = (d_s[divs[i]] + 30 * rate) / (d_n[divs[i]] + 30)    # shrunk division finish rate
        Z = (Xp - mu) / sd
        for l2 in l2s:
            w = fit_binary(Z[tr], fin[tr], l2)
            for i in te:
                P[f"logistic l2={l2}"][i] = float(logistic(np.append(Z[i], 1.0) @ w))
        booster = lgb.train(dict(pred.LGB_PARAMS, num_leaves=4, min_data_in_leaf=80), lgb.Dataset(Xp[tr], fin[tr]), 200)
        for i, v in zip(te, booster.predict(Xp[te])):
            P["lgbm"][i] = float(v)
    brier_in = lambda m, lo, hi: np.mean([(P[m][i] - fin[i]) ** 2 for i in P[m] if lo <= dates[i] <= hi])
    chosen = min((m for m in P if m.startswith("logistic")), key=lambda m: brier_in(m, "2021-01-01", "2023-12-31"))
    idx = [i for i in range(len(rows)) if dates[i] >= TEST_FROM and all(i in P[m] for m in P)]
    y = fin[idx]
    out = [f"# Method and finish prediction research: walk-forward, {len(idx)} UFC bouts from {TEST_FROM}", "",
           "## 1. Does the fight end in a finish (KO/TKO or submission)?", "",
           f"Finish rate in the test bouts: {100 * y.mean():.1f}%. Logistic strength chosen on 2021-2023: {chosen}.", "",
           "| Model | Accuracy | Brier | Log loss | Brier gain vs division rate (95% interval) |", "|---|---:|---:|---:|---|"]
    show = {"All-time finish rate": "base", "Division finish rate": "division", "Logistic on pairing features": chosen, "LightGBM": "lgbm"}
    ref = np.array([P["division"][i] for i in idx])
    sq = lambda p: (p - y) ** 2
    for label, m in show.items():
        p = np.array([P[m][i] for i in idx])
        pc = np.clip(p, 1e-9, 1 - 1e-9)
        gain = "" if m == "division" else "%+.4f (%+.4f to %+.4f)" % bootstrap(p, ref, sq)
        out.append(f"| {label} | {100 * np.mean((p > .5) == (y == 1)):.1f}% | {np.mean((p - y) ** 2):.4f} | "
                   f"{-np.mean(y * np.log(pc) + (1 - y) * np.log(1 - pc)):.4f} | {gain} |")
    # ---- 2. method of victory given the winner
    wins = []
    for i, r in enumerate(rows):
        w, l = (r["a"], r["b"]) if r["y"] == 1 else (r["b"], r["a"])
        wins.append(winner_features(w, l, r))
    Xw = np.array(wins); mw, sw = Xw.mean(0), Xw.std(0) + 1e-9
    yc = np.array([CLASSES.index(r["method"]) for r in rows])
    PM = {name: {} for name in ["base", "division", "multinomial"]}
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
        Zw = (Xw - mw) / sw
        W = fit_multi(Zw[tr], yc[tr], 3, l2=len(tr) * 0.02)      # L2 scaled to the training size
        for i in te:
            PM["base"][i] = base
            c = dn[divs[i]]
            PM["division"][i] = (c + 30 * base) / (c.sum() + 30)
            PM["multinomial"][i] = softmax(np.append(Zw[i], 1.0)[None, :] @ W)[0]
    idx2 = [i for i in range(len(rows)) if dates[i] >= TEST_FROM and all(i in PM[m] for m in PM)]
    yy = yc[idx2]
    ll = lambda m: -np.log(np.clip(np.array([PM[m][i][yc[i]] for i in idx2]), 1e-9, 1))
    out += ["", "## 2. How does the winner win (KO/TKO, submission, decision), given who wins?", "",
            f"{len(idx2)} bouts. Classes in the test bouts: " + ", ".join(f"{c} {100 * np.mean(yy == k):.1f}%" for k, c in enumerate(CLASSES)),
            "", "| Model | Accuracy (top method) | Log loss | Loss gain vs division rates (95% interval) |", "|---|---:|---:|---|"]
    refl = ll("division")
    for label, m in (("All-time method rates", "base"), ("Division method rates", "division"), ("Multinomial on winner offence and loser defence", "multinomial")):
        L = ll(m)
        acc = np.mean([np.argmax(PM[m][i]) == yc[i] for i in idx2])
        gain = "" if m == "division" else "%+.4f (%+.4f to %+.4f)" % bootstrap(
            np.array([PM[m][i][yc[i]] for i in idx2]), np.array([PM["division"][i][yc[i]] for i in idx2]),
            lambda p: -np.log(np.clip(p, 1e-9, 1)))
        out.append(f"| {label} | {100 * acc:.1f}% | {L.mean():.4f} | {gain} |")
    text = "\n".join(out)
    print(text)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
