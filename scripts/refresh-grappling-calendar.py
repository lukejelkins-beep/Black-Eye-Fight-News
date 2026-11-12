#!/usr/bin/env python3
"""Budget-free official-source check and conservative RAF calendar discovery.

Every published matchup, cancellation, location and clock must be supported by
a precise organiser reference. A missing/dead page is never proof of cancellation.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/grappling-events.json"
AUDIT = ROOT / "qa/grappling-calendar-source-audit.json"
SOURCES = {
 "RAF": "https://www.realamericanfreestyle.com/events-gallery",
 "UFC BJJ": "https://www.ufc.com/ufcbjj",
 "IBJJF": "https://ibjjf.com/events",
 "ADCC": "https://adcombat.com/",
 "NCAA": "https://www.ncaa.org/championship/division-i/mens-wrestling/",
 "UWW": "https://uww.org/events",
 "ONE Grappling": "https://www.onefc.com/events/",
}
ALLOWED = {"realamericanfreestyle.com", "ufc.com", "ibjjf.com",
           "adcombat.com", "ncaa.org", "uww.org", "onefc.com"}
MONTHS = {dt.date(2000, i, 1).strftime("%b").lower(): i for i in range(1, 13)}
DATE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*(20\d{2})\b", re.I)
RAF = re.compile(r"\bRAF\s*(\d{2})\b", re.I)

class VisibleText(HTMLParser):
 def __init__(self):
  super().__init__(); self.parts=[]; self.skip=0
 def handle_starttag(self,tag,attrs):
  if tag in {"script","style","svg"}: self.skip+=1
 def handle_endtag(self,tag):
  if tag in {"script","style","svg"}: self.skip=max(0,self.skip-1)
 def handle_data(self,data):
  if not self.skip: self.parts.append(data)
 def text(self):
  return re.sub(r"\s+"," ",html.unescape(" ".join(self.parts))).strip()

def visible(page):
 parser=VisibleText(); parser.feed(page); return parser.text()

def trusted(address):
 p=urlparse(address or "")
 host=(p.hostname or "").lower()
 return p.scheme=="https" and p.username is None and p.password is None and (
  host in ALLOWED or any(host.endswith("."+x) for x in ALLOWED)
 )

def fetch(address,timeout=15):
 if not trusted(address): raise ValueError("Unapproved or insecure source")
 req=Request(address,headers={"User-Agent":"BEFN-Calendar/1.0 (+official event source verification)",
                                 "Accept":"text/html,application/xhtml+xml"})
 with urlopen(req,timeout=timeout) as response:
  actual=response.geturl()
  if not trusted(actual): raise ValueError("Redirect to unapproved source")
  raw=response.read(1_000_001)
  if len(raw)>1_000_000: raise ValueError("Source response too large")
  return raw.decode("utf-8","replace")

def extract_raf(page,today):
 """Only dated RAFNN announcements on RAF's own events gallery may be added."""
 body=visible(page)
 result={}
 for m in RAF.finditer(body):
  segment=body[m.end():m.end()+170]
  date=DATE.search(segment)
  if not date: continue
  # Title, upcoming date and organiser must agree. Never parse a generic
  # news/sidebar date unconnected to a particular numbered event.
  if date.start()>110: continue
  date_text=f"{date.group(3)}-{MONTHS[date.group(1).lower()]:02d}-{int(date.group(2)):02d}"
  try: event_day=dt.date.fromisoformat(date_text)
  except ValueError: continue
  if not today <= event_day <= today+dt.timedelta(days=270): continue
  title="RAF"+m.group(1)
  result[title.lower()]={"id":title.lower(),"name":title,"date":date_text,
   "discipline":"RAF","location":"Location not yet verified",
   "competitors":"Matchups not yet independently verified",
   "why":"Official RAF event listing; full card awaiting confirmation",
   "status":"CONFIRMED","source":SOURCES["RAF"],
   "verifiedAt":today.isoformat()}
 return result

def reconcile(payload, pages, today):
 """Add only strictly dated official RAF events. Existing edits require review."""
 events=payload.get("events")
 if not isinstance(events,list): raise ValueError("Missing calendar events list")
 ids={e.get("id") for e in events}
 if len(ids)!=len(events) or any(not x for x in ids):
  raise ValueError("Duplicate or missing calendar event ID")
 for e in events:
  if not trusted(e.get("source")): raise ValueError("Untrusted event source for "+str(e.get("id")))
  if not re.fullmatch(r"\d{4}-\d\d-\d\d",str(e.get("date",""))):
   raise ValueError("Missing venue-local event date for "+str(e.get("id")))
 report={"checkedOn":today.isoformat(),"sourceChecks":[],"added":[],
         "potentialChanges":[],"completedCalendarDates":[],"errors":[]}
 for name,address in SOURCES.items():
  text=pages.get(address)
  if text is None:
   report["errors"].append(name+": source unavailable or blocked")
   report["sourceChecks"].append({"organiser":name,"reachable":False,"url":address})
  else:
   report["sourceChecks"].append({"organiser":name,"reachable":True,
    "url":address,"digest":hashlib.sha256(text.encode()).hexdigest()[:20]})
 if SOURCES["RAF"] in pages:
  announced=extract_raf(pages[SOURCES["RAF"]],today)
  for slug,item in announced.items():
   if slug in ids:
    previous=next(e for e in events if e["id"]==slug)
    if previous.get("date")!=item["date"]:
     report["potentialChanges"].append({"id":slug,"field":"date",
      "existing":previous["date"],"organiserDate":item["date"],
      "source":SOURCES["RAF"],"action":"Review before changing published date"})
    continue
   events.append(item);ids.add(slug);report["added"].append(slug)
 for e in events:
  date=dt.date.fromisoformat(e["date"])
  if date<today and e.get("status") not in {"CANCELLED","POSTPONED"}:
   report["completedCalendarDates"].append({
    "id":e["id"],"date":e["date"],
    "action":"Hide from upcoming view; completed result not inferred"})
 return report

def run(payload=None,download=fetch,today=None,write=True):
 today=today or dt.datetime.now(dt.timezone.utc).date()
 payload=payload if payload is not None else json.loads(DATA.read_text(encoding="utf-8"))
 before=json.dumps(payload,sort_keys=True,ensure_ascii=False)
 urls=list(dict.fromkeys([*SOURCES.values(),*(e.get("source") for e in payload.get("events",[]) if e.get("source"))]))
 pages={}
 with ThreadPoolExecutor(max_workers=4) as pool:
  future={url:pool.submit(download,url) for url in urls}
  for url,task in future.items():
   try: pages[url]=task.result()
   except Exception as exc: print("Official source unavailable:",url,type(exc).__name__)
 report=reconcile(payload,pages,today)
 report["eventsCount"]=len(payload["events"])
 report["eventSourceChecks"]={"reachable":sum(u in pages for u in urls),"total":len(urls)}
 if write:
  AUDIT.parent.mkdir(parents=True,exist_ok=True)
  AUDIT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
  if not any(source in pages for source in SOURCES.values()):
   raise RuntimeError("All organiser calendars unavailable; retain existing publication and alert")
  after=json.dumps(payload,sort_keys=True,ensure_ascii=False)
  if before!=after:
   payload["reviewedAt"]=today.isoformat()
   DATA.write_text(json.dumps(payload,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
 print("Grappling audit:",len(report["sourceChecks"]),"organisers;",
       len(report["added"]),"new confirmed events;",
       len(report["potentialChanges"]),"potential changes requiring review")
 return report

if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--dry-run",action="store_true")
 opts=p.parse_args()
 run(write=not opts.dry_run)
