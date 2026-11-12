"""Fetch publisher RSS/Atom headlines; retain source dates and last successful checks."""
import datetime as dt, email.utils, hashlib, html, json, re, urllib.request, urllib.error, urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path
from news_dedupe import deduplicate
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor
import time
SOURCES=[
 ('World Boxing News','boxing','https://www.worldboxingnews.net/feed/'),
 ('MMA Fighting','mma','https://www.mmafighting.com/rss/index.xml'),
 ('MMA Junkie','mma','https://mmajunkie.usatoday.com/feed/'),
 ('Sherdog','mma','https://www.sherdog.com/rss/news.xml'),
 ('UFC','mma','https://www.ufc.com/rss/news'),
 ('ONE MMA','mma','https://www.onefc.com/category/mixed-martial-arts/feed/'),
 ('ONE Submission Grappling','grappling','https://www.onefc.com/feed/'),
 ('Cage Warriors','mma','https://cagewarriors.com/feed/'),
 ('RIZIN','mma','https://www.bing.com/news/search?q=site%3Ajp.rizinff.com&format=rss&setmkt=en-US'),
 ('KSW','mma','https://www.bing.com/news/search?q=site%3Akswmma.com%2Fen&format=rss&setmkt=en-US'),
 ('ADCC','grappling','https://adcombat.com/feed/'),
 ('NCAA Division I Wrestling','grappling','https://www.ncaa.com/news/wrestling/d1/rss.xml'),
 ('NCAA Division II Wrestling','grappling','https://www.ncaa.com/news/wrestling/d2/rss.xml'),
 ('UFC BJJ','grappling','https://www.bing.com/news/search?q=site%3Awww.ufc.com%2Fnews%2Fufc-bjj&format=rss'),
 ('IBJJF','grappling','https://www.bing.com/news/search?q=site%3Aibjjf.com%2Fnews&format=rss'),
 ('FloGrappling','grappling','https://www.bing.com/news/search?q=site%3Aflograppling.com%2Farticles&format=rss'),
 ('Real American Freestyle','grappling','https://www.bing.com/news/search?q=site%3Arealamericanfreestyle.com%2Fblog&format=rss'),
 ('United World Wrestling','grappling','https://www.bing.com/news/search?q=site%3Auww.org%2Farticle&format=rss'),
 ('ONE Live Results','mma','https://www.onefc.com/category/live-results/feed/'),
]
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
    allowed=('worldboxingnews.com','worldboxingnews.net','mmafighting.com','vox-cdn.com','ufc.com','ufc.tv','cloudfront.net','mmajunkie.usatoday.com','mmajunkie.com','sherdog.com','gannett-cdn.com','usatoday.com','onefc.com','cagewarriors.com','adcombat.com','ncaa.com','floassets.com','flosports.tv','flograppling.com','kswmma.com','rizinff.com','ibjjf.com','realamericanfreestyle.com','uww.org')
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
            if host in ('www.worldboxingnews.com','www.worldboxingnews.net','www.mmafighting.com','www.ufc.com','mmajunkie.usatoday.com','www.mmajunkie.usatoday.com','www.onefc.com','www.sherdog.com','cagewarriors.com','www.cagewarriors.com','adcombat.com','www.adcombat.com','www.kswmma.com','jp.rizinff.com','www.realamericanfreestyle.com','uww.org','www.flograppling.com','ibjjf.com'):
                req=urllib.request.Request(a['url'],headers={'User-Agent':'Mozilla/5.0'})
                with urllib.request.urlopen(req,timeout=10) as r:page=r.read(1_000_000).decode('utf-8','replace')
                parser=ArticleImages();parser.feed(page);candidates=parser.images[:4]
        except Exception:pass
    for candidate in candidates:
        if valid_image(candidate['url']):
            a['image']={**candidate,'alt':candidate['alt'] or 'Article image: '+a['title'],'sourceUrl':a['url'],'kind':'publisher','checkedAt':now.isoformat()};return a
    a['image']=None
    return a


