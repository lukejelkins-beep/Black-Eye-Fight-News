#!/usr/bin/env python3
"""Build data/ufc-free-round-stats.json: per-round statistics for UFC fights the
round archive does not hold.

Source: the free UFCStats.com CSV export maintained at
https://github.com/Greco1899/scrape_ufc_stats (the same export the results
importer and the weight-class builder already read; no key, no quota, no paid
worker). Only the rounds of fights we do not already hold are kept.

Why: data/ufc-research-archive.json is filled by the Cito collector, so a card
that finishes now arrives with its result but no measured rounds. This fills
that gap from a free source, leaving the archive untouched and authoritative.

Rules
  * Only fights after the newest fight the retired UFCalendar collector put in
    the archive, so no published number changes and the file stays small. Cito
    records neither move that date nor hide a fight: Cito publishes no
    reversals, so its rounds cannot stand in for these.
  * A fight is kept only when its event has a date in the export and the bout
    names a pair of fighters. Corners follow the export's own bout order.
  * Counts are read exactly ("41 of 65" -> 41 landed, 65 attempted; "0:03" ->
    3 seconds of control). Unreadable or absent values stay missing, never zero.
  * Position times (distance, clinch, ground seconds) are not published by this
    export, so they stay missing rather than being inferred.
  * A round whose landed exceeds its attempted, or whose head, body and leg
    landed do not sum to the significant strikes landed, is dropped: the export
    is then not internally consistent for that round and nothing is guessed.
  * Output is sorted and carries no timestamp, so an unchanged export is a no-op.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "ufc-free-round-stats.json"
REPO = "https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/{name}.csv"
SOURCE_LABEL = "UFCStats.com via the Greco1899/scrape_ufc_stats CSV export"
SCHEMA = 1
# The counting fields this export publishes, in the order the statistics build
# expects. Position times are deliberately absent; see the rules above.
FIELDS = ("sigLanded", "sigAttempted", "totalLanded", "totalAttempted",
          "headLanded", "headAttempted", "bodyLanded", "bodyAttempted",
          "legLanded", "legAttempted", "distanceLanded", "distanceAttempted",
          "clinchLanded", "clinchAttempted", "groundLanded", "groundAttempted",
          "knockdowns", "takedowns", "takedownAttempts", "subAttempts",
          "reversals", "controlSec")
PAIRS = (("sigLanded", "sigAttempted"), ("totalLanded", "totalAttempted"),
         ("headLanded", "headAttempted"), ("bodyLanded", "bodyAttempted"),
         ("legLanded", "legAttempted"), ("distanceLanded", "distanceAttempted"),
         ("clinchLanded", "clinchAttempted"), ("groundLanded", "groundAttempted"),
         ("takedowns", "takedownAttempts"))


def norm(text) -> str:
    folded = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", folded.lower())


def pair_key(a, b) -> str:
    return "|".join(sorted((norm(a), norm(b))))


def parse_date(text):
    for fmt in ("%B %d, %Y", "%Y-%m-%d", "%b %d, %Y"):
        try:
            return dt.datetime.strptime(str(text or "").strip(), fmt).date()
        except ValueError:
            pass
    return None


def landed_of(text):
    found = re.match(r"\s*(\d+)\s+of\s+(\d+)\s*$", str(text or ""))
    return (int(found.group(1)), int(found.group(2))) if found else (None, None)


def whole(text):
    text = str(text or "").strip()
    return int(text) if text.isdigit() else None


def clock(text):
    found = re.match(r"\s*(\d+):(\d{2})\s*$", str(text or ""))
    return int(found.group(1)) * 60 + int(found.group(2)) if found else None


def side_from(row: dict) -> dict:
    """One fighter's round in the shape the statistics build reads."""
    out = {}
    for field, column in (("sigLanded", "SIG.STR."), ("totalLanded", "TOTAL STR."), ("takedowns", "TD"),
                          ("headLanded", "HEAD"), ("bodyLanded", "BODY"), ("legLanded", "LEG"),
                          ("distanceLanded", "DISTANCE"), ("clinchLanded", "CLINCH"), ("groundLanded", "GROUND")):
        landed, attempted = landed_of(row.get(column))
        out[field] = landed
        out[field.replace("Landed", "Attempted") if field != "takedowns" else "takedownAttempts"] = attempted
    out["knockdowns"] = whole(row.get("KD"))
    out["subAttempts"] = whole(row.get("SUB.ATT"))
    out["reversals"] = whole(row.get("REV."))
    out["controlSec"] = clock(row.get("CTRL"))
    return {field: out.get(field) for field in FIELDS}


