#!/usr/bin/env python3
"""Careful PFL portraits: use only an exact athlete profile on pflmma.com.

Never guess CDN hashes or assign an opponent's photograph. A profile title must
match the fighter's name, and the returned image must be the profile hero bodyshot
from PFL's published athlete image CDN. Progress is retained across daily runs;
unavailable profiles are reconsidered after two weeks.
"""
from __future__ import annotations
import concurrent.futures
import datetime as dt
import json
import pathlib
import re
import unicodedata
import urllib.parse
import urllib.request

from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parents[1]
RESULTS = ROOT / "data/results.json"
PROGRESS = ROOT / "data/pfl-portrait-progress.json"
PROFILE_BASE = "https://pflmma.com/"
CDN_HOSTS = {"pflmma-prod.s3.amazonaws.com", "pflmma-prod.s3.us-east-1.amazonaws.com"}
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; BEFNArchivePortraits/1.1)",
           "Accept": "text/html"}
BATCH = 32

def norm(name):
    text = unicodedata.normalize("NFKD", str(name or "")).encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+","",text)

def slug(name):
    text = unicodedata.normalize("NFKD", str(name or "")).encode("ascii","ignore").decode().lower()
    return re.sub(r"-+","-",re.sub(r"[^a-z0-9]+","-",text)).strip("-")

def verify_profile(html, expected):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    # PFL titles: "Thad Jean | Welterweight (170)". A generic page,
    # wrong athlete, or mismatched near-name must never supply an image.
    actual = re.split(r"\s*[|–—]\s*",title)[0].strip()
    if norm(actual) != norm(expected):
        return None
    for img in soup.find_all("img"):
        label = str(img.get("alt") or "").strip().lower()
        if label not in ("fighter", "fighter portrait", "fighter photo"):
            continue
        for key in ("src","data-src","data-original"):
            url = str(img.get(key) or "")
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme != "https" or parsed.hostname not in CDN_HOSTS:
                continue
            if not parsed.path.startswith("/fighters/bodyshots/"):
                continue
            return url
    return None

def url_candidates(name, event_ids):
    s = slug(name)
    preferred = ["regular-fighter","mena-fighter","africa-fighter"]
    if any("mena" in e for e in event_ids):
        preferred = ["mena-fighter","regular-fighter","africa-fighter"]
    elif any("africa" in e for e in event_ids):
        preferred = ["africa-fighter","regular-fighter","mena-fighter"]
    return [PROFILE_BASE + kind + "/" + s for kind in preferred]

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=10) as response:
        if response.status != 200:
            return ""
        return response.read(1_500_000).decode("utf-8","replace")

def inspect(name, event_ids, fetcher=fetch):
    for url in url_candidates(name,event_ids):
        try:
            picture = verify_profile(fetcher(url), name)
            if picture:
                return {"picture":picture, "source":url}
        except Exception:
            continue
    return None

def candidates(document, progress, today):
    roster = {}
    for row in document.get("results",[]):
        if not str(row.get("eventId","")).startswith("pfl-"):
            continue
        for fighter in row.get("fighters",[]):
            key = norm(fighter.get("name"))
            if not key or fighter.get("photo"):
                continue
            item = roster.setdefault(key,{"name":fighter.get("name"),"eventIds":set(),"count":0,
                                        "headliner":bool(row.get("order")==0)})
            item["eventIds"].add(row["eventId"])
            item["count"] += 1
            item["headliner"] |= row.get("order")==0
    ready = []
    for key,item in roster.items():
        history = progress.get("attempts",{}).get(key,{})
        last = history.get("date")
        if last:
            try:
                if (today - dt.date.fromisoformat(last)).days < (14 if history.get("found") is False else 1):
                    continue
            except ValueError:
                pass
        ready.append(item)
    # Headliners/co-main fighters first; then repeat competitors, then alphabetic.
    return sorted(ready,key=lambda x:(not x["headliner"],-x["count"],x["name"]))

def apply(document, roster, results):
    count = 0
    lookup = {norm(row["name"]):details for row,details in zip(roster,results) if details}
    for row in document.get("results",[]):
        if not str(row.get("eventId","")).startswith("pfl-"):
            continue
        for fighter in row.get("fighters",[]):
            details = lookup.get(norm(fighter.get("name")))
            if details and not fighter.get("photo"):
                fighter["photo"] = details["picture"]
                fighter["photoSource"] = details["source"]
                count += 1
    return count

def main():
    data = json.loads(RESULTS.read_text(encoding="utf-8"))
    state = json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {"attempts":{}}
    today = dt.datetime.now(dt.timezone.utc).date()
    roster = candidates(data,state,today)[:BATCH]
    if not roster:
        print("No PFL athlete profiles due to be rechecked")
        return
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        found = list(pool.map(lambda item:inspect(item["name"],item["eventIds"]),roster))
    for item,detail in zip(roster,found):
        state["attempts"][norm(item["name"])]={"date":today.isoformat(),
                                               "found":bool(detail),
                                               **({"source":detail["source"]} if detail else {})}
    count = apply(data,roster,found)
    if count:
        RESULTS.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    PROGRESS.write_text(json.dumps(state,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Official PFL portraits:",count,"fighter image references added;",
          sum(bool(x) for x in found),"exact athlete profiles matched out of",len(roster))

if __name__ == "__main__":
    main()
