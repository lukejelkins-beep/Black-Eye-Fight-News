#!/usr/bin/env python3
"""Photo runner: find every fighter on the site without an approved photo, try every approved
source for them, stage what is found for a look by eye, and register only what is approved.

    python3 scripts/photo-runner.py missing [--sport boxing|ufc|mma|sumo|all]
    python3 scripts/photo-runner.py fetch   [--sport ...] [--limit N] [--names "A,B"] [--retry]
    python3 scripts/photo-runner.py approve <run-id> (--all | --only "A,B") [--reject "C:reason,D:reason"]
                                            [--owner-cleared] [--no-cutouts]
    python3 scripts/photo-runner.py reject-cutout "<name>:reason" [--sport ...]
    python3 scripts/photo-runner.py drop <folder> --sport ... --credit "..." --attest "owner, YYYY-MM-DD: <wording>"
                                         [--kind fullbody]   (UFC or boxing full-length photos for the champions carousel)
    python3 scripts/photo-runner.py report

It does no fetching or registering of its own: each sport's existing pipeline does that, and this
script only chooses who to look for, runs the pipeline in its staging mode, and later registers
the approved rows exactly as that pipeline would.

  boxing  scripts/boxing-portrait-intake.py --stage   (promoter press kits under the owner's attestations
                                                      of 2026-11-22 and 2026-11-24, then Wikimedia Commons)
  ufc     scripts/pull-ufc-hires-photos.py --work ... fetch --new-fighters  (ESPN headshots, the source of
                                                      the owner-cleared UFC library; apply needs --owner-cleared)
  mma     scripts/mma-portrait-intake.py --stage      (PFL, ONE, KSW, RIZIN, Cage Warriors: owner attestation
                                                      of 2026-11-24)
  sumo    scripts/sumo-portrait-intake.py --stage     (official JSA portraits, owner-attested JSA permission)
  cut-outs scripts/build-boxing-cutouts.py [--sport mma], scripts/build-ufc-cutouts.py, scripts/sumo-cutout.py
  afterwards scripts/build-local-image-map.py and scripts/build-photo-credits.py

`fetch` writes only under qa/photo-runner/staging/<run-id>/ (git-ignored): the crops, a manifest.json
with every register field, and contact.png, a contact sheet with the name under each photograph.
Nothing is registered and nothing under assets/ or data/ changes until `approve`. `approve` writes the
rows, the files, the cut-outs, a second contact sheet of the new cut-outs (cutouts.png), the regenerated
image map and credits page, and keeps both sheets and a summary in qa/photo-runner/reviews/<run-id>/.
A rejected photograph is recorded, with the reason, in the pipeline's own reviewed-out list so it is
not fetched again. See docs/design/IMAGE-GUIDE.md, "Photo runner".
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / "qa/photo-runner"
SPORTS = ("boxing", "ufc", "mma", "sumo")
PY = sys.executable
RANKS = {0: "current champion", 1: "upcoming main event", 2: "on an upcoming card", 3: "recent result", 4: "roster"}
RECENT_DAYS = 120  # a result older than this is "roster", not "recent"
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def paths():
    """Every path the runner touches, from ROOT (tests point ROOT at a copy of the repository)."""
    d = ROOT / "data"
    return {
        "combat": ROOT / "assets/app-inline-1.js", "upcoming": d / "upcoming-cards.json", "results": d / "results.json",
        "form": d / "ufc-fighter-form.json",
        "boxing": d / "boxing-image-register.json", "boxing_cut": d / "boxing-cutout-register.json",
        "ufc": d / "ufc-image-register.json", "ufc_cut": d / "ufc-cutout-register.json",
        "mma": d / "mma-image-register.json", "mma_cut": d / "mma-cutout-register.json",
        "sumo_index": d / "sumo/rikishi-index.json", "sumo_photos": d / "sumo/approved-photos.json",
        "sumo_cut": d / "sumo/cutouts.json", "fullbody_cut": d / "fullbody-cutout-register.json",
        "fullbody_dir": ROOT / "assets/img/fullbody-cutouts",
        "qa": ROOT / "qa/photo-runner", "staging": ROOT / "qa/photo-runner/staging",
        "reviews": ROOT / "qa/photo-runner/reviews", "state": ROOT / "qa/photo-runner/state.json",
    }


def load_script(file):
    spec = importlib.util.spec_from_file_location("befn_" + re.sub(r"\W", "_", file), ROOT / "scripts" / file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Letters NFD does not split into a base letter and an accent (Błachowicz, Syguła, Ødegaard).
TRANSLIT = str.maketrans({"ł": "l", "Ł": "L", "ø": "o", "Ø": "O", "đ": "d", "Đ": "D", "ß": "ss", "æ": "ae", "Æ": "Ae"})


def norm(name):
    s = unicodedata.normalize("NFD", str(name or "").translate(TRANSLIT)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower().replace("’", "'").replace("'", "")).strip()


def fold(name):
    return norm(name).replace(" ", "")


def slugify(name):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", norm(name))).strip("-")


def read_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def today():
    return datetime.now(timezone.utc).date()


# --- who is on the site --------------------------------------------------------------------------

def combat_data(p):
    """window.COMBAT_DATA from assets/app-inline-1.js (its first line is one JSON object)."""
    if not p["combat"].exists():
        return {}
    line = p["combat"].read_text(encoding="utf-8").split("\n", 1)[0].strip()
    return json.loads(line[line.index("=") + 1:].strip().rstrip(";"))


MMA_PROMOTERS = (("pfl", "PFL"), ("one", "ONE Championship"), ("ksw", "KSW"), ("xtb ksw", "KSW"),
                 ("rizin", "RIZIN"), ("cage", "Cage Warriors"))


def mma_promoter(text):
    t = norm(text)
    for key, promoter in MMA_PROMOTERS:
        if t.startswith(key):
            return promoter
    return None


class People:
    """Everyone the site shows for one sport, keyed by folded name, with the best reason they matter."""

    def __init__(self, sport):
        self.sport, self.by = sport, {}

    def add(self, name, rank, why, **extra):
        name = str(name or "").strip()
        if not name or norm(name) in ("tbc", "tba", "vacant"):
            return
        k = fold(name)
        row = self.by.setdefault(k, {"sport": self.sport, "name": name, "rank": rank, "why": []})
        if why not in row["why"]:
            row["why"].append(why)
        if rank < row["rank"]:
            row["rank"], row["name"] = rank, name
        for key, value in extra.items():
            if key == "opponents":
                row.setdefault("opponents", [])
                row["opponents"] += [o for o in value if o not in row["opponents"]]
            elif value and not row.get(key):
                row[key] = value


def upcoming_bouts(p, wanted):
    """(event, bout index, fighters) for upcoming events that `wanted(event)` accepts. The first bout, or
    a bout marked "main", is the main event."""
    doc = read_json(p["upcoming"], {}) or {}
    start = today().isoformat()
    for ev in doc.get("events", []):
        if str(ev.get("date", "")) < start or not wanted(ev):
            continue
        for i, bout in enumerate(ev.get("bouts", [])):
            main = i == 0 or (bout.get("section") == "main" and i == 0)
            yield ev, main, [f for f in bout.get("fighters", []) if isinstance(f, str)]


def results_rows(p, wanted):
    doc = read_json(p["results"], {}) or {}
    for row in doc.get("results", []):
        if wanted(row):
            yield row, [f.get("name") for f in row.get("fighters", []) if isinstance(f, dict)]


def recent(day):
    try:
        return (today() - date.fromisoformat(str(day)[:10])).days <= RECENT_DAYS
    except ValueError:
        return False


def boxing_people(p):
    people, cd = People("boxing"), combat_data(p)
    for div in cd.get("champions", {}).get("boxing", []):
        for belt, holders in (div.get("belts") or {}).items():
            for h in holders or []:
                people.add(h.get("name"), 0, f"{belt} {div.get('division', '').lower()} champion")
    for ev, main, names in upcoming_bouts(p, lambda e: str(e.get("sport", "")).lower() == "boxing"):
        for n in names:
            people.add(n, 1 if main else 2, f"{'main event' if main else 'on the card'}: {ev.get('title')} ({ev.get('date')})")
    for row, names in results_rows(p, lambda r: str(r.get("sport", "")).lower() == "boxing"):
        for n in names:
            people.add(n, 3 if recent(row.get("date")) else 4, f"result: {row.get('event')} ({row.get('date')})")
    for f in cd.get("fighters", []):
        if f.get("sport") == "Boxing":
            people.add(f.get("name"), 4, f"scouting roster ({str(f.get('category', '')).lower()})")
    return people


def ufc_people(p):
    people, cd = People("ufc"), combat_data(p)
    form = (read_json(p["form"], {}) or {}).get("fighters", {})
    slugs = {fold(v.get("name")): k for k, v in form.items()}
    for c in cd.get("champions", {}).get("mma", []):
        people.add(c.get("name"), 0, f"UFC {str(c.get('division', '')).lower()} champion")
    for ev, main, names in upcoming_bouts(p, lambda e: str(e.get("promotion", "")).upper().startswith("UFC")):
        for n in names:
            people.add(n, 1 if main else 2, f"{'main event' if main else 'on the card'}: {ev.get('title')} ({ev.get('date')})")
    for row, names in results_rows(p, lambda r: str(r.get("eventId", "")).startswith("ufc-")):
        for n in names:
            people.add(n, 3 if recent(row.get("date")) else 4, f"result: {row.get('event')} ({row.get('date')})")
    for slug, f in form.items():
        people.add(f.get("name"), 4, "Fighters hub (UFC form file)", slug=slug)
    for f in cd.get("fighters", []):
        if f.get("sport") == "MMA":
            people.add(f.get("name"), 4, f"MMA scouting roster ({str(f.get('category', '')).lower()})")
    reg = read_json(p["ufc"], {}) or {}
    for slug in reg.get("missing", []):
        people.add(slug.replace("-", " ").title(), 4, "listed as missing in the UFC image register", slug=slug)
    for row in people.by.values():
        row["slug"] = row.get("slug") or slugs.get(fold(row["name"])) or slugify(row["name"])
    return people


def mma_people(p):
    people = People("mma")
    for ev, main, names in upcoming_bouts(p, lambda e: str(e.get("sport", "")).lower() == "mma"
                                          and not str(e.get("promotion", "")).upper().startswith("UFC")):
        promoter = mma_promoter(ev.get("promotion", "")) or mma_promoter(ev.get("title", ""))
        if not promoter:
            continue
        for n in names:
            people.add(n, 1 if main else 2, f"{'main event' if main else 'on the card'}: {ev.get('title')} ({ev.get('date')})",
                       promoter=promoter, opponents=[o for o in names if o != n])
    # MMA only: ONE's Muay Thai, kickboxing and grappling bouts are outside the MMA attestation.
    for row, names in results_rows(p, lambda r: str(r.get("sport", "")) == "MMA" and not str(r.get("eventId", "")).startswith("ufc-")):
        promoter = mma_promoter(str(row.get("eventId", "")).replace("-", " "))
        if not promoter:
            continue
        for n in names:
            people.add(n, 3 if recent(row.get("date")) else 4, f"result: {row.get('event')} ({row.get('date')})",
                       promoter=promoter, opponents=[o for o in names if o != n])
    return people


def sumo_people(p):
    people = People("sumo")
    for w in (read_json(p["sumo_index"], {}) or {}).get("rikishi", []):
        people.add(w.get("shikonaEn"), 4, f"tracked rikishi ({w.get('currentRank') or 'banzuke'})",
                   sourceId=str(w.get("sourceId")))
    return people


COLLECT = {"boxing": boxing_people, "ufc": ufc_people, "mma": mma_people, "sumo": sumo_people}


def holdings(p, sport):
    """(photo by folded name -> register id, cut-out state by register id -> (ok, reason))."""
    if sport == "sumo":
        photos = (read_json(p["sumo_photos"], {}) or {}).get("bySourceId", {})
        cut = read_json(p["sumo_cut"], {}) or {}
        have = {fold(v.get("name")): sid for sid, v in photos.items() if v.get("approved")}
        cuts = {sid: (True, "") for sid in cut.get("bySourceId", {})}
        cuts.update({sid: (False, "headshot or partial figure: shown in the red disc by design")
                     for sid in cut.get("headshotOrPartial", [])})
        return have, cuts
    reg = read_json(p[sport], {}) or {}
    have = {fold(r["name"]): r["id"] for r in reg.get("images", [])}
    cut = (read_json(p[sport + "_cut"], {}) or {}).get("cutouts", {})
    return have, {k: (bool(v.get("ok")), v.get("reason", "")) for k, v in cut.items()}


def compute_missing(p, sports, state=None):
    state = state or {}
    attempts = state.get("attempts", {})
    out = {"generated": now_iso(), "sports": {}}
    elsewhere = {}
    if "mma" in sports:
        # A fighter BEFN holds, or shows, as a UFC fighter or a boxer is that sport's to photograph: a second
        # photograph in the MMA register would make the name ambiguous and the image map would show neither.
        for other in ("ufc", "boxing"):
            elsewhere.update({k: other for k in holdings(p, other)[0]})
            elsewhere.update({k: other for k in COLLECT[other](p).by})
    for sport in sports:
        people = COLLECT[sport](p)
        have, cuts = holdings(p, sport)
        missing, no_cut = [], []
        # Before the runner's own record, an intake's register says why it last passed someone over.
        earlier = {}
        if sport in ("boxing", "mma", "ufc"):
            reg = read_json(p[sport], {}) or {}
            when = str(reg.get("generated", ""))[:10]
            for s in reg.get("skipped", []):
                earlier[fold(s["name"])] = {"date": when, "run": "register", "reason": s.get("reason", ""),
                                            "category": categorise(s.get("reason", ""))}
            for slug in reg.get("missing", []):
                earlier[fold(slug.replace("-", " "))] = {"date": when, "run": "register", "category": "no source",
                                                         "reason": "no photo in the owner's UFC folder (register 'missing')"}
        for k, row in people.by.items():
            rid = have.get(k) or (row.get("sourceId") if sport == "sumo" and row.get("sourceId") in have.values() else None)
            if sport == "mma" and not rid and k in elsewhere:
                continue  # the fighter already has a photo in the UFC or boxing register, which the site uses
            if sport == "ufc" and not rid and row.get("slug") in set(have.values()):
                rid = row["slug"]
            entry = {**row, "key": k, "prominence": RANKS[row["rank"]],
                     "lastAttempt": attempts.get(f"{sport}|{k}") or earlier.get(k)}
            if not rid:
                missing.append(entry)
                continue
            ok, reason = cuts.get(rid, (None, "no cut-out built yet"))
            if sport in ("boxing", "ufc", "mma", "sumo") and not ok:
                no_cut.append({**entry, "id": rid, "cutoutReason": reason})
        order = lambda r: (r["rank"], r["name"])
        out["sports"][sport] = {"onSite": len(people.by), "missing": sorted(missing, key=order),
                                "noCutout": sorted(no_cut, key=order)}
    return out


def attempt_line(a):
    if not a:
        return "never tried"
    return f"{a.get('date')}: {a.get('category')} ({a.get('reason', '')[:140]})"


def write_missing(p, doc):
    write_json(p["qa"] / "missing.json", doc)
    lines = ["# Fighters without an approved photo", "",
             f"Generated {doc['generated']} by `python3 scripts/photo-runner.py missing`. Sorted by prominence: "
             "current champion, upcoming main event, upcoming card, recent result, roster.", ""]
    for sport, s in doc["sports"].items():
        lines += [f"## {sport.upper()}: {len(s['missing'])} without a photo, {len(s['noCutout'])} with a photo "
                  f"but no cut-out ({s['onSite']} on the site)", ""]
        if s["missing"]:
            lines += ["| Fighter | Why they matter | Last attempt |", "| --- | --- | --- |"]
            for r in s["missing"]:
                why = "; ".join(r["why"][:2]) + (f" (+{len(r['why']) - 2} more)" if len(r["why"]) > 2 else "")
                who = r["name"] + (f" ({r['promoter']})" if r.get("promoter") else "")
                lines.append(f"| {who} | {why} | {attempt_line(r.get('lastAttempt'))} |".replace("\n", " "))
            lines.append("")
        if s["noCutout"]:
            lines += ["<details><summary>Photo but no cut-out</summary>", ""]
            lines += [f"- {r['name']}: {r['cutoutReason']}" for r in s["noCutout"]]
            lines += ["", "</details>", ""]
    (p["qa"] / "missing.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


# --- run state -----------------------------------------------------------------------------------

def load_state(p):
    return read_json(p["state"], {"attempts": {}, "runs": {}}) or {"attempts": {}, "runs": {}}


def categorise(reason):
    r = (reason or "").lower()
    if re.search(r"robots|http 40[13]|http 429|http 5\d\d|anti-bot|ddos|refuses an automated|blocked", r):
        return "blocked host"
    if re.search(r"reviewed|rejected by eye|by eye", r):
        return "rejected by eye"
    if re.search(r"prints|file name|labelled|does not match|not \w+ name|is someone else", r):
        return "name mismatch"
    return "no source"


# --- staging -------------------------------------------------------------------------------------

def run_tool(args, log):
    """Run one pipeline script; its output goes to the run's log."""
    proc = subprocess.run([PY, *map(str, args)], cwd=ROOT, capture_output=True, text=True)
    log.write(f"$ {' '.join(map(str, args))}\n{proc.stdout}\n{proc.stderr}\n")
    log.flush()
    return proc


