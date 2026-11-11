#!/usr/bin/env python3
"""Incremental UFC research store. Selected statistics only; no raw API feeds or secrets."""
import datetime as dt
import json
import os
import re
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "data/ufc-research-archive.json"
LEDGER = ROOT / "data/ufc-research-ledger.json"
CALENDAR = ROOT / "data/ufcalendar-intelligence.json"
CITO_BASE = "https://api.citoapi.com/api/v1"
ROLLING_BUDGET = 120
MAX_RUN_CALLS = 9
METRICS = ("sigLanded", "sigAttempted", "sigAbsorbed", "totalLanded", "totalAttempted",
           "takedowns", "takedownAttempts", "knockdowns", "controlSec", "subAttempts",
           "headLanded", "headAttempted", "bodyLanded", "bodyAttempted", "legLanded",
           "legAttempted", "distanceLanded", "clinchLanded", "groundLanded")
CAL_MAP = {"sigLanded":"sigLanded","sigAbsorbed":"sigAbsorbed",
           "takedowns":"takedowns","knockdowns":"knockdowns",
           "controlSec":"controlSec","subAttempts":"subAttempts",
           "headStrikes":"headLanded","bodyStrikes":"bodyLanded","legStrikes":"legLanded"}
CITO_MAP = {"significantStrikes":"sigLanded","sigStrikes":"sigLanded",
            "totalStrikes":"totalLanded","takedowns":"takedowns",
            "knockdowns":"knockdowns","submissionAttempts":"subAttempts",
            "head":"headLanded","body":"bodyLanded","leg":"legLanded",
            "distance":"distanceLanded","clinch":"clinchLanded","ground":"groundLanded"}
def read(path, default):
    try:
        value = json.loads(path.read_text(encoding="utf8"))
        return value if isinstance(value, dict) else default
    except (ValueError, OSError):
        return default

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False)+"\n", encoding="utf8")
    tmp.replace(path)

def normal(name):
    return re.sub("[^a-z0-9]", "", unicodedata.normalize("NFKD", str(name or ""))
                  .encode("ascii","ignore").decode().lower())

def key_for(day, a, b):
    try:
        dt.date.fromisoformat(day)
    except (ValueError, TypeError):
        return None
    a, b = normal(a), normal(b)
    return day+":"+":".join(sorted([a,b])) if a and b and a != b else None

def count(value):
    return value if type(value) is int and value >= 0 else None

def landed_attempted(value):
    if count(value) is not None:
        return value, None
    if isinstance(value, dict):
        return count(value.get("landed", value.get("made"))), count(value.get("attempted"))
    if isinstance(value, str):
        m = re.fullmatch(r"\s*(\d+)\s*(?:of|/)\s*(\d+)\s*", value)
        if m:
            a,b=map(int,m.groups())
            if a<=b: return a,b
    return None,None

def to_seconds(value):
    if count(value) is not None: return value
    if isinstance(value,str) and re.fullmatch(r"\d{1,2}:\d{2}",value):
        a,b=map(int,value.split(":"))
        return a*60+b if b<60 else None
    return None

def normalize_round(rows, source):
    result={}
    for row in rows or []:
        if not isinstance(row,dict): continue
        n=row.get("round",row.get("roundNumber"))
        if type(n) is not int or not 1<=n<=12: continue
        entry=result.setdefault(n,{"round":n})
        for corner in ("a","b"):
            raw=row.get(corner)
            if not isinstance(raw,dict): continue
            values={}
            if source=="ufcalendar":
                for field,dest in CAL_MAP.items():
                    num=count(raw.get(field))
                    if num is not None: values[dest]=num
            else:
                for field,dest in CITO_MAP.items():
                    if raw.get(field) is None: continue
                    num,den=landed_attempted(raw[field])
                    if num is not None: values[dest]=num
                    attempt={"sigLanded":"sigAttempted","totalLanded":"totalAttempted",
                             "takedowns":"takedownAttempts","headLanded":"headAttempted",
                             "bodyLanded":"bodyAttempted","legLanded":"legAttempted"}.get(dest)
                    if attempt and den is not None: values[attempt]=den
                num=to_seconds(raw.get("controlTime",raw.get("control_time_sec")))
                if num is not None: values["controlSec"]=num
                for src,dest in (("significantStrikesLanded","sigLanded"),
                                 ("significantStrikesAttempted","sigAttempted"),
                                 ("takedownsLanded","takedowns"),("takedownsAttempted","takedownAttempts")):
                    num=count(raw.get(src))
                    if num is not None: values[dest]=num
            if values: entry[corner]=values
    return [result[k] for k in sorted(result) if len(result[k])>1]

