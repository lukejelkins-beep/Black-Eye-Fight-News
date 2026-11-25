#!/usr/bin/env python3
"""Build data/ufc-fighter-form.json: the one Form score, stages, badges and form ranks for the profile and the hub.

Specification: the Fighters hub handover of 24 Nov 2026 (docs/design/FIGHTERS-HUB-FORM.md), sections 3 to 5, with the
owner's choices of the same day (docs/design/DECISIONS.md):
  * strength on the night comes from the BEFN results rating's own point-in-time history (scripts/ufc_ratings.py
    results_walk), not a separate Elo, so the site has one rating engine;
  * Rising star and Prospect also need a modest pre-UFC career (15 or fewer pre-UFC fights) where the pre-UFC record
    is known (overall record minus UFC record, data/ufc-overall-records.json), as well as the debut-age rule;
  * Form and the BEFN rating (Overall) are shown side by side; nothing here compares them.
Form v2 (owner request, 25 Nov 2026; spec section 3): each fight is valued by opponent strength and dominance (finish
round, judges' scorecards, knockdowns; losses too), with momentum from the results rating and flatter recency.

Offline and deterministic. Inputs: data/ufc-stats (fighters, index asOf), data/ufc-v4-certified-careers.json,
data/ufc-fighter-born.json, data/ufc-overall-records.json, data/ufc-fighter-status.json (hand-kept injuries), and
data/news-live.json (only to SUGGEST injuries for the owner to confirm; never applied). Refuses to overwrite the saved
file if the number of fighters falls by 30% or more.
"""
from __future__ import annotations

import argparse
import bisect
import datetime as dt
import importlib.util
import json
import math
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "ufc-fighter-form.json"
STATUS = DATA / "ufc-fighter-status.json"

MONTH = 30.4375
# Form v2 (owner request, 25 Nov 2026): every fight is valued against the BEFN expectation on the night, dominance
# covers losses as well as wins and reads the judges' scorecards, and momentum follows the results rating itself.
# Form v3 (owner request, 25 Nov 2026: "highest possible percentage"): chosen by a weight search scored on fights it
# was not tuned on (scripts/ufc-form-backtest.py; spec section 3). The fight-by-fight striking, control and takedown
# margins replace the old last-5 Performance percentile, and the window looks back further.
# Form v4 (owner, 25 Nov 2026: "Yes, add age", "keep trying to get it higher"): age joins, and Results is still
# reported but no longer weighted (dominance, opposition and momentum already carry the results; weighting it as well
# backtested worse).
WEIGHTS = {"results": 0.0, "dominance": .10, "opposition": .10, "momentum": .10, "activity": .05,
           "striking": .25, "control": .15, "takedowns": .10, "age": .15}
AGE_TOP, AGE_SPAN = 38, 16       # age part: 1 at 22 or younger, falling evenly to 0 at 38
WINDOW_FIGHTS = 8                # v3: up to 8 fights (v2: 5)
WINDOW_MONTHS = 60               # v3: within 5 years (v2: 3)
ELIGIBLE_MONTHS = 36             # at least 2 fights in the last 36 months, or no Form ("limited data")
STRENGTH_MONTHS = 36             # opponent strength: percentile among pre-bout ratings in the 36 months before a bout
POSITION = (1.0,) * WINDOW_FIGHTS  # flat (owner, 25 Nov); only age (the half-life) weights recency
HALF_LIFE_MONTHS = 36            # v3 (v2: 24, v1: 18)
# Fight statistics: margin per fight mapped by 0.5 + 0.5 tanh(margin / scale), so a margin of one scale is 0.88.
STAT_SCALE = {"striking": 1.5, "control": .2, "takedowns": 1.5}   # sig. strikes/min, control share, takedowns/15 min
POOL_MONTHS = 24
STREAK_STEP = 0                  # results: per-fight streak step (v1 +0.05 a win); 0 since v2, it backtested worse
MOMENTUM_SPAN = 240              # a 120-point rise in the results rating over the window gives momentum 1.0
# Each fighter's "fights": the fights behind the score, newest first, one array per fight in this order. share is
# the fight's percentage of the recency weight; value is what the result was worth (fight_value).
FIGHT_FIELDS = ["date", "opponent", "outcome", "method", "share", "oppStrength", "dominance", "value",
                "strikeDiffPm", "controlShare", "takedownDiff15"]
