#!/usr/bin/env python3
"""UFCalendar Hobby: resumable, source-labelled UFC research + public card enrichment.

Uses selected editorial fields, not raw provider response exports. Never touches
the independently verified BEFN results or curated event artwork.
"""
import datetime as dt
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
LEDGER=ROOT/"data/ufcalendar-pro-ledger.json"
CARDS=ROOT/"data/ufcalendar-pro-cards.json"
ROUNDS=ROOT/"data/ufcalendar-pro-rounds.json"
API="https://api.ufcalendar.com/v1"
CAP=20000               # Self-imposed monthly ceiling; reserve 10,000 for other BEFN uses.
MAX_RUN=110             # Each run is resumable; keep well below GitHub job timeout.
MIN_DELAY=1.15         # 60 requests/minute published provider rate.
RECENT_DAYS=18*30
SCOUT=ROOT/"data/fighter-intelligence.json"
METRICS={"sig_strikes_landed":"sigLanded","sig_strikes_attempted":"sigAttempted",
         "significant_strikes_landed":"sigLanded","significant_strikes_attempted":"sigAttempted",
         "total_strikes_landed":"totalLanded","total_strikes_attempted":"totalAttempted",
         "takedowns_landed":"takedowns","takedowns_attempted":"takedownAttempts",
         "knockdowns":"knockdowns","control_time_sec":"controlSec",
         "submission_attempts":"subAttempts","reversals":"reversals",
         "head_landed":"headLanded","head_attempted":"headAttempted",
         "body_landed":"bodyLanded","body_attempted":"bodyAttempted",
         "leg_landed":"legLanded","leg_attempted":"legAttempted",
         "distance_landed":"distanceLanded","distance_attempted":"distanceAttempted",
         "clinch_landed":"clinchLanded","clinch_attempted":"clinchAttempted",
         "ground_landed":"groundLanded","ground_attempted":"groundAttempted"}
def read(path, default):
    try:
        data=json.loads(path.read_text(encoding="utf8"))
        return data if isinstance(data,dict) else default
    except (OSError,ValueError): return default

def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix(".tmp")
    temporary.write_text(json.dumps(obj,indent=2,ensure_ascii=False,sort_keys=True)+"\n",encoding="utf8")
    temporary.replace(path)

def named(row):
    return str(row.get("name") or "").strip()[:120] if isinstance(row,dict) else ""

def as_int(x):
    return x if type(x) is int and x>=0 else None

def date_of(value):
    s=str(value or "")[:10]
    try: return dt.date.fromisoformat(s)
    except ValueError: return None

def reduce_rounds(body,bout_id):
    rows=body.get("data",[]) if isinstance(body,dict) else []
    if not isinstance(rows,list): return []
    grouped={}
    for row in rows:
        if not isinstance(row,dict): continue
        n=row.get("round",row.get("round_number"))
        corner=row.get("corner") or {1:"a",2:"b"}.get(row.get("fighter_position"))
        if type(n) is not int or not (1<=n<=12) or corner not in ("a","b"): continue
        selected={target:as_int(row.get(source)) for source,target in METRICS.items()
                  if as_int(row.get(source)) is not None}
        if selected: grouped.setdefault(n,{"round":n})[corner]=selected
    return [grouped[n] for n in sorted(grouped) if "a" in grouped[n] or "b" in grouped[n]]

def event_summary(event):
    if not isinstance(event,dict) or event.get("org")!="ufc": return None
    if not date_of(event.get("starts_at")): return None
    card=event.get("card")
    if not isinstance(card,list): return None
    bouts=[]
    for b in card:
        if not isinstance(b,dict) or b.get("sport") not in ("mma",None): continue
        if b.get("status")=="cancelled": continue
        a,bname=named(b.get("fighter_a")),named(b.get("fighter_b"))
        ident=b.get("id")
        if not a or not bname or type(ident) is not int: continue
        section=str(b.get("card_section") or "").lower()
        if section not in ("main","prelims","early","early_prelims"): section="other"
        if section=="early_prelims":section="early"
        result=b.get("result") if isinstance(b.get("result"),dict) else {}
        # Preserve only editorial result descriptors; never infer winner or judging.
        outcome={k:result.get(k) for k in ("method","round","time","winner_id","winner","status")
                 if isinstance(result.get(k),(str,int,float))}
        bouts.append({"id":ident,"fighters":[a,bname],"section":section,
                      "division":str(b.get("weight_class") or b.get("division_slug") or "")[:80],
                      "order":b.get("ordering") if type(b.get("ordering")) is int else None,
                      "scheduledRounds":as_int(b.get("scheduled_rounds")),
                      "isMain":bool(b.get("is_main")),"isTitle":bool(b.get("is_title")),
                      "status":str(b.get("status") or "")[:20],
                      "result":outcome})
    if not bouts:return None
    bouts.sort(key=lambda x:(x["order"] is None,x["order"] or 999))
    venue=event.get("venue") if isinstance(event.get("venue"),dict) else {}
    loc=", ".join(str(venue.get(k) or "").strip() for k in ("name","city","country") if venue.get(k))
    return {"id":str(event.get("id")),"slug":str(event.get("slug") or "")[:120],
            "title":str(event.get("title") or "")[:160],
            "date":str(event.get("starts_at"))[:10],
            "startAt":str(event.get("starts_at") or "")[:40],
            "mainCardAt":str(event.get("main_card_at") or "")[:40],
            "status":str(event.get("status") or "")[:32],
            "location":loc,"bouts":bouts,"source":"UFCalendar"}

