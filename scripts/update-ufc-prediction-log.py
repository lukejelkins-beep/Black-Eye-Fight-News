#!/usr/bin/env python3
"""Update data/ufc-prediction-log.json: the live, append-only record of fight predictions (26 Nov 2026).

Owner request: "Add a prediction history page". Two steps, run after scripts/build-ufc-fight-predictions.py:
  1. Log: every predicted bout on a card that has not happened yet is written once, frozen (probabilities, confidence,
     the stats date they were built on) the first time it is seen. A logged entry is never changed or removed, so the
     record cannot be improved after the fact. Bouts on cards dated today or earlier are not logged: they might already
     have been fought.
  2. Score: when data/results.json has the result (same event id and the same two fighters), the entry gets its result:
     winner and how it ended. Draws and no contests are recorded but not scored.

Offline and read-only apart from the log.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
LOG = DATA / "ufc-prediction-log.json"


def fold(text) -> str:
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", text)


def method_kind(method) -> str:
    m = str(method or "").lower()
    if re.search(r"no contest|draw", m):
        return "other"
    if "sub" in m:
        return "sub"
    if re.search(r"\bt?ko\b|ko/tko|stoppage|rtd|retire|doctor", m):
        return "ko"
    if "decision" in m:
        return "dec"
    return "other"


def key_of(event_id: str, names) -> str:
    return event_id + "|" + "|".join(sorted(fold(n) for n in names))


def update(log: dict, predictions: dict, results: dict, today: str) -> dict:
    entries = log.setdefault("entries", [])
    seen = {e["key"] for e in entries}
    for ev in predictions["events"]:
        if ev["date"] <= today:
            continue
        for b in ev["bouts"]:
            if b["status"] != "ok":
                continue
            names = [f["name"] for f in b["fighters"]]
            key = key_of(ev["id"], names)
            if key in seen:
                continue
            seen.add(key)
            entries.append({"key": key, "eventId": ev["id"], "event": ev["title"], "date": ev["date"], "fighters": names,
                            "pool": b["pool"], "loggedOn": today, "statsAsOf": predictions["statsAsOf"],
                            "winProbability": b["winProbability"], "finishProbability": b["finishProbability"],
                            "confidence": b["confidence"], "result": None})
    by_key = {}
    for r in results.get("results", []):
        if r.get("sport") == "MMA" and r.get("status") == "completed" and len(r.get("fighters") or []) == 2:
            by_key[key_of(r["eventId"], [f["name"] for f in r["fighters"]])] = r
    for e in entries:
        if e["result"] is not None:
            continue
        r = by_key.get(e["key"])
        if not r:
            continue
        names = [f["name"] for f in r["fighters"]]
        winner = r.get("winner") if isinstance(r.get("winner"), int) else None
        # Result order can differ from the prediction's: report the winner as an index into the logged fighters.
        idx = None if winner is None else [fold(n) for n in e["fighters"]].index(fold(names[winner]))
        e["result"] = {"winner": idx, "method": method_kind(r.get("method")), "round": r.get("round"), "date": r.get("date")}
    entries.sort(key=lambda e: (e["date"], e["key"]))
    log["schema"] = 1
    log.setdefault("since", today)
    return log


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--today", help="YYYY-MM-DD (default: today, UTC)")
    ap.add_argument("--out", default=str(LOG))
    args = ap.parse_args()
    today = args.today or dt.datetime.now(dt.timezone.utc).date().isoformat()
    out = Path(args.out)
    log = json.loads(out.read_text()) if out.exists() else {}
    predictions = json.loads((DATA / "ufc-fight-predictions.json").read_text())
    results = json.loads((DATA / "results.json").read_text())
    log = update(log, predictions, results, today)
    text = json.dumps(log, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    if not out.exists() or out.read_text() != text:
        out.write_text(text)
    scored = sum(1 for e in log["entries"] if e["result"])
    print(f"{len(log['entries'])} logged, {scored} with a result")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
