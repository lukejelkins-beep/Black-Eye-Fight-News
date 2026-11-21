"""Tests for scripts/build-ufc-card-snapshots.py (Phase 3 step 1). Offline: no data files are read."""
import datetime as dt
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("snap", ROOT / "scripts/build-ufc-card-snapshots.py")
snap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snap)

TODAY = dt.date(2026, 11, 21)


def window(stat_fights, fights=5, **extra):
    rates = {"slpm": 4.5, "strAcc": .5, "sapm": 3.1, "strDef": .55, "td15": 1.2, "tdAcc": None, "tdDef": .7,
             "ctrlShare": .1, "sub15": 0.0, "kd15": .8}
    return {"fights": fights, "statFights": stat_fights, "W": 3, "L": 1, "D": 0, "NC": 1, "rates": rates,
            "koWinShare": .4, "subWinShare": 0.0, "finishRate": .6667, **extra}


def record(name, slug, stat_fights, **kw):
    return {"name": name, "slug": slug, "division": "Lightweight", "windows": {"last5": window(stat_fights, **kw)}}


def event(eid, date, bouts, promotion="UFC", sport="mma", **extra):
    return {"id": eid, "title": eid, "date": date, "promotion": promotion, "sport": sport, "bouts": bouts, **extra}


def bout(a, b, bid="b", **extra):
    return {"id": bid, "fighters": [a, b], "division": "Lightweight", **extra}


class Names(unittest.TestCase):
    def test_fold_matches_the_card_page_key(self):
        self.assertEqual(snap.fold("Jiří Procházka"), "jiriprochazka")
        self.assertEqual(snap.fold("Brandon Royval "), "brandonroyval")
        self.assertEqual(snap.fold("Su-hyeon O'Neil Jr."), "suhyeononeiljr")


class Events(unittest.TestCase):
    def test_only_unfinished_ufc_mma_cards_are_kept(self):
        cards = {"events": [
            event("ufc-new", "2026-12-05", [bout("A B", "C D")]),
            event("ufc-two-days-ago", "2026-11-19", [bout("A B", "C D")]),
            event("ufc-old", "2026-11-18", [bout("A B", "C D")]),
            event("ufc-done", "2026-12-06", [bout("A B", "C D")], status="completed"),
            event("pfl", "2026-12-05", [bout("A B", "C D")], promotion="PFL"),
            event("boxing", "2026-12-05", [bout("A B", "C D")], sport="boxing"),
            event("ufc-no-bouts", "2026-12-05", []),
            event("ufc-bad-bouts", "2026-12-05", [{"id": "x", "fighters": ["Only One"]}, {"id": "y", "fighters": ["A B", ""]}]),
            "not a dict", None,
        ]}
        self.assertEqual([e["id"] for e in snap.announced_ufc_events(cards, TODAY)], ["ufc-two-days-ago", "ufc-new"])

    def test_cancelled_bouts_are_dropped(self):
        cards = {"events": [event("e", "2026-12-05", [bout("A B", "C D", "1"), bout("E F", "G H", "2", status="cancelled")])]}
        self.assertEqual([b["id"] for b in snap.announced_ufc_events(cards, TODAY)[0]["bouts"]], ["1"])


class Fighters(unittest.TestCase):
    def test_full_limited_and_none_coverage(self):
        self.assertEqual(snap.fighter_entry("A B", record("A B", "a-b", 5))["coverage"], "full")
        self.assertEqual(snap.fighter_entry("A B", record("A B", "a-b", 3))["coverage"], "full")
        self.assertEqual(snap.fighter_entry("A B", record("A B", "a-b", 2))["coverage"], "limited")
        self.assertEqual(snap.fighter_entry("A B", record("A B", "a-b", 1))["coverage"], "limited")
        self.assertEqual(snap.fighter_entry("A B", record("A B", "a-b", 0))["coverage"], "none")
        self.assertEqual(snap.fighter_entry("A B", None)["coverage"], "none")
        self.assertEqual(snap.fighter_entry("A B", {"name": "A B", "slug": "a-b"})["coverage"], "none")

    def test_missing_stays_null_and_zero_stays_zero(self):
        t = snap.fighter_entry("A B", record("A B", "a-b", 5))["tiles"]
        self.assertIsNone(t["tdAcc"], "unmeasured takedown accuracy is null, never 0")
        self.assertEqual(t["sub15"], 0.0, "a measured zero is kept")
        self.assertEqual(t["slpm"], 4.5)

    def test_no_stat_fights_gives_no_rates_but_keeps_result_based_shares(self):
        entry = snap.fighter_entry("A B", record("A B", "a-b", 0))
        self.assertTrue(all(entry["tiles"][k] is None for k in snap.RATE_TILES))
        self.assertEqual(entry["tiles"]["koWinsPerFight"], .4)
        self.assertEqual(entry["fights"], 5)

    def test_unknown_fighter_has_every_tile_null(self):
        entry = snap.fighter_entry("New Guy", None)
        self.assertEqual(entry["name"], "New Guy")
        self.assertTrue(all(v is None for v in entry["tiles"].values()))
        self.assertIsNone(entry["record"])
        self.assertEqual(set(entry["tiles"]), set(snap.RATE_TILES) | set(snap.WINDOW_TILES))

    def test_non_numbers_are_not_passed_through(self):
        r = record("A B", "a-b", 5)
        r["windows"]["last5"]["rates"]["slpm"] = "8.1"
        r["windows"]["last5"]["rates"]["sapm"] = True
        t = snap.fighter_entry("A B", r)["tiles"]
        self.assertIsNone(t["slpm"])
        self.assertIsNone(t["sapm"])

    def test_record_counts(self):
        self.assertEqual(snap.fighter_entry("A B", record("A B", "a-b", 5))["record"], {"W": 3, "L": 1, "D": 0, "NC": 1})

    def test_clear_names_for_misleading_saved_fields(self):
        t = snap.fighter_entry("A B", record("A B", "a-b", 5))["tiles"]
        self.assertEqual((t["koWinsPerFight"], t["finishShareOfWins"]), (.4, .6667))


