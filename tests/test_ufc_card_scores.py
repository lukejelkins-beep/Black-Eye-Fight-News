"""Tests for scripts/build-ufc-card-scores.py (Phase 3 step 3). Offline, inline data."""
import importlib.util
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("cs", ROOT / "scripts/build-ufc-card-scores.py")
cs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cs)


def window(i, n=30, stat=5):
    return {"statFights": stat, "fights": 5, "koWinShare": i / (n * 2), "subWinShare": .1, "lossesBy": {"ko": 0 if i > 5 else 1},
            "rates": {"slpm": 3 + i / 10, "sapm": 1.5 + (n - i) / 10, "strAcc": .4 + i / 100, "strDef": .5, "kd15": i / n, "kdAbs15": (n - i) / n * .8,
                      "td15": i / 10, "tdAcc": .4, "tdDef": .7, "sub15": .2, "rev15": .1, "ctrlShare": .1, "ctrlAgainstShare": .1, "diffPm": 1}}


def world():
    windows = {f"s{i}": window(i) for i in range(30)}
    divisions = {f"s{i}": {"division": "Lightweight", "newToDivision": False, "previousDivision": None} for i in range(30)}
    divisions["s2"] = {"division": "Welterweight", "newToDivision": True, "previousDivision": "Lightweight"}
    names = {f"f{i}": f"s{i}" for i in range(30)}
    names["thin"] = "thin-slug"
    windows["thin-slug"] = window(3, stat=2)
    snaps = {"fighters": {k: {"name": k.upper()} for k in [*names, "ghost"]},
             "events": [{"id": "e1", "bouts": [{"id": "b1", "fighters": ["f20", "f25"]}, {"id": "b2", "fighters": ["f2", "f25"]},
                                               {"id": "b3", "fighters": ["f20", "thin"]}, {"id": "b4", "fighters": ["f20", "ghost"]}]}]}
    return snaps, names, windows, divisions


class Build(unittest.TestCase):
    def setUp(self):
        self.out = cs.build(*world(), stats_as_of="2026-11-14")
        self.bouts = {b["id"]: b for e in self.out["events"] for b in e["bouts"]}

    def test_same_division_bout_uses_division_basis_for_both(self):
        b = self.bouts["b1"]
        self.assertEqual(b["division"], "Lightweight")
        self.assertTrue(all(v == "division" for v in b["basis"].values()))
        self.assertGreater(b["scores"][1]["power"]["score"], b["scores"][0]["power"]["score"])
        self.assertIn(b["scores"][0]["power"]["band"], ("red", "orange", "gold", "green"))

    def test_cross_division_bout_falls_back_to_roster_for_both(self):
        b = self.bouts["b2"]
        self.assertIsNone(b["division"])
        self.assertTrue(all(v == "roster" for v in b["basis"].values()))
        self.assertIsNotNone(b["scores"][0]["power"] and b["scores"][0]["power"]["score"])

    def test_thin_and_unknown_fighters_get_no_scores(self):
        self.assertEqual(self.out["fighters"]["thin"]["status"], "limited")
        self.assertEqual(self.out["fighters"]["ghost"]["status"], "none")
        for bid in ("b3", "b4"):
            self.assertTrue(all(v is None for v in self.bouts[bid]["scores"][1].values()))
            self.assertIsNotNone(self.bouts[bid]["scores"][0]["striking"], "the other fighter is still scored")

    def test_division_flags_come_from_the_weight_class_file(self):
        f = self.out["fighters"]["f2"]
        self.assertEqual((f["division"], f["newToDivision"], f["previousDivision"]), ("Welterweight", True, "Lightweight"))

    def test_scores_are_percentiles_with_bands_never_zero_or_100(self):
        for b in self.bouts.values():
            for side in b["scores"]:
                for v in side.values():
                    if v:
                        self.assertTrue(1 <= v["score"] <= 99)

    def test_header_and_determinism(self):
        self.assertEqual((self.out["schema"], self.out["window"], self.out["statsAsOf"]), (1, "last5", "2026-11-14"))
        self.assertEqual(self.out["minimums"], {"statFights": 3, "roster": 20, "divisionPeers": 8})
        self.assertEqual(self.out, cs.build(*world(), stats_as_of="2026-11-14"))

    def test_empty_snapshot_file(self):
        out = cs.build({"fighters": {}, "events": []}, {}, {}, {})
        self.assertEqual((out["events"], out["fighters"]), ([], {}))


if __name__ == "__main__":
    unittest.main()
