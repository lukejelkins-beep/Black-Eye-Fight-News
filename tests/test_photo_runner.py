"""Offline tests for scripts/photo-runner.py and the staging modes it drives (no network).

Each test builds a small copy of the repository in a temporary folder (the pipeline scripts plus
fixture data), so nothing in the real repository is read for data or written.
"""
import hashlib
import importlib.util
import io
import json
import shutil
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
SCRIPTS = ["photo-runner.py", "boxing-portrait-intake.py", "mma-portrait-intake.py", "pull-ufc-hires-photos.py",
           "process-fighter-images.py", "build-local-image-map.py", "build-photo-credits.py",
           "sumo-portrait-intake.py", "build-boxing-cutouts.py", "build-ufc-cutouts.py"]
RECENT = (date.today() - timedelta(days=10)).isoformat()
FUTURE = (date.today() + timedelta(days=20)).isoformat()


_png_n = [0]


def png(color=None, size=(600, 750)):
    # Each call a different colour: one image file for two fighters is refused as a placeholder.
    _png_n[0] += 1
    color = color or (90, 60, (40 + _png_n[0]) % 256)
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


def write(root, rel, obj):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")


def build_repo(root):
    (root / "scripts").mkdir(parents=True)
    for s in SCRIPTS:
        shutil.copy(REPO / "scripts" / s, root / "scripts" / s)
    combat = {"champions": {"boxing": [{"division": "Heavyweight", "belts": {"WBC": [{"name": "Agit Kabayel"}],
                                                                           "WBO": [{"name": "Held Boxer"}]}}],
                            "mma": [{"division": "Lightweight", "name": "Champ Holder"}]},
              "fighters": [{"name": "Roster Boxer", "sport": "Boxing", "category": "Prospect"}]}
    write(root, "assets/app-inline-1.js", "window.COMBAT_DATA = " + json.dumps(combat) + ";\nmore();\n")
    write(root, "data/upcoming-cards.json", {"events": [
        {"date": FUTURE, "sport": "boxing", "promotion": "Queensberry", "title": "Main A vs Main B",
         "bouts": [{"fighters": ["Main A", "Main B"]}, {"fighters": ["Card C", "Agit Kabayel"]}]},
        {"date": FUTURE, "sport": "mma", "promotion": "UFC", "title": "UFC X",
         "bouts": [{"fighters": ["Champ Holder", "New Ufc"]}]},
        {"date": FUTURE, "sport": "mma", "promotion": "XTB KSW", "title": "KSW 200",
         "bouts": [{"fighters": ["Jan Kowalski", "Held Ufc"]}]},
        {"date": "2000-01-01", "sport": "boxing", "title": "Old", "bouts": [{"fighters": ["Long Gone", "Also Gone"]}]},
    ]})
    write(root, "data/results.json", {"results": [
        {"eventId": "boxing-x-" + RECENT, "event": "Boxing X", "sport": "Boxing", "date": RECENT,
         "fighters": [{"name": "Recent Boxer"}, {"name": "Held Boxer"}]},
        {"eventId": "ufc-y-" + RECENT, "event": "UFC Y", "sport": "MMA", "date": RECENT,
         "fighters": [{"name": "Jan Błachowicz"}, {"name": "Held Ufc"}]},
        {"eventId": "pfl-z-" + RECENT, "event": "PFL Z", "sport": "MMA", "date": RECENT,
         "fighters": [{"name": "Pfl Person"}, {"name": "Held Ufc"}]},
        {"eventId": "one-mt-" + RECENT, "event": "ONE MT", "sport": "Muay Thai", "date": RECENT,
         "fighters": [{"name": "Muay Thai Person"}, {"name": "Other Thai"}]},
    ]})
    write(root, "data/ufc-fighter-form.json", {"fighters": {"held-ufc": {"name": "Held Ufc"},
                                                           "jan-blachowicz": {"name": "Jan Blachowicz"},
                                                           "hub-only": {"name": "Hub Only"}}})
    ufc_rows = []
    for slug, name in (("held-ufc", "Held Ufc"), ("jan-blachowicz", "Jan Blachowicz"), ("champ-holder", "Champ Holder")):
        files = {k: f"{slug}-{k}.webp" for k in ("portrait", "card", "thumb")}
        for f in files.values():
            (root / "assets/img/ufc").mkdir(parents=True, exist_ok=True)
            Image.new("RGB", (40, 50)).save(root / "assets/img/ufc" / f, "WEBP")
        ufc_rows.append({"id": slug, "name": name, "files": files, "credit": "ESPN", "rights": "owner-cleared",
                         "sourceUrl": "https://a.espncdn.com/x.png"})
    write(root, "data/ufc-image-register.json", {"version": 1, "basePath": "assets/img/ufc/", "rights": "owner-cleared",
                                                 "rightsNote": "Owner stated.", "images": ufc_rows, "missing": ["hub-only"]})
    write(root, "data/ufc-cutout-register.json", {"version": 1, "cutouts": {"held-ufc": {"ok": True, "reason": "x"},
                                                                         "jan-blachowicz": {"ok": False, "reason": "soft halo"}}})
    files = {k: f"held-boxer-{k}.webp" for k in ("portrait", "card", "thumb")}
    (root / "assets/img/boxing").mkdir(parents=True, exist_ok=True)
    for f in files.values():
        Image.new("RGB", (40, 50)).save(root / "assets/img/boxing" / f, "WEBP")
    write(root, "data/boxing-image-register.json", {
        "version": 1, "sport": "boxing", "basePath": "assets/img/boxing/", "rights": "promoter-press-kit, wikimedia-cc",
        "rightsNote": "Owner attested.", "attestations": {}, "generated": "2026-11-20T00:00:00+00:00",
        "images": [{"id": "held-boxer", "name": "Held Boxer", "files": files, "credit": "Matchroom Boxing",
                    "rights": "promoter-press-kit"}],
        "skipped": [{"name": "Main B", "reason": "not on any allowlisted promoter roster"}]})
    write(root, "data/boxing-cutout-register.json", {"version": 1, "cutouts": {}})
    write(root, "data/sumo/rikishi-index.json", {"rikishi": [{"sourceId": 1, "shikonaEn": "Onosato", "officialNskId": 9}]})
    write(root, "data/sumo/approved-photos.json", {"bySourceId": {"1": {"approved": True, "name": "Onosato"}}})
    write(root, "data/sumo/cutouts.json", {"bySourceId": {}, "headshotOrPartial": ["1"]})
    return root


