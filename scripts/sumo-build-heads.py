#!/usr/bin/env python3
"""Make transparent head-and-shoulders crops from the approved Sumo portraits.

Display-only derivatives for the head-to-head board: the studio background is
removed with the OpenCV segmentation in scripts/sumo-cutout-grabcut.py, then a square is
cropped around the head (topknot to just below the chin). Originals are never
edited and credit stays with the original (see data/sumo/approved-photos.json).

The head is found from the silhouette alone: the top of the mask is the
topknot, and the shoulders are the first rows that are much wider than the
head. JSA portraits are uniform studio shots, so this is reliable without face
detection; every crop is listed in data/sumo/heads.json with its box so a bad
one can be spotted and excluded.

Usage: python3 scripts/sumo-build-heads.py   (needs opencv-python-headless, numpy)
"""
import importlib.util, json, os, sys
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE = 192  # square output; shown at 48-96 CSS px
# Checked by eye on the contact sheet: the studio wall is a tile grid the matte
# cannot remove and the vignette fallback still shows it. These use the normal
# portrait in the page instead.
EXCLUDE = {'124': 'full-length shot on a tiled wall', '376': 'tiled wall shows through'}

spec = importlib.util.spec_from_file_location('cut', os.path.join(ROOT, 'scripts/sumo-cutout-grabcut.py'))
cut = importlib.util.module_from_spec(spec); spec.loader.exec_module(cut)


def head_box(alpha, full_w):
    h, w = alpha.shape
    fg = alpha > 128
    widths = fg.sum(1)
    rows = np.where(widths > 3)[0]
    if not len(rows):
        return None
    top = int(rows[0])
    # Two JSA formats: full-length studio portraits (small head near the top)
    # and close head-and-shoulders shots (face fills the frame width).
    probe = widths[min(h - 1, top + int(full_w * 0.15))]
    if probe > full_w * 0.45:
        # Face spans most of the frame: keep the full original width.
        xs = np.where(fg[top: top + int(full_w * 0.5)])[1]
        cx = int(np.median(xs)) if len(xs) else w // 2
        side = int(full_w * 0.98)
        return cx - side // 2, top - int(side * 0.04), side, 'close-up'
    # Full length. Head width: the wider rows of the face band below the topknot.
    band = widths[top + int(h * 0.03): top + int(h * 0.11)]
    if not len(band):
        return None
    head_w = int(np.median(np.sort(band)[-max(1, len(band) // 3):]))
    # Shoulders: first row below the face that is clearly wider than the head.
    start = top + int(h * 0.07)
    shoulders = next((y for y in range(start, min(h, top + int(h * 0.30)))
                      if widths[y] > head_w * 1.9), top + int(h * 0.17))
    # Centre on the face band, not the whole body (arms can be asymmetric).
    xs = np.where(fg[top + int(h * 0.04): shoulders])[1]
    cx = int(np.median(xs)) if len(xs) else w // 2
    side = int(max((shoulders - top) * 1.25, head_w * 1.6))
    return cx - side // 2, top - int(side * 0.06), side, 'full-length'


def crop(img, box):
    x0, y0, side = box[:3]
    h, w = img.shape[:2]
    canvas = np.zeros((side, side, 4), np.uint8)
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(w, x0 + side), min(h, y0 + side)
    canvas[sy0 - y0: sy1 - y0, sx0 - x0: sx1 - x0] = img[sy0:sy1, sx0:sx1]
    # Fade the bottom edge so the shoulders dissolve instead of ending in a hard line.
    fade = np.ones(side, np.float32)
    f0 = int(side * 0.78)
    fade[f0:] = np.linspace(1, 0, side - f0)
    canvas[:, :, 3] = (canvas[:, :, 3].astype(np.float32) * fade[:, None]).astype(np.uint8)
    return cv2.resize(canvas, (SIZE, SIZE), interpolation=cv2.INTER_AREA)


def background_left(head):
    """True when segmentation kept the studio wall (patterned or tiled backgrounds)."""
    a = head[:, :, 3].astype(np.float32) / 255
    c = SIZE // 6
    return float(np.mean([a[:c, :c].mean(), a[:c, -c:].mean()])) > 0.15


def feathered(img_bgr, box):
    """Fallback for photos whose wall could not be removed: a soft oval vignette."""
    rgba = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = 255
    head = crop(rgba, box)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    d = np.sqrt(((xx - SIZE / 2) / (SIZE * 0.40)) ** 2 + ((yy - SIZE * 0.47) / (SIZE * 0.50)) ** 2)
    mask = np.clip((1.0 - d) / 0.18, 0, 1)
    head[:, :, 3] = (head[:, :, 3].astype(np.float32) * mask).astype(np.uint8)
    return head


def main():
    approved = json.load(open(os.path.join(ROOT, 'data/sumo/approved-photos.json')))['bySourceId']
    out_dir = os.path.join(ROOT, 'assets/sumo-photos/head')
    os.makedirs(out_dir, exist_ok=True)
    manifest = {
        'schemaVersion': 1,
        'description': 'Transparent head-and-shoulders crops of approved portraits, made by scripts/sumo-build-heads.py for the head-to-head board. Display only; originals unchanged. Credit stays with the original (Japan Sumo Association).',
        'size': SIZE,
        'excluded': EXCLUDE,
        'bySourceId': {},
    }
    only = set(sys.argv[1:])
    for sid, src in sorted(approved.items(), key=lambda kv: int(kv[0])):
        if not src.get('approved') or sid in EXCLUDE or (only and sid not in only):
            continue
        original = cv2.imread(os.path.join(ROOT, src['path']), cv2.IMREAD_COLOR)
        res = cut.cutout(os.path.join(ROOT, src['path']), offset=True)
        res, (ox, oy) = res
        box = head_box(res[:, :, 3], original.shape[1])
        if not box:
            print('skip', sid, 'no silhouette', file=sys.stderr)
            continue
        head, matte = crop(res, box), 'transparent'
        if background_left(head):
            # Re-anchor the box on the uncropped original and fade the edges instead.
            head, matte = feathered(original, (box[0] + ox, box[1] + oy, box[2])), 'feathered'
        rel = 'assets/sumo-photos/head/jsa-' + sid + '.webp'
        cv2.imwrite(os.path.join(ROOT, rel), head, [cv2.IMWRITE_WEBP_QUALITY, 84])
        manifest['bySourceId'][sid] = {
            'path': rel,
            'sourceSha256': src['sha256'],
            'format': box[3],
            'matte': matte,
            'bytes': os.path.getsize(os.path.join(ROOT, rel)),
        }
    path = os.path.join(ROOT, 'data/sumo/heads.json')
    if only and os.path.exists(path):
        old = json.load(open(path))
        old['bySourceId'].update(manifest['bySourceId'])
        manifest['bySourceId'] = old['bySourceId']
    with open(path, 'w') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(len(manifest['bySourceId']), 'head crops written')


if __name__ == '__main__':
    main()
