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
PFL_ARCHIVE = ROOT / "data/pfl-research-archive.json"
FIGHTERS = ROOT / "data/ufcalendar-fighter-research.json"
JUDGING = ROOT / "data/ufcalendar-judging-research.json"
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
            "eventIndex":{},"eventDetails":{},"bouts":{},"roundDone":{},
            "scorecardDone":{},"fighterDone":{},"historyDone":{},"rankingDone":{},"errors":[]}

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
    # Reserve requests for round statistics and verified upcoming fighter records.
    detail_limit=max(8,min(42,int(client.max_calls*.19)))
    detailed=0
    for k,event in ordered:
        if client.remaining<=0 or client.stopped or detailed>=detail_limit:break
        key=event["id"]
        prior=state["eventDetails"].get(k)
        # Upcoming cards update every 6 hours, completed cards are immutable for collection
        # purposes after confirmation. Corrections can be manually requeued.
        refresh=event.get("upcoming") and not prior or (event.get("upcoming") and
            prior and (dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(prior)).total_seconds()>21000)
        if prior and not refresh:continue
        payload=client.call("/events/"+key)
        detailed+=1
        obj=(payload or {}).get("data")
        card=summary_event(obj)
        if not card:continue
        for bout in card["bouts"]:
            state["bouts"][bout["id"]]={
                "id":bout["id"],"a":bout["a"],"b":bout["b"],
                "event":card["title"],"eventDate":card["date"],"org":card["org"],
                "eventId":key,"status":bout["status"],
                "main":bout["main"],"titleFight":bout["titleFight"],
                "result":bout.get("result")}
        if enrichment_visible(card,today):
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
    if event["org"] not in ORGS:return False
    import importlib.util
    spec=importlib.util.spec_from_file_location("befn_archive",ROOT/"scripts/refresh-ufc-research-archive.py")
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.put(archive,event["date"],bout["a"]["name"],bout["b"]["name"],
                 event["title"],"ufcalendar",bout["id"],rounds,stamp,
                 promotion=event["org"].upper())

def selection(state):
    pairs=[x for x in state.get("bouts",{}).values()
           if x.get("status") in ("completed","draw","no_contest")]
    pairs.sort(key=lambda x:(x.get("eventDate") or "",x.get("org")=="ufc",
                     x.get("main",False),x.get("titleFight",False)),reverse=True)
    return pairs

def selected_stats(rounds):
    # Derived display facts are a narrow subset; do not republish API payloads.
    return [{"round":r["round"],
             "a":{k:v for k,v in r.get("a",{}).items() if k in ("sigLanded","sigAttempted","takedowns","takedownAttempts","controlSec","knockdowns")},
             "b":{k:v for k,v in r.get("b",{}).items() if k in ("sigLanded","sigAttempted","takedowns","takedownAttempts","controlSec","knockdowns")}}
            for r in rounds]

def collect_rounds(client,state,cards,archive,pfl_archive,today):
    pairs=selection(state)
    count=0
    cap=max(0,min(120,int(client.max_calls*.43),client.max_calls-client.calls-10))
    for bout in pairs:
        if client.remaining<=0 or client.stopped or count>=cap:break
        bid=bout["id"]
        if bid in state["roundDone"]:continue
        payload=client.call("/fights/"+bid+"/rounds")
        if payload is None:continue
        rounds=convert_rounds(payload)
        state["roundDone"][bid]=len(rounds)
        if rounds:
            event={"date":bout["eventDate"],"title":bout["event"],"org":bout["org"]}
            target=archive if bout["org"]=="ufc" else pfl_archive
            merge_archive(target,event,bout,rounds,dt.datetime.now(dt.timezone.utc).isoformat())
            ui_event=cards["events"].get(bout["org"]+":"+bout["eventId"]) or cards["events"].get(bout["eventId"])
            if ui_event:
                for ui_bout in ui_event.get("bouts",[]):
                    if ui_bout["id"]==bid:
                        ui_bout["roundPreview"]=selected_stats(rounds)
                        break
        count+=1

def short_scorecards(payload):
    obj=(payload or {}).get("data")
    if not isinstance(obj,dict):return None
    judges=[]
    for row in obj.get("cards",[]):
        if not isinstance(row,dict):continue
        known=row.get("scores_known") is True
        rounds=[]
        if known:
            for rd in row.get("rounds") or []:
                if not isinstance(rd,dict):continue
                no=number(rd.get("round"))
                a,b=number(rd.get("a")),number(rd.get("b"))
                if no is not None and a is not None and b is not None:
                    rounds.append([no,a,b])
        judges.append({"judge":safe(row.get("judge_name"),75),
                       "totalA":number(row.get("total_a")) if known else None,
                       "totalB":number(row.get("total_b")) if known else None,
                       "scoresKnown":known,"rounds":rounds})
    return {"decision":safe(obj.get("decision_type"),40),
            "judges":judges[:5],"source":"UFCalendar",
            "observedOn":dt.date.today().isoformat()}

