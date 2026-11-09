#!/usr/bin/env python3
"""Populate missing MMA records only from athlete-matched ESPN fightcenter data."""
import datetime as dt
import json
import re
import sys
from pathlib import Path
from importlib.machinery import SourceFileLoader

ROOT = Path(__file__).resolve().parents[1]
photos = SourceFileLoader('espn_portraits', str(ROOT/'scripts/enrich-espn-headshots.py')).load_module()
SCOREBOARD = photos.SCOREBOARD
FIGHTCENTER = photos.FIGHTCENTER
PATTERN = re.compile(r'^\\s*(\\d+)\\s*[-–]\\s*(\\d+)\\s*[-–]\\s*(\\d+)\\s*$')

def record_of(competitor):
    """Only accept an explicitly labelled complete professional W-L-D record."""
    athlete = competitor.get('athlete') or {}
    candidates = [competitor.get('record'), athlete.get('record')]
    candidates += competitor.get('records', []) if isinstance(competitor.get('records'), list) else []
    candidates += athlete.get('records', []) if isinstance(athlete.get('records'), list) else []
    for item in candidates:
        if isinstance(item, str):
            match = PATTERN.fullmatch(item)
        elif isinstance(item, dict):
            label = str(item.get('type') or item.get('name') or item.get('description') or '').lower()
            if label and not any(word in label for word in ('overall','professional','total','mma')):
                continue
            raw = item.get('summary') or item.get('displayValue') or item.get('display') or ''
            match = PATTERN.fullmatch(str(raw))
        else:
            continue
        if match:
            return '-'.join(match.groups())
    return None

def apply_records(rows, fixture, checked_at):
    updated = 0
    for pair in photos.competitions(fixture):
        lookup = {photos.normal(p['athlete'].get('fullName') or p['athlete'].get('displayName')): p for p in pair}
        if len(lookup) != 2: continue
        for row in rows:
            if row.get('sport') != 'MMA' or len(row.get('fighters', [])) != 2: continue
            if {photos.normal(f['name']) for f in row['fighters']} != set(lookup): continue
            for fighter in row['fighters']:
                if fighter.get('record'): continue  # preserve already sourced records
                record = record_of(lookup[photos.normal(fighter['name'])])
                if not record: continue
                fighter['record'] = record.replace('-', '–')
                athlete_id = str(lookup[photos.normal(fighter['name'])]['athlete'].get('id') or '')
                fighter['recordSource'] = ('https://www.espn.com/mma/fighter/_/id/' + athlete_id) if athlete_id.isdigit() else 'https://www.espn.com/mma/'
                fighter['recordVerifiedAt'] = checked_at
                fighter['recordNote'] = 'Professional record published by ESPN; includes results available at verification time.'
                updated += 1
            break
    return updated

def enrich(data, fetch=photos.get_json, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    rows = [r for r in data.get('results', []) if r.get('sport') == 'MMA' and
            any(not f.get('record') for f in r.get('fighters', []))]
    # Include historical enrolled events; limit external requests to known event dates.
    dates = sorted({r['date'] for r in rows if r.get('date')})
    changed = 0
    for date in dates:
        try:
            scoreboard = fetch(SCOREBOARD + '?dates=' + date.replace('-', ''))
        except Exception as exc:
            print('Record source unavailable:', date, type(exc).__name__, file=sys.stderr)
            continue
        for event in scoreboard.get('events', [])[:15]:
            event_id = str(event.get('id') or '')
            if not event_id.isdigit(): continue
            try:
                details = fetch(FIGHTCENTER + event_id + '?region=us&lang=en&contentorigin=espn')
            except Exception as exc:
                print('Fightcenter unavailable:', event_id, type(exc).__name__, file=sys.stderr)
                details = {}
            for payload in (event, details):
                changed += apply_records(rows, payload, now.date().isoformat())
    return changed

if __name__ == '__main__':
    path = ROOT/'data/results.json'
    data = json.loads(path.read_text())
    count = enrich(data)
    if count:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print('Verified and populated', count, 'previously missing MMA records')
