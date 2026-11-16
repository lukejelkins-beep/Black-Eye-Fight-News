#!/usr/bin/env python3
"""Stage official profile image candidates locally for human identity review.

No changes to public website or approved photo manifest. The operator has
stated they have reuse permission; this script does not assert a licence.
"""
import json, pathlib, urllib.request, urllib.parse, hashlib, mimetypes, time
from html.parser import HTMLParser

ROOT=pathlib.Path(__file__).resolve().parents[1]
manifest=ROOT/'qa/sumo-official-portrait-staging/image-candidates.json'
rows=json.loads(manifest.read_text())['results']
out=ROOT/'qa/sumo-official-portrait-staging/candidate-images'
out.mkdir(parents=True,exist_ok=True)
index=[]
for row in rows:
    choices=row['candidates']
    candidates=[]
    for c in choices:
        url=c['url']
        low=url.lower()
        if not any(x in low for x in ('rikishi','profile','face','photo','portrait','/img/','/images/')):continue
        if any(x in low for x in ('banner','logo','icon','btn','title','sns','award','star','rank','common','/parts/')):continue
        candidates.append(c)
    # Preserve ambiguity rather than auto-assigning the wrong wrestler photo.
    entry={'sourceId':row['sourceId'],'name':row['name'],'profileUrl':row['profileUrl'],'candidateCount':len(choices),'downloads':[],'identityVerified':False,'approvedForPublication':False}
    for n,c in enumerate(candidates[:3]):
        url=c['url']
        try:
            host=urllib.parse.urlparse(url).hostname or ''
            if not (host=='sumo.or.jp' or host.endswith('.sumo.or.jp')):continue
            req=urllib.request.Request(url,headers={'User-Agent':'BEFN Sumo portrait review (+https://blackeyefightnews.com.au)'})
            with urllib.request.urlopen(req,timeout=15) as res:
                kind=res.headers.get('Content-Type','').split(';')[0].lower()
                if kind not in ('image/jpeg','image/png','image/webp'):continue
                data=res.read(2_000_001)
            if len(data)<2000 or len(data)>2_000_000:continue
            ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[kind]
            dest=out/f"{row['sourceId']}-{n}.{ext}"
            dest.write_bytes(data)
            entry['downloads'].append({'file':dest.name,'sourceUrl':url,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'alt':c.get('alt','')})
        except Exception as exc:
            entry.setdefault('errors',[]).append(str(exc)[:120])
    index.append(entry)
    if len(index)%20==0:time.sleep(1)
(out.parent/'download-review.json').write_text(json.dumps({'notice':'Unverified candidates; do not publish until identity and source match checked','records':index},indent=2)+'\n')
print(json.dumps({'profiles':len(index),'downloadedFiles':sum(len(x['downloads']) for x in index),'profilesWithImages':sum(bool(x['downloads']) for x in index),'approvedForPublication':0}))
