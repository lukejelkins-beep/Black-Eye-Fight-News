#!/usr/bin/env python3
"""Fetch JSA profile HTML and stage likely portrait image candidates for review.

No image is published or committed by this script. Permission to reuse images
is assumed from the project owner; identity and image quality remain QA gates.
"""
import json, re, pathlib, time, urllib.request, urllib.parse, html
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT=pathlib.Path(__file__).resolve().parents[1]
REGISTER=json.loads((ROOT/'data/sumo/official-portrait-research.json').read_text())
OUT=ROOT/'qa/sumo-official-portrait-staging'
OUT.mkdir(parents=True,exist_ok=True)
class Images(HTMLParser):
    def __init__(self):
        super().__init__();self.items=[]
    def handle_starttag(self,tag,attrs):
        if tag not in ('img','source'):return
        d=dict(attrs)
        for key in ('src','data-src','data-original','srcset'):
            val=d.get(key)
            if val:
                self.items.append({'url':val.split(',')[0].split(' ')[0],'alt':d.get('alt',''),'class':d.get('class','')})
def fetch(row):
    url=row['officialProfileUrl']
    entry={'sourceId':row['sourceId'],'officialNskId':row['officialNskId'],'name':row['shikonaEn'],'profileUrl':url,'status':'unavailable','candidates':[]}
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'BEFN portrait research (+https://blackeyefightnews.com.au; permission provided by site operator)'})
        with urllib.request.urlopen(req,timeout=18) as r: body=r.read(2_000_000).decode('utf-8','replace')
        p=Images();p.feed(body)
        candidates=[]
        for item in p.items:
            raw=html.unescape(item['url'])
            u=urllib.parse.urljoin(url,raw)
            if not u.startswith('https://') and not u.startswith('http://'):continue
            if any(x in u.lower() for x in ('icon','logo','banner','btn_','sns','rank','star','award','loading')):continue
            candidates.append({'url':u,'alt':item['alt'],'class':item['class']})
        entry['candidates']=list({x['url']:x for x in candidates}.values())[:25]
        entry['status']='profile-inspected' if candidates else 'no-image-candidates'
    except Exception as ex:
        entry['error']=type(ex).__name__+': '+str(ex)[:180]
    return entry
rows=REGISTER['records']
results=[]
# Modest concurrency, avoid overwhelming the source website.
with ThreadPoolExecutor(max_workers=3) as pool:
    futures=[pool.submit(fetch,r) for r in rows]
    for f in as_completed(futures):
        results.append(f.result())
results.sort(key=lambda x:x['sourceId'])
(OUT/'image-candidates.json').write_text(json.dumps({'purpose':'Source discovery only; images not yet validated or published','results':results},indent=2)+'\n')
print(json.dumps({'profiles':len(results),'inspected':sum(x['status']=='profile-inspected' for x in results),'withCandidates':sum(bool(x['candidates']) for x in results),'errors':sum(bool(x.get('error')) for x in results)}))
