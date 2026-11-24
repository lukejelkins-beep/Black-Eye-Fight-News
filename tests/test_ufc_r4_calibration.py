"""Tests for the helpers in scripts/ufc-r4-calibration.py (research only). Offline, synthetic data."""
import datetime as dt
import importlib.util
import math
import pathlib
import random
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("cal", ROOT / "scripts/ufc-r4-calibration.py")
cal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cal)


class Helpers(unittest.TestCase):
    def test_quarters_step_by_three_months_across_a_year_end(self):
        got = [d.isoformat() for d in cal.quarter_starts(dt.date(2024, 7, 1), dt.date(2025, 4, 1))]
        self.assertEqual(got, ["2024-07-01", "2024-10-01", "2025-01-01", "2025-04-01"])

    def test_logistic_is_bounded_and_symmetric(self):
        self.assertAlmostEqual(cal.logistic(0), 0.5)
        self.assertAlmostEqual(cal.logistic(2) + cal.logistic(-2), 1.0)
        self.assertTrue(0 < cal.logistic(1e6) <= 1)

    def test_fit_recovers_the_slope_that_generated_the_outcomes(self):
        rnd = random.Random(3)
        cases = []
        for _ in range(4000):
            x = rnd.uniform(-60, 60)
            cases.append({"overall": x, "y": 1 if rnd.random() < cal.logistic(2.0 * x / 100) else 0})
        self.assertAlmostEqual(cal.fit_k(cases, "overall"), 2.0, delta=0.4)

    def test_fit_declines_to_fit_on_too_little_data(self):
        self.assertEqual(cal.fit_k([{"overall": 5, "y": 1}] * 10, "overall"), 0.0)

    def test_score_of_a_coin_flip(self):
        s = cal.score([0.5] * 4, [1, 0, 1, 0])
        self.assertAlmostEqual(s["brier"], 0.25)
        self.assertAlmostEqual(s["logloss"], math.log(2))
        self.assertAlmostEqual(s["acc"], 0.5)

    def test_bootstrap_is_deterministic_and_signs_the_better_model(self):
        ys = [1, 0] * 50
        good = [0.8, 0.2] * 50
        flat = [0.5] * 100
        lo, hi = cal.bootstrap_diff(good, flat, ys)
        self.assertGreater(lo, 0)
        self.assertEqual((lo, hi), cal.bootstrap_diff(good, flat, ys))


class Evaluate(unittest.TestCase):
    def snap(self):
        return {s: {"overall": o, "form": o, "winrate": 0.5, "status": "established", "division": "d", "sex": "men", "stat": 6}
                for s, o in (("a", 80), ("b", 20), ("c", 50))}

    def test_no_contests_draws_and_unknown_fighters_are_counted_not_scored(self):
        cuts = [dt.date(2024, 1, 1), dt.date(2024, 4, 1)]
        snaps = {c: self.snap() for c in cuts}
        truth = [{"bout": str(i), "date": "2024-02-01", "a": "a", "b": "b", "outcome": "W"} for i in range(150)]
        truth += [{"bout": "n", "date": "2024-05-01", "a": "a", "b": "b", "outcome": "NC"},
                  {"bout": "d", "date": "2024-05-01", "a": "a", "b": "b", "outcome": "D"},
                  {"bout": "x", "date": "2024-05-01", "a": "a", "b": "zz", "outcome": "W"},
                  {"bout": "w", "date": "2024-05-02", "a": "a", "b": "b", "outcome": "W"}]
        res = cal.evaluate(truth, snaps, cuts, dt.date(2024, 6, 1))
        self.assertEqual(res["notscored"], {"NC": 1, "D": 1, "not in the roster at the cutoff": 1})
        self.assertEqual(len(res["tested"]), 1, "the first quarter only trains: no slope is fitted from nothing")
        self.assertEqual(res["tested"][0]["pair"], "established")

    def test_a_pair_with_an_unrated_fighter_is_unrated(self):
        cuts = [dt.date(2024, 1, 1), dt.date(2024, 4, 1)]
        snap = self.snap()
        snap["c"]["status"], snap["c"]["overall"] = "none", None
        snaps = {c: snap for c in cuts}
        truth = [{"bout": str(i), "date": "2024-02-01", "a": "a", "b": "b", "outcome": "W"} for i in range(150)]
        truth.append({"bout": "u", "date": "2024-05-01", "a": "a", "b": "c", "outcome": "W"})
        res = cal.evaluate(truth, snaps, cuts, dt.date(2024, 6, 1))
        row = res["tested"][0]
        self.assertEqual((row["pair"], row["overall"]), ("unrated", None))


if __name__ == "__main__":
    unittest.main()
