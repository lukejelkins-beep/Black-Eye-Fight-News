#!/usr/bin/env python3
"""Idempotent, source-linked archive backfill for UFC, PFL and ONE.

Never make up a bout outcome, record or fighter photograph. Results are imported
only when a named winner/method (or an explicit no contest) exists in the source.
Existing curated cards and confirmed results take precedence over scraped data.
"""
from __future__ import annotations
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parents[1]
START = dt.date(2026, 5, 11)
END = dt.date(2026, 11, 11)
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; BEFNEditorialArchive/1.1)', 'Accept': 'text/html'}
PFL_LINKS = (
 'pfl-2026-10-16','pfl-2026-10-10','pfl-2026-10-02','pfl-2026-08-22',
 'pfl-2026-08-07','pfl-2026-07-31','pfl-2026-07-25','pfl-2026-07-18',
 'pfl-2026-07-10','pfl-2026-06-27','pfl-2026-06-13',
 'pfl-mena-9-2026-05-24','pfl-2026-05-23'
)
MONTHS = dict(jan=1, feb=2, mar=3, apr=4, may=5, jun=6, jul=7, aug=8, sep=9, sept=9, oct=10, nov=11, dec=12)
RECORD = re.compile(r'(?<!\d)(\d{1,3}[-–]\d{1,3}(?:[-–]\d{1,3})?)(?!\d)')
WEIGHTS = re.compile(r"(?i)(?:women's\s+)?(?:atomweight|strawweight|flyweight|bantamweight|featherweight|lightweight|welterweight|middleweight|light heavyweight|heavyweight|catchweight|openweight)(?:\s+(?:muay thai|kickboxing|mma|submission grappling))?")
ENDING = re.compile(r'(?i)\b(?:KO|TKO|SUB|DEC|decision|submission|knockout|no contest|NC|DQ|disqualification)\b')
METHODS = re.compile(r'(?i)\b(no contest|knockout|KO/TKO|TKO|KO|submission|SUB|unanimous decision|split decision|majority decision|technical decision|decision|DEC|DQ|disqualification)\b[^\n]{0,15}?\bR(\d)\b(?:\s*[·•:,–-]\s*(\d{1,2}:\d{2}))?')
ALIASES = {'ko/tko':'KO/TKO','ko':'KO','tko':'TKO','sub':'Submission','dec':'Decision','dq':'Disqualification'}
def norm(value):
    import unicodedata
    value=unicodedata.normalize('NFKD',str(value or '')).encode('ascii','ignore').decode().casefold()
    return re.sub(r'[^a-z0-9]','',value)
def slug(value):
    return re.sub(r'[^a-z0-9]+','-',value.lower()).strip('-')[:38]
def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=18) as response:
        if response.status!=200: raise ValueError('HTTP '+str(response.status))
        return response.read().decode('utf-8',errors='replace')
def souped(body):
    return BeautifulSoup(body,'html.parser')
def date_in(text):
    m=re.search(r'(?i)\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b,?\s*2026\b',text)
    if m:
        try: return dt.date(2026,MONTHS[m.group(2).lower()],int(m.group(1)))
        except ValueError: return None
    m=re.search(r'(?i)\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s*2026\b',text)
    if m:
        try: return dt.date(2026,MONTHS[m.group(1).lower()[:4] if m.group(1).lower().startswith('sept') else m.group(1).lower()[:3]],int(m.group(2)))
        except (KeyError,ValueError): return None
    return None
def within(date):
    return bool(date and START<=date<=END)
def portrait_map():
    try:
        page=(ROOT/'index.html').read_text()
        match=re.search(r'<script type="application/json" id="fighter-portrait-registry">(.*?)</script>',page,re.S)
        fighters=json.loads(html.unescape(match.group(1)))['fighters'] if match else {}
        return {norm(name):item['photo'] for name,item in fighters.items() if isinstance(item,dict) and
                str(item.get('photo','')).startswith('https://')}
    except Exception as err:
        print('Portrait registry unavailable:',err,file=sys.stderr)
        return {}
def make_fighter(name,record,source,portraits):
    obj={'name':name}
    if record:
        obj.update(record=record.replace('-','–'),recordSource=source,recordContext='event-listing',
                   recordNote='Record published in historical event listing, not independently asserted as the exact post-fight tally.')
    image=portraits.get(norm(name))
    if image:
        obj.update(photo=image,photoSource='Linked fighter-portrait registry; external URL may be unavailable')
    return obj
