#!/usr/bin/env python3
"""Read-only independent historical UFC bout crosscheck for approved BEFN cohort.

Compare the *complete 2013-02-16..2026-10-10 window* of Bair UFCStats-derived
CC BY 4.0 facts with saved approved UFCalendar UFC histories. No provider API
requests and no writes to approved production source files. Never auto-link or
mark historical careers complete; event dates may differ by one UTC day.
Data credit: Noah Bair, UFC Data v0.1.1, DOI 10.5281/zenodo.23458636.
"""
import argparse
import collections
import csv
import datetime as dt
import json
import re
import unicodedata
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WINDOW_START="2013-02-16"
WINDOW_END="2026-10-10"
SOURCE="Bair UFC Data v0.1.1 / UFCStats (CC BY 4.0)"
SOURCE_URL="https://doi.org/10.5281/zenodo.23458636"
CORE=("fight_id","event_date","f1_id","f2_id","f1_name","f2_name",
      "result_f1","result_f2")
OUTCOME={"W":"win","L":"loss","D":"draw","NC":"no_contest",
         "WIN":"win","LOSS":"loss","DRAW":"draw","NO_CONTEST":"no_contest"}
STOP={"da","de","do","dos","di","jr","junior","iii","ii"}

def normal(v):
    return re.sub(r"[^a-z0-9]","",unicodedata.normalize("NFKD",str(v or ""))
        .encode("ascii","ignore").decode().casefold())

def tokens(v):
    return [x for x in re.sub(r"[^a-z0-9]+"," ",
         unicodedata.normalize("NFKD",str(v or "")).encode("ascii","ignore")
         .decode().casefold()).split() if x not in STOP]

def compatible_name(actual,expected):
    if not normal(actual) or not normal(expected):return False
    if normal(actual)==normal(expected):return True
    a,b=set(tokens(actual)),set(tokens(expected))
    # "Bruno Silva" / "Bruno Gustavo da Silva", or reversed name order,
    # only AFTER a unique date/opponent anchor.
    return len(a)>=2 and len(b)>=2 and len(a&b)>=2 and (
        a.issubset(b) or b.issubset(a) or a==b)

def days_close(a,b):
    try:return abs((dt.date.fromisoformat(a)-dt.date.fromisoformat(b)).days)<=1
    except (TypeError,ValueError):return False

def load_json(path):
    with open(path,encoding="utf8") as handle:return json.load(handle)

def external_rows(path):
    with open(path,newline="",encoding="utf-8-sig") as handle:
        reader=csv.DictReader(handle)
        missing=[x for x in CORE if x not in (reader.fieldnames or ())]
        if missing:raise ValueError("Missing expected independent source fields: "+", ".join(missing))
        rows=[];seen=set()
        for row in reader:
            fid=row["fight_id"].strip()
            date=row["event_date"].strip()
            if not fid or fid in seen or not (WINDOW_START<=date<=WINDOW_END):
                continue
            if not row["f1_id"] or not row["f2_id"] or not row["f1_name"] or not row["f2_name"]:
                continue
            if not (normal(row["f1_name"])!=normal(row["f2_name"])):
                continue
            if row["result_f1"].upper().strip() not in OUTCOME or row["result_f2"].upper().strip() not in OUTCOME:
                continue
            seen.add(fid)
            rows.append({k:(row.get(k) or "").strip() for k in CORE})
    if not rows:raise ValueError("Independent source has no valid official UFC bouts")
    return rows

