#!/usr/bin/env python3
"""Read-only CompuBox public PDF reports. Research-branch output only.

Usage: python scripts/boxing/collect_compubox_public.py
No auth, no API, no captcha/protection bypass; bounded small pilot only.
"""
from __future__ import annotations
import datetime as dt
import io
import json
import os
import re
import time
import unicodedata
from pathlib import Path
from urllib.parse import urljoin, urlparse

import fitz  # PyMuPDF
import requests
from bs4 import BeautifulSoup

BASE = "https://beta.compuboxdata.com"
FALLBACK_BASE = "https://app2.compuboxdata.com"
ROOT = Path("research/boxing/compubox")
OUT = ROOT / "bouts"
ROSTER = Path("research/boxing/2026-11-14-cohort-preview.json")
MAX_PDFS = max(1, min(int(os.getenv("COMPUBOX_PILOT_MAX", "12")), 15))
WAIT_SECONDS = 2.0
# Historical report links found in the official CompuBox public research sample.
# Never infer report numbers by incrementing/decrementing numeric IDs.
# Some archived links redirect or expire; failures remain visible for review.
SEED_IDS = (15965, 16918, 16920, 16256, 16941, 16943, 16970, 16971, 16972)
PAIR = re.compile(r"(?<!\d)(\d+)\s*/\s*(\d+)(?!\d)|(-/-)")
TOTAL_RE = re.compile(
    r"^\s*([A-Z][A-Z .'-]{1,60}?)\s+"
    r"(\d+)\s*\((\d+)\)\s*/\s*(\d+)\s+"
    r"(\d+)\s*\((\d+)\)\s*/\s*(\d+)\s+"
    r"(\d+)\s*\((\d+)\)\s*/\s*(\d+)\s*$"
)
CATEGORY = (
    ("total", re.compile(r"^Total Punches Landed\s*/\s*Thrown", re.I)),
    ("jab", re.compile(r"^Jab Landed\s*/\s*Thrown", re.I)),
    ("power", re.compile(r"^Power Punches Landed\s*/\s*Thrown", re.I)),
)
DATE_RE = re.compile(r"\b(\d\d/\d\d/\d\d)\b")
REPORT_ID = re.compile(r"^/round-stats/(\d{3,8})$")
S = requests.Session()
S.headers.update({"User-Agent": "BEFN-CombuBox-Research/1.0 (limited licensed research); Python requests", "Accept": "text/html,application/pdf"})
now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def norm(value):
    t = unicodedata.normalize("NFKD", value.casefold())
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", "".join(c for c in t if not unicodedata.combining(c)))).strip()


def get(url):
    # Permit only known public CompuBox hosts; never follow cross-site redirects.
    assert urlparse(url).scheme == "https"
    assert urlparse(url).hostname in {urlparse(BASE).hostname, urlparse(FALLBACK_BASE).hostname}
    res = S.get(url, timeout=(10, 25), allow_redirects=False)
    if res.status_code in (301, 302, 303, 307, 308):
        raise ValueError("redirect_not_followed")
    res.raise_for_status()
    if len(res.content) > 3_000_000:
        raise ValueError("file_too_large")
    return res


def get_report(report_id):
    """Try documented public report URLs at two official CompuBox hosts.
    Some older beta URLs redirect to the home page. This is not a bypass:
    try the same public URL on the alternative public CompuBox host.
    """
    problems = []
    for base in (BASE, FALLBACK_BASE):
        target = f"{base}/round-stats/{report_id}"
        time.sleep(WAIT_SECONDS)
        try:
            response = get(target)
            if not response.content.startswith(b"%PDF"):
                problems.append("not_pdf_" + urlparse(base).hostname)
                continue
            return response, target
        except (ValueError, requests.RequestException) as error:
            problems.append(type(error).__name__ + "_" + urlparse(base).hostname)
    raise ValueError("official_hosts_unavailable: " + ", ".join(problems))


def load_roster():
    raw = json.loads(ROSTER.read_text())
    return {
        norm(alias): x["fighter"]
        for x in raw["fighters"]
        for alias in {x["fighter"], *x.get("name_variants", [])}
    }


def links_from_front():
    response = get(BASE + "/")
    soup = BeautifulSoup(response.text, "html.parser")
    pairs = []
    seen = set()
    for link in soup.find_all("a", href=True):
        target = urljoin(BASE, link["href"])
        parsed = urlparse(target)
        match = REPORT_ID.fullmatch(parsed.path)
        if parsed.hostname != urlparse(BASE).hostname or not match:
            continue
        ident = int(match.group(1))
        if ident in seen:
            continue
        seen.add(ident)
        label = ""
        for ancestor in list(link.parents)[:6]:
            candidate = " ".join(ancestor.stripped_strings)
            if len(candidate) <= 260 and re.search(r"\bvs\.?\b", candidate, re.I):
                label = candidate
                break
        if not label:
            previous = link.find_previous(string=re.compile(r"\bvs\.?\b", re.I))
            if previous and len(str(previous).strip()) <= 140:
                label = str(previous).strip()
        pairs.append((ident, label[:160]))
    return pairs


