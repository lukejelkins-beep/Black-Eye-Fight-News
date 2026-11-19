"""Tests for scripts/build-ufc-stats.py (pure calculation over saved evidence)."""
import datetime as dt
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("stats", ROOT / "scripts/build-ufc-stats.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def side(**values):
    base = {k: 0 for k in m.COUNTS}
    base.update(values)
    for landed, attempted in m.PAIRS:  # attempts default to at least what landed
        if attempted not in values and isinstance(base[landed], int):
            base[attempted] = max(base[attempted], base[landed])
    return base


def bout(result, a="Alpha One", b="Bravo Two", status="completed", bid="1"):
    return {"id": bid, "status": status, "org": "ufc", "eventDate": "2026-01-10", "event": "UFC Test",
            "titleFight": False, "main": True, "result": result,
            "a": {"id": "11", "name": a, "slug": m.norm(a)}, "b": {"id": "22", "name": b, "slug": m.norm(b)}}


def archive(rounds, first="Alpha One", second="Bravo Two"):
    return {"fighterA": first, "fighterB": second, "rounds": rounds}


class CageTime(unittest.TestCase):
    def test_round_lengths_from_official_clock(self):
        self.assertEqual(m.round_lengths({"round": 3, "time": "5:00"}), [300, 300, 300])
        self.assertEqual(m.round_lengths({"round": 2, "time": "1:30"}), [300, 90])
        for bad in ({"round": 6, "time": "1:00"}, {"round": 1, "time": "5:01"},
                    {"round": 1, "time": "0:00"}, {"round": 1, "time": None}, {}):
            self.assertIsNone(m.round_lengths(bad))


class Validation(unittest.TestCase):
    def test_landed_never_exceeds_attempted(self):
        self.assertIsNone(m.clean_side(side(sigLanded=10, sigAttempted=5)))
        self.assertIsNone(m.clean_side(side(takedowns=3, takedownAttempts=2)))
        self.assertIsNotNone(m.clean_side(side(sigLanded=5, sigAttempted=10)))

    def test_missing_is_none_not_zero(self):
        cleaned = m.clean_side({"sigLanded": 4})
        self.assertEqual(cleaned["sigLanded"], 4)
        self.assertIsNone(cleaned["headAttempted"])
        self.assertIsNone(m.clean_side({"sigAttempted": 4}), "sigLanded is required")

    def test_control_cannot_exceed_round(self):
        rounds = [{"round": 1, "a": side(sigLanded=1, sigAttempted=1, controlSec=200),
                   "b": side(sigLanded=1, sigAttempted=1)}]
        fight = m.build_fight(archive(rounds), bout({"round": 1, "time": "2:00", "winnerId": "11",
                                                       "method": "ko_tko"}), None)
        self.assertFalse(fight["statsComplete"])
        self.assertEqual(fight["rounds"], [])
        self.assertEqual(fight["winner"], "a", "results still count without stats")

    def test_missing_round_marks_stats_incomplete(self):
        rounds = [{"round": 1, "a": side(sigLanded=1, sigAttempted=1), "b": side(sigLanded=1, sigAttempted=1)}]
        fight = m.build_fight(archive(rounds), bout({"round": 2, "time": "5:00", "winnerId": "22",
                                                       "method": "decision_unanimous"}), None)
        self.assertFalse(fight["statsComplete"])


class Corners(unittest.TestCase):
    def test_swapped_archive_corners_follow_result_order(self):
        rounds = [{"round": 1, "a": side(sigLanded=9, sigAttempted=9), "b": side(sigLanded=2, sigAttempted=3)}]
        fight = m.build_fight(archive(rounds, first="Bravo Two", second="Alpha One"),
                              bout({"round": 1, "time": "5:00", "winnerId": "11", "method": "decision"}), None)
        self.assertEqual(fight["rounds"][0]["a"]["sigLanded"], 2, "Alpha is corner a in the result")
        self.assertEqual(fight["rounds"][0]["b"]["sigLanded"], 9)

    def test_unknown_corner_names_are_rejected(self):
        fight = m.build_fight(archive([], first="Someone Else"), bout({"round": 1, "time": "1:00",
                              "winnerId": "11", "method": "ko_tko"}), None)
        self.assertIsNone(fight)

    def test_completed_fight_needs_a_winner(self):
        self.assertIsNone(m.build_fight(archive([]), bout({"round": 1, "time": "1:00", "method": "ko_tko"}), None))
        draw = m.build_fight(archive([]), bout({"round": 3, "time": "5:00", "method": "draw"}, status="draw"), None)
        self.assertIsNotNone(draw)
        self.assertEqual(m.side_view(draw, "a")["outcome"], "D")


class Aggregates(unittest.TestCase):
    def two_round_fight(self):
        rounds = [
            {"round": 1, "a": side(sigLanded=10, sigAttempted=20, knockdowns=1, takedowns=1, takedownAttempts=2,
                                   controlSec=60, headLanded=6, bodyLanded=3, legLanded=1, distanceLanded=10),
             "b": side(sigLanded=5, sigAttempted=25, takedowns=0, takedownAttempts=4)},
            {"round": 2, "a": side(sigLanded=5, sigAttempted=10, controlSec=30, headLanded=5, distanceLanded=5),
             "b": side(sigLanded=5, sigAttempted=15, takedowns=1, takedownAttempts=1)},
        ]
        scorecard = {"decision": "unanimous", "judges": [
            {"judge": "J", "scoresKnown": True, "rounds": [[1, 10, 9], [2, 10, 8]], "totalA": 20, "totalB": 17}]}
        return m.build_fight(archive(rounds), bout({"round": 2, "time": "5:00", "winnerId": "11",
                                                       "method": "decision_unanimous"}), scorecard)

    def test_rates_use_cage_time(self):
        view = m.side_view(self.two_round_fight(), "a")
        agg = m.aggregate([view])
        r = agg["rates"]
        self.assertEqual(agg["cageSeconds"], 600)
        self.assertEqual(r["slpm"], 1.5)          # 15 landed / 10 min
        self.assertEqual(r["sapm"], 1.0)          # 10 absorbed / 10 min
        self.assertEqual(r["strAcc"], 0.5)        # 15 / 30
        self.assertEqual(r["strDef"], 0.75)       # 1 - 10/40
        self.assertEqual(r["kd15"], 1.5)          # 1 per 600 s * 900
        self.assertEqual(r["ctrlShare"], 0.15)    # 90 / 600
        self.assertEqual(r["diffPm"], 0.5)
        self.assertEqual(r["target"], {"head": 0.733, "body": 0.2, "leg": 0.067})
        self.assertEqual(r["position"], {"distance": 1.0, "clinch": 0.0, "ground": 0.0})
        self.assertEqual(r["tdDef"], 0.8)         # 1 - 1/5 opponent attempts
        self.assertEqual(agg["W"], 1)
        self.assertEqual(agg["winsBy"]["dec"], 1)

    def test_scorecards_follow_the_fighters_perspective(self):
        fight = self.two_round_fight()
        mine = m.aggregate([m.side_view(fight, "a")])["judging"]
        theirs = m.aggregate([m.side_view(fight, "b")])["judging"]
        self.assertEqual((mine["roundsWon"], mine["rounds10_8"]), (2, 1))
        self.assertEqual((theirs["roundsWon"], theirs["rounds10_8"]), (0, 0))
        self.assertEqual(m.side_view(fight, "b")["scorecards"]["judges"][0]["total"], [17, 20])

    def test_ratios_need_enough_attempts(self):
        view = m.side_view(self.two_round_fight(), "a")
        self.assertIsNone(m.aggregate([view])["rates"]["tdAcc"], "2 attempts is below the minimum of 3")

    def test_unknown_metric_is_never_reported_as_zero(self):
        rounds = [{"round": 1, "a": side(sigLanded=3, sigAttempted=None), "b": side(sigLanded=1, sigAttempted=2)}]
        fight = m.build_fight(archive(rounds), bout({"round": 1, "time": "5:00", "winnerId": "11",
                                                       "method": "decision"}), None)
        self.assertIsNone(m.aggregate([m.side_view(fight, "a")])["rates"]["strAcc"])

    def test_windows_and_recency_weighting(self):
        view = m.side_view(self.two_round_fight(), "a")
        old = dict(view, date="2020-01-10", boutId="0")
        w = m.windows_for([view, old], dt.date(2026, 7, 10))
        self.assertEqual(w["career"]["fights"], 2)
        self.assertEqual(w["l12"]["fights"], 1)
        self.assertLess(w["weighted"]["cageSeconds"], w["career"]["cageSeconds"])

    def test_compact_round_arrays_follow_round_fields(self):
        view = m.side_view(self.two_round_fight(), "a")
        packed = m.compact_fight(view)
        own = packed["rounds"][0][2]
        self.assertEqual(own[m.COUNTS.index("sigLanded")], 10)
        self.assertEqual(own[m.COUNTS.index("controlSec")], 60)


class RealData(unittest.TestCase):
    """Smoke test over the committed evidence files."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.index = m.build(dt.date(2026, 11, 18), pathlib.Path(cls.tmp.name))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_coverage(self):
        src = self.index["source"]
        self.assertGreater(src["fights"], 4500)
        self.assertGreater(src["fightsWithScorecards"], 2000)
        self.assertGreater(len(self.index["fighters"]), 900)

    def test_known_fighter_matches_saved_v3_last_five(self):
        row = self.index["fighters"]["islam-makhachev"]
        rates = dict(zip(self.index["rateFields"], row["rates"]["last5"]))
        v3 = json.loads((ROOT / "data/ufc-fighter-v3.json").read_text())["fighters"]["islammakhachev"]["metrics"]
        self.assertAlmostEqual(rates["slpm"], v3["slpm"]["value"], places=2)
        self.assertAlmostEqual(rates["td15"], v3["td"]["value"], places=2)
        self.assertEqual(row["ufc"][:2], [18, 1])

    def test_profiles_are_light(self):
        biggest = max(p.stat().st_size for p in (pathlib.Path(self.tmp.name) / "fighters").glob("*.json"))
        self.assertLess(biggest, 80_000)


if __name__ == "__main__":
    unittest.main()
