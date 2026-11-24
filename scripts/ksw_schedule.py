"""KSW upcoming cards: official event list cross-checked with Wikipedia's fight card.

Neither source is enough alone (owner, 25 Nov 2026: "find another source"):
  - kswmma.com/en/events is official but server-renders only each event's number,
    date and main-event surnames; the full card comes from /apiksw, which KSW's
    robots.txt disallows, so it is never read;
  - English Wikipedia's "<year> in Konfrontacja Sztuk Walki" (CC BY-SA 4.0) has the
    full card with full names, divisions and title notes, but anyone can edit it.
A card is added only when Wikipedia's event matches the official list on KSW number,
date AND main-event surnames. Bout details beyond the main event come from Wikipedia
unverified, and the event note says so.

Rules (as for ONE and PFL): nothing is guessed, existing events are never changed,
and any fetch or parse problem keeps existing data. Pure functions; tests run on
saved pages (tests/fixtures/ksw/).
"""
from __future__ import annotations

from datetime import datetime
import re
import unicodedata

OFFICIAL_URL = "https://www.kswmma.com/en/events"
WIKI_API = "https://en.wikipedia.org/w/api.php?action=parse&page={year}_in_Konfrontacja_Sztuk_Walki&prop=wikitext&format=json&redirects=1"
WIKI_PAGE = "https://en.wikipedia.org/wiki/{year}_in_Konfrontacja_Sztuk_Walki"
PROMOTION = "KSW"
MONTHS = {m: i for i, m in enumerate(
    "January February March April May June July August September October November December".split(), 1)}


def fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().strip()


def surname(name: str) -> str:
    parts = fold(name).split()
    return parts[-1] if parts else ""