def pairkey(fighters):
    return tuple(sorted(norm(f['name']) for f in fighters))
def result_row(event,name1,name2,record1,record2,winner,method,round_no,clock,division,section,order,source,portraits,sport='MMA'):
    fs=[make_fighter(name1,record1,source,portraits),make_fighter(name2,record2,source,portraits)]
    if not all(norm(f['name']) for f in fs) or norm(name1)==norm(name2): return None
    if winner not in (0,1,None): return None
    if not method and winner is None: return None
    key=hashlib.sha1(('|'.join(pairkey(fs))).encode()).hexdigest()[:12]
    is_complete=(winner in (0,1)) or ('no contest' in str(method).lower())
    return dict(id=event['id']+'-'+key,eventId=event['id'],event=event['name'],sport=sport,
       date=event['date'],location=event.get('location','Venue not confirmed'),
       division=division or 'Division not verified',fighters=fs,winner=winner,
       method=method or 'Outcome reported; method unavailable',round=round_no,time=clock,
       source=source,highlights=None,summary='',section=section,order=order,
       status='completed' if is_complete else 'awaiting',
       **({'scheduledRounds':5} if round_no==5 else {}))
def records_for(li,anchors):
    all_text=li.get_text(' ',strip=True)
    names=[clean_name(a.get_text(' ',strip=True)) for a in anchors]
    found=[]
    for i,name in enumerate(names):
        pos=all_text.find(name)
        if pos<0: found.append(None);continue
        limit=all_text.find(names[1-i],pos+len(name)) if i==0 else -1
        part=all_text[pos+len(name):(limit if limit>0 else pos+len(name)+75)]
        m=RECORD.search(part)
        found.append(m.group(1) if m else None)
    return found
def clean_name(raw):
    raw=raw.replace('★',' ')
    raw=re.sub(r'\bWIN\b',' ',raw,flags=re.I)
    raw=re.sub(r'#\s*\d{1,2}',' ',raw)
    m=RECORD.search(raw)
    if m: raw=raw[:m.start()]
    raw=re.sub(r'(?:\s*·\s*)?\b[A-Z]{3}\b\s*$','',raw)
    return re.sub(r'\s+',' ',raw).strip(' ·-–\n')
def method_from(text):
    m=METHODS.search(text)
    if not m:return (None,None,None)
    method=ALIASES.get(m.group(1).lower(),m.group(1))
    return method,int(m.group(2)),m.group(3)
def find_pfl_rows(body,event,portraits):
    soup=souped(body);output=[];i=0
    for heading in soup.find_all('h2'):
        name=heading.get_text(' ',strip=True).lower()
        if name not in ('main card','preliminary card','prelims'):continue
        listing=heading.find_next('ol')
        if not listing or listing.find_previous('h2') != heading:continue
        section='Main card' if name=='main card' else 'Prelims'
        for li in listing.find_all('li',recursive=False):
            anchors=[a for a in li.find_all('a',href=True) if '/fighters/' in a.get('href','')]
            anchors=list(dict.fromkeys(anchors))
            if len(anchors)<2:continue
            anchors=anchors[:2]
            names=[clean_name(a.get_text(' ',strip=True)) for a in anchors]
            if not all(names):continue
            text=li.get_text(' ',strip=True)
            records=records_for(li,anchors)
            decision=method_from(text)
            if not decision[0]:continue
            winner_flags=[bool(re.search(r'\bWIN\b',a.get_text(' ',strip=True),re.I)) for a in anchors]
            winner=winner_flags.index(True) if sum(winner_flags)==1 else None
            if winner is None and 'no contest' not in decision[0].lower():continue
            div=WEIGHTS.search(text)
            row=result_row(event,names[0],names[1],records[0],records[1],winner,*decision,
                           div.group(0) if div else None,section,i,event['source'],portraits)
            if row:output.append(row);i+=1
    return output
def parse_ufc_links(body):
    soup=souped(body);out=[];seen=set()
    for a in soup.find_all('a',href=True):
        href=urllib.parse.urljoin('https://www.ufcschedule.net',a['href'])
        if not re.match(r'https://www\.ufcschedule\.net/events/[^?#]+$',href) or href in seen:continue
        parent=a.find_parent(['article','li']) or a.parent
        text=(parent.get_text(' ',strip=True) if parent else '')[:600]
        date=date_in(text) or date_in(a.get_text(' ',strip=True))
        if within(date):
            seen.add(href);out.append((href,date))
    return out
