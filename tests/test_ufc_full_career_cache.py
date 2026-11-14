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

    def legacy_evidence(self):
        return {"schema":1,"scope":"ufc-official-legacy-evidence","bouts":[{
            "fightId":"800","fighterSlug":"veteran","date":"2008-05-01",
            "opponent":"Opponent","event":"The Ultimate Fighter 18 Finale",
            "sourceUrl":"https://www.ufc.com/event/test"}]}

    def legacy_client(self,returned_id=800,opponent="Opponent",
                      event_title="The Ultimate Fighter 18 Finale"):
        class Search:
            max_calls=500
            remaining=100
            stopped=False
            calls=0
            paths=[]
            def call(self,path):
                self.calls+=1
                self.paths.append(path)
                return {"data":[{
                    "id":returned_id,"status":"completed",
                    "fighter_a":{"id":1,"slug":"veteran","name":"Veteran"},
                    "fighter_b":{"id":2,"slug":"opponent","name":opponent},
                    "event":{"id":500,"org":"ufc","title":event_title,
                             "starts_at":"2008-05-01T00:00:00Z"},
                    "result":{"winner_fighter_id":1,"round":3,
                              "method":"decision","time":"5:00"}}]}
        return Search()

    def test_legacy_date_search_exact_id_indexes_once_and_reuses_provider_match(self):
        state,research,coverage=self.fixture()
        research["profiles"]["veteran"]["name"]="Veteran"
        state["ufcCareerBoutChecks"]={"800":{"status":"requires_manual_review"}}
        client=self.legacy_client()
        outcome=m.reconcile_legacy_ufc_by_event_date(
            client,state,research,coverage,dt.date(2026,11,13),
            self.approval(),self.legacy_evidence())
        self.assertEqual(outcome,{"calls":1,"indexed":1,"alternative":0})
        self.assertEqual(state["bouts"]["800"]["event"],"The Ultimate Fighter 18 Finale")
        self.assertEqual(client.paths,[
            "/fights/search?org=ufc&from=2008-04-30&to=2008-05-03&limit=25"])
        self.assertNotIn("800",state["ufcCareerBoutChecks"])
        self.assertEqual(m.reconcile_legacy_ufc_by_event_date(
            client,state,research,coverage,dt.date(2026,11,13),
            self.approval(),self.legacy_evidence())["calls"],0)

    def test_legacy_date_search_alternative_id_never_rewrites_native_history(self):
        state,research,coverage=self.fixture()
        research["profiles"]["veteran"]["name"]="Veteran"
        client=self.legacy_client(returned_id=801)
        outcome=m.reconcile_legacy_ufc_by_event_date(
            client,state,research,coverage,dt.date(2026,11,13),
            self.approval(),self.legacy_evidence())
        self.assertEqual(outcome,{"calls":1,"indexed":0,"alternative":1})
        self.assertNotIn("800",state["bouts"])
        self.assertNotIn("801",state["bouts"])
        self.assertEqual(research["profiles"]["veteran"]["recentHistory"][0]["boutId"],"800")
        self.assertEqual(state["ufcLegacyDateSearchChecks"]["800"]["status"],
                         "alternative_id_manual_review")
        self.assertEqual(state["ufcLegacyDateSearchChecks"]["800"]["candidateId"],"801")
        self.assertEqual(m.reconcile_legacy_ufc_by_event_date(
            client,state,research,coverage,dt.date(2026,11,13),
            self.approval(),self.legacy_evidence())["calls"],0)

    def test_legacy_search_rejects_feeder_other_opponent_or_unsigned_cohort(self):
        for title,opponent in [
            ("Dana White's Contender Series","Opponent"),
            ("The Ultimate Fighter 18 Finale","Different Opponent")]:
            state,research,coverage=self.fixture()
            research["profiles"]["veteran"]["name"]="Veteran"
            client=self.legacy_client(event_title=title,opponent=opponent)
            outcome=m.reconcile_legacy_ufc_by_event_date(
                client,state,research,coverage,dt.date(2026,11,13),
                self.approval(),self.legacy_evidence())
            self.assertEqual(outcome,{"calls":1,"indexed":0,"alternative":0})
            self.assertNotIn("800",state["bouts"])
            self.assertEqual(state["ufcLegacyDateSearchChecks"]["800"]["status"],"no_match")
        state,research,coverage=self.fixture()
        client=self.legacy_client()
        result=m.reconcile_legacy_ufc_by_event_date(
            client,state,research,coverage,dt.date(2026,11,13),
            self.approval(["unapproved"]),self.legacy_evidence())
        self.assertEqual(result["calls"],0)
        self.assertEqual(client.calls,0)

    def round_fallback_fixture(self):
        state=m.default_progress()
        for bid,day,a,b,end_round,event in [
            ("83242","2025-05-17","Park Hyun-sung","Carlos Hernandez",1,
             "UFC Fight Night: Burns vs Morales"),
            ("83254","2025-10-18","Bruno Gustavo da Silva","Park Hyun-sung",3,
             "UFC Vancouver: De Ridder vs Hernandez")]:
            state["bouts"][bid]={
                "id":bid,"org":"ufc","status":"completed","eventDate":day,
                "event":event,"result":{"round":end_round},
                "a":{"name":a},"b":{"name":b}}
        state["roundDone"]={"83242":0,"83254":0}
        state["roundRetry"]={
            "83242":{"attempts":1,"retryAfter":"2026-11-27"},
            "83254":{"attempts":1,"retryAfter":"2026-11-27"}}
        coverage={"schema":1,"scope":"ufc","activityMonths":36,
                  "asOf":"2026-11-14","indexCompleteness":"36_month_event_scan_complete"}
        approval={**self.approval(["park-hyun-sung","carlos-hernandez-7",
                                   "bruno-gustavo-da-silva"]),
                  "rosterAsOf":"2026-11-14","approvedAt":"2026-11-14"}
        return state,{"schema":1,"fights":{}},coverage,approval

    def test_independent_verified_round_fallback_recovers_two_bouts_once(self):
        state,archive,coverage,approval=self.round_fallback_fixture()
        manifest=m.read(m.VERIFIED_ROUND_FALLBACK,{})
        self.assertEqual([row["fightId"] for row in manifest["bouts"]],
                         ["83242","83254"])
        prior_retries=dict(state["roundRetry"])
        n=m.apply_verified_round_fallbacks(
            state,archive,manifest,coverage,approval,dt.date(2026,11,14),
            "2026-11-14T01:00:00Z")
        self.assertEqual(n,2)
        self.assertEqual(m.apply_verified_round_fallbacks(
            state,archive,manifest,coverage,approval,dt.date(2026,11,14),
            "2026-11-14T01:05:00Z"),0,"Must not reimport on next five-minute hop")
        self.assertEqual(state["roundDone"],{"83242":0,"83254":0},
                         "Independent research must not masquerade as provider completion")
        self.assertEqual(state["roundRetry"],prior_retries)
        first=archive["fights"]["2025-05-17:carloshernandez:parkhyunsung"]
        second=archive["fights"]["2025-10-18:brunogustavodasilva:parkhyunsung"]
        self.assertEqual([r["round"] for r in first["rounds"]],[1])
        self.assertEqual([r["round"] for r in second["rounds"]],[1,2,3])
        self.assertEqual(first["rounds"][0]["a"]["sigLanded"],14)
        self.assertEqual(first["rounds"][0]["b"]["knockdowns"],0)
        self.assertEqual(second["rounds"][1]["a"]["knockdowns"],1)
        self.assertEqual(second["rounds"][1]["a"]["controlSec"],205)
        self.assertEqual(second["rounds"][0]["a"]["sigAbsorbed"],10)
        self.assertEqual(first["rounds"][0]["a"]["sourceByMetric"]["sigLanded"],
                         "ufc-stats-verified-web")
        self.assertIn("sourceUrl",first["sources"]["ufc-stats-verified-web"])

    def test_independent_round_fallback_rejects_bad_identity_and_unapproved_scope(self):
        import copy
        state,archive,coverage,approval=self.round_fallback_fixture()
        source=m.read(m.VERIFIED_ROUND_FALLBACK,{})
        for mutate in ("native_id","event_date","wrong_opponent",
                       "feeder","negative_metric","inferred_zero"):
            current=copy.deepcopy(state)
            manifest=copy.deepcopy(source)
            manifest["bouts"]=manifest["bouts"][:1]
            if mutate=="native_id":current["bouts"]["83242"]["id"]="999"
            elif mutate=="event_date":current["bouts"]["83242"]["eventDate"]="2025-05-16"
            elif mutate=="wrong_opponent":current["bouts"]["83242"]["b"]["name"]="Other Fighter"
            elif mutate=="feeder":current["bouts"]["83242"]["event"]="Dana White's Contender Series"
            elif mutate=="negative_metric":manifest["bouts"][0]["rounds"][0]["a"]["controlSec"]=-1
            elif mutate=="inferred_zero":del manifest["bouts"][0]["rounds"][0]["b"]["knockdowns"]
            a={"schema":1,"fights":{}}
            self.assertEqual(m.apply_verified_round_fallbacks(
                current,a,manifest,coverage,approval,dt.date(2026,11,14),
                "2026-11-14T01:00:00Z"),0,mutate)
            self.assertEqual(a["fights"],{})
        self.assertEqual(m.apply_verified_round_fallbacks(
            state,archive,source,coverage,{"status":"not_approved"},
            dt.date(2026,11,14),"2026-11-14T01:00:00Z"),0)

    def test_independent_fallback_never_overrides_newer_primary_provider_metric(self):
        state,archive,coverage,approval=self.round_fallback_fixture()
        manifest=m.read(m.VERIFIED_ROUND_FALLBACK,{})
        self.assertEqual(m.apply_verified_round_fallbacks(
            state,archive,manifest,coverage,approval,dt.date(2026,11,14),
            "2026-11-14T01:00:00Z"),2)
        import importlib.util
        spec=importlib.util.spec_from_file_location(
            "befn_archive_test",m.ROOT/"scripts/refresh-ufc-research-archive.py")
        arch=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(arch)
        item=archive["fights"]["2025-05-17:carloshernandez:parkhyunsung"]
        item["sources"]["ufcalendar"]={"id":"83242",
            "rounds":[{"round":1,"a":{"sigLanded":15},"b":{"sigLanded":5}}]}
        arch.reconcile(item)
        self.assertEqual(item["rounds"][0]["a"]["sigLanded"],15)
        self.assertEqual(item["rounds"][0]["a"]["sourceByMetric"]["sigLanded"],
                         "ufcalendar")
        self.assertEqual(item["rounds"][0]["a"]["takedowns"],1)
        self.assertEqual(item["rounds"][0]["a"]["sourceByMetric"]["takedowns"],
                         "ufc-stats-verified-web")
        self.assertTrue(item["conflicts"],
                        "Contradictions remain visible in internal archive QA")

    def test_provider_timeline_retains_explicit_truncation_metadata_and_missing_flag(self):
        row={"org_slug":"ufc","status":"win","date":"2025-05-17",
             "opponent":{"name":"Test Opponent"}}
        for meta,want in [({"truncated":False},False),
                          ({"truncated":True},True),
                          ({},None)]:
            result=m.ufc_timeline_evidence({"data":[row],"meta":meta},
                                           dt.date(2026,11,14))
            self.assertIs(result["providerTruncatedFlag"],want)
            self.assertEqual(result["providerHistoryRowCount"],1)
            self.assertEqual(result["settledCount"],1)
            self.assertIs(result["complete"],want is False)
        missing=m.ufc_timeline_evidence({"data":[row]},
                                         dt.date(2026,11,14))
        self.assertIsNone(missing["providerTruncatedFlag"])
        self.assertFalse(missing["complete"])

    def nc_cache_fixture(self):
        state=m.default_progress()
        pairs=[
          ("59855","2024-02-03","UFC Fight Night: Dolidze vs Imavov",
           "aliaskhab-khizriev","Aliaskhab Khizriev","muradov","Makhmud Muradov"),
          ("60458","2025-10-25","UFC 321: Aspinall vs Gane",
           "tom-aspinall","Tom Aspinall","ciryl-gane","Ciryl Gane"),
          ("60666","2026-02-21","UFC Fight Night: Strickland vs Hernandez",
           "ode-osbourne","Ode Osbourne","alibi-idiris","Alibi Idiris")
        ]
        for bid,date,event,slug_a,name_a,slug_b,name_b in pairs:
            state["bouts"][bid]={
              "id":bid,"org":"ufc","status":"no_contest",
              "eventDate":date,"event":event,"titleFight":bid=="60458",
              "a":{"slug":slug_a,"name":name_a},"b":{"slug":slug_b,"name":name_b}}
        slugs=["aliaskhab-khizriev","tom-aspinall","alibi-idiris"]
        research={"profiles":{s:{"recentHistory":[{
          "promotion":"ufc","source":"native","result":"win",
          "date":"2022-02-01","opponent":"Old Opponent","boutId":"9000"
        }],"ufcTimeline":{"complete":False}} for s in slugs}}
        census={"schema":1,"scope":"ufc","activityMonths":36,
            "asOf":"2026-11-14","indexCompleteness":"36_month_event_scan_complete",
            "fighters":[{"slug":s,"eligibilityStatus":"latest_observed_mma_ufc"}
                        for s in slugs]}
        approval={**self.approval(slugs),
            "rosterAsOf":"2026-11-14","approvedAt":"2026-11-14"}
        manifest=m.read(m.OFFICIAL_NC_REPAIR,{})
        return state,research,census,approval,manifest

    def test_exact_official_cached_nc_histories_are_added_once_and_keep_old_careers(self):
        state,research,census,approval,manifest=self.nc_cache_fixture()
        before_bouts=dict(state["bouts"])
        first=m.reconcile_cached_official_nc_histories(
            state,research,census,dt.date(2026,11,14),approval,manifest)
        self.assertEqual(first,{"added":3,"blocked":0})
        for fighter,id in [
            ("aliaskhab-khizriev","59855"),
            ("tom-aspinall","60458"),
            ("alibi-idiris","60666")]:
            history=research["profiles"][fighter]["recentHistory"]
            self.assertEqual(len(history),2)
            self.assertEqual(history[0]["result"],"no_contest")
            self.assertEqual(history[0]["source"],"native")
            self.assertEqual(history[0]["boutId"],id)
            self.assertEqual(history[1]["opponent"],"Old Opponent")
            self.assertFalse(research["profiles"][fighter]["ufcTimeline"]["complete"],
                             "Source-backed NC result cannot certify full career")
        self.assertEqual(state["bouts"],before_bouts,
                         "Do not overwrite any archived native fight or round statistics")
        self.assertEqual(m.reconcile_cached_official_nc_histories(
            state,research,census,dt.date(2026,11,14),approval,manifest),
            {"added":0,"blocked":0},"Every subsequent five-minute run is idempotent")

    def test_cached_nc_identity_and_official_results_are_fail_closed(self):
        import copy
        state,research,census,approval,manifest=self.nc_cache_fixture()
        for scenario in ["unapproved","wrong_native_id","wrong_opponent",
                         "not_nc","feeder_event","wrong_date","source_unverified"]:
            st,rs,cv,ap,ma=(copy.deepcopy(x) for x in
                            (state,research,census,approval,manifest))
            ma["bouts"]=ma["bouts"][:1]
            if scenario=="unapproved":ap["status"]="pending"
            elif scenario=="wrong_native_id":st["bouts"]["59855"]["id"]="1111"
            elif scenario=="wrong_opponent":st["bouts"]["59855"]["b"]["name"]="Other"
            elif scenario=="not_nc":st["bouts"]["59855"]["status"]="completed"
            elif scenario=="feeder_event":st["bouts"]["59855"]["event"]="Dana White's Contender Series"
            elif scenario=="wrong_date":st["bouts"]["59855"]["eventDate"]="2024-02-02"
            elif scenario=="source_unverified":ma["bouts"][0]["sourceUrl"]="https://example.com"
            outcome=m.reconcile_cached_official_nc_histories(
                st,rs,cv,dt.date(2026,11,14),ap,ma)
            self.assertEqual(outcome["added"],0,scenario)
            self.assertEqual(len(rs["profiles"]["aliaskhab-khizriev"]["recentHistory"]),1)

    def cached_whole_career_fixture(self):
        state=m.default_progress()
        def bout(id,date,a_id,a_name,a_slug,b_id,b_name,b_slug,
                 status="completed",winner=None,event="UFC 300"):
            return {"id":id,"org":"ufc","eventDate":date,"event":event,
                "status":status,"titleFight":False,
                "a":{"id":a_id,"name":a_name,"slug":a_slug},
                "b":{"id":b_id,"name":b_name,"slug":b_slug},
                "result":{"winnerId":winner,"method":"Decision"}}
        state["bouts"]={
            "600":bout("600","2025-04-01","123","Carlos Hernandez","carlos-hernandez",
                       "987","Opponent A","opponent-a",winner="123"),
            "601":bout("601","2024-02-01","123","Carlos Hernandez","carlos-hernandez",
                       "986","Opponent B","opponent-b",winner="986"),
            "602":bout("602","2023-01-01","123","Carlos Hernandez","carlos-hernandez",
                       "985","Opponent C","opponent-c",winner="123"),
            "603":bout("603","2022-04-01","123","Carlos Hernandez","carlos-hernandez",
                       "984","Opponent D","opponent-d",status="no_contest"),
            "604":bout("604","2021-04-01","123","Carlos Hernandez","carlos-hernandez",
                       "983","Feeder Person","feeder-person",winner="123",
                       event="Dana White's Contender Series"),
            "605":bout("605","2023-02-01","123","Carlos Hernandez","carlos-hernandez",
                       "982","Other Opponent","other-opponent",status="completed",
                       winner=None)}
        research={"profiles":{"carlos-hernandez-7":{
            "name":"Carlos Hernandez","recentHistory":[{
                "date":"2025-04-01","opponent":"Opponent A","result":"win",
                "promotion":"ufc","source":"native","boutId":"600"}],
            "ufcTimeline":{"complete":False,"settledCount":1}}}}
        census={"schema":1,"scope":"ufc","activityMonths":36,
                "asOf":"2026-11-14",
                "indexCompleteness":"36_month_event_scan_complete",
                "fighters":[{"slug":"carlos-hernandez-7",
                             "eligibilityStatus":"latest_observed_mma_ufc"}]}
        approval={**self.approval(["carlos-hernandez-7"]),
                  "rosterAsOf":"2026-11-14","approvedAt":"2026-11-14"}
        return state,research,census,approval

    def test_native_career_reconcile_recovers_all_official_existing_fight_outcomes_without_api(self):
        state,research,census,approval=self.cached_whole_career_fixture()
        before=dict(state["bouts"])
        stats=m.reconcile_indexed_native_ufc_careers(
            state,research,census,dt.date(2026,11,14),approval)
        self.assertEqual(stats,{"added":3,"profiles":1,"conflicts":0,"identitySkipped":0})
        profile=research["profiles"]["carlos-hernandez-7"]
        self.assertEqual([(h["boutId"],h["result"]) for h in profile["recentHistory"]],
                         [("600","win"),("601","loss"),("602","win"),("603","no_contest")])
        self.assertFalse(profile["ufcTimeline"]["complete"])
        self.assertTrue(profile["ufcTimeline"]["savedHistoryHasAdditionalUfcBouts"])
        self.assertEqual(state["bouts"],before,"Do not rewrite original official fight cache")
        self.assertEqual(m.reconcile_indexed_native_ufc_careers(
            state,research,census,dt.date(2026,11,14),approval)["added"],0)

    def test_native_career_reconcile_requires_approved_cohort_unambiguous_stable_id(self):
        import copy
        state,research,census,approval=self.cached_whole_career_fixture()
        wrong={**approval,"status":"pending"}
        self.assertEqual(m.reconcile_indexed_native_ufc_careers(
            state,copy.deepcopy(research),census,dt.date(2026,11,14),wrong)["added"],0)
        invalid=copy.deepcopy(research)
        invalid["profiles"]["carlos-hernandez-7"]["recentHistory"][0]["opponent"]="Wrong Person"
        self.assertEqual(m.reconcile_indexed_native_ufc_careers(
            state,invalid,census,dt.date(2026,11,14),approval)["added"],0)
        shared=copy.deepcopy(research)
        shared["profiles"]["other-carlos"]={"name":"Carlos Hernandez",
            "recentHistory":[{
             "date":"2025-04-01","opponent":"Opponent A","promotion":"ufc",
             "source":"native","result":"win","boutId":"600"}]}
        census["fighters"].append({"slug":"other-carlos","eligibilityStatus":"latest_observed_mma_ufc"})
        approved={**approval,"approvedFighters":["carlos-hernandez-7","other-carlos"]}
        self.assertEqual(m.reconcile_indexed_native_ufc_careers(
            state,shared,census,dt.date(2026,11,14),approved)["added"],0,
            "A numeric fighter ID claimed by two approved slugs cannot auto-link history")

    def test_native_career_reconcile_never_overwrites_conflicting_saved_bout(self):
        import copy
        state,research,census,approval=self.cached_whole_career_fixture()
        profile=research["profiles"]["carlos-hernandez-7"]
        profile["recentHistory"].append({
            "date":"2024-02-01","opponent":"Opponent B","promotion":"ufc",
            "source":"native","result":"win","boutId":"99999"})
        stats=m.reconcile_indexed_native_ufc_careers(
            state,research,census,dt.date(2026,11,14),approval)
        self.assertEqual(stats["added"],2)
        self.assertEqual(stats["conflicts"],1)
        self.assertEqual(profile["recentHistory"][-1]["boutId"],"603")
        self.assertTrue(any(h.get("boutId")=="99999" for h in profile["recentHistory"]))

    def full_index_search_fixture(self):
        state,research,census,approval=self.cached_whole_career_fixture()
        # The approved surname has a numeric ID 123 already anchored to an
        # official native fight; the source's canonical slug differs.
        research["profiles"]["carlos-hernandez-7"]["recentHistory"]=[
          {"date":"2025-04-01","opponent":"Opponent A","result":"win",
           "promotion":"ufc","source":"native","boutId":"600"}]
        independent={"schema":1,"scope":"ufc-independent-full-career-verification",
            "fighters":{"carlos-hernandez-7":{"minimumOfficialUfcBouts":7}}}
        return state,research,census,approval,independent

    def indexed_search_row(self,id,day,opponent="Unseen Opponent",
                           winner=123,event="UFC Fight Night: Tested"):
        return {"id":id,"status":"completed",
          "fighter_a":{"id":123,"slug":"carlos-hernandez","name":"Carlos Hernandez"},
          "fighter_b":{"id":999,"slug":"unseen-opponent","name":opponent},
          "result":{"winner_fighter_id":winner,"method":"Decision",
                    "round":3,"time":"5:00"},
          "event":{"id":777,"org":"ufc","title":event,
                   "starts_at":day+"T21:00:00Z"}}

    class PaginatedSearch:
        max_calls=500
        remaining=100
        stopped=False
        calls=0
        def __init__(self,*payloads):
            self.payloads=list(payloads)
            self.paths=[]
            self.errors=[]
        def call(self,path):
            self.calls+=1
            self.paths.append(path)
            return self.payloads.pop(0) if self.payloads else {"data":[],"meta":{}}

    def test_paginated_numeric_ufc_search_recovers_verified_earlier_fights_and_caches_cursor(self):
        state,research,census,approval,independent=self.full_index_search_fixture()
        first={"data":[self.indexed_search_row(700,"2020-06-01")],
               "meta":{"pagination":{"next_cursor":"next-25"}}}
        second={"data":[self.indexed_search_row(701,"2021-06-01",
                 "Other Opponent",winner=999)],"meta":{"pagination":{"next_cursor":None}}}
        c=self.PaginatedSearch(first,second)
        a=m.collect_approved_full_ufc_fight_search(
            c,state,research,census,dt.date(2026,11,14),approval,independent)
        self.assertEqual(a,{"calls":1,"fighters":0,"newFights":1,"newHistoryRows":1})
        self.assertEqual(state["ufcApprovedFullFightSearchChecks"]["carlos-hernandez-7"]["status"],"partial")
        b=m.collect_approved_full_ufc_fight_search(
            c,state,research,census,dt.date(2026,11,14),approval,independent)
        self.assertEqual(b,{"calls":1,"fighters":1,"newFights":1,"newHistoryRows":1})
        self.assertEqual(c.paths,[
            "/fights/search?org=ufc&fighter=123&limit=25",
            "/fights/search?org=ufc&fighter=123&limit=25&cursor=next-25"])
        h=research["profiles"]["carlos-hernandez-7"]["recentHistory"]
        self.assertEqual([(r["boutId"],r["result"]) for r in h],
                         [("600","win"),("701","loss"),("700","win")])
        self.assertFalse(research["profiles"]["carlos-hernandez-7"]["ufcTimeline"]["complete"])
        self.assertEqual(m.collect_approved_full_ufc_fight_search(
            c,state,research,census,dt.date(2026,11,14),approval,independent)["calls"],0,
            "Do not re-search a fully paginated numeric history")

    def test_full_index_search_rejects_unsafe_provider_rows_without_fabricating_outcomes(self):
        for kind in ["foreign_numeric","feeder","missing_winner","future","unapproved"]:
            state,research,census,approval,independent=self.full_index_search_fixture()
            row=self.indexed_search_row(703,"2021-06-01")
            if kind=="foreign_numeric":
                row["fighter_a"]["id"]=887
            elif kind=="feeder":
                row["event"]["title"]="Dana White's Contender Series"
            elif kind=="missing_winner":
                row["result"]["winner_fighter_id"]=None
            elif kind=="future":
                row["event"]["starts_at"]="2027-01-01T00:00:00Z"
            elif kind=="unapproved":
                approval["status"]="pending"
            c=self.PaginatedSearch({"data":[row],"meta":{}})
            result=m.collect_approved_full_ufc_fight_search(
                c,state,research,census,dt.date(2026,11,14),approval,independent)
            self.assertEqual(result["newFights"],0,kind)
            self.assertEqual(result["newHistoryRows"],0,kind)
            self.assertEqual(len(research["profiles"]["carlos-hernandez-7"]["recentHistory"]),1)
            if kind=="unapproved":self.assertEqual(c.calls,0)
            else:self.assertEqual(state["ufcApprovedFullFightSearchChecks"]["carlos-hernandez-7"]["status"],
                                  "manual_review")

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
        self.assertGreaterEqual(len(evidence["bouts"]),3)
        keys=[(r["boutId"],r["fighterSlug"],r["date"],r["opponent"])
              for r in evidence["bouts"]]
        self.assertEqual(len(keys),len(set(keys)))
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

    def test_curated_ufc_finale_retries_one_verified_cooldown_id(self):
        state,research,candidate=self.fixture()
        today=dt.date(2026,11,13)
        state.setdefault("ufcCareerBoutChecks",{})["800"]={
            "status":"requires_manual_review","checkedAt":today.isoformat(),
            "retryAfter":"2026-11-27"}
        manifest={"schema":1,"scope":"ufc-official-finale-recovery","bouts":[{
            "fightId":"800","date":"2008-05-01",
            "fighterSlug":"veteran","opponent":"Opponent",
            "sourceUrl":"https://www.ufc.com/event/official-ufc-final"}]}
        class Finale(Fake):
            def __init__(self):super().__init__("The Ultimate Fighter 28 Finale")
        c=Finale()
        count=m.collect_ufc_career_bouts(
            c,state,research,candidate,today,self.approval(),manifest)
        self.assertEqual(count,1)
        self.assertEqual(c.paths,["/fights/800"])
        self.assertEqual(state["bouts"]["800"]["org"],"ufc")
        self.assertEqual(m.collect_ufc_career_bouts(
            c,state,research,candidate,today,self.approval(),manifest),0)

    def test_curated_finale_requires_exact_saved_bout_opponent_and_official_url(self):
        state,research,candidate=self.fixture()
        today=dt.date(2026,11,13)
        state.setdefault("ufcCareerBoutChecks",{})["800"]={
            "status":"requires_manual_review","retryAfter":"2026-11-27"}
        base={"fightId":"800","date":"2008-05-01","fighterSlug":"veteran",
              "opponent":"Opponent",
              "sourceUrl":"https://www.ufc.com/event/official-tuf-final"}
        for change in ({"opponent":"Unrelated"},{"fighterSlug":"different"},
                       {"date":"2008-05-02"},{"sourceUrl":"https://not-ufc.example/event"}):
            trial={"schema":1,"scope":"ufc-official-finale-recovery",
                   "bouts":[{**base,**change}]}
            c=Fake("The Ultimate Fighter 28 Finale")
            self.assertEqual(m.collect_ufc_career_bouts(
                c,state,research,candidate,today,self.approval(),trial),0)
            self.assertEqual(c.paths,[])
        self.assertNotIn("800",state["bouts"])

    def test_curated_finale_provider_identity_mismatch_is_not_saved_or_repeated(self):
        state,research,candidate=self.fixture()
        today=dt.date(2026,11,13)
        state.setdefault("ufcCareerBoutChecks",{})["800"]={
            "status":"requires_manual_review","retryAfter":"2026-11-27"}
        manifest={"schema":1,"scope":"ufc-official-finale-recovery","bouts":[{
          "fightId":"800","date":"2008-05-01","fighterSlug":"veteran",
          "opponent":"Opponent","sourceUrl":"https://www.ufc.com/event/tuf"}]}
        class WrongCorner(Fake):
            def __init__(self):super().__init__("The Ultimate Fighter 28 Finale")
            def call(self,path):
                x=super().call(path)
                x["data"]["fighter_a"]["name"]="Unrelated Person"
                return x
        c=WrongCorner()
        self.assertEqual(m.collect_ufc_career_bouts(
            c,state,research,candidate,today,self.approval(),manifest),0)
        self.assertEqual(c.paths,["/fights/800"])
        self.assertNotIn("800",state["bouts"])
        self.assertEqual(state["ufcCareerBoutChecks"]["800"]["reason"],
                         "verified_finale_provider_identity_disagreement")
        self.assertEqual(m.collect_ufc_career_bouts(
            c,state,research,candidate,today,self.approval(),manifest),0)
        self.assertEqual(c.paths,["/fights/800"])

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
