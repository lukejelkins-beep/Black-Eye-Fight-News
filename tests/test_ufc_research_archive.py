import datetime as dt
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

FILE=Path(__file__).resolve().parents[1]/"scripts/refresh-ufc-research-archive.py"
spec=importlib.util.spec_from_file_location("ufc_archive",FILE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class ArchiveTests(unittest.TestCase):
    def test_stable_identity(self):
        self.assertEqual(m.key_for("2026-11-08","Renato Moicano","Tom Nolan"),
                         m.key_for("2026-11-08","Tom Nolan","Renato Moicano"))
        self.assertIsNone(m.key_for("2026-11-08","Tom Nolan","Tom Nolan"))

    def test_stat_parsing_preserves_missing(self):
        self.assertEqual(m.landed_attempted("23 of 41"),(23,41))
        self.assertEqual(m.landed_attempted("23 of 11"),(None,None))
        self.assertEqual(m.to_seconds("2:43"),163)
        rows=m.normalize_round([{"round":2,"a":{"significantStrikes":"23 of 41","controlTime":"2:43"},
                                 "b":{"significantStrikes":"10 of 29"}}],"cito")
        self.assertEqual(rows[0]["a"]["sigAttempted"],41)
        self.assertEqual(rows[0]["a"]["controlSec"],163)
        self.assertNotIn("controlSec",rows[0]["b"])

    def test_conflicts_retain_source_values(self):
        archive={"fights":{}}
        a={"round":1,"a":{"sigLanded":7},"b":{"sigLanded":10}}
        b={"round":1,"a":{"sigLanded":9},"b":{"sigLanded":10}}
        self.assertTrue(m.put(archive,"2026-11-08","A Fighter","B Fighter","Example","ufcalendar","99",[a],"now"))
        self.assertTrue(m.put(archive,"2026-11-08","A Fighter","B Fighter","Example","cito","abc",[b],"later"))
        saved=next(iter(archive["fights"].values()))
        self.assertEqual(saved["rounds"][0]["a"]["sigLanded"],9)
        self.assertEqual(saved["sources"]["ufcalendar"]["rounds"][0]["a"]["sigLanded"],7)
        self.assertEqual(saved["conflicts"][0]["metric"],"sigLanded")

    def test_batch_cito_rounds_identity_is_verified(self):
        archive={"fights":{}}
        bouts=[{"id":"fight-1","red":{"name":"Fighter Red"},"blue":{"name":"Fighter Blue"}}]
        stats={"roundStats":[
            {"boutId":"fight-1","round":1,"corner":"red","significantStrikes":"10 of 15","knockdowns":1},
            {"boutId":"fight-1","round":1,"corner":"blue","significantStrikes":"8 of 20","controlTime":"0:52"},
            {"boutId":"unknown","round":1,"corner":"blue","significantStrikes":"100 of 100"}]}
        added=m.parse_cito(archive,stats,bouts,"2026-11-08","UFC Example","now")
        self.assertEqual(added,1)
        fight=next(iter(archive["fights"].values()))
        self.assertEqual(fight["rounds"][0]["a"]["sigLanded"],10)
        self.assertEqual(fight["rounds"][0]["b"]["controlSec"],52)

    def test_no_quota_overspend_and_no_rechecks(self):
        today=dt.date(2026,11,11)
        ledger={"requests":["2026-10-01"]+["2026-11-01"]*m.ROLLING_BUDGET}
        client=m.CitoClient("fake",ledger,today,lambda path:self.fail("Quota exceeded"))
        self.assertIsNone(client.get("/ufc/events/recent"))
        self.assertEqual(client.calls,0)
        self.assertEqual(len(ledger["requests"]),m.ROLLING_BUDGET)

    def test_imported_evidence_survives_after_30_days(self):
        with tempfile.TemporaryDirectory() as folder:
            tmp=Path(folder)
            sample={"fights":{"830":{"date":"2026-10-03","org":"ufc",
                "fighterA":{"name":"Example A"},"fighterB":{"name":"Example B"},
                "event":"UFC Example","rounds":[{"round":1,
                    "a":{"sigLanded":13,"controlSec":90},
                    "b":{"sigLanded":8,"controlSec":None}}]}}}
            with patch.object(m,"CALENDAR",tmp/"cal.json"),patch.object(m,"ARCHIVE",tmp/"archive.json"),patch.object(m,"LEDGER",tmp/"ledger.json"):
                m.write(m.CALENDAR,sample)
                first,ledger=m.run(dt.date(2026,11,11),collect=False)
                self.assertEqual(len(first["fights"]),1)
                m.write(m.CALENDAR,{"fights":{}})
                second,ledger=m.run(dt.date(2027,1,1),collect=False)
                self.assertEqual(len(second["fights"]),1)
                self.assertEqual(next(iter(second["fights"].values()))["rounds"][0]["a"]["controlSec"],90)
                self.assertNotIn("controlSec",next(iter(second["fights"].values()))["rounds"][0]["b"])

if __name__=="__main__":
    unittest.main()
