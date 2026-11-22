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


def division(label, **extra):
    """What scripts/build-ufc-card-scores.py reads back from a per-fighter stats file."""
    return {"division": label, "divisionSlug": label.lower().replace(" ", "-"), "divisionSource": "official-roster",
            "latestBoutDivision": label, "newToDivision": False, "previousDivision": None, **extra}


def world():
    windows = {f"s{i}": window(i) for i in range(30)}
    divisions = {f"s{i}": division("Lightweight") for i in range(30)}
    divisions["s2"] = division("Welterweight", newToDivision=True, previousDivision="Lightweight")
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
        self.assertEqual((f["divisionSlug"], f["divisionSource"]), ("welterweight", "official-roster"))

    def test_division_grouping_uses_the_slug_not_the_label(self):
        """One division must not split into two pools over an apostrophe between two sources."""
        snaps, names, windows, divisions = world()
        for i, label in enumerate(("Women’s Bantamweight", "Women's Bantamweight")):
            divisions[f"s{i}"] = division(label, divisionSlug="womens-bantamweight")
        out = cs.build(snaps, names, windows, divisions)
        both = [f for f in out["fighters"].values() if f["slug"] in ("s0", "s1")]
        self.assertEqual({f["divisionSlug"] for f in both}, {"womens-bantamweight"})

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


class DivisionFromTheStatsFile(unittest.TestCase):
    """The resolved division comes from the stats build; only the move note comes from the weight-class file."""

    STATS = {"slug": "x", "division": "Light Heavyweight", "divisionSlug": "light-heavyweight",
             "divisionSource": "official-roster"}

    def test_latest_bout_in_the_same_division_keeps_the_move_note(self):
        out = cs.fighter_division(self.STATS, {"division": "Light Heavyweight", "newToDivision": True,
                                               "previousDivision": "Middleweight"})
        self.assertEqual((out["division"], out["divisionSource"]), ("Light Heavyweight", "official-roster"))
        self.assertEqual((out["newToDivision"], out["previousDivision"]), (True, "Middleweight"))

    def test_latest_bout_elsewhere_reports_the_bout_instead_of_a_move(self):
        out = cs.fighter_division(self.STATS, {"division": "Heavyweight", "newToDivision": True,
                                               "previousDivision": "Light Heavyweight"})
        self.assertEqual(out["division"], "Light Heavyweight", "the ranked division still wins")
        self.assertEqual(out["latestBoutDivision"], "Heavyweight")
        self.assertEqual((out["newToDivision"], out["previousDivision"]), (False, None),
                         "not new to a division they are already ranked in")

    def test_no_weight_class_entry(self):
        out = cs.fighter_division(self.STATS, {})
        self.assertEqual((out["latestBoutDivision"], out["newToDivision"], out["previousDivision"]),
                         (None, False, None))


if __name__ == "__main__":
    unittest.main()