def collect_judging(client,state,cards,judging):
    maximum=max(0,min(32,int(client.max_calls*.13)))
    done=0
    for b in selection(state):
        if client.remaining<=0 or client.stopped or done>=maximum:break
        if b["id"] in state["scorecardDone"]:continue
        result=b.get("result") or {}
        method=result.get("method") or ""
        if "decision" not in method.lower() and "draw" not in method.lower():continue
        payload=client.call("/fights/"+b["id"]+"/scorecards")
        if payload is None:continue
        summary=short_scorecards(payload)
        if summary is None:continue
        state["scorecardDone"][b["id"]]=len(summary["judges"])
        if summary["judges"]:
            judging["decisions"][b["id"]]=summary
            card=cards["events"].get(b["org"]+":"+b["eventId"])
            if card:
                for public_bout in card["bouts"]:
                    if public_bout["id"]==b["id"]:
                        public_bout["scorecardSummary"]=summary
                        break
        done+=1

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
    for bout in state.get("bouts",{}).values():
        day=bout.get("eventDate") or ""
        org=bout.get("org")
        if org not in ORGS:continue
        upcoming=bout["status"] in ("announced","scheduled","live")
        for side in ("a","b"):
            athlete=bout[side]
            slugval=athlete.get("slug")
            if not slugval:continue
            priority=(1 if upcoming else 0,day)
            if slugval not in seen or priority>seen[slugval]:
                seen[slugval]=priority
    collected=0
    for slugval,rank in sorted(seen.items(),key=lambda it:it[1],reverse=True):
        if client.remaining<=0 or client.stopped or client.calls>=client.max_calls-2 or collected>=max(4,int(client.max_calls*.13)):break
        if slugval in state["fighterDone"]:continue
        payload=client.call("/fighters/"+slugval)
        collected+=1
        profile=read_fighter_profile((payload or {}).get("data"))
        if not profile:continue
        state["fighterDone"][slugval]=dt.date.today().isoformat()
        fighters["profiles"][slugval]=profile

def summarize_history(payload):
    entries=response_rows(payload)
    history=[]
    for row in entries:
        if not isinstance(row,dict):continue
        opp=row.get("opponent") if isinstance(row.get("opponent"),dict) else {}
        opponent=safe(opp.get("name") or row.get("opponent_name"))
        status=safe(row.get("status"),18)
        when=date_str(row.get("date") or row.get("fought_at") or row.get("starts_at"))
        if not opponent or not when or status not in ("win","loss","draw","no_contest"):continue
        history.append({"date":when,"opponent":opponent,"result":status,
                        "method":safe(row.get("method_normalized") or row.get("method"),50),
                        "promotion":safe(row.get("org_slug") or row.get("org"),24),
                        "titleFight":bool(row.get("is_title"))})
        if len(history)>=20:break
    return history

def collect_careers(client,state,research):
    # Previously researched fighters remain in the cache after cancellation.
    remaining=max(0,min(28,int(client.max_calls*.09)))
    done=0
    for slugval,profile in list(research.get("profiles",{}).items()):
        if client.remaining<=0 or client.stopped or done>=remaining:break
        if slugval in state.setdefault("historyDone",{}):continue
        payload=client.call("/fighters/"+slugval+"/history")
        if payload is None:continue
        history=summarize_history(payload)
        state["historyDone"][slugval]=len(history)
        if history:profile["recentHistory"]=history
        done+=1

def collect_championship_history(client,state,research):
    maximum=max(0,min(18,int(client.max_calls*.06)))
    done=0
    for slugval,profile in list(research.get("profiles",{}).items()):
        if client.remaining<=0 or client.stopped or done>=maximum:break
        if slugval in state.setdefault("rankingDone",{}):continue
        payload=client.call("/fighters/"+slugval+"/rankings"+param(limit=500))
        if payload is None:continue
        rows=response_rows(payload)
        historic=[r for r in rows if isinstance(r,dict) and
                  (r.get("is_champion") is True or r.get("rank")==0)]
        state["rankingDone"][slugval]=True
        profile["formerUfcChampion"]=any(r.get("org")=="ufc" for r in historic)
        profile["titleHistoryEvidence"]=[{"date":date_str(r.get("snapshot_date")),
                                          "division":safe(r.get("division"),50)}
                                         for r in historic[:6] if r.get("org")=="ufc"]
        done+=1