def parse_ufc(body,url,date,portraits):
    soup=souped(body)
    h=soup.find('h1')
    if not h:return None,[]
    title=re.split(r'\s*(?:Results|: Results,|, Winners, Methods)\b',h.get_text(' ',strip=True))[0].strip(' :')
    if not title.lower().startswith('ufc'):return None,[]
    event={'id':'ufc-archive-'+date.isoformat()+'-'+slug(title)[:28],
           'name':title,'date':date.isoformat(),'status':'completed','expectedBouts':0,
           'source':url,'feeds':[],'takeaways':[],
           'sectionOrder':{'main':'headliner-first','prelims':'headliner-first'},'partialCoverage':True}
    rows=[]
    for h3 in soup.find_all('h3'):
        heading=h3.get_text(' ',strip=True)
        pair=re.split(r'\s+vs\.?\s+',heading,flags=re.I)
        if len(pair)!=2 or any(len(n)<3 or len(n)>95 for n in pair):continue
        details=[]
        for node in h3.next_elements:
            if node is h3:continue
            if isinstance(node,Tag) and node.name in ('h3','h4'):break
            if isinstance(node,str) and node.strip(): details.append(node.strip())
            if len(details)>85:break
        content=' '.join(details)
        m=re.search(r'Winner\s+(.+?)\s+Method\s+(.+?)\s+Round\s*/\s*time\s+R?(\d+)\s*[·•–-]\s*(\d{1,2}:\d{2})',content,re.I)
        if not m:continue
        win_name=norm(m.group(1))
        names=[s.strip() for s in pair]
        if win_name==norm(names[0]):winner=0
        elif win_name==norm(names[1]):winner=1
        else:continue
        method=m.group(2).strip()
        before=[]
        for node in h3.previous_elements:
            if isinstance(node,Tag) and node.name=='h3':break
            if isinstance(node,str) and node.strip():before.append(node.strip())
            if len(before)>18:break
        meta=' '.join(reversed(before))
        section='Prelims' if re.search(r'\bPrelims\b|\bEarly Prelims\b',meta,re.I) else 'Main card'
        div=WEIGHTS.search(meta)
        row=result_row(event,names[0],names[1],None,None,winner,method,int(m.group(3)),m.group(4),
                       div.group(0) if div else None,section,len(rows),url,portraits)
        if row:rows.append(row)
    count=re.search(r'(\d{1,2})\s+(?:completed|listed)\s+bouts',soup.get_text(' ',strip=True),re.I)
    event['expectedBouts']=max(len(rows),int(count.group(1)) if count else len(rows))
    if rows:event['mainBoutId']=next((r['id'] for r in rows if r['section']=='Main card'),rows[0]['id'])
    return event,rows
def parse_one_links(body):
    soup=souped(body);out=[];seen=set()
    for a in soup.find_all('a',href=True):
        href=urllib.parse.urljoin('https://fighterarena.com',a['href'])
        if not re.match(r'https://fighterarena\.com/events/[\w-]+$',href) or href in seen:continue
        parent=a.find_parent('li') or a.parent
        text=parent.get_text(' ',strip=True) if parent else ''
        date=date_in(text)
        if not date:
            match=re.search(r'(?i)\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b',text)
            if match:
                try:date=dt.date(2026,MONTHS[match.group(2).lower()],int(match.group(1)))
                except ValueError:pass
        if within(date) and date<dt.date(2026,11,1):seen.add(href);out.append((href,date))
    return out
def name_one(anchor):
    text=anchor.get_text(' ',strip=True)
    winner='★' in text
    normalized=re.sub(r'\s+([A-Z]{3})\s+\1\s*$', '', text)
    match=RECORD.search(normalized)
    return clean_name(normalized),winner,(match.group(1) if match else None)
