#!/usr/bin/env python3
"""Add active UFC fighters to division rosters in data/ufc-divisions.json from the Cito UFC API.

Free source: Cito's fighters list (GitHub secret UFC_STATS_API_CITO, the owner's free
key). One full pass is 7 requests at 500 a page. Runs monthly and on demand.

What it changes: ONLY the `roster` lists and the fighter index. It never touches
champions, ranks or ranking dates (those come from scripts/refresh-ufc-rankings.py),
and it never moves a fighter who already has a division: those conflicts are listed
under `rosterDiagnostics.conflicts` for the owner to review.

Rules (docs/ufc-research-archive.md, AGENTS.md)
  * Only the UFC_STATS_API_CITO secret.
  * At most MAX_RUN_CALLS (9) requests per run and ROLLING_BUDGET (120) per rolling
    30 days across this job and the research archive (its ledger is only READ here;
    this job keeps its own in data/cito-roster-ledger.json).
  * Stops on 401/403/429, an invalid response, or an incomplete pass, and then
    writes no roster data. Requests already made are still recorded.
  * A fighter is added only if Cito says they are active, gives one of our 12
    divisions, and their name matches a fighter the site has statistics for
    (data/ufc-stats/names.json). Nothing is guessed.
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIVISIONS = ROOT / "data" / "ufc-divisions.json"
NAMES = ROOT / "data" / "ufc-stats" / "names.json"
OWN_LEDGER = ROOT / "data" / "cito-roster-ledger.json"
RESEARCH_LEDGER = ROOT / "data" / "ufc-research-ledger.json"
BASE = "https://api.citoapi.com/api/v1/"
PAGE_SIZE = 500
MAX_RUN_CALLS = 9
ROLLING_BUDGET = 120
MIN_ACCEPTED = 500  # fewer matched active fighters with a division than this means something is wrong
ROSTER_SOURCE = "cito"


def _module():
    spec = importlib.util.spec_from_file_location("befn_divisions", ROOT / "scripts/refresh-ufc-divisions.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def name_key(name: str) -> str:
    """Letters-and-digits form used by data/ufc-stats/names.json."""
    ascii_name = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", ascii_name)


def read_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def window(requests: list, today: dt.date) -> list:
    threshold = (today - dt.timedelta(days=30)).isoformat()
    return [x for x in requests if isinstance(x, str) and x >= threshold]


def budget_left(own: dict, research: dict, today: dt.date) -> int:
    used = len(window(own.get("requests", []), today)) + len(window(research.get("requests", []), today))
    return max(0, ROLLING_BUDGET - used)


class Stopped(Exception):
    """The pass cannot be trusted; write no roster data."""


def fetch_active(key: str, own: dict, research: dict, today: dt.date, transport=None) -> list[dict]:
    """Every fighter row Cito lists. Raises Stopped on any problem."""
    def http(path):
        req = urllib.request.Request(BASE + path, headers={
            "x-api-key": key, "Accept": "application/json", "User-Agent": "BEFN-roster-refresh/1.0"})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response), dict(response.headers)
    transport = transport or http
    own["requests"] = window(own.get("requests", []), today)
    rows, page, calls = [], 1, 0
    while True:
        if calls >= MAX_RUN_CALLS:
            raise Stopped(f"more than {MAX_RUN_CALLS} requests needed; pass incomplete")
        if budget_left(own, research, today) <= 0:
            raise Stopped("rolling 30-day budget used up")
        calls += 1
        own["requests"].append(today.isoformat())  # counted even if the call fails
        try:
            body, headers = transport(f"ufc/fighters?limit={PAGE_SIZE}&page={page}")
        except urllib.error.HTTPError as exc:
            own["error"] = f"HTTP_{exc.code}"
            raise Stopped(f"HTTP {exc.code}")
        except (OSError, ValueError, TimeoutError) as exc:
            own["error"] = "network_error"
            raise Stopped(f"network error: {exc}")
        remaining = (headers or {}).get("X-RateLimit-Monthly-Remaining")
        if str(remaining).isdigit():
            own["providerRemaining"] = int(remaining)
            if int(remaining) <= 3:
                raise Stopped("provider monthly allowance nearly used")
        data = body.get("data") if isinstance(body, dict) else None
        meta = body.get("meta") if isinstance(body, dict) else None
        if not isinstance(body, dict) or body.get("success") is False or not isinstance(data, list) or not isinstance(meta, dict):
            own["error"] = "invalid_response"
            raise Stopped("invalid response")
        rows += [r for r in data if isinstance(r, dict)]
        if not meta.get("hasNextPage"):
            if meta.get("total") and len(rows) < int(meta["total"]):
                raise Stopped("fewer rows than the reported total")
            return rows
        page += 1


def merge(previous: dict, rows: list[dict], names: dict, today: dt.date, module) -> tuple[dict, dict]:
    """New data document and a report. Adds only fighters with no division yet."""
    labels = {label: slug for slug, label in module.DIVISIONS.items()}
    divisions = {k: {**v, "roster": list(v.get("roster") or [])} for k, v in (previous.get("divisions") or {}).items()}
    have = set(previous.get("fighters") or {})
    slugs = set(names.values())
    added, conflicts, unmatched, no_division = {}, [], 0, 0
    accepted = 0
    for row in rows:
        if row.get("isActive") is not True:
            continue
        division = labels.get(row.get("division"))
        if not division:
            no_division += 1
            continue
        slug = names.get(name_key(row.get("name") or "")) or (row.get("slug") if row.get("slug") in slugs else None)
        if not slug:
            unmatched += 1
            continue
        accepted += 1
        if slug in have:
            current = (previous["fighters"][slug] or {}).get("division")
            if current and current != division:
                conflicts.append({"slug": slug, "saved": current, "cito": division})
            continue
        if slug in added:
            continue
        added[slug] = division
    report = {"activeRows": sum(1 for r in rows if r.get("isActive") is True), "matchedWithDivision": accepted,
              "added": len(added), "conflicts": sorted(conflicts, key=lambda c: c["slug"]),
              "unmatchedToSiteStats": unmatched, "activeWithoutDivision": no_division}
    if accepted < MIN_ACCEPTED:
        raise Stopped(f"only {accepted} active fighters matched (need {MIN_ACCEPTED}); not writing")
    for slug, division in added.items():
        divisions[division]["roster"] = sorted(set(divisions[division]["roster"]) | {slug})
    doc = {k: v for k, v in previous.items() if k not in ("divisions", "fighters")}
    doc.update({"divisions": divisions, "fighters": module.fighter_index(divisions),
                "rosterSource": ROSTER_SOURCE, "rosterObservedOn": today.isoformat(),
                "rosterDiagnostics": {k: report[k] for k in ("activeRows", "matchedWithDivision", "added",
                                                              "unmatchedToSiteStats", "activeWithoutDivision", "conflicts")}})
    return doc, report


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-rows", help="JSON list of saved Cito rows (offline); no request is made")
    ap.add_argument("--out", default=str(DIVISIONS))
    ap.add_argument("--ledger", default=str(OWN_LEDGER))
    args = ap.parse_args(argv)
    module = _module()
    today = dt.datetime.now(dt.timezone.utc).date()
    out, ledger_path = Path(args.out), Path(args.ledger)
    own = read_json(ledger_path, {"schema": 1, "requests": []})
    own.pop("error", None)
    research = read_json(RESEARCH_LEDGER, {"requests": []})
    previous = read_json(out, {})
    names = read_json(NAMES, {}).get("names", {})
    try:
        if args.from_rows:
            rows = [{"slug": r[0], "name": r[1], "division": r[2], "status": r[3], "isActive": r[4]}
                    for r in json.loads(Path(args.from_rows).read_text(encoding="utf-8"))]
        else:
            key = os.environ.get("UFC_STATS_API_CITO", "").strip()
            if not key:
                raise Stopped("secret UFC_STATS_API_CITO is not set")
            rows = fetch_active(key, own, research, today)
        doc, report = merge(previous, rows, names, today, module)
    except Stopped as exc:
        print(f"Stopped, roster data NOT written: {exc}")
        if not args.from_rows:
            ledger_path.write_text(json.dumps(own, indent=1) + "\n", encoding="utf-8")
        return 2
    print(json.dumps({k: v for k, v in report.items() if k != "conflicts"}))
    for conflict in report["conflicts"]:
        print(f"kept saved division for {conflict['slug']}: saved {conflict['saved']}, Cito {conflict['cito']}")
    out.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    if not args.from_rows:
        own["lastRun"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        ledger_path.write_text(json.dumps(own, indent=1) + "\n", encoding="utf-8")
    print(f"budget left after this run: {budget_left(own, research, today)} of {ROLLING_BUDGET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
