#!/usr/bin/env python3
"""Derived BEFN fighter review data; never publish raw external API datasets."""
import datetime as dt
import json
import os
import re
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/fighter-intelligence.json"
UFCALENDAR = "https://api.ufcalendar.com/v1"
OCTAGON = "https://api.octagon-api.com"
UFC_STATS = "https://ufcapi.aristotle.me"

def norm(value):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", str(value or ""))
                  .encode("ascii", "ignore").decode().lower())

def fetch_json(url, key=None):
    headers = {"Accept": "application/json", "User-Agent": "BEFN-Scouting/1.0"}
    if key:
        headers["Authorization"] = "Bearer " + key
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)

def status(name, state, detail):
    return {"provider": name, "status": state, "detail": detail}

def organisation(row, events):
    name = " ".join(str(x or "") for x in [
        row.get("eventId"), row.get("event"),
        events.get(row.get("eventId"), {}).get("name"),
        events.get(row.get("eventId"), {}).get("promotion")]).lower()
    for org in ("UFC", "PFL", "ONE"):
        if re.search(r"\b" + org.lower() + r"\b", name):
            return org
    return None

def assemble(dataset, today=None):
    """Use settled, sourced MMA fights only. No unsupported rankings or fake labels."""
    today = today or dt.date.today()
    events = {e.get("id"): e for e in dataset.get("events", []) if isinstance(e, dict)}
    per_fighter = defaultdict(list)
    seen = set()
    for row in dataset.get("results", []):
        if not isinstance(row, dict) or row.get("sport") != "MMA" or row.get("status") != "completed":
            continue
        org = organisation(row, events)
        pair = row.get("fighters") or []
        winner = row.get("winner")
        if org is None or len(pair) != 2 or type(winner) is not int or winner not in (0, 1):
            continue
        if not all(isinstance(f, dict) and norm(f.get("name")) for f in pair):
            continue
        try:
            date = dt.date.fromisoformat(row["date"])
        except (ValueError, TypeError, KeyError):
            continue
        if date > today:
            continue
        bout = str(row.get("id") or (row.get("eventId", "") + ":" +
                   ":".join(sorted(norm(f["name"]) for f in pair))))
        if bout in seen:
            continue
        seen.add(bout)
        for corner, fighter in enumerate(pair):
            opponent = pair[1-corner]
            outcome = "W" if corner == winner else "L"
            rank = opponent.get("rankAtFight")
            ranked = (outcome == "W" and type(rank) is int and 1 <= rank <= 15
                      and str(opponent.get("rankAtFightSource", "")).startswith("https://"))
            stoppage = (outcome == "W" and bool(re.search(
                r"\b(KO|TKO|submission|sub)\b", str(row.get("method") or ""), re.I)))
            per_fighter[norm(fighter["name"])].append({
                "name": fighter["name"], "date": date.isoformat(), "org": org,
                "division": str(row.get("division") or ""), "outcome": outcome,
                "opponent": opponent["name"], "stoppage": stoppage, "ranked": bool(ranked),
                "method": str(row.get("method") or "Method not listed")[:100],
                "source": row.get("source") if str(row.get("source", "")).startswith("https://") else None,
                "bout": bout
            })
    queue = []
    for identity, history in per_fighter.items():
        history.sort(key=lambda b: (b["date"], b["bout"]), reverse=True)
        recent = history[:5]
        if len(recent) < 2:
            continue
        wins = sum(x["outcome"] == "W" for x in recent)
        losses = sum(x["outcome"] == "L" for x in recent)
        finishes = sum(x["stoppage"] for x in recent)
        ranked = sum(x["ranked"] for x in recent)
        priority = ("high" if ranked or (wins >= 3 and finishes >= 2)
                    else "medium" if wins >= 2 or losses >= 3 else "watch")
        signals = [str(wins) + " victories in " + str(len(recent)) + " verified appearances"]
        if finishes: signals.append(str(finishes) + " victories by stoppage")
        if ranked: signals.append(str(ranked) + " victory against a documented ranked opponent at fight time")
        if losses >= 3: signals.append("Three losses: review the existing designation")
        latest = recent[0]
        queue.append({
            "id": identity, "name": latest["name"], "organisation": latest["org"],
            "division": latest["division"], "reviewPriority": priority,
            "recommendation": ("Reassess previous designation" if losses >= 3
                else "Review for progression" if priority == "high" else "Monitor"),
            "recent": {"wins": wins, "losses": losses, "fights": len(recent),
                       "stoppages": finishes}, "signals": signals,
            "lastFight": {"date": latest["date"], "opponent": latest["opponent"],
                          "result": latest["outcome"], "method": latest["method"],
                          "source": latest["source"]},
            "ranking": None, "stats": None
        })
    priority_order = {"high": 2, "medium": 1, "watch": 0}
    queue.sort(key=lambda f: (priority_order[f["reviewPriority"]],
                             f["recent"]["wins"], f["lastFight"]["date"]), reverse=True)
    return queue[:48]

