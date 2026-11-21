"""Tests for scripts/build-ufc-weight-classes.py (Phase 3 step 1b). Offline: inline CSV text, no network."""
import datetime as dt
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("wc", ROOT / "scripts/build-ufc-weight-classes.py")
wc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wc)
D = dt.date

EVENTS = "EVENT,URL,DATE,LOCATION\nUFC 1,u,\"June 07, 2025\",x\nUFC 2,u,\"June 14, 2025\",x\nUFC 3,u,\"June 21, 2025\",x\n"
RESULTS = ("EVENT,BOUT,OUTCOME,WEIGHTCLASS,METHOD,ROUND,TIME,TIME FORMAT,REFEREE,DETAILS,URL\n"
           "UFC 1,Jiří Procházka vs. Aleksandar Rakić,W/L,Light Heavyweight Bout,KO,1,1:00,3 Rnd,r,d,u\n"
           "UFC 1,Ann Lee vs. Bea Kim,W/L,UFC Women's Strawweight Title Bout,Dec,5,5:00,5 Rnd,r,d,u\n"
           "UFC 2,Cy Dee vs. Ed Fox,W/L,Interim UFC Lightweight Title Bout,Dec,5,5:00,5 Rnd,r,d,u\n"
           "UFC 2,Gus Hall vs. Ian Jay,W/L,Catch Weight Bout,Dec,3,5:00,3 Rnd,r,d,u\n"
           "UFC 2,Kit Low vs. Max Ng,W/L,UFC Superfight Championship Bout,Dec,3,5:00,3 Rnd,r,d,u\n"
           "UFC 3,Cy Dee vs. Ed Fox,W/L,Welterweight Bout,Dec,3,5:00,3 Rnd,r,d,u\n")
INDEX = wc.index_export(EVENTS, RESULTS)


def pair(a, b):
    return tuple(sorted((wc.norm(a), wc.norm(b))))


class Wording(unittest.TestCase):
    def test_plain_class_from_title_interim_and_bout_wording(self):
        self.assertEqual(wc.weight_class("Lightweight Bout"), "Lightweight")
        self.assertEqual(wc.weight_class("UFC Light Heavyweight Title Bout"), "Light Heavyweight")
        self.assertEqual(wc.weight_class("UFC Interim Heavyweight Title Bout"), "Heavyweight")
        self.assertEqual(wc.weight_class(" UFC  Women's Bantamweight Title Bout "), "Women's Bantamweight")
        self.assertEqual(wc.weight_class("Catch Weight Bout"), "Catch Weight")

    def test_unknown_or_empty_wording_is_none_not_a_guess(self):
        for raw in ("UFC Superfight Championship Bout", "Ultimate Ultimate Tournament Title Bout", "", None, "Super Heavyweight Bout"):
            self.assertIsNone(wc.weight_class(raw), raw)

    def test_catch_and_open_weight_never_count_as_a_division(self):
        self.assertNotIn("Catch Weight", wc.STANDARD)
        self.assertNotIn("Open Weight", wc.STANDARD)


class Matching(unittest.TestCase):
    def test_exact_date_with_accents_and_punctuation_ignored(self):
        self.assertEqual(wc.match(INDEX, D(2025, 6, 7), pair("Jiri Prochazka", "Aleksandar Rakic")), "Light Heavyweight Bout")

    def test_one_day_either_side_when_only_one_candidate(self):
        self.assertEqual(wc.match(INDEX, D(2025, 6, 8), pair("Ann Lee", "Bea Kim")), "UFC Women's Strawweight Title Bout")
        self.assertEqual(wc.match(INDEX, D(2025, 6, 6), pair("Ann Lee", "Bea Kim")), "UFC Women's Strawweight Title Bout")

    def test_two_days_away_is_unmatched(self):
        self.assertIsNone(wc.match(INDEX, D(2025, 6, 9), pair("Ann Lee", "Bea Kim")))

    def test_rematch_picks_the_exact_date_and_ambiguity_stays_unlabelled(self):
        self.assertEqual(wc.match(INDEX, D(2025, 6, 14), pair("Cy Dee", "Ed Fox")), "Interim UFC Lightweight Title Bout")
        self.assertEqual(wc.match(INDEX, D(2025, 6, 21), pair("Cy Dee", "Ed Fox")), "Welterweight Bout")
        # a rematch a week apart, queried on a date between the two with both one day away, is ambiguous
        index = wc.index_export("EVENT,URL,DATE,LOCATION\nA,u,\"June 07, 2025\",x\nB,u,\"June 09, 2025\",x\n",
                                "EVENT,BOUT,OUTCOME,WEIGHTCLASS,METHOD,ROUND,TIME,TIME FORMAT,REFEREE,DETAILS,URL\n"
                                "A,P Q vs. R S,W/L,Lightweight Bout,d,3,5:00,3,r,d,u\nB,P Q vs. R S,W/L,Welterweight Bout,d,3,5:00,3,r,d,u\n")
        self.assertIsNone(wc.match(index, D(2025, 6, 8), pair("P Q", "R S")))

    def test_unknown_pair_and_bad_rows(self):
        self.assertIsNone(wc.match(INDEX, D(2025, 6, 7), pair("No One", "Nobody")))
        index = wc.index_export("EVENT,URL,DATE,LOCATION\nA,u,not a date,x\n", "EVENT,BOUT,OUTCOME,WEIGHTCLASS\nA,X vs. Y,W,Lightweight Bout\nA,No versus,W,Lightweight Bout\n")
        self.assertEqual(dict(index), {})


