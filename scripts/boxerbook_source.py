#!/usr/bin/env python3
"""Conservative Boxerbook source cross-check for BEFN boxing cards and results.

Read-only list queries; exact date and whole-name match; no bulk API extraction.
Live publication is disabled unless explicitly approved and keyed server-side.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import os
import re
import unicodedata
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://boxerbook.com/v1"
USER_AGENT = "BlackEyeFightNews/1.0 (boxing-source-review; read-only)"
MAX_BYTES = 2_000_000


def verified_url(value):
    if not isinstance(value, str):
        return ""
    parts = urlsplit(value)
    return value if parts.scheme == "https" and parts.hostname in {"boxerbook.com", "www.boxerbook.com"} else ""


def fetch_json(path, params, key=""):
    if path not in {"/schedule", "/results"}:
        raise ValueError("Only two approved endpoints can be requested")
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    if key:
        headers["Authorization"] = "Bearer " + key
    request = Request(BASE + path + "?" + urlencode(params), headers=headers)
    try:
        with urlopen(request, timeout=20) as response:
            if response.status != 200:
                raise RuntimeError("Boxerbook HTTP " + str(response.status))
            content = response.read(MAX_BYTES + 1)
            if len(content) > MAX_BYTES:
                raise ValueError("Unexpectedly large API response")
    except HTTPError as exc:
        raise RuntimeError("Boxerbook returned HTTP " + str(exc.code)) from None
    except URLError as exc:
        raise RuntimeError("Boxerbook unavailable (" + type(exc.reason).__name__ + ")") from None
    value = json.loads(content.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Unexpected JSON response")
    return value


def norm(value):
    plain = unicodedata.normalize("NFKD", str(value or ""))
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", plain.lower())


def date_only(value):
    match = re.match(r"^\d{4}-\d{2}-\d{2}", str(value or ""))
    if not match:
        return ""
    try:
        return dt.date.fromisoformat(match.group(0)).isoformat()
    except ValueError:
        return ""


def fighter_name(value):
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("name", "full_name", "fullName", "boxer_name", "display_name"):
            if isinstance(value.get(key), str) and value[key].strip():
                return value[key].strip()
    return ""


def matchup(row):
    """Return only explicitly paired fighters, not inferred title names."""
    if not isinstance(row, dict):
        return ()
    for field in ("fighters", "boxers", "participants", "corners"):
        value = row.get(field)
        if isinstance(value, list) and len(value) == 2:
            pair = tuple(fighter_name(x) for x in value)
            if all(pair) and norm(pair[0]) != norm(pair[1]):
                return pair
    for keys in (("red", "blue"), ("boxer_a", "boxer_b"), ("boxer1", "boxer2"),
                 ("fighter1", "fighter2"), ("home", "away"), ("a", "b"), ("winner", "loser")):
        pair = tuple(fighter_name(row.get(key)) for key in keys)
        if all(pair) and norm(pair[0]) != norm(pair[1]):
            return pair
    return ()


def pair_key(pair):
    if len(pair) != 2:
        return ()
    identities = tuple(sorted(norm(x) for x in pair))
    return identities if all(identities) and identities[0] != identities[1] else ()


def candidate_rows(payload):
    """Extract the minimum identity evidence; reject unknown shapes safely."""
    if not isinstance(payload, dict):
        return []
    result, seen = [], set()

    def visit(value, day="", source="", depth=0):
        if depth > 4 or len(result) >= 1000:
            return
        if isinstance(value, list):
            for item in value[:1000]:
                visit(item, day, source, depth + 1)
            return
        if not isinstance(value, dict):
            return
        day = date_only(next((value.get(k) for k in
                        ("date", "event_date", "eventDate", "start_at", "startAt", "starts_at")
                        if value.get(k)), day)) or day
        source = verified_url(value.get("url")) or source
        pair = matchup(value)
        if day and pair and pair_key(pair):
            token = (day, pair_key(pair))
            if token not in seen:
                result.append({"date": day, "pair": pair_key(pair), "url": source})
                seen.add(token)
        for key in ("events", "cards", "schedule", "results", "bouts", "fights", "items", "data"):
            child = value.get(key)
            if isinstance(child, (list, dict)):
                visit(child, day, source, depth + 1)

    visit(payload, source=verified_url(payload.get("url")))
    return result


def local_rows(upcoming, results):
    rows = []
    for event in upcoming.get("events", []):
        if str(event.get("sport", "")).lower() != "boxing":
            continue
        for bout in event.get("bouts", []):
            key = pair_key(bout.get("fighters", []))
            if key:
                rows.append({"kind": "schedule", "date": event.get("date"), "pair": key,
                             "eventId": event.get("id"), "boutId": bout.get("id")})
    for bout in results.get("results", []):
        if str(bout.get("sport", "")).lower() != "boxing":
            continue
        key = pair_key([fighter_name(f) for f in bout.get("fighters", [])])
        if key:
            rows.append({"kind": "results", "date": bout.get("date"), "pair": key,
                         "eventId": bout.get("eventId"), "boutId": bout.get("id")})
    return rows


def reconcile(upcoming, results, schedule_payload, results_payload, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    if now.tzinfo is None:
        raise ValueError("Use a timezone-aware timestamp")
    now = now.astimezone(dt.timezone.utc)
    found, local = [], local_rows(upcoming, results)
    totals = {}
    for kind, source in (("schedule", schedule_payload), ("results", results_payload)):
        available = candidate_rows(source)
        totals[kind + "Candidates"] = len(available)
        for remote in available:
            matches = [row for row in local if row["kind"] == kind
                       and date_only(row["date"]) == remote["date"] and row["pair"] == remote["pair"]]
            # Ambiguous duplicates and mismatching dates must never be auto-merged.
            if len(matches) != 1 or not remote["url"]:
                continue
            match = matches[0]
            found.append({"kind": kind, "eventId": match["eventId"], "boutId": match["boutId"],
                          "url": remote["url"], "asOf": source.get("as_of"),
                          "checkedAt": now.isoformat(timespec="seconds").replace("+00:00", "Z")})
    found = list({(x["kind"], x["eventId"], x["boutId"]): x for x in found}.values())
    totals["matchedBouts"] = len(found)
    return {"schema": 1, "provider": "Boxerbook",
            "checkedAt": now.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "expiresAt": (now + dt.timedelta(hours=24)).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "matched": found, "totals": totals,
            "notice": "Source cross-check only: no records, outcomes, rankings or card order are changed."}


def apply_matches(upcoming, results, report):
    """Attach source-only metadata to exact matches; preserve existing sporting facts."""
    upcoming, results = copy.deepcopy(upcoming), copy.deepcopy(results)
    by_key = {(m["kind"], m["eventId"], m["boutId"]): m for m in report["matched"]}
    for event in upcoming.get("events", []):
        if event.get("sport") != "boxing":
            continue
        for bout in event.get("bouts", []):
            match = by_key.get(("schedule", event.get("id"), bout.get("id")))
            if match:
                bout["boxerbookCrosscheck"] = {"url": match["url"], "asOf": match["asOf"],
                                                "checkedAt": match["checkedAt"]}
    for bout in results.get("results", []):
        if str(bout.get("sport", "")).lower() != "boxing":
            continue
        match = by_key.get(("results", bout.get("eventId"), bout.get("id")))
        if match:
            bout["boxerbookCrosscheck"] = {"url": match["url"], "asOf": match["asOf"],
                                            "checkedAt": match["checkedAt"]}
    return upcoming, results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--schedule-fixture", type=Path)
    parser.add_argument("--results-fixture", type=Path)
    parser.add_argument("--live", action="store_true", help="Two read-only API requests")
    parser.add_argument("--apply", action="store_true", help="Only source metadata; requires licence approval")
    parser.add_argument("--report", type=Path, default=ROOT / "qa/boxerbook-source-review.json")
    args = parser.parse_args()
    if args.live and (args.schedule_fixture or args.results_fixture):
        parser.error("Do not combine --live and fixtures")
    if not args.live and not (args.schedule_fixture and args.results_fixture):
        parser.error("Use --live or BOTH fixture files")
    if args.apply and (not args.live or os.getenv("BOXERBOOK_PUBLICATION_APPROVED") != "1"
                       or not os.getenv("BOXERBOOK_API_KEY")):
        parser.error("--apply requires --live, server-side API key and publication approval")
    upcoming_path, results_path = ROOT / "data/upcoming-cards.json", ROOT / "data/results.json"
    upcoming = json.loads(upcoming_path.read_text(encoding="utf-8"))
    results = json.loads(results_path.read_text(encoding="utf-8"))
    if args.live:
        key = os.getenv("BOXERBOOK_API_KEY", "")
        schedule = fetch_json("/schedule", {"when": "weekend"}, key=key)
        recent = fetch_json("/results", {"days": 14}, key=key)
    else:
        schedule = json.loads(args.schedule_fixture.read_text(encoding="utf-8"))
        recent = json.loads(args.results_fixture.read_text(encoding="utf-8"))
    report = reconcile(upcoming, results, schedule, recent)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Boxerbook: " + str(report["totals"]) + "; QA report: " + str(args.report))
    if args.apply:
        modified_upcoming, modified_results = apply_matches(upcoming, results, report)
        if modified_upcoming != upcoming:
            upcoming_path.write_text(json.dumps(modified_upcoming, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if modified_results != results:
            results_path.write_text(json.dumps(modified_results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("Applied source-only metadata; existing verified sporting facts preserved")


if __name__ == "__main__":
    main()
