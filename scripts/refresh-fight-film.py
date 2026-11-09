#!/usr/bin/env python3
"""Curate fresh, original fight finishes/highlights from verified promotion feeds.

Uses YouTube's publicly exposed Atom upload feeds; no scraping of video files,
fabricated video references, API keys, or third-party rehosting. RSS can lag.
Only pair-matched bout-specific uploads receive a link in results.json.
"""
import datetime as dt
import json
import os
import concurrent.futures
import re
import sys
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FILM=ROOT/'data/fight-film.json'
RESULTS=ROOT/'data/results.json'
ATOM={'a':'http://www.w3.org/2005/Atom','yt':'http://www.youtube.com/xml/schemas/2015'}
CHANNELS=[
 ('DAZN Boxing','UCurvRE5fGcdUgCYWgh-BDsg','boxing','Boxing'),
 ('Top Rank Boxing','UCbzRzJNHx7ZLlJML9BjZQVQ','boxing','Boxing'),
 ('UFC','UCvgfXK4nTYKudb0rFR6noLA','combat','MMA'),
 ('PFL','UCPrONRG9hO1f-OrxW-WH-xg','combat','MMA'),
 ('ONE Championship','UCiormkBf3jm6mfb7k0yPbKA','combat','MMA / Grappling'),
 ('Real American Freestyle','UCB0zHtqhvp2fuz0kJJlUpQw','combat','Wrestling / RAF'),
 ('FloGrappling','UCeOvhU6RbmEj8GKFiIMWxKQ','combat','BJJ / Grappling'),
 ('IBJJF','UCuEclQFX1C12JpywNDNMHIg','combat','BJJ / Grappling'),
 ('United World Wrestling','@UnitedWorldWrestling','combat','Wrestling / RAF'),
 ('TNT Fight Sports','UC-hWvVvE-crFl5vg5G8QbqA','combat','MMA')
]
KEYWORDS=re.compile(r'\b(highlights?|knockouts?|ko|tko|stoppage|stops|stopped|finish(?:es|ed)?|finishing|submission|submits?|tapout|tap out|pins?|tech fall|technical fall|best moments|fight recap|match recap|full fight|full match|full bout|wrestling finals|bjj finals|world championship highlights|final moments|leg locks|chokes?|ground and pound)\b',re.I)
NEGATIVE=re.compile(r'\b(previews?|predictions?|interviews?|press conference|weigh[- ]?in|face[- ]?off|watchalong|podcast|training|tutorial|how to|explained|reacts?|rumours?|breakdown|breaks down|trailer|teaser|countdown|coming soon|fight week|before the fight|behind the scenes|promo(?:tional)?|presser)\b',re.I)
SPORT_WORDS={
 'Boxing':re.compile(r'\b(boxing|round|ko|tko|knockout|fight|stoppage|knockdown|highlights?)\b',re.I),
 'MMA':re.compile(r'\b(ufc|mma|pfl|fight|finish|submission|knockout|highlights?|tko|ko|stoppage)\b',re.I),
 'MMA / Grappling':re.compile(r'\b(one championship|mma|fight|submission|knockout|highlights?|tko|ko|stoppage)\b',re.I),
 'BJJ / Grappling':re.compile(r'\b(bjj|jiu.jitsu|ibjjf|adcc|grappling|nogi|no.gi|submission|choke|leg.lock|highlights?|finals|finish)\b',re.I),
 'Wrestling / RAF':re.compile(r'\b(raf|wrestling|freestyle|pin|takedown|tech fall|highlights?|finals|match|finish)\b',re.I)
}
# Authoritative scope: classify the ruleset shown in the footage, not the promotion
# logo. ONE hosts MMA, grappling, kickboxing and Muay Thai; UFC hosts UFC BJJ.
BJJ_MATCH=re.compile(r'\b(?:ufc[\s-]*bjj|bjj|jiu[\s-]*jitsu|jujitsu|submission grappling|grappling match|adcc|ibjjf|no[\s-]*gi|nogi|greco[\s-]*roman|freestyle wrestling|wrestling|raf[\s-]*\d+)\b',re.I)
STRIKING_MATCH=re.compile(r'\b(?:muay thai|kickbox(?:ing)?|lumpinee|boxing)\b',re.I)
MMA_MATCH=re.compile(r'\b(?:mma|mixed martial arts|ufc(?!\s*-?\s*bjj)|pfl|rizin|ksw|cage warriors|octagon|ground and pound)\b',re.I)

