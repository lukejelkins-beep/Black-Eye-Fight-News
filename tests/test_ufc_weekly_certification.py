"""Weekly certification roll-forward (owner standing rule, 24 Nov 2026): both sources must agree, nothing guessed."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("weekly", ROOT / "scripts" / "ufc-weekly-certification.py")
W = importlib.util.module_from_spec(spec)
spec.loader.exec_module(W)
B = W._builder()


class FakeWiki:
    def __init__(self, ok=True, result=None):
        self.ok, self.result = ok, result

    def confirm(self, fighter, opponent, day, result):
        if not self.ok:
            return None, "no Wikipedia article lists it"
        return {"url": "https://en.wikipedia.org/wiki/UFC_999", "event": "UFC 999"}, None


BASE = {"base": "ufc-36-month-roster", "baseThrough": "2026-11-14", "baseCount": 5, "statsSlug": "x"}
FILE = {"name": "Test Fighter", "fights": [
    {"date": "2026-11-21", "opponent": "New Opponent", "outcome": "W", "event": "UFC Fight Night"},
    {"date": "2026-10-01", "opponent": "Old Opponent", "outcome": "L", "event": "UFC 300"}]}
ROW = {"date": "2026-11-21", "opponent": "New Opponent", "result": "win", "method": "KO/TKO",
       "fightUrl": "https://ufcstats.com/fight-details/aaaaaaaaaaaaaaaa"}


def roll(file=FILE, rows=(ROW,), wiki=None, current=None, cutoff="2026-11-21"):
    return W.roll_forward("x", BASE, current, file, list(rows), wiki or FakeWiki(), B, cutoff, "2026-11-24")


class RollForward(unittest.TestCase):
    def test_a_new_fight_both_sources_agree_on_moves_the_cutoff(self):
        entry, why = roll()
        self.assertIsNone(why)
        self.assertEqual((entry["through"], entry["baseCount"], len(entry["added"])), ("2026-11-21", 5, 1))
        bout = entry["added"][0]
        self.assertEqual((bout["result"], bout["fightUrl"], bout["secondSource"]),
                         ("win", ROW["fightUrl"], "wikipedia-event-article"))

    def test_without_wikipedia_nothing_moves(self):
        entry, why = roll(wiki=FakeWiki(ok=False))
        self.assertIsNone(entry)
        self.assertIn("Wikipedia", why)

    def test_a_fight_ufcstats_does_not_list_yet_waits(self):
        entry, why = roll(rows=())
        self.assertIsNone(entry)
        self.assertIn("UFCStats does not list", why)

    def test_a_different_result_is_refused(self):
        entry, why = roll(rows=({**ROW, "result": "loss"},))
        self.assertIsNone(entry)

    def test_a_ufcstats_bout_the_profile_lacks_blocks(self):
        extra = {**ROW, "date": "2026-11-18", "opponent": "Someone Else", "fightUrl": ROW["fightUrl"][:-1] + "b"}
        entry, why = roll(rows=(ROW, extra))
        self.assertIsNone(entry)
        self.assertIn("lacks", why)

    def test_no_new_fight_or_already_current_is_a_no_op(self):
        self.assertEqual(roll(file={"name": "T", "fights": FILE["fights"][1:]}), (None, None))
        self.assertEqual(roll(current={"through": "2026-11-21", "added": []}), (None, None))

    def test_earlier_added_bouts_are_kept(self):
        prev = {"through": "2026-11-18", "added": [{"date": "2026-11-16"}]}
        entry, _ = roll(current=prev)
        self.assertEqual(len(entry["added"]), 2)

    def test_feeder_fights_are_never_rolled_in(self):
        f = {"name": "T", "fights": [{**FILE["fights"][0], "event": "Dana White's Contender Series"}]}
        self.assertEqual(roll(file=f), (None, None))


if __name__ == "__main__":
    unittest.main()
