"""Tests for scripts/build-ufc-fighter-form.py (Fighters hub handover, 24 Nov 2026).

The fixed cases are the handover's section 9 fighters on the committed data, re-baselined for the owner's choice to
take strength on the night from the BEFN rating history instead of a separate Elo, and again for Form v2 (25 Nov 2026:
dominance from scorecards, quality-weighted results, momentum, flatter recency) v3 (fight statistics, 8 fights in 5 years)
and v4 (age, loss cap from 75; docs/design/FIGHTERS-HUB-FORM.md 3).
"""
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("fighter_form", ROOT / "scripts/build-ufc-fighter-form.py")
fb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fb)
fb.AS_OF[0] = json.loads((ROOT / "data/ufc-stats/index.json").read_text())["asOf"]
SAVED = json.loads((ROOT / "data/ufc-fighter-form.json").read_text())


class Saved(unittest.TestCase):
    """The committed file (built on the 21 Nov 2026 data)."""
    F = SAVED["fighters"]

    def test_section_9_cases(self):
        f = self.F
        self.assertEqual((f["valter-walker"]["form"], f["valter-walker"]["stage"], f["valter-walker"]["formRank"]),
                         (96.18, "Contender", 1))
        self.assertIn("On fire", f["valter-walker"]["badges"])
        self.assertEqual((f["elijah-smith"]["stage"], f["elijah-smith"]["form"]), ("Rising star", 95.89))
        self.assertIn("On fire", f["elijah-smith"]["badges"])
        self.assertEqual((f["alexandre-pantoja"]["stage"], f["alexandre-pantoja"]["lossCap"]), ("Title contender", 65))
        self.assertIn("Cooling", f["alexandre-pantoja"]["badges"])
        self.assertEqual(f["israel-adesanya"]["stage"], "Slipping")
        self.assertEqual(f["israel-adesanya"]["why"], ["lost last fight and 4 of last 5"])
        self.assertIsNone(f["tom-aspinall"]["form"])
        self.assertTrue(f["tom-aspinall"]["limited"])
        self.assertEqual(f["tom-aspinall"]["stage"], "Title contender")
        self.assertEqual(f["michael-page"]["stage"], "Established", "39: too old for Rising star and Breakout")
        # v2 regression: one knockout win must not carry a 1-4 run (v1 scored Niko Price Form 65 on finishing 1.0)
        self.assertEqual([x[2] for x in f["niko-price"]["fights"]][:5], ["W", "L", "L", "L", "L"])
        self.assertLess(f["niko-price"]["form"], 50)

    def test_shape_and_ranges(self):
        for slug, f in self.F.items():
            if f["form"] is not None:
                self.assertTrue(0 < f["form"] < 100, slug)
                self.assertEqual(f["form"], round(f["form"], 2), slug)
                self.assertTrue(0 <= f["points"] <= 100, slug)
            if f["lossCap"] is not None:
                self.assertLessEqual(f["points"], f["lossCap"], slug)
        self.assertGreater(SAVED["formPool"], 500)
        # the loss cap's best case must stay near the top 5% (owner's choice, v4), whatever the weights
        pool = sorted(f["points"] for f in self.F.values() if f["points"] is not None and f["monthsOut"] <= fb.POOL_MONTHS)
        share_at_or_below = sum(1 for x in pool if x <= fb.LOSS_CAP_START) / len(pool)
        self.assertTrue(.91 <= share_at_or_below <= .98, f"loss cap start sits at the {share_at_or_below:.0%} point")
        self.assertEqual(SAVED["fightFields"], fb.FIGHT_FIELDS)
        self.assertAlmostEqual(sum(SAVED["weights"].values()), 1.0)
        for slug, f in self.F.items():
            if f["points"] is not None:
                self.assertEqual(set(f["parts"]), set(fb.WEIGHTS), slug)
                self.assertTrue(all(len(x) == len(fb.FIGHT_FIELDS) for x in f["fights"]), slug)
                self.assertTrue(2 <= len(f["fights"]) <= fb.WINDOW_FIGHTS, slug)
                self.assertAlmostEqual(sum(x[4] for x in f["fights"]), 100, delta=3, msg=slug)

    def test_decimals_separate_fighters(self):
        # owner, 25 Nov 2026: 2 decimal places so close fighters no longer tie (31 shared Form 59 with whole numbers)
        from collections import Counter
        shared = Counter(f["form"] for f in self.F.values() if f["form"] is not None).most_common(1)[0][1]
        self.assertLessEqual(shared, 3)

    def test_form_ranks_are_a_ranking_per_division(self):
        by_div = {}
        for f in self.F.values():
            if f["formRank"]:
                by_div.setdefault(f["division"], []).append(f["formRank"])
        for div, ranks in by_div.items():
            self.assertEqual(sorted(ranks), list(range(1, len(ranks) + 1)), div)

    def test_pre_ufc_rule_keeps_long_careers_out_of_prospect(self):
        for f in self.F.values():
            if f["stage"] in ("Prospect", "Rising star") and f["preUfcFights"] is not None:
                self.assertLessEqual(f["preUfcFights"], fb.MAX_PRE_UFC_FIGHTS, f["slug"])


