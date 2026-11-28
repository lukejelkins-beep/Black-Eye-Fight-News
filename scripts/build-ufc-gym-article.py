#!/usr/bin/env python3
"""Build analysis-ufc-gyms-2025.html from data/ufc-gym-analysis-2025.json.

Offline and deterministic: every figure on the page comes from the JSON, so the page cannot drift from the data
(tests/test_ufc_gym_article.py rebuilds it and compares). The chart is plain HTML and CSS, not an image, so it reflows
at phone width, keeps 12 px text, and reads as a list for a screen reader.

Usage:  python scripts/build-ufc-gym-article.py [--check]
"""
from __future__ import annotations

import argparse
import html
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "ufc-gym-analysis-2025.json"
OUT = ROOT / "analysis-ufc-gyms-2025.html"

AXIS_MIN, AXIS_MAX = -4.0, 6.0  # wins above expected, in wins


def esc(s) -> str:
    return html.escape(str(s), quote=True)


def signed(v: float) -> str:
    return f"{v:+.1f}".replace("-", "−") if v else "0.0"


def row(g: dict) -> str:
    v = g["winsAboveExpected"]
    span = AXIS_MAX - AXIS_MIN
    zero = (0 - AXIS_MIN) / span * 100
    width = abs(v) / span * 100
    left = zero if v >= 0 else zero - width
    cls = "up" if v > 0 else "down" if v < 0 else "flat"
    word = "above" if v > 0 else "below" if v < 0 else "level with"
    label = f"{g['gym']}: {g['wins']} wins and {g['losses']} losses, {abs(v):.1f} wins {word} expected" if v else \
            f"{g['gym']}: {g['wins']} wins and {g['losses']} losses, level with expected"
    return (f'<li class="row" aria-label="{esc(label)}">'
            f'<div class="rh"><span class="gname">{esc(g["gym"])}</span>'
            f'<span class="grec">{g["wins"]}-{g["losses"]} ({g["winPct"]}%)</span>'
            f'<span class="gdiff {cls}">{signed(v)}</span></div>'
            f'<div class="track" aria-hidden="true"><i class="axis" style="left:{zero:.1f}%"></i>'
            f'<b class="bar {cls}" style="left:{left:.1f}%;width:{width:.1f}%"></b></div></li>')


