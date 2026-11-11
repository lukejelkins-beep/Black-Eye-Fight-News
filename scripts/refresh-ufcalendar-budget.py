#!/usr/bin/env python3
"""BEFN quota-aware UFCalendar editorial intelligence updater.

No third-party raw dataset or API key is published. Request accounting always
uses the provider's authoritative monthly /usage before discretionary calls.
Existing BEFN results and the private newsletter are never modified.
"""
from __future__ import annotations
import calendar
import datetime as dt
import json
import os
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/ufcalendar-intelligence.json"
LEDGER = ROOT / "data/ufcalendar-budget.json"
SCOUT = ROOT / "data/fighter-intelligence.json"
BASE = "https://api.ufcalendar.com/v1"
CAP = 100
BUDGET = {"rounds": 48, "comparisons": 12, "histories": 12,
          "divisions": 8, "events": 4, "discovery": 4, "reserve": 12}
assert sum(BUDGET.values()) == CAP
MAX_CALLS_PER_RUN = 23   # Includes the usage call
MAX_PER_CATEGORY_PER_RUN = {"rounds": 12, "comparisons": 3, "histories": 3,
                            "divisions": 2, "events": 1, "discovery": 1}
RECENT_DAYS = 18 * 30  # Activity eligibility; older career evidence remains valid.
DIVISIONS = {"strawweight", "flyweight", "bantamweight", "featherweight",
             "lightweight", "welterweight", "middleweight", "light-heavyweight",
             "heavyweight", "womens-strawweight", "womens-flyweight",
             "womens-bantamweight", "womens-featherweight"}
METRIC = {"sig_strikes_landed": "sigLanded",
          "takedowns_landed": "takedowns", "knockdowns": "knockdowns",
          "control_time_sec": "controlSec", "submission_attempts": "subAttempts",
          "head_landed": "headStrikes", "body_landed": "bodyStrikes",
          "leg_landed": "legStrikes"}

def read(path, default):
    if not path.exists(): return default
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else default
    except (ValueError, OSError): return default

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8")

def norm(value):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", str(value or ""))
                  .encode("ascii", "ignore").decode().lower())

def int_or_none(value):
    return value if type(value) is int and value >= 0 else None

def safe_name(name):
    return str(name or "").strip()[:95]

def valid_id(value):
    return str(value) if isinstance(value, int) and value > 0 else None

def valid_slug(value):
    value = str(value or "")
    return value if re.fullmatch(r"[a-z0-9][a-z0-9-]{0,100}", value) else None

def source_value(source):
    return {"id": int_or_none(source.get("id")), "slug": valid_slug(source.get("slug")),
            "name": safe_name(source.get("name"))} if isinstance(source, dict) else None

def week_fraction(today):
    """Prorate every category across actual Mondays in the UTC calendar month."""
    y, month = today.year, today.month
    total = calendar.monthrange(y, month)[1]
    mondays = [dt.date(y, month, day) for day in range(1, total + 1)
               if dt.date(y, month, day).weekday() == 0]
    elapsed = sum(x <= today for x in mondays)
    # An explicit run before the first Monday may consume one week's allocation.
    return max(1, elapsed), len(mondays)

def new_ledger(today):
    return {"schema": 1, "month": today.strftime("%Y-%m"),
            "cap": CAP, "budget": dict(BUDGET),
            "spent": {name: 0 for name in BUDGET},
            "attempted": {name: [] for name in BUDGET},
            "provider": {}, "status": "pending", "lastRun": "",
            "failures": []}

def ledger_for(ledger, today):
    if ledger.get("month") != today.strftime("%Y-%m") or ledger.get("schema") != 1:
        return new_ledger(today)
    for name in BUDGET:
        ledger.setdefault("spent", {}).setdefault(name, 0)
        ledger.setdefault("attempted", {}).setdefault(name, [])
    return ledger

def new_insights():
    return {"schema": 1, "generatedOn": "", "source": "UFCalendar",
            "note": "Curated per-fight editorial metrics, not a third-party data feed or official rankings.",
            "candidates": {}, "fights": {}, "comparisons": {}, "histories": {},
            "divisions": {}, "events": {}}

