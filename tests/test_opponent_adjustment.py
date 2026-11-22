"""Tests for scripts/evaluate-opponent-adjustment.py.

The result of that script is only worth quoting if it cannot see the future, so these guard the
leakage rules and the shrinkage, on inline data. Offline; no file or provider is read.
"""
import datetime as dt
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("oa", ROOT / "scripts/evaluate-opponent-adjustment.py")
oa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oa)

D = dt.date


def fight(date, opponent, landed, absorbed):
    return {"date": date, "opponent": opponent, "landed": landed, "absorbed": absorbed}


class OpponentFactor(unittest.TestCase):
    def test_shrinks_toward_one_with_few_fights(self):
        rows = [fight(D(2025, 1, 1), "a", 4.0, 8.0), fight(D(2025, 6, 1), "b", 4.0, 8.0)]
        # the opponent allows twice the league rate, but on two fights: 1 + 1.0 * 2/(2+3) = 1.4
        self.assertAlmostEqual(oa.opponent_factor(rows, "absorbed", 4.0), 1.4)

    def test_more_fights_trust_the_measurement_more(self):
        rows = [fight(D(2025, 1, i + 1), "x", 4.0, 8.0) for i in range(12)]
        self.assertAlmostEqual(oa.opponent_factor(rows, "absorbed", 4.0), 1 + 12 / 15)

    def test_the_fight_being_adjusted_is_left_out(self):
        rows = [fight(D(2025, 1, 1), "me", 4.0, 99.0), fight(D(2025, 6, 1), "b", 4.0, 4.0),
                fight(D(2025, 7, 1), "c", 4.0, 4.0)]
        kept = oa.opponent_factor(rows, "absorbed", 4.0, exclude=D(2025, 1, 1))
        self.assertAlmostEqual(kept, 1.0, msg="without my own huge night, this opponent is average")
        self.assertGreater(oa.opponent_factor(rows, "absorbed", 4.0), 4.0, "and with it, they are not")

    def test_too_little_evidence_is_no_adjustment(self):
        self.assertEqual(oa.opponent_factor([], "absorbed", 4.0), 1.0)
        self.assertEqual(oa.opponent_factor([fight(D(2025, 1, 1), "a", 4.0, 9.0)], "absorbed", 4.0), 1.0)
        self.assertEqual(oa.opponent_factor([fight(D(2025, 1, 1), "a", 4.0, 9.0)] * 4, "absorbed", 0), 1.0)


class RecencyWeights(unittest.TestCase):
    def test_a_fight_one_half_life_old_counts_half(self):
        as_of = D(2026, 1, 1)
        old = as_of - dt.timedelta(days=oa.HALF_LIFE_DAYS)
        w = oa.recency_weights([fight(as_of, "a", 1, 1), fight(old, "b", 1, 1)], as_of)
        self.assertAlmostEqual(w[0], 1.0)
        self.assertAlmostEqual(w[1], 0.5)

    def test_weighted_mean_leans_on_the_newest(self):
        self.assertAlmostEqual(oa.weighted_mean([10, 0], [1, 1]), 5)
        self.assertAlmostEqual(oa.weighted_mean([10, 0], [3, 1]), 7.5)
        self.assertIsNone(oa.weighted_mean([], []))


class Predictions(unittest.TestCase):
    """A world where one fighter always lands 5.0 but faced opponents who are easy to hit."""

    def world(self):
        data = {}
        for i in range(6):                      # a league of journeymen: 4.0 landed, 4.0 absorbed
            slug = f"j{i}"
            data[slug] = {"name": slug, "division": "lightweight", "fights": [
                fight(D(2024, m, 1), "filler", 4.0, 4.0) for m in (1, 4, 7, 10)]}
        data["soft"] = {"name": "Soft", "division": "lightweight", "fights": [
            fight(D(2024, m, 1), "filler", 4.0, 8.0) for m in (1, 4, 7, 10)]}
        data["hero"] = {"name": "Hero", "division": "lightweight", "fights": [
            fight(D(2026, 1, 1), "j0", 5.0, 4.0),       # the target, after the cutoff
            *[fight(D(2024, m, 1), "soft", 5.0, 4.0) for m in (2, 5, 8, 11)]]}
        return data

    def test_adjusting_for_easy_opponents_lowers_the_estimate(self):
        rows = oa.predictions(self.world(), D(2025, 1, 1), "landed")
        hero = next(r for r in rows if r["slug"] == "hero")
        self.assertAlmostEqual(hero["actual"], 5.0)
        self.assertAlmostEqual(hero["rawW"], 5.0, places=6)
        self.assertLess(hero["adjW_lg"], hero["rawW"], "they did it against opponents who are easy to hit")
        self.assertLess(hero["adjWxOpp_lg"], hero["rawW"], "and the next opponent is not")

    def test_a_fighter_with_no_fight_after_the_cutoff_is_not_scored(self):
        rows = oa.predictions(self.world(), D(2025, 1, 1), "landed")
        self.assertEqual([r["slug"] for r in rows], ["hero"], "only Hero fights after the cutoff")

    def test_nothing_after_the_cutoff_reaches_a_prediction(self):
        def hero_row(world):
            row = next(r for r in oa.predictions(world, D(2025, 1, 1), "landed") if r["slug"] == "hero")
            return {k: v for k, v in row.items() if k != "actual"}

        world = self.world()
        before = hero_row(world)
        world["hero"]["fights"][0] = fight(D(2026, 1, 1), "j0", 99.0, 99.0)   # a wild future fight
        world["j0"]["fights"].insert(0, fight(D(2026, 2, 1), "hero", 99.0, 99.0))
        self.assertEqual(before, hero_row(world), "changing the future must not change any prediction")


class LoadFighters(unittest.TestCase):
    def file(self, slug, name="A Name"):
        return {"schema": 1, "slug": slug, "name": name, "divisionSlug": "flyweight",
                "roundFields": ["sigLanded", "controlSec"], "fights": [
                    {"date": "2025-01-01", "opponentSlug": "other", "statsComplete": True, "seconds": 300,
                     "rounds": [[1, 300, [15, 0], [10, 0]]]},
                    {"date": "2024-01-01", "opponentSlug": "other", "statsComplete": False, "seconds": 300,
                     "rounds": [[1, 300, [99, 0], [99, 0]]]}]}

    def test_rates_per_minute_and_incomplete_fights_left_out(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = pathlib.Path(tmp)
            (d / "real.json").write_text(json.dumps(self.file("real")))
            out = oa.load_fighters(d)
        self.assertEqual(list(out), ["real"])
        self.assertEqual(len(out["real"]["fights"]), 1, "a fight without full stats is not evidence")
        self.assertAlmostEqual(out["real"]["fights"][0]["landed"], 3.0)
        self.assertAlmostEqual(out["real"]["fights"][0]["absorbed"], 2.0)

    def test_a_stale_duplicate_file_is_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = pathlib.Path(tmp)
            (d / "real.json").write_text(json.dumps(self.file("real")))
            (d / "real 2.json").write_text(json.dumps(self.file("real")))
            self.assertEqual(list(oa.load_fighters(d)), ["real"])


if __name__ == "__main__":
    unittest.main()
