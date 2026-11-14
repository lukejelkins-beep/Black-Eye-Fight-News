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


# High-confidence event signatures catch differently worded reports about the
# *same development*. Never merge merely because two articles mention a fighter.
EVENT_PATTERNS={
 'contract-extension':r'\b(?:extension|extends?|re-signs?|renews?|renewal)\b',
 'fight-booking':r'\b(?:booked|scheduled|set to face|to fight|fight announced)\b',
 'withdrawal':r'\b(?:withdraws?|withdrawn|pulls? out)\b',
 'cancellation':r'\b(?:cancelled|canceled|called off)\b',
 'postponement':r'\b(?:postponed|delayed)\b',
 'retirement':r'\b(?:retired|retires|retirement)\b',
 'injury':r'\b(?:injured|injury|hospitalized|hospitalised)\b',
 'suspension':r'\b(?:suspended|suspension)\b'
}
GENERIC_SUBJECT=set(('ufc mma boxing fighter fighters announcer commentator broadcaster broadcast '
 'team long term multi year contract extension signs signed extends continue continues role '
 'years year deal major news official confirmed report announces announced fight bout match '
 'championship champion world title record breaking').split())
def event_kind(title):
    name=title.lower()
    for kind,pattern in EVENT_PATTERNS.items():
        if re.search(pattern,name):return kind
    return ''

def subject_terms(title):
    return set(title_terms(title))-GENERIC_SUBJECT

# The same fighter can sign with different promotions in one news cycle.
# Require a matching named promotion for the narrow reunion-signing match.
NAMED_PROMOTIONS=('ufc','pfl','rizin','ksw','bellator','bkfc','cage warriors')

def named_promotions(title):
    text=str(title or '').lower()
    return {p for p in NAMED_PROMOTIONS if re.search(r'\\b'+re.escape(p)+r'\\b',text)}

def same_event(a,b):
    kind=event_kind(a.get('title',''))
    if not kind or kind!=event_kind(b.get('title','')):return False
    # Rumours, offers and rejected proposals are not confirmed agreements.
    if headline_stage(a.get('title'))!=headline_stage(b.get('title')):return False
    if kind=='contract-extension':
        x,y=named_promotions(a.get('title')),named_promotions(b.get('title'))
        if x and y and x!=y:return False
    left,right=subject_terms(a.get('title','')),subject_terms(b.get('title',''))
    shared=left&right
    # Matching two rare subject tokens (e.g. 'jon'+'anik') plus the event type
    # is a stronger signal than generic sport/promotion overlap.
    if len(shared)<2:return False
    # Contract renewals have distinctive event semantics and should be grouped
    # even when the publishers phrase the duration differently.
    if kind=='contract-extension':
        return len(shared)>=2 and (len(shared)/min(len(left),len(right))>=.65)
    # Other incidents need a high subject overlap; protect follow-up angles.
    return len(shared)>=3 and len(shared)/min(len(left),len(right))>=.85

# High-confidence editorial rewrite matching. Keep different developments and
# different editorial formats, even when they mention the same UFC event.
BOILERPLATE=set(('ufc mma boxing pfl one rizin raf fight fights fighter fighters bout card '
 'title champion championship world heavyweight lightweight bantamweight featherweight '
 'middleweight welterweight event match vs versus news video live stream report reports '
 'official preview previews prediction predictions interview reaction recap highlights '
 'countdown conference press media day updates update coach conversation polymarket').split())

def distinctive(title):
    return set(title_terms(title))-BOILERPLATE-{w for w in title_terms(title) if w.isdigit()}

def headline_stage(title):
    t=str(title or '').lower()
    rules=[
      ('declined',r'\b(?:turns? down|declines?|rejects?)\b'),
      ('offered',r'\b(?:offered?|offer)\b'),
      ('meeting',r'\b(?:meeting|met with)\b'),
      ('withdrawal',r'\b(?:withdrawn|withdraws?|out of|pulls? out)\b'),
      ('cancelled',r'\b(?:cancelled|canceled|called off)\b'),
      ('postponed',r'\b(?:postponed|delayed)\b'),
      ('result',r'\b(?:knocked out|knockout|wins?|defeats?|stops?|submits?)\b'),
      ('unconfirmed',r'\b(?:rumou?rs?|reportedly|possible|could|may)\b')]
    return next((kind for kind,pattern in rules if re.search(pattern,t)),'')

def matching_return_signing(a,b):
    """Same confirmed fighter re-signing, described as a post-split signing.

    This is intentionally not a generic "signs" alias for extensions.
    """
    x,y=str(a.get('title') or ''),str(b.get('title') or '')
    resigned=lambda t: bool(re.search(r'\\bre-signs?\\b',t,re.I))
    after_split=lambda t: bool(re.search(
        r'\\bsigns?\\b.{0,100}\\bafter\\b.{0,70}\\b(?:split|hiatus|absence|departure)\\b',t,re.I))
    if not ((resigned(x) and after_split(y)) or (resigned(y) and after_split(x))):return False
    # Exclude unconfirmed claims, offers, rejections and unrelated follow-up bouts.
    if headline_stage(x) or headline_stage(y):return False
    if re.search(r'\\b(?:booked|scheduled|set to face|fight announced|to face)\\b',x+' '+y,re.I):
        return False
    roles=r'\\b(?:commentary|commentator|announcer|broadcast|analyst|coach|pundit)\\b'
    if bool(re.search(roles,x,re.I))!=bool(re.search(roles,y,re.I)):return False
    promo_x,promo_y=named_promotions(x),named_promotions(y)
    if not promo_x or promo_x!=promo_y:return False
    left,right=subject_terms(x),subject_terms(y)
    shared=left&right
    return bool(len(shared)>=2 and min(len(left),len(right)) and
                len(shared)/min(len(left),len(right))>=.65)

def reworded_headline(a,b):
    left,right=distinctive(a.get('title')),distinctive(b.get('title'))
    common=len(left&right)
    if common<5 or min(len(left),len(right))<5:return False
    if headline_stage(a.get('title'))!=headline_stage(b.get('title')):return False
    return common/min(len(left),len(right))>=.78 and common/len(left|right)>=.50

def matching_booking(a,b):
    def booking(t):
        return bool(re.search(r'\b(?:booked|added to|make (?:a |his |her )?(?:boxing |mma )?debut|scheduled|set to face|fight announced)\b',str(t or ''),re.I))
    left,right=distinctive(a.get('title')),distinctive(b.get('title'))
    common=len(left&right)
    return booking(a.get('title')) and booking(b.get('title')) and common>=4 and common/min(len(left),len(right))>=.70

def matching_event_media(a,b):
    def card(t):
        m=re.search(r'\b(?:ufc|pfl|raf|rizin)\s*[- ]?\d+\b',str(t or ''),re.I)
        return re.sub(r'[- ]+','',m.group(0).lower()) if m else ''
    def kind(t):
        t=str(t or '')
        return 'press-conference' if re.search(r'press[ -]?conference',t,re.I) else 'media-day' if re.search(r'media[ -]?day',t,re.I) else ''
    x,y=a.get('title',''),b.get('title','')
    return bool(card(x) and card(x)==card(y) and kind(x) and kind(x)==kind(y) and
                re.search(r'\b(?:video|stream|watch|live)\b',x,re.I) and
                re.search(r'\b(?:video|stream|watch|live)\b',y,re.I))

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
    if (same_event(a,b) or matching_return_signing(a,b) or reworded_headline(a,b)
            or matching_booking(a,b) or matching_event_media(a,b)):return True
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