SIG_FIELD, KD_FIELD, TD_FIELD, CTRL_FIELD = 0, 16, 17, 21   # sigLanded, knockdowns, takedowns, controlSec (roundFields)
# Stage and badge thresholds are on the displayed Form (a percentile), so re-weighting the points cannot move them.
FORM_ON_FIRE, FORM_ON_FIRE_KEEP = 90, 79
FORM_TITLE_CONTENDER, FORM_RISING, FORM_BREAKOUT = 82, 74, 79
FORM_SLIPPING, FORM_SLIPPING_TWO_LOSSES = 20, 30
# Set so the best case after a loss (a split decision to a higher-rated opponent) is about the 90th percentile of the
# points pool: v1/v2 85, v3 75, v4 70 (each reweighting moves the points; tests/test_ufc_fighter_form.py checks it).
LOSS_CAP_START = 70
MAX_PRE_UFC_FIGHTS = 15          # owner, 2026-11-24: Rising star / Prospect need a modest pre-UFC career


# ---------- small helpers ----------
def months_between(a: str, b: str) -> float:
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days / MONTH


def add_months(day: str, months: float) -> str:
    return (dt.date.fromisoformat(day) + dt.timedelta(days=round(months * MONTH))).isoformat()


def years_between(a: str, b: str) -> int:
    x, y = dt.date.fromisoformat(a), dt.date.fromisoformat(b)
    return y.year - x.year - ((y.month, y.day) < (x.month, x.day))


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def finished(f) -> bool:
    return f.get("method") in ("ko", "sub", "dq")


def is_split(f) -> bool:
    return f.get("method") == "dec" and str(f.get("methodDetail") or "").lower() in ("split", "majority")


def pct_rank(value, population) -> int:
    """Mid-rank percentile, rounded, 1-99 (the stats build's convention)."""
    below = sum(1 for v in population if v < value)
    equal = sum(1 for v in population if v == value)
    return int(clamp(round(100 * (below + equal / 2) / len(population)), 1, 99))