def parse_one(body,url,date,portraits):
    soup=souped(body);h=soup.find('h1')
    if not h:return None,[]
    name=re.sub(r'\s+',' ',h.get_text(' ',strip=True)).strip()
    if not name.upper().startswith('ONE'):name='ONE '+name
    event={'id':'one-archive-'+date.isoformat()+'-'+slug(name)[:26],
           'name':name,'date':date.isoformat(),'status':'completed','source':url,'feeds':[],
           'location':'Thailand (venue not confirmed)','takeaways':[],
           'sectionOrder':{'main':'headliner-first'},'partialCoverage':True}
    rows=[];seen=set()
    for txt in soup.find_all(string=lambda s:isinstance(s,str) and s.strip().upper()=='VS'):
        left=txt.find_previous('a',href=lambda v:bool(v and '/fighters/' in v))
        right=txt.find_next('a',href=lambda v:bool(v and '/fighters/' in v))
        if not left or not right or left is right:continue
        a,wa,ra=name_one(left);b,wb,rb=name_one(right)
        key=tuple(sorted((norm(a),norm(b))))
        if len(a)<3 or len(b)<3 or key in seen:continue
        seen.add(key)
        winner=0 if wa and not wb else 1 if wb and not wa else None
        tail=[]
        for node in right.next_elements:
            if isinstance(node,str) and node.strip():tail.append(node.strip())
            if len(' '.join(tail))>190 or len(tail)>15:break
        after=' '.join(tail)
        method,round_no,clock=method_from(after[:145])
        if winner is None:continue
        if not method:method='Method not published by event source'
        prior=[]
        for node in left.previous_elements:
            if isinstance(node,str) and node.strip():prior.append(node.strip())
            if len(' '.join(prior))>200:break
        div=WEIGHTS.search(' '.join(reversed(prior))[-145:])
        sport='Muay Thai' if div and 'muay thai' in div.group(0).lower() else 'Kickboxing' if div and 'kickboxing' in div.group(0).lower() else 'Combat sport'
        row=result_row(event,a,b,ra,rb,winner,method,round_no,clock,
                    div.group(0) if div else 'Division not verified','Main card',len(rows),url,portraits,sport)
        if row:rows.append(row)
    count=re.search(r'\b(\d{1,2})\s+fights\b',soup.get_text(' ',strip=True),re.I)
    event['expectedBouts']=max(len(rows),int(count.group(1)) if count else len(rows))
    if rows:event.update(mainBoutId=rows[0]['id'],featuredId=rows[0]['id'])
    return event,rows
def merge(existing,event,rows,changes):
    if not rows:return
    aliases=[e for e in existing['events'] if e.get('source')==event.get('source')]
    if event['id'].startswith('pfl-') or event['name'].lower().startswith('pfl'):
        aliases += [e for e in existing['events'] if e['date']==event['date'] and 'pfl' in e['name'].lower()]
    if event['name'].lower().startswith('ufc'):
        aliases += [e for e in existing['events'] if e['date']==event['date'] and e['name'].lower().startswith('ufc')]
    previous=aliases[0] if aliases else next((e for e in existing['events'] if e['id']==event['id']),None)
    if previous:
        event_id=previous['id']
    else:
        previous=event
        existing['events'].append(previous)
        changes['events']+=1
        event_id=event['id']
    found={pairkey(r['fighters']):r for r in existing['results'] if r.get('eventId')==event_id}
    for r in rows:
        r['eventId']=event_id;r['event']=previous['name'];r['id']=event_id+'-'+r['id'].rsplit('-',1)[-1]
        if r['id'] not in (x['id'] for x in existing['results']):
            r['id']=event_id+'-'+hashlib.sha1('|'.join(pairkey(r['fighters'])).encode()).hexdigest()[:12]
        original=found.get(pairkey(r['fighters']))
        if original:
            if original.get('status')=='completed' and original.get('winner')!=r.get('winner'):
                print('Conflict retained: ',previous['name'],[f['name'] for f in r['fighters']],file=sys.stderr)
                continue
            for field in ('division','round','time','method','source'):
                if not original.get(field) or original[field] in ('Division not verified','Outcome reported; method unavailable'):
                    if r.get(field):original[field]=r[field]
            for old,new in zip(original.get('fighters',[]),r['fighters']):
                if norm(old.get('name'))!=norm(new.get('name')):continue
                for field in ('record','recordSource','recordContext','recordNote','photo','photoSource'):
                    if not old.get(field) and new.get(field):old[field]=new[field]
            continue
        existing['results'].append(r)
        changes['bouts']+=1
        found[pairkey(r['fighters'])]=r
    previous['expectedBouts']=max(previous.get('expectedBouts') or 0,event.get('expectedBouts') or 0)
    count=sum(r.get('status')=='completed' for r in existing['results'] if r.get('eventId')==event_id)
    previous['partialCoverage']=count<previous['expectedBouts']
    if not previous.get('mainBoutId') and rows:previous['mainBoutId']=rows[0]['id'].replace(event['id'],event_id,1)
    if not previous.get('featuredId') and rows:previous['featuredId']=previous['mainBoutId']
    if not previous.get('source'):previous['source']=event['source']
