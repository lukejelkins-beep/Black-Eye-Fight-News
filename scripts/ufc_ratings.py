"""BEFN UFC ratings v2: the existing rating formulas fed from the stats build.

The skill formulas (components, scale ranges, weights and evidence gates) are
a line-for-line port of metricSpecs/rawSkill in assets/fighter-power-index.js,
so the site keeps one rating model. What changes in v2 is the input and scale:

  * Input: the recency-weighted career window (18-month half-life) from
    scripts/build-ufc-stats.py, instead of only the last five fights.
  * Small samples shrink toward the roster mean by n/(n+4), with n the
    recency-weighted number of fights with complete round stats.
  * Each skill is a percentile against every rated active UFC fighter, and
    against the fighter's official division when it has at least
    MIN_DIVISION_PEERS rated fighters.
  * Recent form keeps the recency-weighted last-five model and its
    opponent-strength adjustment (±OPPONENT_SWING).

Credential bonuses stay in the browser (they depend on reviewed credentials).

Rating model 2026-11 (owner decision, PR #453): the headline BEFN rating is no longer
an average of skill percentiles. It blends
  * a RESULTS rating: Elo-type, from every archived UFC bout in date order, so beating a
    strong opponent counts for more than beating a weak one, a finish more than a
    decision and a split decision less; ratings drift back toward average after a
    year out; and
  * a SKILLS composite: the four skill percentiles, which now score effectiveness
    (takedowns stopped and control conceded count, not only takedowns landed).
The blend weights and results parameters were fitted on fights before 2024 only
(scripts/ufc-rating-fit.py) and frozen here. The headline is on a rating scale where
1500 is the median established UFC fighter (not a percentile, not a forecast).
"""
from __future__ import annotations

import datetime as _dt
import math

# Rated skills. Since 2026-11-24 (owner) each skill includes its own defence, so there is no separate Defence skill:
# striking counts strikes absorbed, strike defence and knockdowns absorbed; wrestling counts takedown defence and control
# conceded; grappling counts submissions conceded. "defence" stays in specs() for the fight-card tiles only.
SKILLS = ("striking", "grappling", "wrestling")
OVERALL_WEIGHTS = {"striking": .25, "grappling": .15, "wrestling": .20, "defence": .25, "form": .15}
MIN_STAT_FIGHTS = 3          # complete-stat UFC fights needed before any skill is rated
MIN_ROSTER = 20              # a skill needs this many rated fighters to rank anyone
MIN_DIVISION_PEERS = 8       # division percentile only with this many rated peers
OPPONENT_SWING = .25
SHRINK_K = 4

