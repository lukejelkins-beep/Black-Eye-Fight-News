#!/usr/bin/env python3
"""Champion carousel photos: owner-supplied belt portraits -> assets/img/ufc-champions/<slug>.webp.

Usage: python3 scripts/build-ufc-champion-photos.py <manifest.json>
The manifest lists {"file": "<path to original>", "ownerName": "IMG_3115.png", "slug": "joshua-van"}.
Originals are not committed. Each output is 400x500 (4:5): scaled to 500 px tall, then centre-cropped
or padded to 400 px wide with the photo's own flat background, so no figure is stretched.
Screenshot marks (a text cursor, a white corner) are painted over with that background first.
"""
import hashlib, json, sys, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets/img/ufc-champions'
REGISTER = ROOT / 'data/ufc-champion-photo-register.json'
W, H = 400, 500

def trim(im):
    """Drop screenshot rows or columns along the edges that are mostly white (not part of the photo)."""
    def white(px): return min(px) > 200
    w, h = im.size
    while h > 10 and sum(white(im.getpixel((x, h - 1))) for x in range(w)) > w * 0.3: h -= 1
    while w > 10 and sum(white(im.getpixel((w - 1, y))) for y in range(h)) > h * 0.3: w -= 1
    return im.crop((0, 0, w, h))

def clean(im):
    """Paint over screenshot marks that are not part of the photo: any non-background pixel inside the
    top-left 40x40 corner (a text cursor) or the bottom-right 16x16 corner (a white corner)."""
    bg = im.getpixel((5, 5))
    px = im.load()
    w, h = im.size
    for x0, y0, x1, y1 in ((0, 0, 40, 40), (w - 16, h - 16, w, h)):
        for x in range(max(0, x0), min(w, x1)):
            for y in range(max(0, y0), min(h, y1)):
                if sum(abs(a - b) for a, b in zip(px[x, y], bg)) > 40:
                    px[x, y] = bg
    return im, bg

def build(src):
    im, bg = clean(trim(Image.open(src).convert('RGB')))
    w = round(im.width * H / im.height)
    im = im.resize((w, H), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H), bg)
    if w >= W:
        left = (w - W) // 2
        canvas.paste(im.crop((left, 0, left + W, H)))
    else:
        canvas.paste(im, ((W - w) // 2, 0))
    return canvas, bg

def main():
    items = json.loads(pathlib.Path(sys.argv[1]).read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    reg = json.loads(REGISTER.read_text()) if REGISTER.exists() else {}
    rows = {r['slug']: r for r in reg.get('photos', [])}
    for it in items:
        src = pathlib.Path(it['file'])
        out, bg = build(src)
        dest = OUT / (it['slug'] + '.webp')
        out.save(dest, 'WEBP', quality=86, method=6)
        rows[it['slug']] = {
            'slug': it['slug'], 'name': it['name'], 'file': str(dest.relative_to(ROOT)),
            'width': W, 'height': H, 'background': '#%02x%02x%02x' % bg,
            'ownerFileName': it['ownerName'], 'originalSha256': hashlib.sha256(src.read_bytes()).hexdigest(),
            'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(),
            'credit': 'UFC', 'rights': 'owner-supplied', 'suppliedOn': it['suppliedOn'],
            'identityBasis': it['identityBasis'], 'ownerConfirmedIdentity': False,
        }
    reg.update({
        'schema': 'befn-ufc-champion-photos-v1',
        'use': 'MMA Overview champion carousel',
        'rightsNote': 'Official UFC champion portraits supplied by the owner in chat on 2026-11-25 "for the champion carousel". '
                      'Recorded as owner-supplied; the owner is asked to confirm the rights basis in the PR.',
        'photos': sorted(rows.values(), key=lambda r: r['slug']),
    })
    REGISTER.write_text(json.dumps(reg, indent=2, ensure_ascii=False) + '\n')
    print('wrote', len(items), 'photos')

if __name__ == '__main__':
    main()
