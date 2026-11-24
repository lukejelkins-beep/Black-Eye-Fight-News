"""Tests for scripts/ksw_schedule.py on saved pages from 25 Nov 2026. Offline.

The KSW 124 card built from Wikipedia + the official list is compared with the
hand-entered card in data/upcoming-cards.json (cross-checked by an editor on 9 Nov)."""
import copy
import json
import pathlib
import re
import sys
import unittest

ROOT = pathlib.Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import ksw_schedule as ksw  # noqa: E402

F = ROOT / "tests/fixtures/ksw"
OFFICIAL = ksw.parse_official((F / "kswmma-events-2026-11-25.html").read_text(encoding="utf-8"))
WIKI = ksw.parse_wikipedia((F / "wikipedia-2026-in-ksw-123-124-2026-11-25.wikitext").read_text(encoding="utf-8"), 2026)
NOW = "2026-11-25T10:00:00+00:00"
HAND_124 = {  # pairs, divisions and notes from the editor's 9 Nov entry
    ("Paweł Pawlak", "Piotr Kuberski"): ("Middleweight", "KSW championship · main event"),
    ("Patryk Kaczmarczyk", "Josef Štummer"): ("Featherweight", "KSW championship"),
    ("Štefan Vojčák", "Artur Szpilka"): ("Heavyweight", "Interim KSW championship"),
    ("Rafał Haratyk", "Andi Vrtačić"): ("Light Heavyweight", ""),
    ("Adam Soldaev", "Hugo Deux"): ("Lightweight", ""),
    ("Oleksii Polishchuk", "Souheil Kaouchen"): ("Featherweight", ""),
    ("Dawid Kuczmarski", "Adam Niedźwiedź"): ("Welterweight", ""),
    ("Kacper Sochacki", "Aleksander Winiarski"): ("Light Heavyweight", ""),
}


class Official(unittest.TestCase):
    def test_numbers_dates_and_main_event_surnames(self):
        self.assertEqual(OFFICIAL[124]["date"], "2026-12-19")
        self.assertEqual(OFFICIAL[124]["surnames"], {"pawlak", "kuberski"})
        self.assertEqual(OFFICIAL[125]["date"], "2027-01-23")
        self.assertEqual(OFFICIAL[125]["surnames"], {"lesko", "rozanski"}, "accents folded")
        self.assertEqual(OFFICIAL[125]["url"], "https://www.kswmma.com/en/event/ksw-125")

    def test_layout_change_fails_loudly(self):
        with self.assertRaises(ValueError):
            ksw.parse_official("<html><body>redesigned</body></html>")


class Wikipedia(unittest.TestCase):
    def test_ksw_124_card(self):
        w = WIKI[124]
        self.assertEqual((w["title"], w["date"]), ("XTB KSW 124: Pawlak vs. Kuberski", "2026-12-19"))
        self.assertEqual((w["venue"], w["city"]), ("Gliwice Arena", "Gliwice, Poland"))
        self.assertEqual(len(w["bouts"]), 9)
        self.assertEqual(w["bouts"][0]["fighters"], ["Paweł Pawlak", "Piotr Kuberski"])
        self.assertEqual(w["bouts"][0]["titles"], ("c", "ic"), "(c)/(ic) markers read, not kept in names")


class Build(unittest.TestCase):
    def setUp(self):
        self.events, self.skipped = ksw.build_events(OFFICIAL, WIKI, NOW, "2026-11-25")
        self.e124 = self.events[0]

    def test_matches_the_editors_hand_entry(self):
        got = {tuple(b["fighters"]): (b["division"], b["note"]) for b in self.e124["bouts"]}
        for pair, (division, note) in HAND_124.items():
            key = pair if pair in got else pair[::-1]
            self.assertIn(key, got, pair)
            self.assertEqual(got[key][1], note, pair)
            if pair != ("Rafał Haratyk", "Andi Vrtačić"):   # Wikipedia says Middleweight; the editor said Light Heavyweight
                self.assertEqual(got[key][0], division, pair)

    def test_event_fields_and_honest_note(self):
        e = self.e124
        self.assertEqual((e["id"], e["date"], e["promotion"], e["sport"]), ("ksw-124-2026-12-19", "2026-12-19", "KSW", "mma"))
        self.assertEqual(e["title"], "XTB KSW 124: Pawlak vs Kuberski")
        self.assertNotIn("startAt", e, "no start time is claimed: the list gives none")
        self.assertIn("not yet checked against KSW", e["note"])
        self.assertTrue(e["additionalSources"][0].startswith("https://en.wikipedia.org/wiki/2026_in_Konfrontacja_Sztuk_Walki#"))

    def test_past_and_missing_events_are_skipped_with_reasons(self):
        self.assertEqual([e["id"] for e in self.events], ["ksw-124-2026-12-19"], "KSW 123 is past")
        self.assertEqual(self.skipped, ["KSW 125: not on Wikipedia yet"])

    def test_disagreement_with_official_list_is_refused(self):
        off = copy.deepcopy(OFFICIAL)
        off[124]["surnames"] = {"someone", "else"}
        events, skipped = ksw.build_events(off, WIKI, NOW, "2026-11-25")
        self.assertEqual(events, [])
        self.assertIn("disagree", skipped[0])
        off = copy.deepcopy(OFFICIAL)
        off[124]["date"] = "2026-12-20"
        self.assertEqual(ksw.build_events(off, WIKI, NOW, "2026-11-25")[0], [])

    def test_only_the_main_event_and_real_titles_imply_title_fights(self):
        for b in self.e124["bouts"]:
            titled = bool(re.search(r"title|championship", b["note"], re.I))
            self.assertEqual(titled, b["fighters"][0] in ("Paweł Pawlak", "Patryk Kaczmarczyk", "Štefan Vojčák"), b)


class Merge(unittest.TestCase):
    def test_hand_entered_ksw_124_is_never_touched(self):
        new, _ = ksw.build_events(OFFICIAL, WIKI, NOW, "2026-11-25")
        data = json.loads((ROOT / "data/upcoming-cards.json").read_text(encoding="utf-8"))
        before = copy.deepcopy(data["events"])
        added = ksw.merge_new(data["events"], new)
        if any(e.get("id") == "ksw-124-2026-12-19" for e in before):
            self.assertEqual(added, [])
            self.assertEqual(data["events"], before)

    def test_added_once_when_missing(self):
        new, _ = ksw.build_events(OFFICIAL, WIKI, NOW, "2026-11-25")
        events = []
        self.assertEqual(len(ksw.merge_new(events, new)), 1)
        self.assertEqual(len(ksw.merge_new(events, ksw.build_events(OFFICIAL, WIKI, NOW, "2026-11-25")[0])), 0)


if __name__ == "__main__":
    unittest.main()
