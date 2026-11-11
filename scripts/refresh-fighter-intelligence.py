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

def _api_error(exc):
    """Safe diagnostics: never print response headers, raw body or API key."""
    code = getattr(exc, "code", None)
    if code is not None:
        detail = "HTTP " + str(code)
        try:
            payload = json.loads(exc.read(1024).decode("utf-8", "replace"))
            api_code = (payload.get("error") or {}).get("code") if isinstance(payload.get("error"), dict) else payload.get("code")
            if isinstance(api_code, str) and re.fullmatch(r"[a-zA-Z0-9_-]{1,50}", api_code):
                detail += " (" + api_code + ")"
        except Exception:
            pass
        return detail
    reason = getattr(exc, "reason", None)
    if isinstance(reason, OSError) and getattr(reason, "errno", None) in (-2, -3, 11001):
        return "DNS resolution failed"
    return type(exc).__name__


def ufcalendar(queue, fetch=fetch_json, key=None):
    """Validate API-key access separately from optional rankings and fighter searches."""
    if os.environ.get("BEFN_UFCALENDAR_MANAGED") == "true":
        return status("UFCalendar", "managed",
                      "Quota-aware monthly job replaces legacy weekly fighter polling.")
    key = key if key is not None else os.environ.get("UFCALENDAR_API_KEY")
    if not key:
        return status("UFCalendar", "needs_key", "Set UFCALENDAR_API_KEY GitHub Actions secret.")

    # First verify a public no-key endpoint from the same GitHub runner.
    # A failure here cannot be solved by rotating the user's API key.
    try:
        plans = fetch(UFCALENDAR + "/plans")
        if not isinstance(plans, dict):
            raise ValueError("Unexpected plans payload")
    except Exception as exc:
        return status("UFCalendar", "public_endpoint_unavailable",
                      "Public /plans endpoint failed without authentication: " +
                      _api_error(exc) + ". Do not rotate the API key; inspect DNS, proxy and API hosting.")

    # Check authentication/quota on a documented endpoint before trying
    # content endpoints. This distinguishes a rejected key from an endpoint bug.
    try:
        usage = fetch(UFCALENDAR + "/usage", key)
        if not isinstance(usage, dict):
            raise ValueError("Unexpected usage response")
    except Exception as exc:
        return status("UFCalendar", "authentication_unconfirmed",
                      "Key provided, but /usage request failed: " + _api_error(exc) +
                      ". Confirm the key is a production API key on the UFCalendar account page.")

    try:
        board = fetch(UFCALENDAR + "/rankings/ufc", key)
        rank_note = "Rankings request succeeded" if (
            isinstance(board, dict) and isinstance(board.get("data"), dict)
        ) else "Rankings response format not recognized"
    except Exception as exc:
        rank_note = "Rankings request failed: " + _api_error(exc)

    matched = 0
    failures = 0
    for item in [f for f in queue if f["organisation"] == "UFC"][:3]:
        try:
            query = urllib.parse.urlencode({"q": item["name"], "org": "ufc", "limit": 5})
            fighter = exact(fetch(UFCALENDAR + "/fighters?" + query, key), item["name"])
            ident = (fighter or {}).get("slug") or (fighter or {}).get("id")
            if not isinstance(ident, (str, int)) or not re.fullmatch(r"[A-Za-z0-9_-]+", str(ident)):
                continue
            payload = fetch(UFCALENDAR + "/fighters/" + str(ident), key)
            bio = payload.get("data", {}) if isinstance(payload, dict) else {}
            if not isinstance(bio, dict) or norm(bio.get("name")) != norm(item["name"]):
                continue
            records = bio.get("records") or {}
            pro = records.get("pro_mma") if isinstance(records, dict) else {}
            stats = bio.get("stats") if isinstance(bio.get("stats"), dict) else {}
            item["stats"] = {
                "source": "UFCalendar",
                "record": pro.get("value") if isinstance(pro, dict) and isinstance(pro.get("value"), str) else None,
                "slpm": safe_number(stats.get("slpm")),
                "sapm": safe_number(stats.get("sapm")),
                "strAcc": safe_number(stats.get("str_acc")),
                "strDef": safe_number(stats.get("str_def")),
                "tdAvg": safe_number(stats.get("td_avg")),
                "tdAcc": safe_number(stats.get("td_acc")),
                "tdDef": safe_number(stats.get("td_def")),
                "subAvg": safe_number(stats.get("sub_avg")),
                "observedOn": dt.date.today().isoformat()
            }
            matched += 1
        except Exception:
            failures += 1
            continue
    state = "connected" if matched else "reachable"
    return status("UFCalendar", state,
                  "Authenticated /usage request succeeded. " + rank_note + ". " +
                  str(matched) + " of " + str(min(3, sum(x["organisation"] == "UFC" for x in queue))) +
                  " precise fighter profiles enriched; " + str(failures) +
                  " request errors. Maximum nine requests per weekly run.")

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
    """Verify the hosted API and enrich up to two matched UFC profiles.

    The provider allows personal/noncommercial use and limits traffic per IP;
    the weekly job makes at most seven calls (health, known-list and
    known-detail checks plus two list/detail pairs).
    """
    if not allowed:
        return status("UFC Stats API", "pending_permission",
                      "Non-commercial use must be confirmed before enabling.")
    try:
        health = fetch(UFC_STATS + "/health")
        if (not isinstance(health, dict) or health.get("status") != "healthy"
                or int(health.get("fighters_loaded") or 0) < 1):
            return status("UFC Stats API", "degraded",
                          "Health endpoint did not confirm loaded fighter data.")
        # Validate the actual search and detail responses rather than assuming
        # a 200 from /health means useful fighter statistics are available.
        known = exact(fetch(UFC_STATS + "/api/fighters?search=Conor%20McGregor&limit=5"),
                      "Conor McGregor")
        known_id = (known or {}).get("id")
        if not isinstance(known_id, str) or not re.fullmatch(r"[a-f0-9]{16}", known_id):
            return status("UFC Stats API", "degraded",
                          "Health OK but known fighter search failed validation.")
        known_detail = fetch(UFC_STATS + "/api/fighters/" + known_id)
        if (not isinstance(known_detail, dict)
                or norm(known_detail.get("name")) != norm("Conor McGregor")):
            return status("UFC Stats API", "degraded",
                          "Health and search OK but fighter-detail validation failed.")
    except Exception as exc:
        http_code = getattr(exc, "code", None)
        reason = ("HTTP " + str(http_code)) if http_code else type(exc).__name__
        return status("UFC Stats API", "unavailable",
                      "Endpoint connectivity or data verification failed (" + reason + ").")

    matched = 0
    # Give a known established fighter precedence when present; other UFC
    # candidates are attempted in their scouting-review priority order.
    candidates = [f for f in queue if f["organisation"] == "UFC"]
    candidates.sort(key=lambda f: f["name"] != "Johnny Walker")
    for item in candidates[:2]:
        try:
            query = urllib.parse.urlencode({"search": item["name"], "limit": 5})
            found = exact(fetch(UFC_STATS + "/api/fighters?" + query), item["name"])
            ident = (found or {}).get("id")
            if not isinstance(ident, str) or not re.fullmatch(r"[a-f0-9]{16}", ident):
                continue
            profile = fetch(UFC_STATS + "/api/fighters/" + ident)
            if not isinstance(profile, dict) or norm(profile.get("name")) != item["id"]:
                continue
            record = profile.get("record")
            item["stats"] = {
                "source": "UFC Stats API",
                "record": record if isinstance(record, str) and len(record) <= 24 else None,
                "slpm": safe_number(profile.get("slpm")),
                "sapm": safe_number(profile.get("sapm")),
                "strAcc": safe_number(profile.get("str_acc")),
                "strDef": safe_number(profile.get("str_def")),
                "tdAvg": safe_number(profile.get("td_avg")),
                "tdAcc": safe_number(profile.get("td_acc")),
                "tdDef": safe_number(profile.get("td_def")),
                "subAvg": safe_number(profile.get("sub_avg")),
                "observedOn": dt.date.today().isoformat()
            }
            matched += 1
        except Exception:
            continue
    return status("UFC Stats API", "connected",
                  "Health, search and fighter-detail calls verified; " +
                  str(matched) + " of " + str(min(2, len(candidates))) +
                  " review profiles matched. Max seven calls per weekly run.")

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
