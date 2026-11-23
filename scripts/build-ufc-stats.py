#!/usr/bin/env python3
"""Build BEFN UFC fighter statistics from saved round-by-round evidence.

Pure calculation over files already in data/; never calls a provider.

Inputs
  data/ufc-research-archive.json       per-round stats for each archived UFC fight
  data/ufcalendar-rich-progress.json   official results (winner, method, round, time)
  data/results.json                    the free results importer's own cards, used
                                       only for fights after the last one the
                                       (retired) paid collector recorded
  data/ufc-free-round-stats.json       per-round statistics from the free UFCStats
                                       export for those same later fights
  data/ufcalendar-judging-research.json judges' scorecards for decisions
  data/ufc-divisions.json              official division rosters, ranks, champions
  data/ufc-bout-weight-classes.json    division of each fighter's latest labelled bout (free UFCStats)
  data/ufc-fighter-v3.json + data/ufc-*-profiles.json  fallback divisions

Outputs (data/ufc-stats/)
  index.json            one compact row per active fighter, for leaderboards
  fighters/<slug>.json  full per-fighter file: every archived UFC fight with
                        rounds and scorecards, plus aggregates per window

Rules
  * A fight contributes statistics only if its official result is known and
    every round up to the finishing round was captured with valid numbers.
    Results (wins, methods) still count even when round stats are missing.
  * The paid collector that writes ufcalendar-rich-progress.json is switched
    off, so cards that finish from now on arrive through data/results.json,
    with their measured rounds from data/ufc-free-round-stats.json, instead. Such a fight is used only when both names resolve to exactly one
    native fighter id the collector already holds, and only for dates after the
    last fight the collector recorded, so no published number changes.
  * Rates use cage time from the official finishing round and clock.
  * Zero is evidence; missing is None. Nothing is estimated.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import unicodedata
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ufc_ratings  # noqa: E402  (same folder; the build script name has hyphens)
import ufc_snapshot_scores as sc  # noqa: E402  (shared division_slug; single source of truth)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SCHEMA = 1
ROUND_SECONDS = 300
ACTIVE_MONTHS = 36
HALF_LIFE_DAYS = 548  # ~18 months: weight of a fight halves every 18 months
WINDOWS = ("last5", "l12", "l36", "career", "weighted")

# Per-round counting fields, in both corners. Attempt fields may be missing
# on older fights; they are then treated as unavailable, never as zero.
# What the rates and ratings are built from. A career rate is void as soon as
# one measured round lacks its field, so a source must carry all of these.
RATED_COUNTS = ("sigLanded", "sigAttempted", "totalLanded", "knockdowns", "takedowns",
                "takedownAttempts", "subAttempts", "reversals", "controlSec")

COUNTS = (
    "sigLanded", "sigAttempted", "totalLanded", "totalAttempted",
    "headLanded", "headAttempted", "bodyLanded", "bodyAttempted",
    "legLanded", "legAttempted", "distanceLanded", "distanceAttempted",
    "clinchLanded", "clinchAttempted", "groundLanded", "groundAttempted",
    "knockdowns", "takedowns", "takedownAttempts", "subAttempts",
    "reversals", "controlSec", "distanceTimeSec", "clinchTimeSec", "groundTimeSec",
)
PAIRS = (  # landed must never exceed attempted
    ("sigLanded", "sigAttempted"), ("totalLanded", "totalAttempted"),
    ("headLanded", "headAttempted"), ("bodyLanded", "bodyAttempted"),
    ("legLanded", "legAttempted"), ("distanceLanded", "distanceAttempted"),
    ("clinchLanded", "clinchAttempted"), ("groundLanded", "groundAttempted"),
    ("takedowns", "takedownAttempts"),
)
METHODS = {
    "ko_tko": "ko", "submission": "sub", "technical_submission": "sub",
    "decision_unanimous": "dec", "decision_split": "dec",
    "decision_majority": "dec", "decision": "dec",
    "draw": "draw", "no_contest": "nc", "dq": "dq",
}


FEEDER_EVENT = re.compile(r"contender\s+series|\bdwcs\b|road\s+to\s+ufc", re.I)


def is_feeder_event(title) -> bool:
    """Dana White's Contender Series and Road to UFC are not UFC roster fights.

    Same rule as isFeederUfcEvent in scripts/ufc-official-event-scope.mjs. The
    title needs no "UFC" word, so The Ultimate Fighter finales still count.
    """
    return bool(FEEDER_EVENT.search(str(title or "")))


def attested_showcase_ids() -> set[str]:
    """Native bout ids the evidence register independently proves were official UFC showcases."""
    try:
        register = load("ufc-independent-full-career-verification.json")
    except FileNotFoundError:
        return set()
    out = set()
    for entry in (register.get("fighters") or {}).values():
        for item in entry.get("officialShowcaseBouts") or []:
            if (item.get("independentlyOfficial") is True and item.get("nativeBoutId")
                    and str(item.get("officialUfcSourceUrl", "")).startswith("https://www.ufc.com/news/")):
                out.add(str(item["nativeBoutId"]))
    return out


def out_of_scope(bout: dict, showcases: set[str]) -> bool:
    return is_feeder_event(bout.get("event")) and str(bout.get("id")) not in showcases


def result_method(text) -> str | None:
    """The provider's method code for the free text on a results.json row."""
    low = re.sub(r"\s+", " ", str(text or "")).strip().lower()
    if not low:
        return None
    if "no contest" in low:
        return "no_contest"
    if "draw" in low:
        return "draw"
    if "disqualification" in low or re.match(r"dq\b", low):
        return "dq"
    if "submission" in low:
        return "submission"
    if "decision" in low:
        return "decision"
    if re.search(r"\bko\b|\btko\b", low):
        return "ko_tko"
    return None  # unreadable wording is never guessed at


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text or ""))
    return re.sub(r"[^a-z0-9]", "", text.encode("ascii", "ignore").decode().lower())


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def apply_display_names(fights: list) -> int:
    """Spell a fighter as UFC.com does where the archive's name differs (data/ufc-display-names.json).

    The slug never changes. The name is replaced on the fighter's own side of every fight, which is also how an
    opponent is named in other fighters' rows and how names.json is keyed, so one spelling is used everywhere.
    """
    try:
        table = load("ufc-display-names.json").get("names") or {}
    except (OSError, ValueError):
        return 0
    changed = 0
    for fight in fights:
        for corner in ("a", "b"):
            entry = table.get(fight[corner].get("slug") or "")
            if entry and entry.get("name") and fight[corner].get("name") != entry["name"]:
                fight[corner]["name"] = entry["name"]
                changed += 1
    return changed