def unpack(response):
    if not isinstance(response, dict): return None
    return response.get("data")

def collect_rounds(payload, candidate):
    """Keep chosen fight metrics for both corners; null never means zero."""
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        return None
    data = payload["data"]
    rounds = {}
    for line in data:
        if not isinstance(line, dict): continue
        round_no = line.get("round", line.get("round_number"))
        corner = line.get("corner") or {1:"a", 2:"b"}.get(line.get("fighter_position"))
        if type(round_no) is not int or round_no < 1 or round_no > 5 or corner not in ("a", "b"):
            continue
        entry = {target: int_or_none(line.get(field)) for field, target in METRIC.items()}
        rounds.setdefault(round_no, {})[corner] = entry
    if not rounds: return None
    outcome = []
    for round_no in sorted(rounds):
        pair = rounds[round_no]
        record = {"round": round_no}
        for corner in ("a", "b"):
            own = pair.get(corner)
            opponent = pair.get("b" if corner == "a" else "a")
            if own is None: continue
            record[corner] = dict(own)
            record[corner]["sigAbsorbed"] = (
                opponent.get("sigLanded") if opponent is not None else None)
            if own.get("sigLanded") is not None and opponent is not None and opponent.get("sigLanded") is not None:
                record[corner]["sigDifferential"] = own["sigLanded"] - opponent["sigLanded"]
            else: record[corner]["sigDifferential"] = None
        outcome.append(record)
    if not any("a" in x and "b" in x for x in outcome): return None
    return {"fightId": candidate["id"], "source": "UFCalendar",
            "observedOn": dt.date.today().isoformat(),
            "event": candidate["event"], "org": candidate["org"],
            "date": candidate["date"], "division": candidate.get("division"),
            "fighterA": candidate["a"], "fighterB": candidate["b"],
            "rounds": outcome, "roundsAvailable": len(outcome),
            "limitation": "Missing metrics are null; observed strikes do not determine official round winners."}

def candidate_from_fight(raw, today, focus):
    if not isinstance(raw, dict) or raw.get("status") != "completed":
        return None
    if raw.get("sport") != "mma": return None
    fight_id = valid_id(raw.get("id"))
    a, b = source_value(raw.get("fighter_a")), source_value(raw.get("fighter_b"))
    event = raw.get("event") or {}
    org = event.get("org") if isinstance(event, dict) else None
    if not fight_id or not a or not b or not a["slug"] or not b["slug"]:
        return None
    if org not in ("ufc", "pfl"):
        return None  # ONE is not currently a launch organisation.
    date = str(event.get("starts_at") or "")[:10]
    try:
        fought = dt.date.fromisoformat(date)
    except ValueError: return None
    if fought > today or fought < today - dt.timedelta(days=RECENT_DAYS):
        return None
    interest = max(focus.get(norm(a["name"]), 0), focus.get(norm(b["name"]), 0))
    score = (interest * 10 + (7 if raw.get("is_title") else 0) +
             (5 if raw.get("is_main") else 0) +
             max(0, 28 - (today - fought).days) / 7)
    return {"id": fight_id, "date": date, "event": safe_name(event.get("title")),
            "eventId": valid_id(event.get("id")), "org": org,
            "division": valid_slug(raw.get("division_slug")),
            "a": a, "b": b, "priority": round(score, 2),
            "titleFight": bool(raw.get("is_title")), "mainEvent": bool(raw.get("is_main"))}

def slim_history(payload, fighter):
    rows = unpack(payload)
    if not isinstance(rows, list): return None
    recent = []
    for x in rows:
        if not isinstance(x, dict) or x.get("status") not in ("win", "loss", "draw", "no_contest"):
            continue
        opp = x.get("opponent") if isinstance(x.get("opponent"), dict) else {}
        recent.append({"date": str(x.get("date") or "")[:10],
                       "opponent": safe_name(opp.get("name") or x.get("opponent_name")),
                       "result": x["status"], "method": safe_name(x.get("method")),
                       "org": str(x.get("org_slug") or "")[:24],
                       "isTitle": bool(x.get("is_title"))})
        if len(recent) >= 5: break
    if not recent: return None
    return {"fighter": fighter, "lastFive": recent,
            "lastReviewed": dt.date.today().isoformat(),
            "scope": "Selected published career-history entries, not the complete feed"}