def video_sport(video):
 title=str(video.get('title') or '')
 publisher=str(video.get('publisher') or '')
 discipline=str(video.get('discipline') or '')
 if BJJ_MATCH.search(title):return 'grappling'
 if ('BJJ' in discipline or 'Wrestling' in discipline or 'Grappling' in discipline and publisher!='ONE Championship'):return 'grappling'
 if STRIKING_MATCH.search(title) and not MMA_MATCH.search(title):
  if publisher=='ONE Championship':return None  # Do not mislabel ONE Muay Thai/Kickboxing
  if re.search(r'\bboxing\b',title,re.I):return 'boxing'
 if publisher=='ONE Championship':
  return 'mma' if MMA_MATCH.search(title) else None  # Unknown mixed-rules event
 if video.get('category')=='boxing':return 'boxing'
 return 'mma'

def normal(text):
 return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',str(text or '')).encode('ascii','ignore').decode().lower()).strip()
def video_kind(title):
 if re.search(r'\b(submission|submits|tapout|tap out|choke|leg lock)\b',title,re.I):return 'Submission'
 if re.search(r'\b(ko|tko|knockout|stoppage|stops|stopped|knockdown)\b',title,re.I):return 'KO / TKO'
 if re.search(r'\b(pin|tech fall|technical fall)\b',title,re.I):return 'Pin / Technical fall'
 return 'Highlights'
def qualifies(title,discipline):
 if NEGATIVE.search(title) or not KEYWORDS.search(title):return False
 return bool(SPORT_WORDS[discipline].search(title))
def parse_feed(xml,publisher,category,discipline,today=None):
 today=today or dt.datetime.now(dt.timezone.utc).date()
 root=ET.fromstring(xml)
 videos=[]
 for entry in root.findall('a:entry',ATOM):
  vid=(entry.findtext('yt:videoId',default='',namespaces=ATOM) or '').strip()
  title=(entry.findtext('a:title',default='',namespaces=ATOM) or '').strip()
  published=(entry.findtext('a:published',default='',namespaces=ATOM) or '')[:10]
  if not re.fullmatch(r'[a-zA-Z0-9_-]{11}',vid) or not qualifies(title,discipline):continue
  try:date=dt.date.fromisoformat(published)
  except ValueError:continue
  if not (0<=(today-date).days<=21):continue
  videos.append({
   'id':'yt-'+vid,'category':category,'discipline':discipline,
   'title':title,'url':'https://www.youtube.com/watch?v='+vid,
   'thumbnail':'https://i.ytimg.com/vi/'+vid+'/hqdefault.jpg',
   'publisher':publisher,'date':published,'verified':True,'kind':video_kind(title),
   'isFinish':bool(re.search(r'\b(ko|tko|knockout|stoppage|submission|submits|tapout|pin|tech fall|technical fall)\b',title,re.I)),
   'source':'Verified publisher YouTube upload feed'
  })
 return [dict(video,sport=sport) for video in videos if (sport:=video_sport(video))]
def fetch_feed(channel_id):
 """Prefer Atom; if unavailable, read the publisher's public videos page."""
 if channel_id.startswith('@'):
  # Read the official publisher's current handle video listing; never invent a channel ID.
  url='https://www.youtube.com/'+channel_id+'/videos'
  request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36','Accept-Language':'en-AU,en;q=0.9'})
  with urllib.request.urlopen(request,timeout=15) as res:return res.read(4500000).decode('utf-8','replace')
 rss='https://www.youtube.com/feeds/videos.xml?channel_id='+channel_id
 req=urllib.request.Request(rss,headers={'User-Agent':'Mozilla/5.0 (compatible; FightFilmDesk/1.0)',
                                         'Accept':'application/atom+xml, application/xml;q=0.9'})
 try:
  with urllib.request.urlopen(req,timeout=8) as res:
   xml=res.read().decode('utf-8')
  if '<entry>' in xml or '<entry ' in xml:return xml
 except Exception:
  pass
 url='https://www.youtube.com/channel/'+channel_id+'/videos?view=0&sort=dd&flow=grid'
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
                                         'Accept-Language':'en-AU,en;q=0.9'})
 with urllib.request.urlopen(req,timeout=15) as res:
  html=res.read(4500000).decode('utf-8','replace')
 if 'ytInitialData' not in html:
  raise ValueError('YouTube channel page has no public video listing ('+str(len(html))+' bytes)')
 return html

