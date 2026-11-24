#!/usr/bin/env python3
"""Fill data/ufc-fighter-countries.json from a saved copy of Wikipedia's "List of current UFC fighters".

The countries file already names this page as its source (the ISO column, as shown on UFC telecasts; not a statement
of citizenship). This script reads the page's wikitext from a local file, so it runs offline and the same input always
gives the same output:

    curl -A "BEFN-build/1.0" -o ufc.wiki \
      "https://en.wikipedia.org/w/index.php?title=List_of_current_UFC_fighters&action=raw"
    python scripts/build-ufc-fighter-countries.py ufc.wiki

Rules:
- Existing entries are never changed; only fighters with no country yet are added.
- A name listed twice with different countries, or a row with two flags, is left out, not guessed.
- The name is the cell right after the flag: a {{sortname}}, a [[link]] or, in the signings, departures and injury
  tables, plain text.
- Every code must be in CODES below (the page mixes Olympic and ISO three-letter codes); an unknown code fails the run.
- Values are flag-icons file names (ISO 3166-1 alpha-2, plus gb-eng, gb-sct, gb-wls for the UK nations).
Prints the flag codes that have no file in assets/img/flags/, so they can be added from flag-icons (MIT).
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/ufc-fighter-countries.json"
FLAGS = ROOT / "assets/img/flags"

# Three-letter codes used on the page (Olympic, FIFA and ISO alpha-3 all appear) -> flag-icons file name.
CODES = {
    "ABW": "aw", "AGO": "ao", "ALB": "al", "ARG": "ar", "ARM": "am", "ARU": "aw", "AUS": "au", "AUT": "at",
    "AZE": "az", "BEL": "be", "BHR": "bh", "BRA": "br", "CAN": "ca", "CHE": "ch", "CHI": "cl", "CHL": "cl",
    "CHN": "cn", "CMR": "cm", "COL": "co", "CRO": "hr", "CUB": "cu", "CZE": "cz", "DEN": "dk", "DEU": "de",
    "DNK": "dk", "DOM": "do", "DRC": "cd", "ECU": "ec", "ENG": "gb-eng", "ESP": "es", "FIN": "fi", "FRA": "fr",
    "GEO": "ge", "GER": "de", "HUN": "hu", "INA": "id", "IND": "in", "IRE": "ie", "IRL": "ie", "IRN": "ir",
    "IRQ": "iq", "ISL": "is", "ITA": "it", "JAM": "jm", "JPN": "jp", "KAZ": "kz", "KGZ": "kg", "KOR": "kr",
    "LIT": "lt", "LTU": "lt", "MAR": "ma", "MDA": "md", "MEX": "mx", "MMR": "mm", "MNE": "me", "MNG": "mn",
    "MYANMAR": "mm", "NED": "nl", "NEP": "np", "NGA": "ng", "NGR": "ng", "NOR": "no", "NZL": "nz", "PAN": "pa",
    "PER": "pe", "POL": "pl", "POR": "pt", "PSE": "ps", "ROU": "ro", "RUS": "ru", "SCO": "gb-sct", "SEN": "sn",
    "SRB": "rs", "SUI": "ch", "SVK": "sk", "SWE": "se", "THA": "th", "TJK": "tj", "TUR": "tr", "UAE": "ae",
    "UGA": "ug", "UKR": "ua", "USA": "us", "UZB": "uz", "VEN": "ve", "WAL": "gb-wls", "ZAF": "za",
}

FLAG_RE = re.compile(r"\{\{#invoke:flag\|icon\|([^}|]+)\}\}")
SORTNAME_RE = re.compile(r"\{\{sortname\|([^|}]*)\|([^|}]*)(?:\|[^}]*)?\}\}")
LINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")
PLAIN_NAME_RE = re.compile(r"[^\W\d_][^\W\d_ .'\-]*(?:[ .'\-]+[^\W\d_][^\W\d_.'\-]*)*\.?")


def fold(text: str) -> str:
    """Same as BEFNSnapshotTiles.fold in assets/snapshot-tiles.js."""
    t = unicodedata.normalize("NFKD", str(text or ""))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", t.lower())


def cell_name(cell: str) -> str:
    name = _cell_name(cell)
    # The champions table puts the title date (a link to the event) after the flag: never a fighter's name.
    return "" if re.search(r"\d", name) else name


def _cell_name(cell: str) -> str:
    m = SORTNAME_RE.search(cell)
    if m:
        return (m.group(1).strip() + " " + m.group(2).strip()).strip()
    m = LINK_RE.search(cell)
    if m:
        name = m.group(2) or re.sub(r"\s*\([^)]*\)\s*$", "", m.group(1))
        return name.strip()
    # The signings, departures and injury tables give the name as plain text.
    plain = cell.strip()
    if PLAIN_NAME_RE.fullmatch(plain) and " " in plain:
        return plain
    return ""


def parse(wikitext: str) -> dict[str, set[str]]:
    """Folded fighter name -> set of flag codes, one entry per table row that has a flag and a name."""
    found: dict[str, set[str]] = {}
    for row in re.split(r"\n\|-", wikitext):
        flags = FLAG_RE.findall(row)
        if len(flags) != 1:
            continue  # no flag, or two flags for one fighter: left out rather than guessed
        m = FLAG_RE.search(row)
        raw = m.group(1).strip()
        code = CODES.get(raw.upper())
        if code is None:
            raise SystemExit(f"unknown country code on the page: {raw!r}; add it to CODES")
        after = row[m.end():]
        cells = after.split("\n|")
        name = cell_name(cells[1]) if len(cells) > 1 else ""
        if name:
            found.setdefault(fold(name), set()).add(code)
    return found


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    found = parse(Path(sys.argv[1]).read_text(encoding="utf-8"))
    data = json.loads(OUT.read_text(encoding="utf-8"))
    fighters = data["fighters"]
    added = ambiguous = 0
    for key, codes in sorted(found.items()):
        if key in fighters or not key:
            continue
        if len(codes) != 1:
            ambiguous += 1
            continue
        fighters[key] = next(iter(codes))
        added += 1
    data["fighters"] = dict(sorted(fighters.items()))
    data["filled"] = f"{date.today().isoformat()}: scripts/build-ufc-fighter-countries.py from the same page; existing entries kept"
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    missing = sorted({c for c in fighters.values() if not (FLAGS / f"{c}.svg").exists()})
    print(json.dumps({"rows": len(found), "added": added, "ambiguous": ambiguous, "total": len(fighters),
                      "flags_missing": missing}))


if __name__ == "__main__":
    main()
