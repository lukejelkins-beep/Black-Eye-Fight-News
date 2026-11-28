"""Tests for scripts/build-ufc-fighter-gyms.py. Offline: inline Sherdog-shaped HTML, no network."""
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("gyms", ROOT / "scripts/build-ufc-fighter-gyms.py")
gyms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gyms)


def search_html(*rows):
    body = "".join(f"<tr><td><a href=\"{p}\">{n}</a></td></tr>" for p, n in rows)
    return f"<table>{body}</table>"


PAGE = """
<div><a itemprop="url" href="/stats/fightfinder?association=Eagles+MMA"><span>Eagles MMA</span></a>
<a href="/stats/fightfinder?association=American+Kickboxing+Academy">American Kickboxing Academy</a>
<a href="/stats/fightfinder?association=Eagles+MMA">Eagles MMA</a></div>
"""


class Parsing(unittest.TestCase):
    def test_search_rows(self):
        html = search_html(("/fighter/Islam-Makhachev-76836", "Islam Makhachev"), ("/fighter/Jose-Silva-1", "Jose Silva"))
        self.assertEqual(gyms.parse_search(html)[0], ("/fighter/Islam-Makhachev-76836", "Islam Makhachev"))
        self.assertEqual(len(gyms.parse_search(html)), 2)

    def test_gyms_in_page_order_without_repeats(self):
        self.assertEqual(gyms.parse_gyms(PAGE), ["Eagles MMA", "American Kickboxing Academy"])

    def test_page_without_association(self):
        self.assertEqual(gyms.parse_gyms("<div>nothing here</div>"), [])

    def test_fold_matches_accents_and_punctuation(self):
        self.assertEqual(gyms.fold("Jiří Procházka"), gyms.fold("Jiri Prochazka"))

    def test_match_needs_exactly_one_same_name(self):
        rows = [("/fighter/A-1", "Jose Silva"), ("/fighter/B-2", "Jose Silva"), ("/fighter/C-3", "Jose Silvas")]
        self.assertIsNone(gyms.match("Jose Silva", rows))
        self.assertEqual(gyms.match("Jose Silvas", rows), "/fighter/C-3")
        self.assertIsNone(gyms.match("Nobody", rows))


class Build(unittest.TestCase):
    def test_build_sorts_fighters_into_found_ambiguous_missing_and_no_gym(self):
        names = {gyms.fold(n): n for n in ["Islam Makhachev", "Jose Silva", "Ghost Fighter", "Plain Fighter"]}
        pages = {
            "Islam Makhachev": search_html(("/fighter/Islam-1", "Islam Makhachev")),
            "Jose Silva": search_html(("/fighter/Jose-1", "Jose Silva"), ("/fighter/Jose-2", "Jose Silva")),
            "Ghost Fighter": search_html(("/fighter/Other-1", "Someone Else")),
            "Plain Fighter": search_html(("/fighter/Plain-1", "Plain Fighter")),
        }
        profile = {"/fighter/Islam-1": PAGE, "/fighter/Plain-1": "<div></div>"}
        out = gyms.build(names, pages.get, profile.get)
        self.assertEqual(out["fighters"], {"islammakhachev": ["Eagles MMA", "American Kickboxing Academy"]})
        c = out["coverage"]
        self.assertEqual(c["ambiguous"], ["josesilva"])
        self.assertEqual(c["notFound"], ["ghostfighter"])
        self.assertEqual(c["noGymListed"], ["plainfighter"])
        self.assertEqual(c["statsFighters"], 4)
        self.assertEqual(out["schema"], 1)


class SavedFile(unittest.TestCase):
    def test_saved_file_shape(self):
        path = ROOT / "data/ufc-fighter-gyms.json"
        if not path.exists():
            self.skipTest("no saved file yet")
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(data["schema"], 1)
        self.assertTrue(data["fighters"])
        for key, lst in data["fighters"].items():
            self.assertEqual(key, gyms.fold(key))
            self.assertTrue(lst and all(isinstance(x, str) and x for x in lst))
        c = data["coverage"]
        self.assertEqual(c["withGym"], len(data["fighters"]))


if __name__ == "__main__":
    unittest.main()