def stage_boxing(p, people, stage, log):
    names = stage / "boxing" / "names.txt"
    names.parent.mkdir(parents=True, exist_ok=True)
    names.write_text("\n".join(r["name"] for r in people) + "\n", encoding="utf-8")
    run_tool([ROOT / "scripts/boxing-portrait-intake.py", "--names-file", names, "--stage", stage], log)
    res = read_json(stage / "boxing/result.json", {"images": [], "skipped": [], "report": []})
    blocked = {}
    for line in res.get("report", []):
        m = re.match(r"\s*(\S+): (skipped, .*|not fetched, .*|roster unreadable: .*)", line)
        if m:
            blocked[m.group(1)] = m.group(2)
    entries = []
    for row in res["images"]:
        lic = (row.get("licence") + " · " + row.get("photographer", "")) if row.get("rights") == "wikimedia-cc" \
            else row.get("attestation", "")
        entries.append({"sport": "boxing", "id": row["id"], "name": row["name"], "row": row,
                        "portrait": f"boxing/files/{row['files']['portrait']}", "credit": row.get("credit"),
                        "licence": lic})
    skips = [{"sport": "boxing", "name": s["name"], "reason": s["reason"], "category": categorise(s["reason"])}
             for s in res["skipped"]]
    return entries, skips, blocked