def pdf_text(data):
    if not data.startswith(b"%PDF"):
        raise ValueError("response_not_pdf")
    doc = fitz.open(stream=data, filetype="pdf")
    if not 1 <= doc.page_count <= 4:
        raise ValueError("unexpected_page_count")
    return "\n".join(p.get_text(sort=True) for p in doc)


def roster_match_from_report_title(title, report_label, roster):
    """Identify a boxer from the report's full bout header and table surname.
    Match full fighter names exactly against roster aliases; no surname-only guesses.
    """
    match = re.search(r"\s+(?:UD|SD|MD|KO|TKO|RTD|TD|PTS|DQ|NC|DRAW)\s+\d+\s+", title, re.I)
    if not match:
        return None
    fighters = [title[:match.start()].strip(), title[match.end():].strip()]
    label = norm(report_label)
    matched = set()
    for full in fighters:
        full_key = norm(full)
        if (full_key == label or full_key.endswith(" " + label)) and full_key in roster:
            matched.add(roster[full_key])
    return next(iter(matched)) if len(matched) == 1 else None


def repair_cached_roster_links(roster):
    """Add definitive roster links to previously collected verified reports."""
    repaired = 0
    for path in OUT.glob("*.json"):
        data = json.loads(path.read_text())
        changed = False
        for athlete in data.get("fighters", []):
            match = roster_match_from_report_title(
                data.get("report_title", ""), athlete.get("report_fighter_label", ""), roster
            )
            if athlete.get("roster_fighter") != match:
                athlete["roster_fighter"] = match
                changed = True
        if changed:
            path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
            repaired += 1
    return repaired


