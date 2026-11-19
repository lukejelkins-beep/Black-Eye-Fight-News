#!/usr/bin/env python3
"""Make transparent cut-out WebPs from approved full-body JSA studio portraits.

Display-only derivatives; the originals are never edited. Uses the isnet-general-use
person/object segmentation model through rembg (free, runs offline once the model is
downloaded). The JSA copyright strip at the foot of each portrait is cleared from the
cut-out; the credit stays with the original and is shown on the page.

Usage:
  sumo-cutout.py in.jpg out.webp            one portrait (exits with an error if not full-body)
  sumo-cutout.py --all                      every approved portrait -> data/sumo/cutouts.json
Requires: pip install "rembg[cpu]" pillow
"""
import json, os, sys
import numpy as np
from PIL import Image
import rembg

MODEL = 'isnet-general-use'
FOOTER = 0.045  # bottom share of a 270x474 JSA portrait always holding the (C) line
TEXT_BAND = 0.08  # band where the (C) line may start
_session = None


def cutout(src, dst):
    global _session
    _session = _session or rembg.new_session(MODEL)
    img = Image.open(src).convert('RGB')
    out = rembg.remove(img, session=_session, post_process_mask=True)
    w, h = out.size
    a = np.array(out.getchannel('A'))
    a[int(h * (1 - FOOTER)):] = 0
    # The (C) line can start a little higher on some portraits: in the bottom band,
    # drop near-black pixels (the text), which never match skin, fringe or apron edges there.
    band = int(h * (1 - TEXT_BAND))
    lum = np.array(img.convert('L'))
    a[band:][lum[band:] < 100] = 0
    alpha = Image.fromarray(a)
    out.putalpha(alpha)
    box = alpha.getbbox()
    if not box or not is_full_body(out.crop(box), h):
        raise ValueError('not a clean full-body figure (headshot portrait or partial segmentation)')
    out.crop(box).save(dst, 'WEBP', quality=88, method=6)


def is_full_body(cut, source_height):
    """Only clean full-body figures are used as cut-outs; headshots use the original photo.
    A full-body figure spans most of the portrait height, stands on two narrow feet,
    and has a head much narrower than the whole figure."""
    a = np.array(cut.getchannel('A')) > 128
    h, w = a.shape
    tall = h >= 0.8 * source_height
    feet = a[int(h * 0.97):].any(0).mean() < 0.8
    head = a[int(h * 0.10)].mean() < 0.45
    return bool(tall and feet and head)


def build_all(root):
    approved = json.load(open(os.path.join(root, 'data/sumo/approved-photos.json')))['bySourceId']
    manifest = {
        'schemaVersion': 2,
        'description': 'Transparent cut-out derivatives of approved full-body JSA portraits, made by '
                       'scripts/sumo-cutout.py with the ' + MODEL + ' segmentation model. Display only; '
                       'originals unchanged. Credit stays with the original (Japan Sumo Association).',
        'model': MODEL,
        'bySourceId': {},
        'headshotOrPartial': []}
    failed = []
    for sid, src in sorted(approved.items(), key=lambda kv: int(kv[0])):
        if not src.get('approved'):
            continue
        rel = 'assets/sumo-photos/cutout/jsa-' + sid + '.webp'
        try:
            cutout(os.path.join(root, src['path']), os.path.join(root, rel))
        except ValueError:  # headshot or partial: the page shows the original photo instead
            manifest['headshotOrPartial'].append(sid)
            if os.path.exists(os.path.join(root, rel)):
                os.remove(os.path.join(root, rel))
            continue
        except Exception as error:
            failed.append((sid, str(error)[:120]))
            continue
        manifest['bySourceId'][sid] = {'path': rel, 'sourceSha256': src['sha256'],
                                       'bytes': os.path.getsize(os.path.join(root, rel))}
    with open(os.path.join(root, 'data/sumo/cutouts.json'), 'w') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(len(manifest['bySourceId']), 'full-body cut-outs;', len(manifest['headshotOrPartial']), 'headshot/partial;', len(failed), 'failed', failed)
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    if sys.argv[1:] == ['--all']:
        build_all(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    elif len(sys.argv) == 3:
        cutout(sys.argv[1], sys.argv[2])
    else:
        sys.exit(__doc__)
