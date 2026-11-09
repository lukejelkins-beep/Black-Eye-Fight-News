"""Fetch publisher RSS/Atom headlines; retain source dates and last successful checks."""
import datetime as dt, email.utils, hashlib, html, json, re, urllib.request, urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor
SOURCES=[('World Boxing News','boxing','https://www.worldboxingnews.net/feed/'),('MMA Fighting','mma','https://www.mmafighting.com/rss/index.xml'),('UFC','mma','https://www.ufc.com/rss/news')]
UTC=dt.timezone.utc

def stamp(value):
    try:return dt.datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(UTC)
    except (ValueError,AttributeError):
        try:return email.utils.parsedate_to_datetime(value).astimezone(UTC)
        except (ValueError,TypeError):return None

def plain(value):return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',value or ''))).strip()


class ArticleImages(HTMLParser):
    def __init__(self):
        super().__init__(); self.images=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='img':
            url=a.get('src') or a.get('data-src') or ''
            if str(a.get('width','')).isdigit() and int(a['width'])<100:return
            self.add(url,a.get('alt',''),a.get('data-portal-copyright',''))
        if tag=='meta' and (a.get('property') or a.get('name','')).lower() in ('og:image','og:image:secure_url','twitter:image'):
            self.add(a.get('content',''))
    def add(self,url,alt='',credit=''):
        url=html.unescape(html.unescape(url)).strip()
        if url.startswith('https://') and not any(x in url.lower() for x in ('gravatar','tracking','pixel.gif')):
            self.images.append({'url':url,'alt':plain(alt),'credit':plain(credit)})

def image_candidates(item):
    parser=ArticleImages()
    for node in item.iter():
        key=node.tag.split('}')[-1]
        if key in ('thumbnail','content','enclosure') and node.get('url'):
            if key=='thumbnail' or node.get('medium')=='image' or node.get('type','').startswith('image/'):
                parser.add(node.get('url'))
        if key in ('description','summary','content','encoded'):
            parser.feed(''.join(node.itertext()))
    unique={}
    for candidate in parser.images:unique.setdefault(candidate['url'],candidate)
    return list(unique.values())[:4]

def valid_image(url):
    # Only publisher image hosts are fetched by the collector. No arbitrary URL fetches.
    host=urllib.parse.urlsplit(url).hostname or ''
    allowed=('worldboxingnews.com','worldboxingnews.net','mmafighting.com','vox-cdn.com','ufc.com','ufc.tv','cloudfront.net')
    if not any(host==d or host.endswith('.'+d) for d in allowed):return False
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Range':'bytes=0-1023'})
        with urllib.request.urlopen(req,timeout=10) as r:
            b=r.read(1024);mime=r.headers.get('Content-Type','').lower()
        return mime.startswith('image/') and (b.startswith(b'\xff\xd8\xff') or b.startswith(b'\x89PNG') or b.startswith(b'GIF8') or (b[:4]==b'RIFF' and b[8:12]==b'WEBP') or b[4:8]==b'ftyp')
    except Exception:return False

def enrich_image(a,previous,now):
    candidates=a.pop('_imageCandidates',[])
    old=(previous or {}).get('image') or {}
    checked=stamp(old.get('checkedAt'))
    if old.get('url') and checked and now-checked<dt.timedelta(days=1) and (not candidates or old['url']==candidates[0]['url']):
        a['image']=old;return a
    if not candidates:
        try:
            host=urllib.parse.urlsplit(a['url']).hostname or ''
            if host in ('www.worldboxingnews.com','www.worldboxingnews.net','www.mmafighting.com','www.ufc.com'):
                req=urllib.request.Request(a['url'],headers={'User-Agent':'Mozilla/5.0'})
                with urllib.request.urlopen(req,timeout=10) as r:page=r.read(1_000_000).decode('utf-8','replace')
                parser=ArticleImages();parser.feed(page);candidates=parser.images[:4]
        except Exception:pass
    for candidate in candidates:
        if valid_image(candidate['url']):
            a['image']={**candidate,'alt':candidate['alt'] or 'Article image: '+a['title'],'sourceUrl':a['url'],'kind':'publisher','checkedAt':now.isoformat()};return a
    a['image']=None
    return a

