#!/usr/bin/env python3
"""Fight prediction research (26 Nov 2026, owner: build UFC fight predictions behind a research gate).

RESEARCH ONLY: offline, read-only, writes nothing but an optional Markdown report. Nothing here is shown on the site.

Question: can a statistical or machine-learning model beat the BEFN rating at picking the winner of the next UFC bout?
The gate (docs/design/DECISIONS.md, 26 Nov): ship only if the Brier score beats the rating's walk-forward Brier with a
95% bootstrap interval that excludes zero.

Method
  * One row per decided UFC bout between two fighters the stats build holds. Everything about a fighter comes from fights
    BEFORE the bout date (point in time): the results Elo going into the bout (scripts/build-ufc-fighter-form.py
    rating_history), recency-weighted career rates from the round statistics (18-month half-life, shrunk toward the
    population mean by exposure), finish and round-1 / late-round finish rates, layoff, age, height, title fight, sex.
  * Each bout is used from both corners (A,B,y and B,A,1-y) and scored as the average of both orderings, so a model can never
    prefer a corner.
  * Walk-forward by calendar quarter: a model for quarter q is fitted only on bouts before q. The test period is 2024-01-01
    onward, the same fights and the same quarterly protocol as scripts/ufc-rating-evaluate.py. The one-parameter logistic
    baselines fit their slope the same way.
  * The rating baseline is the production BEFN rating difference at each quarter cut (from scripts/ufc-rating-variants.py
    `run title_no_drift`, /tmp/ufc-variants/), scored on exactly the same bouts.
  * Model settings are fixed in advance and were chosen on bouts before 2024 only.

  python3 scripts/ufc-rating-variants.py run title_no_drift      # once: the rating baseline
  python3 scripts/ufc-prediction-research.py [--out report.md]
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import math
import random
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
VARIANTS = Path("/tmp/ufc-variants/title_no_drift.json")
TEST_FROM = "2024-01-01"
FIRST_PRED_QUARTER = dt.date(2019, 1, 1)    # models predict from here, so tuning and calibration only ever see the past
TUNE_FROM, TUNE_TO = "2021-01-01", "2023-12-31"   # the pre-test window used to choose the L2 strength
HALF_LIFE_MONTHS = 18.0
F = {k: i for i, k in enumerate(
    ["sigL", "sigA", "totL", "totA", "headL", "headA", "bodyL", "bodyA", "legL", "legA", "disL", "disA", "cliL", "cliA",
     "gndL", "gndA", "kd", "td", "tdA", "subA", "rev", "ctrl", "disT", "cliT", "gndT"])}


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def side_sum(rounds, side):
    """Sum one corner's round statistics over a fight; a missing figure counts as 0."""
    return np.sum([[0.0 if v is None else v for v in r[side]] for r in rounds], axis=0)


def days(a, b):
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


# ---------------------------------------------------------------- features
FEATURES = ["slpm", "sapm", "sigAcc", "strDef", "kd15", "kdAbs15", "td15", "tdAcc", "tdDef", "tdAbs15", "sub15",
            "subAbs15", "ctrl", "ctrlAgainst", "standing", "damage", "win", "koWin", "subWin", "decWin", "koLoss",
            "subLoss", "finish", "r1Finish", "lateFinish", "titleExp"]
PRIOR = {}   # filled from the training period