def parse_channel_videos(html,publisher,category,discipline,today=None):
 """Read YouTube's 2026 lockupViewModel videos, with old renderer fallback."""
 today=today or dt.datetime.now(dt.timezone.utc).date()
 match=re.search(r'ytInitialData\s*=\s*',html)
 if not match:return []
 try:
  initial,_=json.JSONDecoder().raw_decode(html[match.end():].lstrip())
 except (ValueError,TypeError):return []
 def walk(value):
  if isinstance(value,list):
   for v in value:yield from walk(v)
  elif isinstance(value,dict):
   if isinstance(value.get('lockupViewModel'),dict):
    yield 'lockup',value['lockupViewModel']
   if isinstance(value.get('videoRenderer'),dict):
    yield 'legacy',value['videoRenderer']
   for v in value.values():
    if isinstance(v,(dict,list)):yield from walk(v)
 def get_text(value):
  if not isinstance(value,dict):return ''
  return value.get('simpleText') or value.get('content') or ''.join(
   run.get('text','') for run in value.get('runs',[]) if isinstance(run,dict))
 def recent_date(value):
  published=str(value or '').lower()
  m=re.search(r'(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago',published)
  if not m:return None
  count=int(m.group(1));unit=m.group(2)
  if unit in ('month','year'):return None
  days=count*7 if unit=='week' else count if unit=='day' else 0
  if days>21:return None
  return (today-dt.timedelta(days=days)).isoformat()
 results=[];seen=set()
 for kind,v in walk(initial):
  if kind=='lockup':
   if v.get('contentType')!='LOCKUP_CONTENT_TYPE_VIDEO':continue
   vid=v.get('contentId','')
   metadata=(v.get('metadata') or {}).get('lockupMetadataViewModel') or {}
   title=get_text(metadata.get('title'))
   # YouTube varies the placement of published-time text within the metadata rows.
   fields=[]
   def collect_text(obj):
    if isinstance(obj,list):
     for item in obj:collect_text(item)
    elif isinstance(obj,dict):
     if isinstance(obj.get('content'),str):fields.append(obj['content'])
     for key,value in obj.items():
      if key!='content' and isinstance(value,(dict,list)):collect_text(value)
   collect_text(metadata.get('metadata') or {})
   date=next((parsed for field in fields if (parsed:=recent_date(field))),None)
  else:
   vid=v.get('videoId','')
   title=get_text(v.get('title'))
   date=recent_date(get_text(v.get('publishedTimeText')))
  if not re.fullmatch(r'[A-Za-z0-9_-]{11}',vid) or vid in seen:continue
  if not date or not qualifies(title,discipline):continue
  seen.add(vid)
  results.append({'id':'yt-'+vid,'category':category,'discipline':discipline,
   'title':title,'url':'https://www.youtube.com/watch?v='+vid,
   'thumbnail':'https://i.ytimg.com/vi/'+vid+'/mqdefault.jpg',
   'publisher':publisher,'date':date,'verified':True,'kind':video_kind(title),
   'isFinish':bool(re.search(r'\b(ko|tko|knockout|stoppage|submission|submits|tapout|pin|tech fall)\b',title,re.I)),
   'source':'Public publisher channel videos page'})
 return [dict(video,sport=sport) for video in results if (sport:=video_sport(video))]


