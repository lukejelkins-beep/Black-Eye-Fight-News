#!/usr/bin/env python3
"""Refresh UFC division rosters, official rankings and champions from UFCalendar.

One quota check plus one request per division (13 calls). Writes
data/ufc-divisions.json:

  divisions: {slug: {label, observedOn, rankingDate, champion, ranked[], roster[]}}
  fighters:  {fighterSlug: {division, label, rank, champion, divisions[]}}

Safety
  * Reuses the paid collector's Client, so its monthly spend guard applies.
  * A division whose payload yields no roster and no rankings is NOT
    overwritten; its previous data is kept and the unknown payload shape is
    recorded under "diagnostics" for review. Nothing is guessed.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "ufc-divisions.json"

DIVISIONS = {
    "heavyweight": "Heavyweight", "light-heavyweight": "Light Heavyweight",
    "middleweight": "Middleweight", "welterweight": "Welterweight",
    "lightweight": "Lightweight", "featherweight": "Featherweight",
    "bantamweight": "Bantamweight", "flyweight": "Flyweight",
    "strawweight": "Strawweight",
    "womens-featherweight": "Women's Featherweight", "womens-bantamweight": "Women's Bantamweight",
    "womens-flyweight": "Women's Flyweight", "womens-strawweight": "Women's Strawweight",
}
# Heavier divisions first: a fighter on two rosters is listed where they hold the
# better official position (champion, then best rank), else the heavier roster.
ORDER = list(DIVISIONS)


def _collector():
    spec = importlib.util.spec_from_file_location("befn_collector", ROOT / "scripts/ufcalendar-rich-backfill.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _unpack(payload):
    data = payload.get("data") if isinstance(payload, dict) else None
    return data if isinstance(data, dict) else None


def _fighter(entry, ref):
    """A fighter reference from a roster/ranking entry, nested or flat."""
    if not isinstance(entry, dict):
        return None
    for key in ("fighter", "athlete"):
        if isinstance(entry.get(key), dict):
            return ref(entry[key])
    return ref(entry)


def _shape(obj) -> dict:
    """Keys only (no values) so an unrecognised payload can be diagnosed safely."""
    def first_keys(value):
        return sorted(value[0].keys())[:20] if isinstance(value, list) and value and isinstance(value[0], dict) else None
    rankings = obj.get("rankings") if isinstance(obj, dict) else None
    return {"keys": sorted(obj.keys())[:30] if isinstance(obj, dict) else None,
            "rosterEntryKeys": first_keys(obj.get("roster") if isinstance(obj, dict) else None),
            "rankingKeys": sorted(rankings.keys())[:20] if isinstance(rankings, dict) else None,
            "rankingEntryKeys": first_keys(rankings.get("entries") if isinstance(rankings, dict) else rankings)}


def parse_division(obj, slug: str, ref, observed_on: str) -> dict | None:
    """Parse one division payload; None if it carries no usable fighters."""
    if not isinstance(obj, dict):
        return None
    rankings = obj.get("rankings")
    entries = rankings.get("entries") if isinstance(rankings, dict) else rankings if isinstance(rankings, list) else []
    ranked, champion = [], None
    for entry in entries or []:
        fighter = _fighter(entry, ref)
        if not fighter or not fighter.get("slug"):
            continue
        rank = entry.get("rank") if isinstance(entry, dict) else None
        is_champ = isinstance(entry, dict) and (entry.get("is_champion") is True or rank == 0)
        row = {"rank": 0 if is_champ else rank if isinstance(rank, int) and rank > 0 else None,
               "slug": fighter["slug"], "name": fighter["name"]}
        if is_champ:
            champion = {"slug": fighter["slug"], "name": fighter["name"]}
        ranked.append(row)
    ranked.sort(key=lambda r: (r["rank"] is None, r["rank"] if r["rank"] is not None else 99, r["name"]))
    roster = []
    for entry in obj.get("roster") or []:
        fighter = _fighter(entry, ref)
        if fighter and fighter.get("slug") and fighter["slug"] not in roster:
            roster.append(fighter["slug"])
    for row in ranked:  # ranked fighters belong to the division even if the roster omits them
        if row["slug"] not in roster:
            roster.append(row["slug"])
    if not roster:
        return None
    return {"label": DIVISIONS[slug], "observedOn": observed_on,
            "rankingDate": (rankings or {}).get("snapshot_date") if isinstance(rankings, dict) else None,
            "champion": champion, "ranked": ranked, "roster": sorted(roster)}


def fighter_index(divisions: dict) -> dict:
    """Each fighter's primary division: champion > best rank > heavier roster."""
    out = {}
    for slug in ORDER:
        division = divisions.get(slug)
        if not division:
            continue
        ranks = {r["slug"]: r["rank"] for r in division["ranked"]}
        for fighter in division["roster"]:
            rank = ranks.get(fighter)
            row = out.setdefault(fighter, {"divisions": []})
            row["divisions"].append(slug)
            best = row.get("rank")
            better = "division" not in row or (rank is not None and (best is None or rank < best))
            if better:
                row.update({"division": slug, "label": division["label"], "rank": rank,
                            "champion": rank == 0})
    return dict(sorted(out.items()))


def refresh(client, ref, previous: dict, today: dt.date) -> dict:
    divisions = dict(previous.get("divisions") or {})
    diagnostics, fetched = {}, 0
    for slug in ORDER:
        payload = client.call("/orgs/ufc/divisions/" + slug)
        obj = _unpack(payload)
        parsed = parse_division(obj, slug, ref, today.isoformat())
        if parsed:
            divisions[slug] = parsed
            fetched += 1
        else:
            diagnostics[slug] = {"reason": "no payload" if obj is None else "no roster or rankings parsed",
                                 "shape": _shape(obj)}
    return {"schema": 1, "source": "UFCalendar", "observedOn": today.isoformat(),
            "fetchedDivisions": fetched, "divisions": divisions,
            "fighters": fighter_index(divisions), "diagnostics": diagnostics}


def main() -> int:
    token = os.environ.get("UFCALENDAR_API_KEY", "").strip()
    if not token:
        print("UFCALENDAR_API_KEY is not set; nothing fetched.")
        return 1
    collector = _collector()
    today = dt.date.today()
    state = {}
    client = collector.Client(token, state, today, max_calls=len(DIVISIONS) + 1)
    if not client.bootstrap():
        print("Quota guard stopped the refresh:", state.get("status"))
        return 1
    previous = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    result = refresh(client, collector.ref, previous, today)
    OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{result['fetchedDivisions']}/{len(DIVISIONS)} divisions refreshed · "
          f"{len(result['fighters'])} fighters · diagnostics: {sorted(result['diagnostics'])} · "
          f"calls {client.calls} · errors {client.errors}")
    return 0 if result["fetchedDivisions"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