def records(payload):
    payload = payload.get("data", []) if isinstance(payload, dict) else payload
    if isinstance(payload, list): return payload
    if isinstance(payload, dict):
        for name in ("fighters", "items", "results"):
            if isinstance(payload.get(name), list): return payload[name]
    return []

def exact(items, name):
    return next((x for x in records(items) if isinstance(x, dict) and
                 norm(x.get("name")) == norm(name)), None)

def safe_number(x):
    try:
        value = float(x)
        return round(value, 2) if 0 <= value <= 100 else None
    except (TypeError, ValueError):
        return None

def ufcalendar(queue, fetch=fetch_json, key=None):
    key = key if key is not None else os.environ.get("UFCALENDAR_API_KEY")
    if not key:
        return status("UFCalendar", "needs_key", "Set UFCALENDAR_API_KEY GitHub Actions secret.")
    try:
        board = fetch(UFCALENDAR + "/rankings/ufc", key)
        if not isinstance(board, dict) or "data" not in board:
            raise ValueError("Unexpected response")
    except Exception:
        return status("UFCalendar", "unavailable", "Rankings lookup unavailable; retained existing insights.")
    matched = 0
    for item in [f for f in queue if f["organisation"] == "UFC"][:3]:
        try:
            q = urllib.parse.urlencode({"q": item["name"], "org": "ufc", "limit": 5})
            fighter = exact(fetch(UFCALENDAR + "/fighters?" + q, key), item["name"])
            ident = (fighter or {}).get("slug") or (fighter or {}).get("id")
            if not ident or not re.fullmatch(r"[A-Za-z0-9_-]+", str(ident)):
                continue
            payload = fetch(UFCALENDAR + "/fighters/" + str(ident), key)
            bio = payload.get("data", {}) if isinstance(payload, dict) else {}
            if not isinstance(bio, dict) or norm(bio.get("name")) != norm(item["name"]):
                continue
            pro = (bio.get("records") or {}).get("pro_mma") or {}
            stats = bio.get("stats") or {}
            item["stats"] = {
                "source": "UFCalendar", "record": pro.get("value") if isinstance(pro, dict) else None,
                "slpm": safe_number(stats.get("slpm")) if isinstance(stats, dict) else None,
                "tdAvg": safe_number(stats.get("td_avg")) if isinstance(stats, dict) else None,
                "observedOn": dt.date.today().isoformat()
            }
            matched += 1
        except Exception:
            continue
    return status("UFCalendar", "connected", str(matched) +
                  " UFC profiles enriched. Max 7 requests per weekly run.")