def load(root, name):
    spec = importlib.util.spec_from_file_location("t_" + name.replace("-", "_").replace(".", "_"), root / "scripts" / name)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def tree(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob("*") if p.is_file() and "__pycache__" not in p.parts}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = build_repo(Path(self.tmp.name))
        self.runner = load(self.root, "photo-runner.py")
        self.p = self.runner.paths()

    def tearDown(self):
        self.tmp.cleanup()

    def read_mma(self, stage):
        res = self.runner.read_json(stage / "mma/result.json")
        entries = [{"sport": "mma", "id": r["id"], "name": r["name"], "row": r, "portrait": f"mma/files/{r['files']['portrait']}",
                    "credit": r["credit"], "licence": r["attestation"]} for r in res["images"]]
        skips = [{"sport": "mma", "name": s["name"], "reason": s["reason"], "category": s["kind"]} for s in res["skipped"]]
        return entries, skips, res["blocked"]

    def fake_boxing_stage(self, p, people, stage, log):
        """The real boxing intake's main(), in-process, with one fake roster and no network."""
        box = load(self.root, "boxing-portrait-intake.py")
        box.robots_allows = lambda site, path="/": (True, "")
        box.get = lambda url, timeout=25: ((b"<roster>" if "roster" in url else png()), "image/png" if "roster" not in url else "text/html")
        box.SOURCES = [{"id": "matchroom", "promoter": "Matchroom Boxing", "site": "example.test",
                        "roster": "https://example.test/roster", "parse": lambda html, base: {
                            "agit kabayel": ("https://example.test/kabayel.jpg", "https://example.test/agit-kabayel")}}]
        box.EVENT_PAGES = {}
        box.commons_photo = lambda name: (None, "no English Wikipedia article calling them a boxer")
        names = stage / "boxing" / "names.txt"
        names.parent.mkdir(parents=True, exist_ok=True)
        names.write_text("\n".join(r["name"] for r in people), encoding="utf-8")
        with mock.patch.object(sys, "argv", ["x", "--names-file", str(names), "--stage", str(stage)]):
            box.main()
        res = self.runner.read_json(stage / "boxing/result.json")
        entries = [{"sport": "boxing", "id": r["id"], "name": r["name"], "row": r,
                    "portrait": f"boxing/files/{r['files']['portrait']}", "credit": r["credit"],
                    "licence": r["attestation"]} for r in res["images"]]
        skips = [{"sport": "boxing", "name": s["name"], "reason": s["reason"],
                  "category": self.runner.categorise(s["reason"])} for s in res["skipped"]]
        return entries, skips, {}

    def staged_run(self):
        self.runner.STAGE.update({"mma": lambda p, people, stage, log: self.read_mma_after(people, stage),
                                  "boxing": self.fake_boxing_stage,
                                  "ufc": lambda p, people, stage, log: ([], [], {}),
                                  "sumo": lambda p, people, stage, log: ([], [], {})})
        return self.runner.cmd_fetch(SimpleNamespace(sport="all", names="", limit=0, retry=False, fresh_days=6), self.p)

    def read_mma_after(self, people, stage):
        mma = load(self.root, "mma-portrait-intake.py")
        mma.box.get = lambda url, timeout=25: (png(), "image/png")
        mma.ADAPTERS["KSW"] = lambda person: (mma.labelled(
            person["name"], f"https://www.kswmma.com/storage/{mma.slugify(person['name'])}.png",
            person["name"], person["name"]), "https://www.kswmma.com/en/fighter/x", "test page")
        mma.ADAPTERS["PFL"] = lambda person: (_ for _ in ()).throw(mma.Blocked("pfl host: robots.txt unreadable"))
        mma.run(people, str(stage), delay=0)
        return self.read_mma(stage)


