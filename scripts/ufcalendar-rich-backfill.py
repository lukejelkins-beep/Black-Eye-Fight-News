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
COVERAGE = ROOT / "data/ufc-last-five-coverage.json"
JUDGING = ROOT / "data/ufcalendar-judging-research.json"
BASE = "https://api.ufcalendar.com/v1"
MAX_SPEND_PER_MONTH = 27000  # 90% of Hobby; reserve 3,000 for live BEFN integrations.
MAX_PER_RUN = 500
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

def quota_guard_reached(state,today):
    """Avoid repeated /usage calls once this month's paid research budget is spent."""
    provider=state.get("provider") if isinstance(state,dict) else {}
    if not isinstance(provider,dict):return False
    used=provider.get("usedAtStart")
    return (str(state.get("lastRun") or "")[:7]==today.strftime("%Y-%m")
            and type(used) is int and used>=MAX_SPEND_PER_MONTH
            and type(provider.get("limit")) is int and provider["limit"]>=30000)

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
    # During paid backfill we run every 15 minutes. Do not spend eight upcoming
    # event-list calls per hour when those cards are already cached.
    now=dt.datetime.now(dt.timezone.utc)
    last_checked=state.setdefault("upcomingCheckedAt",{})
    for org in ORGS:
        if client.remaining<=0 or client.stopped:break
        last=last_checked.get(org)
        try:
            last_time=dt.datetime.fromisoformat(last.replace("Z","+00:00"))
            stale=(now-last_time).total_seconds()>=90*60
        except (AttributeError,TypeError,ValueError):
            stale=True
        if not stale:continue
        payload=client.call("/events"+param(org=org,status="upcoming",limit=50))
        if payload is not None:
            add_index(state,org,response_rows(payload),True)
            last_checked[org]=now.isoformat()
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
    # Complete eligible UFC research first; then continue PFL without losing either queue.
    pairs.sort(key=lambda x:(x.get("org")=="ufc",x.get("eventDate") or "",
                     x.get("main",False),x.get("titleFight",False)),reverse=True)
    return pairs

def selected_stats(rounds):
    # Derived display facts are a narrow subset; do not republish API payloads.
    return [{"round":r["round"],
             "a":{k:v for k,v in r.get("a",{}).items() if k in ("sigLanded","sigAttempted","takedowns","takedownAttempts","controlSec","knockdowns","subAttempts","reversals")},
             "b":{k:v for k,v in r.get("b",{}).items() if k in ("sigLanded","sigAttempted","takedowns","takedownAttempts","controlSec","knockdowns")}}
            for r in rounds]

def should_collect_rounds(state,bout,today):
    """Reuse complete round observations; cautiously retry only incomplete UFC bouts.

    Legacy roundDone entries are integer counts, including zero when no rounds
    were provided. Such entries must not be treated as permanent successes.
    """
    bid=str(bout.get("id") or "")
    done=state.setdefault("roundDone",{})
    if bid not in done:return True
    if bout.get("org")!="ufc":return False
    expected=(bout.get("result") or {}).get("round")
    observed=done[bid]
    if type(observed) is not int:return False
    if observed>0 and (type(expected) is not int or observed>=expected):return False
    retry=state.setdefault("roundRetry",{}).get(bid,{})
    if type(retry) is not dict:return False
    attempts=retry.get("attempts",0)
    if type(attempts) is not int or attempts>=2:return False
    checked=date_str(retry.get("checkedAt"))
    if checked and dt.date.fromisoformat(checked)+dt.timedelta(days=14)>today:return False
    return True


