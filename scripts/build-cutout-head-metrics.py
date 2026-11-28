#!/usr/bin/env python3
"""Measure the head in each UFC cut-out so pages can show every head at the same size and height.

Owner, 28 Nov 2026: "the headshots are inconsistent - make them a consistent size ... seamless cutouts".
Reads the owner-supplied champion belt cut-outs (data/ufc-champion-photo-register.json) and every per-fighter
cut-out the register marks ok (data/ufc-cutout-register.json). Writes data/ufc-cutout-head-metrics.json:
  sets.champion[slug] / sets.fighter[slug] = [W, H, top, headW, cx]
    W, H   image size in px; top = first row of the outline (the crown);
    headW  outline width across the head, the median of rows 5-10% of the height below the crown;
    cx     horizontal centre of the head in those rows.
A page scales an image by targetHeadPx / headW and places the crown at a fixed height (assets/cutout-fit.js).
Long hair widens the outline beyond the face, so HAIR lists a factor, checked by eye on the rendered strip.
Pure measurement of files already in the repo; no image is changed. Run after new cut-outs are added.

Boxing (owner, 28 Nov 2026: "make sure athletes pictures are appearing consistently"):
  sets.boxer[slug]       the same measurement for every boxing cut-out the register marks ok
                         (data/boxing-cutout-register.json, assets/img/boxing-cutouts/).
  sets.boxerPhoto[slug]  for a boxer with a photograph but no usable cut-out: the face found in the portrait crop
                         (assets/img/boxing/<slug>-portrait.webp) by OpenCV's frontal-face detector, written in the
                         same five numbers (crown = 22% of the face height above the face box, headW = face width),
                         so a page frames the photograph exactly as it frames a cut-out. FACE_BY_EYE holds boxes set
                         by eye where the detector finds nothing. Without OpenCV the previous values are kept.
"""
import json
import statistics
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "ufc-cutout-head-metrics.json"
# Outline width / face width for long hair worn down, checked by eye (28 Nov 2026).
HAIR = {"champion": {"kayla-harrison": 0.86, "mackenzie-dern": 0.86, "natalia-silva": 0.86}, "fighter": {}, "boxer": {}}
# Face boxes [x, y, w, h] in the 480x600 portrait set by eye where the detector finds no face (28 Nov 2026).
FACE_BY_EYE = {"ryan-garcia": [104, 52, 74, 74]}


def face_metrics(path, slug):
    """[W, H, top, headW, cx] from the largest frontal face in a photograph, or None."""
    im = Image.open(path)
    w, h = im.size
    box = FACE_BY_EYE.get(slug)
    if box is None:
        import cv2  # optional: only needed to re-measure photographs
        img = cv2.imread(str(path))
        grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        casc = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        faces = casc.detectMultiScale(grey, 1.1, 5, minSize=(int(w * 0.08), int(w * 0.08)))
        if len(faces) == 0:
            return None
        box = [int(v) for v in max(faces, key=lambda b: b[2] * b[3])]
    x, y, fw, fh = box
    return [w, h, round(max(0, y - 0.22 * fh), 1), float(fw), round(x + fw / 2, 1)]


def measure(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    alpha = im.split()[3].load()
    top = next((y for y in range(h) if any(alpha[x, y] > 128 for x in range(0, w, 2))), None)
    if top is None:
        return None
    widths, centres = [], []
    for f in (0.05, 0.06, 0.07, 0.08, 0.09, 0.10):
        y = min(h - 1, top + int(h * f))
        xs = [x for x in range(w) if alpha[x, y] > 128]
        if xs:
            widths.append(max(xs) - min(xs))
            centres.append((max(xs) + min(xs)) / 2)
    if not widths:
        return None
    return [w, h, top, round(statistics.median(widths), 1), round(statistics.median(centres), 1)]


def main():
    sets = {"champion": {}, "fighter": {}, "boxer": {}, "boxerPhoto": {}}
    reg = json.loads((ROOT / "data/ufc-champion-photo-register.json").read_text())
    for p in reg.get("photos", []):
        cut = (p.get("cutout") or {}).get("file")
        if cut and (ROOT / cut).exists():
            m = measure(ROOT / cut)
            if m:
                sets["champion"][p["slug"]] = m
    cuts = json.loads((ROOT / "data/ufc-cutout-register.json").read_text()).get("cutouts", {})
    for slug, rec in sorted(cuts.items()):
        f = ROOT / "assets/img/ufc-cutouts" / (slug + ".webp")
        if rec.get("ok") is True and f.exists():
            m = measure(f)
            if m:
                sets["fighter"][slug] = m
    bcuts = json.loads((ROOT / "data/boxing-cutout-register.json").read_text()).get("cutouts", {})
    for slug, rec in sorted(bcuts.items()):
        f = ROOT / "assets/img/boxing-cutouts" / (slug + ".webp")
        if rec.get("ok") is True and f.exists():
            m = measure(f)
            if m:
                sets["boxer"][slug] = m
    previous = {}
    if OUT.exists():
        previous = json.loads(OUT.read_text()).get("sets", {}).get("boxerPhoto", {})
    try:
        import cv2  # noqa: F401
        have_cv = True
    except ImportError:
        have_cv = False
    for row in json.loads((ROOT / "data/boxing-image-register.json").read_text()).get("images", []):
        slug = row.get("id")
        f = ROOT / "assets/img/boxing" / ((row.get("files") or {}).get("portrait") or "")
        if not slug or bcuts.get(slug, {}).get("ok") is True or not f.is_file():
            continue
        if have_cv or slug in FACE_BY_EYE:
            m = face_metrics(f, slug)
        else:
            m = previous.get(slug)
        if m:
            sets["boxerPhoto"][slug] = m
    for name, factors in HAIR.items():
        for slug, k in factors.items():
            if slug in sets[name]:
                sets[name][slug][3] = round(sets[name][slug][3] * k, 1)
    OUT.write_text(json.dumps({"schema": 1, "fields": ["W", "H", "top", "headW", "cx"], "hair": HAIR, "sets": sets},
                              separators=(",", ":")) + "\n")
    print(f"{len(sets['champion'])} champion, {len(sets['fighter'])} fighter and {len(sets['boxer'])} boxer cut-outs, "
          f"{len(sets['boxerPhoto'])} boxer photographs measured -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