def consistent(side: dict) -> bool:
    """A round the export itself contradicts is not usable evidence."""
    if side.get("sigLanded") is None:
        return False
    for landed, attempted in PAIRS:
        if side.get(landed) is not None and side.get(attempted) is not None and side[landed] > side[attempted]:
            return False
    for parts in (("headLanded", "bodyLanded", "legLanded"),
                  ("distanceLanded", "clinchLanded", "groundLanded")):
        values = [side.get(part) for part in parts]
        if all(value is not None for value in values) and sum(values) != side["sigLanded"]:
            return False
    return True


def fetch(name: str) -> str:
    request = urllib.request.Request(REPO.format(name=name), headers={"User-Agent": "BEFN-Round-Stats/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read(40_000_000).decode("utf-8", "replace")


def archive_state(path: Path):
    """Fights the retired collector recorded, and the date of its newest one."""
    try:
        fights = json.loads(path.read_text(encoding="utf-8"))["fights"]
    except (OSError, ValueError, KeyError):
        return set(), None
    held, latest = set(), None
    for record in fights.values():
        if str(record.get("promotion", "")).upper() != "UFC" or "ufcalendar" not in (record.get("sources") or {}):
            continue
        day = parse_date(record.get("date"))
        if not day:
            continue
        held.add((day.isoformat(), pair_key(record.get("fighterA"), record.get("fighterB"))))
        latest = day if latest is None or day > latest else latest
    return held, latest


def build(get=fetch, archive: Path | None = None) -> dict:
    held, latest = archive_state(archive or DATA / "ufc-research-archive.json")
    dates = {}
    for row in csv.DictReader(io.StringIO(get("ufc_event_details"))):
        day = parse_date(row.get("DATE"))
        if day:
            dates[str(row.get("EVENT", "")).strip()] = day
    fights: dict[str, dict] = {}
    for row in csv.DictReader(io.StringIO(get("ufc_fight_stats"))):
        day = dates.get(str(row.get("EVENT", "")).strip())
        names = re.split(r"\s+vs\.?\s+", str(row.get("BOUT", "")).strip(), flags=re.I)
        number = re.match(r"\s*Round\s+(\d+)", str(row.get("ROUND", "")))
        if not day or len(names) != 2 or not number:
            continue
        if latest is not None and day <= latest:
            continue  # the archive owns everything up to its newest fight
        key = f"{day.isoformat()}|{pair_key(*names)}"
        if (day.isoformat(), pair_key(*names)) in held:
            continue
        a, b = (name.strip() for name in names)
        fight = fights.setdefault(key, {"date": day.isoformat(), "event": str(row.get("EVENT", "")).strip(),
                                        "a": a, "b": b, "rounds": {}})
        corner = "a" if norm(row.get("FIGHTER")) == norm(fight["a"]) else \
                 "b" if norm(row.get("FIGHTER")) == norm(fight["b"]) else None
        if corner is None:
            fight["rounds"] = {}  # a name that is neither corner: the bout is not trustworthy
            continue
        side = side_from(row)
        fight["rounds"].setdefault(int(number.group(1)), {})[corner] = side if consistent(side) else None
    out = {}
    for key, fight in sorted(fights.items()):
        rounds = []
        for number in sorted(fight["rounds"]):
            both = fight["rounds"][number]
            if both.get("a") and both.get("b"):
                rounds.append({"round": number, "a": both["a"], "b": both["b"]})
        if rounds and [r["round"] for r in rounds] == list(range(1, len(rounds) + 1)):
            out[key] = {"date": fight["date"], "event": fight["event"], "fighterA": fight["a"],
                        "fighterB": fight["b"], "rounds": rounds}
    return {"schema": SCHEMA, "source": SOURCE_LABEL, "fields": list(FIELDS),
            "after": latest.isoformat() if latest else None, "fights": out}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(OUT))
    args = parser.parse_args()
    built = build()
    Path(args.out).write_text(json.dumps(built, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    rounds = sum(len(f["rounds"]) for f in built["fights"].values())
    print(f"{len(built['fights'])} fights, {rounds} rounds after {built['after']} (archive untouched)")


if __name__ == "__main__":
    main()