class Missing(Base):
    def test_prominence_order_and_holdings(self):
        doc = self.runner.compute_missing(self.p, self.runner.SPORTS)
        boxing = [r["name"] for r in doc["sports"]["boxing"]["missing"]]
        # champion first, then the main event, then the card, then the recent result, then the roster
        self.assertEqual(boxing, ["Agit Kabayel", "Main A", "Main B", "Card C", "Recent Boxer", "Roster Boxer"])
        self.assertNotIn("Held Boxer", boxing)
        self.assertNotIn("Long Gone", boxing, "a past card is not upcoming")
        kabayel = doc["sports"]["boxing"]["missing"][0]
        self.assertEqual(kabayel["prominence"], "current champion")
        self.assertTrue(any("main event" not in w and "on the card" in w for w in kabayel["why"]))
        main_b = next(r for r in doc["sports"]["boxing"]["missing"] if r["name"] == "Main B")
        self.assertEqual(main_b["lastAttempt"]["category"], "no source", "the register's skip is the last attempt")
        ufc = [r["name"] for r in doc["sports"]["ufc"]["missing"]]
        self.assertEqual(ufc, ["New Ufc", "Hub Only"])
        self.assertNotIn("Jan Błachowicz", ufc, "Ł is read as L, so the held photo is found")
        self.assertEqual([r["name"] for r in doc["sports"]["ufc"]["noCutout"]], ["Champ Holder", "Jan Błachowicz"])
        mma = doc["sports"]["mma"]["missing"]
        self.assertEqual([(r["name"], r["promoter"]) for r in mma], [("Jan Kowalski", "KSW"), ("Pfl Person", "PFL")])
        self.assertEqual(doc["sports"]["sumo"]["missing"], [])
        self.assertEqual(doc["sports"]["sumo"]["noCutout"][0]["cutoutReason"][:8], "headshot")

    def test_missing_writes_json_and_markdown(self):
        self.runner.cmd_missing(SimpleNamespace(sport="all"), self.p)
        md = (self.root / "qa/photo-runner/missing.md").read_text(encoding="utf-8")
        self.assertIn("| Agit Kabayel | WBC heavyweight champion", md)
        self.assertIn("never tried", md)
        self.assertTrue((self.root / "qa/photo-runner/missing.json").exists())


