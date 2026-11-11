import datetime as dt
import importlib.util
import json
import os
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from io import BytesIO

FILE = Path(__file__).resolve().parents[1] / "scripts/refresh-ufcalendar-budget.py"
spec = importlib.util.spec_from_file_location("ufcalendar_budget", FILE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def athlete(name, slug, ident):
    return {"name": name, "slug": slug, "id": ident}

def fight(ident, day="2026-11-07"):
    return {"id": ident, "sport": "mma", "status": "completed",
        "division_slug": "lightweight", "is_main": True, "is_title": False,
        "fighter_a": athlete("Example Prospect", "example-prospect", 1),
        "fighter_b": athlete("Experienced Veteran", "experienced-veteran", 2),
        "event": {"id": 19, "title": "UFC Example", "org": "ufc",
                  "starts_at": day + "T01:00:00Z"}}

def round_data():
    def line(number, corner, landed, kd):
        return {"round": number, "corner": corner, "sig_strikes_landed": landed,
                "takedowns_landed": 2 if corner == "a" else 0,
                "knockdowns": kd, "control_time_sec": 80 if corner == "a" else None}
    return {"data": [line(1, "a", 18, 1), line(1, "b", 13, 0),
                     line(2, "a", 11, 0), line(2, "b", 20, 0)], "meta": {"fight_id": 44}}

class BudgetTests(unittest.TestCase):
    def test_allocations_sum_to_100_and_hold_reserve(self):
        self.assertEqual(sum(m.BUDGET.values()), 100)
        self.assertEqual(m.BUDGET["reserve"], 12)
        self.assertEqual(m.week_fraction(dt.date(2026, 11, 11)), (2, 5))

    def test_no_data_call_when_external_quota_nearly_exhausted(self):
        ledger = m.new_ledger(dt.date(2026, 11, 11))
        routes = []
        def fetch(route):
            routes.append(route)
            return {"data": {"requests_used": 96, "requests_limit": 100}}
        cli = m.BudgetClient("test_token", ledger, dt.date(2026, 11, 11), fetch)
        self.assertTrue(cli.bootstrap())
        self.assertEqual(cli.allowance("rounds"), 0)
        self.assertIsNone(cli.call("rounds", 44, "/fights/44/rounds"))
        self.assertEqual(routes, ["/usage"])
        self.assertEqual(ledger["status"], "budget_exhausted")

    def test_missing_key_never_calls_provider(self):
        cli = m.BudgetClient("", m.new_ledger(dt.date(2026, 11, 11)),
                             dt.date(2026, 11, 11),
                             lambda route: self.fail("No request should be sent"))
        self.assertFalse(cli.bootstrap())
        self.assertEqual(cli.ledger["status"], "needs_key")

    def test_round_stats_keep_both_corners_and_missing_not_zero(self):
        item = m.candidate_from_fight(fight(44), dt.date(2026, 11, 11),
                                       {m.norm("Example Prospect"): 5})
        data = m.collect_rounds(round_data(), item)
        self.assertEqual(data["roundsAvailable"], 2)
        self.assertEqual(data["rounds"][0]["a"]["sigLanded"], 18)
        self.assertEqual(data["rounds"][0]["a"]["sigAbsorbed"], 13)
        self.assertEqual(data["rounds"][0]["a"]["sigDifferential"], 5)
        self.assertEqual(data["rounds"][0]["b"]["sigDifferential"], -5)
        self.assertEqual(data["rounds"][0]["b"]["controlSec"], None)
        self.assertEqual(data["rounds"][0]["b"]["knockdowns"], 0)
        self.assertIsNone(m.collect_rounds({"data": []}, item))

    def test_candidate_rejects_future_and_non_mma(self):
        now = dt.date(2026, 11, 11)
        self.assertIsNone(m.candidate_from_fight(fight(44, "2026-12-01"), now, {}))
        x = fight(44)
        x["sport"] = "bare-knuckle-boxing"
        self.assertIsNone(m.candidate_from_fight(x, now, {}))

    def test_non_decreasing_monthly_spend_and_cache_no_duplicates(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            with patch.object(m, "OUT", path / "ufcalendar-intelligence.json"), \
                 patch.object(m, "LEDGER", path / "ufcalendar-budget.json"), \
                 patch.object(m, "SCOUT", path / "fighter-intelligence.json"), \
                 patch.dict(os.environ, {"UFCALENDAR_API_KEY": "safe_test_token"}):
                m.save(path / "fighter-intelligence.json", {
                    "sources": [], "fighters": [{
                        "name": "Example Prospect", "organisation": "UFC",
                        "reviewPriority": "high"}]})
                calls = []
                def fetch(route):
                    calls.append(route)
                    if route == "/usage":
                        return {"data": {"tier": "free", "requests_used": 7,
                                          "requests_limit": 100,
                                          "reset_at": "2026-12-01T00:00:00Z"}}
                    if route.startswith("/fights/search?"):
                        return {"data": [fight(44)], "meta": {"pagination":{}}}
                    if route == "/fights/44/rounds":
                        return round_data()
                    if route.startswith("/compare?"):
                        return {"data":{"common_opponents":[],"head_to_head":[],
                            "aggregates":{"a":{"avg_sig_strikes":45.2},"b":{}}}}
                    if route.endswith("/history"):
                        return {"data":[{"status":"win", "date":"2026-11-07",
                                         "opponent":{"name":"Another Fighter"},
                                         "method":"Decision", "org_slug":"ufc"}]}
                    if route == "/orgs/ufc/divisions/lightweight":
                        return {"data":{"rankings":{"snapshot_date":"2026-11-10",
                            "entries":[{"rank":1}]}, "upcoming":[], "recent":[{}], "roster":[{},{}]}}
                    if route == "/events/19":
                        return {"data":{"id":19,"title":"UFC Example",
                                         "org":"ufc","starts_at":"2026-11-07T01:00:00Z",
                                         "card":[{"status":"completed"}]}}
                    self.fail("Unexpected API call " + route)
                ledger, saved = m.run(dt.date(2026, 11, 11), fetch)
                self.assertEqual(ledger["status"], "connected")
                self.assertEqual(ledger["spent"]["discovery"], 1)
                self.assertEqual(len(saved["fights"]), 1)
                self.assertEqual(len(saved["comparisons"]), 1)
                self.assertEqual(len(saved["histories"]), 2)
                self.assertEqual(len(saved["divisions"]), 1)
                self.assertEqual(len(saved["events"]), 1)
                self.assertEqual(saved["fights"]["44"]["rounds"][0]["a"]["sigAbsorbed"], 13)
                cached = m.read(m.SCOUT, {})
                self.assertEqual(cached["fighters"][0]["roundByRoundEvidence"]["bouts"], 1)
                self.assertNotIn("safe_test_token", m.OUT.read_text() + m.LEDGER.read_text())
                first_calls = len(calls)
                second, again = m.run(dt.date(2026, 11, 11), fetch)
                self.assertEqual(len(calls), first_calls + 1)
                self.assertEqual(again["fights"], saved["fights"])
                self.assertEqual(second["spent"]["discovery"], 1)

    def test_errors_spend_budget_without_exposing_credentials(self):
        ledger=m.new_ledger(dt.date(2026,11,11))
        def fetch(route):
            if route == "/usage":
                return {"data":{"requests_used":3,"requests_limit":100}}
            raise HTTPError(m.BASE+route,404,"Missing",{},BytesIO(b"secret_payload"))
        cli=m.BudgetClient("private_key",ledger,dt.date(2026,11,11),fetch)
        self.assertTrue(cli.bootstrap())
        self.assertIsNone(cli.call("discovery","week2","/fights/search?from=2026-11-01"))
        self.assertEqual(ledger["spent"]["discovery"],1)
        self.assertIn("week2",ledger["attempted"]["discovery"])
        self.assertNotIn("private_key",json.dumps(ledger))
        self.assertNotIn("secret_payload",json.dumps(ledger))

    def test_new_month_resets_request_budgets_not_historical_data(self):
        old=m.new_ledger(dt.date(2026,11,11))
        old["spent"]["rounds"]=42
        newer=m.ledger_for(old,dt.date(2026,12,1))
        self.assertEqual(newer["spent"]["rounds"],0)
        self.assertEqual(newer["month"],"2026-12")

if __name__ == "__main__":
    unittest.main()
