"""Snapshot attribute scores for announced UFC cards (Phase 3, step 3). Pure functions, no file or network access.

Method: docs/design/SNAPSHOT-METHOD.md. Descriptive scores of the LAST FIVE fights, not predictions.
Four attributes reuse the existing engine formulas (scripts/ufc_ratings.py) on the last-five window; Power and
Durability are new. Every score is a 1-99 percentile among UFC fighters with enough evidence.

Rules
  * Evidence gate: at least MIN_STAT_FIGHTS of the last five fights with full round stats, and each attribute's own gate.
  * Small samples are pulled toward the average by n / (n + K). Power and Durability rest on rare events (knockdowns,
    KO losses), which five fights barely sample, so they use the larger K (see the held-out test in the method doc).
  * Division percentile needs MIN_DIVISION_PEERS rated peers; otherwise the score has no division value.
  * Missing is None, never zero. Nothing is estimated.
"""
from __future__ import annotations

import ufc_ratings as ur

ATTRIBUTES = ("striking", "power", "defence", "wrestling", "grappling", "durability")
MIN_STAT_FIGHTS = ur.MIN_STAT_FIGHTS
MIN_ROSTER = ur.MIN_ROSTER
MIN_DIVISION_PEERS = ur.MIN_DIVISION_PEERS
SHRINK_K = {"striking": 4, "defence": 4, "wrestling": 4, "grappling": 4, "power": 8, "durability": 8}
BANDS = ((75, "green"), (55, "gold"), (35, "orange"), (0, "red"))   # same cut points as the profile engine


def band(score):
    """Colour band for a 1-99 score: below 35 red, 35-54 orange, 55-74 gold, 75 and over green."""
    if not isinstance(score, int) or isinstance(score, bool):
        return None
    return next(name for low, name in BANDS if score >= low)


def power_raw(window: dict):
    """Knockdowns per 15 min (50%) and KO/TKO wins per fight (50%); both must be measured."""
    r = ur.bounded(window.get("rates"), window)
    parts = [(ur._between(r.get("kd15"), 0, 1.0), .5), (ur._between(r.get("koWinShare"), 0, .5), .5)]
    return ur._sum_parts(parts, 1.0, 2)


def durability_raw(window: dict):
    """Knockdowns absorbed per 15 (40%), share of fights lost by KO/TKO (40%), strikes absorbed per min (20%), lower is
    better for all. The first two must be measured."""
    r = ur.bounded(window.get("rates"), window)
    fights = window.get("fights") or 0
    ko_losses = (window.get("lossesBy") or {}).get("ko")
    ko_share = ko_losses / fights if fights and isinstance(ko_losses, (int, float)) else None
    parts = [(ur._between(r.get("kdAbs15"), 1.0, 0), .40), (ur._between(ko_share, .34, 0), .40),
             (ur._between(r.get("sapm"), 6.0, 1.2), .20)]
    if parts[0][0] is None or parts[1][0] is None:
        return None
    return ur._sum_parts(parts, 1.0, 3)


def raw_attribute(window: dict, name: str):
    if name == "power":
        return power_raw(window)
    if name == "durability":
        return durability_raw(window)
    return ur.raw_skill(window.get("rates") or {}, window, name)


def eligible(window) -> bool:
    return isinstance(window, dict) and (window.get("statFights") or 0) >= MIN_STAT_FIGHTS and bool(window.get("rates"))


def score_population(windows: dict, divisions: dict) -> dict:
    """windows: slug -> last-five window; divisions: slug -> division name or None.
    Returns slug -> {attribute: {"roster": int|None, "division": int|None}} for every eligible fighter,
    plus the population sizes under the key "_peers" -> {attribute: {"roster": n, "divisions": {name: n}}}."""
    raw, n = {}, {}
    for slug, w in windows.items():
        if eligible(w):
            n[slug] = w["statFights"]
            raw[slug] = {a: raw_attribute(w, a) for a in ATTRIBUTES}
    shrunk = {slug: {} for slug in raw}
    for a in ATTRIBUTES:
        values = [raw[s][a] for s in raw if raw[s][a] is not None]
        if len(values) < MIN_ROSTER:
            continue
        mean = sum(values) / len(values)
        for s in raw:
            if raw[s][a] is not None:
                shrunk[s][a] = mean + (raw[s][a] - mean) * (n[s] / (n[s] + SHRINK_K[a]))
    by_div = {}
    for s in shrunk:
        d = divisions.get(s)
        if d:
            by_div.setdefault(d, set()).add(s)
    roster = {a: sorted(v[a] for v in shrunk.values() if a in v) for a in ATTRIBUTES}
    out, peers = {}, {a: {"roster": len(roster[a]), "divisions": {}} for a in ATTRIBUTES}
    for a in ATTRIBUTES:
        for d, members in by_div.items():
            peers[a]["divisions"][d] = sum(1 for s in members if a in shrunk[s])
    for s, v in shrunk.items():
        d = divisions.get(s)
        out[s] = {}
        for a in ATTRIBUTES:
            if a not in v:
                out[s][a] = {"roster": None, "division": None}
                continue
            pool = sorted(shrunk[m][a] for m in by_div.get(d, ()) if a in shrunk[m]) if d else []
            out[s][a] = {"roster": ur.percentile(v[a], roster[a]),
                         "division": ur.percentile(v[a], pool) if len(pool) >= MIN_DIVISION_PEERS else None}
    out["_peers"] = peers
    return out
