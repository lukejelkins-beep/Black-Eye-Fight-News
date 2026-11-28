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


def record_page(w, l, gym):
    return (f'<div class="wins"><div class="win"><span>Wins</span><span>{w}</span></div></div>'
            f'<div class="loses"><div class="lose"><span>Losses</span><span>{l}</span></div></div>'
            f'<a href="/stats/fightfinder?association={gym}">{gym}</a>')


class SameName(unittest.TestCase):
    NAMES = {"josesilva": "Jose Silva"}
    SEARCH = {"Jose Silva": search_html(("/fighter/Jose-1", "Jose Silva"), ("/fighter/Jose-2", "Jose Silva"))}

    def run_build(self, pages, records):
        return gyms.build(self.NAMES, self.SEARCH.get, pages.get, records)

    def test_parse_record(self):
        self.assertEqual(gyms.parse_record(record_page(12, 3, "X")), (12, 3))
        self.assertIsNone(gyms.parse_record("<div></div>"))

    def test_same_name_resolved_by_matching_record(self):
        pages = {"/fighter/Jose-1": record_page(5, 1, "Gym One"), "/fighter/Jose-2": record_page(12, 3, "Gym Two")}
        out = self.run_build(pages, {"josesilva": (12, 3)})
        self.assertEqual(out["fighters"], {"josesilva": ["Gym Two"]})
        self.assertEqual(out["coverage"]["ambiguous"], [])

    def test_same_name_left_out_when_no_record_or_a_tie_or_no_match(self):
        tie = {"/fighter/Jose-1": record_page(12, 3, "A"), "/fighter/Jose-2": record_page(12, 3, "B")}
        none = {"/fighter/Jose-1": record_page(5, 1, "A"), "/fighter/Jose-2": record_page(6, 1, "B")}
        for pages, rec in ((tie, {"josesilva": (12, 3)}), (none, {"josesilva": (12, 3)}), (none, {})):
            out = self.run_build(pages, rec)
            self.assertEqual(out["fighters"], {})
            self.assertEqual(out["coverage"]["ambiguous"], ["josesilva"])


class Refresh(unittest.TestCase):
    def test_known_fighters_are_read_again_without_a_search_and_keep_their_path(self):
        names = {"islammakhachev": "Islam Makhachev"}
        def no_search(_):
            raise AssertionError("a matched fighter must not be searched again")
        out = gyms.build(names, no_search, {"/fighter/Islam-1": PAGE}.get, known={"islammakhachev": "/fighter/Islam-1"})
        self.assertEqual(out["fighters"]["islammakhachev"], ["Eagles MMA", "American Kickboxing Academy"])
        self.assertEqual(out["sherdog"], {"islammakhachev": "/fighter/Islam-1"})

    def test_a_fighter_whose_gym_vanished_drops_out_instead_of_keeping_stale_data(self):
        out = gyms.build({"islammakhachev": "Islam Makhachev"}, lambda n: "", {"/fighter/Islam-1": "<div></div>"}.get,
                         known={"islammakhachev": "/fighter/Islam-1"})
        self.assertEqual(out["fighters"], {})
        self.assertEqual(out["coverage"]["noGymListed"], ["islammakhachev"])


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
        self.assertEqual(set(data["sherdog"]), set(data["fighters"]))
        self.assertTrue(all(v.startswith("/fighter/") for v in data["sherdog"].values()))


if __name__ == "__main__":
    unittest.main()
