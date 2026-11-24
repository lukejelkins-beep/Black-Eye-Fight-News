#!/usr/bin/env python3
"""Propose independent career register entries from the free UFCStats export (research step, offline).

For each requested fighter it takes the complete UFCStats fight list (Greco1899/scrape_ufc_stats CSVs, see
scripts/ufcstats_greco.py) up to the evidence cutoff and reconciles it one to one with BEFN's saved UFC history:

  * saved history = the UFCalendar research rows (data/ufcalendar-fighter-research.json) tagged UFC with a result,
    minus feeder rows (a date whose cached UFC events are all Contender Series / Road to UFC, or a curated feeder row
    in data/ufc-feeder-bout-evidence.json), PLUS the fighter's stats-file fights (data/ufc-stats/fighters/<slug>.json,
    from the free results importer) dated after the research snapshot, so a debut after that day is not missed;
  * a UFCStats bout matches a saved row on result, date within a day and the opponent's name (or a reviewed alias);
  * a UFCStats no-contest or draw that saved history lacks becomes a savedHistoryGap bout (owner rule, 17 Nov);
  * any other unmatched bout on either side, a name UFCStats gives to two fighters, or no UFCStats fighter page
    stops the proposal. Nothing is guessed and no round statistic is written.

The proposal is NOT a certificate. The strict gate (scripts/ufc-36-month-stage3-progress.mjs for the frozen 783,
scripts/ufc-extension-stage3-audit.mjs for the owner-approved extension cohort) decides.

  GRECO_DIR=/path/to/csvs python3 scripts/build-ufc-register-from-ufcstats.py --cutoff 2026-11-24 \
      --cohort ufc-extension-20261124 --slugs a,b,c [--write]
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ufcstats_greco import Greco, fold, same_name  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REGISTER = DATA / "ufc-independent-full-career-verification.json"
FEEDER = __import__("re").compile(r"contender\s+series|road\s+to\s+ufc|\bdwcs\b", __import__("re").I)
OUTCOME = {"W": "win", "L": "loss", "D": "draw", "NC": "no_contest"}

# Reviewed name differences between BEFN and UFCStats (checked against the fight lists, 24 Nov 2026).
# slug -> (UFCStats name(s), weight-class filter or None). A shared name must carry a weight-class filter.
UFCSTATS_NAMES = {
    "alexander-romanov": (["Alexandr Romanov"], None),
    "ariane-lipski-da-silva": (["Ariane da Silva"], None),
    "josefine-lindgren-knutsson": (["Josefine Knutsson"], None),
    "rafael-cerqueira": (["Rafael Cerqueira", "Rafael Cerquiera"], None),
    "bruno-silva-blindado": (["Bruno Silva"], "Middleweight"),
    "waldo-cortes-acosta-2": (["Waldo Cortes Acosta"], None),
}
# Opponent spellings that differ between UFCStats and saved history (UFCStats -> saved), reviewed one by one.
OPPONENT_ALIASES = {
    ("Aleksei Kunchenko", "Alexey Kunchenko"), ("Alexandr Romanov", "Alexander Romanov"),
    ("Marcus Buchecha", "Marcus Almeida"), ("Ariane da Silva", "Ariane Lipski da Silva"),
    ("Josefine Knutsson", "Josefine Lindgren Knutsson"), ("Rafael Cerquiera", "Rafael Cerqueira"),
}


def load(path, default=None):
    return json.loads(Path(path).read_text(encoding="utf-8")) if Path(path).exists() else default


def days(a, b):
    return abs((date.fromisoformat(a) - date.fromisoformat(b)).days)


def opp_match(source, saved):
    return same_name(source, saved) or (source, saved) in OPPONENT_ALIASES


def feeder_dates():
    titles = {}
    for b in (load(DATA / "ufcalendar-rich-progress.json", {}) or {}).get("bouts", {}).values():
        if b.get("org") == "ufc" and b.get("eventDate") and b.get("event"):
            titles.setdefault(b["eventDate"], set()).add(b["event"])
    return {d for d, t in titles.items() if t and all(FEEDER.search(x) for x in t)}


def saved_history(slug, profile, cutoff, fdates, curated, showcase_ids=frozenset()):
    rows, seen = [], set()
    for r in profile.get("recentHistory") or []:
        if str(r.get("promotion") or "").lower() != "ufc" or r.get("result") not in OUTCOME.values():
            continue
        d = r.get("date")
        if not d or d > cutoff or (d in fdates and str(r.get("boutId")) not in showcase_ids):
            continue
        if any(c.get("fighterSlug") == slug and str(c.get("boutId")) == str(r.get("boutId")) and c.get("date") == d
               for c in curated):
            continue
        key = str(r.get("boutId")) if r.get("source") == "native" and r.get("boutId") else d + "|" + fold(r["opponent"])
        if key in seen:
            continue
        seen.add(key)
        rows.append({"date": d, "opponent": r["opponent"], "result": r["result"], "from": "research"})
    observed = profile.get("observedOn") or "0000-00-00"
    stats = load(DATA / "ufc-stats" / "fighters" / f"{slug}.json", {}) or {}
    for f in stats.get("fights") or []:
        if observed < f["date"] <= cutoff and not FEEDER.search(str(f.get("event") or "")) and not any(
                days(f["date"], r["date"]) <= 1 and same_name(f["opponent"], r["opponent"]) for r in rows):
            rows.append({"date": f["date"], "opponent": f["opponent"], "result": OUTCOME[f["outcome"]],
                         "from": "results-importer"})
    return sorted(rows, key=lambda r: r["date"])


# Reviewed fighter pages for names UFCStats gives to two fighters (the weight-class filter separates their bouts).
UFCSTATS_PAGE = {"bruno-silva-blindado": "https://ufcstats.com/fighter-details/12ebd7d157e91701"}


def propose(slug, name, greco, cutoff, showcases=None):
    """(UFCStats bouts to cutoff, fighter page) or (None, reason)."""
    names, weight = UFCSTATS_NAMES.get(slug, ([name], None))
    urls = sorted({p["url"] for n in names for p in greco.fighter_urls.get(fold(n), [])})
    if len(urls) > 1:
        if not (weight and UFCSTATS_PAGE.get(slug) in urls):
            return None, f"name shared by {len(urls)} UFCStats fighters: {names}"
        url = UFCSTATS_PAGE[slug]
    elif len(urls) == 1:
        url = urls[0]
    else:
        return None, f"no UFCStats fighter page for {names}"
    showcases = showcases or {}
    # An attested showcase on a feeder card the export leaves undated takes the date of its attestation.
    rows = [({**r, "date": showcases[r["fightUrl"]]["date"]} if r["fightUrl"] in showcases and not r["date"] else r)
            for n in names for r in greco.fights.get(fold(n), [])]
    rows = sorted((r for r in rows
                   if r["date"] and r["date"] <= cutoff and (not r["feeder"] or r["fightUrl"] in showcases)
                   and (weight is None or weight.lower() in r["weightclass"].lower())), key=lambda r: r["date"])
    return rows, url


def reconcile(slug, profile, stats_name, greco, cutoff, fdates, curated, showcases=None):
    showcases = showcases or {}
    rows, url = propose(slug, stats_name, greco, cutoff, showcases)
    if rows is None:
        return None, url
    saved = saved_history(slug, profile, cutoff, fdates, curated,
                          frozenset(str(x["nativeBoutId"]) for x in showcases.values()))
    used, bouts = set(), []
    for r in rows:
        i = next((i for i, s in enumerate(saved) if i not in used and s["result"] == r["result"]
                  and days(s["date"], r["date"]) <= 1 and opp_match(r["opponent"], s["opponent"])), None)
        if i is None:
            if r["result"] in ("no_contest", "draw"):
                bouts.append({"date": r["date"], "opponent": r["opponent"], "result": r["result"],
                              "fightUrl": r["fightUrl"], "savedHistoryGap": True})
                continue
            return None, f"UFCStats bout not in saved history: {r['date']} {r['opponent']} {r['result']}"
        used.add(i)
        s = saved[i]
        b = {"date": s["date"], "opponent": s["opponent"], "result": r["result"], "fightUrl": r["fightUrl"]}
        if s["date"] != r["date"]:
            b["independentEventSourceDate"] = r["date"]
        if s["opponent"] != r["opponent"]:
            b["sourceOpponentName"] = r["opponent"]
        bouts.append(b)
    extra = [s for i, s in enumerate(saved) if i not in used]
    if extra:
        return None, "saved UFC bouts not in UFCStats: " + "; ".join(f"{s['date']} {s['opponent']}" for s in extra)
    if not bouts:
        return None, "no UFC bouts"
    own = [{**showcases[r["fightUrl"]], "opponent": r["opponent"],
            "note": "The same bout, bout ID and sources as the attestation on the opponent's register entry; scoped to "
                    "this bout only, no blanket Road to UFC inclusion."} for r in rows if r["feeder"]]
    return {"bouts": bouts, "fighterUrl": url, "officialShowcaseBouts": own,
            "late": [s for s in saved if s["from"] == "results-importer"]}, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", required=True)
    ap.add_argument("--cutoff", required=True)
    ap.add_argument("--cohort", required=True)
    ap.add_argument("--verified-at", default=None)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--report", default=None)
    a = ap.parse_args()
    greco = Greco()
    snapshot = greco.snapshot()
    research = (load(DATA / "ufcalendar-fighter-research.json", {}) or {}).get("profiles") or {}
    curated = (load(DATA / "ufc-feeder-bout-evidence.json", {}) or {}).get("bouts") or []
    fdates = feeder_dates()
    # Official UFC showcase bouts on feeder-labelled cards, attested bout by bout in the register (by UFCStats link).
    showcases = {x["fightUrl"]: {k: v for k, v in x.items() if k != "opponent"}
                 for e in load(REGISTER)["fighters"].values() for x in e.get("officialShowcaseBouts") or []
                 if x.get("independentlyOfficial") is True and x.get("fightUrl")}
    reg = load(REGISTER)
    out, failed = {}, {}
    for slug in [s for s in a.slugs.split(",") if s]:
        stats = load(DATA / "ufc-stats" / "fighters" / f"{slug}.json", {}) or {}
        name = stats.get("name") or (research.get(slug) or {}).get("name")
        if slug not in research or not name:
            failed[slug] = "no saved research history"
            continue
        if slug in reg["fighters"]:
            failed[slug] = "already in the register"
            continue
        res, why = reconcile(slug, research[slug], name, greco, a.cutoff, fdates, curated, showcases)
        if res is None:
            failed[slug] = why
            continue
        late = res.pop("late")
        own_showcases = res.pop("officialShowcaseBouts")
        n = len(res["bouts"])
        out[slug] = {
            "fighterName": name, "scope": "complete_official_ufc_career", "sourceCoverageAttested": True,
            "verificationMethod": "full_official_ufc_fight_listing_crosscheck",
            "verifiedAt": a.verified_at or a.cutoff, "evidenceCutoff": a.cutoff, "cohort": a.cohort,
            "fighterUrl": res["fighterUrl"],
            "sourceSnapshot": {**snapshot, "evidenceCutoff": a.cutoff},
            "sourceNotes": (f"Complete UFCStats fighter fight list ({n} UFC bouts to {a.cutoff}) from the free UFCStats "
                            "export (Greco1899/scrape_ufc_stats), reconciled one-to-one to saved UFC history (UFCalendar "
                            "research rows" + (", plus the free results importer for fights after that snapshot"
                                               if late else "") +
                            ") by opponent, result and date within a day; saved date and name kept, the source's in "
                            "independentEventSourceDate / sourceOpponentName. A no-contest or draw saved history lacks "
                            "is a savedHistoryGap bout. Contender Series and Road to UFC qualifier rows excluded. "
                            "Built by scripts/build-ufc-register-from-ufcstats.py."),
            "bouts": res["bouts"],
        }
        if own_showcases:
            out[slug]["officialShowcaseBouts"] = own_showcases
    print(f"proposed {len(out)}, not proposed {len(failed)}")
    for s, why in sorted(failed.items()):
        print(f"  {s}: {why}")
    if a.report:
        Path(a.report).write_text(json.dumps({"proposed": sorted(out), "failed": failed}, indent=1) + "\n")
    if a.write and out:
        reg["fighters"].update(out)
        REGISTER.write_text(json.dumps(reg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {len(out)} entries to {REGISTER.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