class Staging(Base):
    def test_fetch_writes_nothing_outside_qa(self):
        before = tree(self.root)
        manifest = self.staged_run()
        after = tree(self.root)
        changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
        self.assertTrue(changed)
        self.assertEqual({k for k in changed if not k.startswith("qa/photo-runner/")}, set(),
                         "staging must not touch assets/, data/ or the scripts")
        names = sorted(e["name"] for e in manifest["entries"])
        self.assertEqual(names, ["Agit Kabayel", "Jan Kowalski"])
        run = manifest["runId"]
        stage = self.root / "qa/photo-runner/staging" / run
        self.assertTrue((stage / "contact.png").stat().st_size > 1000)
        for e in manifest["entries"]:
            for field in ("sourcePage", "imageUrl", "credit", "licence", "sha256", "size", "fetchedAt"):
                self.assertTrue(e[field], f"{e['name']}: no {field}")
            self.assertTrue((stage / e["portrait"]).exists())
        blocked = [s for s in manifest["skipped"] if s["name"] == "Pfl Person"]
        self.assertEqual(blocked[0]["category"], "blocked host")
        state = json.loads((self.root / "qa/photo-runner/state.json").read_text())
        self.assertEqual(state["attempts"]["mma|pflperson"]["category"], "blocked host")


    def test_one_image_file_for_several_fighters_is_a_placeholder(self):
        runner = load(REPO, "photo-runner.py")
        with tempfile.TemporaryDirectory() as tmp:
            stage = Path(tmp)
            for n in ("a", "b", "c"):
                Image.new("RGB", (40, 50), "#222").save(stage / f"{n}.webp")
            row = lambda sha: {"sourceUrl": "https://x/1.png", "sha256": sha, "sourceWidth": 40, "sourceHeight": 50}
            entries = [{"sport": "mma", "name": n, "portrait": f"{n.lower()}.webp", "credit": "PFL", "row": row(sha)}
                       for n, sha in (("A", "same"), ("B", "same"), ("C", "own"))]
            skips = []
            m = runner.write_manifest_and_sheet(stage, "t", entries, skips, {})
            self.assertEqual([e["name"] for e in m["entries"]], ["C"])
            self.assertEqual(sorted(x["name"] for x in skips if x["category"] == "placeholder"), ["A", "B"])