def results_rows() -> list:
    """The site's own result rows, or nothing if the file is absent or unreadable."""
    try:
        rows = load("results.json").get("results")
    except (OSError, ValueError):
        return []
    return rows if isinstance(rows, list) else []


def parse_date(value) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def clock_seconds(text) -> int | None:
    m = re.fullmatch(r"\s*(\d{1,2}):([0-5]\d)\s*", str(text or ""))
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def round_lengths(result: dict) -> list[int] | None:
    """Seconds fought in each round from the official finishing round and clock."""
    rnd, clock = result.get("round"), clock_seconds(result.get("time"))
    if not isinstance(rnd, int) or not 1 <= rnd <= 5 or clock is None:
        return None
    if not 0 < clock <= ROUND_SECONDS:
        return None
    return [ROUND_SECONDS] * (rnd - 1) + [clock]


def clean_side(side: dict | None) -> dict | None:
    """Validated per-round counts for one corner, or None if unusable."""
    if not isinstance(side, dict):
        return None
    out = {}
    for key in COUNTS:
        value = side.get(key)
        out[key] = value if isinstance(value, int) and value >= 0 else None
    if out["sigLanded"] is None:
        return None
    for landed, attempted in PAIRS:
        if out[landed] is not None and out[attempted] is not None and out[landed] > out[attempted]:
            return None
    return out


def build_fight(archive_fight: dict, bout: dict, scorecard: dict | None) -> dict | None:
    """Join one archived fight with its official result, in progress corner order."""
    result = bout.get("result") or {}
    method = METHODS.get(result.get("method") or "")
    if bout.get("status") != "completed" and method not in ("nc", "draw"):
        return None
    a, b = bout["a"], bout["b"]
    swap = norm(archive_fight["fighterA"]) == norm(b["name"])
    if not swap and norm(archive_fight["fighterA"]) != norm(a["name"]):
        return None  # corners cannot be aligned with confidence
    lengths = round_lengths(result)
    rounds = []
    stats_ok = lengths is not None
    by_number = {r.get("round"): r for r in archive_fight.get("rounds") or []}
    for i in range(len(lengths or [])):
        row = by_number.get(i + 1) or {}
        first, second = (row.get("b"), row.get("a")) if swap else (row.get("a"), row.get("b"))
        sa, sb = clean_side(first), clean_side(second)
        if sa is None or sb is None:
            stats_ok = False
            break
        for side in (sa, sb):
            if side["controlSec"] is not None and side["controlSec"] > lengths[i]:
                stats_ok = False
        rounds.append({"round": i + 1, "seconds": lengths[i], "a": sa, "b": sb})
    winner = result.get("winnerId")
    fight = {
        "boutId": str(bout["id"]),
        "date": bout.get("eventDate"),
        "event": bout.get("event"),
        "titleFight": bool(bout.get("titleFight")),
        "mainEvent": bool(bout.get("main")),
        "a": {"slug": a.get("slug"), "name": a.get("name"), "id": str(a.get("id"))},
        "b": {"slug": b.get("slug"), "name": b.get("name"), "id": str(b.get("id"))},
        "winner": "a" if winner == a.get("id") else "b" if winner == b.get("id") else None,
        "method": method,
        "methodDetail": result.get("finishDetail") or None,
        "endRound": result.get("round"),
        "endTime": result.get("time"),
        "seconds": sum(lengths) if lengths else None,
        "rounds": rounds if stats_ok else [],
        "statsComplete": stats_ok,
        "scorecards": None,
    }
    if scorecard and isinstance(scorecard.get("judges"), list):
        judges = []
        for j in scorecard["judges"]:
            if not j.get("scoresKnown"):
                continue
            rows = [r for r in j.get("rounds") or [] if isinstance(r, list) and len(r) == 3]
            judges.append({"judge": j.get("judge"),
                           "rounds": [[int(r[0]), int(r[1]), int(r[2])] for r in rows],
                           "total": [j.get("totalA"), j.get("totalB")]})
        if judges:
            fight["scorecards"] = {"decision": scorecard.get("decision"), "judges": judges}
    if fight["winner"] is None and method not in ("draw", "nc"):
        return None  # a completed fight must name its winner
    return fight


def pair_key(a, b) -> tuple:
    return tuple(sorted((norm(a), norm(b))))


def fighter_index(bouts: dict) -> dict:
    """Name -> the collector's own slug and native id, only where it is unambiguous."""
    seen: dict[str, set] = {}
    for bout in bouts.values():
        for corner in ("a", "b"):
            side = bout.get(corner) or {}
            name, slug, native = side.get("name"), side.get("slug"), side.get("id")
            if name and slug and native is not None:
                seen.setdefault(norm(name), set()).add((slug, str(native), name))
    return {key: dict(zip(("slug", "id", "name"), next(iter(found))))
            for key, found in seen.items() if len(found) == 1}


def bout_from_result(row: dict, people: dict) -> dict | None:
    """One completed results.json row in the shape of a collector bout record."""
    method = result_method(row.get("method"))
    fighters = row.get("fighters") or []
    if method is None or len(fighters) != 2:
        return None
    sides = [people.get(norm(f.get("name"))) for f in fighters]
    if not all(sides) or sides[0]["slug"] == sides[1]["slug"]:
        return None  # an unknown or ambiguous name is never promoted to a fighter
    winner = row.get("winner")
    return {
        "id": str(row.get("id")), "org": "ufc", "status": "completed",
        "eventDate": row.get("date"), "event": row.get("event"),
        "titleFight": False,  # a results row carries no title flag, so it is not inferred
        "main": row.get("order") == 0,
        "a": {"slug": sides[0]["slug"], "name": sides[0]["name"], "id": sides[0]["id"]},
        "b": {"slug": sides[1]["slug"], "name": sides[1]["name"], "id": sides[1]["id"]},
        "result": {"method": method, "round": row.get("round"), "time": row.get("time"),
                   "winnerId": sides[winner]["id"] if winner in (0, 1) else None,
                   "finishDetail": None},
    }


def fully_measured(record: dict | None, end_round) -> bool:
    """Every field the ratings use, for both corners, in every round fought."""
    if not record or not isinstance(end_round, int):
        return False
    rounds = {r.get("round"): r for r in record.get("rounds") or []}
    return all(isinstance(((rounds.get(number) or {}).get(corner) or {}).get(field), int)
               for number in range(1, end_round + 1) for corner in ("a", "b") for field in RATED_COUNTS)


