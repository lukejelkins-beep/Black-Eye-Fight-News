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

if __name__=="__main__":
    unittest.main()