class ArticleText(HTMLParser):
    """Capture publisher metadata and article paragraphs; never invent key facts."""
    def __init__(self):
        super().__init__()
        self.meta=[]; self.paragraphs=[]; self.article_depth=0
        self.in_p=False; self.current=[]; self.suppressed=0

    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('script','style','nav','footer','aside'):self.suppressed+=1
        if tag=='article':self.article_depth+=1
        if tag=='meta':
            name=(a.get('name') or a.get('property') or '').lower()
            if name in ('description','og:description','twitter:description'):
                if a.get('content'):self.meta.append(a['content'])
        # Publisher templates vary: some story text is inside <article>, others inside <main> or content divs.
        # Capture paragraphs outside explicitly suppressed chrome, then apply strict boilerplate filtering below.
        if tag=='p' and not self.suppressed:
            self.in_p=True;self.current=[]

    def handle_data(self,text):
        if self.in_p and not self.suppressed:self.current.append(text)

    def handle_endtag(self,tag):
        if tag=='p' and self.in_p:
            paragraph=plain(' '.join(self.current))
            if paragraph:self.paragraphs.append(paragraph)
            self.in_p=False;self.current=[]
        if tag=='article':self.article_depth=max(0,self.article_depth-1)
        if tag in ('script','style','nav','footer','aside'):
            self.suppressed=max(0,self.suppressed-1)

# Quality checks are intentionally rule-based: no text is invented or paraphrased
# without a source. The UI can show fewer than three points when reporting is thin.
SUMMARY_QUALITY_VERSION=3
SUMMARY_STOP_WORDS=set('the a an and or but that this these those there their them they he she his her who whom whose it its is are was were be been being to for from in on at by of with as into about after before while also than then through over under more most very has have had says said saying according today yesterday year years two three one all not just do did does will would could should which what when where how up out off best big great new latest report reports'.split())
SUMMARY_ALIASES={
    'bouts':'fight','bout':'fight','fights':'fight','matchup':'fight','matchups':'fight','matches':'fight','clash':'fight','clashes':'fight','battle':'fight',
    'prospects':'prospect','comers':'prospect','upcomers':'prospect','rising':'prospect',
    'booked':'scheduled','booking':'scheduled','announced':'scheduled','announcement':'scheduled','added':'scheduled','confirmed':'scheduled',
    'criticized':'criticism','criticised':'criticism','criticising':'criticism','backlash':'criticism','uproar':'criticism'
}

def summary_terms(part):
    words=re.findall(r'[a-z0-9]+',plain(part).lower().replace('’',"'"))
    return {SUMMARY_ALIASES.get(w,w) for w in words if len(w)>2 and w not in SUMMARY_STOP_WORDS}

def summary_theme(part):
    text=plain(part).lower()
    if re.search(r'\b(?:penalt(?:y|ies)|fine|demand(?:ed|ing)?)\b',text) and re.search(r'(?:\$\s*\d|\b(?:payment|dollars|fine|negotiations|talks)\b)',text):return 'financial-demand'
    if re.search(r'\b(?:apolog(?:y|ize|ise|ized|ised)|regrets?|sorry)\b',text):return 'apology'
    if re.search(r'\b(?:criticism|criticis|criticiz|backlash|upset fans|off.color joke|controvers(?:y|ial))',text):return 'backlash'
    if re.search(r'\b(?:added|booked|announced|confirmed|scheduled|matching up|set to face|collide|agree(?:d)? to fight)\b',text) and re.search(r'\b(?:fight|bout|match|prospect|clash|battle|pairing)\b',text):return 'fight-booking'
    if re.search(r'\b(?:heavyweights?|division)\b',text) and re.search(r'\b(?:best|better|greatest|never been|demise|strongest)\b',text):return 'division-assessment'
    return ''

def summary_repeats(candidate,existing):
    a,b=summary_terms(candidate),summary_terms(existing)
    if not a or not b:return plain(candidate).lower()==plain(existing).lower()
    shared=len(a & b)
    if shared>=3 and (shared/min(len(a),len(b))>=.57 or shared/len(a|b)>=.45):return True
    theme=summary_theme(candidate)
    if theme and theme==summary_theme(existing) and shared>=2:return True
    return False

