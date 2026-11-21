#!/usr/bin/env python3
"""Build data/ufc-card-scores.json: last-five attribute scores for bouts on announced UFC cards.

Phase 3, step 3 (docs/design/PHASE-3.md, SNAPSHOT-METHOD.md). Offline and read-only. The site shows these ONLY behind a
feature flag that is off by default; switching scores on is the owner's separate approval (release tracker #171, R4).

Inputs
  data/ufc-card-snapshots.json        which fighters and bouts are on announced UFC cards (step 1)
  data/ufc-stats/fighters/*.json      each fighter's last-five window; the whole roster forms the ranking population
  data/ufc-bout-weight-classes.json   each fighter's division and whether they are new to it (step 1b)

Rule for a bout: when both fighters are in the same division and both have a division percentile for an attribute,
the bout is ranked against that division; otherwise against the whole roster (a division percentile for one fighter
against a roster percentile for the other would not be comparable). The basis is stored per bout and shown to readers.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ufc_snapshot_scores as sc  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "ufc-card-scores.json"


def build(snapshots: dict, names: dict, windows: dict, divisions: dict, stats_as_of=None) -> dict:
    """snapshots: data/ufc-card-snapshots.json; names: name key -> slug; windows: slug -> last-five window;
    divisions: slug -> {"division", "newToDivision", "previousDivision"} (step 1b fighters block)."""
    pop = sc.score_population(windows, {s: (d or {}).get("division") for s, d in divisions.items()} | {s: None for s in windows if s not in divisions})
    peers = pop.pop("_peers")
    fighters = {}
    for key, f in snapshots.get("fighters", {}).items():
        slug = names.get(key)
        info = divisions.get(slug) if slug else None
        w = windows.get(slug) if slug else None
        status = "scored" if slug in pop else ("limited" if w and (w.get("statFights") or 0) >= 1 else "none")
        fighters[key] = {"name": f.get("name"), "slug": slug, "status": status, "statFights": (w or {}).get("statFights", 0),
                         "division": (info or {}).get("division"), "newToDivision": bool((info or {}).get("newToDivision")),
                         "previousDivision": (info or {}).get("previousDivision")}
    events = []
    for e in snapshots.get("events", []):
        bouts = []
        for b in e.get("bouts", []):
            sides = [fighters.get(k) for k in b["fighters"]]
            slugs = [s["slug"] if s else None for s in sides]
            same = (all(s and s["division"] for s in sides) and sides[0]["division"] == sides[1]["division"])
            entry = {"id": b.get("id"), "fighters": b["fighters"], "division": sides[0]["division"] if same else None, "scores": []}
            for slug in slugs:
                entry["scores"].append({a: (pop.get(slug, {}).get(a) if slug else None) for a in sc.ATTRIBUTES})
            for a in sc.ATTRIBUTES:
                both_division = same and all(r[a] and r[a]["division"] is not None for r in entry["scores"])
                basis = "division" if both_division else "roster"
                for r in entry["scores"]:
                    v = r[a]["division" if both_division else "roster"] if r[a] else None
                    r[a] = {"score": v, "band": sc.band(v)} if v is not None else None
                entry.setdefault("basis", {})[a] = basis
            bouts.append(entry)
        events.append({"id": e["id"], "bouts": bouts})
    return {"schema": 1, "window": "last5", "method": "docs/design/SNAPSHOT-METHOD.md", "statsAsOf": stats_as_of,
            "population": {a: peers[a]["roster"] for a in sc.ATTRIBUTES},
            "minimums": {"statFights": sc.MIN_STAT_FIGHTS, "roster": sc.MIN_ROSTER, "divisionPeers": sc.MIN_DIVISION_PEERS},
            "fighters": dict(sorted(fighters.items())), "events": events}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    snapshots = json.loads((DATA / "ufc-card-snapshots.json").read_text())
    index = json.loads((DATA / "ufc-stats" / "names.json").read_text())
    wc = json.loads((DATA / "ufc-bout-weight-classes.json").read_text())
    windows = {}
    for path in sorted((DATA / "ufc-stats" / "fighters").glob("*.json")):
        d = json.loads(path.read_text())
        w = (d.get("windows") or {}).get("last5")
        if w:
            windows[d["slug"]] = w
    out = build(snapshots, index.get("names", {}), windows, wc.get("fighters", {}), index.get("asOf"))
    text = json.dumps(out, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    path = Path(args.out)
    if not path.exists() or path.read_text() != text:
        path.write_text(text)
    c = {s: sum(1 for f in out["fighters"].values() if f["status"] == s) for s in ("scored", "limited", "none")}
    print(f"{len(out['events'])} cards, {len(out['fighters'])} fighters: {c['scored']} scored, {c['limited']} limited, {c['none']} none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
