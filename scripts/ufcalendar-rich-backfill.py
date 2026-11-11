#!/usr/bin/env python3
"""BEFN incremental paid-tier UFC/PFL history and schedule enrichment.

Data access is private to GitHub Actions. Published outputs are selected
view facts and derived round evidence, not full upstream API responses.
Never infer results, opponent records at past dates, rankings or missing metrics.
"""
from __future__ import annotations
import calendar
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRESS = ROOT / "data/ufcalendar-rich-progress.json"
CARDS = ROOT / "data/ufcalendar-card-enhancements.json"
ARCHIVE = ROOT / "data/ufc-research-archive.json"
FIGHTERS = ROOT / "data/ufcalendar-fighter-research.json"
BASE = "https://api.ufcalendar.com/v1"
MAX_SPEND_PER_MONTH = 18000  # Preserve allowance for other BEFN integrations.
MAX_PER_RUN = 180
REST_SECONDS = 1.2
ORGS = ("ufc", "pfl")
ROUND_MAP = {
 "knockdowns":"knockdowns","sig_strikes_landed":"sigLanded",
 "sig_strikes_attempted":"sigAttempted","total_strikes_landed":"totalLanded",
 "total_strikes_attempted":"totalAttempted","takedowns_landed":"takedowns",
 "takedowns_attempted":"takedownAttempts","control_time_sec":"controlSec",
 "submission_attempts":"subAttempts","reversals":"reversals",
 "head_landed":"headLanded","head_attempted":"headAttempted",
 "body_landed":"bodyLanded","body_attempted":"bodyAttempted",
 "leg_landed":"legLanded","leg_attempted":"legAttempted",
 "distance_landed":"distanceLanded","distance_attempted":"distanceAttempted",
 "clinch_landed":"clinchLanded","clinch_attempted":"clinchAttempted",
 "ground_landed":"groundLanded","ground_attempted":"groundAttempted",
 "distance_time_sec":"distanceTimeSec","clinch_time_sec":"clinchTimeSec",
 "ground_time_sec":"groundTimeSec"
}

def read(path, default):
    try:
        value = json.loads(path.read_text(encoding="utf8"))
        return value if isinstance(value,dict) else default
    except (ValueError,OSError):
        return default

def write(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2)+"\n",encoding="utf8")
    tmp.replace(path)

def date_str(value):
    v=str(value or "")[:10]
    try: dt.date.fromisoformat(v);return v
    except ValueError: return None

def months_before(day,months):
    m=day.month-1-months
    y=day.year+m//12
    mon=m%12+1
    return dt.date(y,mon,min(day.day,calendar.monthrange(y,mon)[1]))

def safe(value,size=100):
    return str(value or "").strip()[:size]

def slug(value):
    v=str(value or "")
    return v if re.fullmatch(r"[a-z0-9][a-z0-9-]{0,110}",v) else None

def positive(value):
    return str(value) if type(value) is int and value>0 else None

def number(value):
    return value if type(value) is int and value>=0 else None

def ref(raw):
    if not isinstance(raw,dict): return None
    name=safe(raw.get("name"))
    if not name:return None
    return {"name":name,"slug":slug(raw.get("slug")),
            "id":positive(raw.get("id")),"country":safe(raw.get("country_code"),2)}

def param(**kwargs):
    return "?"+urllib.parse.urlencode({k:v for k,v in kwargs.items() if v is not None})

def cursor_of(payload):
    meta=payload.get("meta") or {}
    paging=meta.get("pagination") if isinstance(meta,dict) else None
    return paging.get("next_cursor") if isinstance(paging,dict) else None

def response_rows(payload):
    data=payload.get("data") if isinstance(payload,dict) else None
    return data if isinstance(data,list) else []