def collect_rounds(client,state,cards,archive,pfl_archive,today,coverage=None):
    pairs=selection(state)
    # Prioritize known missing samples in the rolling active UFC cohort before
    # historical or PFL enrichment; never spend calls on already complete rows.
    gap_priority={}
    if isinstance(coverage,dict) and coverage.get("schema")==1 and coverage.get("scope")=="ufc":
        stamp=date_str(coverage.get("asOf"))
        if stamp and (today-dt.timedelta(days=7)).isoformat()<=stamp<=today.isoformat():
            for f in coverage.get("fighters",[]):
                if not isinstance(f,dict) or not f.get("needsStats"):continue
                weight=4 if f.get("champion") else 3 if f.get("upcoming") else 2 if f.get("ranked") else 1
                for entry in f.get("recent",[]):
                    if not isinstance(entry,dict) or entry.get("hasMeasuredTotals"):continue
                    bid=str(entry.get("boutId") or "")
                    if bid:gap_priority[bid]=max(weight,gap_priority.get(bid,0))
    priority=state.get("ufcHistoricalPriority",{})
    pairs.sort(key=lambda b:(b.get("org")=="ufc",
                            gap_priority.get(str(b.get("id")),0),
                            int(priority.get(str(b.get("id")),-1)),
                            b.get("eventDate") or ""),reverse=True)
    count,retries=0,0
    cap=max(0,min(195,int(client.max_calls*.45),client.max_calls-client.calls-15))
    retry_cap=max(0,min(40,int(client.max_calls*.12)))
    for bout in pairs:
        if client.remaining<=0 or client.stopped or count>=cap:break
        bid=str(bout["id"])
        was_checked=bid in state["roundDone"]
        if not should_collect_rounds(state,bout,today):continue
        if was_checked and retries>=retry_cap:continue
        if was_checked:retries+=1
        payload=client.call("/fights/"+bid+"/rounds")
        if was_checked:
            previous=state.setdefault("roundRetry",{}).get(bid,{})
            state["roundRetry"][bid]={
                "attempts":int(previous.get("attempts",0))+1,
                "checkedAt":today.isoformat()}
        if payload is None:
            # A failure must not overwrite previously sourced round evidence.
            count+=1
            continue
        rounds=convert_rounds(payload)
        if was_checked:
            state["roundDone"][bid]=max(state["roundDone"][bid],len(rounds))
        else:
            state["roundDone"][bid]=len(rounds)
        if rounds:
            event={"date":bout["eventDate"],"title":bout["event"],"org":bout["org"]}
            target=archive if bout["org"]=="ufc" else pfl_archive
            merge_archive(target,event,bout,rounds,dt.datetime.now(dt.timezone.utc).isoformat())
            ui_event=cards["events"].get(bout["org"]+":"+str(bout["eventId"])) or cards["events"].get(str(bout["eventId"]))
            if ui_event:
                for ui_bout in ui_event.get("bouts",[]):
                    if str(ui_bout["id"])==bid:
                        ui_bout["roundPreview"]=selected_stats(rounds)
                        break
        count+=1
    return {"requests":count,"retried":retries}

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
    maximum=max(0,min(48,int(client.max_calls*.13)))
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
            "currentChampion":obj.get("is_champion") is True,
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
        if client.remaining<=0 or client.stopped or client.calls>=client.max_calls-2 or collected>=max(4,min(84,int(client.max_calls*.20))):break
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


def stable_indexed_fighter_id(state,fighter_slug):
    """Use a numeric UFC identity only when all locally indexed IDs agree.

    A slug can be renamed or reused by a source; never infer identity when
    saved UFC event records disagree about the underlying fighter ID.
    """
    ids=set()
    for bout in state.get("bouts",{}).values():
        if not isinstance(bout,dict) or bout.get("org")!="ufc":
            continue
        for side in ("a","b"):
            athlete=bout.get(side)
            if not isinstance(athlete,dict) or athlete.get("slug")!=fighter_slug:
                continue
            fighter_id=str(athlete.get("id") or "")
            if re.fullmatch(r"[1-9][0-9]{0,11}",fighter_id):
                ids.add(fighter_id)
    return next(iter(ids)) if len(ids)==1 else None


