"""Tests for scripts/refresh-ufc-rosters.py (no network: injected transport, synthetic rows)."""
import datetime as dt
import importlib.util
import json
import pathlib
import tempfile
import unittest
import urllib.error

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("rosters", ROOT / "scripts/refresh-ufc-rosters.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
divisions = r._module()
TODAY = dt.date(2026, 11, 22)
r.MIN_ACCEPTED = 3  # synthetic data is small


def row(name, division, active=True, slug=None):
    return {"slug": slug or name.lower().replace(" ", "-"), "name": name, "division": division, "isActive": active}


NAMES = {r.name_key(n): s for n, s in [
    ("Alex Pereira", "alex-pereira"), ("Casey O'Neill", "casey-o-neill"), ("New Guy", "new-guy"),
    ("Other Guy", "other-guy"), ("Third Guy", "third-guy"), ("Retired Guy", "retired-guy")]}


def previous():
    d = {"schema": 1, "source": "ufc.com/rankings", "divisions": {}, "fighters": {}}
    for slug, label in divisions.DIVISIONS.items():
        d["divisions"][slug] = {"label": label, "observedOn": "2026-11-21", "rankingDate": "2026-11-17",
                                "champion": None, "ranked": [], "roster": []}
    d["divisions"]["light-heavyweight"]["roster"] = ["alex-pereira"]
    d["divisions"]["womens-flyweight"]["roster"] = ["casey-o-neill"]
    d["fighters"] = divisions.fighter_index(d["divisions"])
    return d


class MergeTests(unittest.TestCase):
    def test_adds_only_new_active_fighters_and_leaves_conflicts_alone(self):
        rows = [row("Alex Pereira", "Heavyweight"),  # conflict: saved light heavyweight
                row("Casey O'Neill", "Women's Flyweight"),  # already there
                row("New Guy", "Lightweight"), row("Other Guy", "Flyweight"), row("Third Guy", "Women's Strawweight"),
                row("Retired Guy", "Welterweight", active=False),
                row("Unknown Fighter", "Lightweight"), row("No Division", None)]
        doc, rep = r.merge(previous(), rows, NAMES, TODAY, divisions)
        self.assertEqual(rep["added"], 3)
        self.assertEqual(doc["divisions"]["lightweight"]["roster"], ["new-guy"])
        self.assertEqual(doc["divisions"]["flyweight"]["roster"], ["other-guy"])
        self.assertNotIn("retired-guy", doc["fighters"])
        self.assertEqual(rep["conflicts"], [{"slug": "alex-pereira", "saved": "light-heavyweight", "cito": "heavyweight"}])
        self.assertEqual(doc["fighters"]["alex-pereira"]["division"], "light-heavyweight")  # not moved
        self.assertEqual(rep["unmatchedToSiteStats"], 1)
        self.assertEqual(rep["activeWithoutDivision"], 1)
        self.assertEqual((doc["rosterSource"], doc["rosterObservedOn"]), ("cito", "2026-11-22"))

    def test_never_touches_rankings_or_champions(self):
        prev = previous()
        prev["divisions"]["lightweight"]["champion"] = {"slug": "x", "name": "X"}
        prev["divisions"]["lightweight"]["ranked"] = [{"rank": 0, "slug": "x", "name": "X"}]
        prev["divisions"]["lightweight"]["rankingDate"] = "2026-11-17"
        rows = [row("New Guy", "Lightweight"), row("Other Guy", "Flyweight"), row("Third Guy", "Women's Strawweight")]
        doc, _ = r.merge(prev, rows, NAMES, TODAY, divisions)
        lw = doc["divisions"]["lightweight"]
        self.assertEqual((lw["champion"], lw["ranked"], lw["rankingDate"]), (prev["divisions"]["lightweight"]["champion"],
                         prev["divisions"]["lightweight"]["ranked"], "2026-11-17"))
        self.assertEqual(doc["source"], "ufc.com/rankings")

    def test_too_few_matches_writes_nothing(self):
        with self.assertRaises(r.Stopped):
            r.merge(previous(), [row("New Guy", "Lightweight")], NAMES, TODAY, divisions)

    def test_name_key_handles_accents_and_punctuation(self):
        self.assertEqual(r.name_key("Lone’er Kavanagh"), "loneerkavanagh")
        self.assertEqual(r.name_key("Jiří Procházka"), "jiriprochazka")


def pages(*batches, remaining="400"):
    """Transport that serves batches as consecutive pages."""
    calls = []
    def transport(path):
        calls.append(path)
        i = len(calls) - 1
        meta = {"hasNextPage": i < len(batches) - 1, "total": sum(len(b) for b in batches)}
        return {"success": True, "data": batches[i], "meta": meta}, {"X-RateLimit-Monthly-Remaining": remaining}
    transport.calls = calls
    return transport


class FetchTests(unittest.TestCase):
    def test_collects_all_pages_and_records_every_request(self):
        own = {"requests": []}
        t = pages([row("A", "Lightweight")], [row("B", "Lightweight")], [row("C", "Lightweight")])
        rows = r.fetch_active("k", own, {"requests": []}, TODAY, t)
        self.assertEqual(len(rows), 3)
        self.assertEqual(own["requests"], ["2026-11-22"] * 3)
        self.assertIn("limit=500&page=3", t.calls[2])
        self.assertEqual(own["providerRemaining"], 400)

    def test_stops_on_429_and_still_counts_the_request(self):
        own = {"requests": []}
        def transport(path):
            raise urllib.error.HTTPError(path, 429, "Too Many", {}, None)
        with self.assertRaises(r.Stopped):
            r.fetch_active("k", own, {"requests": []}, TODAY, transport)
        self.assertEqual(own["error"], "HTTP_429")
        self.assertEqual(len(own["requests"]), 1)

    def test_stops_when_provider_allowance_is_nearly_gone(self):
        with self.assertRaises(r.Stopped):
            r.fetch_active("k", {"requests": []}, {"requests": []}, TODAY, pages([row("A", "Lightweight")], remaining="3"))

    def test_rolling_budget_counts_both_ledgers_and_forgets_old_days(self):
        old = ["2026-10-01"] * 200  # outside 30 days: ignored
        recent_research = ["2026-11-20"] * 100
        own = {"requests": ["2026-11-21"] * 20 + old}
        self.assertEqual(r.budget_left(own, {"requests": recent_research}, TODAY), 0)
        with self.assertRaises(r.Stopped):
            r.fetch_active("k", own, {"requests": recent_research}, TODAY, pages([row("A", "Lightweight")]))
        self.assertEqual(r.budget_left({"requests": old}, {"requests": []}, TODAY), 120)

    def test_incomplete_pass_beyond_run_cap_is_refused(self):
        t = lambda path: ({"success": True, "data": [row("A", "Lightweight")], "meta": {"hasNextPage": True, "total": 99}}, {})
        with self.assertRaises(r.Stopped):
            r.fetch_active("k", {"requests": []}, {"requests": []}, TODAY, t)

    def test_invalid_response_is_refused(self):
        with self.assertRaises(r.Stopped):
            r.fetch_active("k", {"requests": []}, {"requests": []}, TODAY, lambda p: ({"success": False}, {}))


class MainTests(unittest.TestCase):
    def test_offline_rows_write_data_and_leave_ledger_alone(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = pathlib.Path(tmp)
            out, ledger, rows = tmp / "d.json", tmp / "ledger.json", tmp / "rows.json"
            out.write_text(json.dumps(previous()), encoding="utf-8")
            names_backup = r.read_json
            rows.write_text(json.dumps([["new-guy", "New Guy", "Lightweight", "Active", True, "none"],
                                        ["other-guy", "Other Guy", "Flyweight", "Active", True, "none"],
                                        ["third-guy", "Third Guy", "Women's Strawweight", "Active", True, "none"]]), encoding="utf-8")
            old = r.NAMES
            names_file = tmp / "names.json"
            names_file.write_text(json.dumps({"names": NAMES}), encoding="utf-8")
            r.NAMES = names_file
            try:
                self.assertEqual(r.main(["--from-rows", str(rows), "--out", str(out), "--ledger", str(ledger)]), 0)
            finally:
                r.NAMES = old
            self.assertEqual(json.loads(out.read_text(encoding="utf-8"))["rosterDiagnostics"]["added"], 3)
            self.assertFalse(ledger.exists())

    def test_missing_secret_stops_without_writing_data(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            tmp = pathlib.Path(tmp)
            out, ledger = tmp / "d.json", tmp / "ledger.json"
            out.write_text(json.dumps(previous()), encoding="utf-8")
            before = out.read_text(encoding="utf-8")
            saved = os.environ.pop("UFC_STATS_API_CITO", None)
            try:
                self.assertEqual(r.main(["--out", str(out), "--ledger", str(ledger)]), 2)
            finally:
                if saved is not None:
                    os.environ["UFC_STATS_API_CITO"] = saved
            self.assertEqual(out.read_text(encoding="utf-8"), before)


if __name__ == "__main__":
    unittest.main()
