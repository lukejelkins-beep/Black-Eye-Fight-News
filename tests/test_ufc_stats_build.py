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


class Divisions(unittest.TestCase):
    def test_slug_matches_official_division_slugs(self):
        self.assertEqual(m.division_slug("Women's Strawweight"), "womens-strawweight")
        self.assertEqual(m.division_slug("Women\u2019s Flyweight"), "womens-flyweight")
        self.assertEqual(m.division_slug("Light Heavyweight"), "light-heavyweight")
        self.assertIsNone(m.division_slug(None))

    def test_official_roster_then_latest_bout_then_reviewed(self):
        official = {"a": {"division": "welterweight", "label": "Welterweight"}}
        weight = {"a": {"division": "Middleweight"}, "b": {"division": "Middleweight"}}
        reviewed = {m.norm("Cee Dee"): "Flyweight"}
        self.assertEqual(m.resolve_division("a", "A", official, weight, reviewed)["source"], "official-roster")
        self.assertEqual(m.resolve_division("a", "A", official, weight, reviewed)["slug"], "welterweight")
        b = m.resolve_division("b", "B", official, weight, reviewed)
        self.assertEqual((b["slug"], b["source"]), ("middleweight", "latest-bout"))
        c = m.resolve_division("c", "Cee Dee", official, weight, reviewed)
        self.assertEqual((c["slug"], c["source"]), ("flyweight", "reviewed"))
        self.assertEqual(m.resolve_division("d", "Nobody", official, weight, reviewed)["slug"], None)

    def test_dormant_official_division_yields_to_the_latest_bout(self):
        official = {"a": {"division": "womens-featherweight", "label": "Women's Featherweight", "dormant": True}}
        weight = {"a": {"division": "Women's Bantamweight"}}
        a = m.resolve_division("a", "A", official, weight, {})
        self.assertEqual((a["slug"], a["source"]), ("womens-bantamweight", "latest-bout"))
        self.assertEqual(m.resolve_division("a", "A", official, {}, {})["slug"], "womens-featherweight",
                         "with no labelled bout the dormant division is still better than nothing")


class OfficialDivisionSnapshot(unittest.TestCase):
    """A division with no champion and no ranked fighters is a historical roster, not a live division."""

    SNAPSHOT = {
        "divisions": {
            "womens-featherweight": {"label": "Women's Featherweight", "champion": None, "ranked": [],
                                     "roster": ["both", "only-dormant"]},
            "womens-bantamweight": {"label": "Women's Bantamweight", "champion": {"slug": "queen"},
                                    "ranked": [{"rank": 0, "slug": "queen"}], "roster": ["queen", "both"]},
        },
        "fighters": {
            "queen": {"divisions": ["womens-bantamweight"], "division": "womens-bantamweight",
                      "label": "Women's Bantamweight", "rank": 0, "champion": True},
            "both": {"divisions": ["womens-featherweight", "womens-bantamweight"],
                     "division": "womens-featherweight", "label": "Women's Featherweight", "rank": None,
                     "champion": False},
            "only-dormant": {"divisions": ["womens-featherweight"], "division": "womens-featherweight",
                             "label": "Women's Featherweight", "rank": None, "champion": False},
        },
    }

    def official(self, snapshot):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "ufc-divisions.json"
            path.write_text(json.dumps(snapshot))
            return m.official_divisions(path)

    def test_live_division_is_untouched(self):
        out = self.official(self.SNAPSHOT)
        self.assertEqual((out["queen"]["division"], out["queen"]["rank"], out["queen"]["champion"]),
                         ("womens-bantamweight", 0, True))
        self.assertNotIn("dormant", out["queen"])

    def test_second_live_division_replaces_a_dormant_one(self):
        out = self.official(self.SNAPSHOT)["both"]
        self.assertEqual((out["division"], out["label"]), ("womens-bantamweight", "Women's Bantamweight"))
        self.assertEqual(out["dormantDivision"], "womens-featherweight")
        self.assertFalse(out.get("dormant"), "it has a live division, so the caller keeps using the roster")

    def test_only_a_dormant_division_is_marked_for_the_caller(self):
        self.assertTrue(self.official(self.SNAPSHOT)["only-dormant"]["dormant"])

    def test_nothing_live_trusts_the_snapshot_as_it_stands(self):
        snapshot = {"divisions": {k: {**v, "champion": None, "ranked": []}
                                 for k, v in self.SNAPSHOT["divisions"].items()},
                    "fighters": self.SNAPSHOT["fighters"]}
        out = self.official(snapshot)
        self.assertEqual(out, self.SNAPSHOT["fighters"], "a parsing change must not empty every division")

    def test_missing_file_is_empty(self):
        self.assertEqual(m.official_divisions(pathlib.Path("/nonexistent/ufc-divisions.json")), {})


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

    def test_division_coverage_uses_free_weight_classes(self):
        cov = self.index["divisionCoverage"]
        # The official roster (UFC.com ranks plus Cito's active list) covers most fighters;
        # the latest fight fills those it is missing from.
        self.assertGreater(cov["officialRoster"], 600)
        self.assertGreater(cov["latestBout"], 100, "latest-bout divisions fill fighters missing from the rosters")
        self.assertGreater(cov["withDivision"], 800)

    def test_leaderboards_file(self):
        boards = json.loads((pathlib.Path(self.tmp.name) / "leaderboards.json").read_text())
        self.assertEqual(boards["schema"], 1)
        stats = [x["id"] for x in boards["stats"]]
        self.assertEqual(len(stats), len(m.BOARD_STATS))
        self.assertTrue(next(x for x in boards["stats"] if x["id"] == "sapm")["lowerIsBetter"])
        for key, rows in boards["rows"].items():
            for row in rows:
                self.assertGreaterEqual(row[1], m.BOARD_MIN_FIGHTS, key)
                self.assertEqual(len(row), 2 + len(stats))
        self.assertGreater(len(boards["rows"]["career"]), 500)
        self.assertGreater(len(boards["ratings"]), 500)
        makhachev = next(i for i, f in enumerate(boards["fighters"]) if f[0] == "islam-makhachev")
        self.assertEqual(boards["fighters"][makhachev][2], "welterweight")
        self.assertTrue(boards["fighters"][makhachev][4], "champion flag")
        self.assertLess(pathlib.Path(self.tmp.name, "leaderboards.json").stat().st_size, 600_000)

    def test_profiles_are_light(self):
        biggest = max(p.stat().st_size for p in (pathlib.Path(self.tmp.name) / "fighters").glob("*.json"))
        self.assertLess(biggest, 80_000)


