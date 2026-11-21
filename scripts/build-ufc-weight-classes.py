#!/usr/bin/env python3
"""Build data/ufc-bout-weight-classes.json: the weight class of each past UFC fight we hold, and each fighter's division.

Phase 3, step 1b (docs/design/PHASE-3.md and SNAPSHOT-METHOD.md). No scores or ratings here.

Source: the free UFCStats.com CSV export maintained at https://github.com/Greco1899/scrape_ufc_stats
(the same export scripts/import-finished-ufc-results.py already uses; no key, no quota, no paid worker).
Only the weight class for bouts we already hold is kept, not the export itself.

Rules
  * A bout is labelled only when the export has the same two fighters (accents and punctuation ignored) on the same
    date, or one day either side when exactly one such bout exists (time zones). Anything else stays unlabelled.
  * Title, interim and "Bout" wording is stripped to the plain class. Catch weight and open weight are kept as
    labels but never count as a division. Unknown wording stays unlabelled. Nothing is guessed.
  * A fighter's division is the class of their latest standard-class fight. `fightsInDivision` counts the unbroken
    run there; `newToDivision` is true when that run is under 3 fights and they fought in another class before.
  * Output is deterministic (sorted, no timestamps) so an unchanged input is a no-op in the hourly workflow.
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
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "ufc-bout-weight-classes.json"
REPO = "https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/{name}.csv"
SOURCE_LABEL = "UFCStats.com via the Greco1899/scrape_ufc_stats CSV export"
NEW_TO_DIVISION_FIGHTS = 3
STANDARD = ("Flyweight", "Bantamweight", "Featherweight", "Lightweight", "Welterweight", "Middleweight",
            "Light Heavyweight", "Heavyweight", "Women's Strawweight", "Women's Flyweight",
            "Women's Bantamweight", "Women's Featherweight")
NON_DIVISION = ("Catch Weight", "Open Weight")


def norm(name) -> str:
    text = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", text)


def parse_date(text):
    for fmt in ("%B %d, %Y", "%Y-%m-%d", "%b %d, %Y"):
        try:
            return dt.datetime.strptime(str(text or "").strip(), fmt).date()
        except ValueError:
            pass
    return None


def weight_class(raw) -> str | None:
    """'UFC Women's Bantamweight Title Bout' -> "Women's Bantamweight"; unknown wording -> None."""
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    text = re.sub(r"^UFC\s+", "", text)
    text = re.sub(r"^Interim\s+", "", text)
    text = re.sub(r"\s+(Title\s+)?Bout$", "", text)
    text = re.sub(r"^Open Weight$", "Open Weight", text)
    return text if text in STANDARD + NON_DIVISION else None


def index_export(events_csv: str, results_csv: str) -> dict:
    """{(norm a, norm b) sorted: [(date, raw weight class), ...]} from the export's two files."""
    dates = {}
    for row in csv.DictReader(io.StringIO(events_csv)):
        day = parse_date(row.get("DATE"))
        if day:
            dates[(row.get("EVENT") or "").strip()] = day
    index = defaultdict(list)
    for row in csv.DictReader(io.StringIO(results_csv)):
        day = dates.get((row.get("EVENT") or "").strip())
        parts = re.split(r"\s+vs\.?\s+", (row.get("BOUT") or "").strip(), maxsplit=1)
        if day and len(parts) == 2 and all(parts):
            index[tuple(sorted((norm(parts[0]), norm(parts[1]))))].append((day, (row.get("WEIGHTCLASS") or "").strip()))
    return index


def match(index: dict, date: dt.date, pair: tuple):
    """Raw weight class for the bout, or None. Exact date first; else one day either side if only one candidate."""
    candidates = index.get(pair, [])
    same = {raw for day, raw in candidates if day == date}
    if len(same) == 1:
        return next(iter(same))
    if same:
        return None
    near = {(day, raw) for day, raw in candidates if abs((day - date).days) <= 1}
    return next(iter(near))[1] if len(near) == 1 else None