def recover_previews(cards,archive,pfl_archive):
    """Reuse saved round observations without re-spending quota on previous requests."""
    import importlib.util
    spec=importlib.util.spec_from_file_location("befn_saved_archive",ROOT/"scripts/refresh-ufc-research-archive.py")
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    for ev in cards["events"].values():
        dataset=archive if ev.get("org")=="ufc" else pfl_archive
        day=ev.get("date")
        for bout in ev.get("bouts",[]):
            if bout.get("roundPreview"):continue
            a=bout.get("a",{})
            b=bout.get("b",{})
            namea=a.get("name") if isinstance(a,dict) else a
            nameb=b.get("name") if isinstance(b,dict) else b
            key=m.key_for(day,namea,nameb)
            record=(dataset.get("fights") or {}).get(key) if key else None
            if record and record.get("rounds"):
                bout["roundPreview"]=selected_stats(record["rounds"])

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
            for corner in ("a","b"):
                athlete=b[corner]
                row[corner]=athlete.get("name") if isinstance(athlete,dict) else safe(athlete)
                athlete_slug=athlete.get("slug") if isinstance(athlete,dict) else b.get(corner+"Slug")
                if athlete_slug:
                    row[corner+"Slug"]=athlete_slug
                if event["status"] in ("announced","scheduled","live"):
                    p=profiles.get(athlete_slug)
                    if not p:
                        same=[x for x in profiles.values() if x.get("name","").casefold()==row[corner].casefold()]
                        if len(same)==1:p=same[0]
                    if p and p.get("record"):
                        row[corner+"Record"]=p["record"]
                    elif b.get(corner+"Record"):
                        row[corner+"Record"]=b[corner+"Record"]
            info["bouts"].append(row)
        events[key]=info
    return {"schema":1,"generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "source":"UFCalendar","note":"Selected dated facts for BEFN cards; not a full API feed.",
            "events":events}

def main():
    today=dt.datetime.now(dt.timezone.utc).date()
    state=read(PROGRESS,default_progress())
    state.setdefault("bouts",{})
    if state.get("schema")!=1:raise RuntimeError("Unknown progress format")
    cards=read(CARDS,{"schema":1,"events":{}})
    research=read(FIGHTERS,{"schema":1,"profiles":{}})
    judging=read(JUDGING,{"schema":1,"decisions":{}})
    archive=read(ARCHIVE,{"schema":1,"fights":{},"events":{}})
    pfl_archive=read(PFL_ARCHIVE,{"schema":1,"fights":{},"events":{}})
    if archive.get("schema")!=1 or pfl_archive.get("schema")!=1:
        raise RuntimeError("Unknown archive version")
    if not state.get("pflArchiveMigrated"):
        # One-time migration: previously collected PFL rounds were only held as
        # short-lived card previews, so recollect them for lasting storage.
        for bid,bout in state.get("bouts",{}).items():
            if bout.get("org")=="pfl":
                state["roundDone"].pop(bid,None)
        state["pflArchiveMigrated"]=True
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
        collect_rounds(client,state,cards,archive,pfl_archive,today)
        collect_judging(client,state,cards,judging)
        collect_profiles(client,state,cards,research,today)
        collect_careers(client,state,research)
        collect_championship_history(client,state,research)
        recover_previews(cards,archive,pfl_archive)
        public=public_events(cards,research.get("profiles",{}),today)
        write(CARDS,public)
        archive["updatedAt"]=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        write(ARCHIVE,archive)
        pfl_archive["updatedAt"]=archive["updatedAt"]
        write(PFL_ARCHIVE,pfl_archive)
        write(FIGHTERS,research)
        write(JUDGING,judging)
    state["lastRun"]=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    state["lastCalls"]=client.calls
    state["errors"]=(state.get("errors",[])+client.errors)[-15:]
    state["indexedEvents"]=len(state["eventIndex"])
    state["roundsDoneCount"]=len(state["roundDone"])
    state["indexedBouts"]=len(state["bouts"])
    state["fighterProfilesDone"]=len(state["fighterDone"])
    state["scorecardsDone"]=len(state["scorecardDone"])
    state["careerHistoriesDone"]=len(state.get("historyDone",{}))
    state["rankingHistoriesDone"]=len(state.get("rankingDone",{}))
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
