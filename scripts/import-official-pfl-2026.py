#!/usr/bin/env python3
"""Merge hand-checked historical PFL bout sheets into the site's results database.

Each fixture has a linked published results source. Idempotent: identifies existing
bouts by the exact (accent-folded) fighter pair, preserves matching sourced photos,
and avoids generating imagined pre-fight records. Only the published final event
listing is represented; records are not back-calculated.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import pathlib
import re
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "data/pfl-official-results-2026.json"
RESULTS = ROOT / "data/results.json"
RECORD = re.compile(r"^\d{1,3}[-–]\d{1,3}(?:[-–]\d{1,2})?$")

def norm(text):
    folded = unicodedata.normalize("NFKD", str(text or ""))
    return re.sub(r"[^a-z0-9]", "", folded.encode("ascii", "ignore").decode().lower())

def pair(names):
    return frozenset(norm(name) for name in names)

def validated_fixture(document):
    events = document.get("events", [])
    if len(events) != 7:
        raise ValueError("Expected the seven individually verified missing PFL cards")
    for event in events:
        if not event["source"].startswith("https://") or not event["id"].startswith("pfl-"):
            raise ValueError("Invalid PFL source or event ID")
        if not ("2026-05-11" <= event["date"] <= "2026-11-11"):
            raise ValueError("Event outside the requested archive period")
        seen = set()
        if len(event["rows"]) < 8:
            raise ValueError("Missing a published full PFL fight card")
        for row in event["rows"]:
            if not (len(row) in (10, 11) and all(isinstance(x, str) for x in row[:6])):
                raise ValueError(f"Bad fixture row in {event['id']}: {row}")
            if not (row[0].strip() and row[2].strip() and norm(row[0]) != norm(row[2])):
                raise ValueError("Invalid fighter names")
            for record in (row[1], row[3]):
                if record and not RECORD.fullmatch(record):
                    raise ValueError(f"Bad published fighter record {record}")
            key = pair((row[0], row[2]))
            if key in seen:
                raise ValueError(f"Duplicate fight in {event['id']}: {key}")
            seen.add(key)
            if not re.fullmatch(r"[1-5]", str(row[6])):
                raise ValueError("Invalid round")
            if row[7] and not re.fullmatch(r"\d{1,2}:\d{2}", row[7]):
                raise ValueError("Invalid finish time")
            if row[9] not in ("Main card", "Prelims"):
                raise ValueError("Unrecognised card section")
            if len(row) == 11 and row[10] != "amateur":
                raise ValueError("Unrecognised bout type")
    return events

def fighter(name, record, source, prior=None, amateur=False):
    obj = {"name": name}
    if prior:
        for key in ("photo", "photoSource", "countryCode", "countryLabel", "countrySource"):
            if prior.get(key):
                obj[key] = prior[key]
    if record:
        obj.update(
            record=record.replace("-", "–"),
            recordSource=source,
            recordContext="event-listing",
            recordNote=(
                "Record published for an amateur result in the linked event report; "
                "not a professional record."
                if amateur else
                "Fighter record from the cited historical results report; "
                "not independently asserted as the tally immediately before this bout."
            ),
        )
    return obj

def merge(document, fixture, *, reviewed="2026-11-11"):
    events = validated_fixture(fixture)
    all_events = document.get("events", [])
    all_rows = document.get("results", [])
    totals = []
    for item in events:
        event = next((e for e in all_events if e.get("id") == item["id"]), None)
        if event is None:
            raise ValueError("Cannot merge into unknown archived event " + item["id"])
        if event.get("date") != item["date"]:
            raise ValueError("Event date disagreement " + item["id"])
        original_rows = [r for r in all_rows if r.get("eventId") == event["id"]]
        matching = {pair([f.get("name") for f in r.get("fighters", [])]): r
                    for r in original_rows if len(r.get("fighters", [])) == 2}
        previous_headline = next((r for r in original_rows
                                  if r.get("id") == event.get("mainBoutId")), None)
        changed = 0
        for position, values in enumerate(item["rows"]):
            win, win_record, lost, lost_record, division, method, round_no, clock, scores, section = values[:10]
            key = pair((win, lost))
            row = matching.get(key)
            if row is None and position == 0 and previous_headline is not None:
                # Historical headline name variants sometimes differ; the
                # linked official result replaces the stale headline outcome.
                row = previous_headline
            if row is None:
                row_id = event["id"] + "-" + norm(win)[:16] + "-" + norm(lost)[:16]
                if any(r.get("id") == row_id for r in all_rows):
                    raise ValueError("Result ID collision: " + row_id)
                row = {"id": row_id}
                all_rows.append(row)
                changed += 1
            old_by_name = {norm(f.get("name")): f for f in row.get("fighters", [])}
            amateur = len(values) == 11 and values[10] == "amateur"
            row.update(
                eventId=event["id"], event=event["name"], sport="MMA",
                date=event["date"], location=item["venue"], division=division,
                fighters=[
                    fighter(win, win_record, item["source"], old_by_name.get(norm(win)), amateur),
                    fighter(lost, lost_record, item["source"], old_by_name.get(norm(lost)), amateur),
                ],
                winner=0, method=method, round=int(round_no), time=clock or None,
                scores=scores or None, source=item["source"], highlights=row.get("highlights"),
                summary="", section=section, order=position, status="completed",
                scheduledRounds=5 if position == 0 and "Welterweight" in division and item["id"].endswith("washington-dc") else 3,
            )
            if amateur:
                row["boutType"] = "amateur"
            else:
                row.pop("boutType", None)
        merged_rows = [r for r in all_rows if r.get("eventId") == event["id"]]
        expected = len(item["rows"])
        if len(merged_rows) != expected:
            raise ValueError(f"{event['id']}: expected exactly {expected} "
                             f"published outcomes, got {len(merged_rows)}")
        event.update(
            source=item["source"], feeds=[item["source"]],
            location=item["venue"], expectedBouts=expected,
            partialCoverage=False, status="completed",
            sectionOrder={"main": "headliner-first", "prelims": "headliner-first"},
            recordNote="Fighter records as published in the linked event results; not verified pre-fight totals.",
            checkedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
        )
        if item["id"].endswith("africa-nigeria"):
            # Earlier archive incorrectly claimed the main event was a no contest.
            # The PFL results explicitly list Ignacio Campos as the winner.
            event["correctionNote"] = "Headline result corrected using the official PFL Africa Nigeria result release."
        totals.append({"event": event["id"], "newBouts": changed, "total": expected})
    document["reviewedAt"] = reviewed
    return totals

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    archive = json.loads(RESULTS.read_text(encoding="utf-8"))
    fixtures = json.loads(FIXTURE.read_text(encoding="utf-8"))
    changes = merge(archive, fixtures, reviewed=dt.datetime.now(dt.timezone.utc).date().isoformat())
    print("Official PFL archive:", json.dumps(changes, ensure_ascii=False))
    if not args.dry_run:
        RESULTS.write_text(json.dumps(archive, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
