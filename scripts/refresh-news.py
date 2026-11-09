"""Fetch publisher RSS/Atom headlines; retain source dates and last successful checks."""
import datetime as dt, email.utils, hashlib, html, json, re, urllib.request, urllib.error, urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor
import time
SOURCES=[('World Boxing News','boxing','https://www.worldboxingnews.net/feed/'),('MMA Fighting','mma','https://www.mmafighting.com/rss/index.xml'),('MMA Junkie','mma','https://mmajunkie.usatoday.com/feed/'),('UFC','mma','https://www.ufc.com/rss/news')]
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
    allowed=('worldboxingnews.com','worldboxingnews.net','mmafighting.com','vox-cdn.com','ufc.com','ufc.tv','cloudfront.net','mmajunkie.usatoday.com','mmajunkie.com','gannett-cdn.com','usatoday.com')
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
            if host in ('www.worldboxingnews.com','www.worldboxingnews.net','www.mmafighting.com','www.ufc.com','mmajunkie.usatoday.com','www.mmajunkie.usatoday.com'):
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



def mma_junkie_google_feed(raw,now):
    """Source-verified syndication fallback, NOT a publisher RSS timestamp."""
    root=ET.fromstring(raw); trusted={'mmajunkie.usatoday.com','www.mmajunkie.usatoday.com','mmajunkie.com','www.mmajunkie.com'}
    channel=ET.Element('channel')
    for item in root.iter():
        if item.tag.split('}')[-1]!='item':continue
        src=next((c for c in item if c.tag.split('}')[-1]=='source'),None)
        host=urllib.parse.urlsplit(src.get('url','')).hostname if src is not None else ''
        if host not in trusted:continue
        title=next((c for c in item if c.tag.split('}')[-1]=='title'),None)
        if title is not None and title.text:title.text=re.sub(r'\s+-\s+MMA\s*Junkie\s*$','',title.text,flags=re.I)
        channel.append(item)
    out=parse_feed(ET.tostring(channel,encoding='utf8'),'MMA Junkie','mma',now)
    out=[a for a in out if urllib.parse.urlsplit(a['url']).hostname=='news.google.com']
    for a in out:
        a['sourceMethod']='Google News indexed MMA Junkie original'
        a['timeBasis']='Google News feed timestamp'
    return out


def mma_junkie_gdelt(raw,now):
    """Index MMA Junkie originals without masquerading first-seen dates as publication dates."""
    data=json.loads(raw)
    allow={'mmajunkie.usatoday.com','www.mmajunkie.usatoday.com','mmajunkie.com','www.mmajunkie.com'}
    found=[]
    for item in data.get('articles',[]):
        if not isinstance(item,dict):continue
        url=str(item.get('url',''))
        parsed=urllib.parse.urlsplit(url)
        if parsed.scheme!='https' or parsed.hostname not in allow or not parsed.path.startswith('/story/'):continue
        title=plain(str(item.get('title','')))
        try:when=dt.datetime.strptime(item['seendate'],'%Y%m%dT%H%M%SZ').replace(tzinfo=UTC)
        except (ValueError,TypeError,KeyError):continue
        if not title or not now-dt.timedelta(days=14)<=when<=now+dt.timedelta(minutes=30):continue
        url=urllib.parse.urlunsplit(parsed._replace(fragment=''))
        score=sum(weight for pattern,weight in [(r'\b(title|champion|championship)\b',3),(r'\b(result|knockout|wins|defeats|withdraw|cancel|announc|confirm)',4),(r'\b(fight|ufc|boxing|bout)\b',1)] if re.search(pattern,title,re.I))
        image=str(item.get('socialimage') or '')
        candidates=[{'url':image,'alt':'','credit':''}] if image.startswith('https://') else []
        found.append(dict(id=hashlib.sha256(url.encode()).hexdigest()[:20],title=title,url=url,source='MMA Junkie',sport='mma',publishedAt=when.isoformat(),score=score,
            sourceMethod='GDELT indexed MMA Junkie original',timeBasis='GDELT first-seen timestamp',_imageCandidates=candidates))
    return found


def mma_junkie_bing(raw,now):
    """Bing News RSS fallback: extract original MMA Junkie URLs from redirect links."""
    root=ET.fromstring(raw)
    approved={'mmajunkie.usatoday.com','www.mmajunkie.usatoday.com','mmajunkie.com','www.mmajunkie.com'}
    output=[]
    for item in root.iter():
        if item.tag.split('}')[-1]!='item':continue
        fields={child.tag.split('}')[-1]:''.join(child.itertext()) for child in item}
        link=fields.get('link','').strip()
        parsed=urllib.parse.urlsplit(link)
        if parsed.hostname in ('www.bing.com','bing.com'):
            link=urllib.parse.parse_qs(parsed.query).get('url',[''])[0]
            parsed=urllib.parse.urlsplit(link)
        if parsed.scheme!='https' or parsed.hostname not in approved or not parsed.path.startswith('/story/'):continue
        when=stamp(fields.get('pubDate'))
        if not when or not now-dt.timedelta(days=14)<=when<=now+dt.timedelta(minutes=30):continue
        title=plain(fields.get('title'))
        if not title:continue
        url=urllib.parse.urlunsplit(parsed._replace(fragment=''))
        score=sum(weight for pattern,weight in [(r'\b(title|champion|championship)\b',3),(r'\b(result|knockout|wins|defeats|withdraw|cancel|announc|confirm)',4),(r'\b(fight|ufc|boxing|bout)\b',1)] if re.search(pattern,title,re.I))
        output.append(dict(id=hashlib.sha256(url.encode()).hexdigest()[:20],title=title,url=url,source='MMA Junkie',sport='mma',publishedAt=when.isoformat(),score=score,
          sourceMethod='Bing News indexed MMA Junkie original',timeBasis='Bing News feed timestamp',_imageCandidates=[]))
    return output

