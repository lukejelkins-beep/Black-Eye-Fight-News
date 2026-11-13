#!/usr/bin/env python3
"""Read-only historical UFCalendar UFC coverage audit.

This is an intentionally small sample, not a backfill. Prints aggregated metrics
only. It does not store raw provider responses or print the API token.
"""
from __future__ import annotations
import collections
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.ufcalendar.com/v1"
YEARS = list(range(1993, 2003))
FIELDS = ["sig_strikes_landed", "sig_strikes_attempted", "knockdowns",
          "takedowns_landed", "takedowns_attempted", "submission_attempts",
          "control_time_sec", "total_strikes_landed", "head_landed",
          "body_landed", "leg_landed", "distance_landed",
          "clinch_landed", "ground_landed"]
token = os.environ.get("UFCALENDAR_API_KEY", "")
if not token:
    sys.exit("AUDIT_BLOCKED: UFCALENDAR_API_KEY secret unavailable")
calls = 0

def get(path, params=None):
    global calls
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    request = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/json",
        "User-Agent": "BEFN-ReadOnly-Historical-Availability-Audit/1.0",
    })
    for retry in range(2):
        calls += 1
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and retry == 0:
                time.sleep(min(int(exc.headers.get("Retry-After", "3")), 30))
                continue
            print("API_ERROR", path, "status", exc.code)
        except Exception as exc:
            print("NETWORK_ERROR", path, type(exc).__name__)
        return {}
    return {}

def as_rows(doc):
    d = doc.get("data") if isinstance(doc, dict) else None
    return d if isinstance(d, list) else []

def recurse_year_rows(x, found, year_hint=None):
    if isinstance(x, dict):
        yy = x.get("year", x.get("utc_year", year_hint))
        if yy is not None and "fights_completed" in x:
            try:
                y = int(yy)
                if 1993 <= y <= 2026:
                    found[y] = x
            except (TypeError, ValueError):
                pass
        for k, val in x.items():
            keyyear = int(k) if isinstance(k, str) and k.isdigit() and len(k) == 4 else None
            recurse_year_rows(val, found, keyyear)
    elif isinstance(x, list):
        for val in x:
            recurse_year_rows(val, found, year_hint)

coverage = get("/coverage", {"org": "ufc"})
data = coverage.get("data") if isinstance(coverage, dict) else None
print("BEFN_UFCALENDAR_HISTORICAL_AUDIT_V1")
print("Coverage response format:", type(data).__name__)
print("Source year-by-year totals, all available years:")
annual = {}
recurse_year_rows(data, annual)
for year in sorted(annual):
    r = annual[year]
    total = r.get("fights_completed", 0)
    totals = r.get("fights_with_stats", 0)
    rounds = r.get("fights_with_rounds", 0)
    rate = lambda n: round(100 * n / total, 1) if isinstance(total,(int,float)) and total else None
    print(json.dumps({"year": year, "settled": total, "fight_totals": totals,
        "fight_totals_pct": rate(totals), "rounds": rounds,
        "rounds_pct": rate(rounds)}, sort_keys=True))
if not annual:
    print("COVERAGE_SCHEMA_NEEDS_REVIEW:", list(data.keys()) if isinstance(data, dict) else type(data).__name__)

print("Early-era field-value spot checks (up to 4 fights/year; 1 round call/fight, 1 quality check/year):")
for year in YEARS:
    found = get("/fights/search", {
        "org": "ufc", "from": f"{year}-01-01", "to": f"{year}-12-31",
        "order": "oldest", "limit": 20
    })
    bouts = as_rows(found)
    ids = []
    for b in bouts:
        bid = b.get("id") if isinstance(b, dict) else None
        if isinstance(bid, int) and bid not in ids:
            ids.append(bid)
        if len(ids) >= 4:
            break
    counts = collections.Counter()
    positives = collections.Counter()
    nrows, nwithrounds = 0, 0
    qualities = []
    for k, bid in enumerate(ids):
        if k == 0:
            quality_doc = get(f"/fights/{bid}/stats")
            qualities.append((quality_doc.get("meta") or {}).get("quality"))
        doc = get(f"/fights/{bid}/rounds")
        rows = as_rows(doc)
        if rows:
            nwithrounds += 1
        for row in rows:
            if not isinstance(row, dict):
                continue
            nrows += 1
            for key in FIELDS:
                if row.get(key) is not None and isinstance(row.get(key), (int,float)):
                    counts[key] += 1
                    if row[key] > 0:
                        positives[key] += 1
    result = {"year": year, "bouts_found": len(bouts),
              "bouts_sampled": len(ids), "bouts_with_rounds": nwithrounds,
              "fighter_round_rows": nrows, "sample_quality": qualities}
    for field in FIELDS:
        result[field] = f"{counts[field]}/{nrows} present; {positives[field]} positive" if nrows else "not_observed"
    print(json.dumps(result, sort_keys=True))
print("TOTAL_API_REQUESTS", calls)
print("AUDIT_NOTE: field sampling is indicative only; use complete /coverage annual rates for research policy.")