def compare(approved,research,external):
    if approved.get("schema")!=1 or approved.get("status")!="approved" or (
       approved.get("scope")!="ufc-36-month-roster"):raise ValueError("Roster approval invalid")
    cohort=approved.get("approvedFighters",[])
    if len(cohort)!=783 or len(set(cohort))!=783:raise ValueError("Approved 783 roster changed")
    profiles=research.get("profiles",{})
    by_date=collections.defaultdict(list)
    by_source_id=collections.defaultdict(list)
    for row in external:
        by_date[row["event_date"]].append(row)
        for side in (1,2):by_source_id[row[f"f{side}_id"]].append((row,side))
    entries=[]
    ownership=collections.defaultdict(list)
    for slug in cohort:
        profile=profiles.get(slug,{})
        history=[h for h in profile.get("recentHistory",[])
                 if isinstance(h,dict) and str(h.get("promotion") or "").lower()=="ufc"
                 and str(h.get("source") or "")=="native"
                 and normal(h.get("opponent")) and
                 WINDOW_START<=str(h.get("date") or "")<=WINDOW_END]
        source_ids=set()
        anchors=[]
        for h in history:
            day=str(h.get("date") or "")
            own_name=profile.get("name") or slug.replace("-"," ")
            # Source dates can cross the local/UTC calendar boundary.
            neighbor=[(dt.date.fromisoformat(day)+dt.timedelta(days=shift)).isoformat()
                      for shift in (-1,0,1)]
            for event_day in neighbor:
                for row in by_date.get(event_day,[]):
                    for side in (1,2):
                        opp_side=3-side
                        if (normal(row[f"f{opp_side}_name"])!=normal(h["opponent"]) or
                            not compatible_name(row[f"f{side}_name"],own_name)):
                            continue
                        if not normal(row[f"f{side}_id"]):continue
                        source_ids.add(row[f"f{side}_id"])
                        anchors.append({"sourceFightId":row["fight_id"],
                          "savedNativeFightId":str(h.get("boutId") or ""),
                          "eventDate":row["event_date"],"sourceFighterId":row[f"f{side}_id"]})
        unique_anchor_ids=sorted(source_ids)
        resolved=unique_anchor_ids[0] if len(unique_anchor_ids)==1 else None
        if resolved:ownership[resolved].append(slug)
        entries.append({"slug":slug,"fighterName":profile.get("name") or slug.replace("-"," "),
          "nativeSavedFightRowsInWindow":len(history),"sourceIdCandidates":unique_anchor_ids,
          "anchorMatchCount":len({x["sourceFightId"] for x in anchors}),
          "sourceFighterId":resolved,"anchors":anchors[:15]})
    ambiguous_owner={key for key,owners in ownership.items() if len(owners)>1}
    by_slug={x["slug"]:x for x in entries}
    for entry in entries:
        fid=entry.get("sourceFighterId")
        if not fid or fid in ambiguous_owner:
            entry["status"]="ambiguous_or_unmatched_source_identity"
            entry["missingOfficialBoutsInSourceWindow"]=[]
            if fid in ambiguous_owner:entry["identityCollisionWith"]=ownership[fid]
            entry.pop("sourceFighterId",None)
            continue
        profile=profiles.get(entry["slug"],{})
        history=[h for h in profile.get("recentHistory",[]) if
                 isinstance(h,dict) and str(h.get("promotion") or "").lower()=="ufc"]
        source_bouts=[]
        missing=[]
        for row,side in by_source_id[fid]:
            opposite=3-side
            opp=row[f"f{opposite}_name"]
            day=row["event_date"]
            result=OUTCOME[row[f"result_f{side}"].upper()]
            source_bouts.append(row["fight_id"])
            matched=any(days_close(day,str(h.get("date") or "")) and
                        normal(h.get("opponent"))==normal(opp)
                        for h in history)
            if not matched:
                missing.append({"sourceFightId":row["fight_id"],"eventDate":day,
                  "opponent":opp,"result":result,
                  "sourceUrl":"http://ufcstats.com/fight-details/"+row["fight_id"]})
        entry["status"]="anchored_unique_source_id"
        entry["externalOfficialFightsInWindow"]=len(source_bouts)
        entry["savedExternalBoutMatches"]=len(source_bouts)-len(missing)
        entry["missingOfficialBoutsInSourceWindow"]=missing
        entry["sourceWindowCompleteCompared"]=True
        # Comparison window ends Oct 10, 2026, not Nov 14, 2026.
        # Do NOT interpret zero missing as a full-career certification.
        entry["fullCareerIndependentlyCertified"]=False
    missing=[r for r in entries if r.get("missingOfficialBoutsInSourceWindow")]
    unlinked=[r for r in entries if r["status"]!="anchored_unique_source_id"]
    return {"schema":1,"scope":"ufc-independent-historical-coverage-census",
      "rosterAsOf":approved.get("rosterAsOf"),"source":SOURCE,
      "sourceUrl":SOURCE_URL,"windowStart":WINDOW_START,"windowEnd":WINDOW_END,
      "fullCareerCertificationAllowed":False,
      "summary":{"approved":len(entries),"externalSourceFights":len(external),
         "uniquelyAnchoredFighters":len(entries)-len(unlinked),
         "ambiguousOrUnmatchedSourceFighters":len(unlinked),
         "fightersWithSourceVerifiedMissingBouts":len(missing),
         "sourceVerifiedMissingBoutReferences":sum(len(x["missingOfficialBoutsInSourceWindow"]) for x in missing),
         "fightersWithoutMissingBoutsWithinPartialSourceWindow":
              sum(r["status"]=="anchored_unique_source_id" and
                  not r["missingOfficialBoutsInSourceWindow"] for r in entries),
         "independentlyCertifiedFullUfcCareers":0},
      "missingByFighter":[{"slug":x["slug"],"fighterName":x["fighterName"],
         "sourceFighterId":x.get("sourceFighterId"),
         "externalOfficialFightsInWindow":x["externalOfficialFightsInWindow"],
         "missingOfficialBoutsInSourceWindow":x["missingOfficialBoutsInSourceWindow"]}
          for x in sorted(missing,key=lambda x:(-len(x["missingOfficialBoutsInSourceWindow"]),x["slug"]))],
      "ambiguousIdentities":[{"slug":x["slug"],"fighterName":x["fighterName"],
         "sourceIdCandidates":x["sourceIdCandidates"],
         "anchors":x["anchors"],"identityCollisionWith":x.get("identityCollisionWith")}
         for x in unlinked],
      "fighters":entries}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--csv",required=True,type=Path)
    parser.add_argument("--approval",default=ROOT/"data/ufc-36-month-roster-approval.json",type=Path)
    parser.add_argument("--research",default=ROOT/"data/ufcalendar-fighter-research.json",type=Path)
    parser.add_argument("--output",default=ROOT/"qa/ufc-independent-career-census.json",type=Path)
    args=parser.parse_args()
    report=compare(load_json(args.approval),load_json(args.research),external_rows(args.csv))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print("BEFN_INDEPENDENT_CAREER_CENSUS="+json.dumps(report["summary"],sort_keys=True))
    print("Quality note: 2013–Oct2026 source-window audit only; NOT full-career certification.")

if __name__=="__main__":main()
