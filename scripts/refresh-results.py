#!/usr/bin/env python3
"""Merge official result headlines into enrolled cards; never erase confirmed results."""
import argparse, copy, datetime as dt, html, json, re, unicodedata, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def normal(s):
    s=s.replace('Chev Clarke','Cheavon Clarke')
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode().lower())
def headlines(page):
    return [html.unescape(re.sub('<[^>]+>', '', s)).strip() for s in re.findall(r'<h[23]\b[^>]*>(.*?)</h[23]>', page, re.S|re.I)]
def parse(text):
    text = re.sub(r'^(?:Co-)?Main Event:\s*', '', text, flags=re.I)
    m = re.fullmatch(r'(.+?) defeats?e?d? (.+?) (?:via|by) (.+)', text)
    if not m: return None
    a,b,detail=m.groups()
    rnd=re.search(r'Round\s+(\d+)',detail,re.I)
    clock=re.search(r'\b(\d{1,2}:\d{2})\b',detail)
    scores=re.search(r'\((\d+[-–]\d+(?:,\s*\d+[-–]\d+)*)\)',detail)
    method=re.split(r'\s+(?:at\s+\d|[–—]\s*Round|Round\s+\d)',detail)[0]
    if scores: method=method[:method.find('(')].strip()
    return dict(names=[a,b],winner=0,method=method.strip(),round=int(rnd[1]) if rnd else None,time=clock[1] if clock else None,scores=scores[1] if scores else None)
def parse_fightmag(page):
    out=[]
    for item in re.findall(r'<li[^>]*>(.*?)</li>',page,re.S):
        text=html.unescape(re.sub('<[^>]+>','',item)).strip().split(' | ')[0]
        if len(text)>400 or ' def. ' not in text: continue
        text=text.replace(' def. ',' defeats ')
        text=re.sub(r'\(R(\d+), (\d+[-–]\d+[^)]*)\)',r'(\2) – Round \1',text)
        text=re.sub(r'\(R(\d+)(?:, (\d+:\d+))?\)',lambda m:'– Round '+m[1]+(', '+m[2] if m[2] else ''),text)
        if ' by ' not in text:text+=' by Result confirmed; method awaiting publication'
        result=parse(text)
        if result:
            links=re.findall(r'href="(https://www\.fightmag\.com/[^"]+)"',item)
            if links and 'Watch video' in item:result['highlights']={'url':html.unescape(links[0]),'publisher':'FIGHTMAG'}
            out.append(result)
    return out

def apply_result(row, result, source):
    keys=[normal(f['name']) for f in row['fighters']]
    if set(keys)!=set(map(normal,result['names'])): return False
    row.update({k:v for k,v in result.items() if k not in ('names','winner') and v is not None})
    row.update(winner=keys.index(normal(result['names'][0])),status='completed',source=source)
    for i,f in enumerate(row['fighters']):
        if f.get('preRecord'):
            nums=list(map(int,f['preRecord'].split('-'))); nums[0 if i==row['winner'] else 1]+=1
            f['record']='–'.join(map(str,nums));f['recordSource']=f.get('preRecordSource',source)
            f['recordNote']='Calculated from the sourced pre-fight record and this confirmed result.'
    return True

def live_events(data, now):
    """Whether the card is inside its explicitly verified live reporting window."""
    return [event for event in data.get('events', []) if
            event.get('status') == 'underway' and event.get('liveUntil') and
            now < dt.datetime.fromisoformat(event['liveUntil'].replace('Z', '+00:00')) and
            now >= dt.datetime.fromisoformat(event['date'] + 'T00:00:00+00:00')]

def refresh(data, fetch, now, all_events=False, live_only=False, publish_heartbeat=True):
    data=copy.deepcopy(data)
    active_ids={e['id'] for e in live_events(data, now)}
    for event in data['events']:
        age=(now.date()-dt.date.fromisoformat(event['date'])).days
        if live_only and event['id'] not in active_ids: continue
        if not all_events and (age < -1 or age > 3): continue
        rows=[r for r in data['results'] if r['eventId']==event['id']]
        previous=json.dumps(rows,sort_keys=True,ensure_ascii=False)
        checked=0; failures=0
        for source in event.get('feeds',[]):
            try:
                page=fetch(source)
                parsed=parse_fightmag(page) if 'fightmag.com' in source else [p for h in headlines(page) if (p:=parse(h))]
                matched=sum(any(apply_result(row,p,source) for row in rows) for p in parsed)
                if not matched: raise ValueError('No recognized result headlines')
                checked+=1
            except Exception as exc:
                failures+=1; print('Retaining previous results:',event['id'],type(exc).__name__)
        if not event.get('feeds'): continue
        event['feedDelayed']=bool(failures)
        if checked and not failures:
            previous_check=event.get('checkedAt')
            elapsed=(now-dt.datetime.fromisoformat(previous_check.replace('Z','+00:00'))).total_seconds() if previous_check else 99999
            modified=previous!=json.dumps(rows,sort_keys=True,ensure_ascii=False)
            # All official sources are fetched on each pass, but avoid pushing a
            # new Git commit every 30 seconds just to change a heartbeat.
            stamp=now.isoformat().replace('+00:00','Z')
            heartbeat=publish_heartbeat and elapsed >= 240
            if modified or heartbeat: event['checkedAt']=stamp
            done=sum(r.get('status')=='completed' for r in rows)
            if done==event['expectedBouts']:
                event['status']='completed'
                main=next((r for r in rows if r['id']==event.get('mainBoutId')),None)
                if main and main.get('winner') in (0,1):
                    event['featuredId']=main['id']
                    event['takeaways'][0]={'text':main['fighters'][main['winner']]['name']+' defeated '+main['fighters'][1-main['winner']]['name']+' by '+main['method']+'.','source':main['source']}
            elif event.get('status')!='completed' and event.get('liveUntil') and now < dt.datetime.fromisoformat(event['liveUntil'].replace('Z','+00:00')):
                if modified or heartbeat:
                    event.update(status='underway',verifiedAt=stamp,validUntil=(now+dt.timedelta(minutes=15)).isoformat())
    data['reviewedAt']=now.date().isoformat()
    return data

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; FightNewsResults/1.0)'})
    with urllib.request.urlopen(req,timeout=25) as response: return response.read().decode('utf-8')
if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--all',action='store_true')
    ap.add_argument('--live-only',action='store_true',help='Poll only cards in an active live window')
    ap.add_argument('--no-heartbeat',action='store_true',help='Commit only material changes')
    ap.add_argument('--is-live',action='store_true',help='Exit 0 if an enrolled card is currently live')
    args=ap.parse_args()
    path=ROOT/'data/results.json'
    before=json.loads(path.read_text())
    now=dt.datetime.now(dt.timezone.utc)
    if args.is_live:
        raise SystemExit(0 if live_events(before,now) else 1)
    after=refresh(before,fetch,now,args.all,args.live_only,not args.no_heartbeat)
    if after!=before:path.write_text(json.dumps(after,ensure_ascii=False,indent=2)+'\n')
