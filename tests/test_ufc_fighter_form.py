"""Tests for scripts/build-ufc-fighter-form.py (Fighters hub handover, 24 Nov 2026).

The fixed cases are the handover's section 9 fighters on the committed data, re-baselined for the owner's choice to
take strength on the night from the BEFN rating history instead of a separate Elo (opposition scores shift a little).
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
                         (97, "Contender", 1))
        self.assertIn("On fire", f["valter-walker"]["badges"])
        self.assertEqual((f["elijah-smith"]["stage"], f["elijah-smith"]["form"]), ("Rising star", 99))
        self.assertIn("On fire", f["elijah-smith"]["badges"])
        self.assertEqual((f["alexandre-pantoja"]["stage"], f["alexandre-pantoja"]["lossCap"]), ("Contender", 80))
        self.assertIn("Cooling", f["alexandre-pantoja"]["badges"])
        self.assertEqual(f["israel-adesanya"]["stage"], "Slipping")
        self.assertEqual(f["israel-adesanya"]["why"], ["lost last fight and 4 of last 5"])
        self.assertIsNone(f["tom-aspinall"]["form"])
        self.assertTrue(f["tom-aspinall"]["limited"])
        self.assertEqual(f["tom-aspinall"]["stage"], "Title contender")
        self.assertEqual(f["michael-page"]["stage"], "Established", "39: too old for Rising star and Breakout")

    def test_shape_and_ranges(self):
        for slug, f in self.F.items():
            if f["form"] is not None:
                self.assertTrue(1 <= f["form"] <= 99, slug)
                self.assertTrue(0 <= f["points"] <= 100, slug)
            if f["lossCap"] is not None:
                self.assertLessEqual(f["points"], f["lossCap"], slug)
        self.assertGreater(SAVED["formPool"], 500)

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
        base = {"slug": "x", "name": "X Y", "points": 60.0, "rank": None, "champion": False, "injured": None,
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
        f = self.fighter(monthsOut=30.0, injured={"since": "2025-01-01"}, points=90.0)
        self.assertNotEqual(fb.stage_for(f)[0], "Inactive")
        badges = fb.badges_for(f, None)
        self.assertIn("Out injured", badges)
        self.assertNotIn("On fire", badges)
        self.assertNotIn("Inactive risk", badges)

    def test_on_fire_has_hysteresis(self):
        f = self.fighter(points=70.0, monthsOut=4.0)
        self.assertNotIn("On fire", fb.badges_for(f, None), "70 is not enough to start")
        self.assertIn("On fire", fb.badges_for(f, {"badges": ["On fire"]}), "but keeps it above 68")
        self.assertNotIn("On fire", fb.badges_for(self.fighter(points=67.0), {"badges": ["On fire"]}))

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


class Deterministic(unittest.TestCase):
    def test_two_runs_identical(self):
        prev = SAVED
        a = fb.build_form(previous=prev, status={"fighters": {}})
        b = fb.build_form(previous=prev, status={"fighters": {}})
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))


if __name__ == "__main__":
    unittest.main()
