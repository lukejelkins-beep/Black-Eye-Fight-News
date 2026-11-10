"""October 2026 ONE official results reconciliation regression tests."""
import copy
import importlib.util
import json
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("one_official",ROOT/"scripts/reconcile-one-official-october.py")
m=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)
FIXTURE=json.loads((ROOT/"data/one-official-october-2026.json").read_text(encoding="utf-8"))

def mock_archive():
    events=[]
    rows=[]
    for event in FIXTURE["events"]:
        eid="one-test-"+event["id"]
        events.append({"id":eid,"name":event["nameIncludes"],"date":event["id"],
                       "expectedBouts":len(event["rows"])+2,"partialCoverage":True})
        for i,(winner,loser,_,_,_,_,_,_) in enumerate(event["rows"]):
            # Simulate the original scraped fighter order and spurious country tags.
            name=winner
            if name=="Prajanchai Pongsuphan PK":name="Prajanchai"
            fighters=[{"name":loser},{"name":name}]
            if loser=="Arthur Evan":
                fighters[0]["photo"]="https://cdn.onefc.com/verified-evan.jpg"
                fighters[0]["photoSource"]="https://www.onefc.com/athletes/arthur-evan/"
            rows.append({"id":eid+"-"+str(i),"eventId":eid,"fighters":fighters,
                         "winner":1,"sport":"Combat sport","division":"Bantamweight",
                         "method":"Wrong archive method","section":"Main card","status":"completed"})
    eid="one-test-2026-10-30"
    rows.append({"id":eid+"-duplicate","eventId":eid,
                 "fighters":[{"name":"Ouga Akita"},{"name":"Prashanth Guda"}],
                 "winner":0,"method":"Method not published by event source",
                 "status":"completed"})
    return {"events":events,"results":rows}

class OfficialOneTests(unittest.TestCase):
    def test_fixture_count(self):
        self.assertEqual(len(FIXTURE["events"]),2)
        self.assertEqual(sum(len(x["rows"]) for x in FIXTURE["events"]),26)

    def test_aliases(self):
        self.assertEqual(m.normal("Ouga Akita"),m.normal("Oga Akita"))
        self.assertEqual(m.normal("Prajanchai"),m.normal("Prajanchai Pongsuphan PK"))
        self.assertEqual(m.normal("Akram “La Pepite” Hamidi DZA DZA"),m.normal("Akram Hamidi"))
        self.assertEqual(m.normal("YodUdon K Tongtalingchan THA THA"),m.normal("YodUdon K Tongtalingchan"))

    def test_full_card_and_sport_corrections(self):
        data=mock_archive()
        outcome=m.reconcile(data,FIXTURE)
        self.assertEqual(len(outcome),2)
        self.assertEqual(sum(x["removedDuplicates"] for x in outcome),1)
        for event in data["events"]:
            self.assertEqual(sum(row["eventId"]==event["id"] for row in data["results"]),
                             event["expectedBouts"])
            self.assertFalse(event["partialCoverage"])
        oct30=[x for x in data["results"] if x["eventId"]=="one-test-2026-10-30"]
        combat=next(x for x in oct30 if x["fighters"][0]["name"]=="Pedro Duarte")
        self.assertEqual(combat["sport"],"MMA")
        self.assertEqual(combat["division"],"Featherweight MMA")
        self.assertEqual(combat["method"],"TKO")
        self.assertEqual(combat["round"],1)
        self.assertEqual(combat["time"],"2:33")
        self.assertEqual(sum(any("Oga Akita" in f["name"] for f in x["fighters"]) for x in oct30),1)

    def test_preserve_exact_fighter_photo_and_avoid_inventing_round(self):
        data=mock_archive()
        m.reconcile(data,FIXTURE)
        fight=next(row for row in data["results"]
                   if row["eventId"]=="one-test-2026-10-30"
                   and row["fighters"][1]["name"]=="Arthur Evan")
        self.assertEqual(fight["fighters"][1]["photoSource"],"https://www.onefc.com/athletes/arthur-evan/")
        decision=next(row for row in data["results"] if row["eventId"]=="one-test-2026-10-30"
                      and row["fighters"][0]["name"]=="Ranma")
        self.assertIsNone(decision["round"])
        self.assertIsNone(decision["time"])

    def test_duplicate_import_id_does_not_remove_verified_survivor(self):
        # A source nickname can yield a second object with the same bout ID.
        # Only the duplicate object may be removed, not the verified winner.
        data=mock_archive()
        oct30=[r for r in data["results"] if r["eventId"]=="one-test-2026-10-30"]
        canonical=next(r for r in oct30 if any(f["name"]=="Prashanth Guda" for f in r["fighters"])
                       and not r["id"].endswith("-duplicate"))
        duplicate=next(r for r in oct30 if r["id"].endswith("-duplicate"))
        duplicate["id"]=canonical["id"]
        m.reconcile(data,FIXTURE)
        retained=[r for r in data["results"] if r["eventId"]=="one-test-2026-10-30"]
        self.assertEqual(len(retained),12)
        self.assertEqual(sum(r["id"]==canonical["id"] for r in retained),1)
        self.assertEqual(next(r for r in retained if r["id"]==canonical["id"])["winner"],0)

    def test_idempotent_no_missing_fights_added(self):
        data=mock_archive()
        m.reconcile(data,FIXTURE)
        count=len(data["results"])
        m.reconcile(data,FIXTURE)
        self.assertEqual(len(data["results"]),count)

    def test_fail_closed_on_unknown_bout(self):
        data=mock_archive()
        data["results"].append({"id":"unexpected","eventId":"one-test-2026-10-16",
                                "fighters":[{"name":"Unknown Alpha"},{"name":"Unknown Beta"}]})
        with self.assertRaises(ValueError):
            m.reconcile(data,FIXTURE)

if __name__=="__main__":
    unittest.main()