def point_is_usable(part):
    part=plain(part).strip(' •\n\r\t')
    words=part.split()
    if len(words)<7 or len(words)>31 or len(part)>230 or len(part)<38:return False
    if re.search(r'(?:\[…\]|\.\.\.|…)',part):return False
    if re.search(r'\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$',part):return False
    if re.search(r'^\d+\s+(?:after|before|from|of|to)\b',part,re.I):return False
    if re.search(r'(?i)\b(?:privacy policy|advertisement|subscribe|newsletter|read more|cookies|all rights reserved|terms of use|follow us|sign up|results?\s*\+\s*scorecards?|here.s our recap|key talking points|click here|watch and stream|find start times|first to report|addressed the chaos|met the media)\b',part):return False
    if re.search(r'\b(?:vs|versus|against)\.?$',part,re.I):return False
    return True

def distinct_summary_points(points):
    selected=[]
    for point in points if isinstance(points,list) else []:
        if not isinstance(point,str) or not point_is_usable(point):continue
        if any(summary_repeats(point,earlier) for earlier in selected):continue
        selected.append(plain(point).strip())
        if len(selected)==3:break
    return selected

def valid_summary_points(value):
    return isinstance(value,list) and len(value)==3 and len(distinct_summary_points(value))==3

def verified_key_points(*texts):
    """Extract up to three different, directly sourced facts; never pad with repetition."""
    candidates=[]
    for raw in texts:
        if not raw:continue
        clean=plain(raw)
        clean=re.sub(r'(?i)\b(?:the post|read more|originally appeared on|appeared first on)\b.{0,250}$','',clean).strip()
        for part in re.split(r'(?<=[.!?])\s+(?=[A-Z0-9“‘\'"])',clean):
            part=part.strip(' •\n\r\t')
            if point_is_usable(part):candidates.append(part)
    return distinct_summary_points(candidates)

def enrich_summary(article,previous,now,force=False):
    snippet=article.pop('_summaryText','')
    article.pop('summaryPoints',None)
    old=previous or {}
    old_points=old.get('summaryPoints')
    if old.get('title')==article['title'] and valid_summary_points(old_points):
        article['summaryPoints']=old_points
        article['summaryCheckedAt']=old.get('summaryCheckedAt',now.isoformat())
        article['summaryQualityVersion']=SUMMARY_QUALITY_VERSION
        return article
    prev_check=stamp(old.get('summaryCheckedAt'))
    if not force and old.get('title')==article['title'] and old.get('summaryQualityVersion')==SUMMARY_QUALITY_VERSION and prev_check and now-prev_check<dt.timedelta(hours=12):
        cached=distinct_summary_points(old_points)
        if cached:article['summaryPoints']=cached
        article['summaryCheckedAt']=old['summaryCheckedAt']
        article['summaryQualityVersion']=SUMMARY_QUALITY_VERSION
        return article
    article['summaryCheckedAt']=now.isoformat()
    article['summaryQualityVersion']=SUMMARY_QUALITY_VERSION
    points=verified_key_points(snippet)
    if len(points)==3:
        article['summaryPoints']=points
        return article
    # Only access the already verified publication URL (same allowed host after redirects).
    allowed=('mmafighting.com','worldboxingnews.net','worldboxingnews.com','ufc.com','mmajunkie.usatoday.com','mmajunkie.com','sherdog.com','onefc.com','cagewarriors.com','adcombat.com','ncaa.com','kswmma.com','rizinff.com','ibjjf.com','realamericanfreestyle.com','uww.org','flograppling.com')
    parsed=urllib.parse.urlsplit(article.get('url',''))
    if parsed.scheme=='https' and any(parsed.hostname==h or parsed.hostname.endswith('.'+h) for h in allowed):
        try:
            req=urllib.request.Request(article['url'],headers={'User-Agent':'Mozilla/5.0 (compatible; BlackEyeFightNews/1.0)'})
            with urllib.request.urlopen(req,timeout=12) as response:
                dest=urllib.parse.urlsplit(response.geturl())
                if dest.scheme!='https' or not any(dest.hostname==h or dest.hostname.endswith('.'+h) for h in allowed):raise ValueError('Unverified redirect host')
                raw=response.read(900_000).decode('utf-8','replace')
            parser=ArticleText()
            parser.feed(raw)
            points=verified_key_points(snippet,*parser.meta,*parser.paragraphs[:40])
        except Exception:
            pass
    # If a source temporarily blocks a new read, retain distinct facts that
    # were previously verified from the same original URL and unchanged title.
    if old.get('title')==article['title'] and len(points)<3:
        points=distinct_summary_points(points+distinct_summary_points(old_points))
    if points:article['summaryPoints']=points
    return article


