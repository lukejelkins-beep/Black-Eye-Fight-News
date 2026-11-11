import datetime as dt
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

script = Path(__file__).resolve().parents[1] / "scripts/refresh-fighter-intelligence.py"
spec = importlib.util.spec_from_file_location("befn_intelligence", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def bout(ident, date="2026-10-01", winner=0, ranked=None):
    other = {"name": "Opponent Fighter"}
    if ranked:
        other.update(rankAtFight=ranked, rankAtFightSource="https://example.org/ranks")
    return {"id": ident, "eventId": "ufc-example", "event": "UFC Example",
            "date": date, "sport": "MMA", "status": "completed", "winner": winner,
            "method": "TKO", "source": "https://example.org/result", "division": "Lightweight",
            "fighters": [{"name": "Candidate Fighter"}, other]}

def data(*rows):
    return {"events": [{"id": "ufc-example", "name": "UFC Example"}], "results": list(rows)}

class ScoutingTests(unittest.TestCase):
    def test_review_without_automatic_label(self):
        row = module.assemble(data(bout("one"), bout("two")), dt.date(2026, 11, 11))
        candidate = next(x for x in row if x["name"] == "Candidate Fighter")
        self.assertEqual(candidate["recent"]["wins"], 2)
        self.assertEqual(candidate["reviewPriority"], "medium")
        self.assertNotIn("prospectTag", candidate)

    def test_dedup_and_future_and_unsettled_rejected(self):
        pending = bout("pending")
        pending["status"] = "awaiting"
        rows = module.assemble(data(bout("one"), bout("one"), bout("future", "2027-01-01"), pending),
                               dt.date(2026, 11, 11))
        self.assertEqual(rows, [])

    def test_current_rank_never_treated_as_historical(self):
        a, b = bout("one"), bout("two")
        a["fighters"][1]["rank"] = 1
        b["fighters"][1]["rank"] = 1
        rows = module.assemble(data(a, b), dt.date(2026, 11, 11))
        self.assertFalse(any("ranked" in s for row in rows for s in row["signals"]))

    def test_verifiable_historical_rank_is_a_reassessment_trigger(self):
        rows = module.assemble(data(bout("one", ranked=2), bout("two")), dt.date(2026, 11, 11))
        candidate = next(x for x in rows if x["name"] == "Candidate Fighter")
        self.assertEqual(candidate["reviewPriority"], "high")

    def test_missing_secret_and_permissions_do_not_call_external_apis(self):
        with patch.dict(os.environ, {"UFCALENDAR_API_KEY": "", "BEFN_OCTAGON_ALLOWED": "",
                                     "BEFN_UFC_STATS_ALLOWED": ""}):
            output = module.build(data(bout("one"), bout("two")), today=dt.date(2026, 11, 11),
                                  fetch=lambda *args: self.fail("No API call authorised"))
        self.assertEqual([x["status"] for x in output["sources"]],
                         ["connected", "needs_key", "pending_permission", "pending_permission"])

    def test_outage_does_not_erase_prior_verified_stats(self):
        initial = module.assemble(data(bout("one"), bout("two")), dt.date(2026, 11, 11))
        candidate = next(x for x in initial if x["name"] == "Candidate Fighter")
        candidate["stats"] = {"source": "UFCalendar", "record": "10-1-0"}
        with patch.dict(os.environ, {"UFCALENDAR_API_KEY": "", "BEFN_OCTAGON_ALLOWED": "",
                                     "BEFN_UFC_STATS_ALLOWED": ""}):
            output = module.build(data(bout("one"), bout("two")), {"fighters": initial},
                                  today=dt.date(2026, 11, 11))
        current = next(x for x in output["fighters"] if x["name"] == "Candidate Fighter")
        self.assertEqual(current["stats"]["record"], "10-1-0")

    def test_ufc_api_live_shape_verification_and_enrichment(self):
        candidate = {"id": "johnnywalker", "name": "Johnny Walker",
                     "organisation": "UFC", "stats": None}
        mcgregor = {"id": "f4c49976c75c5ab2", "name": "Conor McGregor"}
        walker = {"id": "032cc3922d871c7f", "name": "Johnny Walker"}
        calls = []
        def fake_fetch(url, key=None):
            calls.append(url)
            if url.endswith("/health"):
                return {"status": "healthy", "fighters_loaded": 4400}
            if "Conor%20McGregor" in url:
                return {"data": [mcgregor]}
            if url.endswith(mcgregor["id"]):
                return dict(mcgregor, record="22-6-0")
            if "Johnny+Walker" in url:
                return {"data": [walker]}
            if url.endswith(walker["id"]):
                return dict(walker, slpm=4.12, sapm=3.72, record="21-9-0")
            self.fail("Unexpected endpoint " + url)
        result = module.ufc_stats([candidate], fake_fetch, True)
        self.assertEqual(result["status"], "connected")
        self.assertEqual(candidate["stats"]["slpm"], 4.12)
        self.assertEqual(len(calls), 5)

    def test_ufc_api_unhealthy_does_not_fake_a_connection(self):
        result = module.ufc_stats([], lambda url, key=None: {"status": "healthy",
                                  "fighters_loaded": 0}, True)
        self.assertEqual(result["status"], "degraded")

    def test_ufcalendar_accepted_key_but_rankings_400_still_enriches_profile(self):
        from urllib.error import HTTPError
        from io import BytesIO
        candidate = {"id":"johnnywalker", "name":"Johnny Walker",
                     "organisation":"UFC", "stats":None}
        calls = []
        def fetch(url, key=None):
            calls.append(url)
            self.assertEqual(key, "test_key")
            if url.endswith("/usage"):
                return {"data":{"tier":"free","requests_used":1}}
            if url.endswith("/rankings/ufc"):
                raise HTTPError(url,400,"Bad request",{},BytesIO(b'{"error":{"code":"invalid_query"}}'))
            if "/fighters?" in url:
                return {"data":[{"name":"Johnny Walker","slug":"johnny-walker"}]}
            if url.endswith("/fighters/johnny-walker"):
                return {"data":{"name":"Johnny Walker",
                    "records":{"pro_mma":{"value":"21-9-0"}},
                    "stats":{"slpm":4.11,"td_avg":1.0}}}
            self.fail("Unexpected request "+url)
        result=module.ufcalendar([candidate],fetch,key="test_key")
        self.assertEqual(result["status"],"connected")
        self.assertIn("invalid_query",result["detail"])
        self.assertEqual(candidate["stats"]["record"],"21-9-0")
        self.assertEqual(candidate["stats"]["slpm"],4.11)
        self.assertEqual(len(calls),4)

    def test_ufcalendar_rejected_key_is_not_reported_connected(self):
        from urllib.error import HTTPError
        from io import BytesIO
        def fail(url,key=None):
            raise HTTPError(url,401,"Unauthorized",{},BytesIO(b'{"error":{"code":"invalid_api_key"}}'))
        r=module.ufcalendar([],fetch=fail,key="bad_key")
        self.assertEqual(r["status"],"authentication_unconfirmed")
        self.assertIn("HTTP 401",r["detail"])
        self.assertNotIn("bad_key",r["detail"])

    def test_avoid_fuzzy_api_merge(self):
        response = {"data": [{"name": "Candidate Fight", "id": 12}]}
        self.assertIsNone(module.exact(response, "Candidate Fighter"))

if __name__ == "__main__":
    unittest.main()