def parse_youtube_data_api(payload,video_id):
 """Use documented YouTube Data API regionRestriction and published thumbnails."""
 for item in payload.get('items',[]):
  if item.get('id')!=video_id:continue
  if (item.get('status') or {}).get('privacyStatus')!='public':return None
  snippet=item.get('snippet') or {}
  content=item.get('contentDetails') or {}
  region=content.get('regionRestriction') or {}
  if 'allowed' in region and 'AU' not in region['allowed']:return None
  if 'blocked' in region and 'AU' in region['blocked']:return None
  choices=snippet.get('thumbnails') or {}
  for quality in ('maxres','standard','high','medium','default'):
   entry=choices.get(quality) or {}
   url=entry.get('url','')
   if re.match(r'^https://(?:i\.ytimg\.com|img\.youtube\.com)/vi/'+re.escape(video_id)+r'/[^?#]+',url):
    return {'thumbnail':url,'auAvailable':True,'auVerification':'youtube-api-region-restriction'}
 return None

def fetch_data_api(video_id):
 key=os.getenv('YOUTUBE_API_KEY','').strip()
 if not key:return None
 from urllib.parse import urlencode
 url='https://www.googleapis.com/youtube/v3/videos?'+urlencode({
  'part':'contentDetails,snippet,status','id':video_id,'key':key})
 req=urllib.request.Request(url,headers={'Accept':'application/json'})
 with urllib.request.urlopen(req,timeout=12) as res:
  payload=json.loads(res.read().decode('utf-8'))
 return parse_youtube_data_api(payload,video_id)

def fetch_player_page(video_id):
 """Try public watch and embeddable-player metadata, fail closed if unavailable."""
 urls=[
  'https://www.youtube.com/watch?v='+video_id+'&hl=en-AU&gl=AU',
  'https://www.youtube-nocookie.com/embed/'+video_id+'?hl=en-AU&gl=AU',
  'https://www.youtube.com/embed/'+video_id+'?hl=en-AU&gl=AU',
 ]
 last=''
 for u in urls:
  try:
   req=urllib.request.Request(u,headers={
    'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
    'Accept-Language':'en-AU,en;q=0.9','Accept':'text/html'})
   with urllib.request.urlopen(req,timeout=10) as response:
    page=response.read(2400000).decode('utf-8','replace')
   last=page
   if parse_australian_player(page,video_id):
    return page
  except Exception:
   continue
 return last

def fetch_embed_player_page(video_id):
 """Check YouTube's official privacy-enhanced public embed when watch requires login."""
 req=urllib.request.Request(
  'https://www.youtube-nocookie.com/embed/'+video_id+'?hl=en-AU&gl=AU',
  headers={'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
           'Accept-Language':'en-AU,en;q=0.9',
           'Accept':'text/html'})
 with urllib.request.urlopen(req,timeout=12) as response:
  return response.read(2500000).decode('utf-8','replace')

def parse_australian_player(html,video_id):
 """Fail closed unless YouTube explicitly lists AU and reports public playback."""
 match=re.search(r'ytInitialPlayerResponse\s*=\s*',html)
 if not match:return None
 try:
  player,_=json.JSONDecoder().raw_decode(html[match.end():].lstrip())
 except (ValueError,TypeError):return None
 if player.get('playabilityStatus',{}).get('status')!='OK':return None
 details=player.get('videoDetails') or {}
 if details.get('videoId')!=video_id or details.get('isPrivate') or details.get('isLiveContent'):
  return None
 micro=(player.get('microformat') or {}).get('playerMicroformatRenderer') or {}
 countries=micro.get('availableCountries')
 if not isinstance(countries,list) or 'AU' not in countries:return None
 thumbs=(details.get('thumbnail') or {}).get('thumbnails') or []
 candidates=[thumb for thumb in thumbs if
  isinstance(thumb,dict) and
  re.match(r'^https://(?:i\.ytimg\.com|img\.youtube\.com)/vi/'+re.escape(video_id)+r'/[^/?#]+\.(?:jpg|webp)',thumb.get('url',''))]
 if not candidates:return None
 preferred=max(candidates,key=lambda t:(t.get('width',0)*t.get('height',0)))
 return {'thumbnail':preferred['url'],'auAvailable':True,
         'auVerification':'youtube-country-metadata'}