class Client:
    def __init__(self,token,state,today,fetch=None,max_calls=MAX_PER_RUN):
        self.token,self.state,self.today=token,state,today
        self.fetch=fetch or self.http
        self.max_calls=max(1,min(500,int(max_calls)))
        self.calls=0
        self.remaining=0
        self.stopped=False
        self.interval=REST_SECONDS
        self.last=0.0
        self.errors=[]
    def http(self,path):
        wait=self.last+self.interval-time.monotonic()
        if wait>0:time.sleep(wait)
        self.last=time.monotonic()
        req=urllib.request.Request(BASE+path,headers={
            "Authorization":"Bearer "+self.token,"Accept":"application/json",
            "User-Agent":"BEFN-Paid-Research-Collector/1.0"})
        with urllib.request.urlopen(req,timeout=22) as response:
            return json.load(response)
    def call(self,path):
        if self.stopped or not self.token or self.calls>=self.max_calls:return None
        if self.calls and self.remaining<=0:return None
        self.calls+=1
        if self.remaining>0:self.remaining-=1
        try:
            result=self.fetch(path)
            if not isinstance(result,dict) or "data" not in result:
                raise ValueError("Invalid response envelope")
            return result
        except urllib.error.HTTPError as e:
            code="HTTP_"+str(e.code)
            self.errors.append(code)
            if e.code in (401,403,429):self.stopped=True
        except (OSError,TimeoutError,ValueError,TypeError) as e:
            self.errors.append(type(e).__name__)
        return None
    def bootstrap(self):
        resp=self.call("/usage")
        data=(resp or {}).get("data")
        if not isinstance(data,dict):
            self.state["status"]="quota_check_failed"
            return False
        used,limit,rpm=data.get("requests_used"),data.get("requests_limit"),data.get("rpm_limit")
        if type(used) is not int or type(limit) is not int or limit<=0:
            self.state["status"]="invalid_quota"
            return False
        self.state["provider"]={"tier":safe(data.get("tier"),16),"limit":limit,
                                "usedAtStart":used,"resetAt":safe(data.get("reset_at"),40),
                                "rpm":rpm if type(rpm) is int else None}
        if limit<30000:
            self.state["status"]="upgrade_not_detected"
            return False
        self.interval=max(REST_SECONDS,(60/max(1,rpm))+0.15) if type(rpm) is int else 7.0
        self.remaining=max(0,min(MAX_SPEND_PER_MONTH-used,limit-used-100))
        self.state["status"]="connected" if self.remaining else "budget_guard"
        return self.remaining>0

def default_progress():
    return {"schema":1,"status":"pending","provider":{},"lastRun":"",
            "historicalCursor":{},"historicalComplete":{},
            "eventIndex":{},"eventDetails":{},"roundDone":{},
            "scorecardDone":{},"fighterDone":{},"errors":[]}

def add_index(state,org,events,upcoming=False):
    added=0
    for event in events:
        if not isinstance(event,dict):continue
        eid=positive(event.get("id"))
        if not eid or event.get("org") not in (None,org):continue
        item=state["eventIndex"].get(org+":"+eid,{})
        item.update({"id":eid,"slug":slug(event.get("slug")),
                     "org":org,"title":safe(event.get("title"),150),
                     "startAt":safe(event.get("starts_at"),40),
                     "date":date_str(event.get("starts_at")),
                     "status":safe(event.get("status"),20),
                     "upcoming":bool(upcoming or event.get("status") in ("scheduled","announced","live"))})
        if not item["date"]:continue
        state["eventIndex"][org+":"+eid]=item
        added+=1
    return added

def read_events(client,state,today):
    # Query future calendars on every collector run, including card changes.
    for org in ORGS:
        if client.remaining<=0 or client.stopped:break
        payload=client.call("/events"+param(org=org,status="upcoming",limit=50))
        if payload:add_index(state,org,response_rows(payload),True)
    for org in ORGS:
        if client.remaining<=0 or client.stopped or state["historicalComplete"].get(org):continue
        for n in range(4):
            after=months_before(today,18 if org=="ufc" else 6).isoformat()
            cursor=state["historicalCursor"].get(org)
            route="/events"+param(org=org,**{"from":after,"to":today.isoformat()},
                                   order="desc",limit=50,cursor=cursor)
            payload=client.call(route)
            if payload is None:break
            add_index(state,org,response_rows(payload))
            nxt=cursor_of(payload)
            if not nxt or nxt==cursor:
                state["historicalComplete"][org]=True
                state["historicalCursor"].pop(org,None)
                break
            state["historicalCursor"][org]=str(nxt)
            if client.remaining<=0:break

