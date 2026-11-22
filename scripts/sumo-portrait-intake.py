#!/usr/bin/env python3
"""Automatic intake of official JSA rikishi portraits (owner approved 2026-11-19).

For every tracked wrestler without an approved portrait, and for a rotating batch of
wrestlers that already have one (to pick up new official photos), this script:
  1. reads the wrestler's public JSA profile page at the roster's officialNskId;
  2. checks the page's shikona and stable match the roster entry (fails closed otherwise);
  3. downloads the 270x474 official portrait, checks it is a real JPEG of that size;
  4. records it in data/sumo/approved-photos.json with source, credit, licence and hash;
  5. makes the display cut-out (scripts/sumo-cutout.py) or records it as a headshot.

Polite: one request at a time, 2 s apart, honest User-Agent, small daily volume.
If the JSA site refuses or redirects the request, the run stops and changes nothing.

Usage:
  sumo-portrait-intake.py [--update-batch N] [--dry-run] [--only SOURCE_ID]
Requires: pillow; rembg[cpu] for cut-outs (not needed with --dry-run).
"""
import argparse, datetime, hashlib, html, importlib.util, io, json, os, re, sys, time
import urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = 'BEFN-sumo-portrait-intake/1.0 (+https://blackeyefightnews.com.au)'
PROFILE = 'https://www.sumo.or.jp/EnSumoDataRikishi/profile/{}/'
SITE = 'https://www.sumo.or.jp'
LICENSE = ('Official JSA portrait — permission attested by BEFN operator, 2026-11-16; '
           'automated intake approved by owner, 2026-11-19')
PORTRAIT_RE = re.compile(r'<img[^>]+src="(/img/sumo_data/rikishi/270x474/(\d+)\.jpg)"[^>]*class="col1"', re.I)
NAME_RE = re.compile(r'<td[^>]*class="fntXL"[^>]*>\s*([^<]+?)\s*</td>', re.I)
STABLE_RE = re.compile(r'<th>\s*Stable\s*</th>\s*<td>\s*(?:<a[^>]*>)?\s*([^<]+?)\s*(?:</a>)?\s*</td>', re.I)


class Blocked(Exception):
    """The JSA site refused or redirected us; stop without changing anything."""


def parse_profile(page):
    """Return {'portraitPath','portraitId','name','stable'} from a JSA profile page, or None."""
    m = PORTRAIT_RE.search(page)
    if not m:
        return None
    name = NAME_RE.search(page)
    stable = STABLE_RE.search(page)
    return {'portraitPath': m.group(1), 'portraitId': m.group(2),
            'name': html.unescape(name.group(1)).strip() if name else None,
            'stable': html.unescape(stable.group(1)).strip() if stable else None}


def _norm(text):
    return re.sub(r'[^a-z]', '', str(text or '').lower().replace('ō', 'o').replace('ū', 'u'))


def identity_ok(parsed, rikishi):
    """The page's ring name (first word of the full name) must equal the roster shikona,
    and the stable must match when both are known."""
    if not parsed or not parsed.get('name'):
        return False
    if _norm(parsed['name'].split()[0]) != _norm(rikishi.get('shikonaEn')):
        return False
    if parsed.get('stable') and rikishi.get('heya') and _norm(parsed['stable']) != _norm(rikishi['heya']):
        return False
    return True


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            if '/Mischief' in res.geturl() or not res.geturl().startswith(SITE):
                raise Blocked('redirected to ' + res.geturl())
            data = res.read()
    except urllib.error.HTTPError as error:
        if error.code in (403, 429, 503):
            raise Blocked('HTTP ' + str(error.code))
        raise
    return data if binary else data.decode('utf-8', errors='replace')


def check_jpeg(data):
    from PIL import Image
    if data[:3] != b'\xff\xd8\xff':
        raise ValueError('not a JPEG')
    img = Image.open(io.BytesIO(data))
    img.verify()
    if Image.open(io.BytesIO(data)).size != (270, 474):
        raise ValueError('unexpected portrait size')


