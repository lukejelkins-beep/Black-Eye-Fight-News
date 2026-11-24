#!/usr/bin/env python3
"""Make portrait (4:5), card (16:9) and thumb (1:1) WebP crops from owner-supplied fighter JPEGs.
Never upscales. Crops are top-biased (heads sit near the top); no face detection, so spot-check results.
Usage: process_fighter_images.py <src_dir> <manifest.csv> <out_dir>"""
import csv, json, sys, hashlib
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image, ImageOps

SPECS = {"portrait": (4, 5, 480), "card": (16, 9, 800), "thumb": (1, 1, 240)}  # ratio w,h and max width
CREDITS = {"www.ufc.com": "UFC", "a.espncdn.com": "ESPN", "upload.wikimedia.org": "Wikimedia Commons (CC BY 4.0)"}

def crop_box(w, h, rw, rh, top_bias):
    target = rw / rh
    if w / h > target:            # too wide: crop sides, centred
        cw, ch = round(h * target), h
        x, y = (w - cw) // 2, 0
    else:                         # too tall: crop from top with a small bias
        cw, ch = w, round(w / target)
        x, y = 0, round((h - ch) * top_bias)
    return (x, y, x + cw, y + ch)

def main(src, manifest, out):
    src, out = Path(src), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    rows, report = [], []
    for r in csv.DictReader(open(manifest, encoding="utf-8-sig")):
        if r["download_status"] != "downloaded":
            report.append({"slug": r["roster_slug"], "status": "no source photo"}); continue
        f = src / r["jpeg_filename"]
        try:
            im = ImageOps.exif_transpose(Image.open(f))
            if "A" in im.getbands() or "transparency" in im.info:
                # ESPN headshots are PNGs on transparency, and the colour left under transparent pixels is
                # arbitrary: a plain convert("RGB") shows it as streaks. Lay them on white, as UFC.com's are.
                flat = Image.new("RGBA", im.size, (255, 255, 255, 255))
                flat.alpha_composite(im.convert("RGBA"))
                im = flat
            im = im.convert("RGB")
        except Exception as e:
            report.append({"slug": r["roster_slug"], "status": f"unreadable: {e}"}); continue
        w, h = im.size
        files = {}
        for name, (rw, rh, mw) in SPECS.items():
            bias = 0.0 if name != "card" else 0.08
            c = im.crop(crop_box(w, h, rw, rh, bias))
            tw = min(mw, c.width)
            c = c.resize((tw, round(tw * rh / rw)), Image.LANCZOS)
            fn = f'{r["roster_slug"]}-{name}.webp'
            c.save(out / fn, "WEBP", quality=82, method=6)
            files[name] = fn
        host = urlparse(r["image_source_url"]).netloc
        rows.append({"id": r["roster_slug"], "name": r["fighter_name"], "files": files,
                     "sourceWidth": w, "sourceHeight": h, "lowRes": w < 480,
                     "sourceUrl": r["image_source_url"], "credit": CREDITS.get(host, host),
                     "originalRights": r["rights_status"], "originalSha256": r["sha256"]})
    json.dump(rows, open(out / "_processed.json", "w"), indent=1)
    json.dump(report, open(out / "_skipped.json", "w"), indent=1)
    print(len(rows), "processed;", len(report), "skipped")

main(*sys.argv[1:4])
