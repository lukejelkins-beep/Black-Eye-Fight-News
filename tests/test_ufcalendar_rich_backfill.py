import datetime as dt
import importlib.util
import unittest
from pathlib import Path

FILE=Path(__file__).resolve().parents[1]/"scripts/ufcalendar-rich-backfill.py"
spec=importlib.util.spec_from_file_location("ufcalendar_paid",FILE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def example_event(upcoming=False):
    return {"id":200,"slug":"ufc-example-2026-11-11","org":"ufc",
            "title":"UFC Test Event","starts_at":"2026-11-11T08:00:00Z",
            "status":"scheduled" if upcoming else "completed",
            "venue":{"name":"Example Arena","city":"Example City","country":"USA"},
            "card":[{"id":400,"fighter_a":{"id":13,"slug":"first-fighter","name":"First Fighter"},
                     "fighter_b":{"id":24,"slug":"second-fighter","name":"Second Fighter"},
                     "weight_class":"Lightweight","division_slug":"lightweight",
                     "status":"announced" if upcoming else "completed",
                     "card_section":"main","is_main":True,"is_title":False,
                     "ordering":1,
                     "result":None if upcoming else {"winner_fighter_id":13,"method_normalized":"decision","round":3,"time":"5:00"}}]}

class RichBackfillTests(unittest.TestCase):
    def test_full_monthly_ceiling_skips_api_until_next_utc_month(self):
        state=m.default_progress()
        state["lastRun"]="2026-11-11T20:00:00+00:00"
        state["provider"]={"tier":"hobby","usedAtStart":27000,"limit":30000}
        self.assertTrue(m.quota_guard_reached(state,dt.date(2026,11,12)))
        self.assertFalse(m.quota_guard_reached(state,dt.date(2026,12,1)))
        state["provider"]["usedAtStart"]=26999
        self.assertFalse(m.quota_guard_reached(state,dt.date(2026,11,12)))

    def test_backfill_reserves_3000_calls_for_live_website(self):
        self.assertEqual(m.MAX_SPEND_PER_MONTH,27000)
        self.assertEqual(m.MAX_PER_RUN,500)
        for used,allowed in ((1000,26000),(26000,1000),(27000,0),(29900,0)):
            state=m.default_progress()
            client=m.Client("fake",state,dt.date(2026,11,11),
                            fetch=lambda route, used=used:{
                                "data":{"tier":"hobby","requests_used":used,
                                        "requests_limit":30000,"rpm_limit":60}},max_calls=500)
            self.assertEqual(client.bootstrap(),allowed>0)
            self.assertEqual(client.remaining,allowed)
            self.assertEqual(client.interval,1.2)

    def test_burst_prefers_ufc_results_before_pfl(self):
        state=m.default_progress()
        base={"status":"completed","a":{"name":"Alpha"},"b":{"name":"Beta"},
              "main":False,"titleFight":False,"result":{}}
        state["bouts"]={
            "pfl":{"id":"1","org":"pfl","eventDate":"2026-11-10",**base},
            "ufc":{"id":"2","org":"ufc","eventDate":"2026-10-20",**base}
        }
        self.assertEqual([x["id"] for x in m.selection(state)],["2","1"])

    def test_fast_runs_do_not_repeat_recent_event_discovery(self):
        state=m.default_progress()
        state["historicalComplete"]={"ufc":True,"pfl":True}
        now=dt.datetime.now(dt.timezone.utc)
        state["upcomingCheckedAt"]={"ufc":now.isoformat(),"pfl":now.isoformat()}
        calls=[]
        client=m.Client("fake",state,dt.date(2026,11,11),
                        fetch=lambda route:(calls.append(route) or {"data":[]}),
                        max_calls=20)
        client.remaining=100
        m.read_events(client,state,dt.date(2026,11,11))
        self.assertEqual(calls,[])
        state["upcomingCheckedAt"]["ufc"]=(now-dt.timedelta(hours=2)).isoformat()
        m.read_events(client,state,dt.date(2026,11,11))
        self.assertEqual(len(calls),1)
        self.assertIn("org=ufc",calls[0])

    def test_paid_tier_unlocks_only_when_verified(self):
        for limit,expected in ((100,False),(30000,True)):
            data={"data":{"tier":"hobby" if expected else "free",
                          "requests_used":15,"requests_limit":limit,"rpm_limit":60}}
            state=m.default_progress()
            cli=m.Client("redacted",state,dt.date(2026,11,11),
                         fetch=lambda route:data,max_calls=6)
            self.assertEqual(cli.bootstrap(),expected)
            self.assertEqual(state["provider"]["limit"],limit)
            self.assertEqual(state["status"],"connected" if expected else "upgrade_not_detected")

    def test_full_stats_and_missing_values_are_preserved(self):
        payload={"data":[{"round":1,"corner":"a","sig_strikes_landed":18,
                          "sig_strikes_attempted":40,"head_landed":11,
                          "takedowns_attempted":6,"takedowns_landed":2,
                          "control_time_sec":110,"reversals":1},
                         {"round":1,"corner":"b","sig_strikes_landed":12,
                          "sig_strikes_attempted":39,"control_time_sec":None}]}
        rounds=m.convert_rounds(payload)
        self.assertEqual(len(rounds),1)
        self.assertEqual(rounds[0]["a"]["sigAttempted"],40)
        self.assertEqual(rounds[0]["a"]["sigAbsorbed"],12)
        self.assertEqual(rounds[0]["a"]["reversals"],1)
        self.assertEqual(rounds[0]["b"]["sigAbsorbed"],18)
        self.assertNotIn("controlSec",rounds[0]["b"])

    def test_bout_identity_and_result_not_invented(self):
        event=m.summary_event(example_event())
        self.assertEqual(event["id"],"200")
        self.assertEqual(event["bouts"][0]["a"]["name"],"First Fighter")
        self.assertEqual(event["bouts"][0]["result"]["winnerId"],"13")
        future=m.summary_event(example_event(True))
        self.assertIsNone(future["bouts"][0]["result"])

    def test_existing_public_cards_survive_curation(self):
        card=m.summary_event(example_event(True))
        data=m.public_events({"events":{"200":card}}, {}, dt.date(2026,11,11))
        saved=data["events"]["200"]
        self.assertEqual(saved["bouts"][0]["a"],"First Fighter")
        self.assertEqual(saved["bouts"][0]["b"],"Second Fighter")
        again=m.public_events({"events":{"200":saved}}, {}, dt.date(2026,11,11))
        self.assertEqual(again["events"]["200"]["bouts"][0]["a"],"First Fighter")

    def test_expired_events_are_not_exposed_in_public_feed(self):
        data={"events":{"10":{"startAt":"2023-02-01T00:00:00Z",
                              "bouts":[],"org":"ufc"}}}
        self.assertFalse(m.public_events(data,{},dt.date(2026,11,11))["events"])

    def test_scorecards_retain_judges_and_discard_outcome_only_placeholders(self):
        payload={"data":{"decision_type":"split","cards":[
          {"judge_name":"Judge A","scores_known":True,"total_a":29,"total_b":28,
           "rounds":[{"round":1,"a":10,"b":9},{"round":2,"a":9,"b":10}]},
          {"judge_name":"Judge B","scores_known":False,"total_a":1,"total_b":0,
           "rounds":[]}]}}
        saved=m.short_scorecards(payload)
        self.assertEqual(saved["decision"],"split")
        self.assertEqual(saved["judges"][0]["rounds"],[[1,10,9],[2,9,10]])
        self.assertIsNone(saved["judges"][1]["totalA"])

    def test_career_history_preserves_results_and_source_scope(self):
        sample={"data":[{"date":"2026-10-24","opponent":{"name":"A Veteran"},
                         "status":"win","method_normalized":"ko_tko","org_slug":"ufc","is_title":False},
                        {"date":"2024-05-01","opponent":{"name":"Former Champion"},
                         "status":"loss","method_normalized":"decision","org_slug":"pfl","is_title":True},
                        {"date":"2025-06-30","status":"unknown","opponent":{"name":"Another"}}]}
        rows=m.summarize_history(sample)
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[0]["opponent"],"A Veteran")
        self.assertEqual(rows[1]["promotion"],"pfl")
        self.assertTrue(rows[1]["titleFight"])

    def test_shorter_history_response_preserves_old_ufc_and_non_ufc_results(self):
        today=dt.date(2026,11,14)
        saved=[
          {"date":"2009-01-01","opponent":"Old UFC Rival","promotion":"ufc",
           "result":"loss","source":"native","boutId":"9","method":"decision"},
          {"date":"2015-01-01","opponent":"Old PFL Rival","promotion":"pfl",
           "result":"win","source":"history","boutId":None,"method":"ko_tko"}]
        profile={"recentHistory":saved}
        payload={"meta":{"truncated":False},"data":[
          {"date":"2026-05-01","opponent_name":"New Rival","org_slug":"ufc",
           "status":"win","source":"native","fight_id":101,"method":"decision"}]}
        merged=m.save_ufc_timeline(profile,payload,today)
        self.assertEqual(len(merged),3)
        self.assertEqual(len(profile["recentHistory"]),3)
        self.assertEqual(next(r["boutId"] for r in merged if r["opponent"]=="Old UFC Rival"),"9")
        self.assertEqual(next(r["promotion"] for r in merged if r["opponent"]=="Old PFL Rival"),"pfl")
        self.assertFalse(profile["ufcTimeline"]["complete"])
        self.assertTrue(profile["ufcTimeline"]["savedHistoryHasAdditionalUfcBouts"])
        before=list(profile["recentHistory"])
        m.save_ufc_timeline(profile,payload,today)
        self.assertEqual(profile["recentHistory"],before,"Identical follow-up cannot erase history")

    def test_native_id_upgrade_retains_rich_existing_method_without_duplicate(self):
        today=dt.date(2026,11,14)
        profile={"recentHistory":[
          {"date":"2024-05-01","opponent":"Champion","promotion":"ufc",
           "result":"win","source":"history","method":"ko_tko","boutId":None}]}
        payload={"meta":{"truncated":False},"data":[
          {"date":"2024-05-01","opponent_name":"Champion","org_slug":"ufc",
           "status":"win","source":"native","fight_id":42}]}
        merged=m.save_ufc_timeline(profile,payload,today)
        self.assertEqual(len(merged),1)
        self.assertEqual(merged[0]["boutId"],"42")
        self.assertEqual(merged[0]["source"],"native")
        self.assertEqual(merged[0]["method"],"ko_tko")
        self.assertTrue(profile["ufcTimeline"]["complete"])

    def test_mismatched_native_ids_are_quarantined_and_uncertified(self):
        today=dt.date(2026,11,14)
        profile={"recentHistory":[
          {"date":"2024-05-01","opponent":"Champion","promotion":"ufc",
           "result":"loss","source":"native","boutId":"42","method":"decision"}]}
        payload={"meta":{"truncated":False},"data":[
          {"date":"2024-05-01","opponent_name":"Champion","org_slug":"ufc",
           "status":"loss","source":"native","fight_id":73}]}
        merged=m.save_ufc_timeline(profile,payload,today)
        self.assertEqual(len(merged),1)
        self.assertEqual(merged[0]["boutId"],"42")
        self.assertEqual(len(profile["ufcHistoryIdConflicts"]),1)
        self.assertFalse(profile["ufcTimeline"]["complete"])
        m.save_ufc_timeline(profile,payload,today)
        self.assertEqual(len(profile["ufcHistoryIdConflicts"]),1)

    def test_current_career_record_requires_valid_format(self):
        self.assertIsNone(m.read_fighter_profile({"name":"A","slug":"a",
            "records":{"pro_mma":{"value":"unverified"}}})["record"])
        self.assertEqual(m.read_fighter_profile({"name":"B","slug":"b",
            "records":{"pro_mma":{"value":"18-3-1"}}})["record"],"18-3-1")

    def test_index_page_pagination(self):
        state=m.default_progress()
        m.add_index(state,"ufc",[{"id":200,"org":"ufc","slug":"ufc-example-2026-11-11",
                                  "starts_at":"2026-11-11T08:00:00Z","title":"UFC Test","status":"completed"}])
        self.assertEqual(len(state["eventIndex"]),1)
        self.assertEqual(m.cursor_of({"meta":{"pagination":{"next_cursor":"next-here"}}}),"next-here")

    def test_collect_cards_saves_an_independent_bout_queue(self):
        state=m.default_progress()
        m.add_index(state,"ufc",[{"id":200,"org":"ufc","slug":"ufc-example-2026-11-11",
                                  "starts_at":"2026-11-11T08:00:00Z","title":"UFC Test","status":"completed"}])
        c=m.Client("token",state,dt.date(2026,11,11),
                   fetch=lambda path:{"data":example_event()},max_calls=5)
        c.remaining=4
        cards={"events":{}}
        m.collect_cards(c,state,cards,dt.date(2026,11,11))
        self.assertEqual(len(state["bouts"]),1)
        self.assertEqual(m.selection(state)[0]["id"],"400")
        self.assertEqual(len(cards["events"]),1)

    def test_new_records_are_not_imputed_into_past_result_cards(self):
        event=m.summary_event(example_event())
        profile={"first-fighter":{"record":"20-1-0"}}
        public=m.public_events({"events":{"200":event}},profile,dt.date(2026,11,11))
        self.assertNotIn("aRecord",public["events"]["200"]["bouts"][0])

    def test_round_recovery_rechecks_legacy_missing_but_never_complete_bouts(self):
        today=dt.date(2026,11,13)
        bout={"id":"42","org":"ufc","result":{"round":3}}
        state=m.default_progress()
        state["roundDone"]["42"]=0
        self.assertTrue(m.should_collect_rounds(state,bout,today))
        state["roundRetry"]["42"]={"attempts":1,"checkedAt":today.isoformat(),
                                   "retryAfter":"2026-11-27"}
        self.assertFalse(m.should_collect_rounds(state,bout,today))
        self.assertTrue(m.should_collect_rounds(state,bout,today+dt.timedelta(days=14)))
        state["roundRetry"]["42"]["attempts"]=2
        self.assertFalse(m.should_collect_rounds(state,bout,today+dt.timedelta(days=30)))
        state["roundDone"]["42"]=3
        self.assertFalse(m.should_collect_rounds(state,bout,today+dt.timedelta(days=30)))
        state["roundDone"]["42"]=2
        state["roundRetry"].pop("42")
        self.assertTrue(m.should_collect_rounds(state,bout,today))

    def test_missing_active_stats_are_prioritised_without_repeated_paid_reads(self):
        today=dt.date(2026,11,13)
        state=m.default_progress()
        def bout(ident,day):
            return {"id":ident,"org":"ufc","eventDate":day,"event":"Test",
                    "eventId":"7","status":"completed",
                    "a":{"name":"Alpha"},"b":{"name":"Beta"},
                    "result":{"round":3,"time":"5:00"}}
        state["bouts"]={"99":bout("99","2025-11-13"),
                        "42":bout("42","2026-11-12")}
        state["roundDone"]["99"]=0
        calls=[]
        client=m.Client("secret",state,today,fetch=lambda p:(calls.append(p) or {"data":[]}),
                        max_calls=80)
        client.remaining=100
        coverage={"schema":1,"scope":"ufc","asOf":today.isoformat(),
                  "fighters":[{"needsStats":True,"champion":True,
                               "recent":[{"boutId":"99","hasMeasuredTotals":False}]}]}
        cards={"events":{}}
        archive={"schema":1,"fights":{},"events":{}}
        result=m.collect_rounds(client,state,cards,archive,archive,today,coverage)
        self.assertEqual(result,{"requests":2,"retried":1})
        self.assertEqual(calls,["/fights/99/rounds","/fights/42/rounds"])
        self.assertEqual(state["roundRetry"]["99"]["retryAfter"],"2026-11-27")
        self.assertEqual(state["roundDone"]["42"],0)
        self.assertEqual(m.collect_rounds(client,state,cards,archive,archive,today,coverage),
                         {"requests":0,"retried":0})
        self.assertEqual(len(calls),2)

    def test_failed_first_round_request_receives_backoff(self):
        today=dt.date(2026,11,13)
        state=m.default_progress()
        state["bouts"]={"42":{"id":"42","org":"ufc","eventDate":"2026-11-10",
                              "status":"completed","eventId":"7",
                              "result":{"round":3}}}
        client=m.Client("secret",state,today,fetch=lambda p:None,max_calls=80)
        client.remaining=100
        empty={"events":{}}
        m.collect_rounds(client,state,empty,{"fights":{}},{"fights":{}},today)
        self.assertEqual(state["roundDone"]["42"],0)
        self.assertEqual(state["roundRetry"]["42"]["retryAfter"],"2026-11-14")
        self.assertFalse(m.should_collect_rounds(state,state["bouts"]["42"],today))


    def test_full_ufc_career_timeline_counts_settled_and_flags_uncertainty(self):
        today=dt.date(2026,11,13)
        rows=[
          {"source":"native","fight_id":17,"date":"2026-06-01",
           "opponent_name":"One","org_slug":"ufc","status":"win"},
          {"source":"history","date":"2024-01-01",
           "opponent_name":"Two","org_slug":"ufc","status":"loss"},
          {"source":"native","date":"2026-08-10",
           "opponent_name":"Three","org_slug":"pfl","status":"win"},
          {"source":"history","date":"2026-12-01",
           "opponent_name":"Scheduled","org_slug":"ufc","status":"upcoming"}]
        valid=m.ufc_timeline_evidence({"data":rows,"meta":{"truncated":False}},today)
        self.assertEqual(valid["settledCount"],2)
        self.assertTrue(valid["complete"])
        self.assertEqual(valid["observedOn"],"2026-11-13")
        self.assertFalse(m.ufc_timeline_evidence(
          {"data":rows,"meta":{"truncated":True}},today)["complete"])
        self.assertFalse(m.ufc_timeline_evidence(
          {"data":rows,"meta":{}},today)["complete"])
        duplicate=m.ufc_timeline_evidence(
          {"data":rows+[dict(rows[0])],"meta":{"truncated":False}},today)
        self.assertFalse(duplicate["complete"])
        self.assertEqual(duplicate["settledCount"],2)
        bad=m.ufc_timeline_evidence(
          {"data":rows+[{"date":"2025-01-01","opponent_name":"Unknown",
                         "status":"unknown","org_slug":"ufc"}],
           "meta":{"truncated":False}},today)
        self.assertFalse(bad["complete"])

    def test_keep_old_ufc_bouts_when_many_newer_non_ufc_fights(self):
        rows=[]
        for n in range(25):
            day=(dt.date(2026,11,1)-dt.timedelta(days=n)).isoformat()
            rows.append({"source":"native","fight_id":100+n,"date":day,
               "opponent_name":"PFL Opponent "+str(n),"status":"win","org_slug":"pfl"})
        for n in range(3):
            rows.append({"source":"history","date":f"2023-0{n+1}-01",
               "opponent_name":"UFC Veteran "+str(n),"status":"loss",
               "org_slug":"ufc"})
        history=m.summarize_history({"data":rows})
        self.assertEqual(len(history),28)
        self.assertEqual(sum(r["promotion"]=="ufc" for r in history),3)
        self.assertEqual(history[0]["promotion"],"pfl")
        self.assertEqual(history[-1]["promotion"],"ufc")

    def test_short_fighter_gets_one_bounded_full_timeline_check(self):
        class Client:
            max_calls=500
            calls=0
            stopped=False
            remaining=100
            def __init__(self):
                self.paths=[]
            def call(self,path):
                self.paths.append(path)
                self.calls+=1
                self.remaining-=1
                return {"data":[
                    {"source":"native","fight_id":100,"date":"2026-10-01",
                     "opponent_name":"Challenger","status":"win","org_slug":"ufc"}],
                    "meta":{"truncated":False}}
        today=dt.date(2026,11,13)
        state=m.default_progress()
        state["bouts"]={"100":{"id":"100","org":"ufc","eventDate":"2026-10-01",
          "a":{"slug":"athlete","id":"71","name":"Athlete"},
          "b":{"slug":"challenger","id":"72","name":"Challenger"}}}
        research={"profiles":{"athlete":{"name":"Athlete","slug":"athlete"}}}
        coverage={"schema":1,"scope":"ufc","asOf":"2026-11-13",
            "fighters":[{"slug":"athlete","needsHistoryCheck":True,"recentCount":1,
               "recent":[{"boutId":"100","date":"2026-10-01"}]}]}
        client=Client()
        self.assertEqual(m.verify_short_ufc_careers(
            client,state,research,coverage,today),1)
        self.assertEqual(client.paths,["/fighters/71/history"])
        self.assertEqual(research["profiles"]["athlete"]["ufcTimeline"]["settledCount"],1)
        self.assertTrue(research["profiles"]["athlete"]["ufcTimeline"]["complete"])
        self.assertEqual(m.verify_short_ufc_careers(
            client,state,research,coverage,today),0)
        self.assertEqual(client.calls,1)

if __name__=="__main__":
    unittest.main()
