#!/usr/bin/env python3
"""Move finished UFC cards from data/upcoming-cards.json into data/results.json.

Sources (both free, no key):
- Preferred: the UFCStats.com CSV export maintained at
  https://github.com/Greco1899/scrape_ufc_stats. It carries the official method,
  round, clock, scheduled rounds and a link to each bout, but it is refreshed
  once a week (Sundays, about 18:00 UTC), so a Saturday card is a day late.
- Fallback: the card's own Wikipedia article, read with the same parser that
  already imports PFL, ONE and Cage Warriors (scripts/import-finished-results.py).
  Wikipedia carries the card within hours, so the site is not left showing a
  finished card as "awaiting confirmation" for a day.

Rules:
- Only UFC cards that finished 1 to 21 days ago and are not already in results.
- A bout is imported only when both fighter names match a bout the source lists
  for the same date (accents and punctuation ignored). Nothing is guessed.
- The card is imported only when its headline bout matched and at least 70% of
  its bouts matched; otherwise it waits for the next run.
- A card taken from Wikipedia is marked provisional and is replaced, once, by the
  UFCStats version when the export catches up. Any other existing result, and
  every highlight and summary already attached to a row, is never changed.
"""
import argparse, csv, datetime as dt, importlib.util, io, json, re, sys, unicodedata, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / 'data/results.json'
UPCOMING = ROOT / 'data/upcoming-cards.json'
REPO = 'https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/{branch}/{name}.csv'
SOURCE_LABEL = 'UFCStats.com via the Greco1899/scrape_ufc_stats CSV export'
MIN_SHARE = 0.7
MAX_AGE_DAYS = 21
SECTION = {'main': 'Main card', 'prelims': 'Prelims', 'early': 'Prelims'}
SHARED_WIKI = ROOT / 'scripts/import-finished-results.py'
WIKI_API = 'https://en.wikipedia.org/w/api.php?action=parse&format=json&redirects=1&prop=wikitext&page={page}'
WIKI_PAGE = 'https://en.wikipedia.org/wiki/{page}'
# A season-page row: the event's link, then a cell holding its {{dts}} date. UFC
# year pages carry both in rowspan cells, so the date may be on the next line.
WIKI_ROW = re.compile(r'\[\[([^\]|#\n]+)(?:\|[^\]\n]*)?\]\][^\n]*\n\|[^\n]*?'
                      r'\{\{dts\|(\d{4})\|([A-Za-z]{3})[a-z]*\|(\d{1,2})\}\}')
MONTHS = {m: i for i, m in enumerate(
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], 1)}
PROVISIONAL_NOTE = ('Imported from the event article on Wikipedia while the UFCStats export catches up; '
                    'replaced by the UFCStats version on a later run.')