def reconcile(fight):
    merged={}
    conflict=[]
    for source in ("ufc-stats-api","cito","ufcalendar"):
        for round_data in fight.get("sources",{}).get(source,{}).get("rounds",[]):
            n=round_data["round"]
            rec=merged.setdefault(n,{"round":n,"a":{},"b":{}})
            for corner in ("a","b"):
                for field,val in round_data.get(corner,{}).items():
                    if field not in METRICS or count(val) is None: continue
                    if field not in rec[corner]:
                        rec[corner][field]=val
                        rec[corner].setdefault("sourceByMetric",{})[field]=source
                    elif rec[corner][field]!=val:
                        conflict.append({"round":n,"corner":corner,"metric":field,
                                         "chosen":rec[corner][field],"alternative":val,"source":source})
    fight["rounds"]=[merged[n] for n in sorted(merged)]
    fight["conflicts"]=conflict[:40]
    fight["roundsCaptured"]=len(fight["rounds"])

def put(archive,day,a,b,event,source,source_id,rounds,stamp):
    k=key_for(day,a,b)
    if not k or not rounds: return False
    fight=archive.setdefault("fights",{}).setdefault(k,{
        "date":day,"fighterA":a,"fighterB":b,"event":event,
        "promotion":"UFC","sources":{}})
    # A source may list the fighters in reverse order. Align every corner to
    # the canonical fighter names before merging or comparing statistics.
    if normal(a)==normal(fight["fighterB"]) and normal(b)==normal(fight["fighterA"]):
        rounds=[dict(r, **({"a":r["b"]} if "b" in r else {}),
                          **({"b":r["a"]} if "a" in r else {})) for r in rounds]
        for row in rounds:
            if "a" in row and "b" not in row and any("a" in z for z in rounds): pass
    old=fight["sources"].get(source,{})
    old_rounds=old.get("rounds",[])
    if sum(len(x) for x in rounds)<sum(len(x) for x in old_rounds):
        rounds=old_rounds
    fight["sources"][source]={"id":str(source_id),"rounds":rounds,"observedAt":stamp}
    reconcile(fight)
    return True

def import_calendar(archive,stamp):
    source=read(CALENDAR,{})
    imported=0
    for ident,fight in source.get("fights",{}).items():
        if not isinstance(fight,dict) or fight.get("org")!="ufc": continue
        a,b=fight.get("fighterA") or {},fight.get("fighterB") or {}
        if put(archive,fight.get("date"),a.get("name"),b.get("name"),fight.get("event",""),
               "ufcalendar",ident,normalize_round(fight.get("rounds"),"ufcalendar"),stamp):
            imported+=1
    return imported

class CitoClient:
    def __init__(self,key,ledger,today,transport=None):
        self.key,self.ledger,self.today=key,ledger,today
        self.transport=transport or self.http
        threshold=(today-dt.timedelta(days=30)).isoformat()
        ledger["requests"]=[x for x in ledger.get("requests",[]) if isinstance(x,str) and x>=threshold]
        self.calls=0
        self.stopped=False
    def http(self,endpoint):
        req=urllib.request.Request(CITO_BASE+endpoint,headers={
            "x-api-key":self.key,"Accept":"application/json","User-Agent":"BEFN-UFC-Archive/1.0"})
        with urllib.request.urlopen(req,timeout=25) as response:
            return json.load(response),dict(response.headers)
    def get(self,endpoint):
        if not self.key or self.stopped or self.calls>=MAX_RUN_CALLS or len(self.ledger["requests"])>=ROLLING_BUDGET:
            return None
        self.calls+=1
        self.ledger["requests"].append(self.today.isoformat())
        try:
            obj,headers=self.transport(endpoint)
            if isinstance(headers,dict):
                rem=headers.get("X-RateLimit-Monthly-Remaining")
                if str(rem).isdigit():
                    self.ledger["providerRemaining"]=int(rem)
                    if int(rem)<=3: self.stopped=True
            if not isinstance(obj,dict) or obj.get("success") is False:
                self.ledger["error"]="invalid_response"
                return None
            return obj.get("data")
        except urllib.error.HTTPError as e:
            self.ledger["error"]="HTTP_"+str(e.code)
            if e.code in (401,403,429): self.stopped=True
        except (OSError,ValueError,TimeoutError):
            self.ledger["error"]="network_error"
        return None

