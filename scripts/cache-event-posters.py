#!/usr/bin/env python3
"""Download official event posters once, store BEFN-hosted copies, and record them.

The owner holds permission to republish official event posters (decided
2026-11-19, docs/design/DECISIONS.md). This job:
  1. reads the poster links already recorded for upcoming cards
     (data/upcoming-cards.json), eye-checked finds (data/poster-intake.json)
     and past cards (data/historical-posters.json);
  2. downloads each poster that is not cached yet (images only, size-capped);
  3. saves a resized WebP to assets/img/posters/<event-id>-<portrait|landscape>.webp;
  4. records source page, image URL, credit, rights, size and checksum in
     data/poster-register.json and writes assets/local-posters.js for the pages.
Originals are never committed. Run: python scripts/cache-event-posters.py [--limit N]
"""
import argparse, datetime as dt, hashlib, io, json, re, sys, urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'assets/img/posters'
REGISTER = ROOT / 'data/poster-register.json'
MAP_JS = ROOT / 'assets/local-posters.js'
MAX_BYTES = 8_000_000
WIDTH = {'portrait': 900, 'landscape': 1280}
RIGHTS = 'owner-cleared: official promotional poster, republished with the owner\'s permission'
SAFE_ID = re.compile(r'^[a-z0-9][a-z0-9-]{2,120}$')


def candidates(root=ROOT):
    """Yield (event_id, kind, image_url, source_page, credit) for every recorded poster."""
    upcoming = json.loads((root / 'data/upcoming-cards.json').read_text())
    for e in upcoming.get('events', []):
        for field, kind in (('posterPortrait', 'portrait'), ('posterList', 'portrait'), ('posterLandscape', 'landscape'), ('poster', 'landscape')):
            p = e.get(field)
            if isinstance(p, dict) and p.get('url'):
                yield e['id'], kind, p['url'], p.get('source') or e.get('source', ''), p.get('credit', '')
    # Posters found and checked by eye for cards with no poster link in the schedule
    # (scripts/source-event-posters.py, owner attestation 2026-11-24). Kept apart from
    # upcoming-cards.json, which other jobs rewrite often.
    intake_path = root / 'data/poster-intake.json'
    if intake_path.exists():
        for event_id, items in json.loads(intake_path.read_text()).get('events', {}).items():
            for p in items if isinstance(items, list) else [items]:
                if isinstance(p, dict) and p.get('url'):
                    yield event_id, p.get('orientation') or 'landscape', p['url'], p.get('source', ''), p.get('credit', '')
    hist_path = root / 'data/historical-posters.json'
    if hist_path.exists():
        for event_id, p in json.loads(hist_path.read_text()).get('events', {}).items():
            if isinstance(p, dict) and p.get('url'):
                yield event_id, 'portrait' if p.get('kind') == 'poster' else 'landscape', p['url'], p.get('source', ''), p.get('credit', '')


def process(raw, kind):
    """Return (webp_bytes, width, height, orientation) or raise ValueError."""
    img = Image.open(io.BytesIO(raw))
    img.load()
    if img.width < 200 or img.height < 200:
        raise ValueError('image too small')
    orientation = 'portrait' if img.height >= img.width * 0.95 else 'landscape'
    img = img.convert('RGB')
    target = WIDTH[orientation]
    if img.width > target:
        img = img.resize((target, round(img.height * target / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=80, method=6)
    return buf.getvalue(), img.width, img.height, orientation


def http_get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; BEFN-PosterCache/1.0)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        ctype = r.headers.get('Content-Type', '')
        if not ctype.startswith('image/'):
            raise ValueError('not an image: ' + ctype)
        body = r.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError('image too large')
        return body


def run(fetch=http_get, root=ROOT, limit=40, now=None):
    out_dir, register_path, map_path = root / 'assets/img/posters', root / 'data/poster-register.json', root / 'assets/local-posters.js'
    register = json.loads(register_path.read_text()) if register_path.exists() else {'schema': 1, 'events': {}, 'failed': {}}
    register.setdefault('failed', {})
    register.setdefault('seen', {})
    stamp = (now or dt.datetime.now(dt.timezone.utc)).isoformat(timespec='seconds')
    report, done = [], 0
    for event_id, kind, url, source, credit in candidates(root):
        if done >= limit or not SAFE_ID.match(event_id) or not url.startswith('https://'):
            continue
        entry = register['events'].setdefault(event_id, {})
        if url in register['seen'] or register['failed'].get(url, {}).get('attempts', 0) >= 3:
            continue
        done += 1
        try:
            webp, w, h, orientation = process(fetch(url), kind)
        except Exception as exc:
            fail = register['failed'].setdefault(url, {'eventId': event_id, 'attempts': 0})
            fail.update(attempts=fail['attempts'] + 1, lastError=type(exc).__name__ + ': ' + str(exc)[:120], lastTriedAt=stamp)
            report.append(f'failed: {event_id} {kind} ({fail["lastError"]})')
            continue
        register['seen'][url] = stamp
        register['failed'].pop(url, None)
        if orientation in entry:  # keep the first poster found for each shape
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        name = f'{event_id}-{orientation}.webp'
        (out_dir / name).write_bytes(webp)
        entry[orientation] = {'file': f'/assets/img/posters/{name}', 'imageUrl': url, 'source': source, 'credit': credit,
                              'rights': RIGHTS, 'width': w, 'height': h, 'sha256': hashlib.sha256(webp).hexdigest(), 'fetchedAt': stamp}
        report.append(f'cached: {event_id} {orientation} {w}x{h}')
    register['events'] = {k: v for k, v in register['events'].items() if v}
    register_path.write_text(json.dumps(register, ensure_ascii=False, indent=2, sort_keys=True) + '\n')
    page_map = {k: {o: {'url': v['file'].lstrip('/'), 'source': v['source'] or v['imageUrl'], 'credit': v['credit'], 'width': v['width'], 'height': v['height']}
                    for o, v in shapes.items()} for k, shapes in sorted(register['events'].items())}
    map_path.write_text('/* Generated by scripts/cache-event-posters.py. BEFN-hosted official posters by event id. */\n'
                        'window.BEFNLocalPosters=' + json.dumps(page_map, ensure_ascii=False, separators=(',', ':')) + ';\n')
    return report


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=40, help='maximum downloads per run')
    args = ap.parse_args()
    report = run(limit=args.limit)
    print('\n'.join(report) or 'No new posters to cache')
