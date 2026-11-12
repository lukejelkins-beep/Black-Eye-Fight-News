"""Offline Boxerbook provider matching tests. No API access required."""
import datetime as dt
import importlib.util
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "scripts/boxerbook_source.py"
spec = importlib.util.spec_from_file_location("boxerbook_source", SOURCE)
boxerbook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boxerbook)


class BoxerbookSourceTests(unittest.TestCase):
    def setUp(self):
        self.upcoming = {"events": [
            {"id": "boxing-1", "date": "2026-11-14", "sport": "boxing", "bouts": [
                {"id": "bout-a", "fighters": ["Diego Pacheco", "Darius Fulghum"],
                 "records": ["25-0", "14-1"], "section": "main"}]},
            {"id": "mma-1", "date": "2026-11-14", "sport": "mma", "bouts": [
                {"id": "mma-a", "fighters": ["Diego Pacheco", "Darius Fulghum"]}]}]}
        self.results = {"events": [], "results": [
            {"id": "result-1", "eventId": "boxing-past", "date": "2026-11-08", "sport": "Boxing",
             "fighters": [{"name": "Alycia Baumgardner"}, {"name": "Elif Nur Turhan"}],
             "status": "completed", "winner": 1, "method": "UD"}]}
        self.schedule = {"as_of": "2026-11-12T00:00:00Z", "url": "https://boxerbook.com/schedule",
                         "events": [{"date": "2026-11-14", "bouts": [
                             {"fighters": [{"name": "Darius Fulghum"}, {"name": "Diego Pacheco"}]}]}]}
        self.recent = {"url": "https://boxerbook.com/results", "as_of": "2026-11-12T00:00:00Z",
                       "results": [{"date": "2026-11-08", "boxers": [
                           {"name": "Elif Nur Turhan"}, {"name": "Alycia Baumgardner"}]}]}
        self.now = dt.datetime(2026, 11, 12, tzinfo=dt.timezone.utc)

    def test_exact_match_order_and_accents(self):
        report = boxerbook.reconcile(self.upcoming, self.results, self.schedule, self.recent, self.now)
        self.assertEqual(report["totals"]["matchedBouts"], 2)
        self.assertEqual(report["matched"][0]["boutId"], "bout-a")
        self.assertEqual(boxerbook.pair_key(["José Smith", "John Snow"]),
                         boxerbook.pair_key(["John Snow", "Jose Smith"]))

    def test_no_overwrite_of_sports_facts(self):
        report = boxerbook.reconcile(self.upcoming, self.results, self.schedule, self.recent, self.now)
        u, r = boxerbook.apply_matches(self.upcoming, self.results, report)
        self.assertEqual(u["events"][0]["bouts"][0]["records"], ["25-0", "14-1"])
        self.assertEqual(r["results"][0]["winner"], 1)
        self.assertEqual(r["results"][0]["method"], "UD")
        self.assertNotIn("boxerbookCrosscheck", u["events"][1]["bouts"][0])
        self.assertEqual(u["events"][0]["bouts"][0]["boxerbookCrosscheck"]["url"],
                         "https://boxerbook.com/schedule")
        self.assertNotIn("boxerbookCrosscheck", self.upcoming["events"][0]["bouts"][0])

    def test_mismatched_date_and_opponent_rejected(self):
        self.schedule["events"][0]["date"] = "2026-11-15"
        self.recent["results"][0]["boxers"][1]["name"] = "Someone Else"
        report = boxerbook.reconcile(self.upcoming, self.results, self.schedule, self.recent, self.now)
        self.assertEqual(report["totals"]["matchedBouts"], 0)

    def test_dangerous_attribution_url_rejected(self):
        self.schedule["url"] = "https://imposter.example/redirect"
        report = boxerbook.reconcile(self.upcoming, self.results, self.schedule, self.recent, self.now)
        self.assertEqual(report["totals"]["matchedBouts"], 1)
        self.assertEqual(boxerbook.verified_url("https://boxerbook.com.evil.net/a"), "")

    def test_ambiguous_duplicate_pair_rejected(self):
        self.upcoming["events"].append({"id": "duplicate", "sport": "boxing", "date": "2026-11-14",
                                        "bouts": [{"id": "same", "fighters": ["Diego Pacheco", "Darius Fulghum"]}]})
        report = boxerbook.reconcile(self.upcoming, self.results, self.schedule, self.recent, self.now)
        self.assertEqual(report["totals"]["matchedBouts"], 1)

    def test_report_expires_after_day(self):
        report = boxerbook.reconcile(self.upcoming, self.results, self.schedule, self.recent, self.now)
        self.assertEqual(report["expiresAt"], "2026-11-13T00:00:00Z")

    def test_refuses_unapproved_endpoints(self):
        with self.assertRaises(ValueError):
            boxerbook.fetch_json("/boxers/1", {})


if __name__ == "__main__":
    unittest.main()
