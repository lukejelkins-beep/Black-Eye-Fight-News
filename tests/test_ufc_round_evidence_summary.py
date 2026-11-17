import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "summary", Path(__file__).resolve().parent.parent / "scripts" / "build-ufc-round-evidence-summary.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def fight(date, rounds=1):
    return {"date": date, "event": "E " + date, "fighterA": "A", "fighterB": "B",
            "sources": {"cito": {}, "ufcalendar": {}},
            "rounds": [{"round": i + 1, "a": {"sigLanded": 5, "takedowns": 1, "controlSec": 30, "headLanded": 9},
                        "b": {"sigLanded": 3}} for i in range(rounds)]}


class SummaryTests(unittest.TestCase):
    def test_keeps_four_newest_with_rounds_only(self):
        fights = {str(i): fight("2026-01-%02d" % (i + 1)) for i in range(6)}
        fights["bad"] = {"date": "2030-01-01", "rounds": []}
        out = mod.build({"fights": fights, "updatedAt": "x"})
        self.assertEqual(out["total"], 6)
        self.assertEqual(list(out["fights"]), ["5", "4", "3", "2"])

    def test_trims_rounds_and_fields(self):
        out = mod.build({"fights": {"1": fight("2026-02-01", rounds=8)}})
        f = out["fights"]["1"]
        self.assertEqual(len(f["rounds"]), 5)
        self.assertEqual(f["rounds"][0]["a"], {"sigLanded": 5, "takedowns": 1, "controlSec": 30})
        self.assertEqual(f["sourceNames"], "Cito + UFCalendar")

    def test_empty_archive(self):
        self.assertEqual(mod.build({})["total"], 0)


if __name__ == "__main__":
    unittest.main()
