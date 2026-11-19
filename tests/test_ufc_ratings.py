"""Tests for scripts/ufc_ratings.py (ratings v2). JS parity runs in CI (tests/ufc-ratings-parity.cjs)."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("ufc_ratings", ROOT / "scripts/ufc_ratings.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

STRONG = {"slpm": 5.0, "sapm": 2.0, "strAcc": .55, "strDef": .65, "kd15": .8, "td15": 4.0, "tdAcc": .5,
          "tdDef": .9, "sub15": 1.5, "rev15": .3, "ctrlShare": .45, "ctrlAgainstShare": .05, "kdAbs15": .05}
WEAK = {"slpm": 2.0, "sapm": 5.0, "strAcc": .35, "strDef": .45, "kd15": 0.0, "td15": .2, "tdAcc": .2,
        "tdDef": .5, "sub15": 0.0, "rev15": 0.0, "ctrlShare": .02, "ctrlAgainstShare": .4, "kdAbs15": .6}


class Formulas(unittest.TestCase):
    def test_striking_matches_engine_weights_by_hand(self):
        rates = {"slpm": 3.65, "sapm": 3.0, "strAcc": .45, "kd15": .5}
        window = {"koWinShare": .25}
        # between: slpm (3.65-.8)/5.7=50, diff .65 -> (2.65)/5=53, acc 50, kd 50, ko 50
        expected = (50 * .18 + 53 * .22 + 50 * .15 + 50 * .20 + 50 * .25) / 1.0
        self.assertAlmostEqual(r.raw_skill(rates, window, "striking"), expected, places=6)

    def test_evidence_gates(self):
        no_grappling = {"slpm": 3, "sapm": 3, "ctrlShare": .2}
        self.assertIsNone(r.raw_skill(no_grappling, {"subWinShare": None}, "grappling"))
        self.assertIsNone(r.raw_skill({"ctrlShare": .3, "tdDef": .8}, {}, "wrestling"), "needs takedown rate")
        self.assertIsNone(r.raw_skill({"tdDef": .8, "kdAbs15": .1}, {}, "defence"), "needs strikes absorbed or defence")
        self.assertIsNone(r.raw_skill({"slpm": 4}, {}, "striking"), "one component is not enough")

    def test_lower_is_better_components(self):
        good = r.raw_skill({"sapm": 1.5, "strDef": .7}, {}, "defence")
        bad = r.raw_skill({"sapm": 5.5, "strDef": .4}, {}, "defence")
        self.assertGreater(good, bad)

    def test_drivers_explain_each_component(self):
        d = r.drivers(STRONG, {"koWinShare": .3, "subWinShare": .1}, "striking")
        self.assertEqual([x["key"] for x in d], ["slpm", "diffPm", "strAcc", "kd15", "koWinShare"])
        self.assertEqual(sum(x["weight"] for x in d), 1.0)
        self.assertEqual(d[0]["value"], 5.0)
        self.assertTrue(all(0 <= x["score"] <= 100 for x in d if x["score"] is not None))


class Scale(unittest.TestCase):
    def test_percentile_is_mid_rank_and_never_0_or_100(self):
        self.assertEqual(r.percentile(5, list(range(1, 11))), 45)
        self.assertEqual(r.percentile(3, [3, 3, 3, 3]), 50)
        self.assertEqual(r.percentile(1000, list(range(500))), 99)
        self.assertEqual(r.percentile(-1, list(range(500))), 1)
        self.assertIsNone(r.percentile(None, [1, 2]))

    def test_shrink_toward_mean(self):
        self.assertEqual(r.shrink(80, 40, 4), 60)
        self.assertAlmostEqual(r.shrink(80, 40, 36), 76)


class Form(unittest.TestCase):
    def hist(self, outcomes):
        return [{"boutId": str(i), "outcome": o, "opponentSlug": "o%d" % i, "opponent": "O%d" % i}
                for i, o in enumerate(outcomes)]

    def test_matches_the_js_recent_form(self):
        # JS test: win, loss, no contest, draw, win -> 58
        self.assertEqual(r.recent_form(self.hist(["W", "L", "NC", "D", "W"])), 58)
        self.assertIsNone(r.recent_form(self.hist(["W"])))

    def test_opponent_strength_shift_is_bounded(self):
        h = self.hist(["W", "W", "L"])
        plain = r.recent_form(h)
        self.assertEqual(r.recent_form(h, lambda f: .5), plain)
        self.assertGreater(r.recent_form(h, lambda f: 1.0), plain)
        self.assertLess(r.recent_form(h, lambda f: 0.0), plain)
        self.assertLessEqual(r.recent_form(self.hist("WWWWW"), lambda f: 1.0), 100)

    def test_overall_needs_three_skills_and_form(self):
        self.assertIsNone(r.overall({"striking": 50, "grappling": 50, "wrestling": None, "defence": None, "form": 60}))
        self.assertEqual(r.overall({"striking": 60, "grappling": 40, "wrestling": 50, "defence": None, "form": 80}),
                         round((60 * .25 + 40 * .15 + 50 * .2 + 80 * .15) / .75))


class Roster(unittest.TestCase):
    def roster(self):
        fighters = {}
        for i in range(40):
            t = i / 39
            rates = {k: WEAK[k] + (STRONG[k] - WEAK[k]) * t for k in STRONG}
            fighters["f%02d" % i] = {
                "window": {"statFights": 6, "effectiveFights": 5.0, "rates": rates,
                           "koWinShare": .4 * t, "subWinShare": .3 * t},
                "history": [{"boutId": "%d-%d" % (i, j), "outcome": "W" if j < 1 + 3 * t else "L",
                             "opponentSlug": "f%02d" % ((i + j + 1) % 40), "opponent": "x"} for j in range(5)],
                "divisionSlug": "lightweight" if i % 2 else "welterweight"}
        return fighters

    def test_best_and_worst_land_at_the_ends(self):
        out = r.rate_roster(self.roster())
        for k in r.SKILLS:
            self.assertGreaterEqual(out["f39"]["skills"][k]["roster"], 90, k)
            self.assertLessEqual(out["f00"]["skills"][k]["roster"], 10, k)
        self.assertGreater(out["f39"]["overall"], out["f00"]["overall"])

    def test_division_percentiles_need_enough_peers(self):
        fighters = self.roster()
        out = r.rate_roster(fighters)
        self.assertIsNotNone(out["f39"]["skills"]["striking"]["division"], "20 lightweights is enough")
        fighters["f39"]["divisionSlug"] = "flyweight"  # alone in the division
        self.assertIsNone(r.rate_roster(fighters)["f39"]["skills"]["striking"]["division"])

    def test_small_samples_are_not_rated_and_shrink(self):
        fighters = self.roster()
        fighters["f39"]["window"]["statFights"] = 2
        out = r.rate_roster(fighters)
        self.assertFalse(out["f39"]["eligible"])
        self.assertIsNone(out["f39"]["skills"]["striking"]["roster"])
        thin = self.roster()
        thin["f39"]["window"]["effectiveFights"] = .5
        self.assertLess(r.rate_roster(thin)["f39"]["skills"]["striking"]["roster"],
                        r.rate_roster(self.roster())["f39"]["skills"]["striking"]["roster"])

    def test_form_records_opponent_strength(self):
        out = r.rate_roster(self.roster())
        opponents = out["f20"]["form"]["opponents"]
        self.assertEqual(len(opponents), 5)
        self.assertTrue(all(o["strength"] is None or 0 <= o["strength"] <= 1 for o in opponents))


if __name__ == "__main__":
    unittest.main()