def verify_au(video,fetch_page=fetch_player_page):
 video_id=video['id'][3:] if video.get('id','').startswith('yt-') else ''
 if not re.fullmatch(r'[A-Za-z0-9_-]{11}',video_id):return None
 try:
  meta=fetch_data_api(video_id)
  page=''
  if not meta:
   page=fetch_page(video_id)
   meta=parse_australian_player(page,video_id)
  if not meta and fetch_page is fetch_player_page:
   try:
    embed=fetch_embed_player_page(video_id)
    meta=parse_australian_player(embed,video_id)
    if not meta:
     print('Australian embed metadata unavailable',video_id,'player token',embed.find('ytInitialPlayerResponse'),'page bytes',len(embed),file=sys.stderr)
   except Exception as exc:
    print('Australian embed check failed',video_id,type(exc).__name__,str(exc)[:70],file=sys.stderr)
 except Exception as exc:
  print('Unable to verify Australia availability for',video_id,type(exc).__name__,str(exc)[:75],file=sys.stderr)
  return None
 if not meta:
  match=re.search(r'ytInitialPlayerResponse\s*=\s*',page)
  if not match:
   print('AU check missing player metadata',video_id,'page bytes',len(page),file=sys.stderr)
  else:
   try:
    player,_=json.JSONDecoder().raw_decode(page[match.end():].lstrip())
    micro=(player.get('microformat') or {}).get('playerMicroformatRenderer') or {}
    countries=micro.get('availableCountries')
    details=player.get('videoDetails') or {}
    print('AU check rejected',video_id,'player',player.get('playabilityStatus',{}).get('status'),'AU listed',('AU' in countries if isinstance(countries,list) else None),'countries',(len(countries) if isinstance(countries,list) else None),'thumbs',len((details.get('thumbnail') or {}).get('thumbnails') or []),file=sys.stderr)
   except (ValueError,TypeError,AttributeError):
    print('AU check malformed player',video_id,file=sys.stderr)
  return None
 out={**video,**meta}
 out['auVerifiedAt']=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
 return out

def last_verified_recent(video,now):
 stamp=video.get('auVerifiedAt','')
 if not(video.get('auAvailable') is True and video.get('auVerification') in ('youtube-country-metadata','youtube-api-region-restriction') and video.get('thumbnail')):
  return False
 try:age=(now-dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))).total_seconds()
 except (TypeError,ValueError):return False
 return 0<=age<6*3600

def surname(fighter):
 terms=normal(fighter).split()
 return terms[-1] if terms else ''
def exact_bout_video(video,row):
 """Never claim a video is the finish from a bout based on one fighter alone."""
 if row.get('status')!='completed':return False
 if ('boxing' if row.get('sport')=='Boxing' else 'combat')!=video['category']:return False
 title=normal(video['title'])
 names=[surname(f['name']) for f in row['fighters']]
 if not all(len(n)>=4 and re.search(r'(?<![a-z0-9])'+re.escape(n)+r'(?![a-z0-9])',title) for n in names):return False
 try:gap=(dt.date.fromisoformat(video['date'])-dt.date.fromisoformat(row['date'])).days
 except (ValueError,KeyError):return False
 return 0<=gap<=10
def curated_official_video(video):
 """Preserve hand-checked publisher video pages without claiming AU playback verification.

 Unlike YouTube uploads, source-hosted clips are labelled external and are never
 treated as Australian-verified video or auto-attached as AU-approved result links.
 """
 from urllib.parse import urlparse
 if video.get('sourceType')!='publisher-video-page' or video.get('verified') is not True:
  return False
 if not video.get('isFinish') or video.get('category')!='combat':
  return False
 if not video.get('thumbnail') or not video.get('eventId'):
  return False
 try:
  u=urlparse(video['url'])
  valid=(u.scheme=='https' and (
   (u.hostname=='www.ufc.com' and re.fullmatch(r'/video/\d+',u.path)) or
   (u.hostname=='www.mmafighting.com' and u.path.startswith('/ufc/'))))
  date=dt.date.fromisoformat(video['date'])
  age=(dt.datetime.now(dt.timezone.utc).date()-date).days
  return valid and 0<=age<=21
 except (TypeError,ValueError,KeyError):return False