class Approve(Base):
    def test_approve_registers_and_records_rejects(self):
        run = self.staged_run()["runId"]
        self.runner.cmd_approve(SimpleNamespace(run_id=run, all=True, only="", reject="Jan Kowalski:two people in frame",
                                                owner_cleared=False, no_cutouts=True), self.p)
        boxing = json.loads((self.root / "data/boxing-image-register.json").read_text())
        row = next(r for r in boxing["images"] if r["name"] == "Agit Kabayel")
        self.assertEqual(row["promoter"], "Matchroom Boxing")
        self.assertRegex(row["attestation"], "2026-11-22")
        self.assertRegex(row["sha256"], "^[0-9a-f]{64}$")
        for f in row["files"].values():
            self.assertTrue((self.root / "assets/img/boxing" / f).exists())
        self.assertEqual([r["id"] for r in boxing["images"]], sorted(r["id"] for r in boxing["images"]))
        # the rejected one is not registered, and is recorded where the MMA intake will not take it back
        mma = json.loads((self.root / "data/mma-image-register.json").read_text())
        self.assertEqual(mma["images"], [])
        self.assertIn("rejected by eye: two people in frame", json.dumps(mma["skipped"]))
        self.assertIn('"jan-kowalski": "two people in frame"', (self.root / "scripts/mma-portrait-intake.py").read_text())
        self.assertIn("jan-kowalski", load(self.root, "mma-portrait-intake.py").REVIEWED_OUT)
        # the page files are regenerated, and the review sheet and summary are kept
        self.assertIn("agit kabayel", (self.root / "assets/local-images.js").read_text())
        self.assertIn("Agit Kabayel", (self.root / "boxing-photo-credits.html").read_text())
        review = self.root / "qa/photo-runner/reviews" / run
        self.assertTrue((review / "contact.png").exists())
        self.assertIn("Jan Kowalski (mma): two people in frame", (review / "summary.md").read_text())
        state = json.loads((self.root / "qa/photo-runner/state.json").read_text())
        self.assertEqual(state["attempts"]["mma|jankowalski"]["category"], "rejected by eye")
        # and the person no longer counts as missing
        doc = self.runner.compute_missing(self.p, ("boxing",))
        self.assertNotIn("Agit Kabayel", [r["name"] for r in doc["sports"]["boxing"]["missing"]])

    def test_ufc_needs_the_owners_statement(self):
        stage = self.root / "qa/photo-runner/staging/r1"
        (stage / "ufc/files").mkdir(parents=True)
        self.runner.write_json(stage / "manifest.json", {"runId": "r1", "entries": [
            {"sport": "ufc", "id": "new-ufc", "name": "New Ufc", "status": "staged", "credit": "ESPN",
             "row": {"id": "new-ufc", "rights": "owner-cleared"}}], "skipped": []})
        with self.assertRaises(SystemExit) as e:
            self.runner.cmd_approve(SimpleNamespace(run_id="r1", all=True, only="", reject="", owner_cleared=False,
                                                    no_cutouts=True), self.p)
        self.assertIn("--owner-cleared", str(e.exception))
        self.assertEqual(json.loads((self.root / "data/ufc-image-register.json").read_text())["missing"], ["hub-only"])

    def test_ufc_espn_goes_through_the_pipelines_own_apply(self):
        stage = self.root / "qa/photo-runner/staging/r2"
        (stage / "ufc/work/raw").mkdir(parents=True)
        rgba = Image.new("RGBA", (600, 436), (0, 200, 0, 0))  # colour under transparency must not show
        rgba.paste(Image.new("RGBA", (200, 300), (120, 80, 60, 255)), (200, 60))
        rgba.save(stage / "ufc/work/raw/hub-only.png")
        data = (stage / "ufc/work/raw/hub-only.png").read_bytes()
        self.runner.write_json(stage / "ufc/work/fetch-report.json", {"hub-only": {
            "status": "downloaded", "name": "Hub Only", "espnId": "1", "url": "https://a.espncdn.com/i/headshots/mma/players/full/1.png",
            "width": 600, "height": 436, "sha256": hashlib.sha256(data).hexdigest(), "new": True}})
        self.runner.write_json(stage / "manifest.json", {"runId": "r2", "entries": [
            {"sport": "ufc", "id": "hub-only", "name": "Hub Only", "status": "staged", "credit": "ESPN", "licence": "x",
             "portrait": "ufc/files/hub-only-portrait.webp", "row": {"id": "hub-only", "rights": "owner-cleared"}}],
            "skipped": []})
        (stage / "contact.png").write_bytes(png())
        self.runner.cmd_approve(SimpleNamespace(run_id="r2", all=True, only="", reject="", owner_cleared=True,
                                                no_cutouts=True), self.p)
        reg = json.loads((self.root / "data/ufc-image-register.json").read_text())
        row = next(r for r in reg["images"] if r["id"] == "hub-only")
        self.assertEqual((row["name"], row["credit"], row["rights"]), ("Hub Only", "ESPN", "owner-cleared"))
        self.assertEqual(reg["missing"], [])
        self.assertIn("1 ESPN headshots of UFC fighters the register did not hold", reg["rightsNote"])
        portrait = Image.open(self.root / "assets/img/ufc/hub-only-portrait.webp").convert("RGB")
        self.assertTrue(all(c > 240 for c in portrait.getpixel((2, 2))),
                        "transparent corners are laid on white, not on the colour hidden under them")

    def test_unknown_names_are_refused(self):
        run = self.staged_run()["runId"]
        with self.assertRaises(SystemExit):
            self.runner.cmd_approve(SimpleNamespace(run_id=run, all=False, only="Nobody", reject="", owner_cleared=False,
                                                    no_cutouts=True), self.p)

    def test_reject_cutout_goes_into_by_eye(self):
        (self.root / "assets/img/ufc-cutouts").mkdir(parents=True)
        Image.new("RGBA", (40, 50)).save(self.root / "assets/img/ufc-cutouts/held-ufc.webp")
        self.runner.cmd_reject_cutout(SimpleNamespace(item="Held Ufc:glove across the face", sport="all"), self.p)
        self.assertIn("held-ufc", load(self.root, "build-ufc-cutouts.py").BY_EYE)
        reg = json.loads((self.root / "data/ufc-cutout-register.json").read_text())
        self.assertEqual(reg["cutouts"]["held-ufc"], {"ok": False, "reason": "dropped by eye: glove across the face"})
        self.assertFalse((self.root / "assets/img/ufc-cutouts/held-ufc.webp").exists())