# Results rating (Elo-type). Fitted on decided UFC fights before 2024 only by scripts/ufc-rating-fit.py, then frozen.
# Owner choices (PR #453): a title fight counts 1.5x and the idle drift is 10% a year; the rest is fitted
# (`python3 scripts/ufc-rating-fit.py --fix idle=0.1 --fix title=1.5 --mix 0.6`).
RESULTS = {"start": 1500, "k": 64, "boost": 1.0, "finish": 1.25, "split": 0.5, "idle": 0.3, "title": 1.5}
# 2026-11-24 (owner, from scripts/ufc-results-tuning-study.py): idle drift 30% a year (was 10%; stronger drift tracked
# results better on 2016-2023 and on 2024+), and a debutant starts from their pre-UFC record instead of a flat 1500:
# start = 1500 + PRIOR_SCALE * (shrunk pre-UFC win rate - its roster median), shrunk = (W + 2) / (W + L + 4). Scale 400
# was best on 2016-2023 and helps 2024+ too, mostly for fighters with fewer than three UFC fights.
PRIOR_SCALE = 400
RESULTS_MEAN = 1500          # an idle rating drifts back toward this
RESULTS_MIN_FIGHTS = 3       # results fights before the results part counts as established
# Headline blend, in log-odds per 400 results points and per 100 skills-composite points. Owner's mix: results carry
# 60% of the spread and skills 40% (the fit on 2019-2023 fights gave 73/27 with the 2026-11-24 settings), same total
# spread as the fit.
# The four skills keep their old relative weights.
BLEND = {"results": 1.77, "skills": 1.203}
# Old weights were striking 25, defence 25, wrestling 20, grappling 15; striking now carries the strike defence.
SKILL_WEIGHTS = {"striking": .55, "grappling": .20, "wrestling": .25}
HEADLINE_CENTRE = 1500       # the median established fighter
HEADLINE_SCALE = 400 / math.log(10)   # Elo convention: rating points per unit of log-odds
# What readers see (owner's choice, display option A, 2026-11-24): a score out of 100 where 50 is the median rated
# fighter, 50 + (rating - 1500) / SCORE_DIVISOR, clamped to 1-99. With the rating's spread (sd about 134) the divisor 8
# (owner, 2026-11-24, was 11) puts the top ten at about 88 or higher and only the very best at the 99 cap. The full rating is kept as
# "overallRating" and orders the ranks, so two fighters with the same rounded score still have distinct ranks.
SCORE_DIVISOR = 8
# Age (owner request 25 Nov 2026, "improve the BEFN rating"): fitted on 2019-2023 quarterly snapshots, tested on
# 1,238 bouts from 2024 (scripts/ufc-rating-evaluate.py protocol): accuracy 62.6% -> 64.0%, Brier 0.2275 -> 0.2229
# (95% interval of the gain +0.0027 to +0.0063). Each year over AGE_CENTRE (the median fighter's age) takes
# AGE_POINTS_PER_YEAR rating points off; each year under adds them. Unknown birth date: no adjustment.
AGE_CENTRE = 31.0
AGE_POINTS_PER_YEAR = 5.4
# Height (owner, 25 Nov 2026: "difference in height, reach ... from the average in the division"; "do whatever increases
# the predictability most"): HEIGHT_POINTS_PER_INCH rating points per inch above or below the average height of the
# fighter's division on the roster being rated. Chosen by 10-fold cross-validation over 2019-2026 snapshots, all
# years: accuracy 64.62% -> 65.46% at 6 points an inch (the peak; 3: 65.28%, 9: 65.30%, 12: 65.20%). Reach, on top of
# height, lowered accuracy and is not used. Unknown height or division: no adjustment.
HEIGHT_POINTS_PER_INCH = 6.0

# Striking (owner, 2026-11-24): output 60% (landed, differential, accuracy, knockdowns, KO wins) and defence 40%
# (strike defence, strikes absorbed, knockdowns absorbed, KO/TKO losses). KO/TKO losses weigh .07: a walk-forward test
# on 2024+ fights of 0, .07, .13 and .20 found a larger weight never tracked results better (skills-only Brier .2311,
# .2312, .2318, .2326), since knockdowns and strikes absorbed already carry most of it; .07 keeps it counted at no
# measurable cost. See docs/ufc-rating-model-2026-11.md.
# Wrestling (owner, 2026-11-24): offence 60% (takedowns landed 25, accuracy 12, control won 23), defence 40%
# (takedown defence %, taken down per 15 min, control conceded, reversals). Takedown defence % alone misses a fighter
# who stops most attempts but faces many; "taken down per 15" counts how often it actually happens. Walk-forward test on
# 2024+ fights (wrestling-only Brier at 0, .06, .12, .18: .2434, .2436, .2439, .2443): more weight never tracked results
# better, since defence % and control conceded carry most of it, so .06 keeps it counted at no measurable cost.
# Control conceded weighs .24 and takedown defence % .05 (owner, 2026-11-24): being taken down and getting straight
# back up costs little, being held down costs a lot. Tested at .12/.18/.24/.29 control: wrestling-only Brier .2436,
# .2438, .2442, .2445 and accuracy 58.2/58.6/58.7/57.3% - level up to .24, worse with no takedown defence at all.
WRESTLING_WEIGHTS = {"td15": .25, "tdAcc": .12, "ctrlShare": .23,
                     "tdDef": .05, "tdAbs15": .06, "ctrlAgainstShare": .24, "rev15": .05}