def free_rounds() -> dict:
    """Per-round statistics for fights the archive does not hold, keyed date|pair."""
    try:
        return load("ufc-free-round-stats.json").get("fights") or {}
    except (OSError, ValueError):
        return {}


def results_only_fights(rows, bouts: dict, archive: dict, after: dt.date | None, skipped: dict,
                       showcases: set[str] = frozenset()) -> list[dict]:
    """Fights the retired paid collector never recorded, taken from data/results.json.

    Only cards after the last fight the collector recorded are read, so nothing
    already published changes, and a bout is used only when both names resolve to
    exactly one native fighter id the collector already holds. Measured rounds come
    from the archive when it fully measures the same fight, otherwise from the
    free UFCStats export; a fight with neither counts as a result with no rounds.
    """
    people = fighter_index(bouts)
    captured = {}
    for record in archive.values():
        day = parse_date(record.get("date"))
        if day and str(record.get("promotion", "")).upper() == "UFC":
            captured.setdefault((day, pair_key(record.get("fighterA"), record.get("fighterB"))), record)
    free = free_rounds()
    out, seen = [], set()
    for row in rows:
        day = parse_date(row.get("date"))
        if (row.get("status") != "completed" or row.get("sport") != "MMA"
                or not str(row.get("eventId", "")).startswith("ufc")
                or not day or (after is not None and day <= after)):
            continue
        if is_feeder_event(row.get("event")):
            skipped["feederSeries"] += 1
            continue
        bout = bout_from_result(row, people)
        if bout is None:
            skipped["unresolved"] += 1
            continue
        key = (day, pair_key(bout["a"]["name"], bout["b"]["name"]))
        if key in seen:
            continue
        measured = free.get(day.isoformat() + "|" + "|".join(key[1]))
        end_round = bout["result"]["round"]
        record = next((r for r in (captured.get(key), measured) if fully_measured(r, end_round)), None)
        fight = build_fight(record or {"fighterA": bout["a"]["name"],
                                       "fighterB": bout["b"]["name"], "rounds": []}, bout, None)
        if fight is None:
            skipped["unresolved"] += 1
            continue
        fight["resultSource"] = "results"
        seen.add(key)
        out.append(fight)
    return out


def side_view(fight: dict, corner: str) -> dict:
    """The fight from one fighter's perspective: own, opp and outcome."""
    other = "b" if corner == "a" else "a"
    outcome = ("NC" if fight["method"] == "nc" else "D" if fight["method"] == "draw" or fight["winner"] is None
               else "W" if fight["winner"] == corner else "L")
    return {
        "boutId": fight["boutId"], "date": fight["date"], "event": fight["event"],
        "opponent": fight[other]["name"], "opponentSlug": fight[other]["slug"],
        "outcome": outcome, "method": fight["method"], "methodDetail": fight["methodDetail"],
        "endRound": fight["endRound"], "endTime": fight["endTime"], "seconds": fight["seconds"],
        "titleFight": fight["titleFight"], "mainEvent": fight["mainEvent"],
        "statsComplete": fight["statsComplete"],
        "resultSource": fight.get("resultSource"),  # absent unless the free results file supplied it
        "rounds": [{"round": r["round"], "seconds": r["seconds"], "own": r[corner], "opp": r[other]}
                   for r in fight["rounds"]],
        "scorecards": None if not fight["scorecards"] else {
            "decision": fight["scorecards"]["decision"],
            "judges": [{"judge": j["judge"],
                        "rounds": [[r[0], r[1], r[2]] if corner == "a" else [r[0], r[2], r[1]] for r in j["rounds"]],
                        "total": j["total"] if corner == "a" else j["total"][::-1]}
                       for j in fight["scorecards"]["judges"]],
        },
    }


# Leaderboard metrics kept in the compact index (full rates stay in profiles).
INDEX_RATES = ("slpm", "sapm", "diffPm", "strAcc", "strDef", "kd15", "kdAbs15", "td15", "tdAcc",
               "tdDef", "sub15", "ctrlShare", "ctrlAgainstShare", "paceRetention")


def compact_fight(fight: dict) -> dict:
    """Serialise one fight with round stats as arrays in COUNTS order."""
    out = {k: v for k, v in fight.items() if k != "rounds" and v not in (None, False)}
    out["outcome"] = fight["outcome"]
    out["rounds"] = [[r["round"], r["seconds"], [r["own"][k] for k in COUNTS], [r["opp"][k] for k in COUNTS]]
                     for r in fight["rounds"]]
    return out


def public_window(window: dict) -> dict:
    """A window without raw totals (rates already carry the information)."""
    return {k: v for k, v in window.items() if k != "totals"}


def _add(total: dict, key: str, value, weight: float) -> None:
    if value is None:
        total.setdefault("_missing", set()).add(key)
    else:
        total[key] = total.get(key, 0) + value * weight


