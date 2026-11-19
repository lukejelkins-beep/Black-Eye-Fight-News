#!/usr/bin/env python3
"""Move finished PFL, ONE and Cage Warriors cards from Upcoming into Results.

Sources (free, no key):
- PFL: the Wikipedia article for each event, found through the season page
  ("2026 in Professional Fighters League"). ESPN's feed was tried first but
  refuses requests from GitHub's servers (HTTP 403); its parser stays for reference.
- ONE Championship and Cage Warriors: the Wikipedia season page
  ("2026 in ONE Championship", "2026 in Cage Warriors").
Wikipedia text is CC BY-SA; every imported card links to its article as the source.

Rules (same as scripts/import-finished-ufc-results.py):
- Cards that finished 1 to 21 days ago and are not already in results.
- The source event must be within a day of the card's date and contain the
  card's headline bout, or at least two of its announced bouts, matched by
  both fighters' names (accents, punctuation and name order ignored).
- All finished bouts the source lists are imported, so the full card appears
  even when Upcoming only listed the headliners. A card still in progress waits.
- Existing results are never changed.
"""
import argparse, datetime as dt, json, re, sys, unicodedata, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / 'data/results.json'
UPCOMING = ROOT / 'data/upcoming-cards.json'
MAX_AGE_DAYS = 21
ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/mma/{league}/scoreboard?dates={day}'
ESPN_EVENT = 'https://site.web.api.espn.com/apis/common/v3/sports/mma/{league}/fightcenter/{event_id}'
ESPN_PAGE = 'https://www.espn.com/mma/fightcenter/_/id/{event_id}/league/{league}'
WIKI_API = 'https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext%7Crevid&page={page}'
WIKI_PAGE = 'https://en.wikipedia.org/wiki/{page}'
SOURCES = {
    'PFL': ('wikipedia-articles', 'Professional Fighters League'),
    'ONE Championship': ('wikipedia', 'ONE Championship'),
    'Cage Warriors': ('wikipedia', 'Cage Warriors'),
}
SPORTS = {'muay thai': 'Muay Thai', 'kickboxing': 'Kickboxing', 'mma': 'MMA', 'submission grappling': 'Grappling', 'grappling': 'Grappling', 'boxing': 'Boxing'}


# ---------- names and records ----------

def fold(text):
    return unicodedata.normalize('NFKD', str(text or '')).encode('ascii', 'ignore').decode().lower()


def name_key(name):
    """Order-insensitive key: 'Kim Su-hyeon' and 'Suhyeon Kim' match."""
    text = re.sub(r'\((?:c|ic)\)', '', fold(name))
    text = re.sub(r"[-'.]", '', text)
    return ' '.join(sorted(re.findall(r'[a-z0-9]+', text)))


def pair_key(a, b):
    return tuple(sorted((name_key(a), name_key(b))))


def surname(name):
    parts = name_key(name).split()
    return max(parts, key=len) if parts else ''


def same_person(x, y):
    """Exact match, or the longest part of one name appears in the other (Sergei/Sergey Bilostenniy)."""
    kx, ky = name_key(x), name_key(y)
    return kx == ky or (len(surname(x)) >= 4 and surname(x) in ky.split()) or (len(surname(y)) >= 4 and surname(y) in kx.split())


def same_bout(p, q):
    """Same two fighters: one name exact and the other at least sharing its longest part."""
    (a1, b1), (a2, b2) = p, q
    if pair_key(a1, b1) == pair_key(a2, b2):
        return True
    return any(name_key(x) == name_key(u) and same_person(y, v) or name_key(y) == name_key(v) and same_person(x, u)
               for (x, y), (u, v) in (((a1, b1), (a2, b2)), ((a1, b1), (b2, a2))))


def slug(name):
    return re.sub(r'[^a-z0-9]', '', fold(name))


def record_after(pre, result):
    nums = [int(x) for x in re.findall(r'\d+', str(pre or ''))[:3]]
    if len(nums) < 2:
        return None, None
    nums += [0] * (3 - len(nums))
    pre_text = '-'.join(map(str, nums))
    if result == 'win':
        nums[0] += 1
    elif result == 'loss':
        nums[1] += 1
    elif result == 'draw':
        nums[2] += 1
    return pre_text, '–'.join(map(str, nums))


def tidy_method(text):
    """'Decision (unanimous) (30–27, ...)' -> 'unanimous decision'; 'Decision - Split' -> 'split decision'."""
    text = re.sub(r'\s+', ' ', str(text or '')).strip()
    m = re.match(r'(?i)^decision\s*(?:-\s*|\()\s*([a-z ]+?)\)?(?:\s*\(.*)?$', text)
    if m:
        return m.group(1).strip().lower() + ' decision'
    text = re.sub(r'\s*\((?:\d+[–-]\d+[^)]*)\)\s*$', '', text)  # judges' scores
    return text