# Grappling (owner, 2026-11-24): offence 60% (submission attempts 20, submission wins 28, control won 12), defence 40%
# (submission losses, opponents' submission attempts, reversals, control conceded). Submission losses weigh .15: on
# 2024+ fights grappling-only Brier at 0, .07, .15, .22 was .2466, .2459, .2458, .2458 (leaving them out is worse; the
# gain levels off at .15).
GRAPPLING_WEIGHTS = {"sub15": .20, "subWinShare": .28, "ctrlShare": .12,
                     "subLossShare": .15, "subAbs15": .10, "rev15": .08, "ctrlAgainstShare": .07}
STRIKING_WEIGHTS = {"slpm": .10, "diffPm": .17, "strAcc": .08, "kd15": .11, "koWinShare": .14,
                    "strDef": .12, "sapm": .09, "kdAbs15": .12, "koLossShare": .07}
MODEL = "results+skills 2026-11"

# (key, label, unit) for the "what drives this rating" view.
COMPONENTS = {
    "striking": [("slpm", "Significant strikes landed per min", "rate"),
                 ("diffPm", "Strike differential per min", "rate"),
                 ("strAcc", "Significant strike accuracy", "pct"),
                 ("kd15", "Knockdowns per 15 min", "rate"),
                 ("koWinShare", "KO/TKO wins per fight", "pct"),
                 ("strDef", "Significant strike defence", "pct"),
                 ("sapm", "Significant strikes absorbed per min (lower is better)", "rate"),
                 ("kdAbs15", "Knockdowns absorbed per 15 min (lower is better)", "rate"),
                 ("koLossShare", "KO/TKO losses per fight (lower is better)", "pct")],
    # Order matters: the grappling gate reads the first three (any submission evidence), wrestling the first.
    "grappling": [("sub15", "Submission attempts per 15 min", "rate"),
                  ("subWinShare", "Submission wins per fight", "pct"),
                  ("subLossShare", "Submission losses per fight (lower is better)", "pct"),
                  ("ctrlShare", "Control-time share", "pct"),
                  ("subAbs15", "Opponent submission attempts per 15 min (lower is better)", "rate"),
                  ("rev15", "Reversals per 15 min", "rate"),
                  ("ctrlAgainstShare", "Time controlled by opponents (lower is better)", "pct")],
    "wrestling": [("td15", "Takedowns per 15 min", "rate"),
                  ("tdAcc", "Takedown accuracy", "pct"),
                  ("ctrlShare", "Control-time share", "pct"),
                  ("tdDef", "Takedown defence", "pct"),
                  ("tdAbs15", "Taken down per 15 min (lower is better)", "rate"),
                  ("ctrlAgainstShare", "Time controlled by opponents (lower is better)", "pct"),
                  ("rev15", "Reversals per 15 min", "rate")],
    "defence": [("sapm", "Significant strikes absorbed per min (lower is better)", "rate"),
                ("strDef", "Significant strike defence", "pct"),
                ("tdDef", "Takedown defence", "pct"),
                ("kdAbs15", "Knockdowns absorbed per 15 min (lower is better)", "rate"),
                ("ctrlAgainstShare", "Opponent control-time share (lower is better)", "pct")],
}


def _clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def _between(n, lo, hi):
    return None if n is None else _clamp((n - lo) * 100 / (hi - lo))


def _pct(v):
    """Fractions from the stats build -> the engine's 0-100 percentages."""
    return None if v is None else v * 100


def _sum_parts(items, min_coverage, min_parts=2):
    valid = [(v, w) for v, w in items if v is not None]
    weight = sum(w for _, w in valid)
    if len(valid) < min_parts or weight < min_coverage:
        return None
    return sum(v * w for v, w in valid) / weight


# Plausibility bounds, identical to careerData() in the JS engine: a value
# outside its range (e.g. 8 knockdowns per 15 min from a tiny, finish-heavy
# sample) is treated as missing, not as an extreme score.
BOUNDS = {"slpm": (0, 20), "sapm": (0, 20), "td15": (0, 20), "sub15": (0, 12), "rev15": (0, 12),
          "ctrlShare": (0, 1), "ctrlAgainstShare": (0, 1), "kd15": (0, 7), "kdAbs15": (0, 7),
          "strAcc": (0, 1), "strDef": (0, 1), "tdAcc": (0, 1), "tdDef": (0, 1),
          "koWinShare": (0, 1), "subWinShare": (0, 1), "subLossShare": (0, 1), "subAbs15": (0, 12),
          "netCtrl": (-1, 1), "koLossShare": (0, 1), "tdAbs15": (0, 20)}