def aggregate(fights: list[dict], weights: list[float] | None = None) -> dict:
    """Totals and rates over a set of fights (each from the fighter's perspective)."""
    weights = weights or [1.0] * len(fights)
    out = {"fights": len(fights), "W": 0, "L": 0, "D": 0, "NC": 0,
           "winsBy": {"ko": 0, "sub": 0, "dec": 0, "dq": 0}, "lossesBy": {"ko": 0, "sub": 0, "dec": 0, "dq": 0},
           "titleFights": 0}
    own, opp, seconds, stat_fights = {}, {}, 0.0, 0
    pace = {"r1": [0.0, 0.0], "later": [0.0, 0.0]}  # [sig attempts, minutes]
    rounds_scored = rounds_won = rounds_10_8 = 0
    unsound = set()  # "target" / "position": a round whose parts do not add up to the strikes landed
    w_fights, w_wins, w_sub_losses = 0.0, {"ko": 0.0, "sub": 0.0}, 0.0
    for fight, w in zip(fights, weights):
        if fight["outcome"] != "NC":
            w_fights += w
            if fight["outcome"] == "W" and fight["method"] in w_wins:
                w_wins[fight["method"]] += w
            if fight["outcome"] == "L" and fight["method"] == "sub":
                w_sub_losses += w
        out[fight["outcome"]] += 1
        out["titleFights"] += 1 if fight["titleFight"] else 0
        if fight["outcome"] == "W" and fight["method"] in out["winsBy"]:
            out["winsBy"][fight["method"]] += 1
        if fight["outcome"] == "L" and fight["method"] in out["lossesBy"]:
            out["lossesBy"][fight["method"]] += 1
        if fight["statsComplete"] and fight["rounds"]:
            stat_fights += 1
            for r in fight["rounds"]:
                for name, parts in (("target", ("head", "body", "leg")), ("position", ("distance", "clinch", "ground"))):
                    landed_parts = [r["own"].get(k + "Landed") for k in parts]
                    total = r["own"].get("sigLanded")
                    if (None in landed_parts and total is not None) or total is None or \
                            (None not in landed_parts and sum(landed_parts) != total):
                        unsound.add(name)
                seconds += r["seconds"] * w
                for key in COUNTS:
                    _add(own, key, r["own"][key], w)
                    _add(opp, key, r["opp"][key], w)
                bucket = pace["r1"] if r["round"] == 1 else pace["later"]
                if r["own"]["sigAttempted"] is not None:
                    bucket[0] += r["own"]["sigAttempted"]
                    bucket[1] += r["seconds"] / 60
        for judge in (fight["scorecards"] or {}).get("judges", []):
            for _, mine, theirs in judge["rounds"]:
                rounds_scored += 1
                rounds_won += 1 if mine > theirs else 0
                rounds_10_8 += 1 if mine - theirs >= 2 else 0
    decided = out["W"] + out["L"]
    finishes = out["winsBy"]["ko"] + out["winsBy"]["sub"]
    out["statFights"] = stat_fights
    out["cageSeconds"] = round(seconds, 1)
    out["finishRate"] = round(finishes / out["W"], 4) if out["W"] else None
    out["winRate"] = round(out["W"] / decided, 4) if decided else None
    out["finishedLosses"] = out["lossesBy"]["ko"] + out["lossesBy"]["sub"]
    # Recency-weighted finish shares (equal to plain shares when unweighted).
    out["koWinShare"] = round(w_wins["ko"] / w_fights, 4) if w_fights else None
    out["subWinShare"] = round(w_wins["sub"] / w_fights, 4) if w_fights else None
    out["subLossShare"] = round(w_sub_losses / w_fights, 4) if w_fights else None
    out["effectiveFights"] = round(sum(w for f, w in zip(fights, weights) if f["statsComplete"] and f["rounds"]), 3)

    def known(side, key):
        return key not in side.get("_missing", set()) and key in side

    def per(side, key, scale):
        return round(side[key] * scale / seconds, 3) if seconds and known(side, key) else None

    def ratio(a_side, a_key, b_side, b_key, invert=False, minimum=10):
        if not (known(a_side, a_key) and known(b_side, b_key)) or b_side[b_key] < minimum:
            return None
        value = a_side[a_key] / b_side[b_key]
        return round(1 - value if invert else value, 3)

    rates = {}
    if seconds:
        minutes = seconds / 60
        rates = {
            "slpm": per(own, "sigLanded", 60), "sapm": per(opp, "sigLanded", 60),
            "sigAttPm": per(own, "sigAttempted", 60),
            "strAcc": ratio(own, "sigLanded", own, "sigAttempted"),
            "strDef": ratio(opp, "sigLanded", opp, "sigAttempted", invert=True),
            "totalPm": per(own, "totalLanded", 60),
            "kd15": per(own, "knockdowns", 900), "kdAbs15": per(opp, "knockdowns", 900),
            "td15": per(own, "takedowns", 900), "tdAtt15": per(own, "takedownAttempts", 900),
            "tdAcc": ratio(own, "takedowns", own, "takedownAttempts", minimum=3),
            "tdDef": ratio(opp, "takedowns", opp, "takedownAttempts", invert=True, minimum=3),
            "sub15": per(own, "subAttempts", 900), "subAbs15": per(opp, "subAttempts", 900),
            "rev15": per(own, "reversals", 900),
            "ctrlShare": round(own["controlSec"] / seconds, 3) if known(own, "controlSec") else None,
            "ctrlAgainstShare": round(opp["controlSec"] / seconds, 3) if known(opp, "controlSec") else None,
            "diffPm": (round((own["sigLanded"] - opp["sigLanded"]) / minutes, 3)
                       if known(own, "sigLanded") and known(opp, "sigLanded") else None),
        }
        landed = [own.get(k + "Landed") if known(own, k + "Landed") else None for k in ("head", "body", "leg")]
        # Head, body and legs (and distance, clinch and ground) must add up to the strikes landed in every round
        # of the window. Some archived rounds do not, so their shares would be false: leave them out, never repair.
        if None not in landed and sum(landed) and "target" not in unsound:
            rates["target"] = {k: round(v / sum(landed), 3) for k, v in zip(("head", "body", "leg"), landed)}
        spots = [own.get(k + "Landed") if known(own, k + "Landed") else None for k in ("distance", "clinch", "ground")]
        if None not in spots and sum(spots) and "position" not in unsound:
            rates["position"] = {k: round(v / sum(spots), 3) for k, v in zip(("distance", "clinch", "ground"), spots)}
        r1, later = pace["r1"], pace["later"]
        if r1[1] >= 10 and later[1] >= 10 and r1[0]:
            # Output in later rounds relative to round one: 1.0 holds pace, <1 fades.
            rates["paceRetention"] = round((later[0] / later[1]) / (r1[0] / r1[1]), 3)
    out["rates"] = rates
    out["judging"] = ({"roundsScored": rounds_scored, "roundsWon": rounds_won,
                       "roundWinRate": round(rounds_won / rounds_scored, 4), "rounds10_8": rounds_10_8}
                      if rounds_scored else None)
    out["totals"] = {"own": {k: round(v, 2) for k, v in own.items() if k != "_missing"},
                     "opp": {k: round(v, 2) for k, v in opp.items() if k != "_missing"}}
    return out


def windows_for(history: list[dict], as_of: dt.date) -> dict:
    """history is newest-first, UFC only, from the fighter's perspective."""
    def within(months):
        cutoff = as_of - dt.timedelta(days=int(months * 30.44))
        return [f for f in history if (parse_date(f["date"]) or as_of) >= cutoff]
    weights = []
    for f in history:
        age = (as_of - (parse_date(f["date"]) or as_of)).days
        weights.append(round(math.pow(0.5, max(age, 0) / HALF_LIFE_DAYS), 6))
    return {
        "last5": aggregate(history[:5]),
        "last10": aggregate(history[:10]),   # R3 period view; a no-contest holds its chronological slot
        "l12": aggregate(within(12)),
        "l36": aggregate(within(36)),
        "career": aggregate(history),
        "weighted": aggregate(history, weights),
    }


