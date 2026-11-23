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

SKILLS = ("striking", "grappling", "wrestling", "defence")
OVERALL_WEIGHTS = {"striking": .25, "grappling": .15, "wrestling": .20, "defence": .25, "form": .15}
MIN_STAT_FIGHTS = 3          # complete-stat UFC fights needed before any skill is rated
MIN_ROSTER = 20              # a skill needs this many rated fighters to rank anyone
MIN_DIVISION_PEERS = 8       # division percentile only with this many rated peers
OPPONENT_SWING = .25
SHRINK_K = 4

# Results rating (Elo-type). Fitted on decided UFC fights before 2024 only by scripts/ufc-rating-fit.py, then frozen.
# Owner choices (PR #453): a title fight counts 1.5x and the idle drift is 10% a year; the rest is fitted
# (`python3 scripts/ufc-rating-fit.py --fix idle=0.1 --fix title=1.5 --mix 0.6`).
RESULTS = {"start": 1500, "k": 64, "boost": 1.0, "finish": 1.25, "split": 0.5, "idle": 0.1, "title": 1.5}
RESULTS_MEAN = 1500          # an idle rating drifts back toward this
RESULTS_MIN_FIGHTS = 3       # results fights before the results part counts as established
# Headline blend, in log-odds per 400 results points and per 100 skills-composite points. Owner's mix: results carry
# 60% of the spread and skills 40% (the fit on 2019-2023 fights gave 68/32), same total spread as the fit.
# The four skills keep their old relative weights.
BLEND = {"results": 1.843, "skills": 1.354}
SKILL_WEIGHTS = {"striking": .25, "grappling": .15, "wrestling": .20, "defence": .25}
HEADLINE_CENTRE = 1500       # the median established fighter
HEADLINE_SCALE = 400 / math.log(10)   # Elo convention: rating points per unit of log-odds
MODEL = "results+skills 2026-11"