def fighter_state(fights, born, height, when, today_title):
    """Features of one fighter going into a bout on `when`, from fights dated before it. None when there are none."""
    prior = [f for f in fights if f["date"] < when]
    if not prior:
        return None
    n = len(prior)
    num, den = {}, {}

    def add(key, value, weight):
        num[key] = num.get(key, 0.0) + value * weight

    wsum = 0.0
    mins = 0.0   # weighted cage minutes with complete stats
    S = {k: 0.0 for k in ("sigL", "sigA", "osigL", "osigA", "kd", "okd", "td", "tdA", "otd", "otdA", "sub", "osub", "ctrl",
                          "octrl", "secs", "dis", "all", "ratioN")}
    R = {k: 0.0 for k in ("win", "ko", "sub", "dec", "koL", "subL", "fin", "r1", "late", "title", "w")}
    for f in prior:
        w = 0.5 ** (days(f["date"], when) / 30.44 / HALF_LIFE_MONTHS)
        R["w"] += w
        won = f["outcome"] == "W"
        meth = f.get("method")
        R["win"] += w * (1.0 if won else 0.5 if f["outcome"] == "D" else 0.0)
        if won:
            R["ko"] += w * (meth == "ko")
            R["sub"] += w * (meth == "sub")
            R["dec"] += w * (meth == "dec")
            if meth in ("ko", "sub"):
                R["fin"] += w
                rd = f.get("endRound") or 0
                R["r1"] += w * (rd == 1)
                R["late"] += w * (rd >= 3)
        elif f["outcome"] == "L":
            R["koL"] += w * (meth == "ko")
            R["subL"] += w * (meth == "sub")
        R["title"] += w * bool(f.get("titleFight"))
        if f.get("statsComplete") and f.get("rounds"):
            mine = side_sum(f["rounds"], 2)
            theirs = side_sum(f["rounds"], 3)
            secs = sum(r[1] or 0 for r in f["rounds"])
            m = secs / 60.0
            S["secs"] += w * secs
            mins += w * m
            S["sigL"] += w * mine[F["sigL"]]; S["sigA"] += w * mine[F["sigA"]]
            S["osigL"] += w * theirs[F["sigL"]]; S["osigA"] += w * theirs[F["sigA"]]
            S["kd"] += w * mine[F["kd"]]; S["okd"] += w * theirs[F["kd"]]
            S["td"] += w * mine[F["td"]]; S["tdA"] += w * mine[F["tdA"]]
            S["otd"] += w * theirs[F["td"]]; S["otdA"] += w * theirs[F["tdA"]]
            S["sub"] += w * mine[F["subA"]]; S["osub"] += w * theirs[F["subA"]]
            S["ctrl"] += w * mine[F["ctrl"]]; S["octrl"] += w * theirs[F["ctrl"]]
            S["dis"] += w * mine[F["disT"]]
            S["all"] += w * (mine[F["disT"]] + mine[F["cliT"]] + mine[F["gndT"]])
    pr = PRIOR
    sh = lambda s, e, key, k: (s + k * pr[key]) / (e + k)       # exposure-shrunk rate toward the training mean
    m15 = mins / 15.0 if mins else 0.0
    out = {
        "slpm": sh(S["sigL"], mins, "slpm", 15), "sapm": sh(S["osigL"], mins, "sapm", 15),
        "sigAcc": sh(S["sigL"], S["sigA"], "sigAcc", 60), "strDef": 1 - sh(S["osigL"], S["osigA"], "oSigAcc", 60),
        "kd15": sh(S["kd"], m15, "kd15", 1.0), "kdAbs15": sh(S["okd"], m15, "kdAbs15", 1.0),
        "td15": sh(S["td"], m15, "td15", 1.0), "tdAcc": sh(S["td"], S["tdA"], "tdAcc", 8),
        "tdDef": 1 - sh(S["otd"], S["otdA"], "oTdAcc", 8), "tdAbs15": sh(S["otd"], m15, "tdAbs15", 1.0),
        "sub15": sh(S["sub"], m15, "sub15", 1.0), "subAbs15": sh(S["osub"], m15, "subAbs15", 1.0),
        "ctrl": sh(S["ctrl"], S["secs"], "ctrl", 300), "ctrlAgainst": sh(S["octrl"], S["secs"], "ctrlAgainst", 300),
        "standing": sh(S["dis"], S["all"], "standing", 300),
        "damage": math.log((S["sigL"] + 20 * pr["one"]) / (S["osigL"] + 20 * pr["one"])),
        "win": (R["win"] + 2 * 0.5) / (R["w"] + 2), "koWin": sh(R["ko"], R["w"], "koWin", 3), "subWin": sh(R["sub"], R["w"], "subWin", 3),
        "decWin": sh(R["dec"], R["w"], "decWin", 3), "koLoss": sh(R["koL"], R["w"], "koLoss", 3),
        "subLoss": sh(R["subL"], R["w"], "subLoss", 3), "finish": sh(R["fin"], R["w"], "finish", 3),
        "r1Finish": sh(R["r1"], R["w"], "r1Finish", 3), "lateFinish": sh(R["late"], R["w"], "lateFinish", 3),
        "titleExp": R["title"],
        "n": n, "layoff": min(days(prior[-1]["date"], when), 1500) if prior else 1500,
        "age": None if not born else (dt.date.fromisoformat(when) - dt.date.fromisoformat(born)).days / 365.25,
        "height": height,
    }
    return out


