#!/usr/bin/env python3
"""Build BEFN UFC fighter statistics from saved round-by-round evidence.

Pure calculation over files already in data/; never calls a provider.

Inputs
  data/ufc-research-archive.json       per-round stats for each archived UFC fight
  data/ufcalendar-rich-progress.json   official results (winner, method, round, time)
  data/ufcalendar-judging-research.json judges' scorecards for decisions
  data/ufc-fighter-v3.json + data/ufc-*-profiles.json  known divisions

Outputs (data/ufc-stats/)
  index.json            one compact row per active fighter, for leaderboards
  fighters/<slug>.json  full per-fighter file: every archived UFC fight with
                        rounds and scorecards, plus aggregates per window

Rules
  * A fight contributes statistics only if its official result is known and
    every round up to the finishing round was captured with valid numbers.
    Results (wins, methods) still count even when round stats are missing.
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
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SCHEMA = 1
ROUND_SECONDS = 300
ACTIVE_MONTHS = 36
HALF_LIFE_DAYS = 548  # ~18 months: weight of a fight halves every 18 months
WINDOWS = ("last5", "l12", "l36", "career", "weighted")

# Per-round counting fields, in both corners. Attempt fields may be missing
# on older fights; they are then treated as unavailable, never as zero.
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


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text or ""))
    return re.sub(r"[^a-z0-9]", "", text.encode("ascii", "ignore").decode().lower())


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


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
    for fight, w in zip(fights, weights):
        out[fight["outcome"]] += 1
        out["titleFights"] += 1 if fight["titleFight"] else 0
        if fight["outcome"] == "W" and fight["method"] in out["winsBy"]:
            out["winsBy"][fight["method"]] += 1
        if fight["outcome"] == "L" and fight["method"] in out["lossesBy"]:
            out["lossesBy"][fight["method"]] += 1
        if fight["statsComplete"] and fight["rounds"]:
            stat_fights += 1
            for r in fight["rounds"]:
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
            "sub15": per(own, "subAttempts", 900), "rev15": per(own, "reversals", 900),
            "ctrlShare": round(own["controlSec"] / seconds, 3) if known(own, "controlSec") else None,
            "ctrlAgainstShare": round(opp["controlSec"] / seconds, 3) if known(opp, "controlSec") else None,
            "diffPm": (round((own["sigLanded"] - opp["sigLanded"]) / minutes, 3)
                       if known(own, "sigLanded") and known(opp, "sigLanded") else None),
        }
        landed = [own.get(k + "Landed") if known(own, k + "Landed") else None for k in ("head", "body", "leg")]
        if None not in landed and sum(landed):
            rates["target"] = {k: round(v / sum(landed), 3) for k, v in zip(("head", "body", "leg"), landed)}
        spots = [own.get(k + "Landed") if known(own, k + "Landed") else None for k in ("distance", "clinch", "ground")]
        if None not in spots and sum(spots):
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
        "l12": aggregate(within(12)),
        "l36": aggregate(within(36)),
        "career": aggregate(history),
        "weighted": aggregate(history, weights),
    }


def known_divisions() -> dict[str, str]:
    """slug -> division from reviewed profiles and the V3 snapshot (stage 2 extends this)."""
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


def build(as_of: dt.date, out_dir: Path) -> dict:
    archive = load("ufc-research-archive.json")["fights"]
    bouts = load("ufcalendar-rich-progress.json")["bouts"]
    judging = load("ufcalendar-judging-research.json").get("decisions", {})
    divisions = known_divisions()

    fights, skipped = [], {"noResult": 0, "unaligned": 0}
    for record in archive.values():
        if str(record.get("promotion", "")).upper() != "UFC":
            continue
        bout = bouts.get(str((record.get("sources") or {}).get("ufcalendar", {}).get("id")))
        if not bout or bout.get("org") != "ufc":
            skipped["noResult"] += 1
            continue
        fight = build_fight(record, bout, judging.get(str(bout["id"])))
        if fight is None:
            skipped["unaligned"] += 1
            continue
        fights.append(fight)

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

    index_rows = {}
    for slug, entry in sorted(per_fighter.items()):
        history = sorted(entry["history"], key=lambda f: (f["date"] or "", f["boutId"]), reverse=True)
        last = parse_date(history[0]["date"]) if history else None
        if not last or last < active_cutoff:
            continue
        windows = windows_for(history, as_of)
        division = divisions.get(norm(entry["name"]))
        profile = {"schema": SCHEMA, "asOf": as_of.isoformat(), "slug": slug, "name": entry["name"],
                   "division": division, "lastFight": history[0]["date"], "roundFields": list(COUNTS),
                   "windows": {k: public_window(v) for k, v in windows.items()},
                   "fights": [compact_fight(f) for f in history]}
        (fighter_dir / f"{slug}.json").write_text(json.dumps(profile, separators=(",", ":")), encoding="utf-8")
        index_rows[slug] = {
            "name": entry["name"], "division": division, "lastFight": history[0]["date"],
            "ufc": [windows["career"]["W"], windows["career"]["L"], windows["career"]["D"], windows["career"]["NC"]],
            "fights": {k: windows[k]["fights"] for k in WINDOWS if k != "weighted"},
            "statFights": {k: windows[k]["statFights"] for k in WINDOWS if k != "weighted"},
            "cageSeconds": {k: windows[k]["cageSeconds"] for k in WINDOWS if k != "weighted"},
            # Arrays in INDEX_RATES order (see "rateFields"); null = not measured.
            "rates": {k: [windows[k]["rates"].get(m) for m in INDEX_RATES] for k in WINDOWS},
            "finishRate": windows["career"]["finishRate"],
            "roundWinRate": (windows["career"]["judging"] or {}).get("roundWinRate"),
        }

    index = {
        "schema": SCHEMA, "asOf": as_of.isoformat(),
        "windows": {"last5": "Last 5 UFC fights", "l12": "Last 12 months", "l36": "Last 36 months",
                    "career": "UFC career", "weighted": "Career, recent fights weighted (18-month half-life)"},
        "source": {"fights": len(fights), "fightsWithRoundStats": sum(1 for f in fights if f["statsComplete"]),
                   "fightsWithScorecards": sum(1 for f in fights if f["scorecards"]), "skipped": skipped},
        "activeMonths": ACTIVE_MONTHS, "rateFields": list(INDEX_RATES), "fighters": index_rows,
    }
    (out_dir / "index.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
    return index


def latest_event_date(today: dt.date | None = None) -> dt.date:
    """Reference date = the latest completed UFC event in the saved results.

    Anchoring the time windows to the data (not the calendar) keeps the output
    identical until new fights arrive, so the hourly/daily jobs do not rewrite
    every fighter file just because a day passed.
    """
    today = today or dt.date.today()
    dates = [parse_date(b.get("eventDate")) for b in load("ufcalendar-rich-progress.json")["bouts"].values()
             if b.get("org") == "ufc" and b.get("status") == "completed"]
    dates = [d for d in dates if d and d <= today]
    return max(dates) if dates else today


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--as-of", help="YYYY-MM-DD; default: latest completed UFC event in the data")
    parser.add_argument("--out", default=str(DATA / "ufc-stats"))
    args = parser.parse_args()
    as_of = dt.date.fromisoformat(args.as_of) if args.as_of else latest_event_date()
    index = build(as_of, Path(args.out))
    s = index["source"]
    print(f"as of {index['asOf']} · {len(index['fighters'])} active fighters · {s['fights']} fights "
          f"({s['fightsWithRoundStats']} with complete round stats, {s['fightsWithScorecards']} with scorecards) "
          f"· skipped {s['skipped']}")


if __name__ == "__main__":
    main()