class FreeResultsPath(unittest.TestCase):
    """The paid collector is switched off, so finished cards arrive in results.json."""

    BOUTS = {
        "1": {"id": "1", "org": "ufc", "status": "completed", "eventDate": "2026-01-10", "event": "UFC Test",
              "a": {"id": "11", "name": "Alpha One", "slug": "alpha-one"},
              "b": {"id": "22", "name": "Bravo Two", "slug": "bravo-two"}},
        "2": {"id": "2", "org": "ufc", "status": "completed", "eventDate": "2026-01-10", "event": "UFC Test",
              "a": {"id": "33", "name": "Carla Three", "slug": "carla-three"},
              "b": {"id": "44", "name": "Dana Four", "slug": "dana-four"}},
    }

    def row(self, **over):
        row = {"id": "ufc-later-2026-02-07-alphaone", "eventId": "ufc-later-2026-02-07", "sport": "MMA",
               "status": "completed", "date": "2026-02-07", "event": "UFC Later", "order": 0,
               "fighters": [{"name": "Alpha One"}, {"name": "Bravo Two"}], "winner": 0,
               "method": "KO/TKO (punches)", "round": 2, "time": "3:12"}
        row.update(over)
        return row

    def test_method_wording_is_read_not_guessed(self):
        for text, code in [("KO/TKO (punch to head at distance)", "ko_tko"), ("TKO (doctor stoppage)", "ko_tko"),
                           ("KO (right hand)", "ko_tko"), ("Submission (rear naked choke)", "submission"),
                           ("unanimous decision", "decision"), ("Decision", "decision"),
                           ("split draw", "draw"), ("no contest", "no_contest"),
                           ("Disqualification (illegal knee)", "dq")]:
            self.assertEqual(m.result_method(text), code, text)
        for unreadable in ("", None, "result unclear", "stopped"):
            self.assertIsNone(m.result_method(unreadable))

    def test_a_name_that_is_not_unambiguous_is_never_promoted(self):
        bouts = dict(self.BOUTS)
        bouts["3"] = {"id": "3", "org": "ufc", "status": "completed", "eventDate": "2026-01-11",
                      "a": {"id": "99", "name": "Alpha One", "slug": "alpha-one-2"},
                      "b": {"id": "22", "name": "Bravo Two", "slug": "bravo-two"}}
        people = m.fighter_index(bouts)
        self.assertNotIn(m.norm("Alpha One"), people, "two native ids for one name")
        self.assertIn(m.norm("Bravo Two"), people)
        self.assertIsNone(m.bout_from_result(self.row(), people))
        self.assertIsNone(m.bout_from_result(self.row(fighters=[{"name": "Nobody Known"}, {"name": "Bravo Two"}]),
                                             m.fighter_index(self.BOUTS)))

    def test_the_bout_keeps_the_native_ids_the_collector_holds(self):
        bout = m.bout_from_result(self.row(), m.fighter_index(self.BOUTS))
        self.assertEqual((bout["a"]["id"], bout["b"]["id"]), ("11", "22"))
        self.assertEqual((bout["a"]["slug"], bout["b"]["slug"]), ("alpha-one", "bravo-two"))
        self.assertEqual(bout["result"]["winnerId"], "11")
        self.assertFalse(bout["titleFight"], "a results row carries no title flag")
        draw = m.bout_from_result(self.row(method="split draw", winner=None), m.fighter_index(self.BOUTS))
        self.assertIsNone(draw["result"]["winnerId"])

    def test_only_cards_after_the_collector_stopped_are_read(self):
        skipped = {"unresolved": 0}
        rows = [self.row(date="2026-01-10", id="old"), self.row()]
        fights = m.results_only_fights(rows, self.BOUTS, {}, dt.date(2026, 1, 10), skipped)
        self.assertEqual([f["date"] for f in fights], ["2026-02-07"])
        self.assertEqual(fights[0]["resultSource"], "results")
        self.assertEqual(fights[0]["method"], "ko")
        self.assertEqual(fights[0]["winner"], "a")
        self.assertEqual(fights[0]["rounds"], [], "no measured rounds without the archive")
        self.assertFalse(fights[0]["statsComplete"])
        self.assertEqual(fights[0]["seconds"], 492, "one full round plus 3:12")

    def test_round_statistics_are_used_when_the_archive_has_the_fight(self):
        rounds = [{"round": 1, "a": side(sigLanded=10), "b": side(sigLanded=4)},
                  {"round": 2, "a": side(sigLanded=6), "b": side(sigLanded=2)}]
        captured = {"k": {"promotion": "UFC", "date": "2026-02-07", "fighterA": "Bravo Two",
                          "fighterB": "Alpha One", "rounds": [{"round": r["round"], "a": r["b"], "b": r["a"]}
                                                              for r in rounds]}}
        fights = m.results_only_fights([self.row()], self.BOUTS, captured, dt.date(2026, 1, 10), {"unresolved": 0})
        self.assertTrue(fights[0]["statsComplete"])
        self.assertEqual(len(fights[0]["rounds"]), 2)
        self.assertEqual(fights[0]["rounds"][0]["a"]["sigLanded"], 10, "corners follow the result, not the archive")

    def test_unreadable_rows_are_counted_not_guessed_and_pairs_are_not_doubled(self):
        skipped = {"unresolved": 0}
        rows = [self.row(method="result unclear"), self.row(fighters=[{"name": "Ghost"}, {"name": "Bravo Two"}]),
                self.row(), self.row(id="same-bout-again")]
        fights = m.results_only_fights(rows, self.BOUTS, {}, dt.date(2026, 1, 10), skipped)
        self.assertEqual(len(fights), 1)
        self.assertEqual(skipped["unresolved"], 2)

    def test_other_sports_promotions_and_unfinished_cards_are_ignored(self):
        skipped = {"unresolved": 0}
        rows = [self.row(sport="Boxing"), self.row(eventId="pfl-2026-02-07"), self.row(status="scheduled"),
                self.row(date=None)]
        self.assertEqual(m.results_only_fights(rows, self.BOUTS, {}, dt.date(2026, 1, 10), skipped), [])
        self.assertEqual(skipped["unresolved"], 0, "not ours to resolve")

    def test_the_free_export_supplies_rounds_the_archive_does_not_have(self):
        rounds = [{"round": 1, "a": side(sigLanded=9), "b": side(sigLanded=4)},
                  {"round": 2, "a": side(sigLanded=7), "b": side(sigLanded=3)}]
        free = {"2026-02-07|alphaone|bravotwo": {"fighterA": "Alpha One", "fighterB": "Bravo Two", "rounds": rounds}}
        kept = m.free_rounds
        try:
            m.free_rounds = lambda: free
            fights = m.results_only_fights([self.row()], self.BOUTS, {}, dt.date(2026, 1, 10), {"unresolved": 0})
        finally:
            m.free_rounds = kept
        self.assertTrue(fights[0]["statsComplete"])
        self.assertEqual(len(fights[0]["rounds"]), 2)
        self.assertEqual(fights[0]["rounds"][0]["a"]["sigLanded"], 9)

    def test_the_archive_is_preferred_over_the_free_export(self):
        archived = {"k": {"promotion": "UFC", "date": "2026-02-07", "fighterA": "Alpha One",
                          "fighterB": "Bravo Two",
                          "rounds": [{"round": 1, "a": side(sigLanded=1), "b": side(sigLanded=2)},
                                     {"round": 2, "a": side(sigLanded=1), "b": side(sigLanded=2)}]}}
        free = {"2026-02-07|alphaone|bravotwo": {"fighterA": "Alpha One", "fighterB": "Bravo Two",
                                                 "rounds": [{"round": 1, "a": side(sigLanded=99), "b": side(sigLanded=99)},
                                                            {"round": 2, "a": side(sigLanded=99), "b": side(sigLanded=99)}]}}
        kept = m.free_rounds
        try:
            m.free_rounds = lambda: free
            fights = m.results_only_fights([self.row()], self.BOUTS, archived, dt.date(2026, 1, 10), {"unresolved": 0})
        finally:
            m.free_rounds = kept
        self.assertEqual(fights[0]["rounds"][0]["a"]["sigLanded"], 1, "the archive stays authoritative")

    def test_partly_measured_rounds_never_void_a_career_rate(self):
        def rounds(**over):
            return [{"round": n, "a": side(sigLanded=5, **over), "b": side(sigLanded=3, **over)} for n in (1, 2)]
        cito = {"k": {"promotion": "UFC", "date": "2026-02-07", "fighterA": "Alpha One",
                      "fighterB": "Bravo Two", "rounds": rounds(reversals=None)}}
        free = {"2026-02-07|alphaone|bravotwo": {"fighterA": "Alpha One", "fighterB": "Bravo Two", "rounds": rounds()}}
        kept = m.free_rounds
        try:
            m.free_rounds = lambda: {}
            alone = m.results_only_fights([self.row()], self.BOUTS, cito, dt.date(2026, 1, 10), {"unresolved": 0})[0]
            m.free_rounds = lambda: free
            filled = m.results_only_fights([self.row()], self.BOUTS, cito, dt.date(2026, 1, 10), {"unresolved": 0})[0]
        finally:
            m.free_rounds = kept
        self.assertFalse(alone["statsComplete"], "a result with no rounds until a complete source has it")
        self.assertTrue(filled["statsComplete"], "the complete export beats the partial archive")
        self.assertEqual(filled["rounds"][0]["a"]["reversals"], 0)

    def test_a_missing_or_broken_results_file_is_survivable(self):
        kept = m.DATA
        try:
            m.DATA = pathlib.Path(tempfile.mkdtemp())
            self.assertEqual(m.results_rows(), [])
        finally:
            m.DATA = kept


