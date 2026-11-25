#!/usr/bin/env python3
"""Build per-fighter bonus records for BEFN profiles (offline: reads saved files only, never calls a provider).

Inputs
  data/ufc-bonus-fights.json     bonus fights from scripts/refresh-ufc-bonuses.py (UFC Stats API, keyed by UFCStats ids)
  data/ufc-stats/fighters/*.json BEFN's fighter files (slug, name, fights with date and opponent)
Output
  data/ufc-bonuses.json          { slug: { fotn, potn, total, bouts:[{date,event,opponent,outcome,kinds}] } }

Crediting rule (owner to confirm): Fight of the Night is credited to BOTH fighters; Performance of the Night (and the pre-2014 Knockout / Submission of the Night) to the
WINNER only. The label set is read from the data: an unknown label, a performance bonus on a fight without a winner
(draw / no contest), or a fight we cannot place on exactly one BEFN fighter file is listed in `unplaced` and credited to
nobody. Nothing is guessed. The UFC Stats API has no UFCStats id on BEFN fighters, so a fighter is placed by the date
(+/- 1 day) and the folded names of both corners, the same name-only join the other UFC scripts use.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SRC = DATA / "ufc-bonus-fights.json"
OUT = DATA / "ufc-bonuses.json"
RATES = json.loads((DATA / "ufc-bonus-rates.json").read_text())

BOTH = {"fight_of_the_night"}  # credited to both corners
WINNER = {"performance_of_the_night", "knockout_of_the_night", "submission_of_the_night"}  # credited to the winner only
KIND = {"fight_of_the_night": "fotn", "performance_of_the_night": "potn",
        "knockout_of_the_night": "kotn", "submission_of_the_night": "sotn"}


def fold(s):
    t = unicodedata.normalize("NFKD", str(s or ""))
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in t if not unicodedata.combining(c)).lower())


def price(day):
    """Estimated dollars for one award on this event date, or None when we have no sourced amount."""
    if day < RATES["unpricedBefore"] or any(e["date"] == day for e in RATES["unpricedEvents"]):
        return None
    amt = None
    for r in RATES["rates"]:
        if day >= r["from"]:
            amt = r["amount"]
    return amt


def main():
    src = json.loads(SRC.read_text())
    # (date, folded own name, folded opponent name) -> slug, from BEFN's own fighter files
    place = defaultdict(set)
    opp_slug = {}  # (fighter slug, date, folded opponent) -> opponent slug, for the opponent's cutout
    names = {}
    for p in sorted((DATA / "ufc-stats" / "fighters").glob("*.json")):
        d = json.loads(p.read_text())
        names[d["slug"]] = d["name"]
        for f in d.get("fights", []):
            place[(f["date"], fold(d["name"]), fold(f["opponent"]))].add(d["slug"])
            if f.get("opponentSlug"):
                opp_slug[(d["slug"], f["date"], fold(f["opponent"]))] = f["opponentSlug"]

    def slug_for(day, own, opp):
        d0 = date.fromisoformat(day)
        hits = set()
        for k in (-1, 0, 1):
            hits |= place.get(((d0 + timedelta(days=k)).isoformat(), fold(own), fold(opp)), set())
        return hits

    out, unplaced, outside = {}, [], 0
    for fight in src["fights"]:
        a, b = fight["fighters"]
        for me, other in ((a, b), (b, a)):
            kinds = []
            for label in fight["bonuses"]:
                if label in BOTH:
                    kinds.append(KIND[label])
                elif label in WINNER:
                    if fight.get("winnerId") and fight["winnerId"] == me["id"]:
                        kinds.append(KIND[label])
                    elif not fight.get("winnerId") and me is a:  # once per fight, not once per corner
                        unplaced.append({"fightId": fight["fightId"], "date": fight["date"], "why": "performance bonus, no winner"})
                else:
                    unplaced.append({"fightId": fight["fightId"], "date": fight["date"], "why": "unknown label " + label})
            if not kinds:
                continue
            slugs = slug_for(fight["date"], me["name"], other["name"])
            if not slugs:
                outside += 1  # not one of BEFN's fighter files (mostly retired fighters): nothing to show
                continue
            if len(slugs) > 1:
                unplaced.append({"fightId": fight["fightId"], "date": fight["date"], "fighter": me["name"],
                                 "why": "ambiguous " + ",".join(sorted(slugs))})
                continue
            s = next(iter(slugs))
            r = out.setdefault(s, {"fotn": 0, "potn": 0, "kotn": 0, "sotn": 0, "total": 0, "estimate": 0, "unpriced": 0, "bouts": []})
            for k in kinds:
                r[k] += 1
                r["total"] += 1
            p = price(fight["date"])
            r["estimate"] += (p or 0) * len(kinds)
            r["unpriced"] += 0 if p else len(kinds)
            r["bouts"].append({"est": p * len(kinds) if p else None, "date": fight["date"], "event": fight["event"], "opponent": other["name"],
                               "outcome": me.get("result"), "kinds": kinds,
                               "opponentSlug": opp_slug.get((s, fight["date"], fold(other["name"])))})
    for r in out.values():
        r["bouts"].sort(key=lambda x: x["date"], reverse=True)
    doc = {"schema": 1, "asOf": src.get("asOf"), "fighters": dict(sorted(out.items())),
           "unplaced": unplaced, "outsideRoster": outside, "currency": RATES["currency"], "rates": [{"from": r["from"], "amount": r["amount"]} for r in RATES["rates"]], "rule": "Fight of the Night: both fighters. Performance of the Night: the winner."}
    OUT.write_text(json.dumps(doc, separators=(",", ":"), sort_keys=True))
    print(f"{len(out)} fighters with bonuses, {sum(r['total'] for r in out.values())} bonuses credited, {len(unplaced)} unplaced, {outside} credits to fighters without a BEFN file")


if __name__ == "__main__":
    main()