def official_divisions(path: Path | None = None) -> dict[str, dict]:
    """fighter slug -> {division, label, rank, champion} from data/ufc-divisions.json.

    A division is *dormant* when the snapshot holds no champion and no ranked fighters for it: the UFC
    keeps the roster page but runs no rankings there (women's featherweight, 2026-11 snapshot). Its
    roster is then a historical list, not where those fighters compete, so:
      * a fighter whose primary division is dormant is moved to another of their official divisions
        that is live (they are unranked in a dormant division by definition, so no rank is lost), and
      * with no live official division they are marked `dormant` and the caller falls back to the
        division of their latest labelled bout.
    If nothing parses as live the snapshot is trusted as it stands, so a parsing change cannot empty
    every division."""
    path = path or DATA / "ufc-divisions.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    fighters = payload.get("fighters") or {}
    divisions = payload.get("divisions") or {}
    live = {slug for slug, d in divisions.items()
            if isinstance(d, dict) and (d.get("champion") or d.get("ranked"))}
    if not live:
        return fighters
    labels = {slug: d.get("label") for slug, d in divisions.items() if isinstance(d, dict)}
    out = {}
    for slug, entry in fighters.items():
        if not isinstance(entry, dict):
            continue
        primary = entry.get("division")
        if not primary or primary in live:
            out[slug] = entry
            continue
        instead = next((d for d in (entry.get("divisions") or []) if d in live), None)
        out[slug] = ({**entry, "division": instead, "label": labels.get(instead) or entry.get("label"),
                      "rank": None, "champion": False, "dormantDivision": primary}
                     if instead else {**entry, "dormant": True})
    return out


def weight_class_divisions(path: Path | None = None) -> dict[str, dict]:
    """fighter slug -> {division, ...} from data/ufc-bout-weight-classes.json (latest labelled bout)."""
    path = path or DATA / "ufc-bout-weight-classes.json"
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("fighters") or {}
    except (OSError, ValueError):
        return {}


def division_slug(label: str | None) -> str | None:
    """'Women's Strawweight' -> 'womens-strawweight', matching the official division slugs.
    Moved to scripts/ufc_snapshot_scores.py (22 Nov) so the card scores build reads the same slugging; this name
    stays as a thin alias so nothing else in this file has to change."""
    return sc.division_slug(label)


def resolve_division(slug: str, name: str, official: dict, weight: dict, reviewed: dict) -> dict:
    """Division for profiles, ratings and leaderboards, most authoritative first:
    1. the official UFC division roster (data/ufc-divisions.json), unless that division is dormant,
    2. the division of the fighter's latest labelled UFC bout (free UFCStats export),
    3. a reviewed profile's division (label only).
    One resolved division per fighter is the single source of truth: the card attribute scores read it
    back from the files written here, so no second rule can disagree with this one.
    Nothing is guessed: catch weights and unknown wording are never divisions upstream."""
    listed = official.get(slug) or {}
    if listed.get("division") and not listed.get("dormant"):
        return {"label": listed.get("label"), "slug": listed["division"], "source": "official-roster"}
    latest = (weight.get(slug) or {}).get("division")
    if latest:
        return {"label": latest, "slug": division_slug(latest), "source": "latest-bout"}
    if listed.get("division"):   # dormant, and no labelled bout to fall back to
        return {"label": listed.get("label"), "slug": listed["division"], "source": "official-roster"}
    label = reviewed.get(norm(name))
    return {"label": label, "slug": division_slug(label) if label else None, "source": "reviewed" if label else None}


