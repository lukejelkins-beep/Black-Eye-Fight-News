#!/usr/bin/env python3
"""Pull larger UFC fighter headshots for the photos too small to make a cutout, then swap them in.

151 UFC photos (the 23 Nov 2026 UFC.com batch, about 520 px wide) give a 260 px portrait, under the 300 px the cutout
builder needs, so those fighters show a photo disc instead of a cutout. ESPN's fighter headshots, already the source of
434 photos in data/ufc-image-register.json, give a 349 px portrait. This script finds each fighter's ESPN headshot,
downloads it, and swaps it in. Run it in a terminal on your own computer, from the repository root:

    python3 scripts/pull-ufc-hires-photos.py plan                     # offline: who needs a photo, what is known
    python3 scripts/pull-ufc-hires-photos.py fetch                    # network: ESPN lookups and downloads
    python3 scripts/pull-ufc-hires-photos.py apply --owner-cleared    # offline: crops, register, cutout command

`fetch` asks ESPN for one fighter at a time, one request a second, and can be stopped and run again (it skips what is
already downloaded). It keeps a headshot only when ESPN's name matches ours exactly (after removing accents and case)
and the image gives a portrait at least 300 px wide (ESPN headshots are about 600 x 436, so 349 px); anything else is listed in the report for a person to decide. A known ESPN id
can be given by hand in .photo-pulls/ufc-hires/ids.csv (two columns: slug,espn_id), which skips the name search.
Downloads stay in .photo-pulls/ (ignored by git).

`apply` refuses to run without --owner-cleared: no photograph enters the site without the owner's rights statement,
which it records in the register's rightsNote with the date and the number of photos. It reuses
scripts/process-fighter-images.py for the crops (same sizes as every other photo), overwrites only the target
fighters' files, keeps each old source URL as previousSourceUrl, and prints the cutout command to run next
(scripts/build-ufc-cutouts.py --only ..., which needs rembg).

Needs Python 3 and Pillow (pip install pillow). The ESPN search address below has not been tried from the
development sandbox; if ESPN changes it, `fetch` reports "search failed" for every fighter and nothing is changed.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTER = ROOT / "data/ufc-image-register.json"
IMG_DIR = ROOT / "assets/img/ufc"
WORK = ROOT / ".photo-pulls/ufc-hires"
MIN_PORTRAIT = 300  # same as MIN_WIDTH in scripts/build-ufc-cutouts.py
SEARCH = "https://site.web.api.espn.com/apis/common/v3/search?query={q}&limit=10&type=player"
HEADSHOT = "https://a.espncdn.com/i/headshots/mma/players/full/{id}.png"
HEADSHOT_RE = re.compile(r"headshots/mma/players/full/(\d+)\.png")
USER_AGENT = "BEFN-photo-pull/1.0 (static site maintenance)"
# The same spelling differences scripts/enrich-espn-headshots.py already knows about.
ALIASES = {"oliver schmid": "ollie schmid", "gabriel lourenco": "gabriel lorenco", "seok hyeon ko": "seokhyeon ko",
           "jose mauro delano": "jose delano", "nina nikolija milosevic": "nina milosevic"}


def normal(name: str) -> str:
    n = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().casefold()
    n = re.sub(r"[^a-z0-9]+", " ", n).strip()
    return ALIASES.get(n, n)


def load_register() -> dict:
    return json.loads(REGISTER.read_text(encoding="utf-8"))


def portrait_width(entry: dict) -> int:
    from PIL import Image
    path = IMG_DIR / entry["files"]["portrait"]
    return Image.open(path).width if path.exists() else 0


def portrait_from(w: int, h: int) -> int:
    """Width of the 4:5 portrait crop scripts/process-fighter-images.py makes from a w x h source (max 480)."""
    return min(w, round(h * 4 / 5), 480)


def targets(register: dict, only: list[str] | None = None) -> list[dict]:
    """Fighters whose portrait is too small for a cutout (or the slugs named with --only)."""
    rows = register["images"]
    if only:
        wanted = set(only)
        return [r for r in rows if r["id"] in wanted]
    return [r for r in rows if portrait_width(r) < MIN_PORTRAIT]


def known_ids() -> dict[str, str]:
    """ESPN ids already in repository data (name next to an ESPN headshot URL), plus ids.csv given by hand."""
    by_name: dict[str, str] = {}
    for f in ("data/results.json", "data/fight-film.json", "data/fight-talk-selected.json"):
        path = ROOT / f
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r'"name"\s*:\s*"([^"]+)"[^{}]{0,400}?' + HEADSHOT_RE.pattern, text):
            by_name.setdefault(normal(m.group(1)), m.group(2))
    manual = WORK / "ids.csv"
    if manual.exists():
        for row in csv.reader(manual.open(encoding="utf-8")):
            if len(row) >= 2 and row[1].strip().isdigit():
                by_name["slug:" + row[0].strip()] = row[1].strip()
    return by_name


def id_for(entry: dict, ids: dict[str, str]) -> str | None:
    return ids.get("slug:" + entry["id"]) or ids.get(normal(entry["name"]))


def search_hits(payload) -> list[tuple[str, str]]:
    """(espn id, display name) pairs for MMA athletes anywhere in a search response. Tolerant of layout changes."""
    hits = []

    def walk(x):
        if isinstance(x, dict):
            ident = str(x.get("id") or x.get("uid", "").split("~a:")[-1] or "")
            name = x.get("displayName") or x.get("name") or ""
            sport = json.dumps([x.get("sport"), x.get("league"), x.get("link"), x.get("uid")]).lower()
            if ident.isdigit() and name and "mma" in sport:
                hits.append((ident, name))
            for v in x.values():
                walk(v)
        elif isinstance(x, list):
            for v in x:
                walk(v)
    walk(payload)
    return hits


def exact_match(name: str, hits: list[tuple[str, str]]) -> str | None:
    """The one ESPN id whose name matches exactly; None when there is none or more than one."""
    ids = {i for i, n in hits if normal(n) == normal(name)}
    return ids.pop() if len(ids) == 1 else None


def get(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def cmd_plan(args) -> int:
    reg, ids = load_register(), known_ids()
    rows = targets(reg, args.only)
    WORK.mkdir(parents=True, exist_ok=True)
    plan = [{"slug": r["id"], "name": r["name"], "portraitWidth": portrait_width(r), "espnId": id_for(r, ids),
             "currentSource": r.get("sourceUrl")} for r in rows]
    (WORK / "plan.json").write_text(json.dumps(plan, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(plan)} fighters need a larger photo; {sum(1 for p in plan if p['espnId'])} have a known ESPN id.")
    print(f"Plan written to {WORK / 'plan.json'}. Next: python3 scripts/pull-ufc-hires-photos.py fetch")
    return 0


def cmd_fetch(args) -> int:
    from PIL import Image
    reg, ids = load_register(), known_ids()
    rows = targets(reg, args.only)[: args.limit or None]
    raw = WORK / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    report_path = WORK / "fetch-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {}
    for n, r in enumerate(rows, 1):
        slug, name = r["id"], r["name"]
        if report.get(slug, {}).get("status") == "downloaded" and (raw / f"{slug}.png").exists():
            continue
        espn_id = id_for(r, ids)
        try:
            if not espn_id:
                time.sleep(args.delay)
                hits = search_hits(json.loads(get(SEARCH.format(q=urllib.parse.quote(name)))))
                espn_id = exact_match(name, hits)
                if not espn_id:
                    report[slug] = {"status": "no exact ESPN match", "name": name,
                                    "candidates": [n_ for _, n_ in hits][:5]}
                    continue
            url = HEADSHOT.format(id=espn_id)
            time.sleep(args.delay)
            data = get(url)
            path = raw / f"{slug}.png"
            path.write_bytes(data)
            w, h = Image.open(path).size
            if portrait_from(w, h) < MIN_PORTRAIT:
                path.unlink()
                report[slug] = {"status": f"ESPN headshot too small ({w}x{h}, portrait {portrait_from(w, h)}px)",
                                "espnId": espn_id, "url": url}
                continue
            report[slug] = {"status": "downloaded", "name": name, "espnId": espn_id, "url": url, "width": w,
                            "height": h, "sha256": hashlib.sha256(data).hexdigest()}
        except Exception as e:  # network or parse errors: record and move on; a later run retries
            report[slug] = {"status": f"{'search' if not espn_id else 'download'} failed: {e}", "name": name}
        finally:
            report_path.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"[{n}/{len(rows)}] {name}: {report[slug]['status']}", flush=True)
    done = sum(1 for v in report.values() if v.get("status") == "downloaded")
    print(f"{done} headshots downloaded; report in {report_path}. Next: check a few in {raw}, then run apply.")
    return 0


def cmd_apply(args) -> int:
    if not args.owner_cleared:
        print("Refusing: pass --owner-cleared to confirm these ESPN headshots are cleared for use on BEFN, as for the "
              "434 ESPN photos already held. That statement is recorded in the register.")
        return 2
    report = json.loads((WORK / "fetch-report.json").read_text(encoding="utf-8"))
    ok = {s: v for s, v in report.items() if v.get("status") == "downloaded" and (WORK / "raw" / f"{s}.png").exists()}
    if not ok:
        print("Nothing downloaded to apply.")
        return 1
    reg = load_register()
    by_id = {r["id"]: r for r in reg["images"]}
    with tempfile.TemporaryDirectory() as tmp:
        manifest = Path(tmp) / "manifest.csv"
        with manifest.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=["roster_slug", "fighter_name", "jpeg_filename", "image_source_url",
                                              "rights_status", "sha256", "download_status"])
            w.writeheader()
            for slug, v in ok.items():
                w.writerow({"roster_slug": slug, "fighter_name": by_id[slug]["name"], "jpeg_filename": f"{slug}.png",
                            "image_source_url": v["url"], "rights_status": "owner-cleared", "sha256": v["sha256"],
                            "download_status": "downloaded"})
        out = Path(tmp) / "out"
        subprocess.run([sys.executable, str(ROOT / "scripts/process-fighter-images.py"), str(WORK / "raw"),
                        str(manifest), str(out)], check=True)
        processed = {p["id"]: p for p in json.loads((out / "_processed.json").read_text(encoding="utf-8"))}
        for slug, p in processed.items():
            for kind, fn in p["files"].items():
                (IMG_DIR / fn).write_bytes((out / fn).read_bytes())
            entry = by_id[slug]
            entry.setdefault("previousSourceUrl", entry.get("sourceUrl"))
            entry.update({"files": p["files"], "sourceUrl": p["sourceUrl"], "credit": "ESPN",
                          "sourceWidth": p["sourceWidth"], "sourceHeight": p["sourceHeight"], "lowRes": p["lowRes"],
                          "rights": "owner-cleared"})
    reg["rightsNote"] = (reg.get("rightsNote", "") + f" On {date.today().isoformat()} the owner stated that "
                         f"{len(processed)} ESPN headshots replacing smaller UFC.com photos (scripts/pull-ufc-hires-"
                         f"photos.py, previous source URL kept per entry) are cleared for use on BEFN on the same basis.")
    REGISTER.write_text(json.dumps(reg, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    slugs = ",".join(sorted(processed))
    print(f"{len(processed)} photos swapped in and recorded. Next, make their cutouts (needs rembg):")
    print(f"  python3 scripts/build-ufc-cutouts.py --only {slugs}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("plan", "fetch", "apply"):
        p = sub.add_parser(name)
        p.add_argument("--only", type=lambda s: [x.strip() for x in s.split(",") if x.strip()],
                       help="comma-separated register slugs instead of every too-small photo")
    sub.choices["fetch"].add_argument("--limit", type=int, default=0, help="stop after this many fighters")
    sub.choices["fetch"].add_argument("--delay", type=float, default=1.0, help="seconds between requests")
    sub.choices["apply"].add_argument("--owner-cleared", action="store_true",
                                      help="confirm the downloaded ESPN headshots are cleared for use on BEFN")
    args = ap.parse_args(argv)
    return {"plan": cmd_plan, "fetch": cmd_fetch, "apply": cmd_apply}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
