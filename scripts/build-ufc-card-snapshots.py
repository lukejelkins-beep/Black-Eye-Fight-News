#!/usr/bin/env python3
"""Build data/ufc-card-snapshots.json: last-five-fight stat tiles for every fighter on an announced UFC card.

Phase 3, step 1 (docs/design/PHASE-3.md and SNAPSHOT-METHOD.md). Pure calculation over files already in data/;
never calls a provider and writes nothing else.

Inputs
  data/upcoming-cards.json     announced cards (UFC MMA events that are not finished)
  data/ufc-stats/names.json    normalised name -> fighter slug
  data/ufc-stats/fighters/*.json  per-fighter windows (the `last5` window is used)

Rules
  * Tiles come straight from the saved last-five window (rates need round stats; finish shares come from results). Zero is evidence; missing stays null. Nothing is estimated.
  * coverage: "full" = 3 or more of the five fights have complete round stats (the engine's minimum),
    "limited" = 1 or 2, "none" = no stats (or fighter not in the data). Every fighter on a card gets an entry.
  * No scores, percentiles or ratings here: those are step 3 and stay switched off until the owner approves them.
  * Output is deterministic (sorted, no timestamps) so an unchanged input is a no-op in the hourly workflow.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import unicodedata
from pathlib import Path

from ufc_card_aliases import with_aliases

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "ufc-card-snapshots.json"
MIN_STAT_FIGHTS = 3                      # same minimum as ufc_ratings.MIN_STAT_FIGHTS
UFC_PROMOTION = re.compile(r"\bufc\b|ultimate fighting championship")
# Same fighter key the card page uses (normalizeFighter in assets/upcoming-cards.js).
RATE_TILES = ("slpm", "strAcc", "sapm", "strDef", "td15", "tdAcc", "tdDef", "ctrlShare", "sub15", "kd15")
# Snapshot name -> name in the saved window. The saved names are easy to misread: koWinShare is KO/TKO wins per
# fight (not per win) and finishRate is finishes per win, so the snapshot says what they are.
WINDOW_TILES = {"koWinsPerFight": "koWinShare", "subWinsPerFight": "subWinShare", "finishShareOfWins": "finishRate"}


def fold(text) -> str:
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", text)


def num(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def coverage_of(stat_fights: int) -> str:
    return "full" if stat_fights >= MIN_STAT_FIGHTS else "limited" if stat_fights >= 1 else "none"


def fighter_entry(name: str, record: dict | None) -> dict:
    """One fighter's tiles from their saved file (None when we hold nothing)."""
    empty = {"name": name, "slug": None, "division": None, "coverage": "none", "fights": 0, "statFights": 0,
             "record": None, "tiles": {k: None for k in RATE_TILES + tuple(WINDOW_TILES)}}
    window = ((record or {}).get("windows") or {}).get("last5")
    if not isinstance(window, dict):
        return empty
    stat_fights = int(window.get("statFights") or 0)
    rates = window.get("rates") if isinstance(window.get("rates"), dict) else {}
    show = stat_fights >= 1
    tiles = {k: (num(rates.get(k)) if show else None) for k in RATE_TILES}
    # Finish shares come from results, not round stats, so they show whenever the fighter has a recorded fight.
    has_fights = int(window.get("fights") or 0) >= 1
    tiles.update({out: (num(window.get(src)) if has_fights else None) for out, src in WINDOW_TILES.items()})
    return {
        "name": record.get("name") or name, "slug": record.get("slug"), "division": record.get("division"),
        "coverage": coverage_of(stat_fights), "fights": int(window.get("fights") or 0), "statFights": stat_fights,
        "record": {k: int(window.get(k) or 0) for k in ("W", "L", "D", "NC")},
        "tiles": tiles,
    }


def announced_ufc_events(cards: dict, today: dt.date) -> list[dict]:
    """UFC MMA cards that have not finished (kept two days after their date, like the Fights page)."""
    floor = (today - dt.timedelta(days=2)).isoformat()
    events = []
    for e in cards.get("events", []):
        if not isinstance(e, dict) or e.get("sport") != "mma" or not UFC_PROMOTION.search(str(e.get("promotion", "")).lower()):
            continue
        if str(e.get("date", "")) < floor or e.get("status") == "completed":
            continue
        bouts = [b for b in e.get("bouts", []) if isinstance(b, dict) and b.get("status") != "cancelled"
                 and isinstance(b.get("fighters"), list) and len(b["fighters"]) == 2 and all(b["fighters"])]
        if bouts:
            events.append({**e, "bouts": bouts})
    return sorted(events, key=lambda e: (e["date"], e["id"]))


def build(cards: dict, names: dict, load_fighter, today: dt.date, stats_as_of: str | None = None) -> dict:
    """load_fighter(slug) -> the saved fighter dict or None."""
    events, fighters = [], {}
    for e in announced_ufc_events(cards, today):
        out_bouts = []
        for b in e["bouts"]:
            keys = []
            for name in b["fighters"]:
                key = fold(name)
                if key not in fighters:
                    slug = names.get(key)
                    fighters[key] = fighter_entry(str(name), load_fighter(slug) if slug else None)
                keys.append(key)
            out_bouts.append({"id": b.get("id"), "fighters": keys, "division": b.get("division") or None})
        events.append({"id": e["id"], "title": e.get("title"), "date": e["date"], "bouts": out_bouts})
    counts = {c: sum(1 for f in fighters.values() if f["coverage"] == c) for c in ("full", "limited", "none")}
    return {"schema": 1, "window": "last5", "statsAsOf": stats_as_of, "coverage": {"fighters": len(fighters), **counts},
            "events": events, "fighters": dict(sorted(fighters.items()))}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--today", help="YYYY-MM-DD (default: today, UTC)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    today = dt.date.fromisoformat(args.today) if args.today else dt.datetime.now(dt.timezone.utc).date()
    cards = json.loads((DATA / "upcoming-cards.json").read_text())
    index = json.loads((DATA / "ufc-stats" / "names.json").read_text())

    def load(slug):
        path = DATA / "ufc-stats" / "fighters" / f"{slug}.json"
        return json.loads(path.read_text()) if path.exists() else None

    result = build(cards, with_aliases(index.get("names", {})), load, today, index.get("asOf"))
    text = json.dumps(result, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    out = Path(args.out)
    if not out.exists() or out.read_text() != text:
        out.write_text(text)
    c = result["coverage"]
    print(f"{len(result['events'])} UFC cards, {c['fighters']} fighters: {c['full']} full, {c['limited']} limited, {c['none']} none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