def known_divisions() -> dict[str, str]:
    """normalised name -> division label from reviewed profiles and the V3 snapshot (fallback)."""
    out = {}
    for path in sorted(DATA.glob("ufc-*-profiles.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        fighters = payload.get("fighters") or {}
        for key, f in (fighters.items() if isinstance(fighters, dict) else enumerate(fighters)):
            if isinstance(f, dict) and f.get("division") and f.get("name"):
                out[norm(f["name"])] = f["division"]
    try:
        for f in load("ufc-fighter-v3.json").get("fighters", {}).values():
            if f.get("division") and f.get("name"):
                out.setdefault(norm(f["name"]), f["division"])
    except (OSError, ValueError):
        pass
    return out


REPAIRS = DATA / "ufc-round-breakdown-repairs.json"
REPAIR_FIELDS = ("headLanded", "headAttempted", "bodyLanded", "bodyAttempted", "legLanded", "legAttempted",
                 "distanceLanded", "distanceAttempted", "clinchLanded", "clinchAttempted",
                 "groundLanded", "groundAttempted")


def load_repairs(path: Path | None = None) -> dict:
    """slug -> boutId -> round -> the twelve breakdown figures (see scripts/build-ufc-round-breakdown-repairs.py)."""
    try:
        return json.loads((path or REPAIRS).read_text(encoding="utf-8")).get("repairs") or {}
    except (OSError, ValueError):
        return {}


def apply_breakdown_repairs(fights: list, repairs: dict) -> int:
    """Replace a round's head/body/leg and distance/clinch/ground figures with the saved UFCStats ones, for the fighter
    they were saved for. The repair file only holds rounds whose archived parts did not add up and whose strikes
    landed and attempted agree with UFCStats, so nothing else in the round is touched. Returns rounds repaired."""
    done = 0
    for fight in fights:
        for corner in ("a", "b"):
            saved = (repairs.get(fight[corner]["slug"] or "") or {}).get(str(fight["boutId"]))
            if not saved:
                continue
            for r in fight["rounds"]:
                vals = saved.get(str(r["round"]))
                if vals and len(vals) == len(REPAIR_FIELDS):
                    r[corner] = {**r[corner], **dict(zip(REPAIR_FIELDS, vals))}
                    done += 1
    return done


CERTIFIED_CAREERS = DATA / "ufc-v4-certified-careers.json"
REGISTER = DATA / "ufc-independent-full-career-verification.json"


def certified_no_contests(fights: list, skipped: dict) -> list:
    """Official no-contests from the independent career register that the archive could not carry.

    The archive/collector path drops a bout with no recorded result (skipped["noResult"]), but a certified career
    (Stage 3) lists these as official no-contests with a UFCStats fight link. For FIGHTERS IN THE CERTIFIED LANE ONLY,
    a register no-contest that is not already among the fights (same opponent, date within a day) is added as a
    result-only NC: no rounds, no statistics, no winner, never rated. Nothing is estimated. Both fighters of a pair
    get the same record when both are certified. Returns the new fights.
    """
    try:
        certified = set(json.loads(CERTIFIED_CAREERS.read_text(encoding="utf-8")).get("certified") or {})
        register = json.loads(REGISTER.read_text(encoding="utf-8")).get("fighters") or {}
    except (OSError, ValueError):
        return []
    by_name = {norm(e.get("fighterName")): slug for slug, e in register.items() if slug in certified}

    def have(slug_name: str, opponent: str, day: dt.date) -> bool:
        for f in fights:
            if f["method"] != "nc":
                continue
            names = {norm(f["a"]["name"]): f["b"]["name"], norm(f["b"]["name"]): f["a"]["name"]}
            d = parse_date(f["date"])
            if names.get(norm(slug_name)) is not None and norm(names[norm(slug_name)]) == norm(opponent) \
                    and d and abs((d - day).days) <= 1:
                return True
        return False

    out, seen = [], set()
    for slug in sorted(certified):
        entry = register.get(slug) or {}
        for bout in entry.get("bouts") or []:
            if bout.get("result") != "no_contest" or not bout.get("date"):
                continue
            day = parse_date(bout["date"])
            if day is None or have(entry["fighterName"], bout["opponent"], day):
                continue
            # A UFCStats fight link where the register has one; otherwise (a gap bout certified from the fighter's
            # official UFC.com page) a key from the date and the two names, the same for both fighters.
            fid = (str(bout["fightUrl"]).rstrip("/").rsplit("/", 1)[-1] if bout.get("fightUrl") else
                   bout["date"] + "-" + "-".join(sorted((norm(entry["fighterName"]), norm(bout["opponent"])))))
            if fid in seen:
                continue
            seen.add(fid)
            other = by_name.get(norm(bout["opponent"]))
            out.append({
                "boutId": "ufcstats-" + fid, "date": bout["date"], "event": None, "titleFight": False, "mainEvent": False,
                "a": {"slug": slug, "name": entry["fighterName"], "id": None},
                "b": {"slug": other, "name": (register.get(other) or {}).get("fighterName") or bout["opponent"], "id": None},
                "winner": None, "method": "nc", "methodDetail": None, "endRound": None, "endTime": None, "seconds": None,
                "rounds": [], "statsComplete": False, "scorecards": None, "resultSource": "certified-register",
            })
    skipped["certifiedNoContest"] = len(out)
    return out



def results_bouts(per_fighter: dict) -> list[dict]:
    """Every archived UFC bout once, from one corner, for the results rating. Uses all fighters, including those
    who have left the UFC, so a win over a since-retired fighter still counts."""
    out, seen = [], set()
    for slug, entry in per_fighter.items():
        for f in entry["history"]:
            if f["boutId"] in seen or not f.get("opponentSlug") or not f.get("date"):
                continue
            seen.add(f["boutId"])
            out.append({"boutId": f["boutId"], "date": f["date"], "a": slug, "b": f["opponentSlug"],
                        "outcome": f["outcome"], "method": f["method"], "methodDetail": f.get("methodDetail")})
    return out


def build(as_of: dt.date, out_dir: Path, parity_out: Path | None = None, repairs: bool = True,
          before: dt.date | None = None) -> dict:
    archive = load("ufc-research-archive.json")["fights"]
    bouts = load("ufcalendar-rich-progress.json")["bouts"]
    judging = load("ufcalendar-judging-research.json").get("decisions", {})
    divisions = known_divisions()
    official = official_divisions()
    weight = weight_class_divisions()

    showcases = attested_showcase_ids()
    fights, skipped = [], {"noResult": 0, "unaligned": 0, "unresolved": 0, "feederSeries": 0}
    for record in archive.values():
        if str(record.get("promotion", "")).upper() != "UFC":
            continue
        bout = bouts.get(str((record.get("sources") or {}).get("ufcalendar", {}).get("id")))
        if not bout or bout.get("org") != "ufc":
            skipped["noResult"] += 1
            continue
        if out_of_scope(bout, showcases):
            skipped["feederSeries"] += 1
            continue
        fight = build_fight(record, bout, judging.get(str(bout["id"])))
        if fight is None:
            skipped["unaligned"] += 1
            continue
        fights.append(fight)
    collected_to = max((d for d in (parse_date(f["date"]) for f in fights) if d), default=None)
    fights += results_only_fights(results_rows(), bouts, archive, collected_to, skipped, showcases)
    fights += certified_no_contests(fights, skipped)
    skipped["breakdownRoundsRepaired"] = apply_breakdown_repairs(fights, load_repairs()) if repairs else 0
    apply_display_names(fights)
    if before is not None:   # research only (R4 calibration): the stats as they stood on this day, fights from it on left out
        fights = [f for f in fights if (parse_date(f["date"]) or before) < before]

    per_fighter: dict[str, dict] = {}
    for fight in fights:
        for corner in ("a", "b"):
            slug = fight[corner]["slug"]
            if not slug:
                continue
            entry = per_fighter.setdefault(slug, {"name": fight[corner]["name"], "history": []})
            entry["history"].append(side_view(fight, corner))

    active_cutoff = as_of - dt.timedelta(days=int(ACTIVE_MONTHS * 30.44))
    out_dir.mkdir(parents=True, exist_ok=True)
    fighter_dir = out_dir / "fighters"
    fighter_dir.mkdir(exist_ok=True)
    for old in fighter_dir.glob("*.json"):
        old.unlink()

    # Pass 1: windows for every active fighter. Pass 2: rate the whole roster.
    computed = {}
    for slug, entry in sorted(per_fighter.items()):
        history = sorted(entry["history"], key=lambda f: (f["date"] or "", f["boutId"]), reverse=True)
        last = parse_date(history[0]["date"]) if history else None
        if not last or last < active_cutoff:
            continue
        listed = official.get(slug) or {}
        division = resolve_division(slug, entry["name"], official, weight, divisions)
        computed[slug] = {"entry": entry, "history": history, "windows": windows_for(history, as_of),
                          "listed": listed, "division": division["label"],
                          "divisionSlug": division["slug"], "divisionSource": division["source"]}
    ratings = ufc_ratings.rate_roster({slug: {"window": c["windows"]["weighted"], "history": c["history"],
                                              "divisionSlug": c["divisionSlug"]}
                                       for slug, c in computed.items()},
                                      results_bouts(per_fighter), as_of.isoformat())

    if parity_out:  # inputs + Python raw composites for tests/ufc-ratings-parity.cjs
        rows = []
        for slug, c in computed.items():
            w = c["windows"]["weighted"]
            if w.get("statFights", 0) >= ufc_ratings.MIN_STAT_FIGHTS and w.get("rates"):
                rows.append({"slug": slug, "statFights": w["statFights"], "rates": w["rates"],
                             "window": {"koWinShare": w.get("koWinShare"), "subWinShare": w.get("subWinShare"),
                                        "subLossShare": w.get("subLossShare")},
                             "raw": {k: ufc_ratings.raw_skill(w["rates"], w, k) for k in ufc_ratings.SKILLS}})
        parity_out.write_text(json.dumps(rows), encoding="utf-8")

    index_rows = {}
    for slug, c in computed.items():
        entry, history, windows, listed, division = c["entry"], c["history"], c["windows"], c["listed"], c["division"]
        rating = ratings.get(slug)
        profile = {"schema": SCHEMA, "asOf": as_of.isoformat(), "slug": slug, "name": entry["name"],
                   "division": division, "divisionSlug": c["divisionSlug"], "divisionSource": c["divisionSource"],
                   "officialRank": listed.get("rank"), "champion": bool(listed.get("champion")),
                   "lastFight": history[0]["date"], "roundFields": list(COUNTS),
                   "ratings": rating,
                   "windows": {k: public_window(v) for k, v in windows.items()},
                   "fights": [compact_fight(f) for f in history]}
        (fighter_dir / f"{slug}.json").write_text(json.dumps(profile, separators=(",", ":")), encoding="utf-8")
        index_rows[slug] = {
            "name": entry["name"], "division": division, "divisionSlug": c["divisionSlug"],
            "officialRank": listed.get("rank"), "champion": bool(listed.get("champion")),
            "lastFight": history[0]["date"],
            "ufc": [windows["career"]["W"], windows["career"]["L"], windows["career"]["D"], windows["career"]["NC"]],
            "fights": {k: windows[k]["fights"] for k in WINDOWS if k != "weighted"},
            "statFights": {k: windows[k]["statFights"] for k in WINDOWS if k != "weighted"},
            "cageSeconds": {k: windows[k]["cageSeconds"] for k in WINDOWS if k != "weighted"},
            # Arrays in INDEX_RATES order (see "rateFields"); null = not measured.
            "rates": {k: [windows[k]["rates"].get(m) for m in INDEX_RATES] for k in WINDOWS},
            "finishRate": windows["career"]["finishRate"],
            "roundWinRate": (windows["career"]["judging"] or {}).get("roundWinRate"),
            # [overall, striking, grappling, wrestling, defence, form]: overall is the BEFN rating (1500 = median
            # established fighter), the four skills are roster percentiles, form is out of 100; then the same four
            # skills as division percentiles.
            "rating": None if not rating else [None] * 5 + [rating["form"]["score"]] if rating.get("provisional") else
                      [rating["overall"]] + [rating["skills"][k]["roster"] for k in ufc_ratings.SKILLS] + [rating["form"]["score"]],
            "divisionRating": None if not rating else [None] * 4 if rating.get("provisional") else
                              [rating["skills"][k]["division"] for k in ufc_ratings.SKILLS],
        }

    index = {
        "schema": SCHEMA, "asOf": as_of.isoformat(),
        "windows": {"last5": "Last 5 UFC fights", "l12": "Last 12 months", "l36": "Last 36 months",
                    "career": "UFC career", "weighted": "Career, recent fights weighted (18-month half-life)"},
        "source": {"fights": len(fights), "fightsWithRoundStats": sum(1 for f in fights if f["statsComplete"]),
                   "fightsWithScorecards": sum(1 for f in fights if f["scorecards"]), "skipped": skipped},
        "activeMonths": ACTIVE_MONTHS, "rateFields": list(INDEX_RATES),
        "ratingFields": ["overall", *ufc_ratings.SKILLS, "form"],
        "ratingRules": {"window": "weighted", "minStatFights": ufc_ratings.MIN_STAT_FIGHTS,
                        "minDivisionPeers": ufc_ratings.MIN_DIVISION_PEERS, "scale": "percentile",
                        "overallScale": "rating", "overallCentre": ufc_ratings.HEADLINE_CENTRE,
                        "model": ufc_ratings.MODEL},
        "divisionCoverage": {"withDivision": sum(1 for r in index_rows.values() if r["divisionSlug"]),
                             "officialRoster": sum(1 for c in computed.values() if c["divisionSource"] == "official-roster"),
                             "latestBout": sum(1 for c in computed.values() if c["divisionSource"] == "latest-bout"),
                             "reviewed": sum(1 for c in computed.values() if c["divisionSource"] == "reviewed")},
        "fighters": index_rows,
    }
    (out_dir / "index.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
    # Small name -> slug map so a profile can load its one fighter file.
    names = {}
    for slug, row in index_rows.items():
        names.setdefault(norm(row["name"]), slug)
    rated = sum(1 for row in index_rows.values() if row["rating"] and any(v is not None for v in row["rating"][1:5]))
    (out_dir / "names.json").write_text(json.dumps({"schema": SCHEMA, "asOf": as_of.isoformat(), "rated": rated,
                                                    "names": names},
                                                   separators=(",", ":"), sort_keys=True), encoding="utf-8")
    (out_dir / "divisions.json").write_text(json.dumps(division_averages(index_rows, as_of), separators=(",", ":")),
                                            encoding="utf-8")
    (out_dir / "leaderboards.json").write_text(json.dumps(build_leaderboards(computed, ratings, as_of),
                                                          separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    return index


# Leaderboards: one row per qualifying fighter per window, values in BOARD_STATS order.
BOARD_MIN_FIGHTS = 3          # complete-stat UFC fights in the window
BOARD_MIN_SECONDS = 15 * 60   # and at least 15 minutes of cage time, so a few quick finishes cannot top a rate board
BOARD_STATS = (
    # id, label, group, unit, lower is better, source
    ("slpm", "Significant strikes landed per minute", "Striking", "rate", False, "rate"),
    ("diffPm", "Strike differential per minute", "Striking", "signed", False, "rate"),
    ("strAcc", "Significant strike accuracy", "Striking", "pct", False, "rate"),
    ("kd15", "Knockdowns per 15 minutes", "Striking", "rate", False, "rate"),
    ("td15", "Takedowns per 15 minutes", "Grappling", "rate", False, "rate"),
    ("tdAcc", "Takedown accuracy", "Grappling", "pct", False, "rate"),
    ("sub15", "Submission attempts per 15 minutes", "Grappling", "rate", False, "rate"),
    ("ctrlShare", "Control time (share of fight time)", "Grappling", "pct", False, "rate"),
    ("sapm", "Significant strikes absorbed per minute", "Defence", "rate", True, "rate"),
    ("strDef", "Significant strike defence", "Defence", "pct", False, "rate"),
    ("tdDef", "Takedown defence", "Defence", "pct", False, "rate"),
    ("kdAbs15", "Knockdowns absorbed per 15 minutes", "Defence", "rate", True, "rate"),
    ("ctrlAgainstShare", "Time controlled by opponents", "Defence", "pct", True, "rate"),
    ("finishRate", "Wins by KO/TKO or submission", "Finishing", "pct", False, "window"),
    ("roundWinRate", "Rounds won on the judges' cards", "Finishing", "pct", False, "judging"),
    ("paceRetention", "Output after round 1 vs round 1", "Pace", "pct", False, "rate"),
)
BOARD_WINDOWS = ("last5", "l12", "l36", "career")


def board_value(window: dict, source: str, stat: str):
    if source == "rate":
        value = (window.get("rates") or {}).get(stat)
    elif source == "window":
        value = window.get(stat) if (window.get("W") or 0) >= 3 else None   # finish share needs 3+ wins
    else:
        judging = window.get("judging") or {}
        value = judging.get(stat) if (judging.get("roundsScored") or 0) >= 9 else None  # 3+ judged fights' worth
    return round(value, 3) if isinstance(value, (int, float)) else None


def build_leaderboards(computed: dict, ratings: dict, as_of: dt.date) -> dict:
    """Compact leaderboard file: fighters once, then per-window rows of values (null = not measured)."""
    slugs = sorted(computed)
    position = {slug: i for i, slug in enumerate(slugs)}
    fighters = []
    for slug in slugs:
        c = computed[slug]
        fighters.append([slug, c["entry"]["name"], c["divisionSlug"], c["listed"].get("rank"),
                         bool(c["listed"].get("champion"))])
    windows = {}
    for key in BOARD_WINDOWS:
        rows = []
        for slug in slugs:
            w = computed[slug]["windows"][key]
            if (w.get("statFights") or 0) < BOARD_MIN_FIGHTS or (w.get("cageSeconds") or 0) < BOARD_MIN_SECONDS:
                continue
            values = [board_value(w, source, stat) for stat, *_rest, source in BOARD_STATS]
            if any(v is not None for v in values):
                rows.append([position[slug], w["statFights"], *values])
        windows[key] = rows
    rated = []
    for slug in slugs:
        r = ratings.get(slug)
        if r and r.get("eligible"):
            rated.append([position[slug], r["overall"], *[r["skills"][k]["roster"] for k in ufc_ratings.SKILLS],
                          r["form"]["score"], (r.get("results") or {}).get("percentile"), r["sample"]["statFights"]])
    labels = {}
    for c in computed.values():
        if c["divisionSlug"] and c["division"]:
            labels[c["divisionSlug"]] = c["division"]
    return {
        "schema": SCHEMA, "asOf": as_of.isoformat(),
        "minFights": BOARD_MIN_FIGHTS, "minCageSeconds": BOARD_MIN_SECONDS,
        "windows": {"last5": "Last 5 fights", "l12": "Last 12 months", "l36": "Last 36 months", "career": "UFC career"},
        "stats": [{"id": i, "label": l, "group": g, "unit": u, "lowerIsBetter": lb} for i, l, g, u, lb, _ in BOARD_STATS],
        "divisions": dict(sorted(labels.items())),
        "fighterFields": ["slug", "name", "divisionSlug", "officialRank", "champion"],
        "fighters": fighters,
        "rowFields": ["fighter", "statFights", *[b[0] for b in BOARD_STATS]],
        "rows": windows,
        "ratingFields": ["fighter", "overall", *ufc_ratings.SKILLS, "form", "results", "statFights"],
        "ratings": rated,
    }


DIVISION_WINDOW = "l36"
DIVISION_MIN_FIGHTS = 3   # a fighter counts toward the average with 3+ complete-stat fights in the window
DIVISION_MIN_PEERS = 8    # a division average needs at least this many such fighters


def division_averages(index_rows: dict, as_of: dt.date) -> dict:
    """Mean leaderboard rates per official division (last 36 months), for profile comparisons."""
    groups: dict[str, list] = {}
    labels = {}
    for row in index_rows.values():
        slug = row.get("divisionSlug")
        if not slug or (row["statFights"].get(DIVISION_WINDOW) or 0) < DIVISION_MIN_FIGHTS:
            continue
        groups.setdefault(slug, []).append(row["rates"][DIVISION_WINDOW])
        labels[slug] = row["division"]
    out = {}
    for slug, rows in sorted(groups.items()):
        if len(rows) < DIVISION_MIN_PEERS:
            continue
        means = []
        for i, _ in enumerate(INDEX_RATES):
            values = [r[i] for r in rows if r[i] is not None]
            means.append(round(sum(values) / len(values), 3) if len(values) >= DIVISION_MIN_PEERS else None)
        out[slug] = {"label": labels[slug], "fighters": len(rows), "rates": means}
    return {"schema": SCHEMA, "asOf": as_of.isoformat(), "window": DIVISION_WINDOW,
            "minFights": DIVISION_MIN_FIGHTS, "rateFields": list(INDEX_RATES), "divisions": out}


def latest_event_date(today: dt.date | None = None) -> dt.date:
    """Reference date = the latest completed UFC event in the saved results.

    Anchoring the time windows to the data (not the calendar) keeps the output
    identical until new fights arrive, so the hourly/daily jobs do not rewrite
    every fighter file just because a day passed.
    """
    today = today or dt.date.today()
    dates = [parse_date(b.get("eventDate")) for b in load("ufcalendar-rich-progress.json")["bouts"].values()
             if b.get("org") == "ufc" and b.get("status") == "completed"]
    dates += [parse_date(r.get("date")) for r in results_rows()  # the free importer keeps filling this one
              if r.get("status") == "completed" and r.get("sport") == "MMA"
              and str(r.get("eventId", "")).startswith("ufc")]
    dates = [d for d in dates if d and d <= today]
    return max(dates) if dates else today


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--as-of", help="YYYY-MM-DD; default: latest completed UFC event in the data")
    parser.add_argument("--out", default=str(DATA / "ufc-stats"))
    parser.add_argument("--parity-out", help="also write a JS/Python ratings parity fixture here")
    args = parser.parse_args()
    as_of = dt.date.fromisoformat(args.as_of) if args.as_of else latest_event_date()
    index = build(as_of, Path(args.out), Path(args.parity_out) if args.parity_out else None)
    s = index["source"]
    print(f"as of {index['asOf']} · {len(index['fighters'])} active fighters · {s['fights']} fights "
          f"({s['fightsWithRoundStats']} with complete round stats, {s['fightsWithScorecards']} with scorecards) "
          f"· skipped {s['skipped']}")


if __name__ == "__main__":
    main()