def division_summary(fights: list) -> dict | None:
    """fights: [(date, class or None)] for one fighter. None when they have no standard-class fight."""
    standard = [(d, c) for d, c in sorted(fights, key=lambda x: x[0]) if c in STANDARD]
    if not standard:
        return None
    current = standard[-1][1]
    run = 0
    for _, c in reversed(standard):
        if c != current:
            break
        run += 1
    previous = standard[-run - 1][1] if run < len(standard) else None
    return {"division": current, "fightsInDivision": run, "previousDivision": previous,
            "newToDivision": previous is not None and run < NEW_TO_DIVISION_FIGHTS,
            "labelledFights": len(standard)}


def build(bouts: dict, index: dict, export_as_of: str | None = None) -> dict:
    """bouts: {boutId: {"date": date, "pair": (a, b), "slugs": (slug, slug or None)}}."""
    labels, per_fighter, unmatched = {}, defaultdict(list), 0
    for bout_id, b in sorted(bouts.items()):
        raw = match(index, b["date"], b["pair"])
        label = weight_class(raw) if raw is not None else None
        if label is None:
            unmatched += 1
        else:
            labels[bout_id] = label
        for slug in b["slugs"]:
            if slug:
                per_fighter[slug].append((b["date"], label))
    fighters = {}
    for slug, fights in sorted(per_fighter.items()):
        summary = division_summary(fights)
        if summary:
            fighters[slug] = summary
    total = len(bouts)
    return {"schema": 1, "source": SOURCE_LABEL, "exportAsOf": export_as_of,
            "coverage": {"bouts": total, "labelled": len(labels), "unlabelled": unmatched,
                         "share": round(len(labels) / total, 4) if total else None},
            "bouts": labels, "fighters": fighters}


def load_bouts(stats_dir: Path) -> dict:
    """Every distinct bout in data/ufc-stats, from either fighter's file."""
    bouts = {}
    for path in sorted((stats_dir / "fighters").glob("*.json")):
        d = json.loads(path.read_text())
        for f in d.get("fights", []):
            day = parse_date(f.get("date"))
            if not day or not f.get("boutId"):
                continue
            b = bouts.setdefault(str(f["boutId"]), {"date": day, "pair": tuple(sorted((norm(d.get("name")), norm(f.get("opponent"))))), "slugs": set()})
            b["slugs"].add(d.get("slug"))
            if f.get("opponentSlug"):
                b["slugs"].add(f["opponentSlug"])
    return {k: {**v, "slugs": tuple(sorted(s for s in v["slugs"] if s))} for k, v in bouts.items()}


def fetch(name: str) -> str:
    with urllib.request.urlopen(REPO.format(name=name), timeout=60) as r:
        return r.read().decode("utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--events", help="local ufc_event_details.csv (default: download)")
    ap.add_argument("--results", help="local ufc_fight_results.csv (default: download)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    events = Path(args.events).read_text(encoding="utf-8") if args.events else fetch("ufc_event_details")
    results = Path(args.results).read_text(encoding="utf-8") if args.results else fetch("ufc_fight_results")
    stats_as_of = json.loads((DATA / "ufc-stats" / "names.json").read_text()).get("asOf")
    out = build(load_bouts(DATA / "ufc-stats"), index_export(events, results), stats_as_of)
    # Never replace a good file with a bad download: refuse a result that labels far fewer bouts than before.
    path = Path(args.out)
    if path.exists():
        before = json.loads(path.read_text()).get("coverage", {}).get("labelled", 0)
        if before and out["coverage"]["labelled"] < before * 0.9:
            print(f"refusing to write: labelled bouts fell from {before} to {out['coverage']['labelled']}")
            return 1
    text = json.dumps(out, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    if not path.exists() or path.read_text() != text:
        path.write_text(text)
    c = out["coverage"]
    print(f"{c['labelled']} of {c['bouts']} bouts labelled ({(c['share'] or 0) * 100:.1f}%), {len(out['fighters'])} fighters with a division")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