def stage_ufc(p, people, stage, log):
    box = load_script("boxing-portrait-intake.py")
    blocked, work = {}, stage / "ufc" / "work"
    work.mkdir(parents=True, exist_ok=True)
    cdn_ok, why = box.robots_allows("a.espncdn.com", "/i/headshots/mma/players/full/")
    if not cdn_ok:
        blocked["a.espncdn.com"] = why
        return [], [{"sport": "ufc", "name": r["name"], "reason": f"a.espncdn.com: {why}", "category": "blocked host"}
                    for r in people], blocked
    search_ok, why = box.robots_allows("site.web.api.espn.com", "/apis/common/v3/search")
    args = []
    if not search_ok:
        blocked["site.web.api.espn.com"] = why + " (the name search is not used; only ESPN ids already in BEFN data)"
        args.append("--no-search")
    new = work / "new-fighters.tsv"
    new.write_text("".join(f"{r['slug']}\t{r['name']}\n" for r in people), encoding="utf-8")
    run_tool([ROOT / "scripts/pull-ufc-hires-photos.py", "--work", work, "fetch", "--new-fighters", new, *args], log)
    report = read_json(work / "fetch-report.json", {}) or {}
    ok = {s: v for s, v in report.items() if v.get("status") == "downloaded"}
    entries, skips = [], []
    if ok:
        manifest = work / "process.csv"
        with manifest.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["roster_slug", "fighter_name", "jpeg_filename", "image_source_url",
                                              "rights_status", "sha256", "download_status"])
            w.writeheader()
            for slug, v in ok.items():
                w.writerow({"roster_slug": slug, "fighter_name": v["name"], "jpeg_filename": f"{slug}.png",
                            "image_source_url": v["url"], "rights_status": "owner-cleared on approval",
                            "sha256": v["sha256"], "download_status": "downloaded"})
        run_tool([ROOT / "scripts/process-fighter-images.py", work / "raw", manifest, stage / "ufc/files"], log)
        for proc in read_json(stage / "ufc/files/_processed.json", []):
            v = ok[proc["id"]]
            row = {"id": proc["id"], "name": proc["name"], "files": proc["files"], "credit": "ESPN",
                   "sourceUrl": v["url"], "sourceWidth": proc["sourceWidth"], "sourceHeight": proc["sourceHeight"],
                   "lowRes": proc["lowRes"], "rights": "owner-cleared", "originalSha256": v["sha256"],
                   "espnId": v.get("espnId"),
                   "sourcePage": f"https://www.espn.com/mma/fighter/_/id/{v.get('espnId')}" if v.get("espnId") else ""}
            entries.append({"sport": "ufc", "id": proc["id"], "name": proc["name"], "row": row,
                            "portrait": f"ufc/files/{proc['files']['portrait']}", "credit": "ESPN",
                            "licence": "owner-cleared on approval (same basis as the UFC library; approve needs --owner-cleared)"})
    for slug, v in report.items():
        if v.get("status") != "downloaded":
            name = v.get("name") or slug
            skips.append({"sport": "ufc", "name": name, "reason": v["status"], "category": categorise(v["status"])})
    return entries, skips, blocked