def source_articles(source,sport,url,now):
    urls=[url]
    if source=='MMA Junkie':
        urls+=['https://mmajunkie.com/feed/','https://api.gdeltproject.org/api/v2/doc/doc?'+urllib.parse.urlencode({'query':'domain:mmajunkie.usatoday.com','mode':'artlist','maxrecords':'75','format':'json','timespan':'7d','sort':'datedesc'}),'https://www.bing.com/news/search?'+urllib.parse.urlencode({'q':'site:mmajunkie.usatoday.com','format':'rss','setmkt':'en-US'}),'https://news.google.com/rss/search?q=site%3Ammajunkie.usatoday.com%20when%3A7d&hl=en-AU&gl=AU&ceid=AU%3Aen']
    errors=[]
    for candidate in urls:
        try:
            req=urllib.request.Request(candidate,headers={'User-Agent':'Mozilla/5.0 (compatible; BlackEyeFightNews/1.0)'})
            try:
                with urllib.request.urlopen(req,timeout=20) as response: raw=response.read(3_000_000)
            except urllib.error.HTTPError as exc:
                if exc.code!=429 or urllib.parse.urlsplit(candidate).hostname!='api.gdeltproject.org':raise
                time.sleep(6)
                with urllib.request.urlopen(req,timeout=20) as response: raw=response.read(3_000_000)
            if urllib.parse.urlsplit(candidate).hostname=='api.gdeltproject.org':
                found=mma_junkie_gdelt(raw,now)
            elif urllib.parse.urlsplit(candidate).hostname=='www.bing.com':
                found=mma_junkie_bing(raw,now)
            elif urllib.parse.urlsplit(candidate).hostname=='news.google.com':
                found=mma_junkie_google_feed(raw,now)
            else:
                found=parse_feed(raw,source,sport,now)
                if source=='MMA Junkie':
                    approved={'mmajunkie.usatoday.com','www.mmajunkie.usatoday.com','mmajunkie.com','www.mmajunkie.com'}
                    found=[a for a in found if urllib.parse.urlsplit(a['url']).hostname in approved]
            if not found:raise ValueError('No recent, source-verified articles')
            return found,candidate
        except Exception as exc:
            errors.append(urllib.parse.urlsplit(candidate).hostname+': '+str(exc)[:85])
    raise ValueError(' | '.join(errors)[:450])

def is_routine_result(title):
    """Keep basic scorecards, round-by-round coverage and event results in Fight Results, not News."""
    name=plain(title)
    return any(re.search(pattern,name,re.I) for pattern in (
        r'\bscorecards?\b',
        r'\bround[\s-]*by[\s-]*round\b',
        r'\blive\s+blogs?\b',
        r'\bplay[\s-]*by[\s-]*play\b',
        r'\bresults\b\s*(?::|[-–—|]|\b(?:and|from|for|of)\b|$)',
    ))

def main():
    now=dt.datetime.now(UTC); path=Path('data/news-live.json')
    old=json.loads(path.read_text()) if path.exists() else {'articles':[]}
    articles={a['url']:a for a in old['articles'] if stamp(a['publishedAt']) and stamp(a['publishedAt'])>=now-dt.timedelta(days=14) and not is_routine_result(a['title'])}
    statuses=[]; success=0
    for source,sport,url in SOURCES:
        try:
            found,used_url=source_articles(source,sport,url,now)
            if not found:raise ValueError('No dated recent items; previous content retained')
            found=[a for a in found if not is_routine_result(a['title'])]
            with ThreadPoolExecutor(max_workers=6) as pool:
                found=list(pool.map(lambda a:enrich_image(a,articles.get(a['url']),now),found))
            for a in found:
                previous=articles.get(a['url']);a['firstSeenAt']=previous.get('firstSeenAt',now.isoformat()) if previous else now.isoformat()
                if previous and previous['title']!=a['title']:a['updatedAt']=now.isoformat()
                elif previous and previous.get('updatedAt'):a['updatedAt']=previous['updatedAt']
                articles[a['url']]=a
            success+=1;statuses.append({'name':source,'sport':sport,'ok':True,'items':len(found),'feedUrl':used_url,'lastSuccessfulAt':now.isoformat()})
        except Exception as exc:
            previous=next((s for s in old.get('sources',[]) if s['name']==source),{})
            statuses.append({'name':source,'sport':sport,'ok':False,'lastSuccessfulAt':previous.get('lastSuccessfulAt'),'error':str(exc)[:160]})
    payload={'attemptedAt':now.isoformat(),'lastSuccessfulAt':now.isoformat() if success else old.get('lastSuccessfulAt'),'sources':statuses,'articles':sorted(articles.values(),key=lambda a:a['publishedAt'],reverse=True)[:180]}
    path.write_text(json.dumps(payload,indent=2)+'\n')
    print(f'News: {success}/{len(SOURCES)} sources, {len(payload["articles"])} articles')
if __name__=='__main__':main()
