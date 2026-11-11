import datetime as dt
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
SOURCE=Path(__file__).resolve().parents[1]/"scripts/crosscheck-ufc-stats-api.py"
spec=importlib.util.spec_from_file_location("ufc_stats_crosscheck",SOURCE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class CrosscheckTests(unittest.TestCase):
    def test_career_stats_not_assumed_when_fight_date_missing(self):
        self.assertIsNone(m.confirmed_date({"totals":{},"event_id":"abcde"}))
        self.assertEqual(m.confirmed_date({"date":"2026-10-31"}),"2026-10-31")

    def test_rounds_are_normalized(self):
        fixture={"rounds":[{"round":1,"fighter1":{"SIG. STR.":"17 of 32","TD":"1 of 4",
                                                  "CTRL":"1:12","KD":1},
                             "fighter2":{"SIG. STR.":"12 of 35"}}]}
        rounds=m.parse_rounds(fixture)
        self.assertEqual(rounds[0]["a"]["sigLanded"],17)
        self.assertEqual(rounds[0]["a"]["takedownAttempts"],4)
        self.assertEqual(rounds[0]["a"]["controlSec"],72)
        self.assertEqual(rounds[0]["b"]["sigAttempted"],35)

    def test_exact_fighter_date_required_before_merge(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            with patch.object(m.archive,"ARCHIVE",root/"archive.json"),patch.object(m.archive,"LEDGER",root/"ledger.json"):
                saved={"schema":1,"fights":{},"events":{}}
                m.archive.put(saved,"2026-10-31","Fighter A","Fighter B","UFC",
                              "cito","abc",[{"round":1,"a":{"sigLanded":11},"b":{"sigLanded":13}}],"now")
                row=next(iter(saved["fights"].values()))
                row["conflicts"]=[{"metric":"sigLanded"}]
                m.archive.write(m.archive.ARCHIVE,saved)
                calls=[]
                def fetch(route):
                    calls.append(route)
                    return {"data":[{"id":"fight123","date":"2026-11-07",
                        "totals":{"fighter1":{"fighter":"Fighter A"},"fighter2":{"fighter":"Fighter B"}},
                        "rounds":[{"round":1,"fighter1":{"SIG. STR.":"30 of 31"},
                                  "fighter2":{"SIG. STR.":"40 of 41"}}]}]}
                self.assertEqual(m.run(dt.date(2026,11,11),fetch),0)
                stored=m.archive.read(m.archive.ARCHIVE,{})
                self.assertNotIn("ufc-stats-api",next(iter(stored["fights"].values()))["sources"])
                self.assertEqual(m.run(dt.date(2026,11,11),lambda x:self.fail("Only weekly")),0)
                self.assertEqual(len(calls),1)

if __name__=="__main__":
    unittest.main()