# ---------- ESPN (PFL) ----------

def parse_espn_event(detail, league):
    event = detail.get('event') or {}
    bouts, cards = [], list((detail.get('cards') or {}).values())
    for index, card in enumerate(cards):
        for c in sorted(card.get('competitions', []), key=lambda c: c.get('matchNumber') or 0):
            status = c.get('status') or {}
            comps = sorted(c.get('competitors', []), key=lambda x: x.get('order') or 0)
            if len(comps) != 2:
                continue
            names = [x.get('athlete', {}).get('displayName', '') for x in comps]
            done = bool((status.get('type') or {}).get('completed'))
            method = ((status.get('result') or {}).get('displayName') or '').strip()
            low = method.lower()
            if low.startswith('draw') or ' draw' in low:
                outcome, winner = 'draw', None
            elif 'no contest' in low:
                outcome, winner = 'no contest', None
            else:
                winner = next((i for i, x in enumerate(comps) if x.get('winner')), None)
                outcome = 'win' if winner is not None else None
            bouts.append({'fighters': names, 'done': done and outcome is not None, 'winner': winner, 'outcome': outcome,
                          'method': tidy_method(method) if method else 'Method not published by source',
                          'round': status.get('period'), 'time': status.get('displayClock'),
                          'division': ((c.get('type') or {}).get('text') or '').strip(),
                          'section': 'Main card' if index == 0 else 'Prelims', 'session': None, 'sport': 'MMA'})
    return {'name': event.get('name', ''), 'date': str(event.get('date', ''))[:10],
            'location': (detail.get('venue') or {}).get('displayNameLocation', ''),
            'url': ESPN_PAGE.format(event_id=event.get('id'), league=league), 'label': 'ESPN fight center', 'bouts': bouts}


def espn_events(fetch, league, day):
    events, seen = [], set()
    for offset in (-1, 0, 1):
        d = (day + dt.timedelta(days=offset)).strftime('%Y%m%d')
        board = json.loads(fetch(ESPN_SCOREBOARD.format(league=league, day=d)))
        for e in board.get('events', []):
            if e.get('id') in seen:
                continue
            seen.add(e.get('id'))
            events.append(parse_espn_event(json.loads(fetch(ESPN_EVENT.format(league=league, event_id=e['id']))), league))
    return events


# ---------- Wikipedia (ONE, Cage Warriors) ----------

