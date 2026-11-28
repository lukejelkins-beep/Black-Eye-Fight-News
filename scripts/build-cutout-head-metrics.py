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
"""
import json
import statistics
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "ufc-cutout-head-metrics.json"
# Outline width / face width for long hair worn down, checked by eye (28 Nov 2026).
HAIR = {"champion": {"kayla-harrison": 0.86, "mackenzie-dern": 0.86, "natalia-silva": 0.86}, "fighter": {}}


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
    sets = {"champion": {}, "fighter": {}}
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
    for name, factors in HAIR.items():
        for slug, k in factors.items():
            if slug in sets[name]:
                sets[name][slug][3] = round(sets[name][slug][3] * k, 1)
    OUT.write_text(json.dumps({"schema": 1, "fields": ["W", "H", "top", "headW", "cx"], "hair": HAIR, "sets": sets},
                              separators=(",", ":")) + "\n")
    print(f"{len(sets['champion'])} champion and {len(sets['fighter'])} fighter cut-outs measured -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