class Divisions(unittest.TestCase):
    def test_current_division_run_and_previous(self):
        fights = [(D(2024, 1, 1), "Featherweight"), (D(2024, 6, 1), "Featherweight"), (D(2025, 1, 1), "Lightweight")]
        s = wc.division_summary(fights)
        self.assertEqual((s["division"], s["fightsInDivision"], s["previousDivision"], s["newToDivision"]), ("Lightweight", 1, "Featherweight", True))

    def test_settled_after_three_fights(self):
        fights = [(D(2023, 1, 1), "Featherweight")] + [(D(2024, m, 1), "Lightweight") for m in (1, 3, 5)]
        s = wc.division_summary(fights)
        self.assertEqual((s["fightsInDivision"], s["newToDivision"]), (3, False))

    def test_never_moved_is_not_new_even_with_one_fight(self):
        s = wc.division_summary([(D(2025, 1, 1), "Flyweight")])
        self.assertEqual((s["previousDivision"], s["newToDivision"]), (None, False))

    def test_catch_weight_and_unlabelled_fights_do_not_change_the_division(self):
        fights = [(D(2024, 1, 1), "Welterweight"), (D(2024, 5, 1), "Catch Weight"), (D(2024, 9, 1), None), (D(2025, 1, 1), "Welterweight")]
        s = wc.division_summary(fights)
        self.assertEqual((s["division"], s["fightsInDivision"], s["labelledFights"]), ("Welterweight", 2, 2))

    def test_no_standard_fight_gives_no_division(self):
        self.assertIsNone(wc.division_summary([(D(2024, 1, 1), "Catch Weight"), (D(2024, 2, 1), None)]))
        self.assertIsNone(wc.division_summary([]))

    def test_order_of_input_does_not_matter(self):
        a = [(D(2025, 1, 1), "Lightweight"), (D(2024, 1, 1), "Featherweight")]
        self.assertEqual(wc.division_summary(a), wc.division_summary(list(reversed(a))))


class Build(unittest.TestCase):
    bouts = {
        "1": {"date": D(2025, 6, 7), "pair": pair("Jiri Prochazka", "Aleksandar Rakic"), "slugs": ("aleksandar-rakic", "jiri-prochazka")},
        "2": {"date": D(2025, 6, 7), "pair": pair("Ann Lee", "Bea Kim"), "slugs": ("ann-lee", "bea-kim")},
        "3": {"date": D(2025, 6, 9), "pair": pair("Ann Lee", "Bea Kim"), "slugs": ("ann-lee", "bea-kim")},
        "4": {"date": D(2025, 6, 7), "pair": pair("Ghost", "Nobody"), "slugs": ("ghost", None)},
        "5": {"date": D(2025, 6, 14), "pair": pair("Gus Hall", "Ian Jay"), "slugs": ("gus-hall", "ian-jay")},
    }

    def test_labels_coverage_and_fighters(self):
        out = wc.build(self.bouts, INDEX, "2026-11-14")
        self.assertEqual(out["bouts"], {"1": "Light Heavyweight", "2": "Women's Strawweight", "5": "Catch Weight"})
        self.assertEqual(out["coverage"], {"bouts": 5, "labelled": 3, "unlabelled": 2, "share": 0.6})
        self.assertEqual(out["fighters"]["jiri-prochazka"]["division"], "Light Heavyweight")
        self.assertNotIn("ghost", out["fighters"], "no labelled fight, no division")
        self.assertNotIn("gus-hall", out["fighters"], "catch weight only is not a division")

    def test_empty_input(self):
        out = wc.build({}, {}, None)
        self.assertEqual((out["bouts"], out["fighters"], out["coverage"]["share"]), ({}, {}, None))

    def test_deterministic(self):
        a, b = wc.build(self.bouts, INDEX), wc.build(dict(reversed(list(self.bouts.items()))), INDEX)
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))
        self.assertNotIn("builtAt", json.dumps(a))


if __name__ == "__main__":
    unittest.main()
