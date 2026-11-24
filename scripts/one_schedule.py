"""ONE Championship upcoming cards from onefc.com, MMA bouts only.

Reads two public pages:
  - https://www.onefc.com/events/  -> the "events-upcoming" menu template lists the
    next upcoming cards with a link, an exact start time (Unix seconds) and a venue;
  - each event page -> its fight-card matchups, each with a discipline/weight title
    ("Flyweight MMA", "Strawweight Muay Thai") and both athletes' names.

Rules (same as the hand-added ONE entries in data/upcoming-cards.json):
  - only bouts whose title says MMA are kept; Muay Thai and kickboxing are left out
    of the MMA feed;
  - an event with no MMA bout is not added;
  - bout order is not claimed: every bout is section "announced";
  - nothing is guessed: a card without a time, a venue or two named athletes is skipped.
Pure functions, so tests run on saved pages (tests/fixtures/one/).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from html import unescape
import re

EVENTS_URL = "https://www.onefc.com/events/"
PROMOTION = "ONE Championship"

# Venue-local date for the event's day. ONE gives an exact instant; the site shows
# fight days in the venue's calendar. Unknown venues fall back to UTC and say so.
VENUE_OFFSETS = [
    (re.compile(r"bangkok|thailand|lumpinee", re.I), 7, "Thailand"),
    (re.compile(r"singapore", re.I), 8, "Singapore"),
    (re.compile(r"manila|philippines", re.I), 8, "Philippines"),
    (re.compile(r"kuala lumpur|malaysia", re.I), 8, "Malaysia"),
    (re.compile(r"jakarta|indonesia", re.I), 7, "Indonesia"),
    (re.compile(r"tokyo|yokohama|osaka|saitama|japan|ariake", re.I), 9, "Japan"),
    (re.compile(r"doha|qatar|lusail", re.I), 3, "Qatar"),
]

_CARD = re.compile(r'<li class="menu-item menu-item-card">(.*?)</li>', re.S)
_MATCHUP = re.compile(
    r'<div class="event-matchup[^"]*">\s*<div class="title">\s*(.*?)\s*</div>.*?<tr class="vs">(.*?)</tr>', re.S)


def _text(s: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def parse_upcoming(page: str) -> list[dict]:
    """Upcoming cards from the events page's menu template: url, start (UTC), venue, title."""
    m = re.search(r'<template id="events-upcoming">(.*?)</template>', page, re.S)
    if not m:
        raise ValueError("ONE events page: upcoming template not found")
    cards = []
    for block in _CARD.findall(m.group(1)):
        href = re.search(r'href="(https://www\.onefc\.com/events/[a-z0-9-]+/)"', block)
        ts = re.search(r'data-timestamp="(\d{9,11})"', block)
        loc = re.search(r'class="location">([^<]*)<', block)
        title = re.search(r'class="title">([^<]*)<', block)
        if not (href and ts and loc and title):
            continue
        cards.append({
            "url": href.group(1),
            "start": datetime.fromtimestamp(int(ts.group(1)), tz=timezone.utc),
            "venue": _text(loc.group(1)),
            "title": _text(title.group(1)),
        })
    return cards


def parse_matchups(page: str) -> list[dict]:
    """Every matchup on an event page: title (weight + discipline) and both athletes."""
    out = []
    for title, row in _MATCHUP.findall(page):
        names = [_text(n) for n in re.findall(r'title="([^"]+)"', row)]
        if len(names) == 2 and all(names) and names[0] != names[1]:
            out.append({"title": _text(title), "fighters": names})
    return out


def venue_day(start: datetime, venue: str) -> tuple[str, str | None]:
    """The event's calendar day at the venue, and the country if the venue is known."""
    for pattern, hours, country in VENUE_OFFSETS:
        if pattern.search(venue):
            return (start + timedelta(hours=hours)).date().isoformat(), country
    return start.date().isoformat(), None


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def build_event(card: dict, matchups: list[dict], checked_at: str) -> dict | None:
    """A data/upcoming-cards.json event for one ONE card, or None if it has no MMA bout."""
    mma = [m for m in matchups if re.search(r"\bMMA\b", m["title"])]
    if not mma:
        return None
    day, country = venue_day(card["start"], card["venue"])
    event_slug = card["url"].rstrip("/").rsplit("/", 1)[-1]
    location = card["venue"] + (", " + country if country and country.lower() not in card["venue"].lower() else "")
    bouts = []
    for i, m in enumerate(mma, 1):
        bout = {
            "id": f"{event_slug}-mma-{i}",
            "section": "announced",
            "fighters": m["fighters"],
            "division": re.sub(r"\s*World Championship\s*$", "", m["title"]).strip(),
            "note": "Order TBC; discipline as listed on ONE official event page",
            "source": card["url"],
        }
        if re.search(r"World Championship", m["title"], re.I):
            bout["note"] = "ONE World Championship · " + bout["note"]
        bouts.append(bout)
    others = len(matchups) - len(mma)
    return {
        "id": f"{event_slug}-{day}",
        "date": day,
        "startAt": card["start"].isoformat().replace("+00:00", "Z"),
        "sport": "mma",
        "promotion": PROMOTION,
        "title": card["title"],
        "location": location,
        "source": card["url"],
        "verifiedAt": checked_at[:10],
        "addedBy": "scripts/one_schedule.py",
        "note": "MMA pairings from ONE's official event page; bout order TBC."
                + (f" {others} Muay Thai/kickboxing pairing{'s' if others != 1 else ''} omitted from the MMA feed." if others else ""),
        "bouts": bouts,
    }


def merge_new(events: list[dict], new: list[dict]) -> list[dict]:
    """Append ONE events whose source page isn't already in the feed. Existing entries,
    including hand-edited ones, are never changed or removed here."""
    known = {e.get("source") for e in events} | {e.get("id") for e in events}
    added = [e for e in new if e["source"] not in known and e["id"] not in known]
    events.extend(added)
    return added
