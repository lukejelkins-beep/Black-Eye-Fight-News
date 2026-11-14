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
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PROGRESS = ROOT / "data/ufcalendar-rich-progress.json"
CARDS = ROOT / "data/ufcalendar-card-enhancements.json"
ARCHIVE = ROOT / "data/ufc-research-archive.json"
PFL_ARCHIVE = ROOT / "data/pfl-research-archive.json"
FIGHTERS = ROOT / "data/ufcalendar-fighter-research.json"
COVERAGE = ROOT / "data/ufc-last-five-coverage.json"
COVERAGE36 = ROOT / "data/ufc-36-month-candidates.json"
ROSTER_APPROVAL = ROOT / "data/ufc-36-month-roster-approval.json"
FEEDER_EVIDENCE = ROOT / "data/ufc-feeder-bout-evidence.json"
LEGACY_UFC_EVIDENCE = ROOT / "data/ufc-official-legacy-evidence.json"
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
            "eventIndex":{},"eventDetails":{},"bouts":{},"roundDone":{},"roundRetry":{},
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
            after=months_before(today,36 if org=="ufc" else 6).isoformat()
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
    retry_after=date_str(retry.get("retryAfter"))
    if retry_after and retry_after>today.isoformat():return False
    checked=date_str(retry.get("checkedAt"))
    if not retry_after and checked and dt.date.fromisoformat(checked)+dt.timedelta(days=14)>today:
        return False
    return True


def confirmed_feeder_bout(row,fighter_slug,evidence):
    """Exclude only a UFC-site-verified DWCS bout by exact fight identity.

    The professional-MMA history entry remains unchanged in research storage.
    Unverified IDs and incomplete/mismatched evidence fail closed.
    """
    if not isinstance(row,dict) or not isinstance(evidence,dict) or evidence.get("schema")!=1:
        return False
    bid=str(row.get("boutId") or "")
    day=date_str(row.get("date"))
    opp=re.sub(r"[^a-z0-9]","",safe(row.get("opponent"),110).casefold())
    for entry in evidence.get("bouts",[]):
        if not isinstance(entry,dict):continue
        if (entry.get("boutId")==bid and entry.get("date")==day and
            entry.get("fighterSlug")==fighter_slug and
            re.sub(r"[^a-z0-9]","",safe(entry.get("opponent"),110).casefold())==opp and
            str(entry.get("sourceUrl") or "").startswith("https://www.ufc.com/")):
            return True
    return False


def feeder_event_title(title):
    """Do not confuse official UFC fights with DWCS/Road-to-UFC feeders."""
    return bool(re.search(r"(?:contender\s+series|road\s+to\s+ufc|\bdwcs\b)",
                          title or "",re.I))


def official_ufc_event_title(title):
    """TUF Finals count as UFC; TV exhibition/qualifier bouts do not."""
    if not title or feeder_event_title(title):return False
    return bool(re.search(r"\bufc\b",title,re.I) or
                re.search(r"\bthe\s+ultimate\s+fighter\b.*\bfinale\b",title,re.I) or
                re.search(r"\btuf\s*\d+\s+finale\b",title,re.I))


def ufc_event_date_evidence(state):
    """Cached fight-event titles; never infer official status from weekday."""
    by_date={}
    for bout in state.get("bouts",{}).values():
        if not isinstance(bout,dict) or bout.get("org")!="ufc":continue
        day=date_str(bout.get("eventDate"))
        title=safe(bout.get("event"),150)
        if day and title:by_date.setdefault(day,set()).add(title)
    feeder={day for day,titles in by_date.items() if titles and
            all(feeder_event_title(t) for t in titles)}
    finale={day for day,titles in by_date.items() if titles and
            all(official_ufc_event_title(t) for t in titles) and
            any(re.search(r"(?:the\s+ultimate\s+fighter|\btuf\s*\d+).*finale",
                          t,re.I) for t in titles)}
    return feeder,finale


def approved_ufc_round_priority(approval,coverage,research,today,state=None):
    """Prioritise the signed-off UFC cohort's cached fights without API calls.

    Latest five fights are most useful for the public Recent Performance card,
    followed by fights six to ten, then older UFC career metrics. Sharing a
    fight ID across two athletes never duplicates the /rounds request. The
    immutable approved allowlist is intersected with current eligibility.
    """
    approved=approved_ufc_career_cohort(approval,coverage,today)
    if (not approved or coverage.get("scope")!="ufc" or
        coverage.get("activityMonths")!=36 or
        coverage.get("indexCompleteness")!="36_month_event_scan_complete"):
        return {}
    current=date_str(coverage.get("asOf"))
    if not current or not (today-dt.timedelta(days=7)).isoformat()<=current<=today.isoformat():
        return {}
    eligible={slug(row.get("slug")) for row in coverage.get("fighters",[])
              if isinstance(row,dict) and row.get("eligibilityStatus")=="latest_observed_mma_ufc"}
    wanted=approved.intersection(eligible)
    if not wanted:return {}
    priority={}
    feeder_dates=ufc_event_date_evidence(state)[0] if state else set()
    feeder_proof=read(FEEDER_EVIDENCE,{})
    for fighter in wanted:
        profile=research.get("profiles",{}).get(fighter,{})
        ordered=[]
        seen=set()
        for row in profile.get("recentHistory",[]):
            if (not isinstance(row,dict) or row.get("source")!="native" or
                confirmed_feeder_bout(row,fighter,feeder_proof) or
                str(row.get("promotion") or "").lower()!="ufc" or
                str(row.get("result") or "").lower() not in
                ("win","loss","draw","no_contest","w","l","d","nc")):
                continue
            bid=str(row.get("boutId") or "")
            day=date_str(row.get("date"))
            if (not re.fullmatch(r"[1-9][0-9]{0,11}",bid) or
                not day or day>today.isoformat() or day in feeder_dates or bid in seen):
                continue
            seen.add(bid)
            ordered.append((day,bid))
        ordered.sort(reverse=True)
        for position,(_,bid) in enumerate(ordered):
            tier=6 if position<5 else 5 if position<10 else 3
            priority[bid]=max(tier,priority.get(bid,0))
    return priority