class Rules(unittest.TestCase):
    def fighter(self, **kw):
        base = {"slug": "x", "name": "X Y", "form": 60, "rank": None, "champion": False, "injured": None,
                "monthsOut": 3.0, "ufcFights": 5, "losses": 1, "age": 28, "debutAge": 25, "preUfcFights": 10,
                "debut": "2024-01-01", "_ratings": {}, "_dec": [{"outcome": "W", "boutId": "1"}] * 3}
        base.update(kw)
        return base

    def test_injury_applies_until_next_fight_or_24_months(self):
        entry = {"status": "injured", "since": "2025-10-25"}
        hist = [{"date": "2025-10-25"}]
        self.assertTrue(fb.active_injury(entry, hist, "2026-11-21"))
        self.assertIsNone(fb.active_injury(entry, [{"date": "2026-03-01"}] + hist, "2026-11-21"), "fought since")
        self.assertIsNone(fb.active_injury(entry, hist, "2027-12-01"), "over 24 months")
        self.assertIsNone(fb.active_injury({"status": "fit", "since": "2025-10-25"}, hist, "2026-11-21"))

    def test_injured_fighter_is_not_inactive_and_not_on_fire(self):
        f = self.fighter(monthsOut=30.0, injured={"since": "2025-01-01"}, form=95)
        self.assertNotEqual(fb.stage_for(f)[0], "Inactive")
        badges = fb.badges_for(f, None)
        self.assertIn("Out injured", badges)
        self.assertNotIn("On fire", badges)
        self.assertNotIn("Inactive risk", badges)

    def test_on_fire_has_hysteresis(self):
        f = self.fighter(form=85, monthsOut=4.0)
        self.assertNotIn("On fire", fb.badges_for(f, None), "Form 85 is not enough to start")
        self.assertIn("On fire", fb.badges_for(f, {"badges": ["On fire"]}), "but keeps it at 79 or more")
        self.assertIn("On fire", fb.badges_for(self.fighter(form=90), None))
        self.assertNotIn("On fire", fb.badges_for(self.fighter(form=78), {"badges": ["On fire"]}))

    def test_champion_first_then_slipping(self):
        self.assertEqual(fb.stage_for(self.fighter(champion=True, rank=0))[0], "Champion")
        stale = self.fighter(rank=7, monthsOut=19.0)
        self.assertEqual(fb.stage_for(stale), ("Slipping", ["no UFC fight in 18 months"]))
        self.assertEqual(fb.stage_for(self.fighter(rank=7, monthsOut=19.0, injured={"since": "x"}))[0], "Contender")

    def test_strength_maps_percentile(self):
        s = fb.Strength([("2025-01-01", v) for v in range(1000, 2000)])
        self.assertAlmostEqual(s.of(1999.9, "2026-01-01"), 1.0, places=2)
        self.assertAlmostEqual(s.of(1500, "2026-01-01"), (0.5 - 0.3) / 0.68, places=2)
        self.assertEqual(s.of(1000, "2026-01-01"), 0.0)


