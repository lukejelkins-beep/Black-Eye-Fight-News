"""Tests for scripts/build-ufc-round-breakdown-repairs.py and the repair step of scripts/build-ufc-stats.py. Offline."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rep = load("rep", "scripts/build-ufc-round-breakdown-repairs.py")
stats = load("stats", "scripts/build-ufc-stats.py")

GOOD = {"sig": (17, 30), "head": (15, 20), "body": (2, 5), "leg": (0, 5),
        "distance": (3, 6), "clinch": (3, 8), "ground": (11, 16)}


class Export(unittest.TestCase):
    def test_a_round_adds_up_only_when_landed_and_attempted_match_in_both_breakdowns(self):
        self.assertTrue(rep.adds_up(GOOD))
        for key, val in (("head", (22, 20)), ("ground", (9, 16)), ("leg", (0, 9)), ("body", (None, None))):
            self.assertFalse(rep.adds_up({**GOOD, key: val}), key)

    def test_find_matches_within_a_day_and_never_guesses_between_two(self):
        rounds = {("a", "b", "2026-08-08", 1): GOOD}
        self.assertIs(rep.find(rounds, "a", "b", "2026-08-09", 1), GOOD)
        self.assertIsNone(rep.find(rounds, "a", "b", "2026-08-12", 1))
        self.assertIsNone(rep.find(rounds, "a", "b", "2026-08-08", 2))
        rounds[("a", "b", "2026-08-09", 1)] = GOOD
        self.assertIsNone(rep.find(rounds, "a", "b", "2026-08-08", 1), "two candidates days apart: ambiguous")

    def test_export_rows_are_read_with_dates_and_rounds(self):
        stats_csv = ("EVENT,BOUT,ROUND,FIGHTER,KD,SIG.STR.,SIG.STR. %,TOTAL STR.,TD,TD %,SUB.ATT,REV.,CTRL,HEAD,BODY,LEG,"
                     "DISTANCE,CLINCH,GROUND\nUFC X,Ann Lee vs. Bo Ray,Round 1,Ann Lee,0,17 of 30,56%,17 of 30,0 of 0,---,0,0,0:10,"
                     "15 of 20,2 of 5,0 of 5,3 of 6,3 of 8,11 of 16\n")
        events = "EVENT,DATE\nUFC X,\"August 08, 2026\"\n"
        out = rep.export_rounds(stats_csv, events)
        self.assertEqual(out[("annlee", "boray", "2026-08-08", 1)], GOOD)


class Applied(unittest.TestCase):
    def fight(self):
        side = {k: 0 for k in stats.COUNTS}
        return {"boutId": "9", "a": {"slug": "ann", "name": "Ann"}, "b": {"slug": None, "name": "Bo"},
                "rounds": [{"round": 1, "a": dict(side), "b": dict(side)}, {"round": 2, "a": dict(side), "b": dict(side)}]}

    def test_only_the_saved_round_of_the_saved_fighter_is_changed(self):
        f = self.fight()
        vals = [15, 20, 2, 5, 0, 5, 3, 6, 3, 8, 11, 16]
        done = stats.apply_breakdown_repairs([f], {"ann": {"9": {"1": vals}}})
        self.assertEqual(done, 1)
        self.assertEqual(f["rounds"][0]["a"]["headLanded"], 15)
        self.assertEqual(f["rounds"][0]["a"]["groundAttempted"], 16)
        self.assertEqual(f["rounds"][0]["a"]["sigLanded"], 0, "nothing else in the round is touched")
        self.assertEqual(f["rounds"][1]["a"]["headLanded"], 0, "another round")
        self.assertEqual(f["rounds"][0]["b"]["headLanded"], 0, "the other corner")

    def test_a_malformed_or_absent_repair_changes_nothing(self):
        f = self.fight()
        self.assertEqual(stats.apply_breakdown_repairs([f], {"ann": {"9": {"1": [1, 2, 3]}}}), 0)
        self.assertEqual(stats.apply_breakdown_repairs([f], {}), 0)
        self.assertEqual(stats.apply_breakdown_repairs([f], {"ann": {"8": {"1": [0] * 12}}}), 0)

    def test_a_missing_repairs_file_is_survivable(self):
        with tempfile.TemporaryDirectory() as t:
            self.assertEqual(stats.load_repairs(pathlib.Path(t) / "none.json"), {})

    def test_the_saved_file_holds_twelve_figures_per_round_that_add_up(self):
        data = json.loads((ROOT / "data/ufc-round-breakdown-repairs.json").read_text())
        self.assertEqual(data["schema"], 1)
        n = 0
        for slug, bouts in data["repairs"].items():
            for bout, rounds in bouts.items():
                for rnd, v in rounds.items():
                    n += 1
                    self.assertEqual(len(v), 12, (slug, bout, rnd))
                    self.assertEqual(v[0] + v[2] + v[4], v[6] + v[8] + v[10], "landed breakdowns agree")
                    self.assertEqual(v[1] + v[3] + v[5], v[7] + v[9] + v[11], "attempted breakdowns agree")
        self.assertEqual(n, data["coverage"]["repaired"])
        self.assertGreater(n, 3000)


if __name__ == "__main__":
    unittest.main()
