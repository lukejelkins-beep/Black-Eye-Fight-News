#!/usr/bin/env python3
"""Locate current ONE/PFL athlete portraits through identity-matched official profiles.

No image binaries are copied; only official https profile image references are stored.
Never infer an athlete from a loose same-surname search or an event banner. If a
specific profile/image cannot be verified, keep the site's initials fallback.
"""
from __future__ import annotations
import concurrent.futures
import datetime as dt
import html
import json
import re
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
AGENT='Mozilla/5.0 (compatible; BEFNVerifiedPortraits/1.0)'
BAD=r'logo|favicon|flag|placeholder|blank|default|poster|banner|social|promo|sponsor|avatar-default'
FIELDS=('src','data-src','data-lazy-src','data-original','data-srcset','srcset')
def fold(value):
    return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',str(value or '')).encode('ascii','ignore').decode().lower())
def slug(name):
    value=unicodedata.normalize('NFKD',name).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',value).strip('-')
def profile_candidates(name,org):
    s=slug(name)
    if org=='ONE':return ['https://www.onefc.com/athletes/'+s+'/']
    return [f'https://pflmma.com/{category}/{s}' for category in ('cs-fighter','wt-fighter','all-fighter','mena-fighter')]
def load(url):
    request=urllib.request.Request(url,headers={'User-Agent':AGENT,'Accept':'text/html,application/xhtml+xml'})
    with urllib.request.urlopen(request,timeout=7) as resp:
        if resp.status!=200:return None
        return BeautifulSoup(resp.read(600000).decode('utf-8','replace'),'html.parser')
def verified_profile(soup,name):
    text=' '.join(v.get('content','') for v in soup.select('meta[property="og:title"],meta[name="description"]'))
    text+=' '+' '.join(n.get_text(' ',strip=True) for n in soup.find_all(['h1','h2','h3'],limit=14))
    normalized=fold(text)
    target=fold(name)
    if not target or target not in normalized:return False
    # Reject broad fighter directories that mention the name among unrelated bios.
    if len(soup.find_all(['h1','h2']))>28:return False
    return True
def image_url(soup,name,url):
    target=fold(name)
    choices=[]
    for img in soup.find_all('img'):
        alt=fold(img.get('alt',''))
        if target not in alt and alt not in ('fighterimage','fighterheadshot','athleteportrait','athleteimage',''):continue
        attrs=[]
        for key in FIELDS:
            value=img.get(key)
            if value:
                if isinstance(value,list):value=' '.join(value)
                attrs.append(str(value).split(',')[0].split(' ')[0])
        for raw in attrs:
            addr=urllib.parse.urljoin(url,html.unescape(raw.strip()))
            parsed=urllib.parse.urlparse(addr)
            if parsed.scheme!='https' or not parsed.netloc or re.search(BAD,parsed.path,re.I):continue
            if re.search(r'\.(?:svg|gif)(?:\?|$)',parsed.path,re.I):continue
            if not (alt==target or target in alt or alt in ('fighterimage','fighterheadshot','athleteportrait','athleteimage')):continue
            score=5 if alt==target else 4 if target in alt else 2
            if '/athlete' in addr or '/fighter' in addr:score+=2
            choices.append((score,addr))
    if not choices:return None
    choices.sort(key=lambda v:v[0],reverse=True)
    return choices[0][1]
def resolve(job):
    org,name=job
    for url in profile_candidates(name,org):
        try:
            soup=load(url)
            if soup is None or not verified_profile(soup,name):continue
            pic=image_url(soup,name,url)
            if pic:return (org,name,pic,url)
        except Exception:
            continue
    return (org,name,None,None)
def enrich(data,max_names=400):
    events={e['id']:e for e in data.get('events',[])}
    jobs=[];seen=set()
    # Newer events first, so recent fighter cards are enriched on a rate-limited run.
    rows=sorted(data.get('results',[]),key=lambda r:r.get('date',''),reverse=True)
    for r in rows:
        event=events.get(r.get('eventId'),{})
        org='PFL' if str(event.get('name','')).upper().startswith('PFL') else 'ONE' if str(event.get('name','')).upper().startswith('ONE') else None
        if org is None:continue
        for fighter in r.get('fighters',[]):
            if fighter.get('photo'):continue
            name=fighter.get('name','')
            key=(org,fold(name))
            if name and key not in seen:seen.add(key);jobs.append((org,name))
            if len(jobs)>=max_names:break
        if len(jobs)>=max_names:break
    verified={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for org,name,pic,source in pool.map(resolve,jobs):
            if pic:verified[(org,fold(name))]=(pic,source)
    count=0
    for r in data.get('results',[]):
        event=events.get(r.get('eventId'),{})
        org='PFL' if str(event.get('name','')).upper().startswith('PFL') else 'ONE' if str(event.get('name','')).upper().startswith('ONE') else None
        if org is None:continue
        for f in r.get('fighters',[]):
            pair=verified.get((org,fold(f.get('name',''))))
            if pair and not f.get('photo'):
                f['photo'],f['photoSource']=pair
                f['photoNote']='Live external image from identity-matched official athlete profile; image availability varies by provider.'
                count+=1
    return len(jobs),len(verified),count
def main():
    path=ROOT/'data/results.json'
    data=json.loads(path.read_text())
    tested,matched,updated=enrich(data)
    if updated:path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print('Official ONE/PFL athlete profiles checked:',tested,
          'valid portraits found:',matched,'bout portrait references populated:',updated)
if __name__=='__main__':main()