# (key, label, unit) for the "what drives this rating" view.
COMPONENTS = {
    "striking": [("slpm", "Significant strikes landed per min", "rate"),
                 ("diffPm", "Strike differential per min", "rate"),
                 ("strAcc", "Significant strike accuracy", "pct"),
                 ("kd15", "Knockdowns per 15 min", "rate"),
                 ("koWinShare", "KO/TKO wins per fight", "pct")],
    "grappling": [("sub15", "Submission attempts per 15 min", "rate"),
                  ("subWinShare", "Submission wins per fight", "pct"),
                  ("subLossShare", "Submission losses per fight (lower is better)", "pct"),
                  ("subAbs15", "Opponent submission attempts per 15 min (lower is better)", "rate"),
                  ("rev15", "Reversals per 15 min", "rate"),
                  ("netCtrl", "Control time won minus conceded", "signed")],
    "wrestling": [("td15", "Takedowns per 15 min", "rate"),
                  ("tdAcc", "Takedown accuracy", "pct"),
                  ("tdDef", "Takedown defence", "pct"),
                  ("netCtrl", "Control time won minus conceded", "signed"),
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
          "netCtrl": (-1, 1)}


def bounded(rates: dict, window: dict) -> dict:
    """Rates plus window finish shares, with out-of-range values set to None."""
    rates = rates or {}
    ctrl, against = rates.get("ctrlShare"), rates.get("ctrlAgainstShare")
    net = (round(ctrl - against, 3) if isinstance(ctrl, (int, float)) and isinstance(against, (int, float)) else None)
    merged = {**rates, "koWinShare": (window or {}).get("koWinShare"),
              "subWinShare": (window or {}).get("subWinShare"), "subLossShare": (window or {}).get("subLossShare"),
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
    return {
        "striking": [(_between(slpm, .8, 6.5), .18), (_between(diff, -2.0, 3.0), .22),
                     (_between(_pct(r.get("strAcc")), 25, 65), .15), (_between(r.get("kd15"), 0, 1.0), .20),
                     (_between(window.get("koWinShare"), 0, .50), .25)],
        # Effectiveness, not volume: what a fighter stops counts as well as what they land.
        "grappling": [(_between(r.get("sub15"), 0, 3.0), .20), (_between(window.get("subWinShare"), 0, .35), .30),
                      (_between(window.get("subLossShare"), .25, 0), .20), (_between(r.get("subAbs15"), 2.0, 0), .10),
                      (_between(r.get("rev15"), 0, 2), .10), (_between(r.get("netCtrl"), -.40, .50), .10)],
        "wrestling": [(_between(r.get("td15"), 0, 5.5), .20), (_between(_pct(r.get("tdAcc")), 20, 65), .10),
                      (_between(_pct(r.get("tdDef")), 40, 95), .30), (_between(r.get("netCtrl"), -.40, .50), .35),
                      (_between(r.get("rev15"), 0, 2), .05)],
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


def results_walk(bouts: list[dict], p: dict | None = None):
    """Elo-type pass over decided bouts in date order.

    bouts: {"boutId", "date", "a", "b", "outcome" (from a's side: W/L/D/NC), "method", "methodDetail"}.
    Yields (bout, rating a before, rating b before, fights a before, fights b before) and returns the final state
    {slug: {"rating", "fights", "last"}} (ratings as of each fighter's last fight; call results_as_of to age them)."""
    p = p or RESULTS
    state = {}
    pre = []
    for bout in sorted(bouts, key=lambda x: (x["date"], str(x["boutId"]))):
        if bout["outcome"] not in ("W", "L", "D") or not bout.get("a") or not bout.get("b"):
            continue
        sa = state.setdefault(bout["a"], {"rating": p["start"], "fights": 0, "last": None})
        sb = state.setdefault(bout["b"], {"rating": p["start"], "fights": 0, "last": None})
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


def results_as_of(bouts: list[dict], as_of: str, p: dict | None = None) -> dict:
    """slug -> {"rating", "fights", "last"}, with idle drift applied up to as_of."""
    p = p or RESULTS
    state, _ = results_walk(bouts, p)
    return {slug: {**v, "rating": _idle(v["rating"], v["last"], as_of, p)} for slug, v in state.items()}


def skills_composite(pcts: dict):
    """Weighted average of the skill percentiles (needs three of the four)."""
    have = [k for k in SKILLS if pcts.get(k) is not None]
    if len(have) < 3:
        return None
    return sum(pcts[k] * SKILL_WEIGHTS[k] for k in have) / sum(SKILL_WEIGHTS[k] for k in have)


def blend_logit(results: float, skills: float) -> float:
    return BLEND["results"] * (results - RESULTS_MEAN) / 400 + BLEND["skills"] * (skills - 50) / 100


def overall(scores: dict):
    """The OLD headline (average of skill percentiles and form, 0-100). Kept for the comparison study only."""
    skills = [k for k in SKILLS if scores.get(k) is not None]
    if len(skills) < 3 or scores.get("form") is None:
        return None
    total = sum(scores[k] * OVERALL_WEIGHTS[k] for k in skills + ["form"])
    return round(total / sum(OVERALL_WEIGHTS[k] for k in skills + ["form"]))


def rate_roster(fighters: dict, bouts: list[dict] | None = None, as_of: str | None = None) -> dict:
    """fighters: slug -> {"window": weighted window, "history": newest-first fights,
    "divisionSlug": str|None}. bouts: every archived UFC bout (all fighters, including those who have left), for
    the results rating; as_of: ISO date the results are aged to. Returns slug -> ratings dict."""
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

    results = results_as_of(bouts or [], as_of or "9999-12-31") if bouts else {}
    composite = {slug: skills_composite(skill_pct.get(slug) or prov_pct.get(slug) or {}) for slug in fighters}
    logits = {}
    for slug in fighters:
        res = results.get(slug)
        if res and composite.get(slug) is not None:
            logits[slug] = blend_logit(res["rating"], composite[slug])
    established = [slug for slug in logits if slug in shrunk and results[slug]["fights"] >= RESULTS_MIN_FIGHTS]
    centre = sorted(logits[x] for x in established)[len(established) // 2] if established else 0.0
    headline = {slug: round(HEADLINE_CENTRE + HEADLINE_SCALE * (v - centre)) for slug, v in logits.items()}
    headline_pop = sorted(headline[x] for x in established)
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
            "overall": headline.get(slug),
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
