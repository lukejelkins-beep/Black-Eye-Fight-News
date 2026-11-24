"""Shared reader for the free UFCStats export (Greco1899/scrape_ufc_stats CSVs).

Offline: reads CSV files from a local directory (default .cache/greco, or GRECO_DIR). Each fighter's UFC fight list is
built from ufc_fight_results.csv (BOUT "A vs. B", OUTCOME "W/L") joined to ufc_event_details.csv for the date.
Fighter pages come from ufc_fighter_details.csv. Names are the only join key the export offers, so a name shared by two
UFCStats fighters is reported as ambiguous and never guessed.
"""
import csv
import os
import re
import subprocess
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path

FILES = ("ufc_fight_results.csv", "ufc_event_details.csv", "ufc_fighter_details.csv")
FEEDER = re.compile(r"contender\s+series|road\s+to\s+ufc|\bdwcs\b", re.I)


def fold(text):
    t = unicodedata.normalize("NFKD", str(text or ""))
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in t if not unicodedata.combining(c)).lower())


def tokens(text):
    t = re.sub(r"([a-z])([A-Z])", r"\1 \2", str(text or ""))
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return ":".join(sorted(x for x in re.split(r"[^a-z0-9]+", t) if x))


def same_name(a, b):
    return fold(a) == fold(b) or (tokens(a) and tokens(a) == tokens(b))


def blob_sha(path):
    return subprocess.run(["git", "hash-object", str(path)], capture_output=True, text=True, check=True).stdout.strip()


class Greco:
    def __init__(self, directory=None):
        self.dir = Path(directory or os.environ.get("GRECO_DIR") or ".cache/greco")
        for f in FILES:
            if not (self.dir / f).exists():
                raise SystemExit(f"missing {self.dir / f}: download the Greco1899/scrape_ufc_stats CSVs first")
        self.event_date = {}
        with open(self.dir / "ufc_event_details.csv", newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                self.event_date[r["EVENT"].strip()] = datetime.strptime(r["DATE"].strip(), "%B %d, %Y").date().isoformat()
        self.fighter_urls = defaultdict(list)
        with open(self.dir / "ufc_fighter_details.csv", newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                name = (r["FIRST"].strip() + " " + r["LAST"].strip()).strip()
                url = r["URL"].strip().replace("http://", "https://")
                self.fighter_urls[fold(name)].append({"name": name, "url": url, "nickname": r["NICKNAME"].strip()})
        self.fights = defaultdict(list)          # fold(name) -> rows
        with open(self.dir / "ufc_fight_results.csv", newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                event = r["EVENT"].strip()
                parts = [p.strip() for p in r["BOUT"].split(" vs. ")]
                outs = r["OUTCOME"].strip().split("/")
                if len(parts) != 2 or len(outs) != 2:
                    continue
                for i in (0, 1):
                    self.fights[fold(parts[i])].append({
                        "name": parts[i], "opponent": parts[1 - i], "event": event,
                        "date": self.event_date.get(event), "result": {"W": "win", "L": "loss", "D": "draw",
                                                                     "NC": "no_contest"}.get(outs[i].strip()),
                        "method": r["METHOD"].strip(), "weightclass": r["WEIGHTCLASS"].strip(), "fightUrl": r["URL"].strip().replace("http://", "https://"),
                        "feeder": bool(FEEDER.search(event))})

    def snapshot(self):
        return {"repository": "https://github.com/Greco1899/scrape_ufc_stats",
                "fightResultsBlobSha": blob_sha(self.dir / "ufc_fight_results.csv"),
                "fighterDetailsBlobSha": blob_sha(self.dir / "ufc_fighter_details.csv"),
                "eventDetailsBlobSha": blob_sha(self.dir / "ufc_event_details.csv")}

    def career(self, name, cutoff):
        """UFC fights (no feeder events) on or before cutoff, oldest first, for a name. None when the name is shared."""
        people = self.fighter_urls.get(fold(name), [])
        rows = [r for r in self.fights.get(fold(name), []) if r["date"] and r["date"] <= cutoff and not r["feeder"]]
        return people, sorted(rows, key=lambda r: r["date"])
