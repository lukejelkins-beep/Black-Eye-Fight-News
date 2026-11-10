#!/usr/bin/env python3
"""Enrich six-month UFC results with fighter-paired ESPN records/portraits.

Only a scoreboard competition with the same two named fighters can supply a
portrait or record. Treat a returned ESPN record as source-published at lookup
time, not an invented record immediately after a historical bout.
"""
import concurrent.futures
import datetime as dt
import importlib.machinery
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
photo=importlib.machinery.SourceFileLoader('enrich_headshots',str(ROOT/'scripts/enrich-espn-headshots.py')).load_module()
record=importlib.machinery.SourceFileLoader('enrich_records',str(ROOT/'scripts/enrich-fighter-records.py')).load_module()

def fetch_day(day):
    fixtures=[]
    try:
        scoreboard=photo.get_json(photo.SCOREBOARD+'?dates='+day.replace('-',''),timeout=14)
    except Exception as e:
        print('ESPN archive unavailable for',day,type(e).__name__,file=sys.stderr)
        return day,fixtures
    for event in scoreboard.get('events',[])[:8]:
        fixtures.append(event)
        event_id=str(event.get('id',''))
        if not event_id.isdigit():continue
        try:
            fixtures.append(photo.get_json(photo.FIGHTCENTER+event_id+'?region=us&lang=en&contentorigin=espn',timeout=14))
        except Exception:pass
    return day,fixtures

def main():
    path=ROOT/'data/results.json'
    data=json.loads(path.read_text())
    dates=sorted({r['date'] for r in data.get('results',[]) if
                  r.get('sport')=='MMA' and r.get('event','').lower().startswith('ufc') and
                  '2026-05-11'<=r['date']<='2026-11-11'})
    updated_photo=updated_record=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        for day,fixtures in executor.map(fetch_day,dates):
            for fixture in fixtures:
                updated_photo+=photo.apply_photos(data['results'],fixture)
                updated_record+=record.apply_records(data['results'],fixture,dt.date.today().isoformat())
    if updated_photo or updated_record:
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print('ESPN UFC historical archive dates',len(dates),
          'verified portraits',updated_photo,'verified records',updated_record)

if __name__=='__main__':main()