def stage_mma(p, people, stage, log):
    f = stage / "mma" / "people.tsv"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text("".join(f"{r['name']}\t{r['promoter']}\t{';'.join(r.get('opponents', []))}\n" for r in people),
                 encoding="utf-8")
    run_tool([ROOT / "scripts/mma-portrait-intake.py", "--names-file", f, "--stage", stage], log)
    res = read_json(stage / "mma/result.json", {"images": [], "skipped": [], "blocked": {}})
    entries = [{"sport": "mma", "id": r["id"], "name": r["name"], "row": r, "portrait": f"mma/files/{r['files']['portrait']}",
                "credit": r["credit"], "licence": r["attestation"]} for r in res["images"]]
    skips = [{"sport": "mma", "name": s["name"], "reason": f"{s.get('promoter')}: {s['reason']}",
              "category": s.get("kind") or categorise(s["reason"])} for s in res["skipped"]]
    return entries, skips, res.get("blocked", {})


def stage_sumo(p, people, stage, log):
    if not people:
        return [], [], {}
    run_tool([ROOT / "scripts/sumo-portrait-intake.py", "--update-batch", "0", "--stage", stage], log)
    res = read_json(stage / "sumo/result.json", {"images": [], "result": {}})
    entries = [{"sport": "sumo", "id": r["sourceId"], "name": r["name"], "row": r,
                "portrait": f"sumo/files/jsa-{r['sourceId']}.jpg", "credit": r["credit"], "licence": r["license"]}
               for r in res["images"]]
    result = res.get("result", {})
    skips = [{"sport": "sumo", "name": str(x.get("sourceId")), "reason": x.get("reason", ""), "category": "name mismatch"}
             for x in result.get("review", [])]
    blocked = {"www.sumo.or.jp": result["blocked"]} if result.get("blocked") else {}
    return entries, skips, blocked


STAGE = {"boxing": stage_boxing, "ufc": stage_ufc, "mma": stage_mma, "sumo": stage_sumo}


