#!/usr/bin/env python3
"""Make transparent fighter cutouts for UFC fighters: assets/img/ufc-cutouts/<slug>.webp.

Default: fighters on announced cards. --all: every fighter in data/ufc-image-register.json (Fighters hub, 24 Nov 2026).

Source: the owner-cleared portrait already in assets/img/ufc/<slug>-portrait.webp (see data/ufc-image-register.json).
Background removal runs offline with rembg (isnet-general-use model, the same model as the Sumo cutouts, DECISIONS PR #323).
Nothing is fetched from the web, and no photo is added: each cutout is a derivative of a portrait BEFN already holds.

A cutout is kept only when it passes the checks below. Otherwise the page shows the original photo in a disc.
Results are recorded in data/ufc-cutout-register.json. Existing cutouts are never redone, so output is stable.

Checks: the figure covers 25-75% of the frame, is one connected piece (small specks are dropped), and the head area
is present (the top 30% of the figure is not mostly empty). Sources under 300 px wide are skipped.
Run: pip install "rembg[cpu]" onnxruntime pillow numpy scipy; python scripts/build-ufc-cutouts.py
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SRC = ROOT / "assets/img/ufc"
OUT_DIR = ROOT / "assets/img/ufc-cutouts"
REGISTER = DATA / "ufc-cutout-register.json"
MIN_COVER, MAX_COVER = 0.25, 0.75
MIN_WIDTH = 300  # cutouts are shown at about 150 px, so a 300 px source stays sharp on 2x screens
# Looked at by eye and dropped (slug -> reason), as for boxing: the page keeps the photo in a disc, and a later
# run does not take the cutout back. Written by `scripts/photo-runner.py reject-cutout`.
BY_EYE = {
}


def judge(alpha):
    """alpha: 2-D uint8 array. Returns (ok, reason, cleaned_alpha)."""
    import numpy as np
    from scipy import ndimage
    mask = alpha > 128
    cover = float(mask.mean())
    if not MIN_COVER <= cover <= MAX_COVER:
        return False, f"coverage {cover:.2f} outside {MIN_COVER}-{MAX_COVER}", alpha
    labels, n = ndimage.label(mask)
    if n == 0:
        return False, "empty", alpha
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    if sizes[keep - 1] < 0.85 * mask.sum():
        return False, "figure is split into pieces", alpha
    cleaned = np.where(labels == keep, alpha, 0).astype(np.uint8)
    rows = np.where((cleaned > 128).any(axis=1))[0]
    top, bottom = rows[0], rows[-1]
    head = (cleaned[top:top + max(1, int((bottom - top) * 0.3))] > 128).mean()
    if head < 0.15:
        return False, "head area looks empty", alpha
    return True, f"coverage {cover:.2f}", cleaned


FRAME_W, FRAME_H = 400, 500  # every cutout ends up 4:5 with the head at the same size, so cards line up


SHOULDER_TO_HEAD = 0.75


def shoulder_line(sm, top, bottom, fh):
    """First row, below the top fifth of the figure, where the outline is 1.6x the head's width (1.35x if never).

    sm: smoothed outline width per row. The head's width is the median over 8-25% of the figure, so hair counts as head.
    Returns the row, or None when the outline never widens that much (a face filling the frame).
    """
    import numpy as np
    hw = float(np.median(sm[top + int(0.08 * fh):top + int(0.25 * fh)]))
    for factor in (1.6, 1.35):
        for y in range(top + int(0.2 * fh), bottom + 1):
            if sm[y] >= factor * hw:
                return y
    return None


def frame(im):
    """Head-and-shoulders crop, same head size for every fighter. im: RGBA PIL image. Uses only the mask (no face model).

    The neck is the first clear narrowing below the head; the head height is top-of-hair to just under the chin.
    With no neck in the outline (long hair, a thick neck), the head is 0.75 of the way from the top to the shoulder
    line (see shoulder_line). Shots with neither (face fills the frame) use the whole figure as the head. The crop is then 2.1 head heights tall,
    centred on the head, and cut at the bottom of the source when the source has no more body to show.
    """
    import numpy as np
    from PIL import Image
    a = np.array(im)[:, :, 3] > 128
    rows = np.where(a.any(axis=1))[0]
    top, bottom = int(rows[0]), int(rows[-1])
    fh = bottom - top + 1
    width = np.array([(np.where(a[y])[0][-1] - np.where(a[y])[0][0] + 1) if a[y].any() else 0 for y in range(a.shape[0])], float)
    sm = np.convolve(width, np.ones(7) / 7, mode="same")
    neck = None
    run = 0.0
    for y in range(top + int(0.12 * fh), top + int(0.65 * fh)):
        run = max(run, sm[y])
        if sm[y] < 0.8 * run and sm[min(y + int(0.15 * fh), bottom)] > 1.15 * sm[y]:
            neck = y
            break
    shoulder_ratio = sm[min(top + int(0.85 * fh), bottom)] / max(sm[top + int(0.2 * fh)], 1)
    shoulder = shoulder_line(sm, top, bottom, fh)
    if neck is not None:
        head_h = (neck - top) * 1.08
    elif shoulder is not None:
        # No neck in the outline (long hair falling to the shoulders, a thick neck or beard). The old fallback, 30% of
        # the figure, read the head far too small and cropped tight (24 Nov 2026 review: Holly Holm, Alexa Grasso,
        # Christian Edwards and 100+ more). Across 698 fighters whose neck is found, head height is 0.75 of the
        # distance from the top of the head to the shoulder line (p10-p90: 0.65-0.78), so use that.
        head_h = SHOULDER_TO_HEAD * (shoulder - top)
    elif shoulder_ratio >= 1.3:
        head_h = 0.30 * fh
    else:
        head_h = fh / 1.15
    cols = np.where(a[top:top + int(head_h)].any(axis=0))[0]
    cx = (cols[0] + cols[-1]) / 2
    box_h = 2.1 * head_h
    box_top = top - 0.06 * head_h
    if box_top + box_h > bottom + 1:
        box_h = bottom + 1 - box_top
    box_w = box_h * FRAME_W / FRAME_H
    left = cx - box_w / 2
    canvas = Image.new("RGBA", (int(round(box_w)), int(round(box_h))), (0, 0, 0, 0))
    canvas.alpha_composite(im, (int(round(-left)), int(round(-box_top)))) if False else canvas.paste(
        im.crop((int(round(left)), int(round(box_top)), int(round(left + box_w)), int(round(box_top + box_h)))), (0, 0))
    return canvas.resize((FRAME_W, FRAME_H), Image.LANCZOS)


def check_framed(im):
    """Second check on the finished 400x500 cutout (added 24 Nov 2026 after reviewing a full-roster run).

    Catches what the first check misses: a floating head where the body was lost (shoulder band under 60% filled),
    one shoulder cut away (left and right halves of the lower body differ by more than 20%), and hair or background
    left as a grey halo (more than 10% of the frame semi-transparent). Returns (ok, reason).
    """
    import numpy as np
    a = np.array(im)[:, :, 3]
    m = a > 128
    h, w = m.shape
    band = m[int(h * 0.85):].mean()
    if band < 0.6:
        return False, f"shoulders missing (bottom band {band:.2f} filled)"
    left, right = m[int(h * 0.7):, : w // 2].mean(), m[int(h * 0.7):, w // 2:].mean()
    asym = abs(left - right) / max(left + right, 1e-6)
    if asym > 0.2:
        return False, f"lopsided figure ({asym:.2f})"
    semi = float(((a > 20) & (a < 235)).mean())
    if semi > 0.1:
        return False, f"soft halo ({semi:.2f} semi-transparent)"
    return True, ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", help="comma-separated slugs (default: every card fighter)")
    ap.add_argument("--reframe", action="store_true", help="re-crop the existing cutouts to the common framing (no model needed)")
    ap.add_argument("--all", action="store_true", help="every fighter in the image register, not only card fighters (Fighters hub)")
    args = ap.parse_args()
    from PIL import Image
    import numpy as np
    if args.reframe:
        for f in sorted(OUT_DIR.glob("*.webp")):
            framed = frame(Image.open(f).convert("RGBA"))
            framed.save(f, quality=88, method=6)
        print("reframed", len(list(OUT_DIR.glob("*.webp"))), "cutouts")
        return 0
    from rembg import new_session, remove
    snaps = json.loads((DATA / "ufc-card-snapshots.json").read_text())["fighters"]
    images = {i["id"]: i for i in json.loads((DATA / "ufc-image-register.json").read_text())["images"]}
    fold = lambda t: re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().lower())
    by_name = {fold(i["name"]): i["id"] for i in images.values()}
    # The snapshot slug can be missing; the image register id matched on the folded name is the fallback.
    if args.only:
        wanted = [s.strip() for s in args.only.split(",")]
    elif args.all:
        wanted = sorted(images)
    else:
        wanted = sorted({v.get("slug") or by_name.get(k) or "unmatched-" + k for k, v in snaps.items()})
    reg = json.loads(REGISTER.read_text()) if REGISTER.exists() else {"version": 1, "cutouts": {}}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    session = None
    for slug in wanted:
        entry = reg["cutouts"].get(slug)
        if entry and (entry["ok"] is False or (OUT_DIR / f"{slug}.webp").exists()) and not args.only:
            continue
        img = images.get(slug)
        src = SRC / f"{slug}-portrait.webp"
        if not img or not src.exists():
            reg["cutouts"][slug] = {"ok": False, "reason": "no portrait in the image register"}
            continue
        if Image.open(src).width < MIN_WIDTH:
            reg["cutouts"][slug] = {"ok": False, "reason": f"source portrait under {MIN_WIDTH}px wide"}
            continue
        if slug in BY_EYE:
            reg["cutouts"][slug] = {"ok": False, "reason": "dropped by eye: " + BY_EYE[slug]}
            (OUT_DIR / f"{slug}.webp").unlink(missing_ok=True)
            continue
        session = session or new_session("isnet-general-use")
        out = remove(Image.open(src).convert("RGB"), session=session)
        arr = np.array(out)
        ok, reason, cleaned = judge(arr[:, :, 3])
        if ok:
            arr[:, :, 3] = cleaned
            framed = frame(Image.fromarray(arr))
            ok2, why = check_framed(framed)
            if ok2:
                framed.save(OUT_DIR / f"{slug}.webp", quality=88, method=6)
            else:
                ok, reason = False, why
        reg["cutouts"][slug] = {"ok": ok, "reason": reason}
    reg["cutouts"] = dict(sorted(reg["cutouts"].items()))
    reg["note"] = ("Derived from the owner-cleared portraits in data/ufc-image-register.json (rights owner-cleared, credit ESPN). "
                   "ok=false means the page keeps the original photo in a disc.")
    REGISTER.write_text(json.dumps(reg, indent=1, sort_keys=True) + "\n")
    good = sum(1 for v in reg["cutouts"].values() if v["ok"])
    print(f"{good} cutouts kept of {len(reg['cutouts'])} checked")
    for s, v in reg["cutouts"].items():
        if not v["ok"]:
            print("  fallback:", s, "-", v["reason"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