def population_prior(files, until):
    """Training-period means used to shrink thin careers: simple averages over every fight before `until`."""
    tot = {k: 0.0 for k in ("sigL", "sigA", "osigL", "osigA", "kd", "okd", "td", "tdA", "otd", "otdA", "sub", "osub", "ctrl",
                            "octrl", "secs", "dis", "all", "mins", "fights", "ko", "subw", "dec", "koL", "subL", "fin", "r1",
                            "late")}
    for fights in files.values():
        for f in fights:
            if f["date"] >= until:
                continue
            tot["fights"] += 1
            won, meth = f["outcome"] == "W", f.get("method")
            tot["ko"] += won and meth == "ko"; tot["subw"] += won and meth == "sub"; tot["dec"] += won and meth == "dec"
            tot["koL"] += f["outcome"] == "L" and meth == "ko"; tot["subL"] += f["outcome"] == "L" and meth == "sub"
            if won and meth in ("ko", "sub"):
                tot["fin"] += 1
                tot["r1"] += (f.get("endRound") or 0) == 1
                tot["late"] += (f.get("endRound") or 0) >= 3
            if f.get("statsComplete") and f.get("rounds"):
                mine = side_sum(f["rounds"], 2)
                theirs = side_sum(f["rounds"], 3)
                secs = sum(r[1] or 0 for r in f["rounds"])
                tot["secs"] += secs; tot["mins"] += secs / 60.0
                tot["sigL"] += mine[F["sigL"]]; tot["sigA"] += mine[F["sigA"]]
                tot["osigL"] += theirs[F["sigL"]]; tot["osigA"] += theirs[F["sigA"]]
                tot["kd"] += mine[F["kd"]]; tot["okd"] += theirs[F["kd"]]
                tot["td"] += mine[F["td"]]; tot["tdA"] += mine[F["tdA"]]
                tot["otd"] += theirs[F["td"]]; tot["otdA"] += theirs[F["tdA"]]
                tot["sub"] += mine[F["subA"]]; tot["osub"] += theirs[F["subA"]]
                tot["ctrl"] += mine[F["ctrl"]]; tot["octrl"] += theirs[F["ctrl"]]
                tot["dis"] += mine[F["disT"]]
                tot["all"] += mine[F["disT"]] + mine[F["cliT"]] + mine[F["gndT"]]
    m15, nf = tot["mins"] / 15.0, tot["fights"]
    return {"slpm": tot["sigL"] / tot["mins"], "sapm": tot["osigL"] / tot["mins"], "sigAcc": tot["sigL"] / tot["sigA"],
            "oSigAcc": tot["osigL"] / tot["osigA"], "kd15": tot["kd"] / m15, "kdAbs15": tot["okd"] / m15,
            "td15": tot["td"] / m15, "tdAcc": tot["td"] / tot["tdA"], "oTdAcc": tot["otd"] / tot["otdA"],
            "tdAbs15": tot["otd"] / m15, "sub15": tot["sub"] / m15, "subAbs15": tot["osub"] / m15,
            "ctrl": tot["ctrl"] / tot["secs"], "ctrlAgainst": tot["octrl"] / tot["secs"], "standing": tot["dis"] / tot["all"],
            "koWin": tot["ko"] / nf, "subWin": tot["subw"] / nf, "decWin": tot["dec"] / nf, "koLoss": tot["koL"] / nf,
            "subLoss": tot["subL"] / nf, "finish": tot["fin"] / nf, "r1Finish": tot["r1"] / nf, "lateFinish": tot["late"] / nf,
            "one": 1.0}


