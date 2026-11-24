#!/usr/bin/env python3
"""Build data/ufc-fighter-form.json: the one Form score, stages, badges and form ranks for the profile and the hub.

Specification: the Fighters hub handover of 24 Nov 2026 (docs/design/FIGHTERS-HUB-FORM.md), sections 3 to 5, with the
owner's choices of the same day (docs/design/DECISIONS.md):
  * strength on the night comes from the BEFN results rating's own point-in-time history (scripts/ufc_ratings.py
    results_walk), not a separate Elo, so the site has one rating engine;
  * Rising star and Prospect also need a modest pre-UFC career (15 or fewer pre-UFC fights) where the pre-UFC record
    is known (overall record minus UFC record, data/ufc-overall-records.json), as well as the debut-age rule;
  * Form and the BEFN rating (Overall) are shown side by side; nothing here compares them.

Offline and deterministic. Inputs: data/ufc-stats (fighters, index asOf), data/ufc-v4-certified-careers.json,
data/ufc-fighter-born.json, data/ufc-overall-records.json, data/ufc-fighter-status.json (hand-kept injuries), and
data/news-live.json (only to SUGGEST injuries for the owner to confirm; never applied). Refuses to overwrite the saved
file if the number of fighters falls by 30% or more.
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
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
WEIGHTS = {"results": .30, "finishing": .30, "opposition": .20, "activity": .10, "performance": .10}
POSITION = (1.00, .85, .70, .55, .40)
HALF_LIFE_MONTHS = 18
WINDOW_MONTHS = 36
POOL_MONTHS = 24
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


# ---------- rating history: strength on the night ----------
def load_build():
    sys.path.insert(0, str(ROOT / "scripts"))
    spec = importlib.util.spec_from_file_location("ufc_stats_build", ROOT / "scripts/build-ufc-stats.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def rating_history(build, as_of: dt.date):
    """boutId -> {slug: pre-bout BEFN results rating}, plus a date-sorted list of all pre-bout ratings."""
    old, real, captured = build.ACTIVE_MONTHS, build.results_bouts, {}
    build.ACTIVE_MONTHS = 10 ** 4
    build.results_bouts = lambda pf: captured.setdefault("b", real(pf))
    try:
        with tempfile.TemporaryDirectory() as tmp:
            build.build(as_of, Path(tmp), None, True)
    finally:
        build.ACTIVE_MONTHS, build.results_bouts = old, real
    _, pre = build.ufc_ratings.results_walk(captured["b"], build.ufc_ratings.RESULTS, build.pre_ufc_priors())
    by_bout, timeline = {}, []
    for bout, ra, rb, _na, _nb in pre:
        by_bout[str(bout["boutId"])] = {bout["a"]: ra, bout["b"]: rb}
        timeline += [(bout["date"], ra), (bout["date"], rb)]
    timeline.sort()
    return by_bout, timeline


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
            import bisect
            lo = bisect.bisect_left(self.dates, add_months(date, -WINDOW_MONTHS))
            hi = bisect.bisect_left(self.dates, date)
            pool = self.values[lo:hi]
            p = (sum(1 for v in pool if v < rating) + .5 * sum(1 for v in pool if v == rating)) / len(pool) if pool else .5
            self.cache[key] = clamp((p - .30) / .68)
        return self.cache[key]


# ---------- the Form points score ----------
def decided(history):
    return [f for f in history if f["outcome"] in ("W", "L", "D")]


def win_streak(history) -> int:
    n = 0
    for f in decided(history):
        if f["outcome"] != "W":
            break
        n += 1
    return n


def points_for(fighter, history, as_of, ratings, strength, performance, injured):
    """Returns (points or None, parts, lossCap, per-fight notes). history: newest first, all UFC fights."""
    window = [f for f in decided(history) if months_between(f["date"], as_of) <= WINDOW_MONTHS][:5]
    if len(window) < 2:
        return None, None, None
    weights = [POSITION[i] * .5 ** (months_between(f["date"], as_of) / HALF_LIFE_MONTHS) for i, f in enumerate(window)]
    s = sum(weights)

    def higher_on_night(f):
        r = ratings.get(str(f["boutId"])) or {}
        me, opp = r.get(fighter), r.get(f.get("opponentSlug"))
        return None if me is None or opp is None else opp > me

    def opp_strength(f):
        r = ratings.get(str(f["boutId"])) or {}
        opp = r.get(f.get("opponentSlug"))
        return strength.of(opp, f["date"]) if opp is not None else .3   # unknown opponent: the median's score

    res = []
    for f in window:
        if f["outcome"] == "W":
            res.append(1.0)
        elif f["outcome"] == "D":
            res.append(.5)
        elif higher_on_night(f) or f.get("titleFight"):
            res.append(.2 if finished(f) else .4)
        else:
            res.append(0.0)
    R = min(1.0, sum(w * x for w, x in zip(weights, res)) / s + min(.15, .05 * win_streak(history)))

    wins = [(w, f) for w, f in zip(weights, window) if f["outcome"] == "W"]
    def fin(f):
        if finished(f):
            rnd = f.get("endRound") or 3
            return 1.0 if rnd <= 1 else .85 if rnd == 2 else .70
        return .15 if is_split(f) else .40
    F = sum(w * fin(f) for w, f in wins) / sum(w for w, _ in wins) if wins else 0.0

    Q = sum(w * (0.0 if f["outcome"] == "L" else opp_strength(f)) for w, f in zip(weights, window)) / s

    last_any = history[0]["date"]
    gap = months_between(last_any, as_of)
    A = 1.0 if injured else clamp(1 - (gap - 6) / 12)

    parts = {"results": round(R, 3), "finishing": round(F, 3), "opposition": round(Q, 3),
             "activity": round(A, 3), "performance": None if performance is None else round(performance, 3)}
    used = {k: v for k, v in parts.items() if v is not None}
    points = 100 * sum(WEIGHTS[k] * v for k, v in used.items()) / sum(WEIGHTS[k] for k in used)

    cap = None
    last = decided(history)[0]
    if last["outcome"] == "L":
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
        elif not finished(last):
            manner = 5
        else:
            manner = 10 if (last.get("endRound") or 3) >= 3 else 15
        cap = 85 - opp_pen - manner
        points = min(points, cap)
    return round(points, 1), parts, cap


# ---------- inputs ----------
def load_json(path, default=None):
    return json.loads(Path(path).read_text(encoding="utf-8")) if Path(path).exists() else default


def certified_set():
    c = load_json(DATA / "ufc-v4-certified-careers.json", {}) or {}
    out = set(c.get("certified") or {})
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


def percentile_in(values, x):
    vals = [v for v in values if v is not None]
    if x is None or not vals:
        return None
    return (sum(1 for v in vals if v < x) + .5 * sum(1 for v in vals if v == x)) / len(vals)


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
    ratings, timeline = rating_history(build, dt.date.fromisoformat(as_of))
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

    # within-division percentiles of last-5 strike differential and control share
    by_div = {}
    for slug, d in files.items():
        r = (d["windows"].get("last5") or {}).get("rates") or {}
        by_div.setdefault(division[slug], []).append((slug, r.get("diffPm"), r.get("ctrlShare")))
    performance = {}
    for div, rows in by_div.items():
        diffs, ctrls = [x[1] for x in rows], [x[2] for x in rows]
        for slug, dp, cs in rows:
            parts = [p for p in (percentile_in(diffs, dp), percentile_in(ctrls, cs)) if p is not None]
            performance[slug] = sum(parts) / len(parts) if parts else None

    out = {}
    for slug, d in files.items():
        history = d["fights"]                     # newest first
        inj = active_injury(injuries.get(slug), history, as_of)
        pts, parts, cap = points_for(slug, history, as_of, ratings, strength, performance.get(slug), inj)
        dec = decided(history)
        last_date = history[0]["date"] if history else None
        gap = months_between(last_date, as_of) if last_date else 999
        first = min(f["date"] for f in history) if history else None
        age = years_between(born[slug], as_of) if slug in born else None
        debut_age = years_between(born[slug], first) if slug in born and first else None
        career = d["windows"]["career"]
        out[slug] = {"name": d["name"], "slug": slug, "points": pts, "parts": parts, "lossCap": cap,
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
            "weights": WEIGHTS, "formPool": len(pool), "fighters": out, "divisions": pulse,
            "certificationQueue": queue, "injurySuggestions": suggestions}


def stage_for(f):
    """Handover 4.1, checked in order; the first match wins. Returns (stage, reasons)."""
    pts, rank, why = f["points"], f["rank"], []
    dec = f["_dec"]
    won_last = bool(dec) and dec[0]["outcome"] == "W"
    injured = bool(f["injured"])
    if f["champion"]:
        return "Champion", why
    if rank and 1 <= rank <= 15:
        reason = form_check(f)
        if reason:
            return "Slipping", [reason]
        if rank <= 5 and (won_last or (pts is not None and pts >= 70)):
            return "Title contender", why
        return "Contender", (["limited data"] if pts is None else why)
    if f["monthsOut"] > 24 and not injured:
        return "Inactive", why
    age_ok = lambda limit: f["age"] is None or f["age"] <= limit
    debut_ok = f["debutAge"] is None or f["debutAge"] < 30
    pre_ok = f["preUfcFights"] is None or f["preUfcFights"] <= MAX_PRE_UFC_FIGHTS
    note = (["age unknown"] if f["age"] is None else []) + ([] if f["preUfcFights"] is not None else ["pre-UFC record unknown"])
    debut_recent = f["debut"] and months_between(f["debut"], AS_OF[0]) <= 36
    if (3 <= f["ufcFights"] <= 6 and debut_recent and f["losses"] <= 1 and won_last and pts is not None and pts >= 65
            and age_ok(32) and debut_ok and pre_ok):
        return "Rising star", note
    if 1 <= f["ufcFights"] <= 3 and f["losses"] == 0 and age_ok(30) and debut_ok and pre_ok:
        return "Prospect", note
    last4 = [x["outcome"] for x in dec[:4]]
    if (pts is not None and pts >= 68 and won_last and last4.count("W") >= 3 and f["monthsOut"] <= 18
            and f["ufcFights"] <= 10 and f["age"] is not None and f["age"] <= 33):
        return "Breakout", why
    return "Established", why


def form_check(f):
    """Handover 4.2: the first reason a ranked fighter fails, or None."""
    dec, pts = f["_dec"], f["points"]
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
    if pts is not None and (pts < 30 or (pts < 40 and last3.count("L") >= 2)):
        return "form well below the division"
    return None


def badges_for(f, prev):
    dec, pts, out = f["_dec"], f["points"], []
    last3 = [x["outcome"] for x in dec[:3]]
    hot = (pts is not None and len(dec) >= 3 and last3 == ["W", "W", "W"] and f["monthsOut"] <= 12
           and f["ufcFights"] >= 3 and not f["injured"])
    was_hot = bool(prev) and "On fire" in (prev.get("badges") or [])
    if hot and (pts >= 75 or (was_hot and pts >= 68)):      # drop only below 68, to avoid flicker
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