GRAPPLING_TERMS=re.compile(r'\b(?:ufc[\s-]*bjj|submission grappling|brazilian jiu[\s-]*jitsu|jiu[\s-]*jitsu|jujitsu|ibjjf|adcc|flograppling|grappling match|grappling championship|bjj|no[\s-]*gi|greco[\s-]*roman|freestyle wrestling|ncaa (?:division\s*)?(?:i|ii|1|2) wrestling|wrestling (?:championship|tournament|nationals|worlds)|real american freestyle|raf[\s-]*\d+)\b',re.I)
BOXING_TERMS=re.compile(r'\b(?:zuffa boxing|world boxing news|boxing match|boxing title|boxing championship|boxer|boxers|wba|wbc|wbo|ibf)\b',re.I)
STRIKING_ONLY=re.compile(r'\b(?:muay thai|kickboxing|lumpinee|one friday fights|striking bout)\b',re.I)
MMA_TERMS=re.compile(r'\b(?:ufc(?!\s*-?\s*bjj)|pfl|mixed martial arts|mma|rizin|ksw|cage warriors|octagon|one championship mma)\b',re.I)

def sport_for_article(article, default_sport):
    """Tag a bout's *discipline*, not the parent brand (UFC BJJ != UFC MMA).
    A promotional brand by itself is never enough to relabel an explicit BJJ or boxing story.
    """
    title=plain(article.get('title',''))
    source=plain(article.get('source',''))
    if not title:return None
    if re.search(r'\bmma\s+(?:and|&)\s+submission grappling\b|\bsubmission grappling\s+(?:and|&)\s+mma\b',title,re.I):return 'mma'
    if GRAPPLING_TERMS.search(title):return 'grappling'
    if BOXING_TERMS.search(title) and (source=='UFC' or 'boxing' in title.lower()):return 'boxing'
    if STRIKING_ONLY.search(title) and not re.search(r'\b(?:mma|mixed martial arts|submission grappling|bjj|jiu[\s-]*jitsu)\b',title,re.I):
        if source.startswith('ONE') or source=='RIZIN':return None
    if source.startswith('ONE') and re.search(r'\b(?:mma|mixed martial arts|mma title|mma world)\b',title,re.I):
        return 'mma'
    if source.startswith('ONE') and default_sport=='grappling':
        # ONE's official main feed covers several rulesets: do not guess.
        return 'grappling' if GRAPPLING_TERMS.search(title) else None
    if source.startswith('ONE') and default_sport=='mma':return 'mma'
    if source=='UFC' and 'ufc bjj' in title.lower():return 'grappling'
    if source=='ONE Live Results':
        if GRAPPLING_TERMS.search(title):return 'grappling'
        if MMA_TERMS.search(title) or 'mma' in title.lower():return 'mma'
        return None
    if source=='UFC BJJ':return 'grappling' if GRAPPLING_TERMS.search(title) else None
    if source in ('IBJJF','FloGrappling','Real American Freestyle','United World Wrestling'):return 'grappling'
    if source.startswith('NCAA') or source=='ADCC':return 'grappling'
    return default_sport

