"""Tests for scripts/pull-ufc-hires-photos.py. Offline: ESPN is faked, everything runs in a temporary copy."""
import importlib.util
import io
import json
import pathlib
import shutil
import tempfile
import unittest
from types import SimpleNamespace

from PIL import Image

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("pull", ROOT / "scripts/pull-ufc-hires-photos.py")
pull = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pull)


def png(w, h):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (120, 90, 80)).save(buf, "PNG")
    return buf.getvalue()


class Matching(unittest.TestCase):
    def test_exact_name_only(self):
        hits = [("111", "Jose Delano"), ("222", "José Delano Jr")]
        self.assertEqual(pull.exact_match("José Mauro Delano", hits), "111")  # alias, accents ignored
        self.assertIsNone(pull.exact_match("Someone Else", hits))

    def test_two_people_with_the_same_name_are_not_guessed(self):
        self.assertIsNone(pull.exact_match("Carlos Hernandez", [("1", "Carlos Hernandez"), ("2", "Carlos Hernández")]))

    def test_search_hits_keeps_only_mma(self):
        payload = {"results": [{"contents": [
            {"id": "5", "displayName": "Jon Jones", "sport": "mma"},
            {"id": "6", "displayName": "Jon Jones", "sport": "baseball"}]}]}
        self.assertEqual(pull.search_hits(payload), [("5", "Jon Jones")])


class Size(unittest.TestCase):
    def test_portrait_width_is_limited_by_height(self):
        self.assertEqual(pull.portrait_from(600, 436), 349)
        self.assertEqual(pull.portrait_from(350, 254), 203)
        self.assertEqual(pull.portrait_from(2000, 3000), 480)


class Flow(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        (self.tmp / "scripts").mkdir()
        shutil.copy(ROOT / "scripts/process-fighter-images.py", self.tmp / "scripts/")
        img = self.tmp / "assets/img/ufc"
        img.mkdir(parents=True)
        for kind, size in {"portrait": (260, 325), "card": (520, 292), "thumb": (240, 240)}.items():
            Image.new("RGB", size).save(img / f"ada-lee-{kind}.webp")
            Image.new("RGB", (460, 575) if kind == "portrait" else size).save(img / f"big-one-{kind}.webp")
        files = lambda s: {k: f"{s}-{k}.webp" for k in ("portrait", "card", "thumb")}
        reg = {"images": [
            {"id": "ada-lee", "name": "Ada Lee", "files": files("ada-lee"), "sourceUrl": "https://ufc.com/a.png",
             "credit": "UFC", "lowRes": True, "rights": "owner-cleared"},
            {"id": "big-one", "name": "Big One", "files": files("big-one"), "sourceUrl": "https://x/b.png",
             "credit": "ESPN", "lowRes": False, "rights": "owner-cleared"}], "rightsNote": "Base."}
        (self.tmp / "data").mkdir()
        (self.tmp / "data/ufc-image-register.json").write_text(json.dumps(reg))
        pull.ROOT, pull.REGISTER = self.tmp, self.tmp / "data/ufc-image-register.json"
        pull.IMG_DIR, pull.WORK = img, self.tmp / ".photo-pulls/ufc-hires"
        self.calls = []

        def fake_get(url, timeout=20):
            self.calls.append(url)
            if "search" in url:
                return json.dumps({"items": [{"id": "77", "displayName": "Ada Lee", "sport": "mma"}]}).encode()
            return png(600, 436)  # ESPN's full headshot size
        pull.get = fake_get

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_only_too_small_portraits_are_targets(self):
        self.assertEqual([r["id"] for r in pull.targets(pull.load_register())], ["ada-lee"])

    def test_fetch_then_apply(self):
        pull.cmd_fetch(SimpleNamespace(only=None, limit=0, delay=0))
        report = json.loads((pull.WORK / "fetch-report.json").read_text())
        self.assertEqual(report["ada-lee"]["status"], "downloaded")
        self.assertEqual(report["ada-lee"]["url"], "https://a.espncdn.com/i/headshots/mma/players/full/77.png")
        self.assertEqual(pull.cmd_apply(SimpleNamespace(owner_cleared=False)), 2, "no rights statement, no change")
        self.assertEqual(pull.cmd_apply(SimpleNamespace(owner_cleared=True)), 0)
        reg = pull.load_register()
        ada = next(r for r in reg["images"] if r["id"] == "ada-lee")
        self.assertEqual((ada["credit"], ada["previousSourceUrl"]), ("ESPN", "https://ufc.com/a.png"))
        self.assertGreaterEqual(Image.open(pull.IMG_DIR / "ada-lee-portrait.webp").width, pull.MIN_PORTRAIT)
        self.assertIn("1 ESPN headshots replacing smaller UFC.com photos", reg["rightsNote"])
        big = next(r for r in reg["images"] if r["id"] == "big-one")
        self.assertEqual(big["sourceUrl"], "https://x/b.png", "other fighters untouched")

    def test_rerun_skips_what_is_downloaded(self):
        pull.cmd_fetch(SimpleNamespace(only=None, limit=0, delay=0))
        n = len(self.calls)
        pull.cmd_fetch(SimpleNamespace(only=None, limit=0, delay=0))
        self.assertEqual(len(self.calls), n)


if __name__ == "__main__":
    unittest.main()
