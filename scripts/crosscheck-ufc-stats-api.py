#!/usr/bin/env python3
"""Optional, non-commercial UFC Stats API corroboration for existing BEFN fights.

Only exact fighter-and-date matches are accepted. Never invent missing rounds.
Provider may be unavailable; this is a safe fallback, not a required dependency.
"""
import datetime as dt
import importlib.util
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SCRIPT=Path(__file__).with_name("refresh-ufc-research-archive.py")
spec=importlib.util.spec_from_file_location("befn_ufc_archive",SCRIPT)
archive=importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)
BASE="https://ufcapi.aristotle.me"
MAX_CALLS=7

def stats(row):
    out={}
    if not isinstance(row,dict): return out
    mapping={"SIG. STR.":("sigLanded","sigAttempted"),
             "sig_str":("sigLanded","sigAttempted"),
             "sig_strikes":("sigLanded","sigAttempted"),
             "significant_strikes":("sigLanded","sigAttempted"),
             "TOTAL STR.":("totalLanded","totalAttempted"),
             "total_str":("totalLanded","totalAttempted"),
             "TD":("takedowns","takedownAttempts"),
             "td":("takedowns","takedownAttempts"),
             "KD":("knockdowns",None),
             "knockdowns":("knockdowns",None)}
    for source,(landed,attempted) in mapping.items():
        if source not in row: continue
        n,d=archive.landed_attempted(row[source])
        if n is not None: out[landed]=n
        if attempted and d is not None: out[attempted]=d
    for source,dest in (("CTRL","controlSec"),("ctrl","controlSec"),("control_time","controlSec")):
        v=archive.to_seconds(row.get(source))
        if v is not None: out[dest]=v
    for source,dest in (("SUB. ATT.","subAttempts"),("sub_att","subAttempts")):
        v=archive.count(row.get(source))
        if v is not None: out[dest]=v
    return out

def parse_rounds(fight):
    obj=fight.get("rounds") or fight.get("round_stats") or []
    if isinstance(obj,dict):
        obj=obj.get("rounds",[])
    if not isinstance(obj,list): return []
    out=[]
    for r in obj:
        if not isinstance(r,dict): continue
        n=r.get("round",r.get("round_number"))
        if type(n) is not int or not 1<=n<=12: continue
        row={"round":n}
        for src,dst in (("fighter1","a"),("fighter2","b")):
            values=stats(r.get(src))
            if values: row[dst]=values
        if len(row)>1: out.append(row)
    return out

def names(fight):
    totals=fight.get("totals") or {}
    if not isinstance(totals,dict): return ("","")
    a=totals.get("fighter1") or {}
    b=totals.get("fighter2") or {}
    return (str(a.get("fighter") or a.get("name") or ""),
            str(b.get("fighter") or b.get("name") or ""))

def confirmed_date(fight):
    event=fight.get("event") if isinstance(fight.get("event"),dict) else {}
    value=str(fight.get("event_date") or fight.get("date") or event.get("date") or "")[:10]
    try:
        dt.date.fromisoformat(value)
        return value
    except ValueError: return None

class Client:
    def __init__(self,fetch=None):
        self.calls=0
        self.fetch=fetch or self._http
    def _http(self,path):
        request=urllib.request.Request(BASE+path,headers={"Accept":"application/json",
                                                           "User-Agent":"BEFN-Noncommercial-Research/1.0"})
        with urllib.request.urlopen(request,timeout=9) as response:
            return json.load(response)
    def get(self,path):
        if self.calls>=MAX_CALLS: return None
        self.calls+=1
        try:
            return self.fetch(path)
        except (urllib.error.URLError,ValueError,TimeoutError,OSError):
            return None

def run(today=None,fetch=None):
    today=today or dt.datetime.now(dt.timezone.utc).date()
    ledger=archive.read(archive.LEDGER,{"schema":1})
    # One availability probe per UTC week, independent of the 500-call Cito budget.
    week=today.strftime("%G-W%V")
    if ledger.get("ufcStatsCheckedWeek")==week: return 0
    ledger["ufcStatsCheckedWeek"]=week
    data=archive.read(archive.ARCHIVE,{"schema":1,"fights":{},"events":{}})
    client=Client(fetch)
    rows=[x for x in data.get("fights",{}).values()
          if x.get("conflicts") or not x.get("rounds")]
    rows.sort(key=lambda x:x.get("date",""),reverse=True)
    checked=0
    for fight in rows[:3]:
        name=fight.get("fighterA","")
        if not name: continue
        route="/api/fights?"+urllib.parse.urlencode({"search":name,"limit":25})
        response=client.get(route)
        if response is None:
            ledger["ufcStatsStatus"]="unavailable"
            break
        results=response.get("data",[]) if isinstance(response,dict) else []
        for candidate in results if isinstance(results,list) else []:
            if not isinstance(candidate,dict): continue
            a,b=names(candidate)
            if archive.key_for(fight["date"],a,b)!=archive.key_for(fight["date"],fight["fighterA"],fight["fighterB"]):
                continue
            day=confirmed_date(candidate)
            if not day:
                event_id=candidate.get("event_id")
                if not isinstance(event_id,str) or not re.fullmatch("[A-Za-z0-9_-]{4,100}",event_id):
                    continue
                evt=client.get("/api/events/"+event_id)
                day=confirmed_date({"event":evt}) if isinstance(evt,dict) else None
            if day!=fight["date"]: continue
            details=candidate
            ident=candidate.get("id")
            if not parse_rounds(details) and isinstance(ident,str) and re.fullmatch("[a-zA-Z0-9_-]{4,100}",ident):
                details=client.get("/api/fights/"+ident) or candidate
            rounds=parse_rounds(details)
            if rounds and archive.put(data,day,a,b,fight.get("event",""),
                                     "ufc-stats-api",ident,rounds,dt.datetime.now(dt.timezone.utc).isoformat()):
                checked+=1
            break
        if client.calls>=MAX_CALLS: break
    ledger["ufcStatsStatus"]="connected" if checked else ledger.get("ufcStatsStatus","reachable_no_verified_matches")
    ledger["ufcStatsEvidenceAdded"]=checked
    ledger["ufcStatsCalls"]=client.calls
    archive.write(archive.LEDGER,ledger)
    if checked:
        data["updatedAt"]=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        archive.write(archive.ARCHIVE,data)
    print("UFC Stats API corroboration: status=%s, evidence=%d, calls=%d" %
          (ledger["ufcStatsStatus"],checked,client.calls))
    return checked

if __name__=="__main__":
    run()