def parse(text, ident, roster, label):
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]
    first = lines[0] if lines else ""
    date_token = next((DATE_RE.search(s).group(1) for s in lines[:6] if DATE_RE.search(s)), None)
    if not date_token:
        raise ValueError("missing_date")
    date = dt.datetime.strptime(date_token, "%m/%d/%y").date().isoformat()
    sections = {k: {} for k, _ in CATEGORY}
    final = {}
    state = None
    for ln in lines:
        if re.search(r"^Final Punch Stat Report", ln, re.I):
            state = "final"
            continue
        if re.search(r"^Inside The Numbers", ln, re.I):
            state = None
            continue
        chosen = next((name for name, regex in CATEGORY if regex.search(ln)), None)
        if chosen:
            state = chosen
            continue
        if state == "final":
            m = TOTAL_RE.fullmatch(ln)
            if m:
                key = m.group(1).strip()
                a = [int(z) for z in m.groups()[1:]]
                final[key] = {
                    "total": {"landed": a[0], "body_landed": a[1], "thrown": a[2]},
                    "jab": {"landed": a[3], "body_landed": a[4], "thrown": a[5]},
                    "power": {"landed": a[6], "body_landed": a[7], "thrown": a[8]},
                }
        if state in sections:
            matches = list(PAIR.finditer(ln))
            if len(matches) < 3 or not re.match(r"^[A-Z]", ln):
                continue
            name = ln[:matches[0].start()].strip()
            if not name or len(name) > 65:
                continue
            parsed = []
            for m in matches:
                if m.group(3):
                    parsed.append(None)
                else:
                    parsed.append({"landed": int(m.group(1)), "thrown": int(m.group(2))})
            sections[state][name] = parsed

    if len(final) != 2:
        raise ValueError("final_fighters_not_two")
    records = []
    for name, metrics in final.items():
        mapped = {}
        for cat in ("total", "jab", "power"):
            rounds = sections[cat].get(name)
            if rounds is None:
                # Names in the final report and the round table must agree.
                raise ValueError("missing_rounds_" + cat + "_" + name)
            mapped[cat] = rounds
            active = [x for x in rounds if x is not None]
            for value in active:
                if value["landed"] > value["thrown"]:
                    raise ValueError("landed_gt_thrown")
            for field in ("landed", "thrown"):
                if sum(x[field] for x in active) != metrics[cat][field]:
                    raise ValueError("totals_do_not_reconcile_" + cat)
            if not 0 <= metrics[cat]["body_landed"] <= metrics[cat]["landed"]:
                raise ValueError("invalid_body_count")
        if not len({len(x) for x in mapped.values()}) == 1:
            raise ValueError("round_lengths_disagree")
        round_data = []
        for index, trip in enumerate(zip(mapped["total"], mapped["jab"], mapped["power"]), 1):
            total, jab, power = trip
            if total is None and jab is None and power is None:
                continue  # An unboxed round, not a zero-punch round.
            if None in trip:
                raise ValueError("partial_round")
            if any(total[field] != jab[field] + power[field] for field in ("landed", "thrown")):
                raise ValueError("per_round_categories_disagree")
            round_data.append({"round": index, "total": total, "jab": jab, "power": power})
        if not round_data:
            raise ValueError("no_completed_rounds")
        if any(metrics["total"][field] != metrics["jab"][field] + metrics["power"][field] for field in ("landed", "thrown", "body_landed")):
            raise ValueError("final_categories_disagree")

        # Match securely: only exact roster full-name occurrences in event label;
        # record label surname separately, never guess who a surname belongs to.
        candidates = [person for key, person in roster.items() if key and key in norm(label)]
        candidates = sorted(set(candidates), key=lambda n: len(n), reverse=True)
        records.append({"report_fighter_label": name, "event_roster_candidates": candidates,
                        "roster_fighter": roster_match_from_report_title(first, name, roster),
                        "totals": metrics, "rounds": round_data,
                        "completed_rounds": len(round_data),
                        "round_table_columns": len(mapped["total"])})
    return {"source": "CompuBox official public website", "url": f"{BASE}/round-stats/{ident}",
            "source_id": ident, "event_listing": label, "fight_date": date,
            "report_title": first, "retrieved_at_utc": now, "qa": "pass_all_category_sum_checks",
            "fighters": records}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    roster = load_roster()
    repaired = repair_cached_roster_links(roster)
    print("Updated existing fighter-roster matches:", repaired)
    findings = {"timestamp_utc": now, "mode": "read_only_public_report_pilot",
                "source": BASE, "max_pdf_requests": MAX_PDFS,
                "processed": [], "skipped_existing": [], "failed": [], "not_pdf": []}
    try:
        found = links_from_front()
        print("Front page report links:", len(found))
    except Exception as e:
        found = []
        print("Front page index unavailable:", type(e).__name__)
    # Known source URLs validated manually plus discovered homepage links.
    seeds = [(x, "verified_seed") for x in SEED_IDS]
    ranked = []
    for ident, label in found:
        points = sum(bool(key and key in norm(label)) for key in roster)
        ranked.append((ident, label, points))
    ranked.sort(key=lambda x: (-x[2], -x[0]))
    findings["discovery"] = [{"report_id": rid, "label": label[:100], "roster_alias_hits": hits}
                              for rid, label, hits in ranked[:22]]
    # Only prioritise confirmed roster-name matches on the public index.
    # Known test seeds are retained to check parser stability. Don't collect
    # unrelated bouts simply because they are recent.
    queued = seeds + [(x, label) for x, label, hits in ranked if hits > 0]
    seen, attempts = set(), 0
    for ident, label in queued:
        if ident in seen:
            continue
        seen.add(ident)
        path = OUT / f"{ident}.json"
        if path.exists():
            findings["skipped_existing"].append(ident)
            continue
        if attempts >= MAX_PDFS:
            break
        attempts += 1
        try:
            response, report_url = get_report(ident)
            parsed = parse(pdf_text(response.content), ident, roster, label)
            parsed["url"] = report_url
            parsed["source_host"] = urlparse(report_url).hostname
            path.write_text(json.dumps(parsed, indent=2, ensure_ascii=False) + "\n")
            findings["processed"].append({"report_id": ident, "fight_date": parsed["fight_date"],
                                          "fighters": [f["report_fighter_label"] for f in parsed["fighters"]]})
            print("PASS", ident, parsed["fight_date"], len(parsed["fighters"]), "fighters")
        except (ValueError, requests.RequestException, RuntimeError) as exc:
            findings["failed"].append({"report_id": ident, "error_code": str(exc)[:120]})
            print("FAIL", ident, type(exc).__name__, str(exc)[:80])
    findings["attempted_pdf_requests"] = attempts
    findings["new_fights"] = len(findings["processed"])
    (ROOT / "last_pilot.json").write_text(json.dumps(findings, indent=2) + "\n")
    print("DONE", json.dumps({"attempted": attempts, "new": findings["new_fights"],
                               "skipped": len(findings["skipped_existing"]),
                               "failures": len(findings["failed"]),
                               "non_pdf": len(findings["not_pdf"])}))


if __name__ == "__main__":
    main()