class Build(unittest.TestCase):
    files = {"a-b": record("Aa Bb", "a-b", 5), "c-d": record("Cc Dd", "c-d", 2)}

    def run_build(self, cards):
        names = {"aabb": "a-b", "ccdd": "c-d", "ghost": "ghost-missing"}
        return snap.build(cards, names, self.files.get, TODAY, "2026-11-14")

    def test_every_fighter_on_a_card_gets_an_entry_once(self):
        cards = {"events": [event("e1", "2026-12-05", [bout("Aa Bb", "Cc Dd", "1"), bout("Aa Bb", "New Guy", "2")])]}
        out = self.run_build(cards)
        self.assertEqual(set(out["fighters"]), {"aabb", "ccdd", "newguy"})
        self.assertEqual(out["coverage"], {"fighters": 3, "full": 1, "limited": 1, "none": 1})
        self.assertEqual([b["fighters"] for b in out["events"][0]["bouts"]], [["aabb", "ccdd"], ["aabb", "newguy"]])
        self.assertEqual(out["events"][0]["bouts"][0]["division"], "Lightweight")

    def test_name_known_but_file_missing_is_none_not_a_crash(self):
        out = self.run_build({"events": [event("e1", "2026-12-05", [bout("Ghost", "Aa Bb")])]})
        self.assertEqual(out["fighters"]["ghost"]["coverage"], "none")

    def test_empty_cards(self):
        out = self.run_build({"events": []})
        self.assertEqual((out["events"], out["fighters"], out["coverage"]["fighters"]), ([], {}, 0))
        self.assertEqual(snap.build({}, {}, lambda s: None, TODAY)["events"], [])

    def test_output_is_deterministic_and_has_no_timestamps(self):
        cards = {"events": [event("e2", "2026-12-12", [bout("Cc Dd", "Aa Bb")]), event("e1", "2026-12-05", [bout("Aa Bb", "Cc Dd")])]}
        a, b = json.dumps(self.run_build(cards), sort_keys=True), json.dumps(self.run_build(cards), sort_keys=True)
        self.assertEqual(a, b)
        self.assertEqual([e["id"] for e in self.run_build(cards)["events"]], ["e1", "e2"])
        self.assertNotIn("builtAt", a)
        self.assertEqual(self.run_build(cards)["statsAsOf"], "2026-11-14")


class RealData(unittest.TestCase):
    """The committed data files still produce a sane snapshot (skipped when they are absent)."""

    def test_current_data(self):
        cards = ROOT / "data/upcoming-cards.json"
        names = ROOT / "data/ufc-stats/names.json"
        if not cards.exists() or not names.exists():
            self.skipTest("data files not present")

        def load(slug):
            p = ROOT / "data/ufc-stats/fighters" / f"{slug}.json"
            return json.loads(p.read_text()) if p.exists() else None

        out = snap.build(json.loads(cards.read_text()), json.loads(names.read_text())["names"], load, TODAY)
        self.assertEqual(out["coverage"]["fighters"], len(out["fighters"]))
        for f in out["fighters"].values():
            self.assertIn(f["coverage"], ("full", "limited", "none"))
            if f["coverage"] == "none":
                self.assertTrue(all(v is None for k, v in f["tiles"].items() if k in snap.RATE_TILES))
            for key, value in f["tiles"].items():
                self.assertTrue(value is None or isinstance(value, (int, float)), key)
        for e in out["events"]:
            for b in e["bouts"]:
                self.assertTrue(all(k in out["fighters"] for k in b["fighters"]))


if __name__ == "__main__":
    unittest.main()
