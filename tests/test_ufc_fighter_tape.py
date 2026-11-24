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


def _snap(pool, matched_keys):
    fighters = {k: {"heightIn": 70} for k in matched_keys}
    return {"fighters": fighters, "coverage": {"cardFighters": pool, "matched": len(fighters)},
            "cardKeys": [f"f{i}" for i in range(pool)]}


class Guard(unittest.TestCase):
    """QA audit A04: judge coverage of the current card, not the raw count."""

    def test_card_rollover_to_smaller_event_is_allowed(self):
        # 24 Nov 2026: 59 of 60 matched, then the card rolled over to 41 of 42.
        before = _snap(60, [f"f{i}" for i in range(59)])
        after = _snap(42, [f"f{i}" for i in range(41)])
        self.assertIsNone(tape.guard_problem(before, after))

    def test_rollover_to_entirely_new_fighters_is_allowed(self):
        before = _snap(60, [f"f{i}" for i in range(59)])
        after = {"fighters": {f"n{i}": {} for i in range(41)},
                 "coverage": {"cardFighters": 42, "matched": 41}, "cardKeys": [f"n{i}" for i in range(42)]}
        self.assertIsNone(tape.guard_problem(before, after))

    def test_same_card_with_a_corrupt_export_is_refused(self):
        before = _snap(60, [f"f{i}" for i in range(59)])
        after = _snap(60, [f"f{i}" for i in range(20)])
        self.assertIn("match rate fell", tape.guard_problem(before, after))

    def test_fighters_still_on_the_card_losing_matches_is_refused(self):
        # Rate looks fine because new fighters match, but most returning fighters vanished.
        before = _snap(20, [f"f{i}" for i in range(20)])
        after = {"fighters": {**{f"f{i}": {} for i in range(3)}, **{f"n{i}": {} for i in range(17)}},
                 "coverage": {"cardFighters": 20, "matched": 20},
                 "cardKeys": [f"f{i}" for i in range(10)] + [f"n{i}" for i in range(17)]}
        self.assertIn("lost their match", tape.guard_problem(before, after))

    def test_small_overlap_is_not_judged(self):
        before = _snap(10, [f"f{i}" for i in range(10)])
        after = {"fighters": {f"n{i}": {} for i in range(10)}, "coverage": {"cardFighters": 10, "matched": 10},
                 "cardKeys": [f"f{i}" for i in range(3)] + [f"n{i}" for i in range(10)]}
        self.assertIsNone(tape.guard_problem(before, after))

    def test_no_previous_coverage_is_allowed(self):
        self.assertIsNone(tape.guard_problem({}, _snap(42, [f"f{i}" for i in range(41)])))


if __name__ == "__main__":
    unittest.main()