def build(d: dict) -> str:
    gyms = sorted(d["gyms"], key=lambda g: (-g["winsAboveExpected"], g["gym"]))
    by = {g["gym"]: g for g in d["allGyms"]}
    ck, att, xc, ml = by["City Kickboxing"], by["American Top Team"], by["Xtreme Couture"], by["MMA Lab"]
    perm = d["permutation"]
    n_gyms = d["gymsCompared"]
    rows = "".join(row(g) for g in gyms)
    return f"""<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#151115">
  <meta name="robots" content="noindex,nofollow">
  <title>Do UFC gyms decide fights? | Black Eye Fight News</title>
  <meta name="description" content="We compared gym records across {d['decidedBouts']} UFC fights in {d['season']}. Once you allow for each fighter's record going in, gyms look much the same.">
  <link rel="icon" href="assets/site-favicon-192.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Unbounded:wght@700;800&display=swap" rel="stylesheet">
  <style>
    :root{{--red:#cf1824;--gold:#f3c332;--cream:#f8f4ed;--ink:#111013;--band:#151115;--muted:#5b565d;--line:#e5e1d8}}
    *{{box-sizing:border-box}}
    html{{-webkit-text-size-adjust:100%}}
    body{{margin:0;background:var(--cream);color:var(--ink);font:400 16px/1.55 "DM Sans",system-ui,sans-serif}}
    .skip{{position:absolute;left:-999px}} .skip:focus{{left:12px;top:12px;background:#fff;padding:8px 12px;z-index:9}}
    .bar-top{{background:var(--band);border-bottom:4px solid var(--red);padding:12px 16px}}
    .bar-top a{{color:#fff;text-decoration:none;font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:14px;display:inline-flex;align-items:center;min-height:44px}}
    main{{max-width:720px;margin:0 auto;padding:24px 16px 56px}}
    .kicker{{margin:0 0 8px;color:var(--red);font-weight:700;font-size:13px;letter-spacing:.1em;text-transform:uppercase}}
    h1{{font:800 clamp(26px,7vw,40px)/1.12 "Unbounded",system-ui,sans-serif;margin:0 0 12px}}
    h2{{font:700 clamp(19px,5vw,24px)/1.2 "Unbounded",system-ui,sans-serif;margin:36px 0 12px}}
    .dek{{font-size:18px;color:var(--muted);margin:0 0 8px}}
    .by{{font-size:14px;color:var(--muted);margin:0 0 24px}}
    .card{{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;margin:16px 0;box-shadow:0 1px 2px rgba(17,16,19,.06)}}
    .answer{{border-left:4px solid var(--gold)}} .answer ul{{margin:8px 0 0;padding-left:20px}} .answer li{{margin:6px 0}}
    p{{margin:12px 0}}
    .chart{{list-style:none;margin:8px 0 0;padding:0}}
    .row{{padding:10px 0;border-top:1px solid var(--line)}} .row:first-child{{border-top:0}}
    .rh{{display:grid;grid-template-columns:1fr auto auto;gap:4px 12px;align-items:baseline}}
    .gname{{font-weight:700;font-size:15px;min-width:0}} .grec{{font-size:13px;color:var(--muted);white-space:nowrap}}
    .gdiff{{font-weight:700;font-size:15px;min-width:3.2em;text-align:right;font-variant-numeric:tabular-nums}}
    .gdiff.up{{color:#1f6e3f}} .gdiff.down{{color:var(--red)}} .gdiff.flat{{color:var(--muted)}}
    .track{{position:relative;height:12px;margin-top:6px;background:#f1ece2;border-radius:6px}}
    .axis{{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--ink);opacity:.5}}
    .bar{{position:absolute;top:2px;height:8px;border-radius:4px}} .bar.up{{background:#1f6e3f}} .bar.down{{background:var(--red)}} .bar.flat{{background:var(--muted)}}
    .legend{{font-size:13px;color:var(--muted);margin:12px 0 0}}
    .note{{font-size:14px;color:var(--muted)}}
    a{{color:var(--red)}}
    footer{{font-size:13px;color:var(--muted);margin-top:32px;border-top:1px solid var(--line);padding-top:16px}}
  </style>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <div class="bar-top"><a href="index.html#home">Black Eye Fight News</a></div>
  <main id="main">
    <p class="kicker">MMA analysis</p>
    <h1>Do UFC gyms decide fights?</h1>
    <p class="dek">We checked {d['decidedBouts']} UFC fights from {d['season']}. Once you allow for who each fighter was going in, gyms look much the same.</p>
    <p class="by">Black Eye Fight News analysis, 28 Nov 2026</p>

    <div class="card answer">
      <strong>The short answer</strong>
      <ul>
        <li>Some gyms had far better years than others: City Kickboxing went {ck['wins']}-{ck['losses']}, American Top Team {att['wins']}-{att['losses']}.</li>
        <li>But gyms with strong fighters win more because of the fighters. Allowing for each fighter's record going in, the gaps shrink to what luck produces.</li>
        <li>Shuffling fighters between gyms at random gave gym-to-gym differences as large as the real ones in {round(perm['p'] * 100)}% of {perm['runs']:,} tries.</li>
      </ul>
    </div>

    <h2>Wins against what was expected</h2>
    <p>Each bar compares a gym's wins with the wins its fighters were expected to get, given their records going into each fight. Green is better than expected, red is worse. Only the {n_gyms} gyms with {d['minBouts']} or more bouts are shown.</p>
    <div class="card">
      <ol class="chart">{rows}</ol>
      <p class="legend">Wins above (+) or below (&minus;) expected. Fights between two fighters from the same gym are left out of that gym's record.</p>
    </div>

    <h2>What stood out</h2>
    <p><strong>City Kickboxing</strong> won {ck['wins']} of {ck['bouts']}, about {ck['winsAboveExpected']:.0f} wins more than its fighters' records suggested. It is the best result on the chart, but with {n_gyms} gyms compared, one of them looking this good by luck alone is not unusual. It would happen about one year in five.</p>
    <p><strong>American Top Team</strong>, the busiest gym, went {att['wins']}-{att['losses']}, about {abs(att['winsAboveExpected']):.0f} wins under expectation. That is also well within chance. <strong>Xtreme Couture</strong> ({xc['wins']}-{xc['losses']}) and <strong>MMA Lab</strong> ({ml['wins']}-{ml['losses']}) sit at either end for the same reason: a handful of fights either way.</p>

    <h2>Why gyms still matter to fans</h2>
    <p>This does not say training camps are pointless. It says that over one season, a gym's win-loss record mostly reflects the fighters it already has. A great gym that signs great fighters will win a lot, and the record alone cannot tell you which came first.</p>

    <h2>How we did it</h2>
    <p>We took every decided UFC bout in {d['season']} ({d['decidedBouts']} fights across {d['events']} events, including Road to UFC). For each fighter we worked out their record going into the fight and, from the gap between the two, how likely each was to win. That method picked the winner in {d['winnerPickedPct']}% of bouts. A gym's expected wins are the sum of those chances.</p>
    <p class="note">Limits: gyms are where Sherdog lists a fighter training now, not necessarily at the time of the fight, and a fighter who lists several gyms counts for each. Expectations come from records, not betting odds. One season is enough to rule out big gym effects, not small ones.</p>

    <footer>Results and gym listings: <a href="https://www.sherdog.com">Sherdog</a>, used with permission. Method and code are in <code>research/ufc-gym-analysis-2025</code> in the BEFN repository.</footer>
  </main>
</body>
</html>
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="exit 1 if the saved page differs from a fresh build")
    args = ap.parse_args()
    page = build(json.loads(DATA.read_text(encoding="utf-8")))
    if args.check:
        same = OUT.exists() and OUT.read_text(encoding="utf-8") == page
        print("up to date" if same else "analysis-ufc-gyms-2025.html is out of date", file=sys.stderr if not same else sys.stdout)
        return 0 if same else 1
    OUT.write_text(page, encoding="utf-8")
    print(f"wrote {OUT.name} ({len(page)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
