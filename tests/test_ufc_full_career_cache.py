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

    def approval(self,slugs=None):
        return {"schema":1,"scope":"ufc-36-month-roster","status":"approved",
                "approvedBy":"user","rosterAsOf":"2026-11-13",
                "approvedAt":"2026-11-13",
                "approvedFighters":slugs if slugs is not None else ["veteran"]}

    def test_no_signoff_no_full_career_calls(self):
        state,research,candidate=self.fixture()
        client=Fake()
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13)),0)
        self.assertEqual(client.paths,[])
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),
          {"status":"pending_review"}),0)
        self.assertEqual(client.paths,[])

    def test_signed_off_cohort_is_strict_allowlist(self):
        state,research,candidate=self.fixture()
        client=Fake()
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),
          self.approval(["someone-else"])),0)
        self.assertEqual(client.paths,[])
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),
          {**self.approval(),"approvedAt":"2026-11-14"}),0)
        self.assertEqual(client.paths,[])

    def test_cached_career_id_can_be_older_than_activity_window(self):
        state,research,candidate=self.fixture()
        client=Fake()
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),self.approval()),1)
        self.assertEqual(client.paths,["/fights/800"])
        self.assertEqual(state["bouts"]["800"]["eventDate"],"2008-05-01")
        self.assertEqual(state["bouts"]["800"]["org"],"ufc")
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),self.approval()),0)
        self.assertEqual(len(client.paths),1,"Never re-request an indexed career fight")

    def test_melbourne_snapshot_date_can_activate_before_utc_midnight(self):
        state,research,candidate=self.fixture()
        candidate["asOf"]="2026-11-14"
        manifest={**self.approval(),"rosterAsOf":"2026-11-14",
                  "approvedAt":"2026-11-14"}
        early=Fake()
        self.assertEqual(m.collect_ufc_career_bouts(
          early,state,research,candidate,dt.date(2026,11,13),manifest),0)
        self.assertEqual(early.paths,[])
        client=Fake()
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,14),manifest),1)
        self.assertEqual(client.paths,["/fights/800"])

    def test_mismatched_provider_fight_id_is_never_indexed(self):
        state,research,candidate=self.fixture()
        research["profiles"]["veteran"]["recentHistory"][0]["boutId"]="999"
        client=Fake()
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),self.approval()),0)
        self.assertEqual(client.paths,["/fights/999"])
        self.assertNotIn("999",state["bouts"])
        self.assertEqual(state["ufcCareerBoutChecks"]["999"]["status"],
                         "requires_manual_review")
        before=len(client.paths)
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),self.approval()),0)
        self.assertEqual(len(client.paths),before,"Bad response must not be re-fetched")

    def test_approved_cohort_hydration_is_bounded_to_ninety_unique_ids(self):
        state,research,candidate=self.fixture()
        research["profiles"]["veteran"]["recentHistory"]=[
            {"promotion":"ufc","source":"native","boutId":str(i),
             "date":"2008-05-01","result":"win","opponent":"Opponent"}
            for i in range(800,900)]
        class Distinct(Fake):
            def call(self,path):
                payload=super().call(path)
                payload["data"]["id"]=int(path.rsplit("/",1)[-1])
                return payload
        client=Distinct()
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),self.approval()),90)
        self.assertEqual(len(client.paths),90)
        self.assertEqual(len(state["bouts"]),90)
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),self.approval()),10)
        self.assertEqual(len(client.paths),100)
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),self.approval()),0)
        self.assertEqual(len(client.paths),100,"Already indexed fights never refetched")

    def test_approved_round_priority_uses_latest_five_then_ten_then_career(self):
        state,research,candidate=self.fixture()
        today=dt.date(2026,11,14)
        candidate["asOf"]=today.isoformat()
        entries=[]
        for i in range(12):
            entries.append({
              "promotion":"ufc","source":"native",
              "boutId":str(1000+i),"date":(today-dt.timedelta(days=i*30)).isoformat(),
              "result":"win","opponent":"Opponent "+str(i)})
        research["profiles"]["veteran"]["recentHistory"]=entries
        approval={**self.approval(),"rosterAsOf":"2026-11-14",
                  "approvedAt":"2026-11-14"}
        levels=m.approved_ufc_round_priority(approval,candidate,research,today)
        self.assertEqual(len(levels),12)
        self.assertEqual([levels[str(1000+i)] for i in range(12)],
                         [6]*5+[5]*5+[3]*2)
        self.assertEqual(m.approved_ufc_round_priority(
          {**approval,"status":"pending_review"},candidate,research,today),{})
        candidate["fighters"][0]["eligibilityStatus"]="review_required"
        self.assertEqual(m.approved_ufc_round_priority(
          approval,candidate,research,today),{})
        candidate["fighters"][0]["eligibilityStatus"]="latest_observed_mma_ufc"
        candidate["asOf"]="2026-10-01"
        self.assertEqual(m.approved_ufc_round_priority(
          approval,candidate,research,today),{})

    def test_approved_history_rounds_win_priority_without_duplicate_fetches(self):
        today=dt.date(2026,11,14)
        state=m.default_progress()
        for ident,day in (("41","2010-01-01"),("42","2011-01-01"),
                          ("99","2026-11-12")):
            state["bouts"][ident]={
              "id":ident,"org":"ufc","eventDate":day,"event":"UFC Example",
              "eventId":"7","status":"completed",
              "a":{"name":"One"},"b":{"name":"Two"},
              "result":{"round":3}}
        calls=[]
        client=m.Client("secret",state,today,
          fetch=lambda p:(calls.append(p) or {"data":[]}),max_calls=80)
        client.remaining=100
        cards={"events":{}}
        archive={"schema":1,"fights":{},"events":{}}
        approved_priority={"41":6,"42":5}
        result=m.collect_rounds(client,state,cards,archive,archive,today,
                                approved_priority=approved_priority)
        self.assertEqual(result,{"requests":3,"retried":0})
        self.assertEqual(calls,[
          "/fights/41/rounds","/fights/42/rounds","/fights/99/rounds"])
        self.assertEqual(m.collect_rounds(
          client,state,cards,archive,archive,today,
          approved_priority=approved_priority),{"requests":0,"retried":0})
        self.assertEqual(len(calls),3)

    def test_two_approved_fighters_sharing_native_fight_are_single_round_target(self):
        today=dt.date(2026,11,14)
        state,research,candidate=self.fixture()
        candidate["asOf"]=today.isoformat()
        candidate["fighters"].append({
          "slug":"opponent","eligibilityStatus":"latest_observed_mma_ufc"})
        research["profiles"]["opponent"]={
          "recentHistory":[{"source":"native","promotion":"ufc",
          "boutId":"800","date":"2008-05-01","result":"loss",
          "opponent":"Veteran"}]}
        approval={**self.approval(["veteran","opponent"]),
                  "rosterAsOf":"2026-11-14","approvedAt":"2026-11-14"}
        priority=m.approved_ufc_round_priority(approval,candidate,research,today)
        self.assertEqual(priority,{"800":6})

    def test_unverified_scope_cannot_trigger_paid_career_hydration(self):
        state,research,candidate=self.fixture()
        candidate["indexCompleteness"]="36_month_event_scan_incomplete"
        client=Fake()
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),self.approval()),0)
        self.assertEqual(client.paths,[])

    def test_feeder_bouts_are_not_cached_as_official_ufc_fights(self):
        state,research,candidate=self.fixture()
        client=Fake("Dana White's Contender Series 99")
        self.assertEqual(m.collect_ufc_career_bouts(
          client,state,research,candidate,dt.date(2026,11,13),self.approval()),0)
        self.assertNotIn("800",state["bouts"])
        self.assertEqual(state["ufcCareerBoutChecks"]["800"]["status"],
                         "requires_manual_review")

if __name__=="__main__":
    unittest.main()
