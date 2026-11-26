"""Tests for scripts/build-ufc-bonuses.py: pricing and crediting rules, checked on the built file."""
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("bonuses", ROOT / "scripts/build-ufc-bonuses.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
BUILT = json.loads((ROOT / "data/ufc-bonuses.json").read_text())


class Pricing(unittest.TestCase):
    def test_sourced_eras_only(self):
        self.assertIsNone(m.price("2011-12-31"))        # amounts varied before 2012
        self.assertEqual(m.price("2012-01-01"), 50000)
        self.assertEqual(m.price("2026-01-23"), 50000)  # day before UFC 324
        self.assertEqual(m.price("2026-01-24"), 100000)
        self.assertIsNone(m.price("2026-06-14"))        # White House card: special amounts, not priced


class Crediting(unittest.TestCase):
    def test_totals_add_up(self):
        for slug, r in BUILT["fighters"].items():
            self.assertEqual(r["total"], r["fotn"] + r["potn"] + r["kotn"] + r["sotn"], slug)
            self.assertEqual(sum(len(b["kinds"]) for b in r["bouts"]), r["total"], slug)
            self.assertEqual(r["estimate"], sum(b["est"] or 0 for b in r["bouts"]), slug)

    def test_only_fight_of_the_night_goes_to_a_loser(self):
        for slug, r in BUILT["fighters"].items():
            for b in r["bouts"]:
                if b["outcome"] != "W":
                    self.assertEqual(set(b["kinds"]), {"fotn"}, slug + " " + b["date"])

    def test_rates_are_embedded_for_the_page(self):
        self.assertEqual([x["amount"] for x in BUILT["rates"]], [50000, 100000])


if __name__ == "__main__":
    unittest.main()