def slug_of(event):
    value=event.get("slug") or event.get("eventSlug")
    return value if isinstance(value,str) and re.fullmatch("[a-z0-9][a-z0-9-]{2,90}",value) else None

def date_of(event):
    value=str(event.get("date") or event.get("eventDate") or event.get("startDate") or event.get("startsAt") or "")[:10]
    try: return dt.date.fromisoformat(value)
    except ValueError: return None

def list_of(value,plural):
    if isinstance(value,list): return value
    if isinstance(value,dict):
        for key in (plural,"items","results","data"):
            if isinstance(value.get(key),list): return value[key]
    return []

def name_of(raw):
    if isinstance(raw,str): return raw[:95]
    if isinstance(raw,dict): return str(raw.get("name") or raw.get("fullName") or raw.get("fighterName") or "")[:95]
    return ""

def bout_of(raw):
    if not isinstance(raw,dict): return None
    a=name_of(raw.get("red") or raw.get("fighter1") or raw.get("fighterA"))
    b=name_of(raw.get("blue") or raw.get("fighter2") or raw.get("fighterB"))
    if not a or not b:
        pair=raw.get("fighters")
        if isinstance(pair,list) and len(pair)==2:
            red=next((f for f in pair if isinstance(f,dict) and str(f.get("corner","")).lower() in ("red","a")),None)
            blue=next((f for f in pair if isinstance(f,dict) and str(f.get("corner","")).lower() in ("blue","b")),None)
            if red is not None and blue is not None:
                a,b=name_of(red),name_of(blue)
            else:
                a,b=name_of(pair[0]),name_of(pair[1])
    bid=raw.get("id") or raw.get("boutId") or raw.get("dataId")
    return (str(bid),a,b) if bid and a and b else None

def parse_cito(archive,stats,bouts,date,event,stamp):
    if not isinstance(stats,dict): return 0
    all_bouts=list_of(stats.get("bouts"),"bouts") or list_of(bouts,"bouts")
    known={item[0]:item for raw in all_bouts if (item:=bout_of(raw))}
    rounds=list_of(stats.get("roundStats") or stats.get("rounds"),"rounds")
    grouped={}
    for row in rounds:
        if not isinstance(row,dict): continue
        bid=str(row.get("boutId") or row.get("fightId") or row.get("bout_id") or "")
        if bid not in known: continue
        _,a,b=known[bid]
        n=row.get("round",row.get("roundNumber"))
        if type(n) is not int or not 1<=n<=12: continue
        corner=str(row.get("corner") or row.get("side") or row.get("fighterPosition") or "").lower()
        if corner in ("a","red","1"): corner="a"
        elif corner in ("b","blue","2"): corner="b"
        else:
            fighter=normal(name_of(row.get("fighter") or row.get("athlete") or row.get("fighterName")))
            corner="a" if fighter and fighter==normal(a) else ("b" if fighter and fighter==normal(b) else None)
        if corner:
            grouped.setdefault(bid,{}).setdefault(n,{"round":n})[corner]=row.get("stats",row)
    added=0
    for bid,rounds_by_no in grouped.items():
        _,a,b=known[bid]
        detail=normalize_round([rounds_by_no[k] for k in sorted(rounds_by_no)],"cito")
        if put(archive,date,a,b,event,"cito",bid,detail,stamp): added+=1
    return added