class FeederScope(unittest.TestCase):
    def test_feeder_series_are_out_but_ultimate_fighter_finales_stay(self):
        for title in ("Dana White's Contender Series 80", "DWCS Week 3", "Road to UFC Season 4: Semifinals",
                      "Road to UFC 3 Finals"):
            self.assertTrue(m.is_feeder_event(title), title)
        for title in ("UFC 300", "The Ultimate Fighter Finale: Tavares vs Adesanya",
                      "The Ultimate Fighter: Team Joanna vs Team Cl\u00e1udia Finale", None, ""):
            self.assertFalse(m.is_feeder_event(title), title)

    def test_only_the_attested_showcase_survives_a_feeder_title(self):
        feeder = {"id": "60900", "event": "Road to UFC Season 4: Semifinals"}
        self.assertTrue(m.out_of_scope(feeder, set()))
        self.assertFalse(m.out_of_scope(feeder, {"60900"}))
        self.assertTrue(m.out_of_scope({**feeder, "id": "1"}, {"60900"}))
        self.assertFalse(m.out_of_scope({"id": "2", "event": "UFC 300"}, set()))

    def test_the_register_attests_the_one_showcase(self):
        self.assertIn("60900", m.attested_showcase_ids())


class CertifiedNoContests(unittest.TestCase):
    """A certified career's official no-contest, which the archive path drops for want of a recorded result."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = pathlib.Path(self.tmp.name)
        self.old = (m.CERTIFIED_CAREERS, m.REGISTER)
        m.CERTIFIED_CAREERS, m.REGISTER = root / "c.json", root / "r.json"
        self.addCleanup(lambda: setattr(m, "CERTIFIED_CAREERS", self.old[0]) or setattr(m, "REGISTER", self.old[1]))

    def write(self, certified, register):
        m.CERTIFIED_CAREERS.write_text(json.dumps({"certified": {s: 1 for s in certified}}))
        m.REGISTER.write_text(json.dumps({"fighters": register}))

    def nc(self, name, opp, date="2021-03-13", url="https://ufcstats.com/fight-details/abc123"):
        b = {"date": date, "opponent": opp, "result": "no_contest"}
        if url:
            b["fightUrl"] = url
        return {"fighterName": name, "bouts": [b]}

    def test_a_pair_of_certified_fighters_gets_one_two_sided_record(self):
        self.write(["belal", "edwards"], {"belal": self.nc("Belal Muhammad", "Leon Edwards"),
                                          "edwards": self.nc("Leon Edwards", "Belal Muhammad")})
        skipped = {}
        out = m.certified_no_contests([], skipped)
        self.assertEqual(len(out), 1)
        f = out[0]
        self.assertEqual((f["a"]["slug"], f["b"]["slug"]), ("belal", "edwards"))
        self.assertEqual((f["method"], f["winner"], f["rounds"], f["statsComplete"]), ("nc", None, [], False))
        self.assertEqual(m.side_view(f, "a")["outcome"], "NC")
        self.assertEqual(m.side_view(f, "b")["outcome"], "NC")
        self.assertEqual(skipped["certifiedNoContest"], 1)

    def test_a_no_contest_already_among_the_fights_is_not_added_again(self):
        self.write(["belal"], {"belal": self.nc("Belal Muhammad", "Leon Edwards")})
        have = {"date": "2021-03-14", "method": "nc", "a": {"name": "Belal Muhammad", "slug": "belal"},
                "b": {"name": "Leon Edwards", "slug": "edwards"}}
        self.assertEqual(m.certified_no_contests([have], {}), [])

    def test_only_certified_fighters_are_used(self):
        self.write([], {"belal": self.nc("Belal Muhammad", "Leon Edwards")})
        self.assertEqual(m.certified_no_contests([], {}), [])

    def test_a_gap_bout_without_a_fight_link_is_keyed_by_date_and_names(self):
        self.write(["lane"], {"lane": self.nc("Austen Lane", "Justin Tafa", date="2023-06-24", url=None)})
        out = m.certified_no_contests([], {})
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["boutId"], "ufcstats-2023-06-24-austenlane-justintafa")
        self.assertIsNone(out[0]["b"]["slug"], "an opponent outside the certified set has no stats slug")

    def test_results_other_than_no_contest_are_ignored(self):
        e = self.nc("Belal Muhammad", "Leon Edwards")
        e["bouts"][0]["result"] = "loss"
        self.write(["belal"], {"belal": e})
        self.assertEqual(m.certified_no_contests([], {}), [])

    def test_missing_files_are_survivable(self):
        self.assertEqual(m.certified_no_contests([], {}), [])


class StrikeBreakdowns(unittest.TestCase):
    """Head/body/leg and distance/clinch/ground shares only where every round adds up to the strikes landed."""

    def fight(self, own_rounds):
        rounds = [{"round": i + 1, "seconds": 300, "own": o, "opp": side()} for i, o in enumerate(own_rounds)]
        return {"outcome": "W", "method": "dec", "titleFight": False, "statsComplete": True, "rounds": rounds,
                "scorecards": None}

    def good(self):
        return side(sigLanded=10, sigAttempted=20, headLanded=6, bodyLanded=3, legLanded=1,
                    distanceLanded=7, clinchLanded=2, groundLanded=1)

    def test_a_window_where_every_round_adds_up_keeps_its_shares(self):
        rates = m.aggregate([self.fight([self.good(), self.good()])])["rates"]
        self.assertEqual(rates["target"], {"head": 0.6, "body": 0.3, "leg": 0.1})
        self.assertEqual(rates["position"], {"distance": 0.7, "clinch": 0.2, "ground": 0.1})

    def test_one_round_that_does_not_add_up_removes_both_shares_for_the_window(self):
        bad = self.good()
        bad["headLanded"] = 22  # more head strikes than strikes landed
        rates = m.aggregate([self.fight([self.good(), bad])])["rates"]
        self.assertNotIn("target", rates)
        self.assertIn("position", rates, "the other breakdown still adds up")
        self.assertIsNotNone(rates["slpm"], "the headline rates are not touched")

    def test_each_breakdown_is_judged_on_its_own_parts(self):
        bad = self.good()
        bad["groundLanded"] = 9
        rates = m.aggregate([self.fight([bad])])["rates"]
        self.assertIn("target", rates)
        self.assertNotIn("position", rates)

    def test_an_unverifiable_round_is_left_out_not_trusted(self):
        r = self.good()
        r["sigLanded"] = None
        rates = m.aggregate([self.fight([r])])["rates"]
        self.assertNotIn("target", rates)
        self.assertNotIn("position", rates)


if __name__ == "__main__":
    unittest.main()