def wiki_clean(text):
    text = re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>', '', str(text or ''), flags=re.S)
    text = re.sub(r'\{\{flagicon\|[^}]*\}\}', '', text)
    text = re.sub(r'\{\{(?:nowrap|small)\|([^}]*)\}\}', r'\1', text)
    text = re.sub(r'\{\{[^{}]*\}\}', '', text)
    text = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]*)\]\]', r'\1', text)
    text = re.sub(r"'{2,}", '', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'^\s*(?:align|style)\s*=\s*"?[a-z: ;-]*"?\s*\|', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def wiki_sections(wikitext):
    """Yield (title, text) for each level-2 section."""
    parts = re.split(r'^==\s*([^=].*?)\s*==\s*$', wikitext, flags=re.M)
    for i in range(1, len(parts) - 1, 2):
        yield parts[i].strip(), parts[i + 1]


def wiki_bout(cells, card_title, card_index):
    if len(cells) < 7:
        return None
    weight, a, verdict, b, method, rnd, time = [wiki_clean(c) for c in cells[:7]]
    a, b = re.sub(r'\s*\((?:c|ic)\)\s*$', '', a), re.sub(r'\s*\((?:c|ic)\)\s*$', '', b)
    if not a or not b or not method:
        return None
    low, verdict = method.lower(), verdict.lower()
    if 'no contest' in low:
        outcome, winner = 'no contest', None
    elif low.startswith('draw'):
        outcome, winner = 'draw', None
    elif verdict.startswith('def'):
        outcome, winner = 'win', 0
    else:
        return None
    sport = 'MMA'
    for suffix, label in SPORTS.items():
        if fold(weight).endswith(suffix):
            sport, weight = label, weight[:-len(suffix)].strip()
            break
    title = re.sub(r'\s*\(.*\)\s*$', '', card_title).strip()
    inner = title.lower().startswith('the inner circle')
    if 'no contest' in low:
        method = 'no contest' + (' ' + method[method.find('('):] if '(' in method else '')
    elif low.startswith('draw'):
        method = (re.search(r'\((\w+)\)', method).group(1).lower() + ' draw') if re.search(r'\((\w+)\)', method) else 'draw'
    else:
        method = tidy_method(method)
    return {'fighters': [a, b], 'done': True, 'winner': winner, 'outcome': outcome, 'method': method,
            'round': int(rnd) if rnd.isdigit() else None, 'time': time or None, 'division': weight, 'sport': sport,
            'section': 'The Inner Circle' if inner else ('Main card' if card_index == 0 else 'Prelims'),
            'session': ('The Inner Circle' if inner else 'ONE Friday Fights' if 'friday fights' in title.lower() else None)}


def parse_wiki_section(title, text, page_url):
    date = re.search(r'\{\{start date\|(\d{4})\|(\d{1,2})\|(\d{1,2})', text)
    if not date:
        return None
    day = dt.date(int(date.group(1)), int(date.group(2)), int(date.group(3)))
    venue = wiki_clean((re.search(r'^\|\s*venue\s*=(.*)$', text, re.M) or [None, ''])[1])
    city = wiki_clean((re.search(r'^\|\s*city\s*=(.*)$', text, re.M) or [None, ''])[1])
    found = re.search(r'^==+\s*Results\s*==+\s*$', text, re.M)
    results = text[found.start():] if found else text
    bouts = []
    if '{{MMAevent bout' in results:  # template layout (Cage Warriors)
        card_title, card_index = 'Main card', -1
        for m in re.finditer(r'\{\{MMAevent card\|([^|}]*)|\{\{MMAevent bout\s*\n(.*?)\n\}\}', results, re.S):
            if m.group(1) is not None:
                card_title, card_index = m.group(1), card_index + 1
                continue
            cells = [line[1:] for line in m.group(2).split('\n') if line.startswith('|')]
            bout = wiki_bout(cells, card_title, max(card_index, 0))
            if bout:
                bouts.append(bout)
    else:  # wikitable layout (ONE)
        for card_index, table in enumerate(re.findall(r'\{\|(.*?)\n\|\}', results, re.S)):
            caption = re.search(r"'''(.*?)'''", table)
            for row in table.split('\n|-')[1:]:
                cells = [line[1:] for line in row.strip().split('\n') if line.startswith('|') and not line.startswith('|-')]
                bout = wiki_bout(cells, caption.group(1) if caption else '', card_index)
                if bout:
                    bouts.append(bout)
    return {'name': title, 'date': day.isoformat(), 'location': ', '.join(x for x in (venue, city) if x),
            'url': page_url + '#' + urllib.parse.quote(title.replace(' ', '_')), 'label': 'Wikipedia (CC BY-SA)', 'bouts': bouts}


def wiki_events(fetch, name, day):
    page = f'{day.year} in {name}'
    data = json.loads(fetch(WIKI_API.format(page=urllib.parse.quote(page))))
    wikitext = data['parse']['wikitext']['*']
    url = WIKI_PAGE.format(page=urllib.parse.quote(page.replace(' ', '_')))
    events = [parse_wiki_section(t, body, url) for t, body in wiki_sections(wikitext)]
    return [e for e in events if e and e['bouts']]


MONTHS = {m: i for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}


def wiki_article_events(fetch, name, day):
    """Events with their own article, listed on the season page next to a {{dts}} date."""
    page = f'{day.year} in {name}'
    season = json.loads(fetch(WIKI_API.format(page=urllib.parse.quote(page))))['parse']['wikitext']['*']
    events = []
    rows = re.findall(r'\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]\s*\n\|\s*\{\{dts\|(\d{4})\|([A-Za-z]{3})[a-z]*\|(\d{1,2})\}\}', season)
    for link, y, mon, d in rows:
        if mon.lower() not in MONTHS or abs((dt.date(int(y), MONTHS[mon.lower()], int(d)) - day).days) > 1:
            continue
        article = json.loads(fetch(WIKI_API.format(page=urllib.parse.quote(link))))['parse']['wikitext']['*']
        event = parse_wiki_section(link, article, WIKI_PAGE.format(page=urllib.parse.quote(link.replace(' ', '_'))))
        if event and event['bouts']:
            event['url'] = event['url'].split('#')[0]
            events.append(event)
    return events


# ---------- matching and building ----------

def match_event(card, events):
    day = dt.date.fromisoformat(card['date'])
    pairs = [b['fighters'] for b in card.get('bouts', []) if len(b.get('fighters', [])) == 2]
    best, best_score = None, 0
    for e in events:
        try:
            if abs((dt.date.fromisoformat(e['date']) - day).days) > 1:
                continue
        except ValueError:
            continue
        found = [any(same_bout(p, b['fighters']) for b in e['bouts']) for p in pairs]
        score = sum(found)
        headline = bool(found) and found[0]
        if (headline or score >= 2) and score > best_score:
            best, best_score = e, score
    return best


def build(card, event):
    if not event['bouts'] or not all(b['done'] for b in event['bouts']):
        return None, 'card still in progress at source'
    announced = [b for b in card.get('bouts', []) if len(b.get('fighters', [])) == 2]
    rows = []
    for order, src in enumerate(event['bouts']):
        a, b = src['fighters']
        mine = next((m for m in announced if same_bout(m['fighters'], (a, b))), None)
        if mine and not same_person(mine['fighters'][0], a) and same_person(mine['fighters'][0], b):  # keep BEFN's corner order
            a, b = b, a
            src = dict(src, fighters=[a, b], winner=None if src['winner'] is None else 1 - src['winner'])
        if mine:  # keep BEFN's spelling of the names
            a, b = mine['fighters']
        outs = ['draw', 'draw'] if src['outcome'] == 'draw' else ['no contest'] * 2 if src['outcome'] == 'no contest' else \
            ['win', 'loss'] if src['winner'] == 0 else ['loss', 'win']
        fighters = []
        for i, name in enumerate((a, b)):
            f = {'name': name}
            if mine:
                records, sources = mine.get('records') or [], mine.get('recordSources') or []
                pre, post = record_after(records[i] if i < len(records) else None, outs[i])
                if pre:
                    f.update(preRecord=pre, record=post, recordNote='Calculated from the sourced pre-fight record and this confirmed result.')
                    if i < len(sources):
                        f.update(preRecordSource=sources[i], recordSource=sources[i])
            fighters.append(f)
        row = {'id': f"{card['id']}-{slug(a)}", 'eventId': card['id'], 'event': card['title'], 'sport': src['sport'],
               'date': card['date'], 'location': event['location'] or card.get('location', ''),
               'division': src['division'] or (mine or {}).get('division', ''), 'fighters': fighters, 'winner': src['winner'],
               'method': src['method'], 'round': src['round'], 'time': src['time'], 'source': event['url'],
               'section': src['section'], 'order': order, 'status': 'completed', 'highlights': None, 'summary': ''}
        if src.get('session'):
            row['session'] = src['session']
        rows.append(row)
    ids = [r['id'] for r in rows]
    if len(set(ids)) != len(ids):
        return None, 'duplicate fighter ids'
    main = rows[0]
    if main['winner'] in (0, 1):
        text = f"{main['fighters'][main['winner']]['name']} defeated {main['fighters'][1 - main['winner']]['name']} by {main['method']}."
    else:
        text = f"{main['fighters'][0]['name']} vs {main['fighters'][1]['name']} ended in a {main['method']}."
    result_event = {'id': card['id'], 'name': card['title'], 'date': card['date'], 'status': 'completed', 'feeds': [],
                    'takeaways': [{'text': text, 'source': event['url']}], 'featuredId': main['id'], 'mainBoutId': main['id'],
                    'expectedBouts': len(rows), 'sectionOrder': {'main': 'headliner-first', 'prelims': 'headliner-first'},
                    'partialCoverage': False, 'location': event['location'] or card.get('location', ''),
                    'source': event['url'], 'sourceVerified': event['label']}
    return (result_event, rows), None


def run(results, upcoming, fetch, today):
    known = {e['id'] for e in results['events']}
    due = [c for c in upcoming.get('events', []) if c.get('promotion') in SOURCES and c['id'] not in known
           and 1 <= (today - dt.date.fromisoformat(c['date'])).days <= MAX_AGE_DAYS]
    report, cache = [], {}
    for card in due:
        kind, key = SOURCES[card['promotion']]
        day = dt.date.fromisoformat(card['date'])
        cache_key = (kind, key, day.year if kind == 'wikipedia' else day)
        try:
            if cache_key not in cache:
                cache[cache_key] = {'espn': espn_events, 'wikipedia': wiki_events, 'wikipedia-articles': wiki_article_events}[kind](fetch, key, day)
        except Exception as exc:
            report.append(f"error: {card['title']} ({type(exc).__name__}: {str(exc)[:80]})")
            continue
        event = match_event(card, cache[cache_key])
        if not event:
            report.append(f"waiting: {card['title']} (not at source yet)")
            continue
        built, why = build(card, event)
        if not built:
            report.append(f"waiting: {card['title']} ({why})")
            continue
        result_event, rows = built
        results['events'].append(result_event)
        results['results'].extend(rows)
        known.add(card['id'])
        report.append(f"imported: {card['title']} ({len(rows)} bouts from {event['label']})")
    return results, report


def http_fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'BEFN-Results-Importer/1.0 (https://black-eye-fight-news.onrender.com)'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read(6_000_000).decode('utf-8')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    results = json.loads(RESULTS.read_text())
    upcoming = json.loads(UPCOMING.read_text())
    updated, report = run(results, upcoming, http_fetch, dt.datetime.now(dt.timezone.utc).date())
    print('\n'.join(report) or 'No finished PFL, ONE or Cage Warriors cards waiting for results')
    if any(line.startswith('imported') for line in report) and not args.dry_run:
        RESULTS.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + '\n')