def bounded(rates: dict, window: dict) -> dict:
    """Rates plus window finish shares, with out-of-range values set to None."""
    rates = rates or {}
    ctrl, against = rates.get("ctrlShare"), rates.get("ctrlAgainstShare")
    net = (round(ctrl - against, 3) if isinstance(ctrl, (int, float)) and isinstance(against, (int, float)) else None)
    merged = {**rates, "koWinShare": (window or {}).get("koWinShare"),
              "subWinShare": (window or {}).get("subWinShare"), "subLossShare": (window or {}).get("subLossShare"),
              "koLossShare": (window or {}).get("koLossShare"),
              "netCtrl": net}
    out = {}
    for key, value in merged.items():
        lo, hi = BOUNDS.get(key, (float("-inf"), float("inf")))
        out[key] = value if isinstance(value, (int, float)) and lo <= value <= hi else None
    return out


def specs(rates: dict, window: dict) -> dict:
    """Component scores and weights, identical to metricSpecs() in the JS engine."""
    r = bounded(rates, window)
    window = r
    slpm, sapm = r.get("slpm"), r.get("sapm")
    diff = slpm - sapm if slpm is not None and sapm is not None else None
    W, G, WR = STRIKING_WEIGHTS, GRAPPLING_WEIGHTS, WRESTLING_WEIGHTS
    return {
        # Striking is landing and not getting hit (owner, 2026-11-24): output 60%, defence 40%, being knocked out
        # included. Weights in STRIKING_WEIGHTS.
        "striking": [(_between(slpm, .8, 6.5), W["slpm"]), (_between(diff, -2.0, 3.0), W["diffPm"]),
                     (_between(_pct(r.get("strAcc")), 25, 65), W["strAcc"]), (_between(r.get("kd15"), 0, 1.0), W["kd15"]),
                     (_between(window.get("koWinShare"), 0, .50), W["koWinShare"]),
                     (_between(_pct(r.get("strDef")), 35, 75), W["strDef"]), (_between(sapm, 6.0, 1.2), W["sapm"]),
                     (_between(r.get("kdAbs15"), 1.0, 0), W["kdAbs15"]), (_between(window.get("koLossShare"), .25, 0), W["koLossShare"])],
        # Offence 60%, defence 40%, like striking (owner, 2026-11-24). Weights in GRAPPLING_WEIGHTS / WRESTLING_WEIGHTS.
        "grappling": [(_between(r.get("sub15"), 0, 3.0), G["sub15"]),
                      (_between(window.get("subWinShare"), 0, .35), G["subWinShare"]),
                      (_between(window.get("subLossShare"), .25, 0), G["subLossShare"]),
                      (_between(r.get("ctrlShare"), 0, .50), G["ctrlShare"]),
                      (_between(r.get("subAbs15"), 2.0, 0), G["subAbs15"]),
                      (_between(r.get("rev15"), 0, 2), G["rev15"]),
                      (_between(r.get("ctrlAgainstShare"), .50, 0), G["ctrlAgainstShare"])],
        "wrestling": [(_between(r.get("td15"), 0, 5.5), WR["td15"]),
                      (_between(_pct(r.get("tdAcc")), 20, 65), WR["tdAcc"]),
                      (_between(r.get("ctrlShare"), 0, .50), WR["ctrlShare"]),
                      (_between(_pct(r.get("tdDef")), 40, 95), WR["tdDef"]),
                      (_between(r.get("tdAbs15"), 4.0, 0), WR["tdAbs15"]),
                      (_between(r.get("ctrlAgainstShare"), .50, 0), WR["ctrlAgainstShare"]),
                      (_between(r.get("rev15"), 0, 2), WR["rev15"])],
        "defence": [(_between(sapm, 6.0, 1.2), .31), (_between(_pct(r.get("strDef")), 35, 75), .29),
                    (_between(_pct(r.get("tdDef")), 35, 90), .22), (_between(r.get("kdAbs15"), 1.0, 0), .12),
                    (_between(r.get("ctrlAgainstShare"), .50, 0), .06)],
    }