def initial_ledger(today):
    return {"schema":1,"month":today.strftime("%Y-%m"),"spent":0,"cap":CAP,
            "status":"pending","discovered":{},"pending":[],"completed":[],
            "nextCursor":None,"discoveryComplete":False,"lastUpcomingDay":"",
            "lastRun":"","lastError":"","provider":{}}

class APIClient:
    def __init__(self, token, ledger, fetch=None, sleep=None):
        self.token=token
        self.ledger=ledger
        self.fetch=fetch or self.http
        self.sleep=sleep or time.sleep
        self.calls=0
        self.last=0
        self.stopped=False
        self.errors=[]
        self.provider_remaining=None
        self.provider_used=None
        self.limit=None
    def http(self,route):
        req=urllib.request.Request(API+route,headers={"Authorization":"Bearer "+self.token,
            "Accept":"application/json","User-Agent":"BEFN-UFCalendar-Research/2.0"})
        with urllib.request.urlopen(req,timeout=24) as result:
            return json.load(result),dict(result.headers)
    def get(self,route,quota=False):
        if not self.token or self.stopped or self.calls>=MAX_RUN: return None
        if not quota and (self.ledger.get("spent",0)>=CAP-20 or
                          self.provider_remaining is not None and self.provider_remaining<100):
            self.stopped=True
            self.ledger["status"]="budget_reserve_reached"
            return None
        if self.last:
            seconds=time.monotonic()-self.last
            if seconds<MIN_DELAY:self.sleep(MIN_DELAY-seconds)
        self.last=time.monotonic()
        self.calls+=1
        self.ledger["spent"]=self.ledger.get("spent",0)+1
        try:
            payload,headers=self.fetch(route)
            if isinstance(headers,dict):
                remaining=headers.get("X-RateLimit-Remaining")
                if str(remaining).isdigit():self.provider_remaining=int(remaining)
            if not isinstance(payload,dict) or payload.get("error"):
                self.errors.append("api_response_error")
                return None
            return payload
        except urllib.error.HTTPError as exc:
            self.errors.append("HTTP_"+str(exc.code))
            if exc.code in (401,403,429): self.stopped=True
            return None
        except (OSError,ValueError,TimeoutError) as exc:
            self.errors.append(type(exc).__name__)
            return None
    def bootstrap(self):
        usage=self.get("/usage",quota=True)
        data=usage.get("data") if isinstance(usage,dict) else None
        if not isinstance(data,dict):return False
        limit,used=data.get("requests_limit"),data.get("requests_used")
        if type(limit) is not int or limit<30000 or type(used) is not int: return False
        self.provider_used=used
        self.limit=limit
        self.ledger["provider"]={"tier":str(data.get("tier") or "")[:18],"limit":limit,
            "used":used,"resetAt":str(data.get("reset_at") or "")[:32]}
        if used>=min(limit-100,CAP):return False
        self.ledger["status"]="connected"
        return True

