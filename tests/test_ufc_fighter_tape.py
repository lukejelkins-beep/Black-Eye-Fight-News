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


class Pool(unittest.TestCase):
    """25 Nov 2026: the tape covers finished UFC bouts too, and future ones join by themselves."""
    CSV2 = ('FIGHTER,HEIGHT,WEIGHT,REACH,STANCE,DOB,URL\n'
            'Jan Blachowicz,"6\' 2""",205 lbs.,"78""",Orthodox,"Feb 24, 1983",u\n'
            'Levi Rodrigues,"5\' 10""",185 lbs.,"73""",Orthodox,"Jan 01, 1992",u\n'
            'Kai Kamaka III,"5\' 9""",145 lbs.,"70""",Orthodox,"Jan 01, 1996",u\n'
            'Ann Smith Jr.,"5\' 8""",155 lbs.,"68""",Southpaw,"Jan 01, 1994",u\n')
    INDEX2 = tape.index_export(CSV2)

    def build(self, display):
        names = {tape.fold(display): display}
        return tape.build(names, self.INDEX2)

    def test_letters_nfkd_cannot_split_are_matched_but_the_key_stays_the_pages_key(self):
        out = self.build("Jan Błachowicz")
        self.assertEqual(list(out["fighters"]), ["janbachowicz"], "key is fold() of the card name, as the page computes it")
        self.assertEqual(out["fighters"]["janbachowicz"]["reachIn"], 78)

    def test_card_suffix_the_export_leaves_off(self):
        self.assertEqual(self.build("Levi Rodrigues Jr.")["fighters"]["levirodriguesjr"]["heightIn"], 70)

    def test_export_suffix_the_card_leaves_off(self):
        self.assertEqual(self.build("Kai Kamaka")["fighters"]["kaikamaka"]["heightIn"], 69)
        self.assertEqual(self.build("Ann Smith")["fighters"]["annsmith"]["stance"], "Southpaw")

    def test_results_names_join_the_pool(self):
        import json, tempfile
        results = {"results": [
            {"eventId": "ufc-x-2026-11-21", "event": "UFC Fight Night: X", "fighters": [{"name": "Navajo Stirling"}, {"name": "Jiří Procházka"}]},
            {"eventId": "pfl-y-2026-11-21", "event": "PFL 10", "fighters": [{"name": "Not Ufc"}]},
            {"eventId": "misc", "event": "UFC 400", "fighters": [{"name": "Name Only"}, {"name": None}, {}]},
        ]}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(results, f)
        got = tape.result_names(f.name)
        self.assertEqual(got, {"navajostirling": "Navajo Stirling", "jiriprochazka": "Jiří Procházka", "nameonly": "Name Only"})
        self.assertEqual(tape.result_names("/nonexistent/results.json"), {}, "a missing results file is an empty pool, not a crash")


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
