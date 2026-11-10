#!/usr/bin/env python3
"""Enrich ONE history with ONLY name-matched original athlete-page portraits.

ONE spans MMA, Muay Thai, kickboxing and submission grappling. Do not mistake
one same-named athlete for another, or use a random fight-story thumbnail.
Portrait URLs are saved only if the athlete profile itself names the competitor
and its featured media identifies the same athlete on ONE's official CDN.
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
PROGRESS = ROOT / "data/one-portrait-progress.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; BEFNONEArchive/1.2)",
           "Accept": "text/html"}
BATCH = 72
HOSTS = {"www.onefc.com", "onefc.com", "cdn.onefc.com"}

def words(text):
    plain = unicodedata.normalize("NFKD",str(text or "")).encode("ascii","ignore").decode().lower()
    return re.findall(r"[a-z0-9]+",plain)

def norm(text):
    return "".join(words(text))

def slug(name):
    return "-".join(words(name))

def valid_url(value):
    parsed = urllib.parse.urlparse(str(value or ""))
    return parsed.scheme=="https" and parsed.hostname in HOSTS and \
           not re.search(r"/(logo|icon|avatar-default|placeholder|share|sponsor)/",parsed.path.lower())

def verify(html, name, opponents=()):
    soup = BeautifulSoup(html,"html.parser")
    # A real ONE athlete page, not an article or similarly named fighter.
    headings = [tag.get_text(" ",strip=True) for tag in soup.find_all(["h1","h2","h3"])]
    if not any(text.lower().startswith("about ") and norm(text[6:])==norm(name) for text in headings):
        return None
    if norm(name)=="magomedmagomedov":
        # There are multiple unrelated Magomed Magomedovs in ONE's athlete
        # directory. Require the current competitor's documented opponent.
        text=norm(soup.get_text(" ",strip=True))
        if not any(norm(x)=="lucasgabriel" and norm(x) in text for x in opponents):
            return None

    # Explicit image-alt attribution gives strongest evidence.
    target=set(words(name))
    for img in soup.find_all("img"):
        alt=set(words(img.get("alt")))
        if not target.issubset(alt):
            continue
        for key in ("data-src","src","data-original"):
            uri=img.get(key)
            if valid_url(uri) and re.search(r"\.(png|jpe?g|webp)(\?|$)",uri,re.I):
                return uri
    # ONE profile featured OpenGraph imagery can be used only when its file
    # name explicitly contains the full athlete name, not a generic page art.
    meta=soup.find("meta",attrs={"property":"og:image"})
    uri=meta.get("content","") if meta else ""
    filebase=urllib.parse.unquote(urllib.parse.urlparse(uri).path.split("/")[-1])
    if valid_url(uri) and norm(name) in norm(filebase):
        return uri
    return None

def fetch(url):
    req=urllib.request.Request(url,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=12) as resp:
        return resp.read(1_500_000).decode("utf-8","replace") if resp.status==200 else ""

def profile_urls(name):
    """Generate conservative ONE profile locations; verify page identity before use."""
    aliases={"stampfairtex":"stamp"}
    clean=re.sub(r'[“"][^”"]+[”"]', '', str(name or ''))
    variants=[slug(name),slug(clean),aliases.get(norm(clean),"")]
    urls=[]
    for candidate in variants:
        if candidate and candidate not in urls:
            urls.append(candidate)
    return ["https://www.onefc.com/athletes/"+candidate+"/" for candidate in urls]

def inspect(item, fetcher=fetch):
    # The same athlete may have a shortened or nickname-free official URL.
    # Identity validation is always performed on the actual athlete page.
    for url in profile_urls(item["name"]):
        try:
            page=fetcher(url)
            img=verify(page,item["name"],item["opponents"]) if page else None
            if img:
                return {"photo":img,"source":url}
        except Exception:
            continue
    return None

def due(document, progress, today):
    roster={}
    for row in document.get("results",[]):
        if not str(row.get("eventId","")).startswith("one-"):
            continue
        for i,f in enumerate(row.get("fighters",[])):
            if f.get("photo") or not f.get("name"):
                continue
            key=norm(f["name"])
            item=roster.setdefault(key,{"name":f["name"],"opponents":set(),"lastDate":row["date"],
                                        "main":False,"appearances":0})
            for j,opponent in enumerate(row["fighters"]):
                if j!=i and opponent.get("name"):
                    item["opponents"].add(opponent["name"])
            item["lastDate"]=max(item["lastDate"],row["date"])
            item["main"] |= row.get("order")==0
            item["appearances"]+=1
    selected=[]
    for key,item in roster.items():
        old=progress.get("attempts",{}).get(key)
        if old:
            try:
                if (today-dt.date.fromisoformat(old["date"])).days < (14 if not old.get("found") else 1):
                    continue
            except (KeyError,ValueError):
                pass
        selected.append(item)
    return sorted(selected,key=lambda x:(not x["main"],-int(x["lastDate"].replace("-","")),-x["appearances"],x["name"]))

def assign(data,roster,findings):
    by_name={norm(item["name"]):info for item,info in zip(roster,findings) if info}
    updated=0
    for row in data.get("results",[]):
        if not str(row.get("eventId","")).startswith("one-"):
            continue
        for fighter in row.get("fighters",[]):
            hit=by_name.get(norm(fighter.get("name")))
            if hit and not fighter.get("photo"):
                fighter["photo"]=hit["photo"]
                fighter["photoSource"]=hit["source"]
                updated+=1
    return updated

def main():
    data=json.loads(RESULTS.read_text(encoding="utf-8"))
    progress=json.loads(PROGRESS.read_text(encoding="utf-8")) if PROGRESS.exists() else {"attempts":{}}
    today=dt.datetime.now(dt.timezone.utc).date()
    candidates=due(data,progress,today)[:BATCH]
    if not candidates:
        print("ONE official portraits: no profiles due")
        return
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        found=list(pool.map(inspect,candidates))
    for item,info in zip(candidates,found):
        progress["attempts"][norm(item["name"])]={"date":today.isoformat(),"found":bool(info),
                                                  **({"source":info["source"]} if info else {})}
    amount=assign(data,candidates,found)
    if amount:
        RESULTS.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    PROGRESS.write_text(json.dumps(progress,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("ONE official portraits:",sum(bool(x) for x in found),"athletes matched;",
          amount,"fight-card image placements for",len(candidates),"profiles checked")

if __name__=="__main__":
    main()
