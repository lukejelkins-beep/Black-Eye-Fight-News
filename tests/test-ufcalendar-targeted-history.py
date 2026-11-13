#!/usr/bin/env python3
"""Contract tests: no live API key/network required."""
import datetime as dt
import importlib.util
import pathlib
import unittest

module_path=pathlib.Path(__file__).resolve().parents[1]/"scripts"/"ufcalendar-rich-backfill.py"
spec=importlib.util.spec_from_file_location("ufcalendar_rich_backfill",module_path)
collector=importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class StubClient:
    def __init__(self,rows,remaining=100):
        self.rows=rows
        self.remaining=remaining
        self.max_calls=500
        self.stopped=False
        self.paths=[]

    def call(self,path):
        self.paths.append(path)
        self.remaining-=1
        return {"data":self.rows.get(path,[])}


class TargetedHistoryTests(unittest.TestCase):
    def test_discover_unique_fight_and_never_refetch_fighter(self):
        date=dt.date(2026,11,13)
        url="/fights/search?org=ufc&fighter=champion-a&limit=8"
        bout={
            "id":27123,"fighter_a":{"id":71,"slug":"champion-a","name":"Champion A"},
            "fighter_b":{"id":72,"slug":"contender-b","name":"Contender B"},
            "status":"completed","is_main":True,"is_title":True,
            "result":{"winner_fighter_id":71,"method_normalized":"decision","round":5,"time":"5:00"},
            "event":{"id":909,"org":"ufc","title":"Historical UFC Card",
                     "starts_at":"2024-06-02T00:00:00Z"}
        }
        coverage={"schema":1,"scope":"ufc","asOf":date.isoformat(),
                  "fighters":[{"slug":"champion-a","needsHistoryCheck":True,"champion":True}]}
        state=collector.default_progress()
        state["bouts"]={"27124":{"id":"27124","org":"ufc","status":"no_contest",
                                    "eventDate":"2025-09-01"}}
        client=StubClient({url:[bout]})
        self.assertEqual(collector.collect_targeted_ufc_history(client,state,coverage,date),1)
        self.assertEqual(client.paths,[url])
        self.assertEqual(state["bouts"]["27123"]["org"],"ufc")
        self.assertEqual(state["bouts"]["27123"]["eventDate"],"2024-06-02")
        self.assertEqual(state["bouts"]["27123"]["result"]["winnerId"],"71")
        self.assertEqual(state["ufcHistoricalPriority"]["27123"],3)
        self.assertEqual(state["bouts"]["27124"]["status"],"no_contest")
        self.assertEqual(collector.collect_targeted_ufc_history(client,state,coverage,date),0)
        self.assertEqual(len(client.paths),1)

    def test_reject_non_ufc_and_preserve_prior_bout(self):
        today=dt.date(2026,11,13)
        url="/fights/search?org=ufc&fighter=fighter-a&limit=8"
        a={"id":29,"slug":"fighter-a","name":"Fighter A"}
        b={"id":30,"slug":"fighter-b","name":"Fighter B"}
        def fight(fid,org="ufc",status="completed"):
            return {"id":fid,"status":status,"fighter_a":a,"fighter_b":b,
                    "event":{"id":1,"title":"Old Card","starts_at":"2024-06-02T00:00:00Z","org":org},
                    "result":{"winner_fighter_id":29,"method":"decision","round":3,"time":"5:00"}}
        rows=[fight(100),fight(101,org="pfl"),fight(102,status="draw")]
        coverage={"schema":1,"scope":"ufc","asOf":today.isoformat(),
                  "fighters":[{"slug":"fighter-a","needsHistoryCheck":True,"upcoming":True}]}
        state=collector.default_progress()
        state["bouts"]={"100":{"id":"100","org":"ufc","event":"Verified title",
                                "eventDate":"2024-06-03","status":"completed"}}
        client=StubClient({url:rows})
        collector.collect_targeted_ufc_history(client,state,coverage,today)
        self.assertEqual(state["bouts"]["100"]["event"],"Verified title")
        self.assertNotIn("101",state["bouts"])
        self.assertNotIn("102",state["bouts"])
        self.assertEqual(state["ufcHistoricalPriority"]["100"],2)

    def test_stale_or_exhausted_coverage_makes_no_calls(self):
        today=dt.date(2026,11,13)
        state=collector.default_progress()
        client=StubClient({},remaining=0)
        coverage={"schema":1,"scope":"ufc","asOf":"2026-11-13",
                  "fighters":[{"slug":"a","needsHistoryCheck":True}]}
        self.assertEqual(collector.collect_targeted_ufc_history(client,state,coverage,today),0)
        self.assertEqual(client.paths,[])
        client.remaining=5
        coverage["asOf"]="2026-10-01"
        self.assertEqual(collector.collect_targeted_ufc_history(client,state,coverage,today),0)
        self.assertEqual(client.paths,[])


if __name__=="__main__":
    unittest.main()
