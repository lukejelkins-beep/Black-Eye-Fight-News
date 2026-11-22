#!/usr/bin/env python3
"""Refresh UFC official rankings and champions in data/ufc-divisions.json from ufc.com/rankings.

Free source: the public UFC.com rankings page (one request, no API key, no paid
provider). Run on demand (workflow_dispatch); it is NOT scheduled.

What it changes, per division: `ranked`, `champion`, `rankingDate`, `observedOn`
and the roster (ranked fighters are added; nobody is removed). The page has no
date: `rankingDate` is kept while a division's rankings are unchanged and set to
the day a change was first seen otherwise. The fighter index
is rebuilt with the same rules as scripts/refresh-ufc-divisions.py.

Safety
  * Only the "All Rankings" section is read; the "All Meta Rankings" section
    that repeats the divisions afterwards is ignored, as are pound-for-pound lists.
  * A division is replaced only if it parses to a champion plus at least
    MIN_RANKED ranked fighters. Otherwise its previous data is kept and the
    reason is printed. Nothing is guessed.
  * If fewer than MIN_DIVISIONS divisions parse, nothing is written.
  * The parser reads the page as an ordered list of text nodes (rank number,
    then name), so it does not depend on UFC.com's markup or class names.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import importlib.util
import json
import re
import sys
import unicodedata
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "ufc-divisions.json"
URL = "https://www.ufc.com/rankings"
MIN_RANKED = 10
MIN_DIVISIONS = 8
SOURCE = "ufc.com/rankings"


def _divisions_module():
    spec = importlib.util.spec_from_file_location("befn_divisions", ROOT / "scripts/refresh-ufc-divisions.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def norm(text: str) -> str:
    """Case/quote/space-insensitive form of a heading or label."""
    text = unicodedata.normalize("NFKC", html.unescape(text or ""))
    text = text.replace("’", "'").replace("‘", "'").replace("‐", "-").replace("‑", "-")
    return re.sub(r"\s+", " ", text).strip().lower()


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")


class _Text(HTMLParser):
    """Ordered, de-noised text nodes of an HTML page."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tokens: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "template"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "template") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if self._skip:
            return
        text = re.sub(r"\s+", " ", data).strip()
        if text:
            self.tokens.append(text)


def tokens_of(page: str) -> list[str]:
    parser = _Text()
    parser.feed(page)
    return parser.tokens


RANK_ROW = re.compile(r"^(\d{1,2})\s*[·•.:\-)]\s*(.+)$")
NOISE = re.compile(r"^(rank\b|champion$|interim champion$|view\b|see\b|\+?\d+$)", re.I)


def _is_name(token: str, labels: set[str]) -> bool:
    n = norm(token)
    return bool(re.search(r"[a-z]", n)) and n not in labels and not NOISE.match(n) and "pound-for-pound" not in n


def parse_rankings(page: str, labels: dict[str, str]) -> dict[str, dict]:
    """{division slug: {"champion": name|None, "ranked": [(rank, name)]}} for divisions found.

    `labels` maps a division's display label to its slug (men's and women's).
    """
    label_to_slug = {norm(label): slug for label, slug in labels.items()}
    label_set = set(label_to_slug)
    tokens = tokens_of(page)
    start = next((i for i, t in enumerate(tokens) if norm(t) == "all rankings"), None)
    if start is None:
        return {}
    end = next((i for i in range(start + 1, len(tokens)) if norm(tokens[i]) == "all meta rankings"), len(tokens))
    body = tokens[start + 1:end]

    found: dict[str, dict] = {}
    current = None
    i = 0
    while i < len(body):
        token, n = body[i], norm(body[i])
        if "pound-for-pound" in n:
            current = None
        elif n in label_set:
            current = label_to_slug[n]
            found.setdefault(current, {"champion": None, "ranked": {}})
        elif current is not None:
            row = found[current]
            if n == "champion":
                # The caption reads "<division> <champion> Champion <champion>":
                # take the name that follows, else the one that precedes.
                after = body[i + 1] if i + 1 < len(body) else ""
                before = body[i - 1] if i > 0 else ""
                pick = after if _is_name(after, label_set) else before if _is_name(before, label_set) else None
                if pick and row["champion"] is None:
                    row["champion"] = pick.strip()
            else:
                match = RANK_ROW.match(token)
                rank, name = None, None
                if match and _is_name(match.group(2), label_set):
                    rank, name = int(match.group(1)), match.group(2).strip()
                elif re.fullmatch(r"\d{1,2}", token) and i + 1 < len(body) and _is_name(body[i + 1], label_set):
                    rank, name = int(token), body[i + 1].strip()
                    i += 1
                if rank and 1 <= rank <= 15:
                    row["ranked"].setdefault((rank, name), None)
        i += 1

    return {slug: {"champion": row["champion"],
                   "ranked": sorted(row["ranked"], key=lambda r: (r[0], r[1]))}
            for slug, row in found.items()}


