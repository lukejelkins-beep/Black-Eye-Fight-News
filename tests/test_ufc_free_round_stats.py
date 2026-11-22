"""Tests for scripts/build-ufc-free-round-stats.py (free per-round statistics)."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("frs", ROOT / "scripts/build-ufc-free-round-stats.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

EVENTS = """EVENT,URL,DATE,LOCATION
UFC 500: Alpha vs Bravo,http://ufcstats.com/event-details/a,"November 21, 2026","Doha, Qatar"
UFC 499: Old vs Card,http://ufcstats.com/event-details/b,"October 10, 2026","Las Vegas, USA"
"""

HEADER = ("EVENT,BOUT,ROUND,FIGHTER,KD,SIG.STR.,SIG.STR. %,TOTAL STR.,TD,TD %,SUB.ATT,REV.,CTRL,"
          "HEAD,BODY,LEG,DISTANCE,CLINCH,GROUND\n")


def row(fighter, rnd="Round 1", event="UFC 500: Alpha vs Bravo", bout="Alpha One vs. Bravo Two",
        sig="10 of 20", total="12 of 25", head="6 of 12", body="3 of 5", leg="1 of 3",
        distance="8 of 16", clinch="1 of 2", ground="1 of 2", ctrl="1:44", kd="0", sub="1", rev="0", td="2 of 3"):
    return (f'{event},{bout},{rnd},{fighter},{kd},{sig},50%,{total},{td},66%,{sub},{rev},{ctrl},'
            f'{head},{body},{leg},{distance},{clinch},{ground}\n')


def both(**over):
    return row("Alpha One", **over) + row("Bravo Two", **over)


def build(stats, archive_fights=None, archive_date="2026-10-31"):
    held = archive_fights if archive_fights is not None else []
    with tempfile.TemporaryDirectory() as folder:
        path = pathlib.Path(folder, "archive.json")
        fights = {f"k{i}": f for i, f in enumerate(held)}
        fights.setdefault("anchor", {"promotion": "UFC", "date": archive_date,
                                     "fighterA": "Anchor One", "fighterB": "Anchor Two", "rounds": []})
        path.write_text(json.dumps({"fights": fights}))
        return m.build(get={"ufc_event_details": EVENTS, "ufc_fight_stats": HEADER + stats}.get, archive=path)


class FreeRoundStats(unittest.TestCase):
    def test_reads_the_counts_exactly(self):
        built = build(both())
        self.assertEqual(built["after"], "2026-10-31")
        fight = built["fights"]["2026-11-21|alphaone|bravotwo"]
        self.assertEqual((fight["fighterA"], fight["fighterB"]), ("Alpha One", "Bravo Two"))
        side = fight["rounds"][0]["a"]
        self.assertEqual((side["sigLanded"], side["sigAttempted"]), (10, 20))
        self.assertEqual((side["takedowns"], side["takedownAttempts"]), (2, 3))
        self.assertEqual(side["controlSec"], 104, "1:44 is 104 seconds")
        self.assertEqual((side["knockdowns"], side["subAttempts"], side["reversals"]), (0, 1, 0))
        self.assertEqual((side["headLanded"], side["bodyLanded"], side["legLanded"]), (6, 3, 1))

    def test_position_times_are_missing_not_zero(self):
        side = build(both())["fights"]["2026-11-21|alphaone|bravotwo"]["rounds"][0]["a"]
        self.assertNotIn("distanceTimeSec", side, "the export does not publish position times")
        self.assertIsNone(build(both(ctrl="--"))["fights"]["2026-11-21|alphaone|bravotwo"]["rounds"][0]["a"]["controlSec"])

    def test_the_archive_keeps_what_it_already_holds(self):
        held = [{"promotion": "UFC", "date": "2026-11-21", "fighterA": "Bravo Two", "fighterB": "Alpha One",
                 "rounds": []}]
        self.assertEqual(build(both(), archive_fights=held)["fights"], {}, "corner order does not matter")

    def test_nothing_before_the_archive_cutoff_is_read(self):
        old = both(event="UFC 499: Old vs Card", bout="Carla Three vs. Dana Four")
        built = build(old.replace("Alpha One", "Carla Three").replace("Bravo Two", "Dana Four"))
        self.assertEqual(built["fights"], {}, "October is the archive's own ground")

    def test_a_round_the_export_contradicts_is_dropped(self):
        self.assertEqual(build(both(head="9 of 12"))["fights"], {}, "head, body and leg must sum to the strikes")
        self.assertEqual(build(both(sig="30 of 20"))["fights"], {}, "landed cannot exceed attempted")
        self.assertEqual(build(both(distance="2 of 16"))["fights"], {}, "the positions must sum to the strikes too")

    def test_both_corners_and_whole_rounds_are_required(self):
        self.assertEqual(build(row("Alpha One"))["fights"], {}, "one corner alone is not a round")
        self.assertEqual(build(row("Alpha One", rnd="Round 2") + row("Bravo Two", rnd="Round 2"))["fights"], {},
                         "a card starting at round 2 is not a whole fight")
        self.assertEqual(build(both() + both(rnd="Round 2"))["fights"]["2026-11-21|alphaone|bravotwo"]["rounds"][1]["round"], 2)

    def test_a_name_in_neither_corner_voids_the_bout(self):
        self.assertEqual(build(both() + row("Someone Else"))["fights"], {})

    def test_output_is_deterministic(self):
        self.assertEqual(json.dumps(build(both()), sort_keys=True), json.dumps(build(both()), sort_keys=True))


if __name__ == "__main__":
    unittest.main()
