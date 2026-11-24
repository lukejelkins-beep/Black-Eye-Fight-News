#!/usr/bin/env python3
"""Make transparent boxer cutouts: assets/img/boxing-cutouts/<id>.webp.

Source: the press-kit and Commons photographs BEFN already holds, listed in
data/boxing-image-register.json (promoter attestation, or a free Commons licence).
Nothing is fetched and no photograph is added: each cutout is a derivative of a
photograph already in the register, and it inherits that row's credit and rights.

The background removal, the keep/drop checks and the head-and-shoulders crop are the
same code as the UFC cutouts (scripts/build-ufc-cutouts.py, rembg isnet-general-use):
imported from there rather than copied, so the two sports cannot drift apart.

A cutout is kept only when the figure is one connected piece covering 25-75% of the frame
with a head in the top of it, and the head-and-shoulders crop that comes out fills the frame
rather than leaving a whole figure adrift in it. Some are then dropped by eye (BY_EYE below).
A boxer who fails keeps the photograph in its disc, exactly as before. Results and reasons go to data/boxing-cutout-register.json.
Existing cutouts are never redone, so output is stable.

Run: pip3 install --user "rembg[cpu]" numpy scipy pillow
     python3 scripts/build-boxing-cutouts.py
Not python3 -I: isolated mode drops the --user site-packages these wheels live in.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT_DIR = ROOT / "assets/img/boxing-cutouts"
REGISTER = DATA / "boxing-cutout-register.json"
IMAGE_REGISTER = DATA / "boxing-image-register.json"
MIN_WIDTH = 300  # cutouts are shown at about 150 px, so a 300 px source stays sharp on 2x screens
MIN_FRAME_WIDTH = 0.65  # see judge_frame()

# Looked at by eye and dropped rather than shipped, with the reason. Press kits carry
# action, weigh-in and press-conference shots as often as portraits, and none of the
# automatic checks can see that a face is turned away or behind a glove. Named here so a
# later run does not take them back; each of these boxers keeps the photograph in a disc.
BY_EYE = {
    "viddal-riley": "hard vertical crop edge on the right of the cut-out",
    "adam-azim": "full-length side-on shot: the head is a fraction of the frame",
    "alberto-palmetta": "press-conference shot: a microphone across the chin, mouth open mid-sentence",
    "conah-walker": "full-length pose with the arms across the chest, the head too small to read",
    "hassan-azim": "full-length boxing pose: the head is a fraction of the frame",
    "ishmael-davis": "the forearm covers the face",
    "omari-jones": "a low-key photograph: the dark hair merges with the dark backdrop, so the crown is cut away and the crop is a face filling the frame",
    "naoya-inoue": "award-ceremony still: the trophy in front of him leaves shards in the cutout and holes in the jacket",
    "teofimo-lopez": "video still in a gym: a dark object behind his head is kept as part of the figure",
    "litzy-vazquez": "mid-jab: the fist sits in front of the chin and the crop comes out as a torso with a small head",
    "lauren-price": "the belts fill the frame and the head sits small above them",
    "ryan-garcia": "a weigh-in face-off: two other people in the frame, both masked, the subject not told apart",
    "teremoana-teremoana": "mid-punch, the torso fills the frame and the head is small",
    "william-crolla": "full-length flexing pose, the head too small to read",
}

# Other MMA promotions (PFL, ONE, KSW, RIZIN, Cage Warriors; data/mma-image-register.json, added 2026-11-24 with
# scripts/photo-runner.py). Same code, same checks, its own folder and register, its own by-eye list.
BY_EYE_MMA = {
}
SPORTS = {
    "boxing": (OUT_DIR, REGISTER, IMAGE_REGISTER, BY_EYE),
    "mma": (ROOT / "assets/img/mma-cutouts", DATA / "mma-cutout-register.json", DATA / "mma-image-register.json", BY_EYE_MMA),
}


def judge_frame(framed):
    """A backstop for the head-and-shoulders crop, not a substitute for looking at it.

    frame() finds the head from the mask alone. On a full-length photograph with no clear
    neck it falls back to treating the whole figure as the head, and the crop that comes
    out is the whole boxer at thumbnail size. Such a crop leaves the frame mostly empty
    either side, so a figure spanning less than MIN_FRAME_WIDTH of the width means the head
    was not found. Returns (ok, reason).
    """
    import numpy as np
    a = np.array(framed)[:, :, 3] > 128
    cols = np.where(a.any(axis=0))[0]
    span = (cols[-1] - cols[0] + 1) / a.shape[1] if len(cols) else 0.0
    if span < MIN_FRAME_WIDTH:
        return False, f"the head was not found: the figure spans {span:.0%} of the frame, which is a full-length crop"
    return True, f"figure spans {span:.0%} of the frame"


def ufc_cutouts():
    """The UFC cutout builder, imported by path because of the dash in its filename."""
    spec = importlib.util.spec_from_file_location("befn_ufc_cutouts", Path(__file__).with_name("build-ufc-cutouts.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", help="comma-separated register ids (default: every boxer in the register)")
    ap.add_argument("--reframe", action="store_true", help="re-crop the existing cutouts to the common framing (no model needed)")
    ap.add_argument("--sport", choices=sorted(SPORTS), default="boxing",
                    help="boxing (default) or mma: the other MMA promotions' register")
    args = ap.parse_args()
    OUT_DIR, REGISTER, IMAGE_REGISTER, by_eye = SPORTS[args.sport]
    from PIL import Image
    import numpy as np
    shared = ufc_cutouts()
    if args.reframe:
        for f in sorted(OUT_DIR.glob("*.webp")):
            shared.frame(Image.open(f).convert("RGBA")).save(f, quality=88, method=6)
        print("reframed", len(list(OUT_DIR.glob("*.webp"))), "cutouts")
        return 0
    from rembg import new_session, remove
    reg_src = json.loads(IMAGE_REGISTER.read_text(encoding="utf-8"))
    base = ROOT / reg_src["basePath"]
    rows = {r["id"]: r for r in reg_src["images"]}
    wanted = [s.strip() for s in args.only.split(",")] if args.only else sorted(rows)
    reg = json.loads(REGISTER.read_text(encoding="utf-8")) if REGISTER.exists() else {"version": 1, "cutouts": {}}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    session = None
    for rid in wanted:
        entry = reg["cutouts"].get(rid)
        if entry and (entry["ok"] is False or (OUT_DIR / f"{rid}.webp").exists()) and not args.only:
            continue
        row = rows.get(rid)
        src = base / (row or {}).get("files", {}).get("portrait", "")
        if not row or not src.is_file():
            reg["cutouts"][rid] = {"ok": False, "reason": f"no portrait in the {args.sport} image register"}
            continue
        if Image.open(src).width < MIN_WIDTH:
            reg["cutouts"][rid] = {"ok": False, "reason": f"source portrait under {MIN_WIDTH}px wide"}
            continue
        if rid in by_eye:
            reg["cutouts"][rid] = {"ok": False, "reason": "dropped by eye: " + by_eye[rid]}
            (OUT_DIR / f"{rid}.webp").unlink(missing_ok=True)
            continue
        session = session or new_session("isnet-general-use")
        arr = np.array(remove(Image.open(src).convert("RGB"), session=session))
        ok, reason, cleaned = shared.judge(arr[:, :, 3])
        if ok:
            arr[:, :, 3] = cleaned
            framed = shared.frame(Image.fromarray(arr))
            ok, reason = judge_frame(framed)
            if ok:
                framed.save(OUT_DIR / f"{rid}.webp", quality=88, method=6)
        if not ok:
            reg["cutouts"][rid] = {"ok": False, "reason": reason}
            continue
        reg["cutouts"][rid] = {"ok": True, "reason": reason, "credit": row.get("credit", ""), "rights": row.get("rights", "")}
    reg["cutouts"] = dict(sorted(reg["cutouts"].items()))
    reg["note"] = (f"Derived from the photographs in data/{IMAGE_REGISTER.name}; each cutout carries that row's "
                   "credit and rights (promoter press kit under the owner's attestation, a free Commons licence, "
                   "or a photograph the owner supplied with their attestation). "
                   "ok=false means the page keeps the original photograph in a disc.")
    REGISTER.write_text(json.dumps(reg, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    good = sum(1 for v in reg["cutouts"].values() if v["ok"])
    print(f"{good} cutouts kept of {len(reg['cutouts'])} checked")
    for s, v in reg["cutouts"].items():
        if not v["ok"]:
            print("  fallback:", s, "-", v["reason"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
