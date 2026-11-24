"""Tests for scripts/build-ufc-fighter-countries.py. Offline: inline wikitext rows, no network."""
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("countries", ROOT / "scripts/build-ufc-fighter-countries.py")
countries = importlib.util.module_from_spec(spec)
spec.loader.exec_module(countries)

WIKI = """
|-
|{{#invoke:flag|icon|ARM}}
|{{sortname|Arman|Tsarukyan}}
|{{age nts|1996|10|11}}
|-
|{{#invoke:flag|icon|ENG}}
|[[Paddy Pimblett]]
|-
|{{#invoke:flag|icon|NED}}
|[[Tom Nolan (fighter)|Tom Nolan]]
|-
|{{dts|2026|Nov|20}}
|{{#invoke:flag|icon|KOR}}
|Lee Jeong-yeong
|''The Korean Tiger''
|-
|{{#invoke:flag|icon|USA}}
| [[UFC 332|October 3, 2026]]
|-
|{{#invoke:flag|icon|GEO}}<br>{{#invoke:flag|icon|ESP}}
|{{sortname|Ilia|Topuria}}
|-
|{{#invoke:flag|icon|BRA}}
|[[Jose Silva]]
|-
|{{#invoke:flag|icon|POR}}
|[[Jose Silva]]
"""


class Parse(unittest.TestCase):
    def setUp(self):
        self.found = countries.parse(WIKI)

    def test_sortname_link_and_plain_text_names(self):
        self.assertEqual(self.found["armantsarukyan"], {"am"})
        self.assertEqual(self.found["paddypimblett"], {"gb-eng"})
        self.assertEqual(self.found["tomnolan"], {"nl"})
        self.assertEqual(self.found["leejeongyeong"], {"kr"})

    def test_dates_and_two_flag_rows_are_left_out(self):
        self.assertFalse(any(ch.isdigit() for key in self.found for ch in key))
        self.assertNotIn("iliatopuria", self.found)

    def test_conflicting_name_keeps_both_codes_so_main_skips_it(self):
        self.assertEqual(self.found["josesilva"], {"br", "pt"})

    def test_unknown_code_fails(self):
        with self.assertRaises(SystemExit):
            countries.parse("|-\n|{{#invoke:flag|icon|XYZ}}\n|[[A Person]]\n")

    def test_korean_names_and_plain_letters_get_extra_keys(self):
        found = countries.parse("|-\n|{{#invoke:flag|icon|KOR}}\n|Lee Jeong-yeong\n|-\n|{{#invoke:flag|icon|POL}}\n|{{sortname|Robert|Ruchała}}\n")
        self.assertEqual(found["leejeongyeong"], {"kr"})
        self.assertEqual(found["jeongyeonglee"], {"kr"})
        self.assertEqual(found["robertruchala"], {"pl"})

    def test_fold_matches_the_site(self):
        self.assertEqual(countries.fold("Jiří Procházka"), "jiriprochazka")


class Data(unittest.TestCase):
    def test_every_country_has_a_flag_file(self):
        data = json.loads((ROOT / "data/ufc-fighter-countries.json").read_text(encoding="utf-8"))
        missing = {c for c in data["fighters"].values() if not (ROOT / "assets/img/flags" / f"{c}.svg").exists()}
        self.assertEqual(missing, set())


if __name__ == "__main__":
    unittest.main()
