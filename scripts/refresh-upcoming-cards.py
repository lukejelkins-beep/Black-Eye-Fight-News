"""Check announced cards every three hours; add only explicitly published named pairings.
No guesses about opponents, weight divisions, undercard placement, or event dates.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import hashlib
import json
import re
import xml.etree.ElementTree as ET

DATA = Path("data/upcoming-cards.json")
USER_AGENT = "Mozilla/5.0 (compatible; BlackEyeFightNews/1.0; card-monitor)"
FALLBACK_SCHEDULE = "https://danrafael.substack.com/p/the-updated-daily-fight-schedule-799"
FEED = "https://danrafael.substack.com/feed"
SPORTS = {"boxing"}
MONTHS = "January February March April May June July August September October November December".split()
MONTH_NUMBER = {m.lower(): i + 1 for i, m in enumerate(MONTHS)}
ROUND_BOUT = re.compile(
    r"^\s*([^,\n]{3,100}?)\s+vs\.?\s+([^,\n]{3,100}?),\s*(\d{1,2})\s+rounds?\b(?:,\s*(.*))?$",
    re.IGNORECASE,
)
HEADING = re.compile(r"^(" + "|".join(MONTHS) + r")\s+(\d{1,2}):\s*(.{2,120})$", re.I)


class PageText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lines = []
        self.buf = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        if tag in ("p", "li", "h1", "h2", "h3", "h4", "br"):
            self.flush()

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1
        if tag in ("p", "li", "h1", "h2", "h3", "h4"):
            self.flush()

    def handle_data(self, data):
        if not self.skip:
            self.buf.append(data)

    def flush(self):
        if self.buf:
            line = re.sub(r"\s+", " ", unescape("".join(self.buf))).strip()
            if line:
                self.lines.append(line)
            self.buf = []


def webpage(url, cap=1_200_000, timeout=14):
    if urlsplit(url).scheme != "https":
        raise ValueError("HTTPS sources only")
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/rss+xml,*/*"})
    with urlopen(req, timeout=timeout) as response:
        status = response.status
        data = response.read(cap)
    if status != 200 or not data:
        raise ValueError(f"Source returned HTTP {status}")
    return data.decode("utf-8", "replace")


def latest_schedule():
    try:
        feed = ET.fromstring(webpage(FEED))
        for item in feed.findall(".//item"):
            title = item.findtext("title", "")
            link = item.findtext("link", "").strip()
            if "daily fight schedule" in title.lower() and link.startswith("https://"):
                return link
    except Exception as exc:
        print(f"Schedule feed unavailable ({type(exc).__name__}); using last-known source.")
    return FALLBACK_SCHEDULE


def simplify(s):
    return re.sub(r"[^a-z0-9]", "", str(s).casefold())


def weight_class(detail):
    text = (detail or "").lower()
    for key, output in [
        ("super middleweight", "Super Middleweight"),
        ("super welterweight", "Super Welterweight"),
        ("junior middleweight", "Super Welterweight"),
        ("light heavyweight", "Light Heavyweight"),
        ("super featherweight", "Super Featherweight"),
        ("junior lightweight", "Super Featherweight"),
        ("super lightweight", "Super Lightweight"),
        ("junior welterweight", "Super Lightweight"),
        ("super bantamweight", "Super Bantamweight"),
        ("junior featherweight", "Super Bantamweight"),
        ("light flyweight", "Light Flyweight"),
        ("super flyweight", "Super Flyweight"),
        ("junior bantamweight", "Super Flyweight"),
        ("heavyweight", "Heavyweight"),
        ("cruiserweight", "Cruiserweight"),
        ("middleweight", "Middleweight"),
        ("welterweight", "Welterweight"),
        ("lightweight", "Lightweight"),
        ("featherweight", "Featherweight"),
        ("bantamweight", "Bantamweight"),
        ("flyweight", "Flyweight"),
        ("strawweight", "Strawweight"),
    ]:
        if key in text:
            return output
    return "Weight class not confirmed"


def parse_bout_lines(page):
    """Read only clearly structured matchup lines within dated place sections."""
    p = PageText()
    p.feed(page)
    p.flush()
    grouped = {}
    current = None
    for line in p.lines:
        h = HEADING.match(line)
        if h:
            current = (MONTH_NUMBER[h.group(1).lower()], int(h.group(2)), h.group(3).lower())
            grouped.setdefault(current, [])
            continue
        if current is None or " vs" not in line.lower():
            continue
        m = ROUND_BOUT.match(line)
        if not m:
            continue
        left, right, rounds, detail = m.groups()
        left, right = left.strip(), right.strip()
        if (not left[0].isupper() or not right[0].isupper() or
                simplify(right) in ("tba", "opponenttba") or
                simplify(left) in ("tba", "opponenttba")):
            continue
        if len(left.split()) > 7 or len(right.split()) > 7:
            continue
        grouped[current].append((left, right, int(rounds), detail or ""))
    return grouped


def matching_block(event, sections):
    if event.get("sport") not in SPORTS:
        return []
    try:
        y, month, day = (int(x) for x in event["date"].split("-"))
    except (ValueError, KeyError):
        return []
    if y != datetime.now(timezone.utc).year:
        return []
    existing = event.get("bouts", [])
    if not existing or len(existing[0].get("fighters", [])) < 2:
        return []
    primary = existing[0]["fighters"]
    aliases = [
        (simplify(primary[0]), simplify(primary[1])),
        (simplify(event.get("title", "").split(" vs ")[0]), simplify(event.get("title", "").split(" vs ")[-1])),
    ]
    for (mm, dd, location), rows in sections.items():
        if (mm, dd) != (month, day):
            continue
        if any((simplify(a), simplify(b)) in aliases or (simplify(b), simplify(a)) in aliases for a, b, _, _ in rows):
            return rows
    return []


def merge_bouts(event, rows, source):
    """Only append undisputed two-name matchups in the same event; order stays TBC."""
    existing = event.get("bouts", [])
    found = 0
    for first, second, rounds, detail in rows:
        pair = {simplify(first), simplify(second)}
        if len(pair) != 2 or "tba" in pair:
            continue
        duplicate = any({simplify(n) for n in b.get("fighters", [])} == pair for b in existing)
        if duplicate:
            continue
        # A known fighter with a TBA partner may now have a published opponent.
        tba = next((b for b in existing if simplify(first) in
                    {simplify(n) for n in b.get("fighters", [])}
                    and any(simplify(n) in ("tba", "opponenttba", "fightertbc") for n in b.get("fighters", []))), None)
        if tba:
            tba["fighters"] = [first, second]
            tba["source"] = source
            tba["note"] = (tba.get("note", "") + " · Opponent named in independent schedule").strip(" ·")
        else:
            event["bouts"].append({
                "id": "schedule-" + hashlib.sha256((event["id"] + first + second).encode()).hexdigest()[:10],
                "section": "announced",
                "fighters": [first, second],
                "division": weight_class(detail),
                "note": f"{rounds} rounds · Named in independent schedule; placement awaiting verification",
                "source": source,
            })
        found += 1
    return found



# These public event pages list the named pairings and both fighters' records.
# Records are accepted only when BOTH names match an existing scheduled bout.
FIGHTMAG_RECORD_PAGES = {
    "pacheco-fulghum-2026-11-14": "https://schedule.fightmag.com/events/diego-pacheco-vs-darius-fulghum/",
    "pfl-dubai-2026-11-14": "https://schedule.fightmag.com/events/pfl-dubai-november-14-2026/",
    "ufc-334-2026-11-14": "https://schedule.fightmag.com/events/ufc-334/",
    "azim-valenzuela-2026-12-04": "https://schedule.fightmag.com/events/adam-azim-vs-gabriel-gollaz-valenzuela/",
}
RECORD_TOKEN = r"\d{1,3}-\d{1,3}(?:-\d{1,3})?(?:,\s*\d{1,3}\s*KOs?)?"
RECORD_PAIR = re.compile(
    r"^\s*(?P<first>[^()\n]{2,85}?)\s*\((?P<first_record>" + RECORD_TOKEN
    + r")\)\s+vs\.?\s+(?P<second>[^()\n]{2,85}?)\s*\((?P<second_record>"
    + RECORD_TOKEN + r")\)",
    re.IGNORECASE,
)
FIGHTMAG_NAME_ALIASES = {
    "sergeybilostenniy": "sergeibilostenniy",
}


def record_key(name):
    """Strip accents but NEVER fuzzy-match people with similar last names."""
    import unicodedata
    plain = unicodedata.normalize("NFKD", str(name or ""))
    plain = "".join(c for c in plain if not unicodedata.combining(c))
    key = re.sub(r"[^a-z0-9]", "", plain.casefold())
    return FIGHTMAG_NAME_ALIASES.get(key, key)


def normalize_record(value):
    """W-L[-D] and an optional documented KO count, never a ranking."""
    cleaned = re.sub(r"\s+", " ", str(value or "")).strip()
    m = re.fullmatch(r"(\d{1,3}-\d{1,3}(?:-\d{1,3})?)(?:,\s*(\d{1,3})\s*KOs?)?", cleaned, re.I)
    if not m:
        return None
    return m.group(1) + (f" ({m.group(2)} KOs)" if m.group(2) else "")


def parse_fightmag_records(page):
    parser = PageText()
    parser.feed(page)
    parser.flush()
    rows = []
    for line in parser.lines:
        m = RECORD_PAIR.match(line)
        if m:
            one = normalize_record(m.group("first_record"))
            two = normalize_record(m.group("second_record"))
            if one and two:
                rows.append((m.group("first").strip(), one, m.group("second").strip(), two))
    return rows


def apply_source_records(event, rows, source):
    """Match whole pairs exactly, retaining a known record if the source cannot resolve it."""
    current = event.get("bouts", [])
    if not current or not rows:
        return 0
    headline = {record_key(n) for n in current[0].get("fighters", [])}
    # Do not enrich cards using a similar-looking event page.
    if not any({record_key(a), record_key(b)} == headline for a, _, b, _ in rows):
        return 0
    updates = 0
    for b in current:
        pair = b.get("fighters", [])
        if len(pair) != 2:
            continue
        expected = [record_key(n) for n in pair]
        if not expected[0] or not expected[1] or expected[0] == expected[1]:
            continue
        candidates = next((x for x in rows if
                           {record_key(x[0]), record_key(x[2])} == set(expected)), None)
        if not candidates:
            continue
        by_name = {record_key(candidates[0]): candidates[1],
                   record_key(candidates[2]): candidates[3]}
        records = list(b.get("records", [None, None]))
        sources = list(b.get("recordSources", [None, None]))
        while len(records) < 2:
            records.append(None)
        while len(sources) < 2:
            sources.append(None)
        for index, key in enumerate(expected):
            new = by_name.get(key)
            if new and (records[index] != new or sources[index] != source):
                records[index] = new
                sources[index] = source
                updates += 1
        if updates:
            b["records"] = records
            b["recordSources"] = sources
    return updates


def refresh_fightmag_record_sources(event, now):
    source = FIGHTMAG_RECORD_PAGES.get(event.get("id"))
    if not source:
        return 0
    html = webpage(source, cap=1_000_000)
    rows = parse_fightmag_records(html)
    changed = apply_source_records(event, rows, source)
    if rows:
        event["recordsLastCheckedAt"] = now
        event["recordsSource"] = source
    return changed


def check_event(event):
    source = event.get("source", "")
    try:
        body = webpage(source, cap=400_000, timeout=12)
        return event["id"], hashlib.sha256(body.encode()).hexdigest()[:24], True
    except Exception:
        return event["id"], None, False


def refresh_fightmag(event, now):
    """Secondary named-bout schedule when a primary journalist site blocks automated reads."""
    if event.get("id") != "pacheco-fulghum-2026-11-14":
        return 0
    source = "https://schedule.fightmag.com/events/diego-pacheco-vs-darius-fulghum/"
    page = webpage(source, cap=1_200_000)
    parsed = PageText()
    parsed.feed(page)
    parsed.flush()
    candidates = []
    for line in parsed.lines:
        # Published cards can include "(26-0, 19 KOs)" beside names.
        clean = re.sub(r"\([^)]*\)", "", line).strip()
        m = ROUND_BOUT.match(clean)
        if m:
            a, b, rounds, detail = m.groups()
            candidates.append((a.strip(), b.strip(), int(rounds), detail or ""))
    first_pair = {simplify(n) for n in event["bouts"][0]["fighters"]}
    if not any({simplify(a), simplify(b)} == first_pair for a, b, *_ in candidates):
        raise ValueError("Published event headline not confirmed in schedule")
    event["scheduleLastCheckedAt"] = now
    event["scheduleMirror"] = source
    return merge_bouts(event, candidates, source)



BOXEN1_FEED = "https://www.boxen1.com/feed/"
BOXEN1_EVENT = "kabayel-hysa-2026-11-28"
ARTICLE_PAIR = re.compile(
    r"^\s*Auf\s+Agit\s+Kabayel[-–]Undercard:\s*"
    r"([A-ZÄÖÜ][\wÄÖÜäöüß'’-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'’-]+){1,3})"
    r"\s+vs\.?\s+"
    r"([A-ZÄÖÜ][\wÄÖÜäöüß'’-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'’-]+){1,3})\s*$",
    re.I,
)
ARTICLE_ON = re.compile(
    r"^\s*([A-ZÄÖÜ][\wÄÖÜäöüß'’-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'’-]+){1,3})"
    r"\s+trifft\s+bei\s+Kabayel[-–]Event\s+auf\s+"
    r"([A-ZÄÖÜ][\wÄÖÜäöüß'’-]+(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß'’-]+){1,3})\s*$",
    re.I,
)


def article_undercard_pairs(body):
    """Only explicit, fully named two-person matchups in an event-related headline."""
    parser = PageText()
    parser.feed(body)
    parser.flush()
    pairs = []
    for line in parser.lines:
        # Parse headings explicitly tied to the Kabayel card; a generic "X vs Y"
        # in an unrelated recommendation/sidebar must never become an undercard.
        if not re.search(r"kabayel", line, re.I):
            continue
        if len(line) > 160:
            continue
        match = ARTICLE_PAIR.match(line) or ARTICLE_ON.match(line)
        if not match:
            continue
        first, second = (x.strip() for x in match.groups())
        if (simplify(first) != simplify(second) and
                all(len(name.split()) >= 2 for name in (first, second))):
            pairs.append((first, second))
    return list(dict.fromkeys(pairs))


def boxen1_article_urls():
    """Find fresh undercard articles by publisher RSS; do not invent Tapology URLs."""
    try:
        feed = ET.fromstring(webpage(BOXEN1_FEED, timeout=10))
        urls = []
        for item in feed.findall(".//item"):
            title = item.findtext("title", "").casefold()
            link = item.findtext("link", "").strip()
            if ("kabayel" in title and
                    ("undercard" in title or "vorprogramm" in title) and
                    urlsplit(link).hostname in {"www.boxen1.com", "boxen1.com"}):
                urls.append(link)
        return urls[:10]
    except Exception:
        return []


def refresh_kabayel_undercard(event, now):
    """Check boxer-news reports for clearly identified undercard pairings only.

    All secondary-source matchups are 'reported' and remain without main/prelim
    placement until the promoter publishes a full running order.
    """
    if event.get("id") != BOXEN1_EVENT:
        return 0
    sources = [
        x for x in event.get("additionalSources", [])
        if urlsplit(x).hostname in {"www.boxen1.com", "boxen1.com"}
    ]
    sources = list(dict.fromkeys(sources + boxen1_article_urls()))
    added = 0
    for url in sources[:12]:
        try:
            body = webpage(url, cap=850_000, timeout=10)
            text = PageText()
            text.feed(body)
            text.flush()
            article_text = " ".join(text.lines).casefold()
            if "kabayel" not in article_text or not re.search(r"28[.]?\s*(?:11[.]?|november)", article_text):
                continue
            for first, second in article_undercard_pairs(body):
                pair = {simplify(first), simplify(second)}
                if pair == {simplify(n) for n in event["bouts"][0]["fighters"]}:
                    continue
                if any(pair == {simplify(n) for n in b.get("fighters", [])}
                       for b in event.get("bouts", [])):
                    continue
                event["bouts"].append({
                    "id": "boxen1-" + hashlib.sha256((first + second).encode()).hexdigest()[:10],
                    "section": "announced",
                    "status": "reported",
                    "fighters": [first, second],
                    "records": [None, None],
                    "division": "Weight class not confirmed",
                    "note": "Undercard pairing reported by Boxen1; promoter confirmation and running order pending",
                    "source": url,
                })
                event.setdefault("additionalSources", []).append(url)
                added += 1
        except Exception:
            pass
    if sources:
        event["independentUndercardCheckedAt"] = now
    return added

def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    events = data["events"]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data["lastAttemptAt"] = now
    valid = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        for event_id, digest, ok in pool.map(check_event, events):
            event = next(e for e in events if e["id"] == event_id)
            event["sourceAccessible"] = ok
            if ok:
                valid += 1
                event["sourceLastCheckedAt"] = now
                if event.get("sourceDigest") != digest:
                    event["sourceDigest"] = digest
                    event["sourceChangedAt"] = now
    try:
        schedule = latest_schedule()
        blocks = parse_bout_lines(webpage(schedule, cap=2_000_000))
        added = 0
        for event in events:
            bouts = matching_block(event, blocks)
            if bouts:
                added += merge_bouts(event, bouts, schedule)
                event["scheduleLastCheckedAt"] = now
        data["scheduleSource"] = schedule
        data["scheduleLastCheckedAt"] = now
        print(f"Crosschecked schedule: {len(blocks)} venue/date sections, {added} additional named pairings")
    except Exception as exc:
        print(f"Independent schedule check failed ({type(exc).__name__}): retained previously verified bouts")
    for event in events:
        if event.get("id") == "pacheco-fulghum-2026-11-14":
            try:
                new_pairs = refresh_fightmag(event, now)
                print(f"Fightmag undercard cross-check successful; {new_pairs} newly listed pairings")
            except Exception as exc:
                print(f"Fightmag check unavailable ({type(exc).__name__}); previous verified pairings retained")
    record_updates = 0
    for event in events:
        if event.get("id") not in FIGHTMAG_RECORD_PAGES:
            continue
        try:
            record_updates += refresh_fightmag_record_sources(event, now)
        except Exception as exc:
            print(f"Record cross-check unavailable for {event['id']} ({type(exc).__name__}); prior records retained")
    print(f"Verified fighter records updated: {record_updates}")
    for event in events:
        if event.get("id") == BOXEN1_EVENT:
            updated = refresh_kabayel_undercard(event, now)
            print(f"Boxen1 independent Kabayel undercard: {updated} newly verified named reports")
    if valid:
        data["lastCheckedAt"] = now
        data["lastSuccessfulAt"] = now
    data["sourceChecks"] = {"accessible": valid, "total": len(events)}
    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Upcoming cards checked: {valid}/{len(events)} source pages accessible at {now}")


if __name__ == "__main__":
    main()