def load(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return json.load(f)


def save(path, obj):
    full = os.path.join(ROOT, path)
    with open(full + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write('\n')
    os.replace(full + '.tmp', full)


def cutout_module():
    spec = importlib.util.spec_from_file_location('sumo_cutout', os.path.join(ROOT, 'scripts/sumo-cutout.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--update-batch', type=int, default=24)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--only')
    args = ap.parse_args(argv)

    roster = load('data/sumo/rikishi-index.json')['rikishi']
    photos_doc = load('data/sumo/approved-photos.json')
    photos = photos_doc['bySourceId']
    cutouts = load('data/sumo/cutouts.json')
    status_path = 'data/sumo/portrait-intake-status.json'
    try:
        status = load(status_path)
    except FileNotFoundError:
        status = {'schemaVersion': 1, 'cursor': 0}

    by_id = {str(w['sourceId']): w for w in roster}
    if args.only:
        targets = [args.only]
    else:
        missing = [sid for sid in by_id if not (photos.get(sid) or {}).get('approved')]
        existing = sorted((sid for sid in by_id if sid not in missing), key=int)
        start = status.get('cursor', 0) % max(1, len(existing))
        batch = (existing[start:] + existing[:start])[:args.update_batch]
        status['cursor'] = start + len(batch)
        targets = missing + batch

    now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()
    result = {'checked': 0, 'added': [], 'updated': [], 'unchanged': 0, 'review': [], 'errors': []}
    cut = None
    for i, sid in enumerate(targets):
        w = by_id.get(sid)
        if not w or not w.get('officialNskId'):
            result['review'].append({'sourceId': sid, 'reason': 'no official JSA id in roster'})
            continue
        if i:
            time.sleep(2)
        profile_url = PROFILE.format(int(w['officialNskId']))
        try:
            parsed = parse_profile(fetch(profile_url))
            result['checked'] += 1
            if not parsed:
                result['review'].append({'sourceId': sid, 'reason': 'no portrait on JSA profile'})
                continue
            if not identity_ok(parsed, w):
                result['review'].append({'sourceId': sid, 'reason': 'JSA name/stable does not match roster',
                                         'jsaName': parsed.get('name'), 'jsaStable': parsed.get('stable')})
                continue
            source_url = SITE + parsed['portraitPath']
            old = photos.get(sid) or {}
            if old.get('approved') and old.get('sourceUrl') == source_url:
                result['unchanged'] += 1
                continue
            time.sleep(2)
            data = fetch(source_url, binary=True)
            check_jpeg(data)
            digest = hashlib.sha256(data).hexdigest()
            if old.get('sha256') == digest:
                result['unchanged'] += 1
                continue
            if args.dry_run:
                (result['updated'] if old.get('approved') else result['added']).append(sid)
                continue
            rel = 'assets/sumo-photos/jsa-' + sid + '.jpg'
            with open(os.path.join(ROOT, rel), 'wb') as f:
                f.write(data)
            photos[sid] = {
                'approved': True, 'path': rel, 'name': w.get('shikonaEn'), 'sourceId': int(sid),
                'officialNskId': int(w['officialNskId']), 'license': LICENSE,
                'credit': 'Japan Sumo Association', 'sourceUrl': source_url, 'profileUrl': profile_url,
                'sha256': digest, 'changes': 'Original official JPEG; CSS may crop',
                'identityBasis': 'JSA profile at roster officialNskId; ring name and stable match roster (automated check)',
                'intake': {'method': 'automated', 'at': now}}
            cut = cut or cutout_module()
            cut_rel = 'assets/sumo-photos/cutout/jsa-' + sid + '.webp'
            cutouts['headshotOrPartial'] = [x for x in cutouts.get('headshotOrPartial', []) if x != sid]
            try:
                cut.cutout(os.path.join(ROOT, rel), os.path.join(ROOT, cut_rel))
                cutouts['bySourceId'][sid] = {'path': cut_rel, 'sourceSha256': digest,
                                              'bytes': os.path.getsize(os.path.join(ROOT, cut_rel))}
            except ValueError:
                cutouts['bySourceId'].pop(sid, None)
                cutouts['headshotOrPartial'].append(sid)
                if os.path.exists(os.path.join(ROOT, cut_rel)):
                    os.remove(os.path.join(ROOT, cut_rel))
            (result['updated'] if old.get('approved') else result['added']).append(sid)
        except Blocked as error:
            result['blocked'] = str(error)[:160]
            break
        except Exception as error:
            result['errors'].append({'sourceId': sid, 'error': str(error)[:160]})

    if not args.dry_run:
        save('data/sumo/approved-photos.json', photos_doc)
        cutouts['headshotOrPartial'] = sorted(set(cutouts.get('headshotOrPartial', [])), key=int)
        save('data/sumo/cutouts.json', cutouts)
        status.update({'lastRun': now, 'lastResult': result})
        save(status_path, status)
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    sys.exit(main())
