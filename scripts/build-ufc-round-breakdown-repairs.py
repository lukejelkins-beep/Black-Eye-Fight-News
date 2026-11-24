#!/usr/bin/env python3
"""Build data/ufc-round-breakdown-repairs.json: correct head/body/leg and distance/clinch/ground figures for the rounds
whose archived figures do not add up.

Why: in about one round in five (3,448 of the rounds checked) the archive's head+body+leg and distance+clinch+ground
figures do not equal the strikes landed. In every such round the strikes landed and attempted ARE right (they match the
free UFCStats export), so only the breakdown parts are wrong. This file holds UFCStats' parts for those rounds.

Source: the free UFCStats.com round-by-round export in the Greco1899/scrape_ufc_stats CSV export (ufc_fight_stats.csv with
ufc_event_details.csv for dates). No key, no quota, no paid worker; the same export the tape builder reads. Only the
twelve breakdown figures of a round are kept, never the export itself.

Rules (a repair is written only when ALL hold)
  * the stats build's own figures for that fighter and round have parts that do not add up to the strikes landed;
  * the export names the same fighter, the same opponent, the same round, on the same day (one day either way);
  * the export's strikes landed and attempted equal the archive's, so it is the same round;
  * the export's own parts add up (landed and attempted, both breakdowns).
Anything else is left as it is and stays hidden by the stats build. Output is deterministic (sorted, no timestamps).

Run: python3 scripts/build-ufc-round-breakdown-repairs.py [--csv-dir DIR]   (downloads the two CSV files otherwise)
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import importlib.util
import io
import json
import re
import tempfile
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "ufc-round-breakdown-repairs.json"
BASE = "https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/"
SOURCE = "UFCStats.com via the Greco1899/scrape_ufc_stats CSV export"
COLUMNS = (("HEAD", "head"), ("BODY", "body"), ("LEG", "leg"),
           ("DISTANCE", "distance"), ("CLINCH", "clinch"), ("GROUND", "ground"))


def norm(text) -> str:
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", text)


def of(value):
    m = re.match(r"^\s*(\d+) of (\d+)", value or "")
    return (int(m.group(1)), int(m.group(2))) if m else (None, None)


def load_stats_module():
    spec = importlib.util.spec_from_file_location("ufc_stats_build", ROOT / "scripts/build-ufc-stats.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def export_rounds(stats_csv: str, events_csv: str) -> dict:
    """(fighter, opponent, date, round) -> {sig: (l, a), head: (l, a), ...}"""
    dates = {}
    for row in csv.DictReader(io.StringIO(events_csv)):
        try:
            dates[row["EVENT"].strip()] = dt.datetime.strptime(row["DATE"].strip(), "%B %d, %Y").date().isoformat()
        except (ValueError, KeyError):
            continue
    out = {}
    for row in csv.DictReader(io.StringIO(stats_csv)):
        day = dates.get(row["EVENT"].strip())
        names = [n.strip() for n in re.split(r"\s+vs\.?\s+", row["BOUT"])]
        if not day or len(names) != 2:
            continue
        me = norm(row["FIGHTER"])
        opp = norm(names[1] if norm(names[0]) == me else names[0])
        try:
            rd = int(row["ROUND"].split()[-1])
        except (ValueError, IndexError):
            continue
        rec = {"sig": of(row["SIG.STR."])}
        for col, key in COLUMNS:
            rec[key] = of(row[col])
        out[(me, opp, day, rd)] = rec
    return out


def adds_up(rec: dict) -> bool:
    sl, sa = rec["sig"]
    if sl is None or sa is None:
        return False
    for group in (("head", "body", "leg"), ("distance", "clinch", "ground")):
        vals = [rec[k] for k in group]
        if any(v[0] is None or v[1] is None for v in vals):
            return False
        if sum(v[0] for v in vals) != sl or sum(v[1] for v in vals) != sa:
            return False
    return True


def find(rounds: dict, me, opp, day, rd):
    base = dt.date.fromisoformat(day)
    hits = [rounds[k] for d in (0, 1, -1)
            if (k := (me, opp, (base + dt.timedelta(days=d)).isoformat(), rd)) in rounds]
    return hits[0] if len(hits) == 1 else None   # none, or ambiguous: leave alone


def build(stats_dir: Path, rounds: dict, fields: tuple) -> dict:
    repairs, counts = {}, {"inconsistent": 0, "repaired": 0}
    for path in sorted((stats_dir / "fighters").glob("*.json")):
        d = json.loads(path.read_text(encoding="utf-8"))
        idx = {k: i for i, k in enumerate(d["roundFields"])}
        me = norm(d["name"])
        for fight in d["fights"]:
            for r in fight.get("rounds") or []:
                own = r[2]
                g = lambda k: own[idx[k]]
                trip = [[g(k + "Landed") for k in grp] for grp in (("head", "body", "leg"), ("distance", "clinch", "ground"))]
                sig = g("sigLanded")
                bad = sig is not None and any(all(isinstance(x, int) for x in t) and sum(t) != sig for t in trip)
                if not bad:
                    continue
                counts["inconsistent"] += 1
                rec = find(rounds, me, norm(fight["opponent"]), fight["date"], r[0])
                if rec is None or not adds_up(rec) or rec["sig"] != (sig, g("sigAttempted")):
                    continue
                vals = []
                for key in ("head", "body", "leg", "distance", "clinch", "ground"):
                    vals += [rec[key][0], rec[key][1]]
                repairs.setdefault(d["slug"], {}).setdefault(str(fight["boutId"]), {})[str(r[0])] = vals
                counts["repaired"] += 1
    return {"schema": 1, "source": SOURCE,
            "note": ("Head/body/leg and distance/clinch/ground figures (landed, attempted each) for rounds whose archived "
                     "parts did not add up to the strikes landed. Field order: " + ", ".join(fields) + ". Applied by "
                     "scripts/build-ufc-stats.py; rebuild with scripts/build-ufc-round-breakdown-repairs.py."),
            "coverage": counts,
            "repairs": {s: {b: dict(sorted(rr.items(), key=lambda x: int(x[0]))) for b, rr in sorted(bb.items())}
                        for s, bb in sorted(repairs.items())}}


def fetch(name: str, csv_dir: str | None) -> str:
    if csv_dir:
        return (Path(csv_dir) / name).read_text(encoding="utf-8")
    with urllib.request.urlopen(BASE + name, timeout=120) as r:
        return r.read().decode("utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--csv-dir", help="folder holding ufc_fight_stats.csv and ufc_event_details.csv (default: download)")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    mod = load_stats_module()
    as_of = dt.date.fromisoformat(json.loads((DATA / "ufc-stats" / "index.json").read_text())["asOf"])
    rounds = export_rounds(fetch("ufc_fight_stats.csv", args.csv_dir), fetch("ufc_event_details.csv", args.csv_dir))
    with tempfile.TemporaryDirectory() as tmp:   # the stats as the archive holds them, before any repair
        mod.build(as_of, Path(tmp), None, repairs=False)
        result = build(Path(tmp), rounds, mod.REPAIR_FIELDS)
    text = json.dumps(result, separators=(",", ":"), ensure_ascii=False) + "\n"
    path = Path(args.out)
    if not path.exists() or path.read_text() != text:
        path.write_text(text)
    c = result["coverage"]
    print(f"{c['repaired']} of {c['inconsistent']} inconsistent rounds repaired from the UFCStats export")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
