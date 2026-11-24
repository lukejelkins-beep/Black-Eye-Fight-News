"""Tests for scripts/one_schedule.py on saved onefc.com pages (25 Nov 2026). Offline."""
import importlib.util
import pathlib
import sys
import unittest
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import one_schedule as one  # noqa: E402

FIX = ROOT / "tests/fixtures/one"
EVENTS = (FIX / "events-2026-11-25.html").read_text(encoding="utf-8")
FF180 = (FIX / "one-friday-fights-180-2026-11-25.html").read_text(encoding="utf-8")
SAMURAI6 = (FIX / "one-samurai-6-2026-11-25.html").read_text(encoding="utf-8")
NOW = "2026-11-25T09:00:00+00:00"


class Upcoming(unittest.TestCase):
    def test_lists_next_cards_with_exact_start_and_venue(self):
        cards = one.parse_upcoming(EVENTS)
        self.assertEqual([c["url"] for c in cards], [
            "https://www.onefc.com/events/one-friday-fights-180/",
            "https://www.onefc.com/events/one-samurai-6/"])
        self.assertEqual(cards[0]["title"], "ONE Friday Fights 180 & The Inner Circle 40")
        self.assertEqual(cards[0]["start"], datetime(2026, 11, 27, 11, 30, tzinfo=timezone.utc))
        self.assertEqual(cards[0]["venue"], "Lumpinee Stadium, Bangkok")

    def test_layout_change_fails_loudly_not_silently(self):
        with self.assertRaises(ValueError):
            one.parse_upcoming("<html><body>redesigned</body></html>")


class Matchups(unittest.TestCase):
    def test_reads_every_matchup_with_both_names(self):
        m = one.parse_matchups(FF180)
        self.assertEqual(len(m), 14)
        self.assertEqual(m[4], {"title": "Flyweight MMA", "fighters": ["Alistair Fitzharris", "Bhupen Mutum"]})


class Build(unittest.TestCase):
    def test_only_mma_bouts_kept_and_others_counted(self):
        card = one.parse_upcoming(EVENTS)[0]
        e = one.build_event(card, one.parse_matchups(FF180), NOW)
        self.assertEqual([b["fighters"] for b in e["bouts"]],
                         [["Alistair Fitzharris", "Bhupen Mutum"], ["Arti Khatri", "Norika Ryu"]])
        self.assertTrue(all(b["section"] == "announced" for b in e["bouts"]), "order is never claimed")
        self.assertIn("12 Muay Thai/kickboxing pairings omitted", e["note"])
        self.assertEqual(e["promotion"], "ONE Championship")
        self.assertEqual(e["sport"], "mma")

    def test_venue_local_date_and_exact_start(self):
        card = one.parse_upcoming(EVENTS)[0]   # 27 Nov 11:30 UTC = 18:30 in Bangkok
        e = one.build_event(card, one.parse_matchups(FF180), NOW)
        self.assertEqual(e["date"], "2026-11-27")
        self.assertEqual(e["startAt"], "2026-11-27T11:30:00Z")
        self.assertEqual(e["location"], "Lumpinee Stadium, Bangkok, Thailand")
        self.assertEqual(e["id"], "one-friday-fights-180-2026-11-27")

    def test_japan_card_and_world_title_note(self):
        card = one.parse_upcoming(EVENTS)[1]
        e = one.build_event(card, one.parse_matchups(SAMURAI6), NOW)
        self.assertEqual(e["location"], "Yokohama Buntai, Yokohama, Japan")
        first = e["bouts"][0]
        self.assertEqual(first["fighters"], ["Chihiro Sawada", "Anastasia Nikolakakos"])
        self.assertEqual(first["division"], "Atomweight MMA")
        self.assertTrue(first["note"].startswith("ONE World Championship"))
        self.assertEqual(len(e["bouts"]), 3)

    def test_card_without_mma_is_not_added(self):
        card = one.parse_upcoming(EVENTS)[0]
        only_muay_thai = [{"title": "Flyweight Muay Thai", "fighters": ["A B", "C D"]}]
        self.assertIsNone(one.build_event(card, only_muay_thai, NOW))

    def test_unknown_venue_falls_back_to_utc_day(self):
        day, country = one.venue_day(datetime(2026, 12, 1, 23, 0, tzinfo=timezone.utc), "Some Arena, Denver")
        self.assertEqual((day, country), ("2026-12-01", None))


class Merge(unittest.TestCase):
    def test_existing_and_hand_edited_events_are_never_touched(self):
        card = one.parse_upcoming(EVENTS)[0]
        e = one.build_event(card, one.parse_matchups(FF180), NOW)
        hand = {"id": "hand-ff180", "source": card["url"], "bouts": [], "note": "editor's note"}
        events = [hand]
        self.assertEqual(one.merge_new(events, [e]), [])
        self.assertEqual(events, [hand])

    def test_new_event_is_appended_once(self):
        cards = one.parse_upcoming(EVENTS)
        e = one.build_event(cards[1], one.parse_matchups(SAMURAI6), NOW)
        events = []
        self.assertEqual(len(one.merge_new(events, [e])), 1)
        self.assertEqual(len(one.merge_new(events, [e])), 0)

    def test_no_fighter_appears_twice_on_a_card(self):
        for card, page in zip(one.parse_upcoming(EVENTS), (FF180, SAMURAI6)):
            e = one.build_event(card, one.parse_matchups(page), NOW)
            names = [n for b in e["bouts"] for n in b["fighters"]]
            self.assertEqual(len(names), len(set(names)))


if __name__ == "__main__":
    unittest.main()
