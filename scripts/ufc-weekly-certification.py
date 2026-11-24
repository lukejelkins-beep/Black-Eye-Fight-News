#!/usr/bin/env python3
"""Weekly UFC certification (owner standing rule, 24 Nov 2026: data/ufc-standing-certification-approval.json).

Run after the free UFCStats export refreshes (Sundays). Two jobs, both fail closed:

1. Newcomers. Any fighter with a BEFN UFC profile (data/ufc-stats/fighters/<slug>.json) who is in neither the frozen
   783 cohort nor the 24 Nov extension cohort joins the rolling cohort (data/ufc-rolling-certification.json, members).
   A member without a certificate gets a register entry proposed exactly as the extension did
   (scripts/build-ufc-register-from-ufcstats.py: the complete UFCStats list reconciled one to one with saved history),
   with every fight saved UFCalendar history lacks confirmed by the event's Wikipedia article. The strict gate in
   scripts/ufc-rolling-certification-audit.mjs then decides.

2. Roll forward. For every certified fighter whose profile holds fights after their certificate's cutoff, each new
   fight must match a UFCStats bout (same day within one, same opponent, same result) AND the event's Wikipedia
   article, and UFCStats must list no other bout for the fighter in that window. Then the cutoff moves to this run's
   evidence cutoff and the new bouts are recorded (careers.<slug>.added). Otherwise the old certificate stands and the
   profile shows the newer fights as "N newer"; the reason is recorded under pending.

The evidence cutoff is the latest UFC event in the UFCStats export, never later than today, so "no other bout in the
window" is only claimed for days the export covers. Writes only the register (new rolling entries) and the rolling
state file. Network: the UFCStats CSVs must already be downloaded (GRECO_DIR); Wikipedia is read live.

  GRECO_DIR=/path/to/csvs python3 scripts/ufc-weekly-certification.py [--cutoff YYYY-MM-DD] [--today YYYY-MM-DD]
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ufcstats_greco import Greco  # noqa: E402
import ufc_wikipedia_check as WIKI  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
STATE = DATA / "ufc-rolling-certification.json"
REGISTER = DATA / "ufc-independent-full-career-verification.json"
OUTCOME = {"W": "win", "L": "loss", "D": "draw", "NC": "no_contest"}


def _builder():
    spec = importlib.util.spec_from_file_location("befn_register_builder", ROOT / "scripts" / "build-ufc-register-from-ufcstats.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load(path, default=None):
    return json.loads(Path(path).read_text(encoding="utf-8")) if Path(path).exists() else default


def dump(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def evidence_cutoff(greco: Greco, today: str) -> str:
    return max(d for d in greco.event_date.values() if d <= today)


def certified_bases(careers_file: dict, register: dict, state: dict) -> dict:
    """certified slug -> {base, baseThrough, baseCount, statsSlug}: the current certificate each fighter rolls from."""
    out = {}
    stats_of = {cert: stats for stats, cert in (careers_file.get("statsAliases") or {}).items()}
    for slug, n in (careers_file.get("certified") or {}).items():
        out[slug] = {"base": "ufc-36-month-roster", "baseThrough": careers_file["certifiedThrough"], "baseCount": n,
                     "statsSlug": stats_of.get(slug, slug)}
    ext = careers_file.get("extension") or {}
    for slug, n in (ext.get("certified") or {}).items():
        out[slug] = {"base": ext["cohort"], "baseThrough": ext["certifiedThrough"], "baseCount": n, "statsSlug": slug}
    for slug, c in (state.get("careers") or {}).items():
        if c.get("base") == "ufc-rolling":
            out[slug] = {"base": "ufc-rolling", "baseThrough": c["baseThrough"], "baseCount": c["baseCount"],
                         "statsSlug": slug}
    return out


def roll_forward(slug, base, current, stats_file, greco_rows, wiki, B, cutoff, today):
    """(new careers entry, None) or (None, reason). current = existing careers entry or None."""
    through = (current or {}).get("through") or base["baseThrough"]
    if through >= cutoff:
        return None, None
    new = [f for f in stats_file.get("fights") or []
           if through < f["date"] <= cutoff and not B.FEEDER.search(str(f.get("event") or ""))]
    if not new:
        return None, None
    window = [r for r in greco_rows if through < r["date"] <= cutoff]
    used, added = set(), []
    for f in sorted(new, key=lambda x: x["date"]):
        result = OUTCOME[f["outcome"]]
        i = next((i for i, r in enumerate(window) if i not in used and r["result"] == result
                  and B.days(r["date"], f["date"]) <= 1 and B.opp_match(r["opponent"], f["opponent"])), None)
        if i is None:
            return None, f"UFCStats does not list {f['date']} {f['opponent']} ({result}) yet"
        used.add(i)
        found, why = wiki.confirm(stats_file["name"], f["opponent"], f["date"], result)
        if not found:
            return None, f"not confirmed by Wikipedia: {why}"
        r = window[i]
        bout = {"date": f["date"], "opponent": f["opponent"], "result": result, "fightUrl": r["fightUrl"],
                "sourceMethod": r["method"], **WIKI.evidence(found, today)}
        if r["date"] != f["date"]:
            bout["independentEventSourceDate"] = r["date"]
        if r["opponent"] != f["opponent"]:
            bout["sourceOpponentName"] = r["opponent"]
        added.append(bout)
    extra = [r for i, r in enumerate(window) if i not in used]
    if extra:
        return None, "UFCStats lists a bout the profile lacks: " + "; ".join(f"{r['date']} {r['opponent']}" for r in extra)
    prev = list((current or {}).get("added") or [])
    return {"base": base["base"], "baseThrough": base["baseThrough"], "baseCount": base["baseCount"],
            "through": cutoff, "added": prev + added}, None


def run(today: str, cutoff: str | None = None, greco: Greco | None = None, wiki=None, write=True) -> dict:
    B = _builder()
    greco = greco or Greco()
    wiki = wiki or WIKI.Wikipedia()
    cutoff = cutoff or evidence_cutoff(greco, today)
    state = load(STATE)
    register = load(REGISTER)
    careers_file = load(DATA / "ufc-v4-certified-careers.json")
    frozen = set(load(DATA / "ufc-36-month-roster-approval.json")["approvedFighters"])
    extension = set(load(DATA / "ufc-extension-cohort-approval-20261124.json")["approvedFighters"])
    stats_dir = DATA / "ufc-stats" / "fighters"
    stats = {p.stem: load(p) for p in sorted(stats_dir.glob("*.json"))}
    research = (load(DATA / "ufcalendar-fighter-research.json", {}) or {}).get("profiles") or {}
    curated = (load(DATA / "ufc-feeder-bout-evidence.json", {}) or {}).get("bouts") or []
    fdates = B.feeder_dates()
    showcases = {x["fightUrl"]: {k: v for k, v in x.items() if k != "opponent"}
                 for e in register["fighters"].values() for x in e.get("officialShowcaseBouts") or []
                 if x.get("independentlyOfficial") is True and x.get("fightUrl")}
    aliases = set((careers_file.get("statsAliases") or {}))
    report = {"cutoff": cutoff, "newMembers": [], "newlyCertified": [], "rolledForward": [], "pending": {}}

    # 1. newcomers join the rolling cohort (standing approval)
    for slug in stats:
        if slug in frozen or slug in extension or slug in aliases or slug in state["members"]:
            continue
        state["members"][slug] = {"addedOn": today, "name": stats[slug]["name"]}
        report["newMembers"].append(slug)

    # ... and get a certificate when the strict reconciliation and the Wikipedia check pass
    for slug in sorted(state["members"]):
        if slug in register["fighters"] or slug not in stats:
            continue
        res, why = B.reconcile(slug, research.get(slug) or {}, stats[slug]["name"], greco, cutoff, fdates, curated,
                               showcases, wiki, today)
        if res is None:
            state["pending"][slug] = {"since": state["pending"].get(slug, {}).get("since", today), "reason": why}
            continue
        res.pop("late")
        own = res.pop("officialShowcaseBouts")
        entry = {"fighterName": stats[slug]["name"], "scope": "complete_official_ufc_career",
                 "sourceCoverageAttested": True, "verificationMethod": "full_official_ufc_fight_listing_crosscheck",
                 "verifiedAt": today, "evidenceCutoff": cutoff, "cohort": "ufc-rolling", "fighterUrl": res["fighterUrl"],
                 "sourceSnapshot": {**greco.snapshot(), "evidenceCutoff": cutoff},
                 "sourceNotes": "Weekly certification (owner standing rule, 24 Nov 2026): complete UFCStats fight list "
                                "reconciled one to one with saved UFC history; every fight saved UFCalendar history "
                                "lacks is confirmed by the event's Wikipedia article. Built by "
                                "scripts/ufc-weekly-certification.py.",
                 "bouts": res["bouts"]}
        if own:
            entry["officialShowcaseBouts"] = own
        register["fighters"][slug] = entry
        state["careers"][slug] = {"base": "ufc-rolling", "baseThrough": cutoff, "baseCount": len(res["bouts"]),
                                  "through": cutoff, "added": []}
        state["pending"].pop(slug, None)
        report["newlyCertified"].append(slug)

    # 2. roll certified careers forward
    for slug, base in sorted(certified_bases(careers_file, register, state).items()):
        file = stats.get(base["statsSlug"])
        if not file:
            continue
        current = state["careers"].get(slug)
        if current and current.get("base") != base["base"]:
            current = None   # a stale entry from another base never carries over
        rows, why = B.propose(base["statsSlug"], file["name"], greco, cutoff, showcases)
        if rows is None:
            if any(f["date"] > ((current or {}).get("through") or base["baseThrough"]) for f in file.get("fights") or []):
                state["pending"][slug] = {"since": state["pending"].get(slug, {}).get("since", today), "reason": why}
            continue
        entry, why = roll_forward(slug, base, current, file, rows, wiki, B, cutoff, today)
        if why:
            state["pending"][slug] = {"since": state["pending"].get(slug, {}).get("since", today), "reason": why}
        elif entry:
            state["careers"][slug] = entry
            state["pending"].pop(slug, None)
            report["rolledForward"].append(slug)

    state["lastRun"], state["evidenceCutoff"] = today, cutoff
    state["members"] = dict(sorted(state["members"].items()))
    state["careers"] = dict(sorted(state["careers"].items()))
    state["pending"] = dict(sorted(state["pending"].items()))
    report["pending"] = state["pending"]
    if write:
        dump(STATE, state)
        dump(REGISTER, register)
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", default=dt.date.today().isoformat())
    ap.add_argument("--cutoff", default=None)
    ap.add_argument("--report", default=None)
    a = ap.parse_args()
    report = run(a.today, a.cutoff)
    lines = [f"Evidence cutoff {report['cutoff']}",
             f"New rolling-cohort members: {len(report['newMembers'])} {report['newMembers']}",
             f"Newly certified: {len(report['newlyCertified'])} {report['newlyCertified']}",
             f"Rolled forward: {len(report['rolledForward'])}",
             f"Pending (not certified / not rolled forward): {len(report['pending'])}"]
    lines += [f"  {s}: {p['reason']}" for s, p in report["pending"].items()]
    print("\n".join(lines))
    if a.report:
        Path(a.report).write_text(json.dumps(report, indent=1) + "\n" + "\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