def normalized_result(raw):
    if not isinstance(raw,dict):return None
    winner=raw.get("winner_fighter_id") or raw.get("winner_id")
    return {"winnerId":positive(winner),"method":safe(raw.get("method_normalized") or raw.get("method"),60),
            "round":number(raw.get("round")),"time":safe(raw.get("time"),15),
            "finishDetail":safe(raw.get("finish_detail"),100)}

def summary_bout(raw):
    if not isinstance(raw,dict):return None
    a,b=ref(raw.get("fighter_a")),ref(raw.get("fighter_b"))
    fid=positive(raw.get("id"))
    if not fid or not a or not b:return None
    status=safe(raw.get("status"),22)
    return {"id":fid,"a":a,"b":b,"status":status,
            "division":safe(raw.get("weight_class") or raw.get("division_slug"),70),
            "divisionSlug":slug(raw.get("division_slug")),
            "section":safe(raw.get("card_section"),22),
            "order":number(raw.get("ordering")),
            "main":raw.get("is_main") is True,"titleFight":raw.get("is_title") is True,
            "scheduledRounds":number(raw.get("scheduled_rounds")),
            "result":normalized_result(raw.get("result")) if status in ("completed","no_contest","draw") else None}

def venue_text(value):
    if isinstance(value,str):return safe(value,160)
    if not isinstance(value,dict):return ""
    parts=[value.get("name"),value.get("city"),value.get("region"),value.get("country")]
    return ", ".join(safe(x,60) for x in parts if x)

def summary_event(data):
    if not isinstance(data,dict):return None
    eid=positive(data.get("id"))
    if not eid:return None
    bouts=[x for x in (summary_bout(r) for r in data.get("card",[])) if x]
    bouts.sort(key=lambda x:(x["order"] if x["order"] is not None else 9999,x["id"]))
    return {"id":eid,"slug":slug(data.get("slug")),"org":safe(data.get("org"),15),
            "title":safe(data.get("title"),150),"status":safe(data.get("status"),20),
            "startAt":safe(data.get("starts_at"),40),"date":date_str(data.get("starts_at")),
            "mainAt":safe(data.get("main_card_at"),40),"prelimsAt":safe(data.get("prelims_at"),40),
            "earlyPrelimsAt":safe(data.get("early_prelims_at"),40),
            "venue":venue_text(data.get("venue")),"bouts":bouts}

def enrichment_visible(event,today):
    day=date_str(event.get("startAt"))
    if not day:return False
    day=dt.date.fromisoformat(day)
    return today-dt.timedelta(days=190)<=day<=today+dt.timedelta(days=365)

def collect_cards(client,state,cards,today):
    index=state["eventIndex"]
    ordered=sorted(index.items(),key=lambda kv:(kv[1].get("upcoming",False),
                        kv[1].get("date") or "",kv[0]),reverse=True)
    for k,event in ordered:
        if client.remaining<=0 or client.stopped:break
        key=event["id"]
        prior=state["eventDetails"].get(k)
        # Upcoming cards update every 6 hours, completed cards are immutable for collection
        # purposes after confirmation. Corrections can be manually requeued.
        refresh=event.get("upcoming") and not prior or (event.get("upcoming") and
            prior and (dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(prior)).total_seconds()>21000)
        if prior and not refresh:continue
        payload=client.call("/events/"+key)
        obj=(payload or {}).get("data")
        card=summary_event(obj)
        if not card:continue
        cards["events"][k]=card
        state["eventDetails"][k]=dt.datetime.now(dt.timezone.utc).isoformat()
        event["upcoming"]=card["status"] in ("announced","scheduled","live")
    # Include only recent + upcoming event facts in the public display data;
    # the research store itself may span the prior 18 months.
    visible={k:e for k,e in cards["events"].items() if enrichment_visible(e,today)}
    return visible

