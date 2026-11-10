"""Regression tests for seven source-checked PFL results cards."""
import copy
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("pfl_official", ROOT / "scripts/import-official-pfl-2026.py")
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)

class OfficialPFLArchiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads((ROOT / "data/pfl-official-results-2026.json").read_text())

    def demo(self):
        return {"events": [
            {"id": e["id"], "date": e["date"], "name": e["id"],
             "expectedBouts": 20, "partialCoverage": True, "mainBoutId": e["id"] + "-headline"}
            for e in self.fixture["events"]
        ], "results": [
            {"id": e["id"] + "-headline", "eventId": e["id"],
             "fighters": [{"name": e["rows"][0][0]}, {"name": e["rows"][0][2]}],
             "status": "completed", "winner": 0}
            for e in self.fixture["events"]
        ]}

    def test_fixture_full_and_unique(self):
        cards = module.validated_fixture(self.fixture)
        self.assertEqual(len(cards), 7)
        self.assertEqual(sum(len(c["rows"]) for c in cards), 67)

    def test_idempotent_full_card_merge(self):
        archive = self.demo()
        first = module.merge(archive, self.fixture)
        self.assertEqual(sum(x["newBouts"] for x in first), 60)
        for event in archive["events"]:
            self.assertFalse(event["partialCoverage"])
            self.assertEqual(sum(row["eventId"] == event["id"] for row in archive["results"]),
                             event["expectedBouts"])
        second = module.merge(archive, self.fixture)
        self.assertEqual(sum(x["newBouts"] for x in second), 0)
        self.assertEqual(len(archive["results"]), 67)

    def test_replaces_incorrect_nigeria_no_contest(self):
        archive = self.demo()
        headline = next(row for row in archive["results"]
                        if row["eventId"] == "pfl-2026-06-13-africa-nigeria")
        headline["fighters"] = [{"name": "Wasi Adeshina"}, {"name": "Ignacio Campos"}]
        headline["winner"] = None
        headline["method"] = "No contest"
        module.merge(archive, self.fixture)
        self.assertEqual(headline["fighters"][0]["name"], "Ignacio Campos")
        self.assertEqual(headline["winner"], 0)
        self.assertIn("Submission", headline["method"])

    def test_only_sourced_records_not_inferred_tallies(self):
        archive = self.demo()
        module.merge(archive, self.fixture)
        for row in archive["results"]:
            for fighter in row["fighters"]:
                self.assertEqual(fighter.get("recordContext"), "event-listing")
                self.assertTrue(fighter.get("recordSource", "").startswith("https://"))

    def test_fails_closed_on_duplicate(self):
        f = copy.deepcopy(self.fixture)
        f["events"][0]["rows"].append(f["events"][0]["rows"][0])
        with self.assertRaises(ValueError):
            module.validated_fixture(f)

if __name__ == "__main__":
    unittest.main()
