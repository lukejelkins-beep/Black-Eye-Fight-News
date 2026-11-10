#!/usr/bin/env python3
"""Discover exact-event promotional artwork from UFC, ONE and PFL official pages.

This fills ONLY previously missing historical-poster entries. Existing manually
verified posters are never overwritten. A title or date mismatch is skipped.
A generic logo is not mistaken for event artwork. Failure to fetch a site is
non-fatal; the UI retains its verified fighter-portrait fallback.
"""
from __future__ import annotations
import concurrent.futures
import datetime as dt
from html.parser import HTMLParser
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "data/results.json"
OUTPUT = ROOT / "data/historical-posters.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BlackEyeFightNews/1.0 editorial event-art checker)",
    "Accept": "text/html,application/xhtml+xml",
}
PFL_PAGES = {
    "pfl-2026-10-16-chicago": "https://pflmma.com/event/pfl-chicago",
    "pfl-2026-10-10-africa-morocco": "https://pflmma.com/event/pfl-morocco",
    "pfl-2026-10-02-mena-riyadh": "https://pflmma.com/event/pflmena11/",
    "pfl-2026-08-22-tampa": "https://pflmma.com/event/pfl-tampa",
    "pfl-2026-08-07-charlotte": "https://pflmma.com/event/pfl-charlotte",
    "pfl-2026-07-31-new-york": "https://pflmma.com/event/pfl-new-york",
    "pfl-2026-07-25-washington-dc": "https://pflmma.com/event/pfl-washington-dc-2026",
    "pfl-2026-07-18-austin": "https://pflmma.com/event/pfl-austin-2026/",
    "pfl-2026-07-10-mena-10": "https://pflmma.com/event/pflmena10",
    "pfl-2026-06-27-san-diego": "https://pflmma.com/event/pfl-san-diego",
    "pfl-2026-06-13-africa-nigeria": "https://pflmma.com/event/pfl-africa-nigeria",
    "pfl-2026-05-24-mena-9": "https://pflmma.com/event/pflmena-9",
    "pfl-2026-05-23-brussels": "https://pflmma.com/event/pfl-brussels-2026",
}
ONE_RE = [
    (re.compile(r"friday fights?\s+(\d{2,3})", re.I), "one-friday-fights-"),
    (re.compile(r"fight night\s+(\d{1,3})", re.I), "onefightnight"),
    (re.compile(r"samurai\s+(\d{1,2})", re.I), "one-samurai-"),
]
BAD_IMAGES = re.compile(r"(?:/logo(?:s)?/|(?:site|one|pfl|ufc)[-_]?logo|placeholder|default[_-]?(?:image|poster)|transparent\.png|favicon|avatar|social-share-default)", re.I)


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}
        self.images = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            name = attrs.get("property", attrs.get("name", "")).lower()
            val = attrs.get("content", "")
            if name and val:
                self.meta[name] = val
        if tag == "img" and len(self.images) < 240:
            candidate = (attrs.get("data-src") or attrs.get("data-lazy-src") or attrs.get("src") or "")
            if not candidate or candidate.startswith("data:"):
                candidate = (attrs.get("data-srcset") or attrs.get("srcset") or "").split(",")[0].strip().split(" ")[0]
            self.images.append((attrs.get("alt", ""), candidate))


def metadata(url):
    with urlopen(Request(url, headers=HEADERS), timeout=14) as response:
        if response.status != 200:
            raise ValueError("HTTP " + str(response.status))
        if "html" not in response.headers.get("Content-Type", "text/html"):
            raise ValueError("Not an HTML event page")
        text = response.read(1800000).decode("utf-8", "replace")
    parser = Metadata()
    parser.feed(text)
    return parser, text


def event_pages(event, by_date):
    name = event.get("name", "")
    eid = event.get("id", "")
    date = event.get("date", "")
    if "one" in eid.lower():
        for expr, slug in ONE_RE:
            match = expr.search(name)
            if match:
                return [("ONE", "https://www.onefc.com/events/" + slug + match.group(1) + "/", match.group(1))]
        # The Inner Circle has one combined official promotional image with its
        # corresponding Friday Fights show on the very same date.
        if "inner circle" in name.lower():
            other = next((e for e in by_date.get(date, []) if e["id"] != eid and
                          re.search(r"friday fights?\s+\d+", e["name"], re.I)), None)
            if other:
                return event_pages(other, by_date)
        return []
    if eid.startswith("pfl-"):
        page = PFL_PAGES.get(eid)
        return [("PFL", page, event["name"].split(":")[0])] if page else []
    if eid.startswith("ufc-"):
        number = re.search(r"\bufc\s+(\d{3})\b", name, re.I)
        if number:
            return [("UFC", "https://www.ufc.com/event/ufc-" + number.group(1), number.group(1))]
        if date:
            day = dt.date.fromisoformat(date)
            month = day.strftime("%B").lower()
            suffix = f"{month}-{day.day:02d}-{day.year}"
            return [("UFC", "https://www.ufc.com/event/ufc-fight-night-" + suffix, suffix)]
    return []


