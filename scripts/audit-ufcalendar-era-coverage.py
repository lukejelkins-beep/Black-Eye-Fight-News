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
YEARS = list(range(2008, 2027))
FIELDS = ["sig_strikes_landed", "sig_strikes_attempted", "knockdowns",
          "takedowns_landed", "takedowns_attempted", "submission_attempts",
          "control_time_sec", "total_strikes_landed", "head_landed",
          "body_landed", "leg_landed", "distance_landed",
          "clinch_landed", "ground_landed", "reversals", "distance_time_sec", "clinch_time_sec", "ground_time_sec"]
token = os.environ.get("UFCALENDAR_API_KEY", "")
if not token:
    sys.exit("AUDIT_BLOCKED: UFCALENDAR_API_KEY secret unavailable")
calls = 0
last_request = 0.0
MAX_REQUESTS = 170

def get(path, params=None):
    global calls, last_request
    if calls >= MAX_REQUESTS:
        raise RuntimeError('Audit request limit reached')
    pause = last_request + 1.35 - time.monotonic()
    if pause > 0: time.sleep(pause)
    last_request = time.monotonic()
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
                delay = exc.headers.get('Retry-After', '5')
                try: seconds = min(max(5, int(delay)), 30)
                except ValueError: seconds = 7
                time.sleep(seconds)
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
                if 2008 <= y <= 2026:
                    found[y] = x
            except (TypeError, ValueError):
                pass
        for k, val in x.items():
            keyyear = int(k) if isinstance(k, str) and k.isdigit() and len(k) == 4 else None
            recurse_year_rows(val, found, keyyear)
    elif isinstance(x, list):
        for val in x:
            recurse_year_rows(val, found, year_hint)


def numeric(v):
    return type(v) in (int, float) and v >= 0

def percentage(n, d):
    return round(100 * n / d, 1) if d else None

def first_completed_bout(year, start, end):
    doc = get("/fights/search", {
        "org": "ufc", "from": f"{year}-{start}",
        "to": f"{year}-{end}", "order": "oldest", "limit": 10
    })
    for row in as_rows(doc):
        bid = row.get("id") if isinstance(row, dict) else None
        if type(bid) is int and bid > 0:
            return bid
    return None

usage = get("/usage")
limit = (usage.get("data") or {}).get("requests_limit")
used = (usage.get("data") or {}).get("requests_used")
if type(limit) is int and type(used) is int and min(limit - used, 27000 - used) < 160:
    sys.exit("AUDIT_BLOCKED_BUDGET: insufficient available UFCalendar requests; no historical field sampling started")

coverage = get("/coverage", {"org": "ufc"})
data = coverage.get("data") if isinstance(coverage, dict) else None
annual = {}
recurse_year_rows(data, annual)

print("BEFN_UFCALENDAR_2008_2026_FIELD_AUDIT_V2")
print("Audit design: one UFC bout sampled in each of Jan-Apr, May-Aug and Sep-Dec, per year.")
print("Year-by-year provider coverage and sampled field presence are different measures.")
print("Metric availability uses field presence, not positive values; zero is a valid recorded value.")

seasons = [("01-01", "04-30"), ("05-01", "08-31"), ("09-01", "12-31")]
aggregated = collections.defaultdict(lambda: {"rows": 0, "present": 0, "positive": 0})
bad_requests = 0
for year in YEARS:
    raw = annual.get(year) or {}
    completed = raw.get("fights_completed")
    provider_with_rounds = raw.get("fights_with_rounds")
    quality_flags = collections.Counter()
    present = collections.Counter()
    positive = collections.Counter()
    sampled = 0
    with_rounds = 0
    nrows = 0
    empty_periods = 0
    for season_index, (start, end) in enumerate(seasons):
        bid = first_completed_bout(year, start, end)
        if not bid:
            empty_periods += 1
            continue
        sampled += 1
        if season_index == 0:
            stats = get(f"/fights/{bid}/stats")
            q = (stats.get("meta") or {}).get("quality")
            if isinstance(q, dict):
                for k, v in q.items():
                    if v is True: quality_flags[str(k)] += 1
        doc = get(f"/fights/{bid}/rounds")
        rows = as_rows(doc)
        if rows: with_rounds += 1
        else: bad_requests += 1
        for row in rows:
            if not isinstance(row, dict): continue
            nrows += 1
            for field in FIELDS:
                v = row.get(field)
                if numeric(v):
                    present[field] += 1
                    if v > 0: positive[field] += 1
    record = {
        "year": year, "fights_completed": completed,
        "provider_round_coverage_pct": percentage(provider_with_rounds, completed)
            if type(completed) is int and type(provider_with_rounds) is int else None,
        "sampled_bouts": sampled, "sampled_with_rounds": with_rounds,
        "fighter_round_rows": nrows, "empty_sampling_periods": empty_periods,
        "quality_flags_observed_first_season": dict(quality_flags)
    }
    for field in FIELDS:
        record[field + "_pct"] = percentage(present[field], nrows)
        record[field + "_positive_rows"] = positive[field]
        acc = aggregated[field]
        acc["rows"] += nrows
        acc["present"] += present[field]
        acc["positive"] += positive[field]
    print("YEAR", json.dumps(record, sort_keys=True), flush=True)
summary = {f: {"presence_pct": percentage(v["present"], v["rows"]),
               "rows": v["rows"], "positive_rows": v["positive"]}
           for f, v in sorted(aggregated.items())}
print("SUMMARY", json.dumps(summary, sort_keys=True))
print("TOTAL_API_REQUESTS", calls, "EMPTY_ROUND_RESPONSES", bad_requests)
print("LIMITATION: three cross-year sampled bouts per year, not a census of every field;")
print("do not use a global year cutoff solely from this sample. Absence needs per-field policy.")
