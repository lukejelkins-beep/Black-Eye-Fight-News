import importlib.util
import unittest
from copy import deepcopy
from datetime import date
from pathlib import Path

SRC=Path(__file__).resolve().parents[1]/"scripts"/"refresh-grappling-calendar.py"
spec=importlib.util.spec_from_file_location("grappling_calendar",SRC)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
TODAY=date(2026,11,12)

class GrapplingCalendarTests(unittest.TestCase):
 def setUp(self):
  self.current={"reviewedAt":"2026-11-09","events":[{
   "id":"raf15","date":"2026-11-28","source":mod.SOURCES["RAF"],
   "name":"RAF15","status":"CONFIRMED","discipline":"RAF","competitors":"Cejudo vs Song"}]}
 def raf(self):
  return "<html><p>RAF15 Cejudo vs Song Nov 28, 2026 Chicago, IL BUY tickets</p><p>RAF18 New event Feb 22, 2027 Location TBC</p></html>"
 def test_new_official_numbered_raf_event_added_once(self):
  found=mod.extract_raf(self.raf(),TODAY)
  self.assertEqual(set(found),{"raf15","raf18"})
  pages={mod.SOURCES["RAF"]:self.raf()}
  audit=mod.reconcile(self.current,pages,TODAY)
  self.assertEqual(audit["added"],["raf18"])
  self.assertEqual(len(self.current["events"]),2)
  self.assertEqual(self.current["events"][1]["competitors"],"Matchups not yet independently verified")
  audit=mod.reconcile(self.current,pages,TODAY)
  self.assertFalse(audit["added"])
 def test_conflicting_dates_flagged_but_not_overwritten(self):
  audit=mod.reconcile(self.current,{mod.SOURCES["RAF"]:
   "<html>RAF15 Cejudo vs Song Dec 5, 2026 Chicago, IL</html>"},TODAY)
  self.assertEqual(self.current["events"][0]["date"],"2026-11-28")
  self.assertEqual(audit["potentialChanges"][0]["organiserDate"],"2026-12-05")
 def test_dead_pages_do_not_cancel_ongoing_events(self):
  before=deepcopy(self.current)
  audit=mod.reconcile(self.current,{},TODAY)
  self.assertEqual(self.current,before)
  self.assertGreater(len(audit["errors"]),0)
 def test_no_unsourced_competitors_or_random_dates(self):
  page="<html><p>RAF19 opponents announced soon</p><p>Nov 24, 2026</p></html>"
  self.assertEqual(mod.extract_raf(page,TODAY),{})
 def test_trust_and_unsafe_urls(self):
  self.assertTrue(mod.trusted("https://www.ufc.com/ufcbjj"))
  self.assertFalse(mod.trusted("http://ibjjf.com/events"))
  self.assertFalse(mod.trusted("https://realamericanfreestyle.com.evil.net/a"))
  self.assertFalse(mod.trusted("https://user@ufc.com/ufcbjj"))
 def test_current_calendar_retains_stable_ids_and_sources(self):
  import json
  payload=json.loads((SRC.parents[1]/"data"/"grappling-events.json").read_text(encoding="utf-8"))
  checked=mod.reconcile(payload,{},TODAY)
  self.assertEqual(len(payload["events"]),len({e["id"] for e in payload["events"]}))
  self.assertGreaterEqual(len(checked["sourceChecks"]),6)

if __name__=="__main__":unittest.main()