def merge_video(film,results,fetched):
 existing={v['url']:dict(v,sport=video_sport(v)) for v in film.get('videos',[]) if video_sport(v) and v.get('url') and v.get('thumbnail') and ((v.get('auAvailable') is True and v.get('auVerification') in ('youtube-country-metadata','youtube-api-region-restriction')) or curated_official_video(v))}
 added=0
 for v in fetched:
  if v.get('auAvailable') is not True or not v.get('thumbnail') or not video_sport(v):continue
  v['sport']=video_sport(v)
  if v['url'] not in existing:
   added+=1
  existing[v['url']]=v
 matched=0
 for row in results.get('results',[]):
  if (row.get('highlights') or {}).get('auAvailable') is True:continue
  matches=[v for v in fetched if v.get('auAvailable') is True and exact_bout_video(v,row)]
  if not matches:continue
  # A verified video of both athletes from the same event is a safe link.
  best=sorted(matches,key=lambda v:(v['isFinish'],v['date']),reverse=True)[0]
  row['highlights']={'url':best['url'],'publisher':best['publisher'],'videoId':best['id'],'thumbnail':best['thumbnail'],'auAvailable':True,'auVerifiedAt':best['auVerifiedAt']}
  matched+=1
 # Only Australian-listed videos with actual publisher thumbnails are shown.
 film['videos']=sorted(existing.values(),key=lambda v:(v.get('date',''),str(v.get('id',''))),reverse=True)[:150]
 return added,matched
def refresh(film,results,fetch=fetch_feed,today=None,verify=verify_au):
 today=today or dt.datetime.now(dt.timezone.utc).date()
 now=dt.datetime.now(dt.timezone.utc)
 candidates=[];fail=[]
 known={v.get('id'):v for v in film.get('videos',[])}
 for publisher,channel,category,discipline in CHANNELS:
  try:
   feed=fetch(channel)
   matches=(parse_feed(feed,publisher,category,discipline,today) if feed.lstrip().startswith('<?xml') or feed.lstrip().startswith('<feed') else parse_channel_videos(feed,publisher,category,discipline,today))
   candidates.extend(matches[:6])
  except Exception as exc:
   fail.append(publisher)
   print('Video source delayed:',publisher,type(exc).__name__,getattr(exc,'code',''),str(exc)[:90],file=sys.stderr)
 # A public upload is not proof of AU playback: check each candidate's
 # YouTube player country list before it can enter the website data.
 unique={v['id']:v for v in candidates}
 verified=[];to_check=[]
 for vid,v in unique.items():
  existing=known.get(vid)
  if existing and last_verified_recent(existing,now):
   verified.append(existing)
  else:
   to_check.append(v)
 if to_check:
  with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
   for v in pool.map(verify,to_check):
    if v:verified.append(v)
 added,matched=merge_video(film,results,verified)
 if added or matched or any(known.get(v['id'])!=v for v in verified):
  film['updatedAt']=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
 film['regionPolicy']='Videos need documented YouTube API AU region permission (or verified public player country metadata) plus an original video thumbnail; unconfirmed videos are withheld.'
 print('Fight Film: '+str(len(CHANNELS)-len(fail))+'/'+str(len(CHANNELS))+' channel feeds, '
       +str(len(verified))+' AU-approved with thumbnails, '+str(added)+' new videos, '
       +str(matched)+' newly matched bouts')
 return added,matched

if __name__=='__main__':
 film=json.loads(FILM.read_text())
 results=json.loads(RESULTS.read_text())
 before=json.dumps((film,results),sort_keys=True,ensure_ascii=False)
 refresh(film,results)
 if json.dumps((film,results),sort_keys=True,ensure_ascii=False)!=before:
  FILM.write_text(json.dumps(film,ensure_ascii=False,indent=2)+'\n')
  RESULTS.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