# ---------------------------------------------------------------- data
def build_rows():
    sys.path.insert(0, str(ROOT / "scripts"))
    fb = load("fighter_form", ROOT / "scripts/build-ufc-fighter-form.py")
    as_of = json.loads((ROOT / "data/ufc-stats/index.json").read_text())["asOf"]
    ratings, _, _ = fb.rating_history(fb.load_build(), dt.date.fromisoformat(as_of))
    born = json.loads((ROOT / "data/ufc-fighter-born.json").read_text())
    heights = born.get("heightInches") or {}
    born = born["fighters"]
    files, meta = {}, {}
    for p in sorted((ROOT / "data/ufc-stats/fighters").glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        files[d["slug"]] = sorted(d["fights"], key=lambda f: (f["date"], str(f["boutId"])))
        meta[d["slug"]] = {"women": str(d.get("divisionSlug") or "").startswith("womens-"), "name": d["name"]}
    PRIOR.update(population_prior(files, TEST_FROM))
    rows, seen = [], set()
    for slug, fights in files.items():
        for f in fights:
            bout, opp = str(f["boutId"]), f.get("opponentSlug")
            if bout in seen or f["outcome"] not in ("W", "L") or opp not in files:
                continue
            r = ratings.get(bout) or {}
            if r.get(slug) is None or r.get(opp) is None:
                continue
            a = fighter_state(files[slug], born.get(slug), heights.get(slug), f["date"], False)
            b = fighter_state(files[opp], born.get(opp), heights.get(opp), f["date"], False)
            if a is None or b is None:
                continue
            seen.add(bout)
            rows.append({"id": bout, "date": f["date"], "y": 1 if f["outcome"] == "W" else 0, "a": a, "b": b,
                         "eloA": r[slug], "eloB": r[opp], "title": 1.0 if f.get("titleFight") else 0.0,
                         "women": 1.0 if meta[slug]["women"] else 0.0})
    rows.sort(key=lambda r: (r["date"], r["id"]))
    return rows


def vec(row, swap=False):
    a, b = (row["b"], row["a"]) if swap else (row["a"], row["b"])
    ea, eb = (row["eloB"], row["eloA"]) if swap else (row["eloA"], row["eloB"])
    d = [a[k] - b[k] for k in FEATURES]
    age = (a["age"] - b["age"]) if a["age"] is not None and b["age"] is not None else 0.0
    ht = (a["height"] - b["height"]) if a["height"] and b["height"] else 0.0
    ctx = [ea - eb, (ea + eb) / 2 - 1500, age, ht, min(a["n"], 15) - min(b["n"], 15),
           (min(a["layoff"], 1500) - min(b["layoff"], 1500)) / 365.0,
           row["title"], row["women"], min(a["n"], b["n"])]
    return d + ctx


NAMES = FEATURES + ["eloDiff", "eloLevel", "ageDiff", "heightDiff", "nFightsDiff", "layoffDiff", "title", "women", "minFights"]
ELO, AGE, HEIGHT = NAMES.index("eloDiff"), NAMES.index("ageDiff"), NAMES.index("heightDiff")


# ---------------------------------------------------------------- models
def logistic(z):
    return 1 / (1 + np.exp(-np.clip(z, -30, 30)))


def fit_logreg(X, y, l2=1.0, iters=200):
    """L2 logistic regression with no intercept (the data is corner-symmetric), by Newton steps."""
    n, d = X.shape
    w = np.zeros(d)
    for _ in range(iters):
        p = logistic(X @ w)
        g = X.T @ (p - y) + l2 * w
        H = (X * (p * (1 - p))[:, None]).T @ X + l2 * np.eye(d)
        step = np.linalg.solve(H, g)
        w -= step
        if np.abs(step).max() < 1e-9:
            break
    return w


def score(p, y):
    p = np.clip(p, 1e-9, 1 - 1e-9)
    return {"n": len(y), "acc": float(np.mean((p > .5) == (y == 1))), "brier": float(np.mean((p - y) ** 2)),
            "logloss": float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))}


