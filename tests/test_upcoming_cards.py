import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("upcoming_cards", ROOT / "scripts/refresh-upcoming-cards.py")
upcoming = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upcoming)


class UpcomingCardTests(unittest.TestCase):
    def setUp(self):
        self.year = datetime.now(timezone.utc).year
        self.event = {
            "id": "test-pacheco",
            "date": f"{self.year}-11-14",
            "sport": "boxing",
            "title": "Diego Pacheco vs Darius Fulghum",
            "bouts": [
                {"id": "b1", "fighters": ["Diego Pacheco", "Darius Fulghum"],
                 "division": "Super Middleweight", "section": "main"}
            ],
        }

    def test_dated_source_extracts_pairings(self):
        body = """<html><p>November 14: Carson, Calif. (DAZN, TNT, truTV)</p>
            <p>Diego Pacheco vs. Darius Fulghum, 12 rounds, super middleweights</p>
            <p>Anthony Olascuaga vs. Yuberjen Martinez, 12 rounds, for WBO flyweight title</p>
            <p>November 14: London (DAZN)</p>
            <p>Someone Else vs. Another Opponent, 12 rounds, heavyweights</p></html>"""
        sections = upcoming.parse_bout_lines(body)
        carson = next(x for x in sections.values() if
                      any(pair[0] == "Diego Pacheco" for pair in x))
        self.assertEqual(carson[1][1], "Yuberjen Martinez")
        selected = upcoming.matching_block(self.event, sections)
        self.assertEqual(len(selected), 2)
        self.assertEqual(selected[0][0], "Diego Pacheco")

    def test_merge_only_explicit_confirmed_pairings(self):
        new = upcoming.merge_bouts(self.event,
            [("Diego Pacheco", "Darius Fulghum", 12, "super middleweights"),
             ("Anthony Olascuaga", "Yuberjen Martinez", 12, "flyweights"),
             ("Nishant Dev", "TBA", 8, "junior middleweights")],
            "https://example.org/confirmed-schedule")
        self.assertEqual(new, 1)
        self.assertEqual(len(self.event["bouts"]), 2)
        self.assertEqual(self.event["bouts"][1]["section"], "announced")
        self.assertEqual(self.event["bouts"][1]["division"], "Flyweight")
        self.assertEqual(upcoming.merge_bouts(self.event,
            [("Anthony Olascuaga", "Yuberjen Martinez", 12, "flyweights")],
            "https://example.org/confirmed-schedule"), 0)

    def test_tba_opponent_is_upgraded_from_named_schedule(self):
        self.event["bouts"].append(
            {"id": "tba1", "fighters": ["Federico Pacheco Jr.", "Opponent TBA"],
             "division": "Heavyweight", "section": "announced"})
        upcoming.merge_bouts(self.event,
            [("Federico Pacheco Jr.", "Jack May", 8, "heavyweights")],
            "https://example.org/fights")
        self.assertEqual(self.event["bouts"][1]["fighters"][1], "Jack May")
        self.assertEqual(len(self.event["bouts"]), 2)

    def test_unknown_weight_classes_are_not_invented(self):
        self.assertEqual(upcoming.weight_class(""), "Weight class not confirmed")
        self.assertEqual(upcoming.weight_class("junior middleweights"),
                         "Super Welterweight")
        self.assertEqual(upcoming.weight_class("super featherweights"),
                         "Super Featherweight")

    def test_record_pairings_are_exact_and_preserve_ko_counts(self):
        page = """<html><li>Diego Pacheco (26-0, 19 KOs) vs. Darius Fulghum (15-1-1, 13 KOs), 12 rounds</li>
          <li>Anthony Olascuaga (12-1, 9 KOs) vs. Yuberjen Martinez (7-0, 7 KOs), flyweight</li></html>"""
        rows = upcoming.parse_fightmag_records(page)
        self.assertEqual(len(rows), 2)
        count = upcoming.apply_source_records(self.event, rows, "https://example.com/source")
        self.assertEqual(count, 2)
        self.assertEqual(self.event["bouts"][0]["records"], ["26-0 (19 KOs)", "15-1-1 (13 KOs)"])
        self.assertEqual(upcoming.apply_source_records(self.event, rows, "https://example.com/source"), 0)

    def test_records_never_attach_to_wrong_opponent(self):
        rows = [("Diego Pacheco", "26-0", "Unknown opponent", "15-1")]
        self.assertEqual(upcoming.apply_source_records(self.event, rows, "https://example.com"), 0)
        self.assertNotIn("records", self.event["bouts"][0])

    def test_pfl_name_variants_but_not_arbitrary_matches(self):
        event = {"bouts": [{"fighters": ["Vadim Nemkov", "Sergei Bilostenniy"], "section": "main"}]}
        rows = [("Vadim Nemkov", "20-2", "Sergey Bilostenniy", "15-4")]
        self.assertEqual(upcoming.record_key("Asaël Adjoudj"), upcoming.record_key("Asael Adjoudj"))
        self.assertEqual(upcoming.apply_source_records(event, rows, "https://example.com"), 2)
        self.assertEqual(event["bouts"][0]["records"], ["20-2", "15-4"])

    def test_record_and_poster_enrichment_present_in_schedule(self):
        import json
        data = json.loads((ROOT / "data/upcoming-cards.json").read_text(encoding="utf-8"))
        kab = next(e for e in data["events"] if e["id"] == "kabayel-hysa-2026-11-28")
        pairs = [set(b["fighters"]) for b in kab["bouts"]]
        self.assertIn({"Kevin Saszik", "Patrick Korte"}, pairs)
        self.assertIn({"Daniel Bär", "Arman Khudoyan"}, pairs)
        self.assertTrue(kab["poster"]["url"].startswith("https://"))
        self.assertEqual(kab["bouts"][0]["records"], ["27-0 (19 KOs)", "25-0 (23 KOs)"])
        for event in data["events"]:
            for bout in event["bouts"]:
                if "records" in bout:
                    self.assertEqual(len(bout["records"]), len(bout["fighters"]))
                    for item in bout["records"]:
                        if item is not None:
                            self.assertRegex(item, r"^\d{1,3}-\d{1,3}(?:-\d{1,2})?(?: \(\d+ KOs?\))?$")

    def test_other_sports_are_not_misattached(self):
        mma = dict(self.event, sport="mma")
        s = {(11, 14, "carson california"): [("Diego Pacheco", "Darius Fulghum", 12, "")]}
        self.assertEqual(upcoming.matching_block(mma, s), [])


    def test_boxen1_undercard_headlines_need_both_names(self):
        body = """<html><h1>Auf Agit Kabayel-Undercard: Daniel Bär vs. Arman Khudoyan</h1>
        <p>Kabayel und Nelson Hysa kämpfen am 28. November in Düsseldorf.</p>
        <h2>Granit Shala trifft bei Kabayel-Event auf Kolbeinn Kristinsson</h2>
        <h2>Undercard coming soon - competitors unknown</h2>
        <h2>Some Other Fighter vs. Another Fighter</h2></html>"""
        pairs = upcoming.article_undercard_pairs(body)
        self.assertIn(("Daniel Bär", "Arman Khudoyan"), pairs)
        self.assertIn(("Granit Shala", "Kolbeinn Kristinsson"), pairs)
        self.assertEqual(len(pairs), 2)

    def test_kabayel_independent_bouts_are_reported_not_misassigned(self):
        from unittest.mock import patch
        event = {"id": "kabayel-hysa-2026-11-28", "date": "2026-11-28",
                 "sport": "boxing", "bouts": [
                    {"id": "main", "fighters": ["Agit Kabayel", "Nelson Hysa"],
                     "section": "main", "division": "Heavyweight"}],
                 "additionalSources": [
                    "https://www.boxen1.com/auf-agit-kabayel-undercard-daniel-baer-vs-arman-khudoyan-106405/"]}
        html = """<html><h1>Auf Agit Kabayel-Undercard: Daniel Bär vs. Arman Khudoyan</h1>
                  <p>Agit Kabayel trifft Nelson Hysa am 28. November in Düsseldorf.</p></html>"""
        with patch.object(upcoming, "boxen1_article_urls", return_value=[]), patch.object(
                upcoming, "webpage", return_value=html):
            added = upcoming.refresh_kabayel_undercard(event, "2026-11-08T09:00:00Z")
            self.assertEqual(added, 1)
            self.assertEqual(upcoming.refresh_kabayel_undercard(
                event, "2026-11-08T09:00:00Z"), 0)
        self.assertEqual(len(event["bouts"]), 2)
        new_bout = event["bouts"][1]
        self.assertEqual(new_bout["fighters"], ["Daniel Bär", "Arman Khudoyan"])
        self.assertEqual(new_bout["section"], "announced")
        self.assertEqual(new_bout["status"], "reported")
        self.assertEqual(new_bout["division"], "Weight class not confirmed")
        self.assertEqual(new_bout["records"], [None, None])

    def test_kabayel_report_not_added_to_another_event(self):
        before = len(self.event["bouts"])
        self.assertEqual(upcoming.refresh_kabayel_undercard(
            self.event, "2026-11-08T09:00:00Z"), 0)
        self.assertEqual(len(self.event["bouts"]), before)


if __name__ == "__main__":
    unittest.main()