def usable(row: dict) -> str | None:
    """None if a parsed division can replace the saved one, else the reason it can't."""
    if not row.get("champion"):
        return "no champion found"
    if len(row.get("ranked", [])) < MIN_RANKED:
        return f"only {len(row.get('ranked', []))} ranked fighters (need {MIN_RANKED})"
    seen = [r for r, _ in row["ranked"]]
    if seen[0] != 1:
        return "ranking does not start at 1"
    return None


def resolver(previous: dict):
    """name -> slug, preferring slugs the site already uses."""
    by_name = {}
    for division in (previous.get("divisions") or {}).values():
        for row in division.get("ranked") or []:
            by_name[norm(row["name"])] = row["slug"]

    def resolve(name: str) -> str:
        return by_name.get(norm(name)) or slugify(name)
    return resolve


def apply(previous: dict, parsed: dict, today: dt.date, divisions_module) -> tuple[dict, dict]:
    """New data document and {slug: reason} for divisions that were kept as before."""
    resolve = resolver(previous)
    divisions = {k: dict(v) for k, v in (previous.get("divisions") or {}).items()}
    kept, updated = {}, 0
    for slug, label in divisions_module.DIVISIONS.items():
        row = parsed.get(slug)
        if row is None:
            kept[slug] = "not on the page"
            continue
        problem = usable(row)
        if problem:
            kept[slug] = problem
            continue
        champion_slug = resolve(row["champion"])
        ranked = [{"rank": 0, "slug": champion_slug, "name": row["champion"]}]
        ranked += [{"rank": rank, "slug": resolve(name), "name": name}
                   for rank, name in row["ranked"] if resolve(name) != champion_slug]
        old = divisions.get(slug, {})
        roster = set(old.get("roster") or []) | {r["slug"] for r in ranked}
        # The page carries no date. If the rankings are unchanged keep the date they
        # already have; if they changed, the day we first saw them is the best bound.
        same = [(r["rank"], r["slug"]) for r in old.get("ranked") or []] == [(r["rank"], r["slug"]) for r in ranked]
        ranking_date = (old.get("rankingDate") or today.isoformat()) if same else today.isoformat()
        divisions[slug] = {"label": label, "observedOn": today.isoformat(), "rankingDate": ranking_date,
                           "champion": {"slug": champion_slug, "name": row["champion"]},
                           "ranked": ranked, "roster": sorted(roster)}
        updated += 1
    doc = {"schema": 1, "source": SOURCE, "observedOn": today.isoformat(), "fetchedDivisions": updated,
           "divisions": divisions, "fighters": divisions_module.fighter_index(divisions),
           "diagnostics": {slug: {"reason": reason} for slug, reason in kept.items()}}
    # Roster details come from scripts/refresh-ufc-rosters.py; keep them.
    for field in ("rosterSource", "rosterObservedOn", "rosterDiagnostics"):
        if field in previous:
            doc[field] = previous[field]
    return doc, kept


def fetch(url: str = URL) -> str:
    request = urllib.request.Request(url, headers={
        "User-Agent": "BEFN-rankings-refresh/1.0 (single page, on demand)", "Accept": "text/html"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", help="read this saved page instead of fetching ufc.com")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args(argv)
    module = _divisions_module()
    page = Path(args.html).read_text(encoding="utf-8") if args.html else fetch()
    # Men's and women's labels as UFC.com prints them.
    labels = {label: slug for slug, label in module.DIVISIONS.items()}
    parsed = parse_rankings(page, labels)
    out = Path(args.out)
    previous = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
    doc, kept = apply(previous, parsed, dt.date.today(), module)
    for slug, reason in sorted(kept.items()):
        print(f"kept previous {slug}: {reason}")
    print(f"{doc['fetchedDivisions']}/{len(module.DIVISIONS)} divisions refreshed from {SOURCE}")
    if doc["fetchedDivisions"] < MIN_DIVISIONS:
        print(f"Fewer than {MIN_DIVISIONS} divisions parsed; nothing written.")
        return 2
    out.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
