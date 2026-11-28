"""Build ../../data/ufc-gym-analysis.json from the gym_table_*.csv files and the figures printed by analyse.py.

Run from this folder after analyse.py has been run for 2025, 2026 and both together.
"""
import csv, json, math, pathlib

HERE = pathlib.Path(__file__).parent
read = lambda n: {r["gym"]: r for r in csv.DictReader(open(HERE / n))}
POOL, S25, S26 = read("gym_table_2025_2026.csv"), read("gym_table_2025.csv"), read("gym_table_2026.csv")
CHART_MIN, TEST_MIN = 20, 12


def row(r):
    return {"gym": r["gym"], "bouts": int(r["bouts"]), "wins": int(r["wins"]), "losses": int(r["losses"]), "winPct": int(r["win_pct"]),
            "expectedWins": float(r["expected_wins"]), "winsAboveExpected": float(r["wins_above_expected"]) + 0.0, "z": float(r["z"])}


def season(T, g):
    t = T.get(g)
    return {"wins": int(t["wins"]), "losses": int(t["losses"]), "winsAboveExpected": float(t["wins_above_expected"]) + 0.0} if t else None


all_gyms = [row(r) for r in POOL.values()]
chart = [dict(row(r), seasons={"2025": season(S25, g), "2026": season(S26, g)}) for g, r in POOL.items() if int(r["bouts"]) >= CHART_MIN]
tested = [g for g in all_gyms if g["bouts"] >= TEST_MIN]
ck = next(g for g in all_gyms if g["gym"] == "City Kickboxing")
p_one = math.erfc(abs(ck["z"]) / math.sqrt(2))
out = {
    "schema": 2, "asOf": "2026-11-28",
    "source": "Sherdog event and fighter pages, used with Sherdog's permission",
    "seasons": [{"label": "2025", "events": 48, "decidedBouts": 544}, {"label": "2026", "through": "2026-11-21", "events": 44, "decidedBouts": 540}],
    "events": 92, "decidedBouts": 1084, "winnerPickedPct": 59.6,
    "chartMinBouts": CHART_MIN, "testMinBouts": TEST_MIN, "gymsCompared": len(tested),
    "permutation": {"runs": 2000, "observedMeanZ2": 1.36, "shuffledMeanZ2": 1.05, "p": 0.139},
    "cityKickboxingChanceOfAnyGym": round(1 - (1 - p_one) ** len(tested), 2),
    "gyms": sorted(chart, key=lambda g: -g["winsAboveExpected"]),
    "allGyms": all_gyms,
}
path = HERE.parents[1] / "data" / "ufc-gym-analysis.json"
path.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print(len(chart), "chart gyms;", len(tested), "tested; chance for any gym", out["cityKickboxingChanceOfAnyGym"])
