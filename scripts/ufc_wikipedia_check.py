"""Second-source check for a UFC bout: the event's own Wikipedia article (owner choice, 24 Nov 2026).

Since the paid collector was switched off, new UFC fights reach BEFN only through the free UFCStats export, which is
also the source certificates are built from. A fight that saved UFCalendar history does not hold is therefore
certified only when the event's Wikipedia article (read with the parser the results importer already uses as its
fallback, scripts/import-finished-ufc-results.py) lists the same two fighters on the same day (within one day) with
the same result. Nothing is guessed: a missing article, a missing bout or a different result is "not confirmed".

Network: en.wikipedia.org only, with a plain User-Agent, articles cached per run.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UA = {"User-Agent": "BEFN-Certification-Check/1.0"}


def _module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def http_get(url, tries=5):
    """Polite fetch: one request at a time, a short pause between requests, a long back-off on 429."""
    for i in range(tries):
        try:
            time.sleep(1.0)
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read(8_000_000).decode("utf-8", "replace")
        except Exception as exc:
            if i == tries - 1:
                raise
            time.sleep((20 if "429" in str(exc) else 3) * (i + 1))


class Wikipedia:
    def __init__(self, fetch=http_get):
        self.importer = _module("befn_ufc_importer", ROOT / "scripts" / "import-finished-ufc-results.py")
        self.shared = self.importer.wiki_parser()
        self.fetch = fetch
        self.cache = {}

    def events(self, day: str):
        """Parsed UFC event articles listed within a day of this date (cached)."""
        if day not in self.cache:
            try:
                self.cache[day] = self.importer.wiki_events_for(dt.date.fromisoformat(day), self.fetch, self.shared)
            except Exception as exc:     # unavailable: not confirmed, never assumed, and not cached
                return exc
        return self.cache[day]

    def confirm(self, fighter: str, opponent: str, day: str, result: str):
        """(article URL, event name) when the article lists this bout with this result for `fighter`; else (None, why)."""
        events = self.events(day)
        if isinstance(events, Exception):
            return None, f"Wikipedia unavailable: {events}"
        norm, key = self.importer.norm, self.importer.pair_key
        want = key(fighter, opponent)
        for e in events:
            if abs((dt.date.fromisoformat(e["date"]) - dt.date.fromisoformat(day)).days) > 1:
                continue
            for b in e["bouts"]:
                if len(b.get("fighters", [])) != 2 or key(*b["fighters"]) != want:
                    continue
                if b.get("outcome") == "no contest":
                    got = "no_contest"
                elif b.get("outcome") == "draw":
                    got = "draw"
                elif b.get("winner") in (0, 1):
                    got = "win" if norm(b["fighters"][b["winner"]]) == norm(fighter) else "loss"
                else:
                    got = None
                if got == result:
                    return {"url": e["url"].split("#")[0], "event": e["name"]}, None
                return None, f"Wikipedia gives {got} for {fighter} v {opponent} on {e['date']}"
        return None, f"no Wikipedia article lists {fighter} v {opponent} near {day}"


def evidence(found: dict, checked_on: str) -> dict:
    """The fields a register bout keeps for its second source."""
    return {"secondSource": "wikipedia-event-article", "secondSourceUrl": found["url"],
            "secondSourceEvent": found["event"], "secondSourceCheckedOn": checked_on}


if __name__ == "__main__":
    import sys
    w = Wikipedia()
    print(json.dumps(w.confirm(*sys.argv[1:5]), indent=1))