class FightScoring(unittest.TestCase):
    """Form v2: how each fight is valued."""

    def judge(self, rounds):
        return {"scorecards": {"judges": [{"rounds": [[i + 1, a, b] for i, (a, b) in enumerate(rounds)]}] * 3}}

    def test_dominance_reads_the_scorecards(self):
        sweep = {"outcome": "W", "method": "dec", "methodDetail": "Unanimous", **self.judge([(10, 9)] * 3)}
        split = {"outcome": "W", "method": "dec", "methodDetail": "Split", **self.judge([(10, 9), (9, 10), (10, 9)])}
        lost_close = {"outcome": "L", "method": "dec", "methodDetail": "Split", **self.judge([(9, 10), (10, 9), (9, 10)])}
        swept = {"outcome": "L", "method": "dec", "methodDetail": "Unanimous", **self.judge([(9, 10)] * 3)}
        self.assertAlmostEqual(fb.dominance(sweep), .85)
        self.assertAlmostEqual(fb.dominance(swept), .15)
        self.assertGreater(fb.dominance(split), fb.dominance(lost_close))
        self.assertGreater(fb.dominance(lost_close), fb.dominance(swept))
        ten_eight = {"outcome": "W", "method": "dec", **self.judge([(10, 8), (9, 10), (9, 10)])}
        self.assertAlmostEqual(fb.judged_share(ten_eight), .5, msg="a 10-8 round counts double")

    def test_dominance_without_scorecards_and_finishes(self):
        self.assertEqual(fb.dominance({"outcome": "W", "method": "ko", "endRound": 1}), 1.0)
        self.assertLess(fb.dominance({"outcome": "W", "method": "sub", "endRound": 3}), 1.0)
        self.assertEqual(fb.dominance({"outcome": "L", "method": "ko", "endRound": 1}), 0.0)
        self.assertAlmostEqual(fb.dominance({"outcome": "W", "method": "dec", "methodDetail": "Unanimous"}), .15 + .7 * .86)
        kd = {"outcome": "W", "method": "dec", "methodDetail": "Unanimous",
              "rounds": [[1, 300, [0] * 16 + [1] + [0] * 8, [0] * 25]]}
        self.assertGreater(fb.dominance(kd), fb.dominance({**kd, "rounds": []}), "a knockdown scored counts")

    def test_fight_value_orders_results_sensibly(self):
        v = fb.fight_value
        self.assertAlmostEqual(v("W", 1.0, 1.0), 1.0, msg="first-round finish of an elite opponent")
        self.assertGreater(v("W", 0.0, .5), v("D", 1.0, .5), "any win beats any draw")
        for q in (0.0, .5, 1.0):
            self.assertGreater(v("D", q, .5), v("L", q, .5), "a draw beats a loss to the same opponent")
        self.assertAlmostEqual(v("L", 1.0, .5), .40, msg="a close loss to an elite opponent keeps 0.40")
        self.assertLess(v("L", 0.0, 0.0), .06, "stopped by a weak opponent is worth almost nothing")
        self.assertGreater(v("W", .8, .5), v("W", .1, .5), "beating better opponents is worth more")

    def test_loss_cap_adds_losing_run_and_repeat_stoppage(self):
        def loss(day, method="dec", detail="Unanimous", rnd=3, bout="1"):
            return {"outcome": "L", "date": day, "method": method, "methodDetail": detail, "endRound": rnd,
                    "boutId": bout, "opponentSlug": "o" + bout}
        ratings = {str(i): {"me": 1500, "o" + str(i): 1600} for i in range(1, 4)}   # higher-rated opponents
        self.assertEqual(fb.loss_cap("me", [loss("2026-01-01")], ratings), 70)
        self.assertEqual(fb.loss_cap("me", [loss("2026-01-01"), loss("2025-06-01", bout="2")], ratings), 65)
        three = [loss("2026-01-01", "ko", None, 1), loss("2025-06-01", bout="2"), loss("2025-01-01", "ko", None, 2, "3")]
        self.assertEqual(fb.loss_cap("me", three, ratings), fb.LOSS_CAP_START - 15 - 10 - 5)
        self.assertIsNone(fb.loss_cap("me", [{"outcome": "W", "date": "2026-02-01"}] + three, ratings))

    def test_fight_stats_are_margins_from_the_rounds(self):
        me = [10, 20] + [0] * 14 + [1, 2] + [0] * 3 + [60] + [0] * 3     # 10 sig. strikes, 1 kd, 2 td, 60 s control
        opp = [4, 20] + [0] * 15 + [1] + [0] * 3 + [30] + [0] * 3
        st = fb.fight_stats({"rounds": [[1, 300, me, opp]]})
        self.assertAlmostEqual(st["striking"], 6 / 5)            # per minute over 5 minutes
        self.assertAlmostEqual(st["control"], 30 / 300)
        self.assertAlmostEqual(st["takedowns"], 1 * 3)            # per 15 minutes
        self.assertIsNone(fb.fight_stats({"rounds": []}))


class Deterministic(unittest.TestCase):
    def test_two_runs_identical(self):
        prev = SAVED
        a = fb.build_form(previous=prev, status={"fighters": {}})
        b = fb.build_form(previous=prev, status={"fighters": {}})
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))


if __name__ == "__main__":
    unittest.main()