def is_non_combat_url(url):
    path=urllib.parse.urlsplit(url).path.lower()
    return bool(re.search(r'^/story/sports/(?:nfl|nba|nhl|mlb|football|basketball|baseball|hockey|soccer|golf|college)(?:/|$)',path))

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
        if is_non_combat_url(url):continue
        if not when or not title or not url.startswith('https://') or not now-dt.timedelta(days=14)<=when<=now+dt.timedelta(minutes=30):continue
        url=urllib.parse.urlunsplit(urllib.parse.urlsplit(url)._replace(fragment=''))
        score=sum(weight for pattern,weight in [(r'\b(title|champion|championship)\b',3),(r'\b(result|knockout|wins|defeats|withdraw|cancel|announc|confirm)',4),(r'\b(fight|ufc|boxing|bout)\b',1)] if re.search(pattern,title,re.I))
        summary_text=' '.join(x for x in (fields.get('description'),fields.get('summary'),fields.get('encoded'),fields.get('content')) if x)
        out.append(dict(id=hashlib.sha256(url.encode()).hexdigest()[:20],title=title,url=url,source=source,sport=sport,publishedAt=when.isoformat(),score=score,_imageCandidates=image_candidates(item),_summaryText=summary_text))
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
        if parsed.scheme!='https' or parsed.hostname not in allow or not parsed.path.startswith('/story/') or is_non_combat_url(url):continue
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
        if parsed.scheme!='https' or parsed.hostname not in approved or not parsed.path.startswith('/story/') or is_non_combat_url(link):continue
        when=stamp(fields.get('pubDate'))
        if not when or not now-dt.timedelta(days=14)<=when<=now+dt.timedelta(minutes=30):continue
        title=plain(fields.get('title'))
        if not title:continue
        url=urllib.parse.urlunsplit(parsed._replace(fragment=''))
        score=sum(weight for pattern,weight in [(r'\b(title|champion|championship)\b',3),(r'\b(result|knockout|wins|defeats|withdraw|cancel|announc|confirm)',4),(r'\b(fight|ufc|boxing|bout)\b',1)] if re.search(pattern,title,re.I))
        output.append(dict(id=hashlib.sha256(url.encode()).hexdigest()[:20],title=title,url=url,source='MMA Junkie',sport='mma',publishedAt=when.isoformat(),score=score,
          sourceMethod='Bing News indexed MMA Junkie original',timeBasis='Bing News feed timestamp',_imageCandidates=[],_summaryText=fields.get('description','')))
    return output

def indexed_official_source(raw, source, sport, now):
    """Direct official article links indexed in Bing, not assumed publication timestamps."""
    approved={'RIZIN':('jp.rizinff.com','rizinff.com','www.rizinff.com'),
              'KSW':('www.kswmma.com','kswmma.com'),
              'UFC BJJ':('www.ufc.com','ufc.com'),
              'IBJJF':('ibjjf.com','www.ibjjf.com'),
              'FloGrappling':('www.flograppling.com','flograppling.com'),
              'Real American Freestyle':('www.realamericanfreestyle.com','realamericanfreestyle.com'),
              'United World Wrestling':('www.uww.org','uww.org','cms.uww.org'),
              'Cage Warriors':('cagewarriors.com','www.cagewarriors.com'),
              'NCAA Division I Wrestling':('www.ncaa.com','ncaa.com'),
              'NCAA Division II Wrestling':('www.ncaa.com','ncaa.com'),
              'ADCC':('adcombat.com','www.adcombat.com')}.get(source,())
    root=ET.fromstring(raw);out=[]
    for item in root.iter():
        if item.tag.split('}')[-1]!='item':continue
        fields={child.tag.split('}')[-1]:''.join(child.itertext()) for child in item}
        url=fields.get('link','').strip();parts=urllib.parse.urlsplit(url)
        if parts.hostname in ('www.bing.com','bing.com'):
            url=urllib.parse.parse_qs(parts.query).get('url',[''])[0];parts=urllib.parse.urlsplit(url)
        if parts.scheme!='https' or parts.hostname not in approved:continue
        if source=='UFC BJJ' and not re.search(r'/news/ufc-bjj|/ufcbjj',parts.path,re.I):continue
        if source.startswith('NCAA Division') and not re.search(r'/news/wrestling/(?:d1|d2)/',parts.path,re.I):continue
        when=stamp(fields.get('pubDate'));title=plain(fields.get('title'))
        if not when or not title or not now-dt.timedelta(days=14)<=when<=now+dt.timedelta(minutes=30):continue
        if is_non_combat_url(url):continue
        url=urllib.parse.urlunsplit(parts._replace(fragment=''))
        out.append({'id':hashlib.sha256(url.encode()).hexdigest()[:20],
          'title':title,'url':url,'source':source,'sport':sport,
          'publishedAt':when.isoformat(),'timeBasis':'Bing News index timestamp',
          'sourceMethod':'Original official domain indexed by Bing News',
          'score':1,'_imageCandidates':[],'_summaryText':fields.get('description','')})
    return out