def collect_rounds(client,state,cards,archive,pfl_archive,today,coverage=None,approved_priority=None):
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
    approved_priority=approved_priority or {}
    # A verified recent/career UFC fight for an approved fighter outranks
    # unrelated old observations. Existing 18-month championship/recent
    # priorities remain the tiebreaker. Only the search order changes.
    pairs.sort(key=lambda b:(b.get("org")=="ufc",
                            approved_priority.get(str(b.get("id")),0),
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
        # Persist a cooldown even after an initial network/404 failure; otherwise
        # the five-minute relay repeatedly spends quota on the same missing bout.
        previous=state.setdefault("roundRetry",{}).get(bid,{})
        attempts=int(previous.get("attempts",0))+(1 if was_checked else 0)
        if payload is None:
            if not was_checked:state["roundDone"][bid]=0
            state["roundRetry"][bid]={
                "attempts":attempts,"checkedAt":today.isoformat(),
                "retryAfter":(today+dt.timedelta(days=1)).isoformat()}
            count+=1
            continue
        rounds=convert_rounds(payload)
        state["roundDone"][bid]=max(state["roundDone"].get(bid,0),len(rounds))
        expected=(bout.get("result") or {}).get("round")
        incomplete=not rounds or (type(expected) is int and len(rounds)<expected)
        if incomplete and bout.get("org")=="ufc":
            state["roundRetry"][bid]={
                "attempts":attempts,"checkedAt":today.isoformat(),
                "retryAfter":(today+dt.timedelta(days=14)).isoformat()}
        else:
            state["roundRetry"].pop(bid,None)
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
        # A native UFCalendar career row carries its canonical fight_id.
        # Preserve it so a historical UFC fight can link to saved statistics.
        # Historical/public-record rows do not independently prove a fight ID.
        native=row.get("source")=="native"
        history.append({"date":when,"opponent":opponent,"result":status,
                        "method":safe(row.get("method_normalized") or row.get("method"),50),
                        "promotion":safe(row.get("org_slug") or row.get("org"),24),
                        "titleFight":bool(row.get("is_title")),
                        "source":"native" if native else "history",
                        "boutId":positive(row.get("fight_id")) if native else None})
    # Store the complete available career, including all historical UFC bouts.
    # Older non-UFC MMA contests remain useful for last-promotion eligibility.
    # Deduplicate native/public records but NEVER apply a last-five/20-row cap.
    unique={}
    for row in history:
        key=(row["date"],row["opponent"].casefold(),row["promotion"].casefold())
        old=unique.get(key)
        if old is None or (row["source"]=="native" and old["source"]!="native"):
            unique[key]=row
    return sorted(unique.values(),key=lambda row:(row["date"],row["opponent"]),reverse=True)


def ufc_timeline_evidence(payload,today):
    """Require an explicitly untruncated full timeline before certifying depth."""
    rows=response_rows(payload)
    meta=payload.get("meta") if isinstance(payload,dict) else None
    complete=isinstance(meta,dict) and meta.get("truncated") is False
    count=0
    seen=set()
    for row in rows:
        if not isinstance(row,dict):
            complete=False
            continue
        org=safe(row.get("org_slug") or row.get("org"),24).lower()
        status=safe(row.get("status"),18).lower()
        if not org:
            if status in ("win","loss","draw","no_contest","unknown"):
                complete=False
            continue
        if org!="ufc":continue
        if status in ("upcoming","cancelled"):continue
        if status not in ("win","loss","draw","no_contest"):
            complete=False
            continue
        opp=row.get("opponent") if isinstance(row.get("opponent"),dict) else {}
        opponent=safe(opp.get("name") or row.get("opponent_name"))
        when=date_str(row.get("date") or row.get("fought_at") or row.get("starts_at"))
        if not when or when>today.isoformat() or not opponent:
            complete=False
            continue
        key=(when,opponent.casefold(),status)
        if key in seen:
            complete=False
            continue
        seen.add(key)
        count+=1
    return {"settledCount":count,"complete":bool(complete),
            "observedOn":today.isoformat()}


def save_ufc_timeline(profile,payload,today):
    """Merge provider history into the permanent cache without deleting older bouts.

    A shorter /history response cannot erase saved UFC or non-UFC results.
    Prefer sourced native fight IDs and richer old fields; never invent a
    missing native ID or silently replace a conflicting linked ID.
    """
    incoming=summarize_history(payload)
    previous=[row for row in profile.get("recentHistory",[])
              if isinstance(row,dict)]
    def identity(row):
        day=date_str(row.get("date"))
        opponent=safe(row.get("opponent"),110).casefold()
        org=safe(row.get("promotion"),24).casefold()
        return (day,opponent,org) if day and opponent and org else None

    combined={}
    unmatched=[]
    for row in previous+incoming:
        key=identity(row)
        if key is None:
            # Keep a legacy incomplete entry rather than deleting information
            # that another research process may still need to reconcile.
            if row not in unmatched:unmatched.append(row)
            continue
        old=combined.get(key)
        if old is None:
            combined[key]=dict(row)
            continue
        # Existing persisted bout IDs are canonical numeric *strings*.
        # positive() accepts provider integer IDs only, so using it on
        # cached rows would silently treat every saved native ID as absent.
        def native_id(value):
            if type(value) is int and 0<value<=999999999999:
                return str(value)
            if isinstance(value,str) and re.fullmatch(r"[1-9][0-9]{0,11}",value):
                return value
            return None
        old_id=native_id(old.get("boutId"))
        new_id=native_id(row.get("boutId"))
        old_native=old.get("source")=="native" and old_id is not None
        new_native=row.get("source")=="native" and new_id is not None
        if old_native and new_native and old_id!=new_id:
            # Preserve old linked evidence until the fight-ID conflict is
            # independently checked; do not pollute the round cache.
            profile.setdefault("ufcHistoryIdConflicts",[])
            conflict={"date":key[0],"opponent":key[1],
                      "promotion":key[2],"oldId":old_id,"newId":new_id}
            if conflict not in profile["ufcHistoryIdConflicts"]:
                profile["ufcHistoryIdConflicts"].append(conflict)
            continue
        if new_native and not old_native:
            winner,other=dict(row),old
        else:
            winner,other=dict(old),row
        # Fill blanks only; retain existing nonempty verified details.
        for field,value in other.items():
            if (field not in winner or winner[field] in (None,"")) and value not in (None,""):
                winner[field]=value
        combined[key]=winner

    merged=sorted(list(combined.values())+unmatched,
                  key=lambda row:(row.get("date") or "",row.get("opponent") or ""),
                  reverse=True)
    if merged:profile["recentHistory"]=merged
    evidence=ufc_timeline_evidence(payload,today)
    previous_ufc={identity(row) for row in previous
                  if identity(row) and str(row.get("promotion") or "").lower()=="ufc"
                  and str(row.get("result") or "").lower() in
                  ("win","loss","draw","no_contest")}
    incoming_ufc={identity(row) for row in incoming
                  if identity(row) and str(row.get("promotion") or "").lower()=="ufc"}
    if not previous_ufc.issubset(incoming_ufc):
        # Even an apparently complete provider response is not complete
        # relative to stronger already saved evidence.
        evidence["complete"]=False
        evidence["savedHistoryHasAdditionalUfcBouts"]=True
    if profile.get("ufcHistoryIdConflicts"):
        evidence["complete"]=False
        evidence["conflictingNativeFightIds"]=len(profile["ufcHistoryIdConflicts"])
    profile["ufcTimeline"]=evidence
    return merged


def refresh_unlinked_ufc_native_ids(client,state,research,coverage,today):
    """Recover native fight IDs once from already researched UFC career histories.

    Old saved career rows discarded `fight_id`, so the coverage audit may list
    unlinked UFC bouts despite the provider supplying verified native IDs.
    Only re-read athletes with an actual text-only UFC fight, in priority order;
    do not spam the API to recheck otherwise complete fighter histories.
    """
    if coverage.get("schema")!=1 or coverage.get("scope")!="ufc":return 0
    stamp=date_str(coverage.get("asOf"))
    if not stamp or not (today-dt.timedelta(days=7)).isoformat()<=stamp<=today.isoformat():
        return 0
    checks=state.setdefault("ufcNativeHistoryIdChecks",{})
    profiles=research.get("profiles",{})
    cap=max(0,min(24,int(client.max_calls*.06)))
    attempted=0
    recovered=0
    for fighter in coverage.get("fighters",[]):
        if attempted>=cap or client.stopped or client.remaining<=0 or client.calls>=client.max_calls-15:
            break
        if not isinstance(fighter,dict):continue
        recent=fighter.get("recent",[])
        if not any(isinstance(row,dict) and row.get("origin")=="ufc-history"
                   and not row.get("boutId") for row in recent):
            continue
        slugval=slug(fighter.get("slug"))
        if not slugval or slugval not in profiles:continue
        prior=checks.get(slugval,{})
        if isinstance(prior,dict) and (prior.get("status")=="checked" or
                str(prior.get("retryAfter") or "")>today.isoformat()):
            continue
        stable_id=stable_indexed_fighter_id(state,slugval)
        attempted+=1
        payload=client.call("/fighters/"+(stable_id or slugval)+"/history")
        if payload is None:
            # A failed lookup is not a completed investigation, but repeated
            # transient 404s should not dominate the five-minute relay.
            checks[slugval]={"status":"retry","checkedAt":today.isoformat(),
                             "retryAfter":(today+dt.timedelta(days=7)).isoformat()}
            continue
        history=save_ufc_timeline(profiles[slugval],payload,today)
        state.setdefault("historyDone",{})[slugval]=len(history)
        recovered+=sum(row.get("promotion")=="ufc" and row.get("boutId") is not None
                       for row in history)
        checks[slugval]={"status":"checked","checkedAt":today.isoformat(),
                         "nativeUfcIds":sum(row.get("promotion")=="ufc" and
                            row.get("boutId") is not None for row in history)}
    if attempted:print("UFCalendar native UFC history ID checks:",attempted,
                        "native rows recovered:",recovered)
    return attempted

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
        history=save_ufc_timeline(profile,payload,client.today)
        state["historyDone"][slugval]=len(history)
        done+=1



def approved_ufc_career_cohort(approval,coverage,today):
    """Only manually approved fighters can enter the new full-career stage.

    A signed-off snapshot is an explicit slug allowlist, not a broad boolean
    that could accidentally include newly discovered unreviewed candidates.
    Existing cached research is retained for roster evidence and normal cards.
    """
    if not isinstance(approval,dict) or not isinstance(coverage,dict):
        return set()
    if (approval.get("schema")!=1 or approval.get("scope")!="ufc-36-month-roster"
        or approval.get("status")!="approved"
        or approval.get("approvedBy")!="user"
        or coverage.get("indexCompleteness")!="36_month_event_scan_complete"):
        return set()
    snapshot=date_str(approval.get("rosterAsOf"))
    approved_at=date_str(approval.get("approvedAt"))
    current=date_str(coverage.get("asOf"))
    if (not snapshot or not approved_at or not current or
        snapshot>approved_at or approved_at>today.isoformat() or
        not snapshot<=current<=today.isoformat()):
        return set()
    names=approval.get("approvedFighters")
    if not isinstance(names,list) or not names or len(names)!=len(set(map(str,names))):
        return set()
    if any(not isinstance(item,str) or slug(item)!=item for item in names):
        return set()
    return set(names)


def verified_official_finale_bout(manifest,bid,day,research,references):
    """Allow one early retry only for a corroborated official UFC fight.

    An authoritative UFC card gives a date/identity crosscheck, not licence to
    skip the provider's native fight-ID, event or result validation.
    """
    if not isinstance(manifest,dict) or manifest.get("schema")!=1 or \
       manifest.get("scope")!="ufc-official-finale-recovery":
        return None
    for record in manifest.get("bouts",[]):
        if not isinstance(record,dict) or str(record.get("fightId"))!=bid or \
           date_str(record.get("date"))!=day:
            continue
        athlete=slug(record.get("fighterSlug"))
        opponent=safe(record.get("opponent"),110)
        url=str(record.get("sourceUrl") or "")
        if (not athlete or athlete not in references.get(bid,set()) or
            not opponent or not url.startswith("https://www.ufc.com/")):
            continue
        saved=research.get("profiles",{}).get(athlete,{})
        if any(isinstance(row,dict) and
               str(row.get("boutId") or "")==bid and
               date_str(row.get("date"))==day and
               str(row.get("promotion") or "").lower()=="ufc" and
               safe(row.get("opponent"),110).casefold()==opponent.casefold()
               for row in saved.get("recentHistory",[])):
            return record
    return None


def collect_ufc_career_bouts(client,state,research,coverage,today,approval=None,verified_finales=None):
    """Hydrate native UFC career IDs once, then share each fight's round cache.

    Only the completed 36-month event audit can enable this separate stage.
    The candidate list is not itself proof of contract/retirement status and
    must never be used to auto-publish public fighter profiles.
    """
    if (coverage.get("schema")!=1 or coverage.get("scope")!="ufc" or
        coverage.get("activityMonths")!=36 or
        coverage.get("indexCompleteness")!="36_month_event_scan_complete"):
        return 0
    stamp=date_str(coverage.get("asOf"))
    if not stamp or not (today-dt.timedelta(days=7)).isoformat()<=stamp<=today.isoformat():
        return 0
    approved=approved_ufc_career_cohort(approval,coverage,today)
    if not approved:return 0
    eligible={slug(row.get("slug")) for row in coverage.get("fighters",[])
              if isinstance(row,dict) and row.get("eligibilityStatus")=="latest_observed_mma_ufc"}
    eligible.discard(None)
    eligible.intersection_update(approved)
    if not eligible:return 0
    # Rank *missing* native UFC fight IDs by their impact on the approved
    # five-fight, ten-fight and career views. Read only saved histories; an ID
    # shared by two approved fighters is still requested precisely once.
    pending={}
    references={}
    feeder_dates,official_finale_dates=ufc_event_date_evidence(state)
    feeder_proof=read(FEEDER_EVIDENCE,{})
    tiers=approved_ufc_round_priority(approval,coverage,research,today,state)
    for slugval,profile in research.get("profiles",{}).items():
        if slugval not in eligible:continue
        for row in profile.get("recentHistory",[]):
            if not isinstance(row,dict) or row.get("source")!="native" or \
               str(row.get("promotion") or "").lower()!="ufc":continue
            if confirmed_feeder_bout(row,slugval,feeder_proof):continue
            bid=str(row.get("boutId") or "")
            if not re.fullmatch(r"[1-9][0-9]{0,11}",bid) or bid in state["bouts"]:continue
            when=date_str(row.get("date"))
            if when and when<=today.isoformat() and when not in feeder_dates:
                pending[bid]=max(when,pending.get(bid,""))
                references.setdefault(bid,set()).add(slugval)
    checks=state.setdefault("ufcCareerBoutChecks",{})
    # The signed-off cohort has a large, known cache gap. Bound career
    # hydration to 90 unique IDs per run while keeping the central provider
    # quota, per-run safety ceiling and other maintenance tasks intact.
    cap=max(1,min(90,int(client.max_calls*.20)))
    attempts=0
    indexed=0
    # Prioritise the most useful profile gaps, then fights covering two
    # approved fighters, before the latest available UFC career date.
    order=sorted(pending.items(),
                 key=lambda item:(tiers.get(item[0],0),
                                  len(references.get(item[0],())),
                                  item[1],item[0]),
                 reverse=True)
    for bid,_ in order:
        if attempts>=cap or client.remaining<=0 or client.stopped or client.calls>=client.max_calls-10:
            break
        prior=checks.get(bid,{})
        verified=verified_official_finale_bout(
            verified_finales,bid,pending[bid],research,references)
        finale_retry=(prior.get("status")=="requires_manual_review" and
                      not prior.get("officialFinaleRetryAttempted") and
                      (pending[bid] in official_finale_dates or bool(verified)))
        if str(prior.get("retryAfter") or "")>today.isoformat() and not finale_retry:
            continue
        if finale_retry:
            prior={**prior,"officialFinaleRetryAttempted":True}
            checks[bid]=prior
        attempts+=1
        payload=client.call("/fights/"+bid)
        data=(payload or {}).get("data")
        if not isinstance(data,dict):
            checks[bid]={**prior,"checkedAt":today.isoformat(),
                         "retryAfter":(today+dt.timedelta(days=7)).isoformat()}
            continue
        event=data.get("event")
        bout=summary_bout(data)
        title=safe(event.get("title"),150) if isinstance(event,dict) else ""
        event_date=date_str(event.get("starts_at")) if isinstance(event,dict) else None
        is_feeder=feeder_event_title(title)
        # Fail closed on a mismatched provider response: a retrieved bout
        # must have the *same native ID* requested from the cached UFC history.
        # A 200 response with a different fight must never poison this ID's
        # career chronology or round statistics cache.
        if (not bout or str(bout.get("id") or "")!=bid or
            not event_date or event_date>today.isoformat() or
            not official_ufc_event_title(title) or is_feeder or
            event.get("org") not in ("ufc",None) or
            bout["status"] not in ("completed","draw","no_contest")):
            checks[bid]={**prior,"checkedAt":today.isoformat(),
                         "retryAfter":(today+dt.timedelta(days=14)).isoformat(),
                         "status":"requires_manual_review"}
            continue
        if verified and finale_retry:
            # Independently corroborate the two corners of the provider fight,
            # never infer that a matching ID or event title guarantees identity.
            source_fighter=research.get("profiles",{}).get(verified["fighterSlug"],{})
            expected_names={
                safe(source_fighter.get("name"),110).casefold(),
                verified["fighterSlug"].replace("-"," ").casefold()
            }
            observed=[safe(bout[c].get("name"),110).casefold() for c in ("a","b")]
            if (not any(name and name in observed for name in expected_names) or
                safe(verified.get("opponent"),110).casefold() not in observed or
                event_date!=verified["date"]):
                checks[bid]={**prior,"checkedAt":today.isoformat(),
                             "retryAfter":(today+dt.timedelta(days=14)).isoformat(),
                             "status":"requires_manual_review",
                             "reason":"verified_finale_provider_identity_disagreement"}
                continue
        state["bouts"][bid]={
            "id":bid,"a":bout["a"],"b":bout["b"],"event":title,
            "eventDate":event_date,"org":"ufc","eventId":positive(event.get("id")),
            "status":bout["status"],"main":bout["main"],
            "titleFight":bout["titleFight"],"result":bout["result"]}
        checks.pop(bid,None)
        indexed+=1
    if attempts:print("UFCalendar full UFC career IDs indexed:",indexed,"of",attempts,"lookups")
    return indexed


def reconcile_legacy_ufc_by_event_date(client,state,research,coverage,today,
                                       approval=None,evidence=None):
    """One-time four-event provider crosscheck; never trust source IDs blindly.

    Official UFC source proves the event/date and two fighters, *not* that a
    possibly stale UFCalendar historical native ID addresses that same fight.
    Batch by event date to avoid one paid search call per athlete; request no
    more than four date windows from the 12-item approved legacy manifest.
    A different returned ID is a manual-review candidate, never a silent link.
    """
    if not isinstance(coverage,dict) or coverage.get("schema")!=1 or \
       coverage.get("scope")!="ufc" or coverage.get("activityMonths")!=36 or \
       coverage.get("indexCompleteness")!="36_month_event_scan_complete":
        return {"calls":0,"indexed":0,"alternative":0}
    if not (today-dt.timedelta(days=7)).isoformat()<=str(coverage.get("asOf") or "")<=today.isoformat():
        return {"calls":0,"indexed":0,"alternative":0}
    approved=approved_ufc_career_cohort(approval,coverage,today)
    if not approved or not isinstance(evidence,dict) or evidence.get("schema")!=1 or \
       evidence.get("scope")!="ufc-official-legacy-evidence":
        return {"calls":0,"indexed":0,"alternative":0}
    eligible={slug(f.get("slug")) for f in coverage.get("fighters",[])
              if isinstance(f,dict) and f.get("eligibilityStatus")=="latest_observed_mma_ufc"}
    eligible.intersection_update(approved)
    normalized=lambda value:re.sub(r"[^a-z0-9]","",
        unicodedata.normalize("NFKD",safe(value,140)).encode("ascii","ignore").decode().casefold())
    grouped={}
    seen=set()
    for row in evidence.get("bouts",[]):
        if not isinstance(row,dict):continue
        bid=str(row.get("fightId") or "")
        day=date_str(row.get("date"))
        fighter=slug(row.get("fighterSlug"))
        opponent=safe(row.get("opponent"),110)
        source=str(row.get("sourceUrl") or "")
        signature=(bid,fighter,day,normalized(opponent))
        if (not re.fullmatch(r"[1-9][0-9]{0,11}",bid) or not day or
            fighter not in eligible or not normalized(opponent) or
            not source.startswith("https://www.ufc.com/") or
            signature in seen or bid in state.get("bouts",{})):
            continue
        profile=research.get("profiles",{}).get(fighter,{})
        if not isinstance(profile,dict):continue
        if not any(isinstance(r,dict) and str(r.get("boutId"))==bid and
                   str(r.get("promotion") or "").lower()=="ufc" and
                   date_str(r.get("date"))==day and
                   normalized(r.get("opponent"))==normalized(opponent)
                   for r in profile.get("recentHistory",[])):
            continue
        seen.add(signature)
        grouped.setdefault(day,[]).append((bid,fighter,opponent,profile))
    checks=state.setdefault("ufcLegacyDateSearchChecks",{})
    calls=indexed=alternatives=0
    for day,targets in sorted(grouped.items()):
        if calls>=4 or client.remaining<=0 or client.stopped or \
           client.calls>=client.max_calls-20:break
        pending=[x for x in targets if x[0] not in checks or
                 (checks[x[0]].get("status")=="retry" and
                  str(checks[x[0]].get("retryAfter") or "")<=today.isoformat())]
        if not pending:continue
        date=dt.date.fromisoformat(day)
        start=(date-dt.timedelta(days=1)).isoformat()
        end=(date+dt.timedelta(days=2)).isoformat()
        path="/fights/search"+param(org="ufc",**{"from":start,"to":end},limit=25)
        response=client.call(path)
        calls+=1
        if response is None:
            # Transient failures may be retried later; a failed query is not
            # evidence the historical bout does not exist.
            for bid,*_ in pending:
                checks[bid]={"status":"retry","checkedAt":today.isoformat(),
                             "retryAfter":(today+dt.timedelta(days=7)).isoformat()}
            continue
        rows=response_rows(response)
        for bid,fighter,opponent,profile in pending:
            aliases={normalized(profile.get("name")),
                     normalized(fighter.replace("-"," "))}
            aliases.discard("")
            valid=[]
            for row in rows:
                bout=summary_bout(row)
                event=row.get("event") if isinstance(row,dict) else None
                if not bout or not isinstance(event,dict):continue
                title=safe(event.get("title"),150)
                event_date=date_str(event.get("starts_at"))
                if not event_date or abs((dt.date.fromisoformat(event_date)-date).days)>1:
                    continue
                if (event.get("org") not in (None,"ufc") or
                    not official_ufc_event_title(title) or
                    bout["status"] not in ("completed","draw","no_contest")):
                    continue
                a,b=bout["a"],bout["b"]
                if not ((normalized(a.get("name")) in aliases and
                         normalized(b.get("name"))==normalized(opponent)) or
                        (normalized(b.get("name")) in aliases and
                         normalized(a.get("name"))==normalized(opponent))):
                    continue
                valid.append((bout,event,title,event_date))
            ids={x[0]["id"] for x in valid}
            if len(ids)!=1:
                checks[bid]={"status":"ambiguous" if ids else "no_match",
                             "checkedAt":today.isoformat(),
                             "candidateCount":len(ids)}
                continue
            bout,event,title,event_date=valid[0]
            found=bout["id"]
            if found!=bid:
                # Provider search has contradicted the stored canonical
                # historical ID. Do not reassign native IDs or fetch rounds
                # under an unapproved crosswalk.
                checks[bid]={"status":"alternative_id_manual_review",
                             "checkedAt":today.isoformat(),
                             "candidateId":found,"eventDate":event_date,
                             "event":title}
                alternatives+=1
                continue
            state["bouts"][bid]={
                "id":bid,"a":bout["a"],"b":bout["b"],"event":title,
                "eventDate":event_date,"org":"ufc",
                "eventId":positive(event.get("id")),
                "status":bout["status"],"main":bout["main"],
                "titleFight":bout["titleFight"],"result":bout["result"]}
            state.setdefault("ufcCareerBoutChecks",{}).pop(bid,None)
            checks[bid]={"status":"indexed_exact_native_id",
                         "checkedAt":today.isoformat(),"candidateId":found}
            indexed+=1
    if calls:
        print("UFCalendar verified legacy date-search:",calls,
              "provider calls,",indexed,"exact native IDs indexed,",
              alternatives,"alternative IDs requiring review")
    return {"calls":calls,"indexed":indexed,"alternative":alternatives}

def reconcile_approved_ufc_full_career_timelines(client,state,research,coverage,today,approval=None):
    """One bounded, identity-verified crosscheck of cached UFC career histories.

    Slug lookups are already cached by collect_careers. Use the distinct numeric
    UFC fighter ID from previously saved official fight corners to make a
    genuinely different identity-based history check, once per eligible fighter.
    This may recover older UFC bouts or explicit provider completeness evidence.
    It never calls the provider without a verified ID or interprets an absent
    'truncated' flag as complete.
    """
    if (not isinstance(coverage,dict) or coverage.get("schema")!=1 or
        coverage.get("scope")!="ufc" or coverage.get("activityMonths")!=36 or
        coverage.get("indexCompleteness")!="36_month_event_scan_complete"):
        return {"attempts":0,"added":0,"certified":0}
    stamp=date_str(coverage.get("asOf"))
    if not stamp or not (today-dt.timedelta(days=7)).isoformat()<=stamp<=today.isoformat():
        return {"attempts":0,"added":0,"certified":0}
    approved=approved_ufc_career_cohort(approval,coverage,today)
    if not approved:return {"attempts":0,"added":0,"certified":0}
    eligible={slug(row.get("slug")):row for row in coverage.get("fighters",[])
              if isinstance(row,dict) and row.get("eligibilityStatus")=="latest_observed_mma_ufc"
              and slug(row.get("slug")) in approved}
    if not eligible:return {"attempts":0,"added":0,"certified":0}
    profiles=research.get("profiles",{})
    # Index identities once rather than scanning every bout for every fighter.
    identity_ids={}
    for bout in state.get("bouts",{}).values():
        if not isinstance(bout,dict) or bout.get("org")!="ufc":continue
        name=safe(bout.get("event"),150)
        if re.search(r"(?:contender\s+series|road\s+to\s+ufc|\bdwcs\b)",name,re.I):
            continue
        for side in ("a","b"):
            athlete=bout.get(side)
            if not isinstance(athlete,dict):continue
            s=slug(athlete.get("slug"))
            if s not in eligible:continue
            fid=str(athlete.get("id") or "")
            if re.fullmatch(r"[1-9][0-9]{0,11}",fid):
                identity_ids.setdefault(s,set()).add(fid)
    # Different approved slugs claiming one numeric ID are ambiguous; do
    # not connect them or request a potentially wrong person's career data.
    id_owners={}
    for s,ids in identity_ids.items():
        if len(ids)==1:
            fid=next(iter(ids))
            id_owners.setdefault(fid,set()).add(s)
    checks=state.setdefault("ufcFullCareerHistoryChecks",{})
    # A small fraction of each run, after recent-five fight and round requests.
    cap=max(0,min(12,int(client.max_calls*.03)))
    candidates=[]
    for s,entry in eligible.items():
        profile=profiles.get(s)
        if not isinstance(profile,dict) or profile.get("ufcTimeline",{}).get("complete") is True:
            continue
        ids=identity_ids.get(s,set())
        if len(ids)!=1:continue
        fid=next(iter(ids))
        if len(id_owners.get(fid,set()))!=1:continue
        history=[r for r in profile.get("recentHistory",[])
                 if isinstance(r,dict) and str(r.get("promotion") or "").lower()=="ufc"]
        prior=checks.get(s,{})
        last=date_str(entry.get("lastUfcFight"))
        if isinstance(prior,dict):
            if str(prior.get("retryAfter") or "")>today.isoformat():continue
            if prior.get("status")=="checked" and prior.get("lastUfcFight")==last:continue
        # The longest known careers offer the highest chance of rescuing old
        # bouts that were truncated by an earlier slug-based history lookup.
        candidates.append((-len(history),s,fid,history,last))
    candidates.sort()
    attempts=added=certified=0
    for _,s,fid,history,last in candidates:
        if (attempts>=cap or client.stopped or client.remaining<=0 or
            client.calls>=client.max_calls-12):
            break
        attempts+=1
        before={((r.get("date") or ""),safe(r.get("opponent"),110).casefold())
                for r in history}
        payload=client.call("/fighters/"+fid+"/history")
        rows=response_rows(payload)
        if not rows or not any(isinstance(r,dict) and
                 str(r.get("org_slug") or r.get("org") or "").lower()=="ufc"
                 for r in rows):
            days=30 if payload is not None else 7
            checks[s]={"status":"retry","checkedAt":today.isoformat(),
                       "lastUfcFight":last,"numericFighterId":fid,
                       "retryAfter":(today+dt.timedelta(days=days)).isoformat()}
            continue
        # A numeric-ID endpoint may be unsupported or route to a different
        # fighter. Do not merge foreign UFC results merely because they share
        # the organisation. Require a confirmed overlap with our saved career:
        # either a native UFC fight ID on the same date, or date + opponent.
        incoming=summarize_history(payload)
        def match_key(row):
            day=date_str(row.get("date"))
            opponent=re.sub(r"[^a-z0-9]","",safe(row.get("opponent"),110).casefold())
            return (day,opponent) if day and opponent else None
        prior_keys={match_key(r) for r in history if match_key(r)}
        prior_ids={(str(r.get("boutId")),date_str(r.get("date")))
                   for r in history if r.get("source")=="native" and
                   re.fullmatch(r"[1-9][0-9]{0,11}",str(r.get("boutId") or ""))}
        anchored=any(
            match_key(r) in prior_keys or
            (str(r.get("boutId")),date_str(r.get("date"))) in prior_ids
            for r in incoming if str(r.get("promotion") or "").lower()=="ufc")
        if not anchored:
            checks[s]={"status":"requires_manual_review",
                       "checkedAt":today.isoformat(),"lastUfcFight":last,
                       "numericFighterId":fid,
                       "reason":"numeric_history_no_overlap_with_saved_ufc_bouts",
                       "retryAfter":(today+dt.timedelta(days=30)).isoformat()}
            continue
        profile=profiles[s]
        old_complete=profile.get("ufcTimeline",{}).get("complete") is True
        merged=save_ufc_timeline(profile,payload,today)
        after={((r.get("date") or ""),safe(r.get("opponent"),110).casefold())
               for r in merged if str(r.get("promotion") or "").lower()=="ufc"}
        newfound=len(after-before)
        added+=newfound
        full=profile.get("ufcTimeline",{}).get("complete") is True
        if last and not any(
            str(row.get("promotion") or "").lower()=="ufc" and
            date_str(row.get("date"))==last for row in incoming):
            # Record a contradiction regardless of previous completeness
            # flags: older saved rows cannot 'repair' the provider timeline.
            profile["ufcTimeline"]["complete"]=False
            profile["ufcTimeline"]["missingRosterLastUfcFight"]=last
            full=False
        if full and not old_complete:certified+=1
        checks[s]={"status":"checked","checkedAt":today.isoformat(),
                   "lastUfcFight":last,"numericFighterId":fid,
                   "ufcHistoryRowsBefore":len(history),"ufcHistoryRowsAfter":len(after),
                   "newUfcBoutsRecovered":newfound,
                   "explicitFullProviderTimeline":full}
    if attempts:
        print("UFCalendar approved UFC career ID crosschecks:",
              attempts,"older UFC bouts newly recovered:",added,
              "provider-complete careers newly certified:",certified)
    return {"attempts":attempts,"added":added,"certified":certified}

def verify_short_ufc_careers(client,state,research,coverage,today):
    """One-time full timelines for fighters with fewer than five UFC fights."""
    if coverage.get("schema")!=1 or coverage.get("scope")!="ufc":return 0
    stamp=date_str(coverage.get("asOf"))
    if not stamp or not (today-dt.timedelta(days=7)).isoformat()<=stamp<=today.isoformat():
        return 0
    checks=state.setdefault("ufcShortTimelineChecks",{})
    profiles=research.get("profiles",{})
    cap=max(0,min(40,int(client.max_calls*.09)))
    attempted=0
    for fighter in coverage.get("fighters",[]):
        if attempted>=cap or client.remaining<=0 or client.stopped or client.calls>=client.max_calls-10:
            break
        if not isinstance(fighter,dict) or not fighter.get("needsHistoryCheck"):
            continue
        recent=fighter.get("recent") or []
        if not (0<len(recent)<5) or any(not isinstance(r,dict) or not r.get("boutId") for r in recent):
            continue
        slugval=slug(fighter.get("slug"))
        if not slugval or slugval not in profiles:continue
        profile=profiles[slugval]
        evidence=profile.get("ufcTimeline") or {}
        if evidence.get("complete") is True and type(evidence.get("settledCount")) is int:
            continue
        prior=checks.get(slugval,{})
        if isinstance(prior,dict) and (prior.get("status")=="checked" or
                str(prior.get("retryAfter") or "")>today.isoformat()):
            continue
        stable_id=stable_indexed_fighter_id(state,slugval)
        attempted+=1
        payload=client.call("/fighters/"+(stable_id or slugval)+"/history")
        if payload is None:
            checks[slugval]={"status":"retry","checkedAt":today.isoformat(),
                             "retryAfter":(today+dt.timedelta(days=7)).isoformat()}
            continue
        history=save_ufc_timeline(profile,payload,today)
        state.setdefault("historyDone",{})[slugval]=len(history)
        checks[slugval]={"status":"checked","checkedAt":today.isoformat(),
                         "complete":profile["ufcTimeline"]["complete"],
                         "settledCount":profile["ufcTimeline"]["settledCount"]}
    if attempted:print("UFCalendar short UFC career timeline checks:",attempted)
    return attempted

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
    # Existing progress can be marked complete after scanning only 18 months.
    # A one-time 36-month migration must reopen the event cursor, while keeping
    # all fetched bouts and statistics permanently cached in the archive.
    if int(state.get("historicalWindowMonthsUfc") or 18)<36:
        state.setdefault("historicalComplete",{}).pop("ufc",None)
        state.setdefault("historicalCursor",{}).pop("ufc",None)
        state["historicalWindowMonthsUfc"]=36
    # Earlier versions stored only up to 20 career rows. Rehydrate once,
    # preserving existing research until a fuller provider response is saved.
    if int(state.get("ufcHistorySchema") or 1)<2:
        state["historyDone"]={}
        state["ufcHistorySchema"]=2
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
        refresh_unlinked_ufc_native_ids(client,state,research,coverage,today)
        collect_profiles(client,state,cards,research,today)
        collect_careers(client,state,research)
        # Reuse persisted native career IDs before the round-statistics pass:
        # both fighters share each indexed fight and its single round fetch.
        # The roster census and user approval are dated in Melbourne, not UTC.
        # Keep UTC for monthly API budgeting and cache observation timestamps.
        roster_today=dt.datetime.now(ZoneInfo("Australia/Melbourne")).date()
        approved36=read(COVERAGE36,{})
        approval=read(ROSTER_APPROVAL,{})
        collect_ufc_career_bouts(
            client,state,research,approved36,roster_today,approval,
            read(ROOT/"data/ufc-official-finale-recovery.json",{}))
        reconcile_legacy_ufc_by_event_date(
            client,state,research,approved36,roster_today,approval,
            read(LEGACY_UFC_EVIDENCE,{}))
        round_priority=approved_ufc_round_priority(approval,approved36,research,roster_today,state)
        recovery=collect_rounds(client,state,cards,archive,pfl_archive,today,coverage,
                                approved_priority=round_priority)
        if recovery["retried"]:
            print("UFCalendar incomplete UFC round rechecks:",recovery["retried"])
        collect_judging(client,state,cards,judging)
        verify_short_ufc_careers(client,state,research,coverage,today)
        reconcile_approved_ufc_full_career_timelines(
            client,state,research,approved36,roster_today,approval)
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