def convert_rounds(payload):
    rows=response_rows(payload)
    rounds={}
    for line in rows:
        if not isinstance(line,dict):continue
        n=line.get("round",line.get("round_number"))
        corner=line.get("corner") or {1:"a",2:"b"}.get(line.get("fighter_position"))
        if type(n) is not int or not 1<=n<=12 or corner not in ("a","b"):continue
        stats={target:line[key] for key,target in ROUND_MAP.items()
               if number(line.get(key)) is not None}
        if stats:
            rounds.setdefault(n,{"round":n})[corner]=stats
    output=[rounds[n] for n in sorted(rounds)]
    for record in output:
        for corner,opp in (("a","b"),("b","a")):
            if corner in record and opp in record and "sigLanded" in record[opp]:
                record[corner]["sigAbsorbed"]=record[opp]["sigLanded"]
    return output

def merge_archive(archive,event,bout,rounds,stamp):
    if not rounds:return False
    # The persistent research archive currently covers UFC; retain PFL selected
    # evidence in the separate UFCalendar source data and do not mislabel it UFC.
    if event["org"]!="ufc":return False
    import importlib.util
    spec=importlib.util.spec_from_file_location("befn_archive",ROOT/"scripts/refresh-ufc-research-archive.py")
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.put(archive,event["date"],bout["a"]["name"],bout["b"]["name"],
                 event["title"],"ufcalendar",bout["id"],rounds,stamp)

def selection(cards):
    candidates=[]
    for ev in cards["events"].values():
        if ev.get("status") not in ("completed","no_contest","draw"):continue
        for b in ev.get("bouts",[]):
            if b["status"] in ("completed","no_contest","draw"):
                candidates.append((ev,b))
    candidates.sort(key=lambda x:(x[0].get("date") or "",x[1]["main"],x[1]["titleFight"]),
                    reverse=True)
    return candidates

def selected_stats(rounds):
    # Derived display facts are a narrow subset; do not republish API payloads.
    return [{"round":r["round"],
             "a":{k:v for k,v in r.get("a",{}).items() if k in ("sigLanded","sigAttempted","takedowns","takedownAttempts","controlSec","knockdowns")},
             "b":{k:v for k,v in r.get("b",{}).items() if k in ("sigLanded","sigAttempted","takedowns","takedownAttempts","controlSec","knockdowns")}}
            for r in rounds]

def collect_rounds(client,state,cards,archive,today):
    pairs=selection(cards)
    # Research older UFC cards too, not only events published on the website.
    cap=max(0,min(120,client.max_calls-client.calls-4))
    count=0
    for event,bout in pairs:
        if client.remaining<=0 or client.stopped or count>=cap:break
        bid=bout["id"]
        if bid in state["roundDone"]:continue
        payload=client.call("/fights/"+bid+"/rounds")
        if payload is None:continue
        rounds=convert_rounds(payload)
        state["roundDone"][bid]=len(rounds)
        if rounds:
            bout["roundPreview"]=selected_stats(rounds)
            if event["org"]=="ufc":merge_archive(archive,event,bout,rounds,dt.datetime.now(dt.timezone.utc).isoformat())
        count+=1

def read_fighter_profile(obj):
    if not isinstance(obj,dict):return None
    name=safe(obj.get("name"))
    slugval=slug(obj.get("slug"))
    if not name or not slugval:return None
    recs=obj.get("records") if isinstance(obj.get("records"),dict) else {}
    pro=recs.get("pro_mma") if isinstance(recs,dict) else None
    record=pro.get("value") if isinstance(pro,dict) else None
    if not isinstance(record,str) or not re.fullmatch(r"\d{1,3}-\d{1,3}(?:-\d{1,3})?",record.strip()):
        record=None
    return {"name":name,"slug":slugval,"record":record,"observedOn":dt.date.today().isoformat(),
            "source":"UFCalendar","sport":"MMA"}