def source_articles(source,sport,url,now):
    urls=[url]
    # When a publisher blocks feed robots, search index only for links back to
    # its own verified domain. Never link to a Google/Bing summary as the article.
    fallback_domains={
      'Cage Warriors':'cagewarriors.com',
      'NCAA Division I Wrestling':'ncaa.com/news/wrestling/d1',
      'NCAA Division II Wrestling':'ncaa.com/news/wrestling/d2',
      'ADCC':'adcombat.com',
    }
    if source in fallback_domains:
        urls.append('https://www.bing.com/news/search?'+urllib.parse.urlencode({'q':'site:'+fallback_domains[source],'format':'rss','setmkt':'en-US'}))
    if source=='MMA Junkie':
        urls+=['https://mmajunkie.com/feed/','https://api.gdeltproject.org/api/v2/doc/doc?'+urllib.parse.urlencode({'query':'domain:mmajunkie.usatoday.com','mode':'artlist','maxrecords':'75','format':'json','timespan':'7d','sort':'datedesc'}),'https://www.bing.com/news/search?'+urllib.parse.urlencode({'q':'site:mmajunkie.usatoday.com','format':'rss','setmkt':'en-US'}),'https://news.google.com/rss/search?q=site%3Ammajunkie.usatoday.com%20when%3A7d&hl=en-AU&gl=AU&ceid=AU%3Aen']
    errors=[]
    for candidate in urls:
        try:
            req=urllib.request.Request(candidate,headers={'User-Agent':'Mozilla/5.0 (compatible; BlackEyeFightNews/1.0)'})
            try:
                with urllib.request.urlopen(req,timeout=12) as response: raw=response.read(3_000_000)
            except urllib.error.HTTPError as exc:
                if exc.code!=429 or urllib.parse.urlsplit(candidate).hostname!='api.gdeltproject.org':raise
                time.sleep(6)
                with urllib.request.urlopen(req,timeout=12) as response: raw=response.read(3_000_000)
            if urllib.parse.urlsplit(candidate).hostname=='api.gdeltproject.org':
                found=mma_junkie_gdelt(raw,now)
            elif urllib.parse.urlsplit(candidate).hostname=='www.bing.com':
                found=indexed_official_source(raw,source,sport,now) if source in ('RIZIN','KSW','UFC BJJ','IBJJF','FloGrappling','Real American Freestyle','United World Wrestling','Cage Warriors','NCAA Division I Wrestling','NCAA Division II Wrestling','ADCC') else mma_junkie_bing(raw,now)
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

def summary_needs_refresh(article,now):
    if article.get('summaryQualityVersion')!=SUMMARY_QUALITY_VERSION:return True
    if valid_summary_points(article.get('summaryPoints')):return False
    checked=stamp(article.get('summaryCheckedAt'))
    return not checked or now-checked>=dt.timedelta(hours=12)