def parse_feed(raw,source,sport,now):
    root=ET.fromstring(raw); out=[]
    for item in root.iter():
        if item.tag.split('}')[-1] not in ('item','entry'):continue
        fields={}; url=''
        for child in item:
            key=child.tag.split('}')[-1]
            fields[key]=''.join(child.itertext())
            if key=='link' and child.get('rel','alternate')=='alternate':url=child.get('href') or child.text or ''
        when=stamp(fields.get('pubDate') or fields.get('published') or fields.get('updated'))
        title=plain(fields.get('title')); url=url.strip()
        if not when or not title or not url.startswith('https://') or not now-dt.timedelta(days=14)<=when<=now+dt.timedelta(minutes=30):continue
        url=urllib.parse.urlunsplit(urllib.parse.urlsplit(url)._replace(fragment=''))
        score=sum(weight for pattern,weight in [(r'\b(title|champion|championship)\b',3),(r'\b(result|knockout|wins|defeats|withdraw|cancel|announc|confirm)',4),(r'\b(fight|ufc|boxing|bout)\b',1)] if re.search(pattern,title,re.I))
        out.append(dict(id=hashlib.sha256(url.encode()).hexdigest()[:20],title=title,url=url,source=source,sport=sport,publishedAt=when.isoformat(),score=score,_imageCandidates=image_candidates(item)))
    return out


def is_routine_result(title):
    """Keep basic scorecards, round-by-round coverage and event results in Fight Results, not News."""
    name=plain(title)
    return any(re.search(pattern,name,re.I) for pattern in (
        r'\bscorecards?\b',
        r'\bround[\s-]*by[\s-]*round\b',
        r'\blive\s+blogs?\b',
        r'\bplay[\s-]*by[\s-]*play\b',
        r'\bresults\b\s*(?::|[-–—]|\b(?:and|from|for|of)\b|$)',
    ))

def main():
    now=dt.datetime.now(UTC); path=Path('data/news-live.json')
    old=json.loads(path.read_text()) if path.exists() else {'articles':[]}
    articles={a['url']:a for a in old['articles'] if stamp(a['publishedAt']) and stamp(a['publishedAt'])>=now-dt.timedelta(days=14) and not is_routine_result(a['title'])}
    statuses=[]; success=0
    for source,sport,url in SOURCES:
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; BlackEyeFightNews/1.0)'})
            with urllib.request.urlopen(req,timeout=20) as response: raw=response.read(3_000_000)
            found=parse_feed(raw,source,sport,now)
            if not found:raise ValueError('No dated recent items; previous content retained')
            found=[a for a in found if not is_routine_result(a['title'])]
            with ThreadPoolExecutor(max_workers=6) as pool:
                found=list(pool.map(lambda a:enrich_image(a,articles.get(a['url']),now),found))
            for a in found:
                previous=articles.get(a['url']);a['firstSeenAt']=previous.get('firstSeenAt',now.isoformat()) if previous else now.isoformat()
                if previous and previous['title']!=a['title']:a['updatedAt']=now.isoformat()
                elif previous and previous.get('updatedAt'):a['updatedAt']=previous['updatedAt']
                articles[a['url']]=a
            success+=1;statuses.append({'name':source,'sport':sport,'ok':True,'items':len(found),'lastSuccessfulAt':now.isoformat()})
        except Exception as exc:
            previous=next((s for s in old.get('sources',[]) if s['name']==source),{})
            statuses.append({'name':source,'sport':sport,'ok':False,'lastSuccessfulAt':previous.get('lastSuccessfulAt'),'error':str(exc)[:160]})
    payload={'attemptedAt':now.isoformat(),'lastSuccessfulAt':now.isoformat() if success else old.get('lastSuccessfulAt'),'sources':statuses,'articles':sorted(articles.values(),key=lambda a:a['publishedAt'],reverse=True)[:180]}
    path.write_text(json.dumps(payload,indent=2)+'\n')
    print(f'News: {success}/{len(SOURCES)} sources, {len(payload["articles"])} articles')
if __name__=='__main__':main()
