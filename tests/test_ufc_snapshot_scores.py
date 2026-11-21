"""Tests for scripts/ufc_snapshot_scores.py (Phase 3 step 3). Offline, inline data."""
import importlib.util
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("sc", ROOT / "scripts/ufc_snapshot_scores.py")
sc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sc)


def window(stat=5, fights=5, kd15=.5, ko=.2, kd_abs=.3, ko_losses=0, sapm=3.0, **rates):
    base = {"slpm": 4.0, "sapm": sapm, "strAcc": .45, "strDef": .55, "kd15": kd15, "kdAbs15": kd_abs, "td15": 1.0, "tdAcc": .4,
            "tdDef": .7, "sub15": .3, "rev15": .1, "ctrlShare": .1, "ctrlAgainstShare": .1, "diffPm": 1.0}
    base.update(rates)
    return {"statFights": stat, "fights": fights, "rates": base, "koWinShare": ko, "subWinShare": .1, "lossesBy": {"ko": ko_losses}}


class Bands(unittest.TestCase):
    def test_cut_points(self):
        self.assertEqual([sc.band(x) for x in (1, 34, 35, 54, 55, 74, 75, 99)],
                         ["red", "red", "orange", "orange", "gold", "gold", "green", "green"])

    def test_non_scores_have_no_band(self):
        for v in (None, 50.5, "60", True):
            self.assertIsNone(sc.band(v), v)


class Power(unittest.TestCase):
    def test_hand_check(self):
        # kd15 .5 -> 50, koWinShare .25 -> 50
        self.assertAlmostEqual(sc.power_raw(window(kd15=.5, ko=.25)), 50.0)
        self.assertAlmostEqual(sc.power_raw(window(kd15=1.0, ko=.5)), 100.0)
        self.assertAlmostEqual(sc.power_raw(window(kd15=0, ko=0)), 0.0, msg="zero is evidence")

    def test_both_components_required(self):
        w = window()
        w["rates"]["kd15"] = None
        self.assertIsNone(sc.power_raw(w))
        w = window()
        w["koWinShare"] = None
        self.assertIsNone(sc.power_raw(w))

    def test_out_of_range_knockdown_rate_is_missing(self):
        self.assertIsNone(sc.power_raw(window(kd15=8.0)))


class Durability(unittest.TestCase):
    def test_hand_check(self):
        # kdAbs 0 -> 100, 0 KO losses -> 100, sapm 1.2 -> 100
        self.assertAlmostEqual(sc.durability_raw(window(kd_abs=0, ko_losses=0, sapm=1.2)), 100.0)
        # kdAbs 1.0 -> 0, ko share .4 (2 of 5) -> clamped 0, sapm 6 -> 0
        self.assertAlmostEqual(sc.durability_raw(window(kd_abs=1.0, ko_losses=2, sapm=6.0)), 0.0)

    def test_lower_is_better(self):
        tough = sc.durability_raw(window(kd_abs=.1, ko_losses=0, sapm=2.0))
        fragile = sc.durability_raw(window(kd_abs=.9, ko_losses=2, sapm=5.5))
        self.assertGreater(tough, fragile)

    def test_first_two_components_required(self):
        w = window()
        w["rates"]["kdAbs15"] = None
        self.assertIsNone(sc.durability_raw(w))
        w = window()
        w["lossesBy"] = {}
        self.assertIsNone(sc.durability_raw(w), "unknown KO losses is not zero")
        w = window(fights=0)
        self.assertIsNone(sc.durability_raw(w))


class Population(unittest.TestCase):
    def make(self, n=30, division="Lightweight"):
        windows, divisions = {}, {}
        for i in range(n):
            windows[f"f{i}"] = window(kd15=i / n, ko=i / (n * 2), kd_abs=(n - i) / n * .8, ko_losses=0 if i > 5 else 1, sapm=1.5 + i / 8)
            divisions[f"f{i}"] = division
        return windows, divisions

    def test_stronger_raw_scores_rank_higher_and_are_capped(self):
        w, d = self.make()
        out = sc.score_population(w, d)
        self.assertGreater(out["f29"]["power"]["roster"], out["f1"]["power"]["roster"])
        for slug, v in out.items():
            if slug == "_peers":
                continue
            for a in sc.ATTRIBUTES:
                for basis in ("roster", "division"):
                    x = v[a][basis]
                    self.assertTrue(x is None or 1 <= x <= 99, (slug, a, basis, x))

    def test_fighters_without_enough_fights_are_not_scored(self):
        w, d = self.make()
        w["thin"] = window(stat=2)
        w["none"] = {"statFights": 5, "rates": None}
        d["thin"] = d["none"] = "Lightweight"
        out = sc.score_population(w, d)
        self.assertNotIn("thin", out)
        self.assertNotIn("none", out)

    def test_small_samples_are_pulled_toward_average_and_rare_events_more(self):
        w, d = self.make()
        w["short"] = window(stat=3, kd15=1.0, ko=.5)
        w["long"] = window(stat=5, kd15=1.0, ko=.5)
        d["short"] = d["long"] = "Lightweight"
        out = sc.score_population(w, d)
        self.assertGreaterEqual(out["long"]["power"]["roster"], out["short"]["power"]["roster"])
        self.assertGreater(sc.SHRINK_K["power"], sc.SHRINK_K["striking"])

    def test_division_percentile_needs_enough_peers(self):
        w, d = self.make(30)
        for i in range(5):
            w[f"s{i}"] = window(kd15=.1 * i, ko=.05 * i)
            d[f"s{i}"] = "Flyweight"
        out = sc.score_population(w, d)
        self.assertIsNone(out["s0"]["power"]["division"], "5 peers is under the minimum")
        self.assertIsNotNone(out["s0"]["power"]["roster"])
        self.assertIsNotNone(out["f5"]["power"]["division"])
        self.assertEqual(out["_peers"]["power"]["divisions"]["Flyweight"], 5)

    def test_no_division_means_no_division_score(self):
        w, d = self.make()
        d["f3"] = None
        self.assertIsNone(sc.score_population(w, d)["f3"]["power"]["division"])

    def test_tiny_roster_ranks_nobody(self):
        w, d = self.make(10)
        out = sc.score_population(w, d)
        self.assertTrue(all(out[s][a]["roster"] is None for s in out if s != "_peers" for a in sc.ATTRIBUTES))

    def test_missing_attribute_stays_none(self):
        w, d = self.make()
        w["nokd"] = window()
        w["nokd"]["rates"]["kd15"] = None
        d["nokd"] = "Lightweight"
        self.assertIsNone(sc.score_population(w, d)["nokd"]["power"]["roster"])

    def test_deterministic(self):
        w, d = self.make()
        self.assertEqual(sc.score_population(w, d), sc.score_population(dict(reversed(list(w.items()))), d))


if __name__ == "__main__":
    unittest.main()