class Drop(Base):
    def folder(self, *names):
        d = self.root / "drop"
        d.mkdir()
        for n in names:
            (d / n).write_bytes(png())
        return d

    def test_drop_refuses_unknown_names_and_records_the_attestation(self):
        d = self.folder("Agit Kabayel.jpg", "Nobody Here.jpg", "Held Boxer.png")
        attest = "owner, 2026-11-24: I hold the photographer's permission for these"
        manifest = self.runner.cmd_drop(SimpleNamespace(folder=str(d), sport="boxing", credit="Photo: J. Smith",
                                                        attest=attest), self.p)
        self.assertEqual([e["name"] for e in manifest["entries"]], ["Agit Kabayel"])
        refused = {s["name"]: s["reason"] for s in manifest["skipped"]}
        self.assertIn("matches no boxing fighter", refused["Nobody Here.jpg"])
        self.assertIn("already has an approved photo", refused["Held Boxer.png"])
        self.runner.cmd_approve(SimpleNamespace(run_id=manifest["runId"], all=True, only="", reject="",
                                                owner_cleared=False, no_cutouts=True), self.p)
        row = next(r for r in json.loads((self.root / "data/boxing-image-register.json").read_text())["images"]
                   if r["name"] == "Agit Kabayel")
        self.assertEqual((row["rights"], row["credit"], row["attestation"], row["originalFile"]),
                         ("owner-supplied", "Photo: J. Smith", attest, "Agit Kabayel.jpg"))
        self.assertIn("Supplied by the BEFN operator", (self.root / "boxing-photo-credits.html").read_text())

    def test_drop_needs_a_dated_attestation(self):
        d = self.folder("Agit Kabayel.jpg")
        with self.assertRaises(SystemExit):
            self.runner.cmd_drop(SimpleNamespace(folder=str(d), sport="boxing", credit="x", attest="yes"), self.p)


def fake_remover(span=0.8):
    """Stands in for rembg: one opaque upright figure, `span` of the frame's height, on a transparent ground."""
    def remove(im):
        out = Image.new("RGBA", im.size, (0, 0, 0, 0))
        w, h = im.size
        top = int(h * (1 - span) / 2)
        out.paste(Image.new("RGBA", (int(w * 0.27), int(h * span)), (120, 80, 60, 255)), (int(w * 0.36), top))
        return out
    return remove


class FullBody(Base):
    """`drop --kind fullbody` (owner, 25 Nov 2026): full-length photographs for the champions carousel."""
    attest = "owner, 2026-11-25: I took these photographs and BEFN may publish them"

    def folder(self, *names, size=(600, 1000)):
        d = self.root / "drop-full"
        d.mkdir(exist_ok=True)
        for n in names:
            (d / n).write_bytes(png(size=size))
        return d

    def drop(self, d, sport="ufc", attest=None):
        return self.runner.cmd_drop(SimpleNamespace(folder=str(d), sport=sport, credit="Photo: The Owner",
                                                    attest=attest or self.attest, kind="fullbody"), self.p)

    def approve(self, run, remover=None, no_cutouts=False):
        with mock.patch.object(self.runner, "fullbody_remover", lambda: remover or fake_remover()):
            return self.runner.cmd_approve(SimpleNamespace(run_id=run, all=True, only="", reject="", owner_cleared=False,
                                                           no_cutouts=no_cutouts), self.p)

    def test_stages_without_registering_then_approve_writes_the_register(self):
        d = self.folder("Champ Holder.jpg", "Nobody Here.jpg")
        before = tree(self.root)
        # Champ Holder already has a UFC portrait: a full-body photograph is still welcome.
        manifest = self.drop(d)
        self.assertEqual([(e["name"], e["kind"]) for e in manifest["entries"]], [("Champ Holder", "fullbody")])
        self.assertIn("matches no ufc fighter", {s["name"]: s["reason"] for s in manifest["skipped"]}["Nobody Here.jpg"])
        stage = self.root / "qa/photo-runner/staging" / manifest["runId"]
        self.assertTrue((stage / "contact.png").exists())
        self.assertTrue((stage / "fullbody/files/champ-holder.png").exists())
        changed = {k for k, v in tree(self.root).items() if before.get(k) != v}
        self.assertTrue(all(k.startswith("qa/photo-runner/") for k in changed), changed)
        self.approve(manifest["runId"])
        reg = json.loads((self.root / "data/fullbody-cutout-register.json").read_text())
        row = reg["cutouts"]["champ-holder"]
        self.assertEqual((row["ok"], row["sport"], row["credit"], row["attestation"]), (True, "ufc", "Photo: The Owner", self.attest))
        self.assertIn("Champ Holder.jpg", row["source"])
        out = Image.open(self.root / "assets/img/fullbody-cutouts/champ-holder.webp")
        self.assertEqual(out.mode, "RGBA")
        self.assertLess(out.width, out.height, "trimmed to the standing figure")
        # nothing went into the portrait registers, and the review sheet shows the cut-out
        self.assertNotIn("Photo: The Owner", (self.root / "data/ufc-image-register.json").read_text())
        self.assertTrue((self.root / "qa/photo-runner/reviews" / manifest["runId"] / "cutouts.png").exists())
        # a second drop for the same fighter is refused
        again = self.drop(self.folder("Champ Holder.png"))
        self.assertIsNone(again)

    def test_a_figure_that_is_not_full_length_is_recorded_and_not_kept(self):
        manifest = self.drop(self.folder("Champ Holder.jpg"))
        self.approve(manifest["runId"], remover=fake_remover(span=0.4))
        row = json.loads((self.root / "data/fullbody-cutout-register.json").read_text())["cutouts"]["champ-holder"]
        self.assertFalse(row["ok"])
        self.assertIn("not a full-length figure", row["reason"])
        self.assertNotIn("attestation", row)
        self.assertFalse((self.root / "assets/img/fullbody-cutouts/champ-holder.webp").exists())

    def test_needs_a_dated_attestation_a_cut_out_and_ufc_or_boxing(self):
        with self.assertRaises(SystemExit):
            self.drop(self.folder("Champ Holder.jpg"), attest="yes")
        with self.assertRaises(SystemExit):
            self.drop(self.folder("Champ Holder.jpg"), sport="mma")
        manifest = self.drop(self.folder("Agit Kabayel.jpg"), sport="boxing")
        with self.assertRaises(SystemExit):
            self.approve(manifest["runId"], no_cutouts=True)
        self.assertFalse((self.root / "data/fullbody-cutout-register.json").exists())

    def test_command_line_option(self):
        d = self.folder("Agit Kabayel.jpg")
        self.runner.main(["drop", str(d), "--sport", "boxing", "--kind", "fullbody", "--credit", "Photo: The Owner",
                          "--attest", self.attest])
        state = json.loads((self.root / "qa/photo-runner/state.json").read_text())
        self.assertEqual(state["runs"][state["lastRun"]]["kind"], "drop-fullbody")