def collect_profiles(client,state,cards,fighters,today):
    seen={}
    for event in cards["events"].values():
        day=event.get("date") or ""
        upcoming=event["status"] in ("announced","scheduled","live")
        for bout in event.get("bouts",[]):
            for side in ("a","b"):
                fighter=bout[side]
                slugval=fighter.get("slug")
                if not slugval:continue
                priority=(1 if upcoming else 0,day)
                if slugval not in seen or priority>seen[slugval]:seen[slugval]=priority
    seen=sorted(seen.items(),key=lambda it:it[1],reverse=True)
    for slugval,rank in seen:
        if client.remaining<=0 or client.stopped or client.calls>=client.max_calls-2:break
        if slugval in state["fighterDone"]:continue
        payload=client.call("/fighters/"+slugval)
        profile=read_fighter_profile((payload or {}).get("data"))
        if not profile:continue
        state["fighterDone"][slugval]=dt.date.today().isoformat()
        fighters["profiles"][slugval]=profile

def public_events(cards,profiles,today):
    events={}
    for key,event in cards.get("events",{}).items():
        if not enrichment_visible(event,today):continue
        # To avoid serving a standalone mirror of the provider's database,
        # expose only selected facts that support existing BEFN cards.
        info={k:event.get(k) for k in ("id","org","slug","title","status","startAt","date",
                                       "mainAt","prelimsAt","earlyPrelimsAt","venue")}
        info["bouts"]=[]
        for b in event.get("bouts",[]):
            row={k:b.get(k) for k in ("id","status","section","order","main","titleFight",
                                      "division","scheduledRounds","result","roundPreview")}
            row["a"]=b["a"]["name"]
            row["b"]=b["b"]["name"]
            if event["status"] in ("announced","scheduled","live"):
                for corner in ("a","b"):
                    p=profiles.get(b[corner].get("slug"))
                    if p and p.get("record"):row[corner+"Record"]=p["record"]
            info["bouts"].append(row)
        events[key]=info
    return {"schema":1,"generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "source":"UFCalendar","note":"Selected dated facts for BEFN cards; not a full API feed.",
            "events":events}

def main():
    today=dt.datetime.now(dt.timezone.utc).date()
    state=read(PROGRESS,default_progress())
    if state.get("schema")!=1:raise RuntimeError("Unknown progress format")
    cards=read(CARDS,{"schema":1,"events":{}})
    research=read(FIGHTERS,{"schema":1,"profiles":{}})
    archive=read(ARCHIVE,{"schema":1,"fights":{},"events":{}})
    if archive.get("schema")!=1:raise RuntimeError("Unknown archive version")
    # CURATED card format output may have dropped historic cards; keep only
    # the recent public subset as API refresh input alongside indexed events.
    for k,e in cards.get("events",{}).items():
        if k not in state["eventIndex"] and e.get("org") in ORGS:
            add_index(state,e["org"],[{"id":int(k),"org":e["org"],"title":e.get("title"),
                                       "slug":e.get("slug"),"starts_at":e.get("startAt"),
                                       "status":e.get("status")}])
    max_calls=int(os.getenv("BEFN_UFCAL_MAX_CALLS","180"))
    client=Client(os.getenv("UFCALENDAR_API_KEY","").strip(),state,today,max_calls=max_calls)
    if client.bootstrap():
        read_events(client,state,today)
        visible=collect_cards(client,state,cards,today)
        collect_rounds(client,state,cards,archive,today)
        collect_profiles(client,state,cards,research,today)
        public=public_events(cards,research.get("profiles",{}),today)
        write(CARDS,public)
        archive["updatedAt"]=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        write(ARCHIVE,archive)
        write(FIGHTERS,research)
    state["lastRun"]=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    state["lastCalls"]=client.calls
    state["errors"]=(state.get("errors",[])+client.errors)[-15:]
    state["indexedEvents"]=len(state["eventIndex"])
    state["roundsDoneCount"]=len(state["roundDone"])
    state["fighterProfilesDone"]=len(state["fighterDone"])
    state["publicEvents"]=len(cards.get("events",{}))
    write(PROGRESS,state)
    print("UFCalendar: status=%s, api_calls=%s, indexed=%s, rounds=%s, profiles=%s, public_events=%s" %
          (state["status"],client.calls,state["indexedEvents"],state["roundsDoneCount"],
           state["fighterProfilesDone"],state["publicEvents"]))
    if client.errors:print("Encountered:",",".join(client.errors[:5]))
    if state["status"] not in ("connected","budget_guard"):
        sys.exit(1)

if __name__=="__main__":
    main()
