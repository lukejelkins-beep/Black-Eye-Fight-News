#!/usr/bin/env python3
"""Match MMA fighters by name + fight pairing to ESPN's published portrait URLs.

Google's UFC results cards do not provide a reusable public thumbnail feed. This
source uses ESPN's fighter-specific headshots and does not store image binaries.
A missing or blocked image is handled by the site's existing initials fallback.
"""
import datetime as dt
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SCOREBOARD='https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard'
FIGHTCENTER='https://site.web.api.espn.com/apis/common/v3/sports/mma/ufc/fightcenter/'
HEADSHOT_HOSTS=('https://a.espncdn.com/i/headshots/mma/','https://a.espncdn.com/i/headshots/mma/players/')
ALIASES={'oliver schmid':'ollie schmid','gabriel lourenco':'gabriel lorenco',
         'seok hyeon ko':'seokhyeon ko','jose mauro delano':'jose delano',
         'nina nikolija milosevic':'nina milosevic'}
def normal(name):
    n=unicodedata.normalize('NFKD',name or '').encode('ascii','ignore').decode().casefold()
    n=re.sub(r'[^a-z0-9]+',' ',n).strip()
    return ALIASES.get(n,n)
def get_json(url,timeout=12):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; InternationalCombatSports/1.0)',
                                            'Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))
def competitions(obj):
    """Find only nested fields explicitly named competitors with two athletes."""
    if isinstance(obj,list):
        for value in obj: yield from competitions(value)
    elif isinstance(obj,dict):
        pair=obj.get('competitors')
        if isinstance(pair,list) and len(pair)==2 and all(isinstance(x,dict) and isinstance(x.get('athlete'),dict) for x in pair):
            yield pair
        for key,value in obj.items():
            if key!='competitors' and isinstance(value,(dict,list)): yield from competitions(value)
def photo_for(athlete):
    headshot=athlete.get('headshot') or {}
    href=headshot.get('href','') if isinstance(headshot,dict) else ''
    # ESPN-provided photo URL only; never fabricate player IDs or URLs.
    return href if isinstance(href,str) and href.startswith(HEADSHOT_HOSTS) else ''
def apply_photos(rows,fixture):
    """Never assign an athlete's portrait from an unmatched bout or loose name."""
    updated=0
    for pair in competitions(fixture):
        lookup={normal(p['athlete'].get('fullName') or p['athlete'].get('displayName')):p['athlete'] for p in pair}
        if len(lookup)!=2:continue
        for row in rows:
            if row.get('sport')!='MMA':continue
            if set(normal(f['name']) for f in row['fighters'])!=set(lookup):continue
            for fighter in row['fighters']:
                athlete=lookup[normal(fighter['name'])]
                picture=photo_for(athlete)
                if picture and fighter.get('photo')!=picture:
                    fighter['photo']=picture
                    fighter['photoSource']='ESPN fighter portrait'
                    updated+=1
            break
    return updated
def enrich(data,fetch=get_json,now=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    changed=0
    dates=sorted({row['date'] for row in data.get('results',[]) if
                  row.get('sport')=='MMA' and -1<=(now.date()-dt.date.fromisoformat(row['date'])).days<=10})
    for date in dates:
        try:
            scoreboard=fetch(SCOREBOARD+'?dates='+date.replace('-',''))
        except Exception as exc:
            print('ESPN scoreboard unavailable:',type(exc).__name__,file=sys.stderr)
            continue
        for event in scoreboard.get('events',[])[:8]:
            event_id=str(event.get('id') or '')
            if not event_id.isdigit():continue
            try:
                details=fetch(FIGHTCENTER+event_id+'?region=us&lang=en&contentorigin=espn')
            except Exception as exc:
                print('ESPN fightcenter unavailable:',event_id,type(exc).__name__,file=sys.stderr)
                details={}
            for payload in (event,details):
                changed+=apply_photos(data['results'],payload)
    return changed
if __name__=='__main__':
    path=ROOT/'data/results.json'
    data=json.loads(path.read_text())
    updated=enrich(data)
    if updated:
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(f'Updated {updated} fighter portrait references from verified ESPN matchups')