def main():
    now=dt.datetime.now(UTC); path=Path('data/news-live.json')
    old=json.loads(path.read_text()) if path.exists() else {'articles':[], 'resultReports':[]}
    recent=lambda a: stamp(a.get('publishedAt')) and stamp(a['publishedAt'])>=now-dt.timedelta(days=14) and not is_non_combat_url(a.get('url',''))
    articles={a['url']:a for a in old.get('articles',[]) if recent(a) and not is_routine_result(a['title'])}
    reports={a['url']:a for a in old.get('resultReports',[]) if recent(a) and is_routine_result(a['title'])}
    # Reclassify existing cached material as well as new feed entries.
    for bucket in (articles,reports):
        for a in bucket.values():
            a['sport']=sport_for_article(a,a.get('sport','mma'))
            if re.search(r'\bmma\s+(?:and|&)\s+submission grappling\b',a['title'],re.I):
                a['sports']=['mma','grappling']
    statuses=[]; success=0
    # Bounded parallel source checks keep the existing 15-minute publishing cadence.
    # Workers read previous verified content only; main thread owns all published updates.
    def collect(entry):
        source,sport,url=entry
        found,used_url=source_articles(source,sport,url,now)
        found=[a for a in found if not is_non_combat_url(a['url']) and sport_for_article(a,sport)]
        if not found:raise ValueError('No dated, source-verified articles in the current feed')
        def process(a):
            previous=articles.get(a['url']) or reports.get(a['url'])
            a['sport']=sport_for_article(a,sport)
            if re.search(r'\bmma\s+(?:and|&)\s+submission grappling\b|\bsubmission grappling\s+(?:and|&)\s+mma\b',a['title'],re.I):
                a['sports']=['mma','grappling']
            a=enrich_image(a,previous,now)
            return a if is_routine_result(a['title']) else enrich_summary(a,previous,now)
        with ThreadPoolExecutor(max_workers=4) as inner:
            enriched=list(inner.map(process,found[:10]))
        return enriched,used_url

    with ThreadPoolExecutor(max_workers=5) as outer:
        jobs=[outer.submit(collect,entry) for entry in SOURCES]
        for (source,sport,url),job in zip(SOURCES,jobs):
            try:
                found,used_url=job.result()
                for a in found:
                    previous=articles.get(a['url']) or reports.get(a['url'])
                    a['firstSeenAt']=previous.get('firstSeenAt',now.isoformat()) if previous else now.isoformat()
                    if previous and previous['title']!=a['title']:a['updatedAt']=now.isoformat()
                    elif previous and previous.get('updatedAt'):a['updatedAt']=previous['updatedAt']
                    if is_routine_result(a['title']):
                        reports[a['url']]=a;articles.pop(a['url'],None)
                    else:
                        articles[a['url']]=a;reports.pop(a['url'],None)
                success+=1
                statuses.append({'name':source,'sport':sport,'ok':True,'items':len(found),'feedUrl':used_url,'lastSuccessfulAt':now.isoformat()})
            except Exception as exc:
                previous=next((old_source for old_source in old.get('sources',[]) if old_source['name']==source),{})
                statuses.append({'name':source,'sport':sport,'ok':False,'lastSuccessfulAt':previous.get('lastSuccessfulAt'),'error':str(exc)[:160]})
    missing=[a for a in sorted(articles.values(),key=lambda a:a['publishedAt'],reverse=True)
             if summary_needs_refresh(a,now)][:18]
    if missing:
        with ThreadPoolExecutor(max_workers=5) as pool:
            refreshed=list(pool.map(lambda a:enrich_summary(dict(a),a,now,force=True),missing))
        for a in refreshed:articles[a['url']]=a
    clean_articles, removed_articles=deduplicate(list(articles.values()))
    clean_reports, removed_reports=deduplicate(list(reports.values()))
    payload={'attemptedAt':now.isoformat(),'lastSuccessfulAt':now.isoformat() if success else old.get('lastSuccessfulAt'),
             'sources':statuses,'articles':sorted(clean_articles,key=lambda a:a['publishedAt'],reverse=True)[:280],
             'resultReports':sorted(clean_reports,key=lambda a:a['publishedAt'],reverse=True)[:120],
             'deduplication':{'checkedAt':now.isoformat(),'removedArticles':len(removed_articles),
                              'removedResultReports':len(removed_reports),
                              'examples':(removed_articles+removed_reports)[:15]}}
    path.write_text(json.dumps(payload,indent=2,ensure_ascii=False)+'\n')
    print(f'News: {success}/{len(SOURCES)} sources, {len(payload["articles"])} articles, {len(payload["resultReports"])} official result reports')
if __name__=='__main__':main()
