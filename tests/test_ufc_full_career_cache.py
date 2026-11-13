import datetime as dt
import importlib.util
import unittest
from pathlib import Path

SOURCE=Path(__file__).resolve().parents[1]/"scripts/ufcalendar-rich-backfill.py"
spec=importlib.util.spec_from_file_location("ufc_career_archive",SOURCE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Fake:
    max_calls=500
    remaining=100
    stopped=False
    calls=0
    def __init__(self,title="UFC 99: Legacy Event"):
        self.title=title
        self.paths=[]
    def call(self,path):
        self.calls+=1
        self.paths.append(path)
        return {"data":{"id":800,"status":"completed",
                        "fighter_a":{"id":1,"slug":"veteran","name":"Veteran"},
                        "fighter_b":{"id":2,"slug":"opponent","name":"Opponent"},
                        "result":{"winner_fighter_id":1,"round":3,"method":"decision","time":"5:00"},
                        "event":{"id":500,"org":"ufc","title":self.title,
                                 "starts_at":"2008-05-01T00:00:00Z"}}}

class FullCareerCacheTests(unittest.TestCase):
    def fixture(self):
        state=m.default_progress()
        research={"profiles":{"veteran":{"recentHistory":[
          {"promotion":"ufc","source":"native","boutId":"800",
           "date":"2008-05-01","result":"win","opponent":"Opponent"}]}}}
        candidate={"schema":1,"scope":"ufc","activityMonths":36,
                   "asOf":"2026-11-13",
                   "indexCompleteness":"36_month_event_scan_complete",
                   "fighters":[{"slug":"veteran","eligibilityStatus":"latest_observed_mma_ufc"}]}
        return state,research,candidate

    def test_cached_career_id_can_be_older_than_activity_window(self):
        state,research,candidate=self.fixture()
        client=Fake()
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13)),1)
        self.assertEqual(client.paths,["/fights/800"])
        self.assertEqual(state["bouts"]["800"]["eventDate"],"2008-05-01")
        self.assertEqual(state["bouts"]["800"]["org"],"ufc")
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13)),0)
        self.assertEqual(len(client.paths),1,"Never re-request an indexed career fight")

    def test_unverified_scope_cannot_trigger_paid_career_hydration(self):
        state,research,candidate=self.fixture()
        candidate["indexCompleteness"]="36_month_event_scan_incomplete"
        client=Fake()
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13)),0)
        self.assertEqual(client.paths,[])

    def test_feeder_bouts_are_not_cached_as_official_ufc_fights(self):
        state,research,candidate=self.fixture()
        client=Fake("Dana White's Contender Series 99")
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13)),0)
        self.assertNotIn("800",state["bouts"])
        self.assertEqual(state["ufcCareerBoutChecks"]["800"]["status"],
                         "requires_manual_review")

if __name__=="__main__":
    unittest.main()