def identity_match(promotion, page, html, event, ident):
    title = " ".join([page.meta.get("og:title", ""), page.meta.get("twitter:title", "")]).lower()
    whole = html.lower()
    event_date = event.get("date", "")
    if not title or not event_date or str(dt.date.fromisoformat(event_date).year) not in whole:
        return False
    if promotion == "ONE":
        if "one" not in title:
            return False
        # Match a specific event NUMBER, not any of the many older-event links.
        if ident.isdigit():
            if "friday fights" in event["name"].lower():
                return bool(re.search(r"friday fights?\s*" + re.escape(ident) + r"\b", title))
            if "fight night" in event["name"].lower():
                return bool(re.search(r"fight night\s*" + re.escape(ident) + r"\b", title))
            if "samurai" in event["name"].lower():
                return bool(re.search(r"samurai\s*" + re.escape(ident) + r"\b", title))
        return False
    if promotion == "PFL":
        city = event["name"].split(":")[0].replace("PFL", "").strip().lower()
        # PFL sometimes publishes Washington D.C. instead of Washington DC.
        normalize = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())
        if "pfl" not in title or (city and normalize(city) not in normalize(title)):
            return False
        return True
    if promotion == "UFC":
        if "ufc" not in title and "noche ufc" not in title:
            return False
        if re.fullmatch(r"\d{3}", ident):
            return bool(re.search(r"\bufc\s*" + re.escape(ident) + r"\b", title))
        names = re.search(r":\s*(.*?)\s+vs\.?\s+(.*)$", event["name"], re.I)
        if names and all(x.lower().strip().split()[-1] in whole for x in names.groups()):
            return True
        # An event page must include the full date; do not attach a generic
        # UFC page from the same organization merely because a year matched.
        date = dt.date.fromisoformat(event_date)
        return (date.strftime("%B").lower() in whole and
                re.search(r"\b" + str(date.day) + r"\b", whole) is not None)
    return False


def pick_image(meta, html, url, event):
    image = meta.meta.get("og:image:secure_url") or meta.meta.get("og:image") or meta.meta.get("twitter:image")
    candidates = [image] if image else []
    # Official ONE event pages use show-specific asset codes: OFF175, OFN49,
    # ONESamurai4. Match the *exact* number and official page identity.
    # This avoids accidentally using a previous event's artwork.
    event_name = event.get("name", "")
    number = re.search(r"friday fights?\s+(\d{2,3})", event_name, re.I)
    if number:
        image_code = re.compile(r"\bOFF[-_ ]?" + re.escape(number.group(1)) + r"\b", re.I)
    else:
        number = re.search(r"fight night\s+(\d{1,3})", event_name, re.I)
        if number:
            image_code = re.compile(r"\b(?:OFN[-_ ]?|ONE[ _-]?FIGHT[ _-]?NIGHT[ _-]?)" + re.escape(number.group(1)) + r"\b", re.I)
        else:
            number = re.search(r"samurai\s+(\d{1,2})", event_name, re.I)
            image_code = re.compile(r"\b(?:ONESamurai|OS)[-_ ]?" + re.escape(number.group(1)) + r"\b", re.I) if number else None
    for alt, candidate in meta.images:
        combined = alt + " " + candidate
        if image_code and image_code.search(combined):
            candidates.insert(0, candidate)
    # When the OG image is a generic logo, fall back to an identity-checked
    # event image; never select the first unrelated news thumbnail.
    if not image or BAD_IMAGES.search(image):
        tokens = [t.lower() for t in re.findall(r"[\w]+", event_name) if len(t) > 3 and
                  t.lower() not in ("fight", "night", "championship", "friday", "results", "archive")]
        for alt, candidate in meta.images:
            low = alt.lower()
            if candidate and len(tokens)>1 and sum(t in low for t in tokens) >= 2:
                candidates.append(candidate)
    for candidate in candidates:
        if not candidate:
            continue
        href = urljoin(url, candidate)
        parts = urlparse(href)
        if parts.scheme != "https" or BAD_IMAGES.search(href):
            continue
        if not re.search(r"\.(?:webp|jpe?g|png)(?:[?#]|$)", href, re.I):
            # Official CDNs can use rendition URLs without a file extension,
            # but reject generic dynamic routing rather than guessing.
            continue
        return href
    return ""


def inspect(task):
    event, by_date = task
    for promotion, url, ident in event_pages(event, by_date):
        try:
            meta, html = metadata(url)
            if not identity_match(promotion, meta, html, event, ident):
                print("Unmatched official event title:", event["id"], url)
                continue
            image = pick_image(meta, html, url, event)
            if image:
                return event["id"], {
                    "url": image,
                    "source": url,
                    "kind": "event-art",
                    "verifiedEventDate": event["date"],
                }
            print("No event image:", event["id"], url)
        except Exception as exc:
            print("Official poster page not available:", event["id"], str(exc)[:100])
    return event["id"], None


def main():
    data = json.loads(RESULTS.read_text(encoding="utf-8"))
    existing = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {"events": {}}
    entries = existing.setdefault("events", {})
    by_date = {}
    for event in data.get("events", []):
        by_date.setdefault(event["date"], []).append(event)
    eligible = [e for e in data.get("events", []) if
                e.get("id", "").startswith(("ufc-", "pfl-", "one-")) and
                e.get("id") not in entries]
    added = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for eid, item in pool.map(inspect, ((e, by_date) for e in eligible)):
            if item:
                entries[eid] = item
                added.append(eid)
    # ONE's Inner Circle is sometimes billed as a second session of the same
    # Friday event. Reuse the officially verified poster for that same date only.
    for event in eligible:
        if event["id"] in entries or "inner circle" not in event["name"].lower():
            continue
        friday = next((e for e in by_date.get(event["date"], []) if
                       re.search(r"friday fights?\s+\d+", e["name"], re.I) and e["id"] in entries), None)
        if friday:
            entries[event["id"]] = {**entries[friday["id"]], "kind": "shared-event-art",
                                     "verifiedEventDate": event["date"]}
            added.append(event["id"])
    print(f"Historical poster lookup: checked {len(eligible)} missing events; added {len(added)} exact-event official artwork; indexed {len(entries)}.")
    if added:
        existing["reviewedAt"] = dt.datetime.now(dt.timezone.utc).date().isoformat()
        OUTPUT.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("New poster entries:", ", ".join(added))
    else:
        print("No index changes; retaining previous original posters.")


if __name__ == "__main__":
    main()
