"""Tests for scripts/refresh-ufc-divisions.py (no network: a fake client)."""
import datetime as dt
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("divisions", ROOT / "scripts/refresh-ufc-divisions.py")
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)
collector = d._collector()
ref = collector.ref


def fighter(name, slug, fid):
    return {"name": name, "slug": slug, "id": fid, "country_code": "US"}


class FakeClient:
    def __init__(self, payloads):
        self.payloads, self.calls = payloads, []

    def call(self, path):
        self.calls.append(path)
        return self.payloads.get(path.rsplit("/", 1)[-1])


NESTED = {"data": {
    "rankings": {"snapshot_date": "2026-11-10", "entries": [
        {"rank": 0, "is_champion": True, "fighter": fighter("Islam Makhachev", "islam-makhachev", 1)},
        {"rank": 1, "fighter": fighter("Jack Della Maddalena", "jack-della-maddalena", 2)},
        {"rank": 2, "fighter": fighter("Ian Machado Garry", "ian-machado-garry", 3)}]},
    "roster": [{"fighter": fighter("Jack Della Maddalena", "jack-della-maddalena", 2)},
               {"fighter": fighter("Unranked Guy", "unranked-guy", 9)}]}}
FLAT = {"data": {"rankings": [{"rank": 3, **fighter("Flat Ranked", "flat-ranked", 4)}],
                 "roster": [fighter("Flat Roster", "flat-roster", 5)]}}


class Parse(unittest.TestCase):
    def test_nested_entries_rankings_and_champion(self):
        out = d.parse_division(NESTED["data"], "welterweight", ref, "2026-11-19")
        self.assertEqual(out["label"], "Welterweight")
        self.assertEqual(out["champion"], {"slug": "islam-makhachev", "name": "Islam Makhachev"})
        self.assertEqual([r["rank"] for r in out["ranked"]], [0, 1, 2])
        self.assertEqual(out["rankingDate"], "2026-11-10")
        self.assertIn("islam-makhachev", out["roster"], "ranked fighters join the roster")
        self.assertIn("unranked-guy", out["roster"])

    def test_flat_entries(self):
        out = d.parse_division(FLAT["data"], "lightweight", ref, "2026-11-19")
        self.assertEqual(out["ranked"], [{"rank": 3, "slug": "flat-ranked", "name": "Flat Ranked"}])
        self.assertEqual(out["roster"], ["flat-ranked", "flat-roster"])

    def test_unrecognised_payload_is_not_data(self):
        self.assertIsNone(d.parse_division({"something": []}, "flyweight", ref, "2026-11-19"))
        self.assertIsNone(d.parse_division(None, "flyweight", ref, "2026-11-19"))


class PrimaryDivision(unittest.TestCase):
    def test_champion_beats_rank_beats_heavier_roster(self):
        divisions = {
            "lightweight": {"label": "Lightweight", "ranked": [{"rank": 0, "slug": "double", "name": "D"}],
                            "roster": ["double", "plain"]},
            "welterweight": {"label": "Welterweight", "ranked": [{"rank": 5, "slug": "double", "name": "D"}],
                             "roster": ["double", "plain"]},
        }
        out = d.fighter_index(divisions)
        self.assertEqual((out["double"]["division"], out["double"]["rank"], out["double"]["champion"]),
                         ("lightweight", 0, True))
        self.assertEqual(out["double"]["divisions"], ["welterweight", "lightweight"])
        self.assertEqual(out["plain"]["division"], "welterweight", "unranked: heavier roster first")


class Refresh(unittest.TestCase):
    def test_failed_division_keeps_previous_data_and_records_shape(self):
        previous = {"divisions": {"flyweight": {"label": "Flyweight", "ranked": [], "roster": ["kept"]}}}
        client = FakeClient({"welterweight": NESTED, "flyweight": {"data": {"odd": [{"x": 1}]}}})
        out = d.refresh(client, ref, previous, dt.date(2026, 11, 19))
        self.assertEqual(len(client.calls), len(d.DIVISIONS))
        self.assertEqual(out["divisions"]["flyweight"]["roster"], ["kept"])
        self.assertEqual(out["diagnostics"]["flyweight"]["shape"]["keys"], ["odd"])
        self.assertNotIn("x", json.dumps(out["diagnostics"]["flyweight"]), "keys only, never values")
        self.assertEqual(out["fetchedDivisions"], 1)
        self.assertEqual(out["fighters"]["islam-makhachev"]["label"], "Welterweight")


class StatsBuildUsesOfficialDivisions(unittest.TestCase):
    def test_official_division_rank_and_champion_reach_the_index(self):
        stats_spec = importlib.util.spec_from_file_location("stats", ROOT / "scripts/build-ufc-stats.py")
        stats = importlib.util.module_from_spec(stats_spec)
        stats_spec.loader.exec_module(stats)
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "ufc-divisions.json"
            path.write_text(json.dumps({"fighters": d.fighter_index(
                {"welterweight": d.parse_division(NESTED["data"], "welterweight", ref, "2026-11-19")})}))
            original = stats.official_divisions
            stats.official_divisions = lambda: original(path)
            try:
                index = stats.build(dt.date(2026, 11, 14), pathlib.Path(tmp) / "out")
            finally:
                stats.official_divisions = original
        row = index["fighters"]["islam-makhachev"]
        self.assertEqual((row["division"], row["divisionSlug"], row["officialRank"], row["champion"]),
                         ("Welterweight", "welterweight", 0, True))
        self.assertEqual(index["fighters"]["ian-machado-garry"]["officialRank"], 2)
        self.assertGreaterEqual(index["divisionCoverage"]["officialRoster"], 2)


if __name__ == "__main__":
    unittest.main()