def run(today=None,transport=None,collect=True):
    today=today or dt.datetime.now(dt.timezone.utc).date()
    stamp=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    archive=read(ARCHIVE,{"schema":1,"fights":{},"events":{},"description":
        "Selected derived metrics for BEFN analysis, not a redistributed raw API feed."})
    if archive.get("schema")!=1: raise RuntimeError("Unknown archive schema; no overwrite")
    ledger=read(LEDGER,{"schema":1,"requests":[]})
    ledger.pop("error",None)
    imported=import_calendar(archive,stamp)
    client=CitoClient(os.environ.get("UFC_STATS_API_CITO","").strip(),ledger,today,transport)
    if collect and client.key:
        recent=client.get("/ufc/events/recent")
        candidates={}
        for event in list_of(recent,"events"):
            if not isinstance(event,dict): continue
            slug,day=slug_of(event),date_of(event)
            if slug and day and 0<=(today-day).days<=28:
                candidates[slug]={"day":day,"title":str(event.get("name") or event.get("title") or slug)[:100]}
        for slug,metadata in archive.get("events",{}).items():
            try: age=(today-dt.date.fromisoformat(metadata["date"])).days
            except (ValueError,KeyError,TypeError): continue
            if 0<=age<=28 and not metadata.get("verified"):
                candidates.setdefault(slug,{"day":dt.date.fromisoformat(metadata["date"]),"title":metadata.get("title",slug)})
        for slug,info in sorted(candidates.items(),key=lambda pair:pair[1]["day"],reverse=True)[:5]:
            day,title=info["day"],info["title"]
            if archive.get("events",{}).get(slug,{}).get("verified") and archive.get("cornerAlignmentVersion")==2: continue
            stats=client.get("/ufc/events/"+slug+"/stats")
            if stats is None: continue
            bouts=stats.get("bouts",[]) if isinstance(stats,dict) else []
            if not bouts: bouts=client.get("/ufc/events/"+slug+"/bouts")
            added=parse_cito(archive,stats,bouts,day.isoformat(),title,stamp)
            record=archive["events"].setdefault(slug,{"date":day.isoformat(),"title":title})
            record["checkedAt"]=stamp
            record["capturedBouts"]=max(added,record.get("capturedBouts",0))
            if added and (today-day).days>=2: record["verified"]=True
            if not added:
                record["shape"]={"keys":sorted(stats.keys())[:20] if isinstance(stats,dict) else [],
                                 "roundRows":len(list_of(stats.get("roundStats") or stats.get("rounds"),"rounds")) if isinstance(stats,dict) else 0,
                                 "boutRows":len(list_of(bouts,"bouts")),
                                 "boutSampleId":(list_of(bouts,"bouts")[0].get("id") if list_of(bouts,"bouts") else None),
                                 "boutSampleDataId":(list_of(bouts,"bouts")[0].get("dataId") if list_of(bouts,"bouts") else None),
                                 "fighterSampleType":type(list_of(bouts,"bouts")[0].get("fighters")).__name__ if list_of(bouts,"bouts") else None,
                                 "fighterSampleKeys":sorted(list_of(bouts,"bouts")[0]["fighters"][0].keys()) if list_of(bouts,"bouts") and isinstance(list_of(bouts,"bouts")[0].get("fighters"),list) and list_of(bouts,"bouts")[0]["fighters"] and isinstance(list_of(bouts,"bouts")[0]["fighters"][0],dict) else [],
                                 "roundSampleBoutId":(list_of(stats.get("roundStats"),"rounds")[0].get("boutId") if isinstance(stats,dict) and list_of(stats.get("roundStats"),"rounds") else None)}
    # Mark the migration complete only after all eligible saved cards were successfully rechecked.
    if all((v.get("capturedBouts") or 0)>0 for v in archive.get("events",{}).values()):
        archive["cornerAlignmentVersion"]=2
    archive["updatedAt"]=stamp
    ledger["lastRun"]=stamp
    ledger["lastCalls"]=client.calls
    ledger["importedUFCalendar"]=imported
    ledger["storedFights"]=len(archive["fights"])
    ledger["status"]="missing_key" if not client.key else ("failed" if ledger.get("error") else "connected")
    write(ARCHIVE,archive)
    write(LEDGER,ledger)
    print("UFC archive saved. fights=%d Cito_calls=%d UFCalendar_fights=%d status=%s" %
          (ledger["storedFights"],client.calls,imported,ledger["status"]))
    return archive,ledger

if __name__=="__main__":
    run(collect=os.getenv("BEFN_CITO_COLLECTION","true").lower()=="true")
