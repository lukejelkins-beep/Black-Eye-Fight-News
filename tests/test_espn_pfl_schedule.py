"""Tests for scripts/espn_pfl_schedule.py on a saved ESPN PFL scoreboard (25 Nov 2026). Offline."""
import copy
import json
import pathlib
import sys
import unittest
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import espn_pfl_schedule as pfl  # noqa: E402

BOARD = json.loads((ROOT / "tests/fixtures/espn/pfl-scoreboard-20261125-20270131.json").read_text(encoding="utf-8"))
NOW = "2026-11-25T10:00:00+00:00"


class Build(unittest.TestCase):
    def setUp(self):
        self.events = pfl.build_events(BOARD, NOW)
        self.lyon = self.events[0]

    def test_lyon_card_with_venue_local_day_and_exact_start(self):
        self.assertEqual(len(self.events), 1)
        e = self.lyon
        self.assertEqual(e["title"], "PFL Lyon: Lapilus vs. McKee")
        self.assertEqual((e["date"], e["startAt"]), ("2026-12-19", "2026-12-19T16:00:00Z"))
        self.assertEqual(e["location"], "LDLC Arena, Lyon, France")
        self.assertEqual((e["sport"], e["promotion"]), ("mma", "PFL"))
        self.assertEqual(e["id"], "pfl-lyon-2026-12-19")

    def test_main_event_is_the_title_pairing_and_first(self):
        first = self.lyon["bouts"][0]
        self.assertEqual(first["section"], "main")
        self.assertEqual({n.split()[-1] for n in first["fighters"]}, {"Lapilus", "McKee"})
        self.assertTrue(all(b["section"] == "announced" for b in self.lyon["bouts"][1:]), "no other order is claimed")
        self.assertEqual(sum(b["section"] == "main" for b in self.lyon["bouts"]), 1)

    def test_every_scheduled_bout_with_two_names(self):
        self.assertEqual(len(self.lyon["bouts"]), 14)
        names = [n for b in self.lyon["bouts"] for n in b["fighters"]]
        self.assertEqual(len(names), len(set(names)), "no fighter twice on a card")

    def test_weight_class_kept_or_left_out_never_guessed(self):
        chipito = next(b for b in self.lyon["bouts"] if "Shelda Chipito" in b["fighters"])
        self.assertEqual(chipito["division"], "Women's Strawweight")
        self.assertTrue(any("division" not in b for b in self.lyon["bouts"]), "ESPN gives no class for some bouts")

    def test_completed_card_and_missing_venue_are_skipped(self):
        board = copy.deepcopy(BOARD)
        board["events"][0]["status"] = {"type": {"completed": True}}
        self.assertEqual(pfl.build_events(board, NOW), [])
        board = copy.deepcopy(BOARD)
        board["events"][0]["competitions"][0]["venue"] = {}
        self.assertEqual(pfl.build_events(board, NOW), [])

    def test_empty_or_odd_response_gives_nothing(self):
        self.assertEqual(pfl.build_events({}, NOW), [])
        self.assertEqual(pfl.build_events({"events": [{"name": "x"}]}, NOW), [])


class Wording(unittest.TestCase):
    def test_notes_never_imply_a_title_fight(self):
        # assets/upcoming-cards.js tags a bout "Title fight" when its note says title/championship.
        import re
        for e in pfl.build_events(BOARD, NOW):
            for b in e["bouts"]:
                self.assertFalse(re.search(r"title|championship", b["note"], re.I), b["note"])


class Merge(unittest.TestCase):
    def test_existing_pfl_card_that_day_is_never_touched(self):
        new = pfl.build_events(BOARD, NOW)
        hand = {"id": "pfl-lyon-hand", "date": "2026-12-19", "promotion": "PFL Europe", "source": "https://pflmma.com/event/pfl-lyon-2026", "bouts": []}
        events = [hand]
        self.assertEqual(pfl.merge_new(events, new), [])
        self.assertEqual(events, [hand])

    def test_added_once(self):
        new = pfl.build_events(BOARD, NOW)
        events = []
        self.assertEqual(len(pfl.merge_new(events, new)), 1)
        self.assertEqual(len(pfl.merge_new(events, pfl.build_events(BOARD, NOW))), 0)

    def test_url_covers_the_next_120_days(self):
        self.assertEqual(pfl.scoreboard_url(datetime(2026, 11, 25, tzinfo=timezone.utc)),
                         "https://site.api.espn.com/apis/site/v2/sports/mma/pfl/scoreboard?dates=20261125-20270325")


if __name__ == "__main__":
    unittest.main()