def contact_sheet(tiles, out, title):
    """tiles: [(image path or None, line1, line2)]. A grid with the name under each photograph."""
    from PIL import Image, ImageDraw, ImageFont, ImageOps

    def font(size, bold=False):
        for f in (f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf",
                  "/Library/Fonts/Arial.ttf", "C:/Windows/Fonts/arial.ttf"):
            try:
                return ImageFont.truetype(f, size)
            except OSError:
                continue
        return ImageFont.load_default(size=size)

    cols, tw, th, pad, text_h = 5, 200, 250, 14, 52
    rows = max(1, (len(tiles) + cols - 1) // cols)
    sheet = Image.new("RGB", (pad + cols * (tw + pad), 56 + rows * (th + text_h + pad)), (248, 244, 237))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 16), title, fill=(17, 16, 19), font=font(18, True))
    for i, (img, line1, line2) in enumerate(tiles):
        x, y = pad + (i % cols) * (tw + pad), 56 + (i // cols) * (th + text_h + pad)
        cell = Image.new("RGB", (tw, th), (225, 220, 210))
        if img and Path(img).exists():
            im = Image.open(img)
            if im.mode in ("RGBA", "LA"):
                bg = Image.new("RGBA", im.size, (200, 196, 188, 255))
                bg.alpha_composite(im.convert("RGBA"))
                im = bg
            im = ImageOps.contain(im.convert("RGB"), (tw, th))
            cell.paste(im, ((tw - im.width) // 2, (th - im.height) // 2))
        sheet.paste(cell, (x, y))
        d.text((x, y + th + 4), line1[:30], fill=(17, 16, 19), font=font(13, True))
        d.text((x, y + th + 22), line2[:34], fill=(80, 76, 72), font=font(11))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, "PNG", optimize=True)
    return out


def write_manifest_and_sheet(stage, run_id, entries, skips, blocked, kind="fetch"):
    for e in entries:
        f = stage / e["portrait"]
        e["status"] = "staged"
        row = e["row"]
        e.update({"sourcePage": row.get("sourcePage") or row.get("profileUrl") or "",
                  "imageUrl": row.get("sourceUrl", ""), "sha256": row.get("sha256") or row.get("originalSha256", ""),
                  "size": row.get("originalSize") or (f"{row['sourceWidth']}x{row['sourceHeight']}" if row.get("sourceWidth") else ""),
                  "fetchedAt": row.get("fetchedAt") or row.get("intake", {}).get("at") or now_iso(),
                  "bytes": f.stat().st_size if f.exists() else 0})
    # The same image file for two or more fighters is a site placeholder (PFL's dark silhouette was staged for
    # 18 fighters on 2026-11-24), never a portrait: refused before anyone has to look at it.
    shared = Counter(e["sha256"] for e in entries if e.get("sha256"))
    for e in [e for e in entries if e.get("sha256") and shared[e["sha256"]] > 1]:
        entries.remove(e)
        skips.append({"sport": e["sport"], "name": e["name"], "category": "placeholder",
                      "reason": f"the same image file as {shared[e['sha256']] - 1} other fighter(s): a placeholder, not a portrait"})
    manifest = {"runId": run_id, "kind": kind, "createdAt": now_iso(), "approved": False,
                "note": "Staged only: nothing here is registered or published until "
                        f"`python3 scripts/photo-runner.py approve {run_id}`.",
                "entries": entries, "skipped": skips, "blockedHosts": blocked}
    write_json(stage / "manifest.json", manifest)
    tiles = [(stage / e["portrait"], e["name"], f"{e['sport']} · {e['credit']}"[:34]
              + (" · low-res" if e["row"].get("lowRes") else "")) for e in entries]
    contact_sheet(tiles, stage / "contact.png", f"Photo runner {run_id}: {len(entries)} staged, look at each before approving")
    return manifest


def new_run_id(prefix=""):
    return prefix + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def cmd_missing(args, p=None):
    p = p or paths()
    sports = SPORTS if args.sport == "all" else (args.sport,)
    doc = compute_missing(p, sports, load_state(p))
    if args.sport != "all":  # keep the other sports from the last full listing
        old = read_json(p["qa"] / "missing.json", {}) or {}
        doc["sports"] = {**old.get("sports", {}), **doc["sports"]}
    write_missing(p, doc)
    for sport in sports:
        s = doc["sports"][sport]
        print(f"{sport}: {len(s['missing'])} without a photo, {len(s['noCutout'])} without a cut-out ({s['onSite']} on the site)")
    return doc


def cmd_fetch(args, p=None):
    p = p or paths()
    sports = SPORTS if args.sport == "all" else (args.sport,)
    state = load_state(p)
    doc = compute_missing(p, sports, state)
    only = {fold(n) for n in (args.names or "").split(",") if n.strip()}
    run_id = new_run_id()
    stage = p["staging"] / run_id
    stage.mkdir(parents=True, exist_ok=True)
    entries, skips, blocked = [], [], {}
    with (stage / "run.log").open("w", encoding="utf-8") as log:
        for sport in sports:
            todo = []
            for r in doc["sports"][sport]["missing"]:
                if only and r["key"] not in only:
                    continue
                last = r.get("lastAttempt") or {}
                if not only and not args.retry and last.get("date") and last.get("run") != "register" and \
                        (today() - date.fromisoformat(last["date"])).days < args.fresh_days:
                    continue
                todo.append(r)
            if args.limit:
                todo = todo[:args.limit]
            print(f"{sport}: looking for {len(todo)}", flush=True)
            if not todo:
                continue
            e, s, b = STAGE[sport](p, todo, stage, log)
            entries += e
            skips += s
            blocked.update({f"{sport}: {k}": v for k, v in b.items()})
            looked = {r["key"] for r in todo}
            for x in s:
                if fold(x["name"]) in looked:
                    state["attempts"][f"{sport}|{fold(x['name'])}"] = {"date": today().isoformat(), "run": run_id,
                                                                     "category": x["category"], "reason": x["reason"]}
            for x in e:
                state["attempts"][f"{sport}|{fold(x['name'])}"] = {"date": today().isoformat(), "run": run_id,
                                                                 "category": "staged", "reason": "awaiting approval"}
    manifest = write_manifest_and_sheet(stage, run_id, entries, skips, blocked)
    per = {}
    for e in entries:
        key = f"{e['sport']} · {e['credit']}"
        per[key] = per.get(key, 0) + 1
    state["runs"][run_id] = {"date": today().isoformat(), "kind": "fetch", "staged": per,
                             "blockedHosts": blocked, "approved": [], "rejected": []}
    state["lastRun"] = run_id
    write_json(p["state"], state)
    print(f"run {run_id}: {len(entries)} staged in {stage.relative_to(ROOT)}; {len(skips)} not found")
    for k, v in sorted(per.items()):
        print(f"  {k}: {v}")
    for k, v in blocked.items():
        print(f"  blocked {k}: {v}")
    print(f"Look at {stage.relative_to(ROOT)}/contact.png, then: python3 scripts/photo-runner.py approve {run_id} --all")
    return manifest


# --- drop folder ---------------------------------------------------------------------------------

ATTEST_RE = re.compile(r"^owner, (\d{4}-\d{2}-\d{2}): \S.{8,}$")


def cmd_drop(args, p=None):
    p = p or paths()
    if not ATTEST_RE.match(args.attest or ""):
        raise SystemExit('refused: --attest must read "owner, YYYY-MM-DD: <the owner\'s wording>"')
    if not args.credit.strip():
        raise SystemExit("refused: --credit is required")
    folder = Path(args.folder)
    fullbody = getattr(args, "kind", "portrait") == "fullbody"
    if fullbody and args.sport not in FULLBODY_SPORTS:
        raise SystemExit(f"refused: --kind fullbody is for {' and '.join(FULLBODY_SPORTS)} only")
    known = COLLECT[args.sport](p).by
    if fullbody:
        # A full-body photograph sits beside the fighter's portrait, so only a full-body cut-out already kept stops it.
        held = (read_json(p["fullbody_cut"], {}) or {}).get("cutouts", {})
        have = {k for k, v in known.items() if held.get(slugify(v["name"]), {}).get("ok") is True}
    else:
        have, _ = holdings(p, args.sport)
    refused, files = [], []
    for f in sorted(folder.iterdir()):
        if f.is_dir() or f.name.startswith("."):
            continue
        if f.suffix.lower() not in IMAGE_EXT:
            refused.append((f.name, "not a JPEG, PNG or WebP"))
        elif fold(f.stem) not in known:
            refused.append((f.name, f"the file name matches no {args.sport} fighter on the site"))
        elif fold(f.stem) in have:
            refused.append((f.name, "this fighter already has a full-body cut-out" if fullbody else "this fighter already has an approved photo"))
        else:
            files.append(f)
    for name, why in refused:
        print(f"refused {name}: {why}")
    if not files:
        print("nothing staged")
        return None
    run_id = new_run_id("drop-fullbody-" if fullbody else "drop-")
    stage = p["staging"] / run_id
    entries = []
    box = load_script("boxing-portrait-intake.py")
    for f in files:
        person = known.get(fold(f.stem)) or {"name": f.stem}
        data = f.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        base = {"credit": args.credit.strip(), "rights": "owner-supplied", "attestation": args.attest,
                "originalFile": f.name, "sha256": sha, "fetchedAt": now_iso(),
                "identityBasis": "the owner named the file after the fighter"}
        if fullbody:
            slug = slugify(person["name"])
            out = stage / "fullbody/files" / f"{slug}.png"
            out.parent.mkdir(parents=True, exist_ok=True)
            from PIL import Image, ImageOps
            im = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
            im.save(out, "PNG")
            row = {"id": slug, "name": person["name"], "sport": args.sport, **base, "originalSize": f"{im.width}x{im.height}"}
            entries.append({"sport": args.sport, "kind": "fullbody", "id": slug, "name": person["name"], "row": row,
                            "portrait": f"fullbody/files/{slug}.png", "credit": row["credit"], "licence": args.attest})
            continue
        if args.sport == "sumo":
            sid = person.get("sourceId")
            if not sid:
                refused.append((f.name, "no JSA source id for this rikishi"))
                continue
            out = stage / "sumo/files" / f"owner-{sid}.jpg"
            out.parent.mkdir(parents=True, exist_ok=True)
            from PIL import Image
            Image.open(f).convert("RGB").save(out, "JPEG", quality=92)
            row = {"approved": True, "path": f"assets/sumo-photos/owner-{sid}.jpg", "name": person["name"],
                   "sourceId": int(sid), "license": args.attest, "credit": args.credit.strip(), "sourceUrl": "",
                   "sha256": hashlib.sha256(out.read_bytes()).hexdigest(), "originalSha256": sha,
                   "changes": "Converted to JPEG", "identityBasis": base["identityBasis"],
                   "intake": {"method": "owner drop folder", "at": base["fetchedAt"], "file": f.name}}
            entries.append({"sport": "sumo", "id": sid, "name": person["name"], "row": row,
                            "portrait": f"sumo/files/owner-{sid}.jpg", "credit": row["credit"], "licence": args.attest})
            continue
        slug = person.get("slug") or slugify(person["name"])
        box.OUT_DIR = stage / args.sport / "files"
        box.OUT_DIR.mkdir(parents=True, exist_ok=True)
        files_, centred, size = box.process(f, slug, [])
        row = {"id": slug, "name": person["name"], "files": files_, **base, "originalSize": f"{size[0]}x{size[1]}"}
        if args.sport == "ufc":
            row.update({"sourceWidth": size[0], "sourceHeight": size[1], "originalSha256": sha})
        if size[0] < 480:
            row["lowRes"] = True
        entries.append({"sport": args.sport, "id": slug, "name": person["name"], "row": row,
                        "portrait": f"{args.sport}/files/{files_['portrait']}", "credit": row["credit"],
                        "licence": args.attest})
    skips = [{"sport": args.sport, "name": n, "reason": why, "category": "name mismatch"} for n, why in refused]
    manifest = write_manifest_and_sheet(stage, run_id, entries, skips, {}, kind="drop-fullbody" if fullbody else "drop")
    state = load_state(p)
    state["runs"][run_id] = {"date": today().isoformat(), "kind": "drop-fullbody" if fullbody else "drop", "staged": {f"{args.sport} · {args.credit}": len(entries)},
                             "blockedHosts": {}, "approved": [], "rejected": []}
    state["lastRun"] = run_id
    write_json(p["state"], state)
    print(f"run {run_id}: {len(entries)} staged; look at {stage.relative_to(ROOT)}/contact.png, then approve")
    return manifest


# --- approve -------------------------------------------------------------------------------------

def add_to_dict_literal(script, dict_name, key, reason):
    """Add `"key": "reason",` to the dict literal `DICT_NAME = {` in a pipeline script, so the
    by-eye decision lives where the pipeline (and IMAGE-GUIDE) already keeps them."""
    path = ROOT / "scripts" / script
    text = path.read_text(encoding="utf-8")
    m = re.search(rf"^{re.escape(dict_name)} = \{{\n", text, re.M)
    if not m:
        raise RuntimeError(f"{script} has no {dict_name} = {{ ... }}")
    if re.search(rf'^\s+{re.escape(json.dumps(key, ensure_ascii=False))}:', text[m.end():m.end() + text[m.end():].find("\n}")], re.M):
        return False
    line = f"    {json.dumps(key, ensure_ascii=False)}: {json.dumps(reason, ensure_ascii=False)},\n"
    path.write_text(text[:m.end()] + line + text[m.end():], encoding="utf-8")
    return True


def parse_pairs(text):
    out = {}
    for part in re.split(r",(?=[^,:]+:)", text or ""):
        if part.strip():
            name, _, reason = part.partition(":")
            out[name.strip()] = reason.strip() or "rejected by eye"
    return out


def register_rows(p, sport, rows, stage):
    """Copy the staged crops into the sport's folder and add the rows to its register, as the
    sport's intake does (sorted by id; a skip is dropped for anyone who now has a photo)."""
    reg_path = p[sport]
    if sport == "mma" and not reg_path.exists():
        reg = load_script("mma-portrait-intake.py").empty_register()
    else:
        reg = read_json(reg_path)
    base = ROOT / reg["basePath"]
    base.mkdir(parents=True, exist_ok=True)
    held = {r["id"] for r in reg["images"]}
    for row in rows:
        if row["id"] in held:
            continue
        for fn in row["files"].values():
            shutil.copyfile(stage / sport / "files" / fn, base / fn)
        reg["images"].append(row)
        held.add(row["id"])
    reg["images"].sort(key=lambda r: r["id"])
    if "skipped" in reg:
        reg["skipped"] = [s for s in reg["skipped"] if slugify(s["name"]) not in held]
    if sport == "mma":
        mod = load_script("mma-portrait-intake.py")
        reg["rightsNote"], reg["attestations"] = mod.RIGHTS_NOTE, dict(mod.ATTESTATIONS)
    if sport == "ufc":
        drops = [r for r in rows if r.get("rights") == "owner-supplied"]
        if drops:
            reg["rightsNote"] = reg.get("rightsNote", "") + "".join(
                f" {r['attestation']} ({r['name']}, credit {r['credit']}, photo-runner drop folder)." for r in drops)
        reg["missing"] = [m for m in reg.get("missing", []) if m not in held]
    reg["generated"] = now_iso() if sport != "ufc" else today().isoformat()
    write_json(reg_path, reg)


def approve_ufc_espn(p, entries, stage, run_id, log):
    """Hand the approved ESPN headshots to the UFC pipeline's own apply step."""
    report = read_json(stage / "ufc/work/fetch-report.json", {}) or {}
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        (work / "raw").mkdir()
        keep = {}
        for e in entries:
            keep[e["id"]] = report[e["id"]]
            shutil.copyfile(stage / "ufc/work/raw" / f"{e['id']}.png", work / "raw" / f"{e['id']}.png")
        write_json(work / "fetch-report.json", keep)
        proc = run_tool([ROOT / "scripts/pull-ufc-hires-photos.py", "--work", work, "apply", "--owner-cleared",
                         "--context", f"scripts/photo-runner.py run {run_id}, looked at by eye on a contact sheet"], log)
        if proc.returncode:
            raise SystemExit(f"UFC apply failed:\n{proc.stdout}\n{proc.stderr}")


def approve_sumo(p, entries, stage):
    mod = load_script("sumo-portrait-intake.py")
    photos_doc, cutouts = mod.load("data/sumo/approved-photos.json"), mod.load("data/sumo/cutouts.json")
    cut = mod.cutout_module()
    for e in entries:
        data = (stage / e["portrait"]).read_bytes()
        mod.record_photo(str(e["id"]), e["row"], data, photos_doc["bySourceId"], cutouts, cut)
    mod.save("data/sumo/approved-photos.json", photos_doc)
    cutouts["headshotOrPartial"] = sorted(set(cutouts.get("headshotOrPartial", [])), key=int)
    mod.save("data/sumo/cutouts.json", cutouts)


REJECT_LISTS = {  # sport, rights -> (script, dict) that keeps the pipeline from fetching it again
    ("boxing", "promoter-press-kit"): ("boxing-portrait-intake.py", "REVIEWED_OUT_PRESS"),
    ("boxing", "wikimedia-cc"): ("boxing-portrait-intake.py", "REVIEWED_OUT"),
    ("mma", "promoter-press-kit"): ("mma-portrait-intake.py", "REVIEWED_OUT"),
    ("ufc", "owner-cleared"): ("pull-ufc-hires-photos.py", "REVIEWED_OUT"),
}
CUTOUT_LISTS = {"boxing": ("build-boxing-cutouts.py", "BY_EYE"), "mma": ("build-boxing-cutouts.py", "BY_EYE_MMA"),
                "ufc": ("build-ufc-cutouts.py", "BY_EYE")}


FULLBODY_SPORTS = ("ufc", "boxing")


def fullbody_remover():
    """rembg with the model every BEFN cut-out uses (isnet-general-use). Tests replace this."""
    from rembg import new_session, remove
    session = new_session("isnet-general-use")
    return lambda im: remove(im, session=session)


def approve_fullbody(p, entries, stage, log):
    """Cut out the approved full-body photographs with the cut-out builder's full-body mode and record each one,
    kept or not, in data/fullbody-cutout-register.json. The original photograph is not published; only the cut-out."""
    if not entries:
        return
    for e in entries:
        if not ATTEST_RE.match(e["row"].get("attestation") or ""):
            raise SystemExit(f"refused: {e['name']} has no dated owner attestation")
    builder = load_script("build-ufc-cutouts.py")
    remove = fullbody_remover()
    reg = read_json(p["fullbody_cut"], None) or {"version": 1, "cutouts": {}}
    reg.setdefault("cutouts", {})
    for e in entries:
        row = e["row"]
        out = p["fullbody_dir"] / f"{e['id']}.webp"
        ok, reason = builder.fullbody_cutout(stage / e["portrait"], out, remove)
        source = f"owner drop folder: {row.get('originalFile', '')} (sha256 {row.get('sha256', '')})"
        reg["cutouts"][e["id"]] = ({"ok": True, "sport": row["sport"], "name": e["name"], "source": source, "credit": row["credit"],
                                    "attestation": row["attestation"], "reason": reason} if ok else
                                   {"ok": False, "sport": row["sport"], "source": source, "reason": reason})
        if not ok:
            out.unlink(missing_ok=True)
        log.write(f"fullbody {e['id']}: {'kept' if ok else 'not kept'} ({reason})\n")
    reg["cutouts"] = dict(sorted(reg["cutouts"].items()))
    write_json(p["fullbody_cut"], reg)


def record_reject(p, e, reason):
    if e.get("kind") == "fullbody":
        return "state only"  # the owner's own file: there is no pipeline to keep from fetching it again
    target = REJECT_LISTS.get((e["sport"], e["row"].get("rights")))
    where = "state only"
    if target:
        add_to_dict_literal(*target, e["id"], reason)
        where = f"{target[0]} {target[1]}"
    if e["sport"] in ("boxing", "mma"):
        reg_path = p[e["sport"]]
        reg = read_json(reg_path) if reg_path.exists() else load_script("mma-portrait-intake.py").empty_register()
        reg.setdefault("skipped", [])
        reg["skipped"] = sorted([s for s in reg["skipped"] if fold(s["name"]) != fold(e["name"])] +
                                [{"name": e["name"], "reason": f"rejected by eye: {reason}"}], key=lambda s: s["name"])
        write_json(reg_path, reg)
    return where


def build_cutouts(p, sport, ids, log):
    if not ids:
        return
    if sport == "boxing":
        run_tool([ROOT / "scripts/build-boxing-cutouts.py", "--only", ",".join(ids)], log)
    elif sport == "mma":
        run_tool([ROOT / "scripts/build-boxing-cutouts.py", "--sport", "mma", "--only", ",".join(ids)], log)
    elif sport == "ufc":
        run_tool([ROOT / "scripts/build-ufc-cutouts.py", "--only", ",".join(ids)], log)


def cutout_tiles(p, approved):
    tiles = []
    for e in approved:
        sport = e["sport"]
        if e.get("kind") == "fullbody":
            v = (read_json(p["fullbody_cut"], {}) or {}).get("cutouts", {}).get(e["id"], {})
            f = p["fullbody_dir"] / f"{e['id']}.webp"
            tiles.append((f if v.get("ok") else None, e["name"],
                          f"{sport} full body · kept" if v.get("ok") else f"dropped: {v.get('reason', 'not built')}"))
            continue
        if sport == "sumo":
            cut = (read_json(p["sumo_cut"], {}) or {}).get("bySourceId", {}).get(str(e["id"]))
            tiles.append((ROOT / cut["path"] if cut else None, e["name"], "sumo · cut-out" if cut else "headshot: disc"))
            continue
        folder = {"boxing": "boxing-cutouts", "mma": "mma-cutouts", "ufc": "ufc-cutouts"}[sport]
        v = (read_json(p[sport + "_cut"], {}) or {}).get("cutouts", {}).get(e["id"], {})
        f = ROOT / "assets/img" / folder / f"{e['id']}.webp"
        tiles.append((f if v.get("ok") else None, e["name"],
                      f"{sport} · kept" if v.get("ok") else f"dropped: {v.get('reason', 'not built')}"))
    return tiles


def cmd_approve(args, p=None):
    p = p or paths()
    stage = p["staging"] / args.run_id
    manifest = read_json(stage / "manifest.json")
    if manifest is None:
        raise SystemExit(f"no staged run {args.run_id} in {p['staging'].relative_to(ROOT)}")
    rejects = parse_pairs(args.reject)
    by_name = {fold(e["name"]): e for e in manifest["entries"] if e.get("status") == "staged"}
    unknown = [n for n in list(rejects) + [x for x in (args.only or "").split(",") if x.strip()] if fold(n) not in by_name]
    if unknown:
        raise SystemExit(f"not staged in {args.run_id}: {', '.join(unknown)}")
    if not args.all and not args.only and not rejects:
        raise SystemExit("say which: --all, --only \"A,B\", and/or --reject \"C:reason\"")
    if args.all:
        chosen = [e for k, e in by_name.items() if k not in {fold(n) for n in rejects}]
    else:
        chosen = [by_name[fold(n)] for n in (args.only or "").split(",") if n.strip()]
    full = [e for e in chosen if e.get("kind") == "fullbody"]
    if full and args.no_cutouts:
        raise SystemExit("refused: a full-body photograph is registered only as its cut-out; leave out --no-cutouts")
    chosen = [e for e in chosen if e.get("kind") != "fullbody"]
    espn = [e for e in chosen if e["sport"] == "ufc" and e["row"].get("rights") == "owner-cleared"]
    if espn and not args.owner_cleared:
        raise SystemExit("refused: UFC headshots enter the register only with the owner's statement that they are "
                         "cleared on the same basis as the UFC library; pass --owner-cleared (it is recorded in the "
                         "register's rights note), or leave them out with --only.")
    review = p["reviews"] / args.run_id
    review.mkdir(parents=True, exist_ok=True)
    state = load_state(p)
    run = state["runs"].setdefault(args.run_id, {"approved": [], "rejected": []})
    with (stage / "approve.log").open("a", encoding="utf-8") as log:
        for name, reason in rejects.items():
            e = by_name[fold(name)]
            where = record_reject(p, e, reason)
            e.update({"status": "rejected", "reason": reason, "recordedIn": where})
            run.setdefault("rejected", []).append({"sport": e["sport"], "name": e["name"], "reason": reason})
            state["attempts"][f"{e['sport']}|{fold(e['name'])}"] = {"date": today().isoformat(), "run": args.run_id,
                                                                   "category": "rejected by eye", "reason": reason}
        approve_fullbody(p, full, stage, log)
        for e in full:
            e["status"] = "approved"
            run.setdefault("approved", []).append({"sport": e["sport"], "name": e["name"], "credit": e["credit"],
                                                   "sourcePage": e["row"].get("originalFile", ""), "kind": "fullbody"})
            state["attempts"][f"fullbody|{e['sport']}|{fold(e['name'])}"] = {"date": today().isoformat(), "run": args.run_id,
                                                                            "category": "added", "reason": "approved by eye"}
        for sport in SPORTS:
            mine = [e for e in chosen if e["sport"] == sport]
            if not mine:
                continue
            if sport == "sumo":
                approve_sumo(p, mine, stage)
            elif sport == "ufc":
                if espn:
                    approve_ufc_espn(p, espn, stage, args.run_id, log)
                drops = [e["row"] for e in mine if e["row"].get("rights") == "owner-supplied"]
                if drops:
                    register_rows(p, "ufc", drops, stage)
            else:
                register_rows(p, sport, [e["row"] for e in mine], stage)
            if not args.no_cutouts:
                build_cutouts(p, sport, [e["id"] for e in mine], log)
            for e in mine:
                e["status"] = "approved"
                run.setdefault("approved", []).append({"sport": sport, "name": e["name"], "credit": e["credit"],
                                                       "sourcePage": e.get("sourcePage", "")})
                state["attempts"][f"{sport}|{fold(e['name'])}"] = {"date": today().isoformat(), "run": args.run_id,
                                                                 "category": "added", "reason": "approved by eye"}
        run_tool([ROOT / "scripts/build-local-image-map.py"], log)
        run_tool([ROOT / "scripts/build-photo-credits.py"], log)
    manifest["approved"] = True
    manifest["approvedAt"] = now_iso()
    write_json(stage / "manifest.json", manifest)
    shutil.copyfile(stage / "contact.png", review / "contact.png")
    approved = [e for e in manifest["entries"] if e.get("status") == "approved"]
    if approved and not args.no_cutouts:
        contact_sheet(cutout_tiles(p, approved), review / "cutouts.png",
                      f"Photo runner {args.run_id}: cut-outs of the {len(approved)} approved photographs")
    write_summary(review, manifest, args.run_id)
    write_json(p["state"], state)
    print(f"approved {len(approved)}, rejected {len(rejects)}; review sheets in {review.relative_to(ROOT)}")
    return manifest


def write_summary(review, manifest, run_id):
    lines = [f"# Photo runner {run_id}", ""]
    approved = [e for e in manifest["entries"] if e.get("status") == "approved"]
    rejected = [e for e in manifest["entries"] if e.get("status") == "rejected"]
    lines += [f"Added {len(approved)} photographs. Contact sheet: `contact.png`; their cut-outs: `cutouts.png`.", ""]
    if approved:
        lines += ["| Fighter | Sport | Credit | Source | Rights |", "| --- | --- | --- | --- | --- |"]
        for e in sorted(approved, key=lambda e: (e["sport"], e["name"])):
            src = e.get("sourcePage") or e.get("imageUrl") or e["row"].get("originalFile", "")
            lines.append(f"| {e['name']} | {e['sport']} | {e['credit']} | {src} | {e['licence'][:120]} |")
        lines.append("")
    if rejected:
        lines += ["Rejected by eye (recorded so they are not fetched again):", ""]
        lines += [f"- {e['name']} ({e['sport']}): {e['reason']}" for e in rejected]
        lines.append("")
    blocked = manifest.get("blockedHosts") or {}
    if blocked:
        lines += ["Hosts that turned the runner away (not worked around):", ""]
        lines += [f"- {k}: {v}" for k, v in blocked.items()]
    (review / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def cmd_reject_cutout(args, p=None):
    p = p or paths()
    name, _, reason = args.item.partition(":")
    reason = reason.strip()
    if not reason:
        raise SystemExit('give a reason: reject-cutout "<name>:reason"')
    for sport in (SPORTS if args.sport == "all" else (args.sport,)):
        if sport not in CUTOUT_LISTS:
            continue
        rid = holdings(p, sport)[0].get(fold(name))
        if not rid:
            continue
        add_to_dict_literal(*CUTOUT_LISTS[sport], rid, reason)
        reg_path = p[sport + "_cut"]
        reg = read_json(reg_path, {"version": 1, "cutouts": {}})
        reg["cutouts"][rid] = {"ok": False, "reason": "dropped by eye: " + reason}
        reg["cutouts"] = dict(sorted(reg["cutouts"].items()))
        reg_path.write_text(json.dumps(reg, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        folder = {"boxing": "boxing-cutouts", "mma": "mma-cutouts", "ufc": "ufc-cutouts"}[sport]
        (ROOT / "assets/img" / folder / f"{rid}.webp").unlink(missing_ok=True)
        print(f"{sport}: {rid} cut-out dropped by eye ({reason}); recorded in {CUTOUT_LISTS[sport][0]} {CUTOUT_LISTS[sport][1]}")
        return rid
    raise SystemExit(f"no boxing, UFC or MMA photograph is registered for {name}")


def cmd_report(args, p=None):
    p = p or paths()
    doc = read_json(p["qa"] / "missing.json") or compute_missing(p, SPORTS, load_state(p))
    state = load_state(p)
    print("Missing photos (from qa/photo-runner/missing.json, " + doc.get("generated", "") + "):")
    for sport, s in doc["sports"].items():
        print(f"  {sport:6} {len(s['missing']):4} without a photo, {len(s['noCutout']):4} without a cut-out")
    last = state.get("lastRun")
    if last:
        run = state["runs"].get(last, {})
        print(f"Last run {last} ({run.get('kind')}, {run.get('date')}):")
        for k, v in sorted((run.get("staged") or {}).items()):
            print(f"  staged {k}: {v}")
        print(f"  approved {len(run.get('approved', []))}, rejected {len(run.get('rejected', []))}")
        for k, v in (run.get("blockedHosts") or {}).items():
            print(f"  blocked {k}: {v}")
    added = [(rid, a) for rid, r in state.get("runs", {}).items() for a in r.get("approved", [])]
    if added:
        print(f"Added through the runner so far: {len(added)}")
    return doc


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sport_arg = dict(choices=(*SPORTS, "all"), default="all")
    m = sub.add_parser("missing")
    m.add_argument("--sport", **sport_arg)
    f = sub.add_parser("fetch")
    f.add_argument("--sport", **sport_arg)
    f.add_argument("--limit", type=int, default=0, help="at most N people per sport")
    f.add_argument("--names", default="", help="comma-separated names (ignores --fresh-days)")
    f.add_argument("--retry", action="store_true", help="look again at people tried in the last --fresh-days")
    f.add_argument("--fresh-days", type=int, default=6, help="skip people tried this recently (default 6)")
    a = sub.add_parser("approve")
    a.add_argument("run_id")
    a.add_argument("--all", action="store_true")
    a.add_argument("--only", default="")
    a.add_argument("--reject", default="", help='"Name:reason,Name:reason"')
    a.add_argument("--owner-cleared", action="store_true",
                   help="the owner's statement that the staged ESPN headshots are cleared like the UFC library")
    a.add_argument("--no-cutouts", action="store_true", help="register only; build the cut-outs later")
    r = sub.add_parser("reject-cutout")
    r.add_argument("item", help='"<name>:reason"')
    r.add_argument("--sport", choices=("boxing", "ufc", "mma", "all"), default="all")
    d = sub.add_parser("drop")
    d.add_argument("folder")
    d.add_argument("--sport", choices=SPORTS, required=True)
    d.add_argument("--credit", required=True)
    d.add_argument("--attest", required=True, help='"owner, YYYY-MM-DD: <wording>"')
    d.add_argument("--kind", choices=("portrait", "fullbody"), default="portrait",
                   help="fullbody: full-length photographs (UFC or boxing) cut out whole into data/fullbody-cutout-register.json")
    sub.add_parser("report")
    args = ap.parse_args(argv)
    {"missing": cmd_missing, "fetch": cmd_fetch, "approve": cmd_approve, "reject-cutout": cmd_reject_cutout,
     "drop": cmd_drop, "report": cmd_report}[args.cmd](args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
