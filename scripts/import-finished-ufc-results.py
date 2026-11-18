#!/usr/bin/env python3
"""Move finished UFC cards from data/upcoming-cards.json into data/results.json.

Source: the free UFCStats.com CSV export maintained at
https://github.com/Greco1899/scrape_ufc_stats (no key, no request quota).

Rules:
- Only UFC cards that finished 1 to 21 days ago and are not already in results.
- A bout is imported only when both fighter names match a UFCStats bout on the
  same date (accents and punctuation ignored). Nothing is guessed.
- The card is imported only when its headline bout matched and at least 70% of
  its bouts matched; otherwise it waits for the next run.
- Existing results are never changed.
"""
import argparse, csv, datetime as dt, io, json, re, sys, unicodedata, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / 'data/results.json'
UPCOMING = ROOT / 'data/upcoming-cards.json'
REPO = 'https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/{branch}/{name}.csv'
SOURCE_LABEL = 'UFCStats.com via the Greco1899/scrape_ufc_stats CSV export'
MIN_SHARE = 0.7
MAX_AGE_DAYS = 21
SECTION = {'main': 'Main card', 'prelims': 'Prelims', 'early': 'Prelims'}


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
    if details and len(details) <= 40 and not re.search(r'\d+\s*-\s*\d+', details):
        return f'{method} ({details.lower()})'
    return method


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
            'method': 'draw' if outs[0] == 'draw' else 'no contest' if outs[0] == 'no contest' else method_text(src.get('METHOD'), src.get('DETAILS')),
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


def run(results, upcoming, fetch, today):
    known = {e['id'] for e in results['events']}
    known_names = {(e['date'], norm(e['name'])) for e in results['events']}
    due = [c for c in upcoming.get('events', [])
           if str(c.get('promotion', '')).upper() == 'UFC'
           and 1 <= (today - dt.date.fromisoformat(c['date'])).days <= MAX_AGE_DAYS
           and c['id'] not in known and (c['date'], norm(c['title'])) not in known_names]
    report = []
    if not due:
        return results, report
    by_date = load_source(fetch)
    for card in due:
        built, why = build_card(card, by_date)
        if not built:
            report.append(f"waiting: {card['title']} ({why})")
            continue
        event, rows = built
        results['events'].append(event)
        results['results'].extend(rows)
        report.append(f"imported: {card['title']} ({len(rows)} bouts)")
    return results, report


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
    updated, report = run(results, upcoming, http_fetch, today)
    print('\n'.join(report) or 'No finished UFC cards waiting for results')
    if any(line.startswith('imported') for line in report) and not args.dry_run:
        RESULTS.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + '\n')