def slim_comparison(payload, a, b):
    p = unpack(payload)
    if not isinstance(p, dict): return None
    common = p.get("common_opponents")
    head = p.get("head_to_head")
    aggregates = p.get("aggregates") if isinstance(p.get("aggregates"), dict) else {}
    result = {"fighterA": a, "fighterB": b,
              "commonOpponents": len(common) if isinstance(common, list) else None,
              "headToHeadBouts": len(head) if isinstance(head, list) else None,
              "observedOn": dt.date.today().isoformat(),
              "source": "UFCalendar", "note": "Comparison context; does not predict a winner."}
    for key in ("a", "b"):
        row = aggregates.get(key) if isinstance(aggregates.get(key), dict) else {}
        result[key] = {name: round(row[name], 2) if isinstance(row.get(name), (int, float)) else None
                       for name in ("avg_sig_strikes", "avg_takedowns", "avg_control_time_sec")}
    return result

def slim_division(payload, org, slug):
    obj = unpack(payload)
    if not isinstance(obj, dict): return None
    ranked = obj.get("rankings") or {}
    entries = ranked.get("entries") if isinstance(ranked, dict) else []
    return {"org": org, "division": slug, "observedOn": dt.date.today().isoformat(),
            "rankingDate": ranked.get("snapshot_date") if isinstance(ranked, dict) else None,
            "rankedCount": len(entries) if isinstance(entries, list) else None,
            "upcomingBouts": len(obj.get("upcoming") or []),
            "recentBouts": len(obj.get("recent") or []),
            "rosterCount": len(obj.get("roster") or []), "source": "UFCalendar"}

def slim_event(payload):
    obj = unpack(payload)
    if not isinstance(obj, dict) or not isinstance(obj.get("card"), list):
        return None
    card = [x for x in obj["card"] if isinstance(x, dict) and x.get("status") != "cancelled"]
    return {"id": valid_id(obj.get("id")), "name": safe_name(obj.get("title")),
            "date": str(obj.get("starts_at") or "")[:10], "org": obj.get("org"),
            "totalBouts": len(card),
            "completedBouts": sum(x.get("status") == "completed" for x in card),
            "observedOn": dt.date.today().isoformat(), "source": "UFCalendar"}

class BudgetClient:
    def __init__(self, token, ledger, today, fetch=None):
        self.token, self.ledger, self.today = token, ledger, today
        self.fetch = fetch or self.http_get
        self.network_calls = 0
        self.this_run = {category: 0 for category in BUDGET}
        self.available = 0
        self.mon, self.mons = week_fraction(today)

    def http_get(self, route):
        request = urllib.request.Request(BASE + route, headers={
            "Authorization": "Bearer " + self.token,
            "Accept": "application/json", "User-Agent": "BEFN-Intelligence-Budget/1.0"})
        with urllib.request.urlopen(request, timeout=18) as response:
            return json.load(response)

    def bootstrap(self):
        if not self.token: self.ledger["status"] = "needs_key"; return False
        # Budget reserve contains auth checks and failures.
        if self.network_calls >= MAX_CALLS_PER_RUN: return False
        self.ledger["spent"]["reserve"] += 1
        self.network_calls += 1
        try:
            resp = self.fetch("/usage")
            usage = unpack(resp)
            if not isinstance(usage, dict): raise ValueError("Bad usage response")
            used, limit = usage.get("requests_used"), usage.get("requests_limit")
            if type(used) is not int or type(limit) is not int:
                raise ValueError("No authoritative quota figures")
            if used < 0 or limit <= 0: raise ValueError("Invalid quota figures")
            cap = min(CAP, limit)
            self.available = max(0, cap - used - max(0, BUDGET["reserve"] -
                                                      self.ledger["spent"]["reserve"]))
            self.ledger["provider"] = {
                "tier": str(usage.get("tier") or "")[:16], "used": used,
                "limit": limit, "befnCap": cap,
                "resetAt": str(usage.get("reset_at") or "")[:32],
                "remainingForEditorialCalls": self.available}
            self.ledger["status"] = "connected" if self.available else "budget_exhausted"
            return True
        except (urllib.error.URLError, ValueError, TypeError, OSError) as error:
            self.ledger["status"] = "usage_unavailable"
            self.ledger["failures"].append({"date": self.today.isoformat(),
                "category": "reserve", "code": type(error).__name__})
            return False

    def allowance(self, category):
        if category not in BUDGET or category == "reserve": return 0
        share = (BUDGET[category] * self.mon) // self.mons
        return max(0, min(share - self.ledger["spent"][category],
                          self.available, MAX_CALLS_PER_RUN-self.network_calls,
                          MAX_PER_CATEGORY_PER_RUN[category] - self.this_run[category]))

    def call(self, category, ident, route):
        if self.allowance(category) < 1: return None
        key = str(ident)
        if key in self.ledger["attempted"][category]: return None
        # Attempts count even for HTTP failures or no data.
        self.ledger["spent"][category] += 1
        self.this_run[category] += 1
        self.ledger["attempted"][category].append(key)
        self.available -= 1
        self.network_calls += 1
        try:
            return self.fetch(route)
        except (urllib.error.URLError, ValueError, TypeError, OSError) as error:
            self.ledger["failures"].append({"date": self.today.isoformat(),
                "category": category, "code": type(error).__name__})
            self.ledger["failures"] = self.ledger["failures"][-18:]
            if isinstance(error, urllib.error.HTTPError) and error.code == 429:
                self.available = 0
                self.ledger["status"] = "quota_or_rate_limited"
            elif isinstance(error, urllib.error.HTTPError) and error.code in (401, 403):
                self.available = 0
                self.ledger["status"] = "authorization_failed"
            return None