def norm(name):
    text = unicodedata.normalize('NFKD', str(name or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]', '', text.lower())


def pair_key(a, b):
    return tuple(sorted((norm(a), norm(b))))


def parse_date(text):
    text = str(text or '').strip()
    for fmt in ('%B %d, %Y', '%Y-%m-%d', '%b %d, %Y'):
        try:
            return dt.datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    return None


def outcome(code):
    return {'w': 'win', 'l': 'loss', 'd': 'draw', 'nc': 'no contest'}.get(str(code or '').strip().lower())


def method_text(method, details):
    method, details = str(method or '').strip(), str(details or '').strip()
    low = method.lower()
    if low.startswith('decision'):
        kind = method.split('-', 1)[1].strip().lower() if '-' in method else ''
        return (kind + ' decision').strip()
    if not method:
        return 'Method not published by source'
    # Decision details hold judges' scores; finish details describe the finish.
    # UFCStats sometimes runs two descriptions together ("At DistanceWheel Kick"):
    # keep the first one.
    details = re.split(r'(?<=[a-z])(?=[A-Z])', details)[0].strip()
    if details and len(details) <= 40 and not re.search(r'\d+\s*-\s*\d+', details):
        return f'{method} ({details.lower()})'
    return method


def draw_text(method):
    kind = str(method or '').split('-', 1)[1].strip().lower() if '-' in str(method or '') else ''
    return f'{kind} draw' if kind in ('majority', 'split', 'unanimous') else 'draw'


def scheduled_rounds(time_format):
    match = re.match(r'\s*(\d+)\s*Rnd', str(time_format or ''))
    return int(match.group(1)) if match else None


def record_after(pre, result_for_fighter):
    nums = [int(x) for x in re.findall(r'\d+', str(pre or ''))[:3]]
    if len(nums) < 2:
        return None, None
    nums += [0] * (3 - len(nums))
    pre_text = '-'.join(map(str, nums))
    if result_for_fighter == 'win':
        nums[0] += 1
    elif result_for_fighter == 'loss':
        nums[1] += 1
    elif result_for_fighter == 'draw':
        nums[2] += 1
    return pre_text, '–'.join(map(str, nums))


def load_source(fetch):
    """Return {date: {pair_key: row}} from the UFCStats CSV export."""
    events = {row['EVENT'].strip(): row for row in csv.DictReader(io.StringIO(fetch('ufc_event_details')))}
    by_date = {}
    for row in csv.DictReader(io.StringIO(fetch('ufc_fight_results'))):
        event = events.get(str(row.get('EVENT', '')).strip())
        day = parse_date(event.get('DATE')) if event else None
        names = re.split(r'\s+vs\.?\s+', str(row.get('BOUT', '')).strip(), flags=re.I)
        outs = str(row.get('OUTCOME', '')).split('/')
        if not day or len(names) != 2 or len(outs) != 2:
            continue
        row = dict(row, _names=[n.strip() for n in names], _outs=[outcome(o) for o in outs],
                   _event_url=(event.get('URL') or '').replace('http://', 'https://'))
        by_date.setdefault(day, {})[pair_key(*names)] = row
    return by_date


def find_bout(by_date, day, a, b):
    for offset in (0, 1, -1):
        row = by_date.get(day + dt.timedelta(days=offset), {}).get(pair_key(a, b))
        if row:
            return row
    return None


def build_card(card, by_date):
    day = dt.date.fromisoformat(card['date'])
    bouts = [b for b in card.get('bouts', []) if len(b.get('fighters', [])) == 2 and not b.get('cancelled')]
    if not bouts:
        return None, 'no bouts'
    rows, event_url = [], ''
    for order, bout in enumerate(bouts):
        a, b = bout['fighters']
        src = find_bout(by_date, day, a, b)
        if not src:
            continue
        # Map UFCStats corners onto BEFN's order of names.
        flip = norm(src['_names'][0]) != norm(a)
        outs = src['_outs'][::-1] if flip else src['_outs']
        if outs[0] not in ('win', 'loss', 'draw', 'no contest'):
            continue
        winner = 0 if outs[0] == 'win' else 1 if outs[1] == 'win' else None
        fighters = []
        for i, name in enumerate((a, b)):
            fighter = {'name': name}
            records = bout.get('records') or []
            pre, post = record_after(records[i] if i < len(records) else None, outs[i])
            if pre:
                fighter.update(preRecord=pre, record=post, recordNote='Calculated from the sourced pre-fight record and this confirmed result.')
                sources = bout.get('recordSources') or []
                if i < len(sources):
                    fighter.update(preRecordSource=sources[i], recordSource=sources[i])
            fighters.append(fighter)
        event_url = event_url or src['_event_url']
        row = {
            'id': f"{card['id']}-{norm(a)}", 'eventId': card['id'], 'event': card['title'], 'sport': 'MMA',
            'date': card['date'], 'location': card.get('location', ''), 'division': bout.get('division') or src.get('WEIGHTCLASS', ''),
            'fighters': fighters, 'winner': winner,
            'method': draw_text(src.get('METHOD')) if outs[0] == 'draw' else 'no contest' if outs[0] == 'no contest' else method_text(src.get('METHOD'), src.get('DETAILS')),
            'round': int(src['ROUND']) if str(src.get('ROUND', '')).strip().isdigit() else None,
            'time': str(src.get('TIME', '')).strip() or None,
            'source': (src.get('URL') or '').replace('http://', 'https://'),
            'section': SECTION.get(bout.get('section'), 'Prelims'), 'order': order, 'status': 'completed',
            'highlights': None, 'summary': '',
        }
        rounds = scheduled_rounds(src.get('TIME FORMAT'))
        if rounds:
            row['scheduledRounds'] = rounds
        rows.append((bout, row))
    headline = bouts[0]
    if not any(bout is headline for bout, _ in rows):
        return None, 'headline bout not in source yet'
    if len(rows) < MIN_SHARE * len(bouts):
        return None, f'only {len(rows)} of {len(bouts)} bouts in source yet'
    main = rows[0][1]
    winner_name = main['fighters'][main['winner']]['name'] if main['winner'] in (0, 1) else None
    takeaway = (f"{winner_name} defeated {main['fighters'][1 - main['winner']]['name']} by {main['method']}."
                if winner_name else f"{main['fighters'][0]['name']} vs {main['fighters'][1]['name']} ended in a {main['method']}.")
    event = {
        'id': card['id'], 'name': card['title'], 'date': card['date'], 'status': 'completed', 'feeds': [],
        'takeaways': [{'text': takeaway, 'source': main['source']}],
        'featuredId': main['id'], 'mainBoutId': main['id'], 'expectedBouts': len(rows),
        'sectionOrder': {'main': 'headliner-first', 'prelims': 'headliner-first'},
        'partialCoverage': len(rows) < len(bouts), 'location': card.get('location', ''),
        'source': event_url or main['source'], 'sourceVerified': SOURCE_LABEL,
    }
    if len(rows) < len(bouts):
        event['archiveNote'] = f'{len(rows)} of {len(bouts)} announced bouts matched the official UFCStats results.'
    return (event, [row for _, row in rows]), None


def wiki_parser():
    """The Wikipedia event parser already used for PFL, ONE and Cage Warriors."""
    spec = importlib.util.spec_from_file_location('befn_shared_results', SHARED_WIKI)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def wiki_events_for(day, wiki_fetch, shared):
    """Parsed event articles listed against this date on the "<year> in UFC" page."""
    season = json.loads(wiki_fetch(WIKI_API.format(page=urllib.parse.quote(f'{day.year} in UFC'))))
    events = []
    seen = set()
    for link, year, month, number in WIKI_ROW.findall(season['parse']['wikitext']['*']):
        if month.lower() not in MONTHS or link in seen:
            continue
        listed = dt.date(int(year), MONTHS[month.lower()], int(number))
        if abs((listed - day).days) > 1:
            continue
        seen.add(link)
        article = json.loads(wiki_fetch(WIKI_API.format(page=urllib.parse.quote(link))))['parse']
        title = article.get('title') or link  # the season page links the numbered redirect
        event = shared.parse_wiki_section(title, article['wikitext']['*'],
                                          WIKI_PAGE.format(page=urllib.parse.quote(title.replace(' ', '_'))))
        if event and event['bouts']:
            event['url'] = event['url'].split('#')[0]
            events.append(event)
    return events


def announced_bouts(card):
    return [b for b in card.get('bouts', []) if len(b.get('fighters', [])) == 2 and not b.get('cancelled')]


def build_from_wikipedia(card, events, shared):
    """Build the card from its own Wikipedia article, under the same matching rules."""
    announced = announced_bouts(card)
    if not announced:
        return None, 'no bouts'
    day = dt.date.fromisoformat(card['date'])
    for event in events:
        if abs((dt.date.fromisoformat(event['date']) - day).days) > 1:
            continue
        listed = {pair_key(*b['fighters']) for b in event['bouts'] if len(b.get('fighters', [])) == 2}
        if pair_key(*announced[0]['fighters']) not in listed:
            continue
        matched = sum(1 for b in announced if pair_key(*b['fighters']) in listed)
        if matched < MIN_SHARE * len(announced):
            return None, f'only {matched} of {len(announced)} bouts on Wikipedia yet'
        built, why = shared.build(card, event)
        if not built:
            return None, why
        result_event, rows = built
        result_event['provisional'] = PROVISIONAL_NOTE
        for row in rows:
            row['provisional'] = True
        return (result_event, rows), None
    return None, 'the event article is not on Wikipedia yet'


def card_from_rows(event, rows):
    """A card shape rebuilt from a provisional import, so the UFCStats builder can replace it."""
    bouts = []
    for row in sorted(rows, key=lambda r: r.get('order', 0)):
        fighters = row.get('fighters') or []
        if len(fighters) != 2 or not all(f.get('name') for f in fighters):
            return None
        bout = {'fighters': [f['name'] for f in fighters], 'division': row.get('division') or '',
                'section': 'main' if row.get('section') == 'Main card' else 'prelims'}
        records = [f.get('preRecord') for f in fighters]
        sources = [f.get('preRecordSource') for f in fighters]
        if all(records):
            bout['records'] = records
        if all(sources):
            bout['recordSources'] = sources
        bouts.append(bout)
    return {'id': event['id'], 'date': event['date'], 'title': event['name'],
            'location': event.get('location', ''), 'promotion': 'UFC', 'bouts': bouts}


def replace_provisional(results, by_date):
    """Swap a provisional Wikipedia card for the UFCStats version once the export carries it."""
    report = []
    for index, event in enumerate(results['events']):
        if not event.get('provisional'):
            continue
        rows = [r for r in results['results'] if r.get('eventId') == event['id']]
        card = card_from_rows(event, rows)
        if not card:
            continue
        built, _ = build_card(card, by_date)
        if not built:
            continue
        fresh_event, fresh_rows = built
        if len(fresh_rows) < len(rows):
            continue  # never trade a fuller card for a thinner one
        previous = {pair_key(*[f['name'] for f in r['fighters']]): r for r in rows}
        for row in fresh_rows:  # work added to a row after the import is not lost
            was = previous.get(pair_key(*[f['name'] for f in row['fighters']]))
            for field in ('highlights', 'summary'):
                if was and was.get(field):
                    row[field] = was[field]
        results['events'][index] = fresh_event
        results['results'] = [r for r in results['results'] if r.get('eventId') != event['id']] + fresh_rows
        report.append(f"upgraded: {event['name']} to the UFCStats export ({len(fresh_rows)} bouts)")
    return report


def run(results, upcoming, fetch, today, wiki_fetch=None):
    known = {e['id'] for e in results['events']}
    known_names = {(e['date'], norm(e['name'])) for e in results['events']}
    due = [c for c in upcoming.get('events', [])
           if str(c.get('promotion', '')).upper() == 'UFC'
           and 1 <= (today - dt.date.fromisoformat(c['date'])).days <= MAX_AGE_DAYS
           and c['id'] not in known and (c['date'], norm(c['title'])) not in known_names]
    pending = any(e.get('provisional') for e in results['events'])
    report = []
    if not due and not pending:
        return results, report
    by_date = load_source(fetch)
    report += replace_provisional(results, by_date)
    waiting = []
    for card in due:
        built, why = build_card(card, by_date)
        if not built:
            waiting.append((card, why))
            continue
        event, rows = built
        results['events'].append(event)
        results['results'].extend(rows)
        report.append(f"imported: {card['title']} ({len(rows)} bouts)")
    shared = wiki_parser() if waiting and wiki_fetch else None
    for card, why in waiting:
        if not shared:
            report.append(f"waiting: {card['title']} ({why})")
            continue
        try:
            events = wiki_events_for(dt.date.fromisoformat(card['date']), wiki_fetch, shared)
        except Exception as exc:  # a source that is down must not fail the run
            report.append(f"waiting: {card['title']} ({why}; Wikipedia unavailable: {exc})")
            continue
        built, wiki_why = build_from_wikipedia(card, events, shared)
        if not built:
            report.append(f"waiting: {card['title']} ({why}; {wiki_why})")
            continue
        event, rows = built
        results['events'].append(event)
        results['results'].extend(rows)
        report.append(f"provisional: {card['title']} ({len(rows)} bouts from Wikipedia)")
    return results, report


def http_get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'BEFN-Results-Importer/1.0'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read(8_000_000).decode('utf-8', 'replace')


def http_fetch(name):
    last = None
    for branch in ('main', 'master'):
        req = urllib.request.Request(REPO.format(branch=branch, name=name), headers={'User-Agent': 'BEFN-Results-Importer/1.0'})
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                body = response.read(8_000_000)
                return body.decode('utf-8', 'replace')
        except Exception as exc:  # try the other default-branch name
            last = exc
    raise RuntimeError(f'{name}.csv unavailable: {last}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    results = json.loads(RESULTS.read_text())
    upcoming = json.loads(UPCOMING.read_text())
    today = dt.datetime.now(dt.timezone.utc).date()
    updated, report = run(results, upcoming, http_fetch, today, wiki_fetch=http_get)
    print('\n'.join(report) or 'No finished UFC cards waiting for results')
    if any(line.startswith(('imported', 'provisional', 'upgraded')) for line in report) and not args.dry_run:
        RESULTS.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + '\n')
