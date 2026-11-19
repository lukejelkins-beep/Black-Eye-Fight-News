import datetime as dt, importlib.util, json, tempfile, unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("source_health", Path(__file__).resolve().parents[1] / "scripts" / "source-health.py")
sh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sh)
NOW = dt.datetime(2026, 11, 19, 4, 0, tzinfo=dt.timezone.utc)


def write(directory, name, value):
    (Path(directory) / name).write_text(json.dumps(value), encoding="utf-8")


class SourceHealthTests(unittest.TestCase):
    def report(self, **files):
        with tempfile.TemporaryDirectory() as tmp:
            for name, value in files.items():
                write(tmp, name.replace("_", "-") + ".json", value)
            return sh.render(tmp, NOW)

    def test_flags_failed_silent_bing_and_photoless_feeds(self):
        news = {
            "lastSuccessfulAt": "2026-11-19T03:30:00+00:00",
            "sources": [
                {"name": "Good", "sport": "mma", "ok": True, "feedUrl": "https://a.test/feed", "lastSuccessfulAt": "2026-11-19T03:30:00+00:00"},
                {"name": "Broken", "sport": "mma", "ok": False, "error": "cagewarriors.com: HTTP Error 403: Forbidden"},
                {"name": "Quiet", "sport": "mma", "ok": False, "error": "adcombat.com: No recent, source-verified articles"},
                {"name": "Old", "sport": "boxing", "ok": True, "feedUrl": "https://b.test/feed"},
                {"name": "Search", "sport": "mma", "ok": True, "feedUrl": "https://www.bing.com/news/search?q=x"},
            ],
            "articles": [
                {"source": "Good", "publishedAt": "2026-11-19T02:00:00+00:00", "image": {"url": "https://i.test/1.jpg"}},
                {"source": "Old", "publishedAt": "2026-09-01T00:00:00+00:00"},
                {"source": "Search", "publishedAt": "2026-11-18T00:00:00+00:00"},
            ],
            "resultReports": [],
        }
        rows = {r["name"]: r for r in sh.news_rows(news, NOW)}
        self.assertEqual(rows["Good"]["flags"], [])
        self.assertTrue(any(f.startswith("BROKEN") for f in rows["Broken"]["flags"]))
        self.assertTrue(any(f.startswith("quiet") for f in rows["Quiet"]["flags"]))
        self.assertTrue(any("silent 30+" in f for f in rows["Old"]["flags"]))
        self.assertTrue(any("Bing" in f for f in rows["Search"]["flags"]))
        self.assertTrue(any("no photos" in f for f in rows["Search"]["flags"]))
        self.assertEqual(rows["Good"]["photos"], "1/1")

    def test_pipes_in_errors_do_not_break_the_table(self):
        report = self.report(news_live={"sources": [{"name": "Broken", "sport": "mma", "ok": False, "error": "a | b"}], "articles": [], "resultReports": []})
        line = [l for l in report.splitlines() if l.startswith("| Broken")][0]
        self.assertEqual(line.count("|"), 10)

    def test_social_platform_staleness_and_x_cache(self):
        talk = {
            "posts": [{"platform": "Instagram", "postedAt": "2026-11-10T00:00:00Z"}, {"platform": "Bluesky", "postedAt": "2026-11-19T02:00:00Z"}],
            "platformStatus": [{"platform": "Instagram", "state": "unavailable", "configured": 53, "checked": 0, "message": "HTTP 401"}],
        }
        xcache = {"posts": [{"platform": "X", "postedAt": "2026-11-19T03:00:00Z"}]}
        rows = {r["platform"]: r for r in sh.social_rows(talk, NOW, xcache)}
        self.assertTrue(any("hidden from Live" in f for f in rows["Instagram"]["flags"]))
        self.assertEqual(rows["X"]["day"], 1)
        self.assertEqual(rows["Bluesky"]["flags"], [])

    def test_missing_files_do_not_crash(self):
        report = self.report()
        self.assertIn("No ledger found.", report)
        self.assertIn("No embed data found.", report)

    def test_budget_line(self):
        report = self.report(fight_talk_x_budget={"month": "2026-11", "completed": 92, "attempts": 94, "verifiedEstimateMicroUsd": 255300, "lastCompletedAt": "2026-11-19T03:50:00Z", "paused": False})
        self.assertIn("92 of 94 calls completed, about US$0.26", report)


if __name__ == "__main__":
    unittest.main()