def work(scout, insights, client):
    today = client.today
    focus = {norm(f.get("name")):
             {"high": 5, "medium": 3, "watch": 1}.get(f.get("reviewPriority"), 1)
             for f in scout.get("fighters", []) if isinstance(f, dict) and f.get("organisation")=="UFC"}
    # Discover up to 25 UFC bouts per weekly search. No bulk export.
    if client.allowance("discovery") and client.ledger["status"] == "connected":
        since = (today-dt.timedelta(days=45 if not insights["candidates"] else 14)).isoformat()
        slot = today.isoformat()[:7] + "-w" + str(client.mon)
        route = "/fights/search?" + urllib.parse.urlencode(
            {"org":"ufc", "from":since, "limit":25})
        response = client.call("discovery", slot, route)
        rows = unpack(response)
        if isinstance(rows, list):
            for x in rows:
                item = candidate_from_fight(x, today, focus)
                if item: insights["candidates"][item["id"]] = item
    candidates = sorted(insights["candidates"].values(),
                        key=lambda x: (x["priority"], x["date"], x["id"]), reverse=True)
    candidates = [c for c in candidates if c["org"] == "ufc" and
                  c["date"] >= (today-dt.timedelta(days=RECENT_DAYS)).isoformat()]
    # Fetch one bout once, and get both corners' round-by-round data in one request.
    for c in candidates:
        if not client.allowance("rounds"): break
        ident = c["id"]
        if ident in insights["fights"]: continue
        r = client.call("rounds", ident, "/fights/" + ident + "/rounds")
        detail = collect_rounds(r, c)
        if detail: insights["fights"][ident] = detail
    # Matchup comparisons use one request per pair, not per fighter.
    for c in candidates:
        if not client.allowance("comparisons"): break
        a, b = c["a"]["slug"], c["b"]["slug"]
        if not a or not b or a == b: continue
        pair = ":".join(sorted((a, b)))
        if pair in insights["comparisons"]: continue
        route = "/compare?" + urllib.parse.urlencode({"a":a,"b":b})
        p = client.call("comparisons", pair, route)
        comp = slim_comparison(p, c["a"], c["b"])
        if comp: insights["comparisons"][pair] = comp
    # Source fighter identities from discovery, not an error-prone fuzzy-name match.
    eligible = {}
    for c in candidates:
        for f in (c["a"], c["b"]):
            slug = f["slug"]
            score = c["priority"] + (15 if norm(f["name"]) in focus else 0)
            if slug and (slug not in eligible or eligible[slug][0] < score):
                eligible[slug] = (score, f)
    for _, f in sorted(eligible.values(), key=lambda x:x[0], reverse=True):
        if not client.allowance("histories"): break
        slug = f["slug"]
        if slug in insights["histories"]: continue
        payload = client.call("histories", slug, "/fighters/" + slug + "/history")
        history = slim_history(payload, f)
        if history: insights["histories"][slug] = history
    # One-call division intelligence: official ladder + recent/upcoming + roster.
    divisions = []
    for c in candidates:
        div = c.get("division")
        if div in DIVISIONS and div not in divisions: divisions.append(div)
    for div in divisions:
        if not client.allowance("divisions"): break
        key = "ufc:" + div
        if key in insights["divisions"] and insights["divisions"][key].get("observedOn", "") >= (
            today-dt.timedelta(days=45)).isoformat(): continue
        payload = client.call("divisions", key, "/orgs/ufc/divisions/" + div)
        summary = slim_division(payload, "ufc", div)
        if summary: insights["divisions"][key] = summary
    event_ids = []
    for c in candidates:
        eid = c.get("eventId")
        if eid and eid not in event_ids: event_ids.append(eid)
    for eid in event_ids:
        if not client.allowance("events"): break
        if eid in insights["events"]: continue
        detail = client.call("events", eid, "/events/" + eid)
        summary = slim_event(detail)
        if summary: insights["events"][eid] = summary
    # Bound published metadata while retaining full derived history of acquired bouts.
    if len(insights["candidates"]) > 120:
        best = sorted(insights["candidates"].values(), key=lambda x:(x["date"],x["priority"]),reverse=True)[:120]
        insights["candidates"] = {x["id"]:x for x in best}