def raw_skill(rates: dict, window: dict, skill: str):
    """Weighted composite before shrinkage, with the JS engine's evidence gates."""
    s = specs(rates, window)[skill]
    if skill == "striking":
        return _sum_parts(s, .50)
    if skill == "grappling":
        return _sum_parts(s, .45) if any(v is not None for v, _ in s[:3]) else None
    if skill == "wrestling":
        return _sum_parts(s, .53) if s[0][0] is not None else None
    if skill == "defence":
        return _sum_parts(s, .48) if s[0][0] is not None or s[1][0] is not None else None
    raise KeyError(skill)


def drivers(rates: dict, window: dict, skill: str) -> list[dict]:
    """What drives a rating: each component's measured value, 0-100 score and weight."""
    out = []
    values = bounded(rates, window)
    for (score, weight), (key, label, unit) in zip(specs(rates, window)[skill], COMPONENTS[skill]):
        out.append({"key": key, "label": label, "unit": unit, "value": values.get(key),
                    "score": None if score is None else round(score), "weight": weight})
    return out


def shrink(value, mean, n):
    return mean + (value - mean) * (n / (n + SHRINK_K))


def percentile(value, population: list[float]):
    """Mid-rank percentile (ties share the midpoint)."""
    if value is None or not population:
        return None
    below = sum(1 for v in population if v < value)
    equal = sum(1 for v in population if v == value)
    # Never 0th or 100th: a percentile describes standing among others, not certainty.
    return int(_clamp(round(100 * (below + equal / 2) / len(population)), 1, 99))


def recent_form(history: list[dict], quality=None):
    """Port of recentForm(): last five decided UFC fights, recency 5..1, neutral prior."""
    decided = [f for f in history if f["outcome"] in ("W", "L", "D")][:5]
    if len(decided) < 2:
        return None
    total, earned = 4.0, 2.0
    for weight, f in zip((5, 4, 3, 2, 1), decided):
        base = 1.0 if f["outcome"] == "W" else .5 if f["outcome"] == "D" else 0.0
        q = quality(f) if quality else None
        shift = OPPONENT_SWING * (_clamp(q, 0, 1) - .5) if q is not None else 0.0
        earned += weight * (base + shift)
        total += weight
    return round(_clamp(100 * earned / total))


def _days(a: str, b: str) -> int:
    return (_dt.date.fromisoformat(b) - _dt.date.fromisoformat(a)).days


def _idle(value: float, last: str | None, when: str, p: dict) -> float:
    """A rating drifts back toward the mean after a year without a fight (p["idle"] per further year)."""
    if not last or not p.get("idle"):
        return value
    gap = _days(last, when) - 365
    if gap <= 0:
        return value
    return RESULTS_MEAN + (value - RESULTS_MEAN) * (1 - p["idle"]) ** (gap / 365.25)


def result_margin(bout: dict, p: dict) -> float:
    """How much a result moves the ratings: finishes more, split or majority decisions less, title fights more."""
    title = p.get("title", 1.0) if bout.get("titleFight") else 1.0
    if bout["outcome"] == "D":
        return title
    if bout.get("method") in ("ko", "sub"):
        return p["finish"] * title
    if bout.get("method") == "dec" and str(bout.get("methodDetail") or "").lower() in ("split", "majority"):
        return p["split"] * title
    return title


