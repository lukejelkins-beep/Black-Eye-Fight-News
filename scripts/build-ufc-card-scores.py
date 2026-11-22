#!/usr/bin/env python3
"""Build data/ufc-card-scores.json: last-five attribute scores for bouts on announced UFC cards.

Phase 3, step 3 (docs/design/PHASE-3.md, SNAPSHOT-METHOD.md). Offline and read-only. The site shows these ONLY behind a
feature flag that is off by default; switching scores on is the owner's separate approval (release tracker #171, R4).

Inputs
  data/ufc-card-snapshots.json        which fighters and bouts are on announced UFC cards (step 1)
  data/ufc-stats/fighters/*.json      each fighter's last-five window and resolved division; the whole roster
                                      forms the ranking population
  data/ufc-bout-weight-classes.json   whether a fighter is new to the division of their latest bout (step 1b)

Divisions come from the stats build (scripts/build-ufc-stats.py `resolve_division`: official roster first, then the
fighter's latest labelled bout), read back from the per-fighter files rather than resolved again here, so the scores
and the rest of the site cannot place a fighter in two different divisions.

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


def fighter_division(stats_file: dict, weight_class: dict) -> dict:
    """The division the stats build resolved for this fighter, plus the step 1b "new to the division" note.

    The note describes a move between the fighter's own bouts, so it is kept only when the resolved division is the
    division of that latest bout. A ranked light heavyweight whose last bout was at heavyweight stays a light
    heavyweight here and reports the one-off through `latestBoutDivision`, rather than claiming to be new to the
    division they are already ranked in."""
    latest = weight_class.get("division")
    agrees = bool(latest) and latest == stats_file.get("division")
    return {"division": stats_file.get("division"), "divisionSlug": stats_file.get("divisionSlug"),
            "divisionSource": stats_file.get("divisionSource"), "latestBoutDivision": latest,
            "newToDivision": bool(weight_class.get("newToDivision")) and agrees,
            "previousDivision": weight_class.get("previousDivision") if agrees else None}


def build(snapshots: dict, names: dict, windows: dict, divisions: dict, stats_as_of=None) -> dict:
    """snapshots: data/ufc-card-snapshots.json; names: name key -> slug; windows: slug -> last-five window;
    divisions: slug -> {"division", "divisionSlug", "divisionSource", "latestBoutDivision", "newToDivision",
    "previousDivision"}: the division the stats build resolved, plus the step 1b move flags."""
    pop = sc.score_population(windows, {s: (divisions.get(s) or {}).get("divisionSlug") for s in windows})
    peers = pop.pop("_peers")
    fighters = {}
    for key, f in snapshots.get("fighters", {}).items():
        slug = names.get(key)
        info = divisions.get(slug) if slug else None
        w = windows.get(slug) if slug else None
        status = "scored" if slug in pop else ("limited" if w and (w.get("statFights") or 0) >= 1 else "none")
        fighters[key] = {"name": f.get("name"), "slug": slug, "status": status, "statFights": (w or {}).get("statFights", 0),
                         "division": (info or {}).get("division"), "divisionSlug": (info or {}).get("divisionSlug"),
                         "divisionSource": (info or {}).get("divisionSource"),
                         "latestBoutDivision": (info or {}).get("latestBoutDivision"),
                         "newToDivision": bool((info or {}).get("newToDivision")),
                         "previousDivision": (info or {}).get("previousDivision")}
    events = []
    for e in snapshots.get("events", []):
        bouts = []
        for b in e.get("bouts", []):
            sides = [fighters.get(k) for k in b["fighters"]]
            slugs = [s["slug"] if s else None for s in sides]
            # Compared by slug, not label: one division must never split into two pools over an apostrophe.
            same = (all(s and s.get("divisionSlug") for s in sides)
                    and sides[0]["divisionSlug"] == sides[1]["divisionSlug"])
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
    wc = json.loads((DATA / "ufc-bout-weight-classes.json").read_text()).get("fighters", {})
    windows, divisions = {}, {}
    for path in sorted((DATA / "ufc-stats" / "fighters").glob("*.json")):
        d = json.loads(path.read_text())
        w = (d.get("windows") or {}).get("last5")
        if w:
            windows[d["slug"]] = w
        divisions[d["slug"]] = fighter_division(d, wc.get(d["slug"]) or {})
    out = build(snapshots, index.get("names", {}), windows, divisions, index.get("asOf"))
    text = json.dumps(out, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    path = Path(args.out)
    if not path.exists() or path.read_text() != text:
        path.write_text(text)
    c = {s: sum(1 for f in out["fighters"].values() if f["status"] == s) for s in ("scored", "limited", "none")}
    print(f"{len(out['events'])} cards, {len(out['fighters'])} fighters: {c['scored']} scored, {c['limited']} limited, {c['none']} none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
