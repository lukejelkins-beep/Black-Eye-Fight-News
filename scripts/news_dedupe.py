"""Conservative, deterministic duplicate filtering for BEFN news publishing.

Applied *before* writing news-live.json. Keep the strongest sourced version
without collapsing distinct fights, developments, or later follow-ups.
"""
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import re
import unicodedata

TRACKING_KEYS={'fbclid','gclid','mc_cid','mc_eid','igshid','ref','ref_src','source','utm_source','utm_medium','utm_campaign','utm_term','utm_content'}
STOP={'a','an','the','to','and','or','of','in','on','at','for','from','after','before',
      'with','as','by','is','are','was','were','will','be','has','have','had','new',
      'latest','report','reports','says','said','reveals','breaking','exclusive','video'}
# A follow-up is a distinct news event, even about the same athletes.
UPDATES={'confirmed','announced','rumored','rumoured','injured','withdraws','withdrawn',
         'cancelled','postponed','wins','won','loses','lost','knockout','stopped',
         'weigh','weighin','signed','signs','suspended','returns','retired'}

def canonical_url(url):
    p=urlsplit(str(url or '').strip())
    host=(p.hostname or '').lower().removeprefix('www.')
    if p.scheme not in ('http','https') or not host: return ''
    path=re.sub(r'/+','/',p.path).rstrip('/') or '/'
    query=urlencode(sorted((k,v) for k,v in parse_qsl(p.query,keep_blank_values=True)
                           if k.lower() not in TRACKING_KEYS and not k.lower().startswith('utm_')))
    return urlunsplit(('https',host,path,query,''))

def title_terms(title):
    text=unicodedata.normalize('NFKD',str(title or '')).encode('ascii','ignore').decode().lower()
    return [w for w in re.findall(r'[a-z0-9]+',text) if w not in STOP]

def title_key(title):
    return ' '.join(title_terms(title))

def published(article):
    try:
        s=str(article.get('publishedAt','')).replace('Z','+00:00')
        result=datetime.fromisoformat(s)
        return result if result.tzinfo else result.replace(tzinfo=timezone.utc)
    except (ValueError,TypeError):return None

def duplicate_of(a,b):
    if canonical_url(a.get('url')) and canonical_url(a.get('url'))==canonical_url(b.get('url')):
        return True
    # A near-identical title from two publishers within three days is the same story.
    # Different sports and separated news cycles are never combined by fuzzy matching.
    if a.get('sport')!=b.get('sport'):return False
    ta,tb=published(a),published(b)
    if not ta or not tb or abs((ta-tb).total_seconds())>72*3600:return False
    x,y=title_terms(a.get('title')),title_terms(b.get('title'))
    if not x or not y:return False
    if x==y:return True
    sa,sb=set(x),set(y)
    if min(len(sa),len(sb))<6:return False
    if (sa & UPDATES)!=(sb & UPDATES):return False
    overlap=len(sa & sb)
    # Exact overlapping core with minor publisher differences only;
    # never collapse articles merely because they mention the same fighter.
    return overlap/len(sa|sb)>=.88 and overlap/min(len(sa),len(sb))>=.90

def quality(a):
    return (
      bool(a.get('image') and isinstance(a['image'],dict) and a['image'].get('url')),
      min(3,len(a.get('summaryPoints',[]) if isinstance(a.get('summaryPoints'),list) else [])),
      bool(a.get('sourceMethod') is None),  # favor direct publisher originals
      int(a.get('score') or 0),
      published(a) or datetime.min.replace(tzinfo=timezone.utc)
    )

def deduplicate(articles):
    """Return (kept, rejected) with reproducible editorial selection."""
    kept=[]; rejected=[]
    ordered=sorted(articles,key=quality,reverse=True)
    for a in ordered:
        winner=next((b for b in kept if duplicate_of(a,b)),None)
        if winner is None:kept.append(a)
        else:rejected.append({'url':a.get('url'),'title':a.get('title'),
                              'keptUrl':winner.get('url'),'reason':'same story'})
    return kept,rejected