def collect_targeted_ufc_history(client,state,coverage,today):
    """Find missing last-five UFC fight IDs once per athlete, from saved audit order.

    /fights/search returns completed bouts with a winner, so it does NOT prove
    draw/NC histories complete. The earlier event index preserves those bouts.
    This never fetches statistics directly; collect_rounds fetches one unique
    bout once and stores both corners in the existing archive.
    """
    if coverage.get("schema") != 1 or coverage.get("scope") != "ufc":
        return 0
    stamp=date_str(coverage.get("asOf"))
    # A stale audit cannot silently define today's active roster.
    if not stamp or not (today-dt.timedelta(days=7)).isoformat() <= stamp <= today.isoformat():
        return 0
    done=state.setdefault("ufcHistoricalSearchDone",{})
    priority=state.setdefault("ufcHistoricalPriority",{})
    # A small bounded fraction of requests per run; the central Client enforces
    # the monthly 27k ceiling, the 3k reserve and the provider RPM.
    cap=max(0,min(55,int(client.max_calls*.14)))
    searched=0
    attempted=0
    for f in coverage.get("fighters",[]):
        # Count attempted lookups, including 404s and transient failures.
        # Otherwise an all-missing batch could consume the entire run budget.
        if attempted>=cap or client.remaining<=0 or client.stopped:
            break
        if not isinstance(f,dict) or not f.get("needsHistoryCheck"):
            continue
        slugval=slug(f.get("slug"))
        if not slugval:
            continue
        prior=done.get(slugval)
        stable_id=None
        if prior:
            # A successful slug search is normally final. A fighter who still
            # has a history gap may instead have older bouts indexed under a
            # different slug. Cross-check by the UNIQUE cached numeric ID once.
            # Never repeat it on each five-minute relay.
            if isinstance(prior,dict) and not prior.get("fighterIdChecked"):
                stable_id=stable_indexed_fighter_id(state,slugval)
            if not stable_id:
                # Unknown slug 404s retain their existing seven-day backoff.
                if not isinstance(prior,dict) or prior.get("status")!="unresolved_slug_404":
                    continue
                if str(prior.get("retryAfter") or "9999-12-31")>today.isoformat():
                    continue
        # Search supports stable UFC fighter IDs as well as current slugs.
        # A first search uses the slug; a still-open gap receives one ID check.
        # Draw/NC records remain anchored to the separate event index.
        before_errors=len(client.errors)
        attempted+=1
        lookup=stable_id or slugval
        payload=client.call("/fights/search"+param(org="ufc",fighter=lookup,limit=8))
        if payload is None:
            if len(client.errors)>before_errors and client.errors[-1]=="HTTP_404":
                done[slugval]={**(prior if isinstance(prior,dict) else {}),
                              "status":"unresolved_slug_404",
                              "checkedAt":today.isoformat(),
                              "retryAfter":(today+dt.timedelta(days=7)).isoformat(),
                              "fighterIdChecked":bool(stable_id) or
                                  bool(isinstance(prior,dict) and prior.get("fighterIdChecked"))}
            continue
        searched+=1
        new=0
        matches=0
        rank=3 if f.get("champion") else 2 if f.get("upcoming") else 1 if f.get("ranked") else 0
        for raw in response_rows(payload):
            if not isinstance(raw,dict):
                continue
            event=raw.get("event")
            if not isinstance(event,dict) or event.get("org") not in ("ufc",None):
                continue
            date=date_str(event.get("starts_at"))
            bout=summary_bout(raw)
            if not date or date>today.isoformat() or not bout or bout.get("status")!="completed":
                continue
            matched_sides=[side for side in ("a","b")
                           if bout[side].get("slug")==slugval or
                           (stable_id and bout[side].get("id")==stable_id)]
            if not matched_sides:
                continue
            if stable_id:
                # Canonicalize only the fighter anchored by a verified numeric
                # ID, never the opponent, and never overwrite existing bouts.
                for side in matched_sides:
                    if bout[side].get("id")==stable_id:
                        bout[side]["slug"]=slugval
                        if f.get("name"):
                            bout[side]["name"]=safe(f["name"],110)
            matches+=1
            bid=bout["id"]
            old=state["bouts"].get(bid)
            if old and old.get("org")!="ufc":
                continue
            # Reuse all previously indexed bouts, never overwrite verified
            # event/result facts with an incomplete search response.
            if not old:
                state["bouts"][bid]={
                    "id":bid,"a":bout["a"],"b":bout["b"],
                    "event":safe(event.get("title"),150),
                    "eventDate":date,"org":"ufc",
                    "eventId":positive(event.get("id")),
                    "status":"completed","main":bout["main"],
                    "titleFight":bout["titleFight"],"result":bout["result"]}
                new+=1
            # Only the first five completed results are immediate round targets.
            # Ranking weights do not represent actual statistical standings.
            if matches<=5 and bid not in state["roundDone"]:
                priority[bid]=max(rank,priority.get(bid,-1))
        done[slugval]={"checkedAt":today.isoformat(),
                       "matchedWinnerBouts":matches,"newIndexedBouts":new,
                       "drawsAndNoContests":"retain_event_index",
                       "searchMode":"fighter_id" if stable_id else "slug",
                       "fighterIdChecked":bool(stable_id) or
                           bool(isinstance(prior,dict) and prior.get("fighterIdChecked"))}
    return searched