def update_scout(scout, insights, ledger):
    provider = ledger.get("provider", {})
    # Status shows actual usage and connection; no key or raw provider payloads.
    state = ledger.get("status", "unknown")
    note = ("Budgeted scouting: " + str(provider.get("used", "?")) + "/" +
            str(provider.get("limit", "?")) + " account requests consumed; " +
            str(ledger["spent"]) + ".")
    sources = scout.setdefault("sources", [])
    sources[:] = [s for s in sources if s.get("provider") != "UFCalendar"]
    sources.insert(1, {"provider": "UFCalendar", "status": state,
                       "detail": note[:520]})
    for fighter in scout.get("fighters", []):
        if fighter.get("organisation") != "UFC": continue
        fid = norm(fighter.get("name"))
        # Attach counts of additional derived bout metrics, without replacing
        # independently verified fighter records or review classifications.
        bouts = [b for b in insights["fights"].values() if
                 fid in (norm(b["fighterA"]["name"]), norm(b["fighterB"]["name"]))]
        if bouts:
            fighter["roundByRoundEvidence"] = {
                "bouts": len(bouts), "rounds": sum(len(x["rounds"]) for x in bouts),
                "source": "UFCalendar", "observedOn": max(x["observedOn"] for x in bouts)}
    return scout

def run(today=None, fetch=None):
    today = today or dt.datetime.now(dt.timezone.utc).date()
    ledger = ledger_for(read(LEDGER, {}), today)
    insight = read(OUT, new_insights())
    for k in ("candidates", "fights", "comparisons", "histories", "divisions", "events"):
        if not isinstance(insight.get(k), dict): insight[k] = {}
    scout = read(SCOUT, {})
    token = os.environ.get("UFCALENDAR_API_KEY", "").strip()
    client = BudgetClient(token, ledger, today, fetch)
    if client.bootstrap(): work(scout, insight, client)
    ledger["lastRun"] = today.isoformat()
    insight["generatedOn"] = today.isoformat()
    save(LEDGER, ledger)
    save(OUT, insight)
    save(SCOUT, update_scout(scout, insight, ledger))
    print("UFCalendar status:", ledger["status"])
    print("Provider usage:", ledger["provider"].get("used"), "/", ledger["provider"].get("limit"))
    print("BEFN category use:", ledger["spent"])
    print("Derived items:", {k:len(insight[k]) for k in
          ("fights", "comparisons", "histories", "divisions", "events")})
    return ledger, insight

if __name__ == "__main__":
    run()