def octagon(queue, fetch=fetch_json, allowed=False):
    if not allowed:
        return status("Octagon", "pending_permission", "Enable only when data reuse terms are confirmed.")
    try:
        boards = fetch(OCTAGON + "/rankings")
        bios = fetch(OCTAGON + "/fighters")
        if not isinstance(boards, list) or not isinstance(bios, dict):
            raise ValueError("Unexpected provider response")
    except Exception:
        return status("Octagon", "unavailable", "Source unavailable; previous attributes retained.")
    matched = 0
    indexed = {norm(b.get("name")): b for b in bios.values() if isinstance(b, dict)}
    for item in queue:
        if item["organisation"] != "UFC": continue
        bio = indexed.get(item["id"])
        if bio and not item["stats"]:
            record = [bio.get(k) for k in ("wins", "losses", "draws")]
            if all(str(x).isdigit() for x in record):
                item["stats"] = {"source": "Octagon", "record": "-".join(map(str, record)),
                                 "observedOn": dt.date.today().isoformat()}
                matched += 1
        for board in boards:
            if not isinstance(board, dict) or "pound-for-pound" in str(board.get("categoryName", "")).lower():
                continue
            champ = board.get("champion") or {}
            names = [(champ.get("championName"), 0)] if isinstance(champ, dict) else []
            names += [(x.get("name"), i) for i, x in enumerate(board.get("fighters") or [], 1)
                      if isinstance(x, dict)]
            for name, rank in names:
                if norm(name) == item["id"]:
                    item["ranking"] = {"rank": rank, "division": board.get("categoryName"),
                                       "source": "Octagon", "label": "Undated provider snapshot"}
                    break
    return status("Octagon", "connected", str(matched) + " exact record matches.")

def ufc_stats(queue, fetch=fetch_json, allowed=False):
    if not allowed:
        return status("UFC Stats API", "pending_permission",
                      "Hosted data is for personal/non-commercial use; explicit approval required.")
    matched = 0
    for item in [f for f in queue if f["organisation"] == "UFC"][:2]:
        try:
            query = urllib.parse.urlencode({"search": item["name"], "limit": 5})
            match = exact(fetch(UFC_STATS + "/api/fighters?" + query), item["name"])
            ident = (match or {}).get("id")
            if not ident or not re.fullmatch(r"[a-z0-9]+", str(ident)): continue
            profile = fetch(UFC_STATS + "/api/fighters/" + ident)
            if norm(profile.get("name")) != item["id"]: continue
            item["stats"] = {"source": "UFC Stats API", "record": profile.get("record"),
                             "slpm": safe_number(profile.get("slpm")),
                             "tdAvg": safe_number(profile.get("td_avg")),
                             "observedOn": dt.date.today().isoformat()}
            matched += 1
        except Exception:
            continue
    return status("UFC Stats API", "connected" if matched else "unavailable",
                  str(matched) + " precisely matched UFC profiles.")

def build(source, previous=None, today=None, fetch=fetch_json):
    previous = previous or {}
    today = today or dt.date.today()
    queue = assemble(source, today)
    providers = [
        status("BEFN results", "connected", "Source-linked confirmed outcomes; original dataset preserved."),
        ufcalendar(queue, fetch),
        octagon(queue, fetch, os.environ.get("BEFN_OCTAGON_ALLOWED") == "true"),
        ufc_stats(queue, fetch, os.environ.get("BEFN_UFC_STATS_ALLOWED") == "true")
    ]
    old = {i.get("id"): i for i in previous.get("fighters", []) if isinstance(i, dict)}
    changes = list(previous.get("changes") or [])[-19:]
    for item in queue:
        before = old.get(item["id"], {})
        for field in ("stats", "ranking"):
            if item[field] is None and before.get(field):
                item[field] = before[field]
        if before.get("reviewPriority") and before["reviewPriority"] != item["reviewPriority"]:
            changes.append({"date": today.isoformat(), "name": item["name"],
                            "from": before["reviewPriority"], "to": item["reviewPriority"],
                            "reason": "; ".join(item["signals"][:2])})
    return {"schema": 1, "generatedOn": today.isoformat(), "scope": "UFC, PFL and ONE MMA",
            "note": "Editorial reassessment signals, not official rankings or automatic designations.",
            "sources": providers, "fighters": queue, "changes": changes[-20:]}

def main():
    dataset = json.loads((ROOT / "data/results.json").read_text(encoding="utf-8"))
    previous = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {}
    result = build(dataset, previous)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("BEFN scouting:", len(result["fighters"]), "review profiles")
    for item in result["sources"]: print(item["provider"], item["status"])

if __name__ == "__main__":
    main()
