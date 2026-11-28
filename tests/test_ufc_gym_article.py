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
DATA = json.loads((ROOT / "data/ufc-gym-analysis.json").read_text(encoding="utf-8"))
PAGE = (ROOT / "analysis-ufc-gyms.html").read_text(encoding="utf-8")


class Data(unittest.TestCase):
    def test_every_gym_row_adds_up(self):
        for g in DATA["allGyms"]:
            self.assertEqual(g["wins"] + g["losses"], g["bouts"], g["gym"])
            self.assertAlmostEqual(g["wins"] - g["expectedWins"], g["winsAboveExpected"], delta=0.11, msg=g["gym"])
            self.assertAlmostEqual(100 * g["wins"] / g["bouts"], g["winPct"], delta=0.51, msg=g["gym"])

    def test_chart_gyms_are_the_ones_with_enough_bouts(self):
        self.assertEqual({g["gym"] for g in DATA["gyms"]}, {g["gym"] for g in DATA["allGyms"] if g["bouts"] >= DATA["chartMinBouts"]})
        self.assertEqual(DATA["gymsCompared"], len([g for g in DATA["allGyms"] if g["bouts"] >= DATA["testMinBouts"]]))

    def test_seasons_add_up_to_the_pooled_row(self):
        self.assertEqual(sum(s["decidedBouts"] for s in DATA["seasons"]), DATA["decidedBouts"])
        self.assertEqual(sum(s["events"] for s in DATA["seasons"]), DATA["events"])
        for g in DATA["gyms"]:
            a, b = g["seasons"]["2025"], g["seasons"]["2026"]
            self.assertEqual(a["wins"] + b["wins"], g["wins"], g["gym"])
            self.assertEqual(a["losses"] + b["losses"], g["losses"], g["gym"])
            self.assertAlmostEqual(a["winsAboveExpected"] + b["winsAboveExpected"], g["winsAboveExpected"], delta=0.31, msg=g["gym"])


class Page(unittest.TestCase):
    def test_saved_page_matches_a_fresh_build(self):
        self.assertEqual(PAGE, article.build(DATA))

    def test_every_chart_gym_and_headline_figure_is_on_the_page(self):
        for g in DATA["gyms"]:
            self.assertIn(g["gym"], PAGE)
            self.assertIn(f'{g["wins"]}-{g["losses"]}', PAGE)
        for needle in (f'{DATA["decidedBouts"]:,}', f'{DATA["winnerPickedPct"]}%', f'{round(DATA["permutation"]["p"] * 100)}%'):
            self.assertIn(needle, PAGE)
        for season in DATA["seasons"]:
            self.assertIn(f'{season["decidedBouts"]} fights, {season["events"]} events', PAGE)

    def test_the_city_kickboxing_claim_matches_both_seasons(self):
        ck = next(g for g in DATA["gyms"] if g["gym"] == "City Kickboxing")
        self.assertGreater(ck["seasons"]["2025"]["winsAboveExpected"], 0)
        self.assertGreater(ck["seasons"]["2026"]["winsAboveExpected"], 0)
        self.assertIn("ahead of expectation in both seasons", PAGE)

    def test_page_is_indexable_like_the_rest_of_the_site_and_credits_sherdog(self):
        self.assertIn('name="robots" content="index,follow"', PAGE)
        self.assertIn("Sherdog", PAGE)
        self.assertIn('href="index.html?sport=mma#analysis"', PAGE)

    def test_the_mma_analysis_page_links_to_the_article(self):
        js = (ROOT / "assets/fight-analysis.js").read_text(encoding="utf-8")
        self.assertIn('href="analysis-ufc-gyms.html"', js)

    def test_no_text_under_12px(self):
        self.assertEqual([s for s in re.findall(r"font-size:(\d+)px", PAGE) if int(s) < 12], [])

    def test_bars_stay_inside_the_track(self):
        for left, width in re.findall(r'class="bar [a-z]+" style="left:([\d.]+)%;width:([\d.]+)%"', PAGE):
            self.assertGreaterEqual(float(left), 0)
            self.assertLessEqual(float(left) + float(width), 100.01)


if __name__ == "__main__":
    unittest.main()