def results_walk(bouts: list[dict], p: dict | None = None, prior: dict | None = None):
    """Elo-type pass over decided bouts in date order.

    bouts: {"boutId", "date", "a", "b", "outcome" (from a's side: W/L/D/NC), "method", "methodDetail"}.
    Yields (bout, rating a before, rating b before, fights a before, fights b before) and returns the final state
    {slug: {"rating", "fights", "last"}} (ratings as of each fighter's last fight; call results_as_of to age them).
    prior: optional slug -> starting rating (default p["start"] for everyone)."""
    p = p or RESULTS
    state = {}
    pre = []
    for bout in sorted(bouts, key=lambda x: (x["date"], str(x["boutId"]))):
        if bout["outcome"] not in ("W", "L", "D") or not bout.get("a") or not bout.get("b"):
            continue
        prior = prior or {}
        sa = state.setdefault(bout["a"], {"rating": prior.get(bout["a"], p["start"]), "fights": 0, "last": None})
        sb = state.setdefault(bout["b"], {"rating": prior.get(bout["b"], p["start"]), "fights": 0, "last": None})
        ra, rb = _idle(sa["rating"], sa["last"], bout["date"], p), _idle(sb["rating"], sb["last"], bout["date"], p)
        pre.append((bout, ra, rb, sa["fights"], sb["fights"]))
        expected = 1 / (1 + 10 ** ((rb - ra) / 400))
        y = 1.0 if bout["outcome"] == "W" else 0.0 if bout["outcome"] == "L" else 0.5
        m = result_margin(bout, p)
        sa["rating"] = ra + p["k"] * (1 + p["boost"] / (sa["fights"] + 1)) * m * (y - expected)
        sb["rating"] = rb - p["k"] * (1 + p["boost"] / (sb["fights"] + 1)) * m * (y - expected)
        sa["fights"] += 1
        sb["fights"] += 1
        sa["last"] = sb["last"] = bout["date"]
    return state, pre