def run(today=None,fetch=None,sleep=None):
    today=today or dt.datetime.now(dt.timezone.utc).date()
    stamp=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    ledger=read(LEDGER,initial_ledger(today))
    if ledger.get("schema")!=1:raise RuntimeError("Unsupported ledger schema")
    if ledger.get("month")!=today.strftime("%Y-%m"):
        # Do not repeat previously completed historical research when quota rolls over.
        previous={k:ledger.get(k) for k in ("discovered","pending","completed","nextCursor",
                  "discoveryComplete","lastUpcomingDay")}
        ledger=initial_ledger(today)
        ledger.update({k:v for k,v in previous.items() if v is not None})
    rounds=read(ROUNDS,{"schema":1,"fights":{},"generatedOn":""})
    cards=read(CARDS,{"schema":1,"events":{},"generatedOn":""})
    api=APIClient(os.environ.get("UFCALENDAR_API_KEY","").strip(),ledger,fetch,sleep)
    if not api.bootstrap():
        ledger["status"]="needs_paid_key_or_quota"
        ledger["lastError"]=api.errors[-1] if api.errors else "upgrade_not_detected"
    else:
        # Snapshot upcoming cards daily. Existing editorial cards and posters are never overwritten.
        if ledger.get("lastUpcomingDay")!=today.isoformat():
            response=api.get("/events?org=ufc&status=upcoming&limit=25")
            pending=response.get("data") if isinstance(response,dict) else []
            if isinstance(pending,list):
                for row in pending:
                    if not isinstance(row,dict):continue
                    slug=row.get("slug") or row.get("id")
                    if slug is None:continue
                    detail=api.get("/events/"+urllib.parse.quote(str(slug)))
                    if detail and (summary:=event_summary(detail.get("data"))):
                        cards["events"][summary["id"]]=summary
                ledger["lastUpcomingDay"]=today.isoformat()
        # Discover historical UFC events once, paging through the full eligibility window.
        from_day=(today-dt.timedelta(days=RECENT_DAYS)).isoformat()
        scanned=0
        while not ledger.get("discoveryComplete") and api.calls<min(MAX_RUN,8):
            params={"org":"ufc","status":"completed","from":from_day,"to":today.isoformat(),"limit":100}
            if ledger.get("nextCursor"):params["cursor"]=ledger["nextCursor"]
            response=api.get("/events?"+urllib.parse.urlencode(params))
            if not response:break
            events=response.get("data")
            if not isinstance(events,list):break
            for row in events:
                if not isinstance(row,dict) or not row.get("id"):continue
                event_id=str(row["id"])
                ledger["discovered"][event_id]={"slug":str(row.get("slug") or event_id)[:120],
                    "date":str(row.get("starts_at") or "")[:10]}
                if event_id not in ledger["completed"] and event_id not in ledger["pending"]:
                    ledger["pending"].append(event_id)
            meta=response.get("meta") or {}
            pagination=meta.get("pagination") if isinstance(meta,dict) else {}
            cursor=pagination.get("next_cursor") if isinstance(pagination,dict) else None
            ledger["nextCursor"]=cursor
            ledger["discoveryComplete"]=not bool(cursor)
            scanned+=1
            if scanned>=3:break
        # Completed full cards: add result metadata and source-backed fight IDs.
        count=0
        for eid in list(ledger["pending"]):
            if api.calls>=MAX_RUN-4 or api.stopped:break
            slug=ledger["discovered"].get(eid,{}).get("slug") or eid
            response=api.get("/events/"+urllib.parse.quote(slug))
            summary=event_summary(response.get("data")) if response else None
            if not summary:continue
            cards["events"][eid]=summary
            ledger["pending"].remove(eid)
            ledger["completed"].append(eid)
            count+=1
            if count>=25:break
        # Round-by-round archival prioritises all bouts on imported cards; never refetch good data.
        candidates=[]
        for event in cards["events"].values():
            if event.get("status") not in ("completed","finished"):continue
            for b in event["bouts"]:
                ident=str(b["id"])
                if ident not in rounds["fights"] and b["status"] in ("completed","finished"):
                    candidates.append((event,b))
        candidates.sort(key=lambda x:(x[0]["date"],x[1].get("isMain") or False),reverse=True)
        attempted=set(ledger.setdefault("failedRoundIds",[]))
        for event,b in candidates:
            if api.calls>=MAX_RUN or api.stopped:break
            ident=str(b["id"])
            if ident in attempted:continue
            response=api.get("/fights/"+ident+"/rounds")
            if response is None:
                attempted.add(ident)
                continue
            values=reduce_rounds(response,ident)
            if not values:
                attempted.add(ident)
                continue
            rounds["fights"][ident]={"id":b["id"],"date":event["date"],"event":event["title"],
                "fighters":b["fighters"],"division":b["division"],"source":"UFCalendar",
                "rounds":values,"capturedAt":stamp}
        ledger["failedRoundIds"]=sorted(attempted)[-200:]
    cards["generatedOn"]=stamp
    rounds["generatedOn"]=stamp
    ledger["lastRun"]=stamp
    ledger["latestCalls"]=api.calls
    ledger["cardCount"]=len(cards["events"])
    ledger["roundFightCount"]=len(rounds["fights"])
    ledger["historicalCompletedEvents"]=len(ledger.get("completed",[]))
    ledger["lastError"]=api.errors[-1] if api.errors else ledger.get("lastError","")
    save(LEDGER,ledger);save(CARDS,cards);save(ROUNDS,rounds)
    print("UFCalendar Pro: status=%s calls=%s cards=%s fights=%s pending=%s" %
          (ledger["status"],api.calls,len(cards["events"]),len(rounds["fights"]),len(ledger["pending"])))
    return ledger,cards,rounds
if __name__=="__main__":run()
