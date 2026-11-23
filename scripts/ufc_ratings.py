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
"""
from __future__ import annotations

SKILLS = ("striking", "grappling", "wrestling", "defence")
OVERALL_WEIGHTS = {"striking": .25, "grappling": .15, "wrestling": .20, "defence": .25, "form": .15}
MIN_STAT_FIGHTS = 3          # complete-stat UFC fights needed before any skill is rated
MIN_ROSTER = 20              # a skill needs this many rated fighters to rank anyone
MIN_DIVISION_PEERS = 8       # division percentile only with this many rated peers
OPPONENT_SWING = .25
SHRINK_K = 4

# (key, label, unit) for the "what drives this rating" view.
COMPONENTS = {
    "striking": [("slpm", "Significant strikes landed per min", "rate"),
                 ("diffPm", "Strike differential per min", "rate"),
                 ("strAcc", "Significant strike accuracy", "pct"),
                 ("kd15", "Knockdowns per 15 min", "rate"),
                 ("koWinShare", "KO/TKO wins per fight", "pct")],
    "grappling": [("sub15", "Submission attempts per 15 min", "rate"),
                  ("subWinShare", "Submission wins per fight", "pct"),
                  ("rev15", "Reversals per 15 min", "rate"),
                  ("ctrlShare", "Control-time share (secondary)", "pct")],
    "wrestling": [("td15", "Takedowns per 15 min", "rate"),
                  ("tdAcc", "Takedown accuracy", "pct"),
                  ("ctrlShare", "Control-time share", "pct"),
                  ("tdDef", "Takedown defence", "pct"),
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
          "koWinShare": (0, 1), "subWinShare": (0, 1)}


def bounded(rates: dict, window: dict) -> dict:
    """Rates plus window finish shares, with out-of-range values set to None."""
    merged = {**(rates or {}), "koWinShare": (window or {}).get("koWinShare"),
              "subWinShare": (window or {}).get("subWinShare")}
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
        "grappling": [(_between(r.get("sub15"), 0, 3.0), .30), (_between(window.get("subWinShare"), 0, .35), .50),
                      (_between(r.get("rev15"), 0, 2), .15), (_between(r.get("ctrlShare"), 0, .50), .05)],
        "wrestling": [(_between(r.get("td15"), 0, 5.5), .34), (_between(_pct(r.get("tdAcc")), 20, 65), .21),
                      (_between(r.get("ctrlShare"), 0, .55), .28), (_between(_pct(r.get("tdDef")), 40, 95), .12),
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


def overall(scores: dict):
    skills = [k for k in SKILLS if scores.get(k) is not None]
    if len(skills) < 3 or scores.get("form") is None:
        return None
    total = sum(scores[k] * OVERALL_WEIGHTS[k] for k in skills + ["form"])
    return round(total / sum(OVERALL_WEIGHTS[k] for k in skills + ["form"]))


def rate_roster(fighters: dict) -> dict:
    """fighters: slug -> {"window": weighted window, "history": newest-first fights,
    "divisionSlug": str|None}. Returns slug -> ratings dict."""
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
        rated = slug in shrunk
        shown = rated or slug in provisional
        out[slug] = {
            "scale": "percentile", "window": "weighted",
            "eligible": rated,
            "provisional": slug in provisional,
            "sample": {"statFights": w.get("statFights", 0), "effectiveFights": w.get("effectiveFights"),
                       "minimum": MIN_STAT_FIGHTS},
            "skills": {k: {"roster": pcts.get(k), "division": division_pct.get(k),
                           "drivers": drivers(w.get("rates") or {}, w, k) if shown else []} for k in SKILLS},
            "form": {"score": form, "opponents": [
                {"boutId": fight["boutId"], "opponent": fight["opponent"], "strength": opp.get(fight["boutId"])}
                for fight in [x for x in f["history"] if x["outcome"] in ("W", "L", "D")][:5]]},
            "overall": overall(scores),
            "opponentStrength": strength.get(slug),
        }
    return out