def _text(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


# ---------- official list ----------

def parse_official(page: str) -> dict[int, dict]:
    """KSW number -> {date, surnames, url} from kswmma.com/en/events."""
    out = {}
    for block in re.findall(r'<a href="(https://www\.kswmma\.com/en/event/[^"]+)"[^>]*>(.*?)</a>', page, re.S):
        url, inner = block
        num = re.search(r"\bKSW\s+(\d{2,4})\b", _text(inner))
        day = re.search(r"\b(\d{2})-(\d{2})-(\d{4})\b", inner)
        pair = re.search(r'<h2[^>]*>(.*?)</h2>', inner, re.S)
        if not (num and day and pair):
            continue
        names = re.split(r"\s+vs\.?\s+", _text(pair.group(1)), flags=re.I)
        if len(names) != 2:
            continue
        out[int(num.group(1))] = {
            "date": f"{day.group(3)}-{day.group(2)}-{day.group(1)}",
            "surnames": {surname(names[0]), surname(names[1])},
            "url": url,
        }
    if not out:
        raise ValueError("KSW events page: no events found (layout changed?)")
    return out


# ---------- Wikipedia ----------

def _unlink(s: str) -> str:
    s = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", s or "", flags=re.S)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    return re.sub(r"\s+", " ", s).strip()


def _fighter(field: str) -> tuple[str, str]:
    """('Paweł Pawlak', 'c') from '[[Paweł Pawlak]] (c)'."""
    tag = re.search(r"\((ic|c)\)\s*$", field.strip())
    return _unlink(re.sub(r"\((ic|c)\)\s*$", "", field)).strip(), (tag.group(1) if tag else "")


def _template_bodies(text: str, name: str) -> list[tuple[int, str]]:
    """(position, inner text) of each {{name|...}}, matching nested braces."""
    out, i = [], 0
    while True:
        i = text.find("{{" + name, i)
        if i < 0:
            return out
        depth, j = 0, i
        while j < len(text):
            if text.startswith("{{", j):
                depth += 1; j += 2; continue
            if text.startswith("}}", j):
                depth -= 1; j += 2
                if depth == 0:
                    break
                continue
            j += 1
        out.append((i, text[i + 2 + len(name):j - 2]))
        i = j


def _split_fields(body: str) -> list[str]:
    fields, depth, cur, k = [], 0, "", 0
    while k < len(body):
        two = body[k:k + 2]
        if two in ("{{", "[["):
            depth += 1; cur += two; k += 2; continue
        if two in ("}}", "]]"):
            depth -= 1; cur += two; k += 2; continue
        if body[k] == "|" and depth == 0:
            fields.append(cur); cur = ""; k += 1; continue
        cur += body[k]; k += 1
    fields.append(cur)
    return fields[1:] if fields and not fields[0].strip() else fields


def parse_wikipedia(wikitext: str, year: int) -> dict[int, dict]:
    """KSW number -> event parsed from one "<year> in KSW" page."""
    out = {}
    heads = list(re.finditer(r"^==\s*((?:XTB\s+)?KSW\s+(\d{2,4})[^=\n]*?)\s*==\s*$", wikitext, re.M))
    for n, h in enumerate(heads):
        section = wikitext[h.end(): heads[n + 1].start() if n + 1 < len(heads) else len(wikitext)]
        section = section.split("\n== ", 1)[0]
        info = {k.strip(): v.strip() for k, v in re.findall(r"^\|\s*(\w+)\s*=\s*(.*)$", section, re.M)}
        m = re.match(r"([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})", info.get("date", ""))
        if not m or m.group(1) not in MONTHS:
            continue
        day = f"{m.group(3)}-{MONTHS[m.group(1)]:02d}-{int(m.group(2)):02d}"
        card_pos = [(p, _unlink(b.lstrip("|"))) for p, b in _template_bodies(section, "MMAevent card")]
        bouts = []
        for pos, body in _template_bodies(section, "MMAevent bout"):
            f = _split_fields(body)
            if len(f) < 4 or not re.match(r"\s*vs\.?\s*$", f[2] or ""):
                continue
            (a, ta), (b, tb) = _fighter(f[1]), _fighter(f[3])
            if not a or not b or fold(a) == fold(b):
                continue
            card = next((c for p, c in reversed(card_pos) if p < pos), "")
            notes = _unlink(f[7]) if len(f) > 7 else ""
            bouts.append({"division": _unlink(f[0]), "fighters": [a, b], "card": card, "titles": (ta, tb), "notes": notes})
        title = re.sub(r"\s+", " ", h.group(1)).strip()
        out[int(h.group(2))] = {
            "title": title,
            "date": day,
            "venue": _unlink(info.get("venue", "")),
            "city": _unlink(info.get("city", "")),
            "bouts": bouts,
            "anchor": WIKI_PAGE.format(year=year) + "#" + title.replace(" ", "_"),
        }
    return out


# ---------- build ----------

def _note(b: dict, main_event: bool) -> str:
    n = ""
    if re.search(r"\binterim\b", b["notes"], re.I) and re.search(r"championship", b["notes"], re.I):
        n = "Interim KSW championship"
    elif re.search(r"championship", b["notes"], re.I):
        n = "KSW championship"
    if main_event:
        n = (n + " · main event") if n else "Main event"
    return n


def build_event(number: int, wiki: dict, official: dict, checked_at: str) -> dict | None:
    """The card, or None unless Wikipedia agrees with the official list on date and main event."""
    if not wiki["bouts"] or wiki["date"] != official["date"]:
        return None
    main = wiki["bouts"][0]
    if {surname(n) for n in main["fighters"]} != official["surnames"]:
        return None
    bouts = []
    for i, b in enumerate(wiki["bouts"]):
        section = "main" if re.search(r"main card", b["card"], re.I) or not b["card"] else "prelim"
        bout = {
            "id": f"ksw-{number}-{i + 1}",
            "section": section,
            "fighters": b["fighters"],
            "division": b["division"],
            "note": _note(b, i == 0),
            "source": wiki["anchor"],
        }
        bouts.append(bout)
    location = ", ".join(x for x in (wiki["venue"], wiki["city"]) if x)
    return {
        "id": f"ksw-{number}-{wiki['date']}",
        "date": wiki["date"],
        "sport": "mma",
        "promotion": PROMOTION,
        "title": wiki["title"].replace(" vs. ", " vs "),
        "location": location,
        "source": official["url"],
        "additionalSources": [wiki["anchor"]],
        "verifiedAt": checked_at[:10],
        "addedBy": "scripts/ksw_schedule.py",
        "note": ("Event, date and main event confirmed on KSW's official event list; "
                 "the rest of the card and divisions from Wikipedia, not yet checked against KSW."),
        "bouts": bouts,
    }


def build_events(official: dict[int, dict], wiki: dict[int, dict], checked_at: str, today: str) -> tuple[list[dict], list[str]]:
    """Cards for upcoming KSW events, plus a log line for each event skipped and why."""
    events, skipped = [], []
    for number, o in sorted(official.items()):
        if o["date"] < today:
            continue
        w = wiki.get(number)
        if not w:
            skipped.append(f"KSW {number}: not on Wikipedia yet")
            continue
        e = build_event(number, w, o, checked_at)
        if e:
            events.append(e)
        else:
            skipped.append(f"KSW {number}: Wikipedia and the official list disagree on date or main event")
    return events, skipped


def merge_new(events: list[dict], new: list[dict]) -> list[dict]:
    """Append KSW cards not already listed (same id/source, or a KSW card that day).
    Existing entries, including hand-edited ones, are never changed or removed."""
    known = {e.get("source") for e in events} | {e.get("id") for e in events}
    ksw_days = {e.get("date") for e in events if "ksw" in str(e.get("promotion", "")).lower()}
    added = [e for e in new if e["source"] not in known and e["id"] not in known and e["date"] not in ksw_days]
    events.extend(added)
    return added
