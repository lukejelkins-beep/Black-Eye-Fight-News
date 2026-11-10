#!/usr/bin/env python3
"""Reconcile two complete ONE Championship October events with official results.

The legacy aggregator included duplicate fights, country codes appended to athlete
names, wrong martial arts disciplines and divisions. The official winner, section,
method, round and finish time supersede the aggregator; previously sourced fighter
records and identity-matched images are retained. Fail closed on unknown pairs.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
RESULTS = ROOT / "data/results.json"
FIXTURE = ROOT / "data/one-official-october-2026.json"
ALIAS = {"ougaakita": "ogaakita", "prajanchai": "prajanchai pongsuphan pk"}

def normal(value):
    value = str(value or "")
    value = re.sub(r"[“][^”]+[”]", "", value)
    value = re.sub(r"(?:\s+[A-Z]{3}){2}$", "", value)
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    key = re.sub(r"[^a-z0-9]", "", value)
    return re.sub(r"[^a-z0-9]", "", ALIAS.get(key,key))

def names_pair(fighters):
    return frozenset(normal(f.get("name")) for f in fighters)

def safe_prior(fighter):
    # Keep record and photo provenance, not stray event metadata or unknown alt text.
    allowed = ("record","recordSource","recordContext","recordNote","preRecord",
               "preRecordSource","photo","photoSource","photoNote",
               "countryCode","countrySource","countryLabel",
               "recordVerifiedAt","noContests")
    return {k:fighter[k] for k in allowed if fighter.get(k) is not None}

def reconcile(data, fixture):
    changes=[]
    for block in fixture["events"]:
        date=block["id"]
        matches=[e for e in data["events"] if e.get("date")==date and
                 block["nameIncludes"].lower() in e.get("name","").lower()]
        if len(matches)!=1:
            raise ValueError(f"ONE official card not uniquely identified: {date} {len(matches)}")
        event=matches[0]
        old=[row for row in data["results"] if row.get("eventId")==event["id"]]
        given=block["rows"]
        if not given or any(len(x)!=8 for x in given):
            raise ValueError("Incomplete official ONE card fixture")
        keys=[names_pair([{"name":v[0]},{"name":v[1]}]) for v in given]
        if len(keys)!=len(set(map(frozenset,keys))):
            raise ValueError("Fixture has duplicate bout")
        existing={}
        for row in old:
            if len(row.get("fighters",[]))!=2:
                raise ValueError(f"Non-two-athlete bout: {row.get('id')}")
            key=names_pair(row["fighters"])
            existing.setdefault(key,[]).append(row)
            if key not in keys:
                raise ValueError(f"Unknown ONE athlete pairing in {event['name']}: {key}")
        if set(existing)!=set(keys):
            raise ValueError(f"Official ONE bouts do not match archived fighter pairs: {event['name']}, "
                             f"missing {len(set(keys)-set(existing))}")
        changed=0
        duplicates=set()
        for order,values in enumerate(given):
            win,loss,sport,division,method,round_no,clock,session=values
            candidates=existing[names_pair([{"name":win},{"name":loss}])]
            def priority(row):
                text=str(row.get("method") or "").lower()
                return (
                    "not published" not in text and "unavailable" not in text,
                    sum(bool(f.get("photo")) for f in row.get("fighters",[])),
                    sum(bool(f.get("record")) for f in row.get("fighters",[])),
                )
            source=max(candidates,key=priority)
            for extra in candidates:
                if extra is not source:
                    for f in extra.get("fighters",[]):
                        existing_f=next((g for g in source["fighters"] if normal(g["name"])==normal(f["name"])),None)
                        if existing_f:
                            for field,value in safe_prior(f).items():
                                if not existing_f.get(field):
                                    existing_f[field]=value
                    duplicates.add(extra["id"])
            byname={normal(f.get("name")):safe_prior(f) for f in source["fighters"]}
            winner={"name":win,**byname.get(normal(win),{})}
            loser={"name":loss,**byname.get(normal(loss),{})}
            source.update(
                eventId=event["id"], event=event["name"], sport=sport,
                location="Lumpinee Stadium, Bangkok, Thailand",
                fighters=[winner,loser],winner=0,method=method,
                round=round_no,time=clock,scores=None,
                division=division,session=session,
                section="Main card" if session=="Friday Fights" else "The Inner Circle",
                order=order,source=block["source"],
                status="completed",summary="",scheduledRounds=None,
            )
            changed+=1
        data["results"]=[row for row in data["results"] if row.get("id") not in duplicates]
        if len([r for r in data["results"] if r.get("eventId")==event["id"]])!=len(given):
            raise ValueError("ONE result count mismatch following reconciliation")
        event.update(expectedBouts=len(given),partialCoverage=False,
                     source=block["source"],feeds=[block["source"]],
                     sessions=["ONE Friday Fights","The Inner Circle"],
                     archiveNote="Both separate ONE Championship sessions are listed; every result verified against ONE's official complete results article.",
                     location="Lumpinee Stadium, Bangkok, Thailand",
                     checkedAt=dt.datetime.now(dt.timezone.utc).isoformat())
        changes.append({"event":event["name"],"before":len(old),"after":len(given),
                        "removedDuplicates":len(duplicates),"source":block["source"]})
    return changes

def main():
    data=json.loads(RESULTS.read_text(encoding="utf-8"))
    fixture=json.loads(FIXTURE.read_text(encoding="utf-8"))
    report=reconcile(data,fixture)
    RESULTS.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Reconciled ONE official results:",json.dumps(report,ensure_ascii=False))
if __name__=="__main__":
    main()
