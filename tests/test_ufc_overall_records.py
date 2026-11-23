"""Tests for scripts/build-ufc-overall-records.py. Offline: inline data only."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("overall", ROOT / "scripts/build-ufc-overall-records.py")
overall = importlib.util.module_from_spec(spec)
spec.loader.exec_module(overall)


def fights(*rows):
    return [{"date": d, "outcome": o} for d, o in rows]


class OverallRecord(unittest.TestCase):
    def test_fights_after_observed_day_are_added_once(self):
        prof = {"record": "14-2-0", "observedOn": "2026-11-11"}
        f = {"fights": fights(("2026-11-14", "W"), ("2026-06-14", "W"), ("2025-10-25", "NC"), ("2023-03-04", "L"))}
        r = overall.build_one(prof, f)
        self.assertEqual((r["W"], r["L"], r["D"], r["NC"]), (15, 2, 0, 1))
        self.assertEqual(r["sinceObserved"], 1)

    def test_fight_on_or_before_observed_day_is_not_added(self):
        prof = {"record": "5-1-0", "observedOn": "2026-11-11"}
        f = {"fights": fights(("2026-11-11", "W"), ("2026-05-01", "L"))}
        r = overall.build_one(prof, f)
        self.assertEqual((r["W"], r["L"]), (5, 1))
        self.assertEqual(r["sinceObserved"], 0)

    def test_nc_counts_ufc_bouts_only_and_says_so(self):
        r = overall.build_one({"record": "3-0-0", "observedOn": "2026-11-11"}, {"fights": fights(("2026-01-01", "NC"))})
        self.assertEqual(r["NC"], 1)
        self.assertEqual(r["ncScope"], "ufc")

    def test_record_below_own_ufc_results_is_left_out(self):
        prof = {"record": "1-0-0", "observedOn": "2026-11-11"}
        f = {"fights": fights(("2026-01-01", "W"), ("2025-01-01", "W"))}
        self.assertIsNone(overall.build_one(prof, f))

    def test_missing_or_malformed_record_is_left_out(self):
        for rec in (None, "", "15-3", "n/a"):
            self.assertIsNone(overall.build_one({"record": rec, "observedOn": "2026-11-11"}, {"fights": []}))
        self.assertIsNone(overall.build_one({"record": "1-0-0", "observedOn": ""}, {"fights": []}))

    def test_build_lists_who_was_left_out_and_is_sorted(self):
        research = {"b": {"record": "2-0-0", "observedOn": "2026-11-11"}, "a": {"record": "1-0-0", "observedOn": "2026-11-11"}}
        out = overall.build(research, {"b": {"fights": []}, "a": {"fights": []}, "c": {"fights": []}})
        self.assertEqual(list(out["records"]), ["a", "b"])
        self.assertEqual(out["coverage"]["noSavedRecord"], ["c"])
        self.assertEqual(out["coverage"]["withOverall"], 2)


if __name__ == "__main__":
    unittest.main()