def collect_careers(client,state,research):
    # Previously researched fighters remain in the cache after cancellation.
    remaining=max(0,min(62,int(client.max_calls*.15)))
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
    maximum=max(0,min(36,int(client.max_calls*.09)))
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
        profile["hasHeldUfcTitle"]=any(r.get("org")=="ufc" for r in historic)
        profile["titleHistoryEvidence"]=[{"date":date_str(r.get("snapshot_date")),
                                          "division":safe(r.get("division"),50)}
                                         for r in historic[:6] if r.get("org")=="ufc"]
        done+=1

def recover_previews(cards,archive,pfl_archive,judging):
    """Reuse saved round observations without re-spending quota on previous requests."""
    import importlib.util
    spec=importlib.util.spec_from_file_location("befn_saved_archive",ROOT/"scripts/refresh-ufc-research-archive.py")
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    for ev in cards["events"].values():
        dataset=archive if ev.get("org")=="ufc" else pfl_archive
        day=ev.get("date")
        for bout in ev.get("bouts",[]):
            if not bout.get("scorecardSummary"):
                recorded=judging.get("decisions",{}).get(bout["id"])
                if recorded:bout["scorecardSummary"]=recorded
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
                                      "division","scheduledRounds","result","roundPreview","scorecardSummary")}
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
                    if p:
                        if p.get("record"):row[corner+"Record"]=p["record"]
                        if p.get("recentHistory"):row[corner+"Recent"]=p["recentHistory"][:3]
                        if p.get("hasHeldUfcTitle") is True:
                            row[corner+"HeldUfcTitle"]=True
                    if not (p and p.get("record")) and b.get(corner+"Record"):
                        row[corner+"Record"]=b[corner+"Record"]

            info["bouts"].append(row)
        events[key]=info
    return {"schema":1,"generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "source":"UFCalendar","note":"Selected dated facts for BEFN cards; not a full API feed.",
            "events":events}

def main():
    today=dt.datetime.now(dt.timezone.utc).date()
    state=read(PROGRESS,default_progress())
    if quota_guard_reached(state,today):
        print("UFCalendar: paid research ceiling already reached this month; no API requests needed")
        return
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
    max_calls=int(os.getenv("BEFN_UFCAL_MAX_CALLS","500"))
    client=Client(os.getenv("UFCALENDAR_API_KEY","").strip(),state,today,max_calls=max_calls)
    if client.bootstrap():
        read_events(client,state,today)
        visible=collect_cards(client,state,cards,today)
        coverage=read(COVERAGE,{})
        searched=collect_targeted_ufc_history(client,state,coverage,today)
        if searched:print("UFCalendar targeted UFC history lookups:",searched)
        recovery=collect_rounds(client,state,cards,archive,pfl_archive,today,coverage)
        if recovery["retried"]:
            print("UFCalendar incomplete UFC round rechecks:",recovery["retried"])
        collect_judging(client,state,cards,judging)
        collect_profiles(client,state,cards,research,today)
        collect_careers(client,state,research)
        collect_championship_history(client,state,research)
        recover_previews(cards,archive,pfl_archive,judging)
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
    # A downgraded plan is expected after the paid backfill and is not a CI error.
    # Historical data remains untouched and the workflow can resume after an upgrade.
    if state["status"] not in ("connected","budget_guard","upgrade_not_detected"):
        sys.exit(1)

if __name__=="__main__":
    main()
