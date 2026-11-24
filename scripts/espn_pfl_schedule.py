"""PFL upcoming cards from ESPN's MMA scoreboard (owner choice, 25 Nov 2026: "ESPN only").

The repository already reads ESPN's scoreboard for finished PFL results
(scripts/import-finished-results.py). The same endpoint lists scheduled PFL cards
with every bout:
  https://site.api.espn.com/apis/site/v2/sports/mma/pfl/scoreboard?dates=YYYYMMDD-YYYYMMDD
ESPN carries the main PFL brand cards; PFL MENA and PFL Africa are usually absent,
so those stay manual.

Rules (as for ONE in scripts/one_schedule.py):
  - only scheduled bouts with two named athletes;
  - the main event is the bout named in ESPN's event name ("PFL Lyon: Lapilus vs.
    McKee"); every other bout is "announced", so no other order is claimed;
  - notes never contain "title" or "championship": the page reads those words in a
    bout note as a title fight;
  - a missing weight class is left out, not guessed;
  - existing events (including hand-edited ones) are never changed.
Pure functions, so tests run on a saved response (tests/fixtures/espn/).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
import unicodedata

PROMOTION = "PFL"
SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/mma/pfl/scoreboard?dates={start}-{end}"
FIGHTCENTER = "https://www.espn.com/mma/fightcenter/_/id/{id}/league/pfl"

# Venue-local day from the start instant, for countries PFL visits. Unknown -> UTC day.
COUNTRY_OFFSETS = {
    "France": 1, "United Kingdom": 0, "England": 0, "Ireland": 0, "Belgium": 1, "Germany": 1,
    "Spain": 1, "Italy": 1, "Netherlands": 1, "Rwanda": 2, "South Africa": 2, "Nigeria": 1,
    "Saudi Arabia": 3, "UAE": 4, "United Arab Emirates": 4, "Bahrain": 3,
}


def scoreboard_url(today: datetime, days: int = 120) -> str:
    return SCOREBOARD.format(start=today.strftime("%Y%m%d"), end=(today + timedelta(days=days)).strftime("%Y%m%d"))


def _fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def _surname(name: str) -> str:
    return _fold(name).split()[-1] if name and name.split() else ""


def _instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def build_events(scoreboard: dict, checked_at: str) -> list[dict]:
    out = []
    for e in scoreboard.get("events") or []:
        comps = e.get("competitions") or []
        if not comps or (e.get("status") or {}).get("type", {}).get("completed"):
            continue
        venue = comps[0].get("venue") or {}
        city, country = (venue.get("address") or {}).get("city"), (venue.get("address") or {}).get("country")
        if not (venue.get("fullName") and city and e.get("date") and e.get("name")):
            continue
        start = _instant(e["date"])
        day = (start + timedelta(hours=COUNTRY_OFFSETS.get(country, 0))).date().isoformat()
        title_pair = re.search(r":\s*(.+?)\s+vs\.?\s+(.+)$", e["name"])
        main_surnames = {_surname(title_pair.group(1)), _surname(title_pair.group(2))} if title_pair else set()
        bouts, main = [], None
        for c in comps:
            if (c.get("status") or {}).get("type", {}).get("name") != "STATUS_SCHEDULED":
                continue
            ordered = sorted(c.get("competitors") or [], key=lambda x: x.get("order") or 0)
            names = [((x.get("athlete") or {}).get("displayName") or "").strip() for x in ordered]
            if len(names) != 2 or not all(names) or names[0] == names[1]:
                continue
            bout = {"id": f"espn-{c.get('id')}", "fighters": names, "source": FIGHTCENTER.format(id=e["id"])}
            division = ((c.get("type") or {}).get("abbreviation") or "").strip()
            if division:
                bout["division"] = re.sub(r"^W\s+", "Women's ", division)
            if main is None and main_surnames and {_surname(n) for n in names} == main_surnames:
                main = {**bout, "section": "main", "note": "Main event, as named by ESPN"}
            else:
                bouts.append({**bout, "section": "announced", "note": "Order TBC"})
        if main:
            bouts.insert(0, main)
        if not bouts:
            continue
        slug = re.sub(r"[^a-z0-9]+", "-", _fold(e["name"].split(":")[0])).strip("-")
        out.append({
            "id": f"{slug}-{day}",
            "date": day,
            "startAt": start.isoformat().replace("+00:00", "Z"),
            "sport": "mma",
            "promotion": PROMOTION,
            "title": e["name"],
            "location": ", ".join(x for x in (venue["fullName"], city, country) if x),
            "source": FIGHTCENTER.format(id=e["id"]),
            "verifiedAt": checked_at[:10],
            "addedBy": "scripts/espn_pfl_schedule.py",
            "note": "Card from ESPN's PFL schedule; main event as named by ESPN, other bout order TBC.",
            "bouts": bouts,
        })
    return out


def merge_new(events: list[dict], new: list[dict]) -> list[dict]:
    """Append PFL events not already listed (same ESPN source, same id, or a PFL event on
    the same day). Existing entries are never changed or removed."""
    known_src = {e.get("source") for e in events} | {e.get("id") for e in events}
    pfl_days = {e.get("date") for e in events if "pfl" in str(e.get("promotion", "")).lower()}
    added = [e for e in new if e["source"] not in known_src and e["id"] not in known_src and e["date"] not in pfl_days]
    events.extend(added)
    return added
