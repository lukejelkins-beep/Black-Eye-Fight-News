import datetime as dt
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
SCRIPT=Path(__file__).resolve().parents[1]/"scripts/refresh-ufcalendar-pro.py"
spec=importlib.util.spec_from_file_location("ufcalendar_pro",SCRIPT)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
def event(status="completed"):
    return {"id":123,"slug":"ufc-example","org":"ufc","sport":"mma",
            "starts_at":"2026-11-07T20:00:00Z","title":"UFC Example",
            "status":status,"venue":{"name":"Example Arena","city":"New York","country":"US"},
            "card":[{"id":98,"card_section":"main","ordering":1,"sport":"mma",
                     "fighter_a":{"name":"Athlete A"},"fighter_b":{"name":"Athlete B"},
                     "status":"completed" if status=="completed" else "announced",
                     "scheduled_rounds":5,"is_main":True,"is_title":False,"weight_class":"Lightweight"},
                    {"id":99,"card_section":"prelims","sport":"mma","status":"cancelled",
                     "fighter_a":{"name":"X"},"fighter_b":{"name":"Y"}}]}
def stats():
    return {"data":[{"round":1,"corner":"a","sig_strikes_landed":21,"sig_strikes_attempted":41,
                     "control_time_sec":90,"takedowns_landed":0},
                    {"round":1,"corner":"b","sig_strikes_landed":11,"sig_strikes_attempted":31}]}
class ProTests(unittest.TestCase):
    def test_event_summary_preserves_main_order_and_cancellation(self):
        e=m.event_summary(event())
        self.assertEqual(e["date"],"2026-11-07")
        self.assertEqual(len(e["bouts"]),1)
        self.assertEqual(e["bouts"][0]["section"],"main")
        self.assertTrue(e["bouts"][0]["isMain"])
        self.assertEqual(e["bouts"][0]["fighters"],["Athlete A","Athlete B"])
    def test_round_stats_keep_attempts_and_missing_as_null(self):
        a=m.reduce_rounds(stats(),98)
        self.assertEqual(a[0]["a"]["sigAttempted"],41)
        self.assertEqual(a[0]["a"]["takedowns"],0)
        self.assertNotIn("controlSec",a[0]["b"])
    def test_free_plan_rejects_backfill(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)
            with patch.object(m,"LEDGER",path/"ledger.json"),patch.object(m,"ROUNDS",path/"rounds.json"),patch.object(m,"CARDS",path/"cards.json"),patch.dict("os.environ",{"UFCALENDAR_API_KEY":"fake"}):
                calls=[]
                def fetch(route):
                    calls.append(route)
                    return {"data":{"requests_limit":100,"requests_used":0}},{}
                l,c,r=m.run(dt.date(2026,11,11),fetch,lambda _:None)
                self.assertEqual(l["status"],"needs_paid_key_or_quota")
                self.assertEqual(calls,["/usage"])
    def test_completed_collection_persists_and_does_not_rerequest(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)
            with patch.object(m,"LEDGER",path/"ledger.json"),patch.object(m,"ROUNDS",path/"rounds.json"),patch.object(m,"CARDS",path/"cards.json"),patch.dict("os.environ",{"UFCALENDAR_API_KEY":"fake"}):
                calls=[]
                def fetch(route):
                    calls.append(route)
                    if route=="/usage": return {"data":{"tier":"hobby","requests_limit":30000,"requests_used":4}},{}
                    if "status=upcoming" in route:return {"data":[{"id":444,"slug":"ufc-soon"}]},{}
                    if route=="/events/ufc-soon":return {"data":event("announced")},{ }
                    if route.startswith("/events?"):return {"data":[{"id":123,"slug":"ufc-example","starts_at":"2026-11-07T20:00:00Z"}],"meta":{"pagination":{"next_cursor":None}}},{}
                    if route=="/events/ufc-example":return {"data":event()},{}
                    if route=="/fights/98/rounds":return stats(),{}
                    self.fail("Unexpected route "+route)
                l,c,r=m.run(dt.date(2026,11,11),fetch,lambda _:None)
                self.assertEqual(l["status"],"connected")
                self.assertEqual(len(r["fights"]),1)
                self.assertEqual(len(c["events"]),2)
                first=calls.count("/fights/98/rounds")
                l,c,r=m.run(dt.date(2026,11,11),fetch,lambda _:None)
                self.assertEqual(calls.count("/fights/98/rounds"),first)
                self.assertEqual(len(r["fights"]),1)
if __name__=="__main__":unittest.main()
