#!/usr/bin/env python3
"""Collect UFC fight bonuses (Fight / Performance of the Night) from the free UFC Stats API.

Source: https://ufcapi.aristotle.me (no key; ~30 requests/min and ~1,000/day per IP; data from ufcstats.com).
Bonuses are a flag on the fight (`bonuses`: list of strings), not on a fighter, and the API carries no dollar amounts.

Pull step (this file):
  1. page /api/events (limit 200) for every UFC event id,
  2. fetch /api/events/{id} for each event not yet stored (throttled, Retry-After honoured, 429 retried),
  3. write only a compact, derived record per BONUS fight to data/ufc-bonus-fights.json.
Raw provider payloads are cached under .cache/ufc-bonuses/ (git-ignored) and are never published.

Incremental: events already in the output file are skipped; events dated on or after (newest stored - 14 days) are
refetched so a bonus announced after the card is picked up. A first full pull is ~800 calls (~27 min); a refresh is a
handful. Daily budget guard: refuses to start if more than --max-calls would be needed.

  python3 scripts/refresh-ufc-bonuses.py [--max-calls 900] [--refetch-days 14] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "ufc-bonus-fights.json"
CACHE = ROOT / ".cache" / "ufc-bonuses"
BASE = "https://ufcapi.aristotle.me"
MIN_GAP = 2.3  # seconds between calls: ~26/min, under the 30/min limit
UA = "BEFN-bonus-refresh/1.0"
_last = [0.0]
calls = [0]


def get(path: str):
    for attempt in range(6):
        wait = MIN_GAP - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        calls[0] += 1
        req = urllib.request.Request(BASE + path, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                ra = e.headers.get("Retry-After")
                pause = int(ra) if ra and ra.isdigit() else 30 * (attempt + 1)
                print(f"429 on {path}; waiting {pause}s", file=sys.stderr, flush=True)
                time.sleep(pause + 1)
                continue
            if e.code >= 500:
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"gave up on {path}")


def list_events():
    events, offset = [], 0
    while True:
        page = get(f"/api/events?limit=200&offset={offset}")
        items = page.get("events") or page.get("items") or page.get("data") or (page if isinstance(page, list) else [])
        if not items:
            break
        events.extend(items)
        if len(items) < 200:
            break
        offset += 200
    return [e for e in events if e.get("ufc", True)]


def compact(event: dict) -> list[dict]:
    rows = []
    for f in event.get("fights", []):
        b = [x for x in (f.get("bonuses") or []) if x]
        if not b:
            continue
        f1, f2, w = f.get("fighter1") or {}, f.get("fighter2") or {}, f.get("winner") or {}
        rows.append({
            "fightId": f.get("id"),
            "eventId": event["id"], "event": event.get("name"), "date": event.get("date"),
            "bonuses": b,
            "resultType": f.get("result_type"),
            "fighters": [{"id": x.get("id"), "name": x.get("name"), "result": x.get("result")} for x in (f1, f2)],
            "winnerId": w.get("id"),
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-calls", type=int, default=900)
    ap.add_argument("--refetch-days", type=int, default=14)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    CACHE.mkdir(parents=True, exist_ok=True)
    stored = json.loads(OUT.read_text()) if OUT.exists() else {"schema": 1, "events": {}, "fights": []}
    done = stored["events"]  # eventId -> date
    newest = max(done.values(), default="1900-01-01")
    cutoff = (date.fromisoformat(newest) - timedelta(days=a.refetch_days)).isoformat()

    events = list_events()
    today = date.today().isoformat()
    todo = [e for e in events if e["date"] <= today and (e["id"] not in done or e["date"] >= cutoff)]
    print(f"{len(events)} UFC events listed, {len(todo)} to fetch, {calls[0]} calls so far", flush=True)
    if len(todo) + calls[0] > a.max_calls:
        sys.exit(f"needs {len(todo) + calls[0]} calls, over --max-calls {a.max_calls}; raise it only if today's budget allows")
    if a.dry_run:
        return
    todo.sort(key=lambda e: e["date"], reverse=True)

    fights = {f["fightId"]: f for f in stored["fights"]}
    for i, e in enumerate(todo, 1):
        cf = CACHE / f"{e['id']}.json"
        if cf.exists() and e["date"] < cutoff:
            ev = json.loads(cf.read_text())
        else:
            ev = get(f"/api/events/{e['id']}")
            cf.write_text(json.dumps(ev))
        for k in [k for k, v in fights.items() if v["eventId"] == e["id"]]:
            del fights[k]
        for row in compact(ev):
            fights[row["fightId"]] = row
        done[e["id"]] = e["date"]
        if i % 25 == 0:
            print(f"{i}/{len(todo)} {e['date']} {calls[0]} calls", flush=True)
            save(stored, done, fights)
    save(stored, done, fights)
    labels = sorted({b for f in fights.values() for b in f["bonuses"]})
    print(f"done: {len(done)} events, {len(fights)} bonus fights, labels {labels}, {calls[0]} calls")


def save(stored, done, fights):
    stored["events"] = dict(sorted(done.items(), key=lambda kv: kv[1]))
    stored["fights"] = sorted(fights.values(), key=lambda f: (f["date"], f["fightId"]))
    stored["source"] = BASE
    stored["asOf"] = max(done.values(), default=None)
    OUT.write_text(json.dumps(stored, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