class Attestations(unittest.TestCase):
    def test_each_promoter_has_its_own_dated_attestation(self):
        mma = load(REPO, "mma-portrait-intake.py")
        self.assertEqual(set(mma.ATTESTATIONS), {"PFL", "ONE Championship", "KSW", "RIZIN", "Cage Warriors"})
        self.assertEqual(set(mma.ADAPTERS), set(mma.ATTESTATIONS), "no adapter for a promoter outside the attestation")
        question = ("For 'MMA (other promotions)', do you confirm BEFN may republish press-kit/media fighter photos "
                    "from these promoters, with the promoter credited?")
        for promoter, text in mma.ATTESTATIONS.items():
            self.assertIn(promoter, text)
            self.assertIn("2026-11-24", text)
            self.assertIn(question, text)
        self.assertTrue(question in (REPO / "docs/design/IMAGE-GUIDE.md").read_text(encoding="utf-8"),
                        "IMAGE-GUIDE records the owner's question verbatim")

    def test_staged_row_carries_its_promoters_attestation_and_credit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = build_repo(Path(tmp))
            mma = load(root, "mma-portrait-intake.py")
            mma.box.get = lambda url, timeout=25: (png(), "image/png")
            mma.ADAPTERS["RIZIN"] = lambda person: (mma.labelled(
                person["name"], "https://cdn.test/naoki-inoue.jpg", person["name"], person["name"]), "https://page", "t")
            added, _, _ = mma.run([{"name": "Naoki Inoue", "promoter": "RIZIN"}], str(root / "qa/stage"), delay=0)
            self.assertEqual((added[0]["credit"], added[0]["attestation"]), ("RIZIN", mma.ATTESTATIONS["RIZIN"]))
            self.assertFalse((root / "data/mma-image-register.json").exists(), "staging registers nothing")

    def test_name_checks(self):
        mma = load(REPO, "mma-portrait-intake.py")
        ok = mma.labelled("Adrian Bartosiński", "https://www.kswmma.com/storage/2026-09/1-bartosinski.png",
                          "Adrian Bartosiński", "Adrian Bartosiński")
        self.assertTrue(ok)
        for url, printed, alt in (
                ("https://x/1840b2b91504f3267dd.jpg", "Tony Laramie", "Tony Laramie"),   # hashed file name
                ("https://x/laramie.jpg", "Makoto Shinryu", "Tony Laramie"),           # page names someone else
                ("https://x/relentless-rewatch-laramie-and-shinryu-showdown.jpg", "Tony Laramie", "Tony Laramie"),
                ("https://x/laramie-30x17.jpg", "Tony Laramie", "Tony Laramie")):
            with self.assertRaises(mma.Refused):
                mma.labelled("Tony Laramie", url, printed, alt)

    def test_rizin_hashed_file_name_needs_the_name_printed_and_on_the_image(self):
        # Owner, 2026-11-24: RIZIN only; the hash replaces the file-name check, nothing else is relaxed.
        mma = load(REPO, "mma-portrait-intake.py")
        self.assertTrue(mma.labelled("Tony Laramie", "https://x/1840b2b91504f3267dd.jpg", "Tony Laramie", "Tony Laramie", hashed_file_ok=True))
        for printed, alt, url in (("Makoto Shinryu", "Tony Laramie", "https://x/1840b2b.jpg"),
                                  ("Tony Laramie", "", "https://x/1840b2b.jpg"),
                                  ("Tony Laramie", "Tony Laramie", "https://x/1840b2b-30x17.jpg")):
            with self.assertRaises(mma.Refused):
                mma.labelled("Tony Laramie", url, printed, alt, hashed_file_ok=True)

    def test_pfl_bucket_403_counts_as_no_robots_file_only_for_that_host(self):
        mma = load(REPO, "mma-portrait-intake.py")
        unreadable = (False, "robots.txt unreadable: HTTP Error 403: Forbidden")
        with mock.patch.object(mma.box, "robots_allows", return_value=unreadable):
            mma._robots.clear()
            mma.host_ok("https://pflmma-prod.s3.amazonaws.com/fighters/jane-doe.png")
            mma._robots.clear()
            with self.assertRaises(mma.Blocked):
                mma.host_ok("https://www.cagewarriors.com/fighters/")
        with mock.patch.object(mma.box, "robots_allows", return_value=(False, "robots.txt disallows claudebot from /")):
            mma._robots.clear()
            with self.assertRaises(mma.Blocked):
                mma.host_ok("https://pflmma-prod.s3.amazonaws.com/fighters/jane-doe.png")
        with mock.patch.object(mma.box, "robots_allows", return_value=(False, "robots.txt unreadable: timed out")):
            mma._robots.clear()
            with self.assertRaises(mma.Blocked):
                mma.host_ok("https://pflmma-prod.s3.amazonaws.com/fighters/jane-doe.png")
        mma._robots.clear()

    def test_rizin_photo_host_404_counts_as_no_robots_file_only_for_that_host(self):
        mma = load(REPO, "mma-portrait-intake.py")
        with mock.patch.object(mma.box, "robots_allows", return_value=(False, "robots.txt unreadable: HTTP Error 404: Not Found")):
            mma._robots.clear()
            mma.host_ok("https://d1uzk9o9cg136f.cloudfront.net/img/abc.jpg")
            mma._robots.clear()
            with self.assertRaises(mma.Blocked):
                mma.host_ok("https://pflmma-prod.s3.amazonaws.com/x.png")
            mma._robots.clear()
            with self.assertRaises(mma.Blocked):
                mma.host_ok("https://www.cagewarriors.com/fighters/")
        mma._robots.clear()


class DictLiteral(unittest.TestCase):
    def test_add_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts/x.py").write_text('A = 1\nBY_EYE = {\n    "a": "b",\n}\n')
            shutil.copy(REPO / "scripts/photo-runner.py", root / "scripts/photo-runner.py")
            runner = load(root, "photo-runner.py")
            self.assertTrue(runner.add_to_dict_literal("x.py", "BY_EYE", "new-one", 'said "no"'))
            self.assertFalse(runner.add_to_dict_literal("x.py", "BY_EYE", "new-one", "again"))
            ns = {}
            exec((root / "scripts/x.py").read_text(), ns)
            self.assertEqual(ns["BY_EYE"], {"a": "b", "new-one": 'said "no"'})


if __name__ == "__main__":
    unittest.main()