# ---------- rating history: strength and expectation on the night ----------
def load_build():
    sys.path.insert(0, str(ROOT / "scripts"))
    spec = importlib.util.spec_from_file_location("ufc_stats_build", ROOT / "scripts/build-ufc-stats.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def rating_history(build, as_of: dt.date):
    """Point-in-time BEFN results ratings.

    Returns (by_bout, after, timeline): by_bout is boutId -> {slug: rating before the bout}, after is
    boutId -> {slug: rating straight after it} (the same update scripts/ufc_ratings.py results_walk applies), and
    timeline is a date-sorted list of all pre-bout ratings."""
    old, real, captured = build.ACTIVE_MONTHS, build.results_bouts, {}
    build.ACTIVE_MONTHS = 10 ** 4
    build.results_bouts = lambda pf: captured.setdefault("b", real(pf))
    try:
        with tempfile.TemporaryDirectory() as tmp:
            build.build(as_of, Path(tmp), None, True)
    finally:
        build.ACTIVE_MONTHS, build.results_bouts = old, real
    ur = build.ufc_ratings
    p = ur.RESULTS
    _, pre = ur.results_walk(captured["b"], p, build.pre_ufc_priors())
    by_bout, after, timeline = {}, {}, []
    for bout, ra, rb, na, nb in pre:
        bid = str(bout["boutId"])
        by_bout[bid] = {bout["a"]: ra, bout["b"]: rb}
        y = 1.0 if bout["outcome"] == "W" else 0.0 if bout["outcome"] == "L" else 0.5
        move = p["k"] * ur.result_margin(bout, p) * (y - win_prob(ra, rb))
        after[bid] = {bout["a"]: ra + move * (1 + p["boost"] / (na + 1)),
                      bout["b"]: rb - move * (1 + p["boost"] / (nb + 1))}
        timeline += [(bout["date"], ra), (bout["date"], rb)]
    timeline.sort()
    return by_bout, after, timeline


def win_prob(me: float, opp: float) -> float:
    """The results rating's own expectation (400-point logistic, scripts/ufc_ratings.py)."""
    return 1 / (1 + 10 ** ((opp - me) / 400))


class Strength:
    """Opponent strength on the night: percentile p of the opponent's pre-bout rating among all pre-bout ratings in
    the 36 months before the bout, mapped by clamp((p - 0.30) / 0.68): the top 2% score about 1.0, the median 0.3."""

    def __init__(self, timeline):
        self.dates = [d for d, _ in timeline]
        self.values = [v for _, v in timeline]
        self.cache = {}

    def of(self, rating: float, date: str) -> float:
        key = (round(rating, 6), date)
        if key not in self.cache:
            lo = bisect.bisect_left(self.dates, add_months(date, -STRENGTH_MONTHS))
            hi = bisect.bisect_left(self.dates, date)
            pool = self.values[lo:hi]
            p = (sum(1 for v in pool if v < rating) + .5 * sum(1 for v in pool if v == rating)) / len(pool) if pool else .5
            self.cache[key] = clamp((p - .30) / .68)
        return self.cache[key]


# ---------- one fight: how much of it the fighter won ----------
def decided(history):
    return [f for f in history if f["outcome"] in ("W", "L", "D")]


def streak(history, outcome) -> int:
    n = 0
    for f in decided(history):
        if f["outcome"] != outcome:
            break
        n += 1
    return n


def win_streak(history) -> int:
    return streak(history, "W")


def judged_share(f):
    """Share of the judges' rounds the fighter won (a 10-8 round counts double, an even round half each way).
    None when the scorecards are missing."""
    won = total = 0.0
    for j in ((f.get("scorecards") or {}).get("judges") or []):
        for _rnd, me, opp in j.get("rounds") or []:
            weight = 2.0 if abs(me - opp) >= 2 else 1.0
            total += weight
            won += weight if me > opp else weight / 2 if me == opp else 0.0
    return won / total if total else None


def knockdowns(f):
    """(scored, absorbed) from the round statistics, or (0, 0) when there are none."""
    kd = KD_FIELD
    rounds = f.get("rounds") or []
    return (sum(r[2][kd] for r in rounds if len(r) > 3 and len(r[2]) > kd),
            sum(r[3][kd] for r in rounds if len(r) > 3 and len(r[3]) > kd))


def dominance(f) -> float:
    """0 to 1: how much of the fight the fighter won, whichever way it went.

    Finish wins by round (1.00, 0.92, 0.85, then 0.80); a DQ win 0.60. Decisions run on the judges' scorecards,
    0.15 + 0.70 x the share of rounds won (a clean sweep 0.85, a split around 0.5, swept 0.15), nudged 0.04 per
    knockdown scored or absorbed; without scorecards a unanimous win is 0.75, split or majority 0.55, and the
    mirror for losses. Draws 0.50. Being finished scores 0 in rounds 1-2 and 0.05 later; a DQ loss 0.30."""
    method, out = f.get("method"), f["outcome"]
    rnd = f.get("endRound") or 3
    if out == "D":
        return .50
    if method in ("ko", "sub"):
        if out == "W":
            return 1.00 if rnd <= 1 else .92 if rnd == 2 else .85 if rnd == 3 else .80
        return 0.0 if rnd <= 2 else .05
    if method == "dq":
        return .60 if out == "W" else .30
    share = judged_share(f)
    if share is None:
        close = is_split(f)
        share = (.57 if close else .86) if out == "W" else (.43 if close else .14)
    kd_for, kd_against = knockdowns(f)
    d = .15 + .70 * share + .04 * (kd_for - kd_against)
    return clamp(d, .05, .95)


def fight_value(outcome, strength, dom) -> float:
    """0 to 1: what the result is worth, given who it was against and how it went.

    A win is worth 0.55 at least, plus up to 0.25 for the opponent's strength on the night and 0.20 for dominance:
    a first-round finish of a top opponent is 1.0, a split decision over a weak one about 0.6. A draw is 0.25 plus
    up to 0.20 for strength. A loss is worth at most 0.40: (0.12 + 0.56 x dominance, which stops counting at 0.5) x
    (0.4 + 0.6 x strength), so a close decision loss to an elite opponent keeps 0.40 and a first-round stoppage by a
    weak one keeps about 0.05. (An upset bonus on 1 - the win probability was tried and backtested worse: it rewards
    fighters for having been rated low.)"""
    if outcome == "W":
        return .55 + .25 * strength + .20 * dom
    if outcome == "D":
        return .25 + .20 * strength
    return (.12 + .56 * min(dom, .5)) * (.4 + .6 * strength)


def fight_stats(f):
    """Margins from the round statistics, the fighter minus the opponent: significant strikes per minute, share of
    the fight spent in control, takedowns per 15 minutes. None when the fight has no round statistics."""
    rounds = [r for r in (f.get("rounds") or []) if len(r) > 3]
    secs = sum(r[1] for r in rounds)
    if secs <= 0:
        return None

    def margin(i):
        return sum(r[2][i] for r in rounds) - sum(r[3][i] for r in rounds)
    return {"striking": margin(SIG_FIELD) / (secs / 60), "control": margin(CTRL_FIELD) / secs,
            "takedowns": margin(TD_FIELD) / (secs / 900)}


def points_for(fighter, history, as_of, ratings, strength, injured, after=None, born=None):
    """Returns (points or None, parts, lossCap, per-fight breakdown). history: newest first, all UFC fights.
    born: the fighter's birth date (ISO), or None when unknown (then the age part is left out)."""
    after = after or {}
    dec = decided(history)
    if sum(1 for f in dec if months_between(f["date"], as_of) <= ELIGIBLE_MONTHS) < 2:
        return None, None, None, None
    window = [f for f in dec if months_between(f["date"], as_of) <= WINDOW_MONTHS][:WINDOW_FIGHTS]
    weights = [POSITION[i] * .5 ** (months_between(f["date"], as_of) / HALF_LIFE_MONTHS) for i, f in enumerate(window)]
    s = sum(weights)

    def on_night(f):
        r = ratings.get(str(f["boutId"])) or {}
        return r.get(fighter), r.get(f.get("opponentSlug"))

    rows = []
    for w, f in zip(weights, window):
        me, opp = on_night(f)
        q = strength.of(opp, f["date"]) if opp is not None else .3       # unknown opponent: the median's score
        d = dominance(f)
        v = fight_value(f["outcome"], q, d)
        rows.append({"w": w, "f": f, "q": q, "d": d, "v": v, "me": me, "opp": opp, "st": fight_stats(f)})

    wins, losses = win_streak(history), streak(history, "L")
    trend = STREAK_STEP * min(wins, 3) - STREAK_STEP * min(max(losses - 1, 0), 3)
    R = clamp(sum(r["w"] * r["v"] for r in rows) / s + trend)
    D = sum(r["w"] * r["d"] for r in rows) / s
    Q = sum(r["w"] * (r["q"] if r["f"]["outcome"] == "W" else r["q"] / 2 if r["f"]["outcome"] == "D"
                      else .2 * r["q"]) for r in rows) / s

    # Momentum: how far the results rating moved across the window, from before the oldest fight to after the newest.
    first_pre = rows[-1]["me"]
    last_post = (after.get(str(window[0]["boutId"])) or {}).get(fighter)
    M = None if first_pre is None or last_post is None else clamp(.5 + (last_post - first_pre) / MOMENTUM_SPAN)

    gap = months_between(history[0]["date"], as_of)
    A = 1.0 if injured else clamp(1 - (gap - 6) / 12)

    stats = {}
    for k, scale in STAT_SCALE.items():
        have = [r for r in rows if r["st"] is not None]
        ws = sum(r["w"] for r in have)
        stats[k] = None if not ws else .5 + .5 * math.tanh(sum(r["w"] * r["st"][k] for r in have) / ws / scale)

    parts = {"results": round(R, 3), "dominance": round(D, 3), "opposition": round(Q, 3),
             "momentum": None if M is None else round(M, 3), "activity": round(A, 3),
             **{k: None if v is None else round(v, 3) for k, v in stats.items()},
             "age": None if not born else round(clamp((AGE_TOP - years_between(born, as_of)) / AGE_SPAN), 3)}
    used = {k: v for k, v in parts.items() if v is not None}
    points = 100 * sum(WEIGHTS[k] * v for k, v in used.items()) / sum(WEIGHTS[k] for k in used if WEIGHTS[k])

    cap = loss_cap(fighter, history, ratings)
    if cap is not None:
        points = min(points, cap)
    breakdown = [[r["f"]["date"], r["f"].get("opponentSlug"), r["f"]["outcome"], r["f"].get("method"),
                  round(100 * r["w"] / s), round(r["q"], 2), round(r["d"], 2), round(r["v"], 2)]
                 + ([None] * 3 if r["st"] is None else [round(r["st"]["striking"], 2), round(r["st"]["control"], 3),
                                                        round(r["st"]["takedowns"], 2)]) for r in rows]
    return round(points, 1), parts, cap, breakdown


def loss_cap(fighter, history, ratings):
    """If the last fight was a loss: LOSS_CAP_START (75) minus penalties for who it was against, how it happened, a losing run and a
    second stoppage loss in two years. None after a win or draw (the cap lifts with the next win)."""
    dec = decided(history)
    if not dec or dec[0]["outcome"] != "L":
        return None
    last = dec[0]
    r = ratings.get(str(last["boutId"])) or {}
    me, opp = r.get(fighter), r.get(last.get("opponentSlug"))
    if last.get("titleFight") or (me is not None and opp is not None and opp > me):
        opp_pen = 0
    elif me is not None and opp is not None and me - opp <= 100:
        opp_pen = 10
    else:
        opp_pen = 20
    if is_split(last):
        manner = 0
    elif not finished(last) or last.get("method") == "dq":
        manner = 5
    else:
        manner = 10 if (last.get("endRound") or 3) >= 3 else 15
    run = streak(history, "L")
    run_pen = 0 if run <= 1 else 5 if run == 2 else 10
    stopped_again = 0
    if last.get("method") in ("ko", "sub"):
        since = add_months(last["date"], -24)
        if any(f["outcome"] == "L" and f.get("method") in ("ko", "sub") and since <= f["date"] for f in dec[1:]):
            stopped_again = 5
    return LOSS_CAP_START - opp_pen - manner - run_pen - stopped_again


# ---------- inputs ----------
def load_json(path, default=None):
    return json.loads(Path(path).read_text(encoding="utf-8")) if Path(path).exists() else default


def certified_set():
    c = load_json(DATA / "ufc-v4-certified-careers.json", {}) or {}
    out = (set(c.get("certified") or {}) | set((c.get("extension") or {}).get("certified") or {})
           | set((c.get("rolling") or {}).get("certified") or {}))
    for a, b in (c.get("statsAliases") or {}).items():
        if a in out or b in out:
            out |= {a, b}
    return out


def pre_ufc_fights():
    recs = (load_json(DATA / "ufc-overall-records.json", {}) or {}).get("records") or {}
    out = {}
    for slug, r in recs.items():
        u = r.get("ufc") or {}
        n = (r.get("W", 0) + r.get("L", 0) + r.get("D", 0)) - (u.get("W", 0) + u.get("L", 0) + u.get("D", 0))
        if n >= 0:
            out[slug] = n
    return out


def active_injury(entry, history, as_of):
    """An entry applies until the fighter fights after `since`, or 24 months after `since`."""
    if not entry or entry.get("status") != "injured" or not entry.get("since"):
        return None
    since = entry["since"]
    if any(f["date"] > since for f in history):
        return None
    if months_between(since, as_of) > 24:
        return None
    return entry


# ---------- main build ----------
def rank_moves():
    """Rank change since the previous saved UFC rankings (data/ufc-rankings-history). Positive = moved up.

    Needs two saved weeks; with one there is nothing to compare, so every move is None and the hub shows no arrows.
    A fighter new to a division's top 15 gets "new". Returns (rankingDate, previousDate, {slug: move}).
    """
    days = sorted((DATA / "ufc-rankings-history").glob("*.json"))
    if not days:
        return None, None, {}
    now = json.loads(days[-1].read_text(encoding="utf-8"))
    if len(days) < 2:
        return now["rankingDate"], None, {}
    before = json.loads(days[-2].read_text(encoding="utf-8"))
    moves = {}
    for div, rows in now["divisions"].items():
        old = {slug: rank for rank, slug in before["divisions"].get(div) or []}
        for rank, slug in rows:
            moves[slug] = "new" if slug not in old else old[slug] - rank
    return now["rankingDate"], before["rankingDate"], moves


def build_form(as_of_str=None, previous=None, status=None, news=None):
    stats_dir = DATA / "ufc-stats"
    as_of = as_of_str or json.loads((stats_dir / "index.json").read_text())["asOf"]
    files = {}
    for p in sorted((stats_dir / "fighters").glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        files[d["slug"]] = d
    build = load_build()
    ratings, after, timeline = rating_history(build, dt.date.fromisoformat(as_of))
    strength = Strength(timeline)
    certified = certified_set()
    born = (load_json(DATA / "ufc-fighter-born.json", {}) or {}).get("fighters") or {}
    pre_ufc = pre_ufc_fights()
    status = status if status is not None else (load_json(STATUS, {}) or {})
    injuries = status.get("fighters") or {}
    prev = ((previous or {}).get("fighters") or {})
    ranking_date, ranking_prev, moves = rank_moves()

    # division: roster division, else the most common division of the last 3 opponents
    division = {}
    for slug, d in files.items():
        div = d.get("divisionSlug")
        if not div:
            opp = [files.get(f.get("opponentSlug"), {}).get("divisionSlug") for f in d["fights"][:3]]
            opp = [x for x in opp if x]
            div = Counter(opp).most_common(1)[0][0] if opp else None
        division[slug] = div

    out = {}
    for slug, d in files.items():
        history = d["fights"]                     # newest first
        inj = active_injury(injuries.get(slug), history, as_of)
        pts, parts, cap, fights = points_for(slug, history, as_of, ratings, strength, inj, after, born.get(slug))
        dec = decided(history)
        last_date = history[0]["date"] if history else None
        gap = months_between(last_date, as_of) if last_date else 999
        first = min(f["date"] for f in history) if history else None
        age = years_between(born[slug], as_of) if slug in born else None
        debut_age = years_between(born[slug], first) if slug in born and first else None
        career = d["windows"]["career"]
        out[slug] = {"name": d["name"], "slug": slug, "points": pts, "parts": parts, "lossCap": cap, "fights": fights,
                     "rank": d.get("officialRank"), "champion": bool(d.get("champion")), "division": division[slug],
                     "women": str(division[slug] or "").startswith("womens"), "certified": slug in certified,
                     "age": age, "debutAge": debut_age, "preUfcFights": pre_ufc.get(slug),
                     "injured": None if not inj else {k: inj.get(k) for k in ("since", "detail", "source", "checked")},
                     "limited": pts is None, "ufcFights": career["fights"], "losses": career["L"],
                     "record": [career["W"], career["L"], career["D"], career["NC"]], "rankMove": moves.get(slug),
                     "lastFight": last_date, "monthsOut": round(gap, 1), "debut": first,
                     "last5": [f["outcome"] for f in history[:5]],
                     "overall": (d.get("ratings") or {}).get("overall"),
                     "overallRank": (d.get("ratings") or {}).get("overallRank"),
                     "_dec": dec, "_ratings": ratings}

    # displayed Form: percentile of points among fighters with a UFC fight in the last 24 months
    pool = [f["points"] for f in out.values() if f["points"] is not None and f["monthsOut"] <= POOL_MONTHS]
    for f in out.values():
        f["form"] = min(99, pct_rank(f["points"], pool)) if f["points"] is not None and pool else None

    for slug, f in out.items():
        f["stage"], f["why"] = stage_for(f)
        f["badges"] = badges_for(f, prev.get(slug))

    # form rank inside each division: ranked #1-#15, scored and not injured
    for div in {f["division"] for f in out.values()}:
        ranked = [f for f in out.values() if f["division"] == div and f["rank"] and 1 <= f["rank"] <= 15
                  and f["form"] is not None and not f["injured"]]
        ranked.sort(key=lambda f: (-f["points"], f["rank"]))
        for i, f in enumerate(ranked, 1):
            f["formRank"] = i
    for f in out.values():
        f.setdefault("formRank", None)

    hub = {s: f for s, f in out.items() if f["certified"]}
    queue = sorted(s for s, f in out.items() if not f["certified"]
                   and (f["stage"] != "Established" or "On fire" in f["badges"]))
    pulse = division_pulse(hub)
    suggestions = injury_suggestions(out, injuries, news)
    for f in out.values():
        f.pop("_dec", None)
        f.pop("_ratings", None)
    return {"schema": 1, "asOf": as_of, "rankingDate": ranking_date, "previousRankingDate": ranking_prev,
            "source": "scripts/build-ufc-fighter-form.py (Fighters hub handover, 24 Nov 2026)",
            "note": "Form describes recent UFC results; it is not a prediction. Form 90 means going better right now "
                    "than 90% of active UFC fighters (a UFC fight in the last 24 months).",
            "weights": WEIGHTS, "fightFields": FIGHT_FIELDS, "formPool": len(pool), "fighters": out, "divisions": pulse,
            "certificationQueue": queue, "injurySuggestions": suggestions}


def stage_for(f):
    """Handover 4.1, checked in order; the first match wins. Returns (stage, reasons)."""
    pts, rank, why = f["form"], f["rank"], []
    dec = f["_dec"]
    won_last = bool(dec) and dec[0]["outcome"] == "W"
    injured = bool(f["injured"])
    if f["champion"]:
        return "Champion", why
    if rank and 1 <= rank <= 15:
        reason = form_check(f)
        if reason:
            return "Slipping", [reason]
        if rank <= 5 and (won_last or (pts is not None and pts >= FORM_TITLE_CONTENDER)):
            return "Title contender", why
        return "Contender", (["limited data"] if pts is None else why)
    if f["monthsOut"] > 24 and not injured:
        return "Inactive", why
    age_ok = lambda limit: f["age"] is None or f["age"] <= limit
    debut_ok = f["debutAge"] is None or f["debutAge"] < 30
    pre_ok = f["preUfcFights"] is None or f["preUfcFights"] <= MAX_PRE_UFC_FIGHTS
    note = (["age unknown"] if f["age"] is None else []) + ([] if f["preUfcFights"] is not None else ["pre-UFC record unknown"])
    debut_recent = f["debut"] and months_between(f["debut"], AS_OF[0]) <= 36
    if (3 <= f["ufcFights"] <= 6 and debut_recent and f["losses"] <= 1 and won_last and pts is not None and pts >= FORM_RISING
            and age_ok(32) and debut_ok and pre_ok):
        return "Rising star", note
    if 1 <= f["ufcFights"] <= 3 and f["losses"] == 0 and age_ok(30) and debut_ok and pre_ok:
        return "Prospect", note
    last4 = [x["outcome"] for x in dec[:4]]
    if (pts is not None and pts >= FORM_BREAKOUT and won_last and last4.count("W") >= 3 and f["monthsOut"] <= 18
            and f["ufcFights"] <= 10 and f["age"] is not None and f["age"] <= 33):
        return "Breakout", why
    return "Established", why


def form_check(f):
    """Handover 4.2: the first reason a ranked fighter fails, or None."""
    dec, pts = f["_dec"], f["form"]
    if f["monthsOut"] > 18 and not f["injured"]:
        return "no UFC fight in 18 months"
    last5 = [x["outcome"] for x in dec[:5]]
    if last5 and last5[0] == "L" and last5.count("L") >= 3:
        return f"lost last fight and {last5.count('L')} of last {len(last5)}"
    bad = 0
    for x in dec[:3]:
        if x["outcome"] == "L" and not x.get("titleFight"):
            r = f["_ratings"].get(str(x["boutId"])) or {}
            me, opp = r.get(f["slug"]), r.get(x.get("opponentSlug"))
            if me is not None and opp is not None and me - opp > 100:
                bad += 1
    if bad >= 2:
        return "2 of last 3 were losses to clearly lower-rated opponents"
    last3 = [x["outcome"] for x in dec[:3]]
    if pts is not None and (pts < FORM_SLIPPING or (pts < FORM_SLIPPING_TWO_LOSSES and last3.count("L") >= 2)):
        return "form well below the division"
    return None


def badges_for(f, prev):
    dec, pts, out = f["_dec"], f["form"], []
    last3 = [x["outcome"] for x in dec[:3]]
    hot = (pts is not None and len(dec) >= 3 and last3 == ["W", "W", "W"] and f["monthsOut"] <= 12
           and f["ufcFights"] >= 3 and not f["injured"])
    was_hot = bool(prev) and "On fire" in (prev.get("badges") or [])
    if hot and (pts >= FORM_ON_FIRE or (was_hot and pts >= FORM_ON_FIRE_KEEP)):   # hysteresis, to avoid flicker
        out.append("On fire")
    if (f["rank"] and 1 <= f["rank"] <= 15 and last3[:1] == ["L"] and last3.count("L") >= 2
            and f["monthsOut"] <= 24):
        out.append("Cooling")
    if 18 <= f["monthsOut"] <= 24 and not f["injured"]:
        out.append("Inactive risk")
    if f["injured"]:
        out.append("Out injured")
    return out


def division_pulse(hub):
    out = {}
    for div in sorted({f["division"] for f in hub.values() if f["division"]}):
        members = [f for f in hub.values() if f["division"] == div]
        top5 = [f["form"] for f in members if f["rank"] and 1 <= f["rank"] <= 5 and f["form"] is not None]
        hottest = max((f for f in members if not f["champion"] and f["form"] is not None),
                      key=lambda f: (f["form"], f["points"]), default=None)
        out[div] = {"top5Form": round(sum(top5) / len(top5)) if top5 else None,
                    "onFire": sum(1 for f in members if "On fire" in f["badges"]),
                    "rising": sum(1 for f in members if f["stage"] == "Rising star"),
                    "slipping": sum(1 for f in members if f["stage"] == "Slipping"),
                    "hottest": None if not hottest else {"slug": hottest["slug"], "name": hottest["name"],
                                                         "form": hottest["form"]}}
    return out


INJURY_WORDS = re.compile(r"\b(injur\w*|withdr[ae]w\w*|pulls? out|pulled out|out of (?:the|his|her) fight|surgery|"
                          r"sidelined|torn|broken|fractur\w*)\b", re.I)


def injury_suggestions(fighters, known, news):
    """Headlines naming a fighter with an injury word. Suggestions only; the owner confirms each one."""
    if not news:
        return {}
    out = {}
    names = {f["name"]: s for s, f in fighters.items() if len(f["name"].split()) >= 2}
    for a in news.get("articles") or []:
        if a.get("sport") not in (None, "mma"):
            continue
        title = str(a.get("title") or "")
        if not INJURY_WORDS.search(title):
            continue
        for name, slug in names.items():
            if slug in known or name not in title:
                continue
            out.setdefault(slug, []).append({"title": title, "url": a.get("url"), "publishedAt": a.get("publishedAt")})
    return dict(sorted(out.items()))


AS_OF = [None]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    out = Path(args.out)
    previous = load_json(out, None)
    if not STATUS.exists():
        STATUS.write_text(json.dumps({"schema": 1, "note": "Hand-kept injury list. Each entry needs a source link and "
                                      "a checked date; the build never adds entries.", "fighters": {}}, indent=1) + "\n",
                          encoding="utf-8")
    AS_OF[0] = json.loads((DATA / "ufc-stats" / "index.json").read_text())["asOf"]
    result = build_form(previous=previous, news=load_json(DATA / "news-live.json", None))
    before = len((previous or {}).get("fighters") or {})
    if before and len(result["fighters"]) < before * 0.7:
        print(f"refusing to overwrite: fighters fell from {before} to {len(result['fighters'])}", file=sys.stderr)
        return 1
    out.write_text(json.dumps(result, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    hub = [f for f in result["fighters"].values() if f["certified"]]
    stages = Counter(f["stage"] for f in hub)
    print(f"as of {result['asOf']} · {len(result['fighters'])} fighters · form pool {result['formPool']} · "
          f"hub {len(hub)}: {dict(sorted(stages.items()))} · On fire {sum('On fire' in f['badges'] for f in hub)} · "
          f"queue {len(result['certificationQueue'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
