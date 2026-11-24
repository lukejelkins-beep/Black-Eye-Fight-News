"""Tests for scripts/build-ufc-cutouts.py: the check_framed() quality check and the register/file contract.

Offline: synthetic alpha masks and the files already in the repo. rembg is not needed.
"""
import importlib.util
import json
import pathlib
import unittest

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("cutouts", ROOT / "scripts/build-ufc-cutouts.py")
cutouts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cutouts)

W, H = 400, 500


def rgba(alpha):
    arr = np.zeros((H, W, 4), dtype=np.uint8)
    arr[:, :, :3] = 128
    arr[:, :, 3] = alpha
    return Image.fromarray(arr, "RGBA")


def figure():
    """Head disc on top, full-width shoulders at the bottom: a well-framed cutout."""
    a = np.zeros((H, W), dtype=np.uint8)
    yy, xx = np.mgrid[:H, :W]
    a[(yy - 170) ** 2 + (xx - 200) ** 2 < 110 ** 2] = 255
    a[300:, 40:360] = 255
    a[400:, :] = 255
    return a


class CheckFramed(unittest.TestCase):
    def test_clean_figure_passes(self):
        self.assertEqual(cutouts.check_framed(rgba(figure())), (True, ""))

    def test_floating_head_fails(self):
        a = figure()
        a[300:, :] = 0
        ok, why = cutouts.check_framed(rgba(a))
        self.assertFalse(ok)
        self.assertIn("shoulders missing", why)

    def test_one_shoulder_cut_away_fails(self):
        a = figure()
        a[350:, : W // 2] = 0
        a[425:, : W // 2] = 255  # keep the bottom band filled so only the asymmetry check trips
        ok, why = cutouts.check_framed(rgba(a))
        self.assertFalse(ok)
        self.assertIn("lopsided", why)

    def test_grey_halo_fails(self):
        a = figure()
        a[:120, :] = np.where(a[:120, :] == 0, 128, a[:120, :])
        ok, why = cutouts.check_framed(rgba(a))
        self.assertFalse(ok)
        self.assertIn("soft halo", why)


class Register(unittest.TestCase):
    def test_every_kept_row_has_a_file_and_every_file_is_kept(self):
        rows = json.loads((ROOT / "data/ufc-cutout-register.json").read_text())["cutouts"]
        kept = {slug for slug, row in rows.items() if row.get("ok") is True}
        files = {p.stem for p in (ROOT / "assets/img/ufc-cutouts").glob("*.webp")}
        self.assertEqual(kept, files)


if __name__ == "__main__":
    unittest.main()
