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

    def test_career_hydration_prioritizes_five_and_ten_before_newer_old_career(self):
        state,research,candidate=self.fixture()
        candidate["fighters"].append({
          "slug":"active","eligibilityStatus":"latest_observed_mma_ufc"})
        research["profiles"]["active"]={"recentHistory":[
          {"promotion":"ufc","source":"native","boutId":str(1000+i),
           "date":(dt.date(2026,10,30)-dt.timedelta(days=i*22)).isoformat(),
           "result":"win","opponent":"Other "+str(i)}
           for i in range(12)]}
        # Veteran has one old UFC fight: critical for their recent-five view.
        # The 12th recent fight for active is much newer but less urgent.
        class Distinct(Fake):
            def call(self,path):
                payload=super().call(path)
                payload["data"]["id"]=int(path.rsplit("/",1)[-1])
                return payload
        client=Distinct()
        approved=self.approval(["veteran","active"])
        count=m.collect_ufc_career_bouts(
            client,state,research,candidate,dt.date(2026,11,13),approved)
        self.assertEqual(count,13)
        self.assertLess(client.paths.index("/fights/800"),
                        client.paths.index("/fights/1011"))
        self.assertLess(client.paths.index("/fights/1009"),
                        client.paths.index("/fights/1011"))
        self.assertEqual(len(client.paths),len(set(client.paths)))
        self.assertEqual(m.collect_ufc_career_bouts(
            client,state,research,candidate,dt.date(2026,11,13),approved),0)
        self.assertEqual(len(client.paths),13)

    def test_shared_native_fight_uses_one_lookup_and_benefits_both_profiles(self):
        state,research,candidate=self.fixture()
        candidate["fighters"].append({
          "slug":"opponent","eligibilityStatus":"latest_observed_mma_ufc"})
        research["profiles"]["opponent"]={"recentHistory":[
          {"promotion":"ufc","source":"native","boutId":"800",
           "date":"2008-05-01","result":"loss","opponent":"Veteran"}]}
        client=Fake()
        self.assertEqual(m.collect_ufc_career_bouts(
            client,state,research,candidate,dt.date(2026,11,13),
            self.approval(["veteran","opponent"])),1)
        self.assertEqual(client.paths,["/fights/800"])

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

    def test_ufc_verified_contender_series_bouts_are_not_retryable_ufc_fights(self):
        evidence=m.read(m.FEEDER_EVIDENCE,{})
        self.assertEqual(evidence["schema"],1)
        self.assertEqual(len(evidence["bouts"]),3)
        for row in evidence["bouts"]:
            saved={"boutId":row["boutId"],"date":row["date"],
                   "opponent":row["opponent"],"source":"native",
                   "promotion":"ufc","result":"loss"}
            self.assertTrue(m.confirmed_feeder_bout(
                saved,row["fighterSlug"],evidence))
            self.assertFalse(m.confirmed_feeder_bout(
                {**saved,"date":"2024-01-01"},row["fighterSlug"],evidence))
            self.assertFalse(m.confirmed_feeder_bout(
                {**saved,"opponent":"Wrong opponent"},row["fighterSlug"],evidence))
            state=m.default_progress()
            research={"profiles":{row["fighterSlug"]:{"recentHistory":[saved]}}}
            census={"schema":1,"scope":"ufc","activityMonths":36,
                    "asOf":"2026-11-14",
                    "indexCompleteness":"36_month_event_scan_complete",
                    "fighters":[{"slug":row["fighterSlug"],
                      "eligibilityStatus":"latest_observed_mma_ufc"}]}
            manifest={**self.approval([row["fighterSlug"]]),
                      "rosterAsOf":"2026-11-14","approvedAt":"2026-11-14"}
            client=Fake()
            self.assertEqual(m.collect_ufc_career_bouts(
                client,state,research,census,dt.date(2026,11,14),manifest),0)
            self.assertEqual(client.paths,[])
            self.assertEqual(m.approved_ufc_round_priority(
                manifest,census,research,dt.date(2026,11,14),state),{})
            self.assertEqual(len(research["profiles"][row["fighterSlug"]]["recentHistory"]),1)

    def test_cached_contender_series_event_prevents_repeating_false_ufc_lookup(self):
        state,research,candidate=self.fixture()
        # The provider's career history labels a DWCS bout as "ufc".
        # That must remain in the raw professional-MMA history but never
        # consume UFC-only backfill requests or UFC Recent Performance slots.
        state["bouts"]["801"]={
            "id":"801","org":"ufc","eventDate":"2008-05-01",
            "event":"Dana White's Contender Series 49",
            "a":{"name":"One"},"b":{"name":"Two"}}
        client=Fake()
        self.assertEqual(m.collect_ufc_career_bouts(
            client,state,research,candidate,dt.date(2026,11,13),self.approval()),0)
        self.assertEqual(client.paths,[])
        self.assertEqual(m.approved_ufc_round_priority(
            self.approval(),candidate,research,dt.date(2026,11,13),state),{})
        self.assertEqual(len(research["profiles"]["veteran"]["recentHistory"]),1)

    def test_official_ultimate_fighter_finale_retries_one_old_manual_id(self):
        state,research,candidate=self.fixture()
        state["bouts"]["801"]={
            "id":"801","org":"ufc","eventDate":"2008-05-01",
            "event":"The Ultimate Fighter: Team A vs Team B Finale",
            "a":{"name":"Another"},"b":{"name":"Contestant"}}
        state.setdefault("ufcCareerBoutChecks",{})["800"]={
            "status":"requires_manual_review","checkedAt":"2026-11-13",
            "retryAfter":"2026-11-27"}
        client=Fake("The Ultimate Fighter: Team A vs Team B Finale")
        self.assertEqual(m.collect_ufc_career_bouts(
            client,state,research,candidate,dt.date(2026,11,13),self.approval()),1)
        self.assertEqual(client.paths,["/fights/800"])
        self.assertEqual(state["bouts"]["800"]["org"],"ufc")
        self.assertNotIn("800",state["ufcCareerBoutChecks"])

    def test_invalid_finale_response_does_not_repeat_bypass_or_accept_feeder(self):
        state,research,candidate=self.fixture()
        state["bouts"]["801"]={
            "id":"801","org":"ufc","eventDate":"2008-05-01",
            "event":"The Ultimate Fighter: Team A vs Team B Finale",
            "a":{"name":"Another"},"b":{"name":"Contestant"}}
        state.setdefault("ufcCareerBoutChecks",{})["800"]={
            "status":"requires_manual_review","checkedAt":"2026-11-13",
            "retryAfter":"2026-11-27"}
        class Bad(Fake):
            def call(self,path):
                self.paths.append(path)
                self.calls+=1
                return {"data":{"id":800,"status":"completed",
                  "fighter_a":{"id":1,"slug":"veteran","name":"Veteran"},
                  "fighter_b":{"id":2,"slug":"opponent","name":"Opponent"},
                  "event":{"id":500,"org":"ufc",
                           "title":"Dana White's Contender Series 49",
                           "starts_at":"2008-05-01T00:00:00Z"}}}
        client=Bad()
        self.assertEqual(m.collect_ufc_career_bouts(
            client,state,research,candidate,dt.date(2026,11,13),self.approval()),0)
        self.assertNotIn("800",state["bouts"])
        self.assertTrue(state["ufcCareerBoutChecks"]["800"]["officialFinaleRetryAttempted"])
        self.assertEqual(m.collect_ufc_career_bouts(
            client,state,research,candidate,dt.date(2026,11,13),self.approval()),0)
        self.assertEqual(client.paths,["/fights/800"])

    def test_official_event_titles_do_not_treat_tuf_finale_as_feeder(self):
        self.assertTrue(m.official_ufc_event_title("UFC Fight Night: Example"))
        self.assertTrue(m.official_ufc_event_title(
            "The Ultimate Fighter: Team Joanna vs Team Claudia Finale"))
        self.assertTrue(m.official_ufc_event_title("TUF 28 Finale"))
        self.assertFalse(m.official_ufc_event_title(
            "Dana White's Contender Series 54"))
        self.assertFalse(m.official_ufc_event_title("Road to UFC 2024"))
        self.assertFalse(m.official_ufc_event_title("The Ultimate Fighter Season 28"))
        self.assertFalse(m.official_ufc_event_title("UFC 999 Road to UFC"))

    def test_full_career_numeric_id_check_recovers_old_ufc_bout_once(self):
        state,research,candidate=self.fixture()
        today=dt.date(2026,11,14)
        candidate["asOf"]=today.isoformat()
        candidate["fighters"][0]["lastUfcFight"]="2026-09-01"
        research["profiles"]["veteran"]["recentHistory"]=[
            {"promotion":"ufc","source":"native","boutId":"900",
             "date":"2026-09-01","result":"win","opponent":"Recent Rival"},
            {"promotion":"ufc","source":"native","boutId":"800",
             "date":"2008-05-01","result":"win","opponent":"Opponent"}]
        state["bouts"]["800"]={
            "id":"800","org":"ufc","event":"UFC Test","eventDate":"2008-05-01",
            "a":{"id":"10","slug":"veteran","name":"Veteran"},
            "b":{"id":"11","slug":"opponent","name":"Opponent"}}
        class Timeline:
            max_calls=500
            remaining=100
            stopped=False
            calls=0
            paths=[]
            def call(self,path):
                self.paths.append(path)
                self.calls+=1
                return {"meta":{"truncated":False},"data":[
                    {"source":"native","fight_id":900,"date":"2026-09-01",
                     "opponent_name":"Recent Rival","status":"win","org_slug":"ufc"},
                    {"source":"native","fight_id":800,"date":"2008-05-01",
                     "opponent_name":"Opponent","status":"win","org_slug":"ufc"},
                    {"source":"native","fight_id":123,"date":"2006-04-01",
                     "opponent_name":"Earlier Rival","status":"loss","org_slug":"ufc"}]}
        c=Timeline()
        a={**self.approval(),"rosterAsOf":today.isoformat(),
           "approvedAt":today.isoformat()}
        result=m.reconcile_approved_ufc_full_career_timelines(
            c,state,research,candidate,today,a)
        self.assertEqual(result,{"attempts":1,"added":1,"certified":1})
        self.assertEqual(c.paths,["/fighters/10/history"])
        self.assertEqual(len(research["profiles"]["veteran"]["recentHistory"]),3)
        self.assertTrue(research["profiles"]["veteran"]["ufcTimeline"]["complete"])
        self.assertEqual(m.reconcile_approved_ufc_full_career_timelines(
            c,state,research,candidate,today,a),
            {"attempts":0,"added":0,"certified":0})
        self.assertEqual(c.paths,["/fighters/10/history"])

    def test_full_career_provider_omitting_roster_latest_fight_cannot_certify(self):
        state,research,candidate=self.fixture()
        today=dt.date(2026,11,14)
        candidate["asOf"]=today.isoformat()
        candidate["fighters"][0]["lastUfcFight"]="2026-08-01"
        state["bouts"]["800"]={
            "id":"800","org":"ufc","event":"UFC Event",
            "a":{"id":"10","slug":"veteran"},"b":{"id":"11","slug":"opponent"}}
        class Contradictory:
            max_calls=500
            remaining=100
            stopped=False
            calls=0
            def call(self,path):
                self.calls+=1
                return {"meta":{"truncated":False},"data":[
                  {"source":"native","fight_id":800,"date":"2008-05-01",
                   "opponent_name":"Opponent","org_slug":"ufc","status":"win"}]}
        client=Contradictory()
        manifest={**self.approval(),"rosterAsOf":today.isoformat(),
                  "approvedAt":today.isoformat()}
        r=m.reconcile_approved_ufc_full_career_timelines(
            client,state,research,candidate,today,manifest)
        self.assertEqual(r,{"attempts":1,"added":0,"certified":0})
        self.assertFalse(research["profiles"]["veteran"]["ufcTimeline"]["complete"])
        self.assertEqual(research["profiles"]["veteran"]["ufcTimeline"]["missingRosterLastUfcFight"],
                         "2026-08-01")
        self.assertEqual(client.calls,1)

    def test_crosscheck_rejects_foreign_numeric_id_history_without_saved_fight_overlap(self):
        state,research,candidate=self.fixture()
        today=dt.date(2026,11,14)
        candidate["asOf"]=today.isoformat()
        state["bouts"]["800"]={
            "id":"800","org":"ufc","event":"UFC Official",
            "a":{"id":"10","slug":"veteran","name":"Veteran"},
            "b":{"id":"11","slug":"opponent","name":"Opponent"}}
        class Foreign:
            max_calls=500
            remaining=100
            stopped=False
            calls=0
            def call(self,path):
                self.calls+=1
                return {"meta":{"truncated":False},"data":[
                  {"source":"native","fight_id":999,"date":"2026-02-01",
                   "opponent_name":"Unrelated Fighter","org_slug":"ufc","status":"win"}]}
        client=Foreign()
        approval={**self.approval(),"rosterAsOf":today.isoformat(),
                  "approvedAt":today.isoformat()}
        before=list(research["profiles"]["veteran"]["recentHistory"])
        result=m.reconcile_approved_ufc_full_career_timelines(
            client,state,research,candidate,today,approval)
        self.assertEqual(result,{"attempts":1,"added":0,"certified":0})
        self.assertEqual(research["profiles"]["veteran"]["recentHistory"],before)
        self.assertEqual(state["ufcFullCareerHistoryChecks"]["veteran"]["status"],
                         "requires_manual_review")
        self.assertEqual(client.calls,1)
        self.assertEqual(m.reconcile_approved_ufc_full_career_timelines(
            client,state,research,candidate,today,approval)["attempts"],0)

    def test_crosscheck_untruncated_provider_omitting_latest_fight_is_incomplete(self):
        state,research,candidate=self.fixture()
        today=dt.date(2026,11,14)
        candidate["asOf"]=today.isoformat()
        candidate["fighters"][0]["lastUfcFight"]="2026-08-01"
        research["profiles"]["veteran"]["recentHistory"].append({
            "promotion":"ufc","source":"native","boutId":"901",
            "date":"2026-08-01","result":"win","opponent":"Recent Fighter"})
        state["bouts"]["800"]={
            "id":"800","org":"ufc","event":"UFC Official",
            "a":{"id":"10","slug":"veteran","name":"Veteran"},
            "b":{"id":"11","slug":"opponent","name":"Opponent"}}
        class Omitted:
            max_calls=500
            remaining=100
            stopped=False
            calls=0
            def call(self,path):
                self.calls+=1
                return {"meta":{"truncated":False},"data":[
                  {"source":"native","fight_id":800,"date":"2008-05-01",
                   "opponent_name":"Opponent","org_slug":"ufc","status":"win"}]}
        client=Omitted()
        approval={**self.approval(),"rosterAsOf":today.isoformat(),
                  "approvedAt":today.isoformat()}
        result=m.reconcile_approved_ufc_full_career_timelines(
            client,state,research,candidate,today,approval)
        self.assertEqual(result,{"attempts":1,"added":0,"certified":0})
        self.assertFalse(research["profiles"]["veteran"]["ufcTimeline"]["complete"])
        self.assertEqual(research["profiles"]["veteran"]["ufcTimeline"]["missingRosterLastUfcFight"],
                         "2026-08-01")
        self.assertEqual(len(research["profiles"]["veteran"]["recentHistory"]),2)

    def test_full_career_crosscheck_without_numeric_identity_or_signoff_uses_no_calls(self):
        state,research,candidate=self.fixture()
        today=dt.date(2026,11,14)
        candidate["asOf"]=today.isoformat()
        a={**self.approval(),"rosterAsOf":today.isoformat(),"approvedAt":today.isoformat()}
        c=Fake()
        self.assertEqual(m.reconcile_approved_ufc_full_career_timelines(
            c,state,research,candidate,today,a)["attempts"],0)
        state["bouts"]["800"]={
            "id":"800","org":"ufc","event":"UFC Official",
            "a":{"id":"10","slug":"veteran","name":"Veteran"},
            "b":{"id":"11","slug":"opponent","name":"Opponent"}}
        self.assertEqual(m.reconcile_approved_ufc_full_career_timelines(
            c,state,research,candidate,today,{**a,"status":"unapproved"})["attempts"],0)
        state["bouts"]["801"]={
            "id":"801","org":"ufc","event":"UFC Official",
            "a":{"id":"20","slug":"veteran","name":"Veteran"},
            "b":{"id":"21","slug":"opponent","name":"Opponent"}}
        self.assertEqual(m.reconcile_approved_ufc_full_career_timelines(
            c,state,research,candidate,today,a)["attempts"],0)
        self.assertEqual(c.paths,[])

    def test_full_career_crosscheck_partial_response_does_not_certify_or_repeat(self):
        state,research,candidate=self.fixture()
        today=dt.date(2026,11,14)
        candidate["asOf"]=today.isoformat()
        candidate["fighters"][0]["lastUfcFight"]="2026-08-01"
        state["bouts"]["800"]={
            "id":"800","org":"ufc","event":"UFC Event",
            "a":{"id":"10","slug":"veteran","name":"Veteran"},
            "b":{"id":"11","slug":"opponent","name":"Opponent"}}
        class ShortHistory:
            max_calls=500
            remaining=100
            stopped=False
            calls=0
            paths=[]
            def call(self,path):
                self.paths.append(path)
                self.calls+=1
                return {"data":[
                    {"source":"native","fight_id":800,"date":"2008-05-01",
                     "opponent_name":"Opponent","org_slug":"ufc","status":"win"}]}
        c=ShortHistory()
        a={**self.approval(),"rosterAsOf":today.isoformat(),"approvedAt":today.isoformat()}
        result=m.reconcile_approved_ufc_full_career_timelines(
            c,state,research,candidate,today,a)
        self.assertEqual(result,{"attempts":1,"added":0,"certified":0})
        self.assertFalse(research["profiles"]["veteran"]["ufcTimeline"]["complete"])
        self.assertEqual(len(c.paths),1)
        self.assertEqual(m.reconcile_approved_ufc_full_career_timelines(
            c,state,research,candidate,today,a)["attempts"],0)
        self.assertEqual(len(c.paths),1)

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
