"""Tests for the UFC gyms article: the page matches its data, the data is self-consistent, and the phone rules hold."""
import importlib.util
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("article", ROOT / "scripts/build-ufc-gym-article.py")
article = importlib.util.module_from_spec(spec)
spec.loader.exec_module(article)
DATA = json.loads((ROOT / "data/ufc-gym-analysis-2025.json").read_text(encoding="utf-8"))
PAGE = (ROOT / "analysis-ufc-gyms-2025.html").read_text(encoding="utf-8")


class Data(unittest.TestCase):
    def test_every_gym_row_adds_up(self):
        for g in DATA["allGyms"]:
            self.assertEqual(g["wins"] + g["losses"], g["bouts"], g["gym"])
            self.assertAlmostEqual(g["wins"] - g["expectedWins"], g["winsAboveExpected"], delta=0.11, msg=g["gym"])
            self.assertAlmostEqual(100 * g["wins"] / g["bouts"], g["winPct"], delta=0.51, msg=g["gym"])

    def test_chart_gyms_are_the_ones_with_enough_bouts(self):
        self.assertEqual({g["gym"] for g in DATA["gyms"]}, {g["gym"] for g in DATA["allGyms"] if g["bouts"] >= DATA["minBouts"]})
        self.assertEqual(len(DATA["gyms"]), DATA["gymsCompared"])


class Page(unittest.TestCase):
    def test_saved_page_matches_a_fresh_build(self):
        self.assertEqual(PAGE, article.build(DATA))

    def test_every_chart_gym_and_headline_figure_is_on_the_page(self):
        for g in DATA["gyms"]:
            self.assertIn(g["gym"], PAGE)
            self.assertIn(f'{g["wins"]}-{g["losses"]}', PAGE)
        for needle in (str(DATA["decidedBouts"]), str(DATA["events"]), f'{DATA["winnerPickedPct"]}%'):
            self.assertIn(needle, PAGE)

    def test_draft_is_not_indexed_and_credits_sherdog(self):
        self.assertIn('name="robots" content="noindex,nofollow"', PAGE)
        self.assertIn("Sherdog", PAGE)

    def test_no_text_under_12px(self):
        self.assertEqual([s for s in re.findall(r"font-size:(\d+)px", PAGE) if int(s) < 12], [])

    def test_bars_stay_inside_the_track(self):
        for left, width in re.findall(r'class="bar [a-z]+" style="left:([\d.]+)%;width:([\d.]+)%"', PAGE):
            self.assertGreaterEqual(float(left), 0)
            self.assertLessEqual(float(left) + float(width), 100.01)


if __name__ == "__main__":
    unittest.main()