def pre_ufc_priors(records: dict, scale: float | None = None) -> dict:
    """slug -> starting rating from the pre-UFC record. records: slug -> (wins, losses) before the UFC."""
    scale = PRIOR_SCALE if scale is None else scale
    if not records or not scale:
        return {}
    shrunk = {s: (w + 2) / (w + l + 4) for s, (w, l) in records.items()}
    mid = sorted(shrunk.values())[len(shrunk) // 2]
    return {s: RESULTS_MEAN + scale * (v - mid) for s, v in shrunk.items()}


def results_as_of(bouts: list[dict], as_of: str, p: dict | None = None, prior: dict | None = None) -> dict:
    """slug -> {"rating", "fights", "last"}, with idle drift applied up to as_of."""
    p = p or RESULTS
    state, _ = results_walk(bouts, p, prior)
    return {slug: {**v, "rating": _idle(v["rating"], v["last"], as_of, p)} for slug, v in state.items()}


def skills_composite(pcts: dict):
    """Weighted average of the skill percentiles (needs two of the three)."""
    have = [k for k in SKILLS if pcts.get(k) is not None]
    if len(have) < 2:
        return None
    return sum(pcts[k] * SKILL_WEIGHTS[k] for k in have) / sum(SKILL_WEIGHTS[k] for k in have)


def blend_logit(results: float, skills: float) -> float:
    return BLEND["results"] * (results - RESULTS_MEAN) / 400 + BLEND["skills"] * (skills - 50) / 100


def age_points(born: str | None, as_of: str | None) -> float:
    """Rating points for age on as_of: AGE_POINTS_PER_YEAR per year from AGE_CENTRE, younger up, older down."""
    if not born or not as_of or as_of >= "9999":
        return 0.0
    try:
        age = (_dt.date.fromisoformat(as_of[:10]) - _dt.date.fromisoformat(born[:10])).days / 365.25
    except ValueError:
        return 0.0
    return -AGE_POINTS_PER_YEAR * (age - AGE_CENTRE)


def division_heights(fighters: dict) -> dict:
    """divisionSlug -> mean height in inches of the fighters given (the roster being rated) with a known height."""
    groups = {}
    for f in fighters.values():
        if f.get("height") and f.get("divisionSlug"):
            groups.setdefault(f["divisionSlug"], []).append(f["height"])
    return {d: sum(v) / len(v) for d, v in groups.items() if len(v) >= 5}


def height_points(height, division_avg) -> float:
    """Rating points for height against the division average: HEIGHT_POINTS_PER_INCH per inch, taller up."""
    if not height or division_avg is None:
        return 0.0
    return HEIGHT_POINTS_PER_INCH * (height - division_avg)


def score_100(rating):
    """The reader-facing score out of 100 for a headline rating (1500 = 50), to 2 decimal places (owner, 25 Nov 2026:
    "give the ratings decimal points like 99.95", so close fighters no longer tie). Kept within 1 to 99.99."""
    if rating is None:
        return None
    return round(_clamp(50 + (rating - HEADLINE_CENTRE) / SCORE_DIVISOR, 1, 99.99), 2)


def overall(scores: dict):
    """The OLD headline (average of skill percentiles and form, 0-100). Kept for the comparison study only."""
    skills = [k for k in SKILLS if scores.get(k) is not None]
    if len(skills) < 3 or scores.get("form") is None:
        return None
    total = sum(scores[k] * OVERALL_WEIGHTS[k] for k in skills + ["form"])
    return round(total / sum(OVERALL_WEIGHTS[k] for k in skills + ["form"]))


def rate_roster(fighters: dict, bouts: list[dict] | None = None, as_of: str | None = None,
                prior: dict | None = None) -> dict:
    """fighters: slug -> {"window": weighted window, "history": newest-first fights,
    "divisionSlug": str|None, "born": ISO birth date or None (age adjustment), "height": inches or None (height
    adjustment against the division's average on this roster)}. bouts: every archived UFC bout (all fighters, including those who have left), for
    the results rating; as_of: ISO date the results are aged to; prior: slug -> starting rating (pre_ufc_priors).
    Returns slug -> ratings dict."""
    raw, eligible = {}, {}
    for slug, f in fighters.items():
        w = f["window"]
        if w.get("statFights", 0) < MIN_STAT_FIGHTS or not w.get("rates"):
            continue
        eligible[slug] = max(w.get("effectiveFights") or 0, 0.0)
        raw[slug] = {k: raw_skill(w["rates"], w, k) for k in SKILLS}

    shrunk = {slug: {} for slug in raw}
    means = {}
    for skill in SKILLS:
        values = [raw[s][skill] for s in raw if raw[s][skill] is not None]
        if len(values) < MIN_ROSTER:
            continue
        mean = sum(values) / len(values)
        means[skill] = mean
        for slug in raw:
            if raw[slug][skill] is not None:
                shrunk[slug][skill] = shrink(raw[slug][skill], mean, eligible[slug])

    def population(skill, members=None):
        return sorted(v[skill] for s, v in shrunk.items() if skill in v and (members is None or s in members))

    roster_pop = {k: population(k) for k in SKILLS}
    by_division = {}
    for slug in shrunk:
        div = fighters[slug].get("divisionSlug")
        if div:
            by_division.setdefault(div, set()).add(slug)

    # Provisional: a fighter with one or two measured fights is placed against the ESTABLISHED roster (the
    # populations above, unchanged), using the same shrinkage toward the roster mean. They never enter a
    # population, so no one else's percentile and no leaderboard moves, and they stay eligible=False.
    provisional = {}
    for slug, f in fighters.items():
        w = f["window"]
        if slug in raw or not 1 <= w.get("statFights", 0) < MIN_STAT_FIGHTS or not w.get("rates"):
            continue
        n = max(w.get("effectiveFights") or 0, 0.0)
        vals = {}
        for skill in SKILLS:
            r = raw_skill(w["rates"], w, skill)
            if r is not None and skill in means:
                vals[skill] = shrink(r, means[skill], n)
        if vals:
            provisional[slug] = vals

    skill_pct = {slug: {k: percentile(v.get(k), roster_pop[k]) if k in v else None for k in SKILLS}
                 for slug, v in shrunk.items()}

    prov_pct = {slug: {k: percentile(vals[k], roster_pop[k]) if k in vals else None for k in SKILLS}
                for slug, vals in provisional.items()}   # kept apart from skill_pct: never used as opponent strength

    # Opponent strength: mean of two best skill percentiles and unadjusted form.
    strength = {}
    for slug, pcts in skill_pct.items():
        best = sorted((p for p in pcts.values() if p is not None), reverse=True)[:2]
        if len(best) < 2:
            continue
        form = recent_form(fighters[slug]["history"])
        skill = sum(best) / 2
        strength[slug] = ((skill + form) / 2 if form is not None else skill) / 100

    results = results_as_of(bouts or [], as_of or "9999-12-31", None, prior) if bouts else {}
    composite = {slug: skills_composite(skill_pct.get(slug) or prov_pct.get(slug) or {}) for slug in fighters}
    logits = {}
    for slug in fighters:
        res = results.get(slug)
        if res and composite.get(slug) is not None:
            logits[slug] = blend_logit(res["rating"], composite[slug])
    established = [slug for slug in logits if slug in shrunk and results[slug]["fights"] >= RESULTS_MIN_FIGHTS]
    centre = sorted(logits[x] for x in established)[len(established) // 2] if established else 0.0
    # 2 decimals (was whole points): one rating point is 0.125 on the score out of 100, so whole points would leave the
    # decimal score in steps of an eighth.
    height_avg = division_heights(fighters)
    height_adj = {slug: height_points(f.get("height"), height_avg.get(f.get("divisionSlug"))) for slug, f in fighters.items()}
    headline = {slug: round(HEADLINE_CENTRE + HEADLINE_SCALE * (v - centre)
                            + age_points(fighters[slug].get("born"), as_of) + height_adj[slug], 2) for slug, v in logits.items()}
    headline_pop = sorted(headline[x] for x in established)
    # Rank among established fighters by the full rating; equal ratings share a rank.
    ordered = sorted(established, key=lambda x: -headline[x])
    rank = {}
    for i, slug in enumerate(ordered):
        rank[slug] = rank[ordered[i - 1]] if i and headline[slug] == headline[ordered[i - 1]] else i + 1
    results_pop = sorted(results[x]["rating"] for x in established)

    out = {}
    for slug, f in fighters.items():
        pcts = skill_pct.get(slug) or prov_pct.get(slug) or {k: None for k in SKILLS}
        own = shrunk.get(slug) or provisional.get(slug) or {}
        div = f.get("divisionSlug")
        members = by_division.get(div) if div else None
        division_pct = {}
        for k in SKILLS:
            peers = population(k, members) if members else []
            division_pct[k] = (percentile(own[k], peers) if k in own and len(peers) >= MIN_DIVISION_PEERS else None)
        opp = {}
        form = recent_form(f["history"], lambda fight: opp.setdefault(
            fight["boutId"], strength.get(fight.get("opponentSlug"))))
        scores = {**pcts, "form": form}
        w = f["window"]
        rated = slug in shrunk and slug in headline and results[slug]["fights"] >= RESULTS_MIN_FIGHTS
        shown = slug in shrunk or slug in provisional
        out[slug] = {
            "scale": "percentile", "window": "weighted",
            "eligible": rated,
            "provisional": not rated and slug in headline,
            "sample": {"statFights": w.get("statFights", 0), "effectiveFights": w.get("effectiveFights"),
                       "minimum": MIN_STAT_FIGHTS},
            "skills": {k: {"roster": pcts.get(k), "division": division_pct.get(k),
                           "drivers": drivers(w.get("rates") or {}, w, k) if shown else []} for k in SKILLS},
            "form": {"score": form, "opponents": [
                {"boutId": fight["boutId"], "opponent": fight["opponent"], "strength": opp.get(fight["boutId"])}
                for fight in [x for x in f["history"] if x["outcome"] in ("W", "L", "D")][:5]]},
            "overall": score_100(headline.get(slug)),
            "overallRating": headline.get(slug),
            "ageAdjustment": round(age_points(f.get("born"), as_of), 2) if slug in headline else None,
            "heightAdjustment": round(height_adj[slug], 2) if slug in headline else None,
            "overallRank": rank.get(slug) if rated else None,
            "rankOf": len(established),
            "overallPercentile": percentile(headline[slug], headline_pop) if slug in headline else None,
            "model": MODEL,
            "results": None if slug not in results else {
                "rating": round(results[slug]["rating"]), "fights": results[slug]["fights"],
                "percentile": percentile(results[slug]["rating"], results_pop),
                "provisional": results[slug]["fights"] < RESULTS_MIN_FIGHTS},
            "skillsComposite": None if composite.get(slug) is None else round(composite[slug], 1),
            "opponentStrength": strength.get(slug),
        }
    return out
