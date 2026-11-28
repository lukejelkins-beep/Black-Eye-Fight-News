#!/usr/bin/env python3
"""Build data/ufc-fighter-gyms.json: the gym(s) each UFC fighter on the site trains at.

Source: the "Association" field on each fighter's Sherdog page. Sherdog gave the owner permission to use its data on
BEFN (owner, 28 Nov 2026). Free, no key. The script is polite: one request at a time, a pause between requests, and
it never retries more than twice.

How a fighter is matched: the Sherdog fighter search is run on the display name, and the result is kept only when
exactly one result has the same folded name (ASCII, lower case, letters and digits only). Zero or several matches
leave the fighter out, never guessed, and the name is listed under coverage.

What the field means: it is where Sherdog lists the fighter as training now. It is not the gym at the time of each
fight, and a fighter may list several. The site shows it as a plain fact.

Keyed by folded name, like data/ufc-fighter-countries.json, so the profile code can look a fighter up with the same
foldName() it already uses.

Like the other builders, it refuses to overwrite the saved file if the number of fighters with a gym falls by 30% or
more, and it can resume from a cache directory (--cache) after an interrupted run.

Usage:
    python scripts/build-ufc-fighter-gyms.py --cache /tmp/gym-cache
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "ufc-fighter-gyms.json"
BASE = "https://www.sherdog.com"
SEARCH = BASE + "/stats/fightfinder?SearchTxt="
SOURCE_LABEL = "Sherdog fighter pages (Association field), used with Sherdog's permission"
UA = {"User-Agent": "Mozilla/5.0 (compatible; BEFN-gym-builder; +https://blackeyefightnews.com)"}
PAUSE = 0.8


def fold(name) -> str:
    text = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", text)


def parse_search(html: str) -> list:
    """[(path, name)] for every fighter row in a Sherdog fighter-finder page."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    out, seen = [], set()
    for a in soup.select("tr a[href^='/fighter/']"):
        href, text = a.get("href", ""), a.get_text(" ", strip=True)
        if text and href not in seen:
            seen.add(href)
            out.append((href, text))
    return out


def parse_gyms(html: str) -> list:
    """Gym names from the Association links on a Sherdog fighter page, in page order, without repeats."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    gyms = []
    for a in soup.select("a[href*='fightfinder?association=']"):
        text = a.get_text(" ", strip=True)
        if text and text not in gyms:
            gyms.append(text)
    return gyms


def match(name: str, results: list):
    """The one result whose folded name equals the fighter's, else None (zero or several: not guessed)."""
    key = fold(name)
    hits = [path for path, text in results if fold(text) == key]
    return hits[0] if len(hits) == 1 else None


def stats_names() -> dict:
    """folded name -> display name for every fighter in the UFC stats build."""
    out = {}
    for p in sorted((DATA / "ufc-stats" / "fighters").glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        out[fold(d["name"])] = d["name"]
    return out


def build(names: dict, fetch_search, fetch_page) -> dict:
    fighters, ambiguous, not_found, no_gym = {}, [], [], []
    for key, name in sorted(names.items()):
        results = parse_search(fetch_search(name))
        same = [p for p, t in results if fold(t) == key]
        if len(same) > 1:
            ambiguous.append(key)
            continue
        if not same:
            not_found.append(key)
            continue
        gyms = parse_gyms(fetch_page(same[0]))
        if gyms:
            fighters[key] = gyms
        else:
            no_gym.append(key)
    return {"schema": 1, "source": SOURCE_LABEL, "asOf": date.today().isoformat(),
            "note": "Where Sherdog lists the fighter as training now, not the gym at the time of any fight. A fighter "
                    "may list more than one. Fighters whose name matches none or several Sherdog fighters are left out.",
            "fighters": fighters,
            "coverage": {"statsFighters": len(names), "withGym": len(fighters), "ambiguous": ambiguous,
                         "notFound": not_found, "noGymListed": no_gym}}


def http_get(url: str) -> str:
    import requests
    for attempt in range(3):
        time.sleep(PAUSE)  # only real requests wait; pages read from --cache do not
        try:
            r = requests.get(url, headers=UA, timeout=30)
            if r.status_code == 200:
                return r.text
        except requests.RequestException:
            pass
        time.sleep(2)
    return ""


def cached(cache_dir, fetch):
    def run(arg):
        if not cache_dir:
            return fetch(arg)
        f = Path(cache_dir) / (re.sub(r"[^a-zA-Z0-9]+", "_", arg) + ".html")
        if f.exists():
            return f.read_text(encoding="utf-8")
        text = fetch(arg)
        if text:
            f.write_text(text, encoding="utf-8")
        return text
    return run


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", help="directory to keep fetched pages, so an interrupted run can resume")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    if args.cache:
        Path(args.cache).mkdir(parents=True, exist_ok=True)
    search = cached(args.cache, lambda name: http_get(SEARCH + re.sub(r"\s+", "+", name)))
    page = cached(args.cache, lambda path: http_get(BASE + path))
    result = build(stats_names(), search, page)
    out = Path(args.out)
    if out.exists():
        before = len(json.loads(out.read_text(encoding="utf-8")).get("fighters") or {})
        if before and len(result["fighters"]) < before * 0.7:
            print(f"refusing to overwrite: fighters with a gym fell from {before} to {len(result['fighters'])}",
                  file=sys.stderr)
            return 1
    out.write_text(json.dumps(result, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    c = result["coverage"]
    print(f"{c['withGym']} of {c['statsFighters']} with a gym; {len(c['ambiguous'])} ambiguous, "
          f"{len(c['notFound'])} not found, {len(c['noGymListed'])} with no gym listed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
