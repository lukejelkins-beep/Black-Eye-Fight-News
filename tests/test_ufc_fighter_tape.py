"""Tests for scripts/build-ufc-fighter-tape.py. Offline: inline CSV text, no network."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("tape", ROOT / "scripts/build-ufc-fighter-tape.py")
tape = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tape)

CSV = ('FIGHTER,HEIGHT,WEIGHT,REACH,STANCE,DOB,URL\n'
       'Jiří Procházka,"6\' 3""",205 lbs.,"80""",Orthodox,"Oct 14, 1992",u\n'
       'Tom Aaron,--,155 lbs.,--,,"Jul 13, 1978",u\n'
       'Sam Twin,"5\' 9""",155 lbs.,"70""",Southpaw,"Jan 01, 1990",u\n'
       'Sam Twin,"6\' 0""",170 lbs.,"72""",Orthodox,"Jan 01, 1991",u\n'
       'Blank Row,--,--,--,,--,u\n')
INDEX = tape.index_export(CSV)


class Parsing(unittest.TestCase):
    def test_height_reach_weight_born(self):
        self.assertEqual(tape.parse_height("6' 3\""), 75)
        self.assertEqual(tape.parse_reach('80"'), 80)
        self.assertEqual(tape.parse_weight("205 lbs."), 205)
        self.assertEqual(tape.parse_born("Oct 14, 1992"), "1992-10-14")

    def test_missing_or_odd_values_are_none_not_zero(self):
        for fn in (tape.parse_height, tape.parse_reach, tape.parse_weight, tape.parse_born, tape.parse_stance):
            self.assertIsNone(fn("--"))
            self.assertIsNone(fn(""))
            self.assertIsNone(fn(None))
        self.assertIsNone(tape.parse_height("9' 9\""))
        self.assertIsNone(tape.parse_born("Jan 01, 1800"))


class Build(unittest.TestCase):
    names = {"jiriprochazka": "Jiří Procházka", "tomaaron": "Tom Aaron", "samtwin": "Sam Twin",
             "blankrow": "Blank Row", "nobody": "No Body"}
    out = tape.build(names, INDEX)

    def test_accents_ignored_and_values_kept(self):
        self.assertEqual(self.out["fighters"]["jiriprochazka"],
                         {"heightIn": 75, "reachIn": 80, "weightLb": 205, "stance": "Orthodox", "born": "1992-10-14"})

    def test_partial_rows_keep_only_what_is_known(self):
        self.assertEqual(self.out["fighters"]["tomaaron"], {"weightLb": 155, "born": "1978-07-13"})

    def test_duplicate_name_is_ambiguous_and_left_out(self):
        self.assertNotIn("samtwin", self.out["fighters"])
        self.assertEqual(self.out["coverage"]["ambiguous"], ["Sam Twin"])

    def test_empty_row_and_unknown_name_are_left_out(self):
        self.assertNotIn("blankrow", self.out["fighters"])
        self.assertEqual(self.out["coverage"]["notFound"], ["No Body"])

    def test_output_is_deterministic(self):
        self.assertEqual(tape.build(self.names, INDEX), self.out)


if __name__ == "__main__":
    unittest.main()