def ece(p, y, bins=10):
    both_p = np.concatenate([p, 1 - p]); both_y = np.concatenate([y, 1 - y])
    edges = np.linspace(0, 1, bins + 1)
    tot = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (both_p >= lo) & ((both_p < hi) | (hi == 1))
        if m.any():
            tot += m.mean() * abs(both_p[m].mean() - both_y[m].mean())
    return float(tot)


def bootstrap(pa, pb, y, reps=2000, seed=7):
    """95% interval of Brier(b) - Brier(a): positive means a is better."""
    rnd = np.random.default_rng(seed)
    d = (pb - y) ** 2 - (pa - y) ** 2
    n = len(y)
    xs = np.sort([d[rnd.integers(0, n, n)].mean() for _ in range(reps)])
    return float(d.mean()), float(xs[int(.025 * reps)]), float(xs[int(.975 * reps) - 1])


def quarter_of(date):
    d = dt.date.fromisoformat(date)
    return dt.date(d.year, 3 * ((d.month - 1) // 3) + 1, 1)


LGB_PARAMS = dict(objective="binary", learning_rate=0.03, num_leaves=6, min_data_in_leaf=60, feature_fraction=0.7,
                  bagging_fraction=0.8, bagging_freq=1, lambda_l2=10.0, verbose=-1, seed=11, num_threads=2)
LGB_ROUNDS = 250


def run(rows, models):
    import lightgbm as lgb
    X = np.array([vec(r) for r in rows]); Xs = np.array([vec(r, True) for r in rows])
    y = np.array([r["y"] for r in rows], float)
    quarters = sorted({quarter_of(r["date"]) for r in rows})
    qof = np.array([quarter_of(r["date"]) for r in rows])
    mu, sd = X.mean(0), X.std(0) + 1e-9
    preds = {m: {} for m in models}
    for q in quarters:
        if q < FIRST_PRED_QUARTER:
            continue
        tr, te = np.where(qof < q)[0], np.where(qof == q)[0]
        if len(tr) < 300 or not len(te):
            continue
        # symmetric training set: each bout from both corners
        Xtr = np.vstack([X[tr], Xs[tr]]); ytr = np.concatenate([y[tr], 1 - y[tr]])
        for m in models:
            if m == "elo":            # slope on the results Elo difference alone
                cols = [ELO]
            elif m == "elo+age+height":
                cols = [ELO, AGE, HEIGHT]
            elif m == "elo+age+height+layoff":
                cols = [ELO, AGE, HEIGHT, NAMES.index("layoffDiff"), NAMES.index("title")]
            if m in ("elo", "elo+age+height", "elo+age+height+layoff"):
                s = sd[cols]
                w = fit_logreg(Xtr[:, cols] / s, ytr, l2=0.5)
                f = lambda M: logistic((M[:, cols] / s) @ w)
            elif m.startswith("logreg_l2="):
                w = fit_logreg((Xtr - mu) / sd, ytr, l2=float(m.split("=")[1]))
                f = lambda M, w=w: logistic(((M - mu) / sd) @ w)
            elif m in ("lgbm", "lgbm_nostat"):
                cols = list(range(len(NAMES))) if m == "lgbm" else [NAMES.index(k) for k in
                                                                    ["win", "koWin", "subWin", "decWin", "koLoss", "subLoss",
                                                                     "finish", "r1Finish", "lateFinish", "titleExp", "eloDiff",
                                                                     "eloLevel", "ageDiff", "heightDiff", "nFightsDiff",
                                                                     "layoffDiff", "title", "women", "minFights"]]
                booster = lgb.train(LGB_PARAMS, lgb.Dataset(Xtr[:, cols], ytr), LGB_ROUNDS)
                f = lambda M, b=booster, c=cols: b.predict(M[:, c])
            pa, pb = f(X[te]), f(Xs[te])
            p = 0.5 * (pa + (1 - pb))          # average of both corner orderings
            for i, v in zip(te, p):
                preds[m][i] = float(v)

    return preds, X, y, quarters


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out")
    args = ap.parse_args()
    if not VARIANTS.exists():
        sys.exit("run first: python3 scripts/ufc-rating-variants.py run title_no_drift")
    print("building point-in-time features ...", file=sys.stderr)
    rows = build_rows()
    print(f"{len(rows)} bouts with features", file=sys.stderr)
    l2s = [5, 20, 80, 300]
    models = ["elo", "elo+age+height", "elo+age+height+layoff", *[f"logreg_l2={v}" for v in l2s], "lgbm_nostat", "lgbm"]
    preds, X, y, quarters = run(rows, models)
    dates = [r["date"] for r in rows]

    def brier_in(m, lo, hi):
        ii = [i for i in preds[m] if lo <= dates[i] <= hi]
        return float(np.mean([(preds[m][i] - y[i]) ** 2 for i in ii])), len(ii)
    # 1. choose the L2 strength on the 2021-2023 walk-forward predictions only
    tune = {m: brier_in(m, TUNE_FROM, TUNE_TO) for m in models if m.startswith("logreg_l2=")}
    chosen = min(tune, key=lambda m: tune[m][0])
    preds["logreg"] = preds[chosen]
    # 2. calibrate: a slope on the logit, fitted on earlier quarters' out-of-sample predictions (never the quarter scored)
    def calibrate(base, name):
        preds[name] = {}
        for q in quarters:
            if q < dt.date(2021, 1, 1):
                continue
            past = [i for i in preds[base] if quarter_of(dates[i]) < q]
            now = [i for i in preds[base] if quarter_of(dates[i]) == q]
            if len(past) < 300 or not now:
                continue
            z = np.array([math.log(preds[base][i] / (1 - preds[base][i])) for i in past])
            yy = y[past]
            z2, y2 = np.concatenate([z, -z]), np.concatenate([yy, 1 - yy])          # both corners, so no intercept
            a = fit_logreg(z2[:, None], y2, l2=1.0)[0]
            for i in now:
                zi = math.log(preds[base][i] / (1 - preds[base][i]))
                preds[name][i] = float(logistic(a * zi))
    calibrate("logreg", "logreg_calibrated")
    # 3. blends
    preds["ensemble"] = {i: 0.5 * (preds["logreg"][i] + preds["lgbm"][i]) for i in preds["logreg"] if i in preds["lgbm"]}
    calibrate("ensemble", "ensemble_calibrated")
    models = ["elo", "elo+age+height", "elo+age+height+layoff", "logreg", "logreg_calibrated", "lgbm_nostat", "lgbm", "ensemble",
              "ensemble_calibrated"]
    print("L2 chosen on %s to %s: %s (Brier by strength: %s)" % (TUNE_FROM, TUNE_TO, chosen, {m: round(v[0], 4) for m, v in tune.items()}),
          file=sys.stderr)
    # production rating baseline on the same bouts, same walk-forward slope (rows of ufc-rating-variants.py)
    rating = {r["id"]: r for r in json.loads(VARIANTS.read_text())}
    ids = [r["id"] for r in rows]
    idx = [i for i in range(len(rows)) if rows[i]["date"] >= TEST_FROM and ids[i] in rating and
           all(i in preds[m] for m in models)]
    tuned_note = f"Regularisation chosen on {TUNE_FROM} to {TUNE_TO} walk-forward predictions only: {chosen} (Brier {tune[chosen][0]:.4f} on {tune[chosen][1]} bouts)."
    by_fold = {}
    rp = {}
    for fold in sorted({rating[ids[i]]["fold"] for i in idx}):
        tr = [r for r in rating.values() if r["fold"] < fold]
        if len(tr) < 100:
            continue
        # slope of the logistic on the rating difference, fitted on earlier folds
        d = np.array([r["d"] for r in tr]); yy = np.array([r["y"] for r in tr], float)
        k = 0.0
        for _ in range(60):
            p = logistic(k * d); g = np.sum((yy - p) * d); h = -np.sum(p * (1 - p) * d * d)
            if not h:
                break
            step = g / h; k -= step
            if abs(step) < 1e-10:
                break
        for i in idx:
            if rating[ids[i]]["fold"] == fold:
                pr = float(logistic(k * rating[ids[i]]["d"]))    # for the corner the rating rows use
                # a bout's winner is one corner, so equal outcomes mean both tables use the same corner; otherwise flip
                rp[i] = pr if rating[ids[i]]["y"] == int(y[i]) else 1 - pr
    idx = [i for i in idx if i in rp]
    yt = y[idx]
    P = {"BEFN rating (production)": np.array([rp[i] for i in idx])}
    for m in models:
        P[m] = np.array([preds[m][i] for i in idx])
    out = [f"# Fight prediction research: walk-forward, {len(idx)} UFC bouts from {TEST_FROM}", "",
           "| Model | Accuracy | Brier | Log loss | Calibration error | Brier gain vs rating (95% interval) |", "|---|---:|---:|---:|---:|---|"]
    base = P["BEFN rating (production)"]
    for name, p in P.items():
        s = score(p, yt)
        gain = "" if p is base else "%+.4f (%+.4f to %+.4f)" % bootstrap(p, base, yt)
        out.append(f"| {name} | {100 * s['acc']:.1f}% | {s['brier']:.4f} | {s['logloss']:.4f} | {ece(p, yt):.3f} | {gain} |")
    out += ["", tuned_note, "", f"Features: {len(NAMES)} (differences between the two fighters, plus context). Test bouts that are title fights: "
            f"{int(sum(rows[i]['title'] for i in idx))}; women's bouts: {int(sum(rows[i]['women'] for i in idx))}."]
    # by year and by experience
    out += ["", "By year (accuracy / Brier): rating vs best model", ""]
    best = min((m for m in models if m != "elo"), key=lambda m: score(P[m], yt)["brier"])
    out.append(f"Best model by Brier: {best}")
    for yr in sorted({rows[i]["date"][:4] for i in idx}):
        sel = np.array([rows[i]["date"][:4] == yr for i in idx])
        a, b = score(base[sel], yt[sel]), score(P[best][sel], yt[sel])
        out.append(f"- {yr}: {sel.sum()} bouts, rating {100 * a['acc']:.1f}% / {a['brier']:.4f}, {best} {100 * b['acc']:.1f}% / {b['brier']:.4f}")
    thin = np.array([min(rows[i]["a"]["n"], rows[i]["b"]["n"]) < 3 for i in idx])
    for label, sel in (("a fighter with under 3 earlier UFC fights", thin), ("both with 3 or more", ~thin)):
        a, b = score(base[sel], yt[sel]), score(P[best][sel], yt[sel])
        out.append(f"- {label}: {sel.sum()} bouts, rating {100 * a['acc']:.1f}% / {a['brier']:.4f}, {best} {100 * b['acc']:.1f}% / {b['brier']:.4f}")
    # calibration of the best model, each bout from both sides
    both_p = np.concatenate([P[best], 1 - P[best]]); both_y = np.concatenate([yt, 1 - yt])
    out += ["", f"Calibration of {best} (each bout counted from both sides):", "", "| Predicted | Fighter-fights | Mean predicted | Won |", "|---|---:|---:|---:|"]
    for lo, hi in ((0, .3), (.3, .4), (.4, .5), (.5, .6), (.6, .7), (.7, 1.01)):
        m = (both_p >= lo) & (both_p < hi)
        if m.any():
            out.append(f"| {lo:.1f} to {min(hi, 1):.1f} | {int(m.sum())} | {both_p[m].mean():.3f} | {both_y[m].mean():.3f} |")
    text = "\n".join(out)
    print(text)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
