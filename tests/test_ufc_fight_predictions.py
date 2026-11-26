"""Tests for scripts/build-ufc-fight-predictions.py and the committed prediction files (26 Nov 2026)."""
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("ufc_fight_predictions", ROOT / "scripts/build-ufc-fight-predictions.py")
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)
PRED = json.loads((ROOT / "data/ufc-fight-predictions.json").read_text())
MODEL = json.loads((ROOT / "data/ufc-prediction-model.json").read_text())
STATS = json.loads((ROOT / "data/ufc-stats/index.json").read_text())


class Reconcile(unittest.TestCase):
    def test_six_outcomes_add_up_and_finish_total_is_the_finish_models(self):
        cells = gen.reconcile(0.35, [0.36, 0.11, 0.53], [0.43, 0.07, 0.50], 0.42)
        self.assertAlmostEqual(sum(cells.values()), 1.0, places=9)
        self.assertAlmostEqual(sum(v for (s, c), v in cells.items() if c != "dec"), 0.42, places=9)

    def test_winner_probability_is_unchanged_by_it(self):
        cells = gen.reconcile(0.35, [0.36, 0.11, 0.53], [0.43, 0.07, 0.50], 0.60)
        # the two sides' totals move only through the finish/decision rescale, so the favourite stays the favourite
        a = sum(v for (s, c), v in cells.items() if s == "a")
        self.assertLess(a, 0.5)

    def test_title_marker(self):
        self.assertTrue(gen.is_title({"division": "Lightweight", "note": "BMF title"}))
        self.assertTrue(gen.is_title({"division": "Flyweight", "note": "Interim title · card placement TBC"}))
        self.assertFalse(gen.is_title({"division": "Middleweight", "note": ""}))


class Committed(unittest.TestCase):
    def test_built_from_the_current_stats_and_model(self):
        self.assertEqual(PRED["statsAsOf"], STATS["asOf"])
        self.assertEqual(PRED["modelStatsAsOf"], MODEL["statsAsOf"])

    def test_every_predicted_bout_is_internally_consistent(self):
        n = 0
        for e in PRED["events"]:
            for b in e["bouts"]:
                if b["status"] != "ok":
                    self.assertTrue(b.get("reason"))
                    continue
                n += 1
                self.assertIn(b["pool"], ("men", "women"))
                self.assertAlmostEqual(sum(b["winProbability"]), 1.0, places=3)
                self.assertAlmostEqual(sum(b["outcomes"].values()), 1.0, delta=0.002)
                fin = sum(v for k, v in b["outcomes"].items() if not k.endswith("dec"))
                self.assertAlmostEqual(fin, b["finishProbability"], delta=0.002)
                a = sum(v for k, v in b["outcomes"].items() if k.startswith("a-"))
                self.assertAlmostEqual(a, b["winProbability"][0], delta=0.03)
                self.assertEqual(len(b["details"]), 2)
                self.assertEqual(b["confidence"] == "low", bool(b["lowConfidenceFor"]))
        self.assertGreater(n, 0)

    def test_model_file_has_a_record_for_each_pool(self):
        for pool in ("men", "women"):
            w = MODEL["winner"][pool]
            self.assertGreater(w["k"], 0)
            self.assertGreater(w["bouts"], 100)
            self.assertLess(w["brier"], 0.25)          # better than a coin flip
        self.assertGreater(MODEL["method"]["logLossGain"], 0)


if __name__ == "__main__":
    unittest.main()


class Log(unittest.TestCase):
    """scripts/update-ufc-prediction-log.py: frozen before the fight, scored after, never rewritten."""

    @classmethod
    def setUpClass(cls):
        s = importlib.util.spec_from_file_location("ufc_prediction_log", ROOT / "scripts/update-ufc-prediction-log.py")
        cls.log = importlib.util.module_from_spec(s)
        s.loader.exec_module(cls.log)

    def preds(self, p=0.35):
        bout = {"id": "b1", "status": "ok", "pool": "men", "fighters": [{"name": "Israel Adesanya"}, {"name": "Shara Magomedov"}],
                "winProbability": [p, round(1 - p, 4)], "finishProbability": 0.42, "confidence": "normal"}
        return {"statsAsOf": "2026-11-21", "events": [{"id": "ev1", "title": "T", "date": "2026-12-05", "bouts": [bout]},
                                                      {"id": "ev0", "title": "Today", "date": "2026-11-26", "bouts": [dict(bout, id="b9")]}]}

    def result(self, winner_first):
        names = ["Shara Magomedov", "Israel Adesanya"]          # result lists them in the other order
        return {"results": [{"sport": "MMA", "status": "completed", "eventId": "ev1", "date": "2026-12-05", "winner": 0 if winner_first else 1,
                             "method": "TKO (punches)", "round": 2, "fighters": [{"name": n} for n in names]}]}

    def test_logs_future_cards_only_and_once(self):
        log = self.log.update({}, self.preds(), {"results": []}, "2026-11-26")
        self.assertEqual([e["eventId"] for e in log["entries"]], ["ev1"])      # a card dated today is not logged
        again = self.log.update(log, self.preds(0.9), {"results": []}, "2026-11-27")
        self.assertEqual(len(again["entries"]), 1)
        self.assertEqual(again["entries"][0]["winProbability"][0], 0.35)       # frozen: a later prediction changes nothing
        self.assertEqual(again["since"], "2026-11-26")

    def test_scores_by_names_whatever_the_order(self):
        log = self.log.update({}, self.preds(), {"results": []}, "2026-11-26")
        log = self.log.update(log, self.preds(), self.result(True), "2026-12-06")
        r = log["entries"][0]["result"]
        self.assertEqual((r["winner"], r["method"], r["round"]), (1, "ko", 2))   # Magomedov is index 1 in the logged order

    def test_draw_is_recorded_not_scored(self):
        log = self.log.update({}, self.preds(), {"results": []}, "2026-11-26")
        res = self.result(True); res["results"][0].update(winner=None, method="draw")
        log = self.log.update(log, self.preds(), res, "2026-12-06")
        self.assertEqual(log["entries"][0]["result"]["winner"], None)
        self.assertEqual(log["entries"][0]["result"]["method"], "other")

    def test_committed_log_is_well_formed(self):
        log = json.loads((ROOT / "data/ufc-prediction-log.json").read_text())
        keys = [e["key"] for e in log["entries"]]
        self.assertEqual(len(keys), len(set(keys)))
        for e in log["entries"]:
            self.assertLess(e["loggedOn"], e["date"])                          # always saved before the card's day