def ingest_job(task,portraits):
    organization,url,date=task
    try:
        body=fetch(url)
        if organization=='PFL':
            soup=souped(body);h=soup.find('h1');name=h.get_text(' ',strip=True).replace(' · Results','') if h else 'PFL '+date.isoformat()
            event={'id':'pfl-archive-'+date.isoformat(),'name':name,'date':date.isoformat(),
                   'status':'completed','source':url,'feeds':[],'takeaways':[],'expectedBouts':0,
                   'sectionOrder':{'main':'headliner-first','prelims':'headliner-first'},'partialCoverage':True}
            rows=find_pfl_rows(body,event,portraits)
            count=re.search(r'\b(\d{1,2}) fights took place\b',soup.get_text(' ',strip=True),re.I)
            event['expectedBouts']=int(count.group(1)) if count else len(rows)
            if rows:event['mainBoutId']=rows[0]['id'];event['featuredId']=rows[0]['id']
        elif organization=='UFC':event,rows=parse_ufc(body,url,date,portraits)
        else:event,rows=parse_one(body,url,date,portraits)
        if not event or not rows:return (organization,url,None,[],0)
        return (organization,url,event,rows,len(rows))
    except Exception as err:
        print('Source unavailable (existing data retained):',organization,url,type(err).__name__,str(err)[:100],file=sys.stderr)
        return (organization,url,None,[],0)
LAST_AUDIT = {}
def run(data,portraits,fetcher=fetch):
    global fetch
    fetch=fetcher
    tasks=[]
    for key in PFL_LINKS:
        iso=re.search(r'2026-\d{2}-\d{2}',key).group()
        tasks.append(('PFL','https://www.ufcalendar.com/events/'+key,dt.date.fromisoformat(iso)))
    for kind,source,extract in (
        ('UFC','https://www.ufcschedule.net/ufc-results',parse_ufc_links),
        ('ONE','https://fighterarena.com/organizations/one-championship/events/2026',parse_one_links)):
        try:tasks += [(kind,url,date) for url,date in extract(fetch(source))]
        except Exception as err:print('Archive list unavailable:',kind,type(err).__name__,file=sys.stderr)
    print('Historical event pages to inspect:',len(tasks),dict((k,sum(t[0]==k for t in tasks)) for k in ('UFC','ONE','PFL')))
    changes={'events':0,'bouts':0}
    global LAST_AUDIT
    LAST_AUDIT={'tasks':{k:sum(t[0]==k for t in tasks) for k in ('UFC','ONE','PFL')},'imported':[],'unmatched':[]}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures=[pool.submit(ingest_job,t,portraits) for t in tasks]
        for task,fut in zip(tasks,futures):
            org,url,event,rows,total=fut.result()
            if event and rows:
                merge(data,event,rows,changes)
                LAST_AUDIT['imported'].append({'org':org,'date':event['date'],'name':event['name'],'url':url,'bouts':total})
                print('Verified',org,total,'bouts',event['date'],event['name'][:65])
            else:
                LAST_AUDIT['unmatched'].append({'org':org,'url':url})
    return changes
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    path=ROOT/'data/results.json'
    before=path.read_text()
    data=json.loads(before)
    changes=run(data,portrait_map())
    data['coverage']='Six-month historical UFC, PFL and ONE results (11 May–11 Nov 2026). Verified outcomes are linked to an event source; incomplete cards, missing records and missing portraits are explicitly identified. Records from archive listings are labelled, not assumed to be post-fight.'
    data['reviewedAt']=dt.datetime.now(dt.timezone.utc).date().isoformat()
    LAST_AUDIT['changes']=changes
    LAST_AUDIT['totalEvents']=len(data['events'])
    LAST_AUDIT['totalBouts']=len(data['results'])
    LAST_AUDIT['countsByPromotion']={k:sum(k.lower() in e['name'].lower() for e in data['events']) for k in ('ufc','one','pfl')}
    (ROOT/'data'/'backfill-mma-audit.json').write_text(json.dumps(LAST_AUDIT,ensure_ascii=False,indent=2)+'\n')
    print('Backfill',changes,'total events',len(data['events']),'total rows',len(data['results']))
    if not args.dry_run and json.dumps(json.loads(before),sort_keys=True)!=json.dumps(data,sort_keys=True):
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
