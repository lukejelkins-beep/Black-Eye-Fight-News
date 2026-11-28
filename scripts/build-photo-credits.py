#!/usr/bin/env python3
"""Generate boxing-photo-credits.html and mma-photo-credits.html from the image registers.

CC BY and CC BY-SA ask for the photographer, the licence and the changes made to be
named where the work is used, and the promoter attestations ask for the promoter to be
credited. A photograph in a bout disc has no room for that, so the credit lives on these
pages, which every page that can show one links to. Run it after every intake or
`scripts/photo-runner.py approve`:  python3 -I scripts/build-photo-credits.py
"""
import html, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = [  # register, page, sport label, attestation wording for press-kit photographs
    (ROOT / "data/boxing-image-register.json", ROOT / "boxing-photo-credits.html", "Boxing", "boxer",
     "Published under the BEFN operator's attestations (22 November 2026; Top Rank 24 November 2026) "
     "that these photographs may be republished with the promoter credited"),
    (ROOT / "data/mma-image-register.json", ROOT / "mma-photo-credits.html", "MMA", "fighter",
     "Published under the BEFN operator's attestation of 24 November 2026 that press-kit and media fighter "
     "photographs from PFL, ONE Championship, KSW, RIZIN and Cage Warriors may be republished with the promoter credited"),
]
FULLBODY = ROOT / "data/fullbody-cutout-register.json"
FULLBODY_ON = {"Boxing": "boxing", "MMA": "ufc"}  # which page lists which sport's full-body cut-outs
e = html.escape

STYLE = ("body{max-width:850px;margin:3rem auto;padding:0 1rem;font:16px/1.6 'Inter',system-ui,sans-serif;"
         "background:#eef0f2;color:#14181c}"
         "h1{font-family:'Oswald','Arial Black',system-ui,sans-serif;font-weight:800;letter-spacing:-.03em;"
         "font-size:clamp(22px,3.4vw,34px);line-height:1.15;margin:0 0 16px}"
         "h2{font-family:'Oswald','Arial Black',system-ui,sans-serif;font-weight:700;font-size:20px;margin:2rem 0 .5rem}"
         "a{color:#b3001b}li{margin:1rem 0}")


def page(reg, sport, who, press_wording, fullbody=None):
    images = sorted(reg["images"], key=lambda r: r["name"])
    commons = [r for r in images if r.get("rights") == "wikimedia-cc"]
    press = [r for r in images if r.get("rights") == "promoter-press-kit"]
    owner = [r for r in images if r.get("rights") == "owner-supplied"]

    parts = ["<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
             "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
             f"<title>{sport} Photo Credits | BEFN</title>",
             "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
             "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
             "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Oswald:wght@500;600;700&display=swap\">",
             f"<style>{STYLE}</style></head><body>",
             "<a href=\"index.html#home\">Return to Black Eye Fight News</a>",
             f"<h1>{sport} photograph credits</h1>",
             f"<p>Every {who} photograph BEFN hosts is listed here with its source, its photographer where one is named, "
             "its licence and what was changed. Photographs are cropped to a portrait, card and thumbnail shape and "
             "converted to WebP; nothing else is altered.</p>"]

    if commons:
        parts.append("<h2>Wikimedia Commons</h2><p>Freely licensed photographs. The licence of each one is linked; "
                     "attribution below is the credit it asks for.</p><ul>")
        for r in commons:
            licence = e(r.get("licence", ""))
            licence_link = (f"<a href=\"{e(r['licenceUrl'])}\">{licence}</a>" if r.get("licenceUrl") else licence)
            src = (f"<a href=\"{e(r['sourcePage'])}\">Source photograph</a>" if r.get("sourcePage") else "Source photograph")
            parts.append(f"<li><strong>{e(r['name'])}</strong> — Photograph by {e(r.get('photographer', 'Unknown photographer'))}. "
                         f"{src} · {licence_link} · Changes: {e(r.get('changes', 'Cropped and converted to WebP.'))}</li>")
        parts.append("</ul>")

    if press:
        promoters = sorted({r.get("promoter", "") for r in press if r.get("promoter")})
        parts.append("<h2>Promoter press kits</h2>"
                     f"<p>{press_wording}: {e(', '.join(promoters))}. "
                     "They are not claimed to be Creative Commons licensed.</p><ul>")
        for r in press:
            src = (f"<a href=\"{e(r['sourcePage'])}\">Source page</a>" if r.get("sourcePage") else "Source page")
            parts.append(f"<li><strong>{e(r['name'])}</strong> — {e(r.get('credit', ''))}. {src} · "
                         "Changes: cropped to BEFN's portrait, card and thumbnail shapes and converted to WebP.</li>")
        parts.append("</ul>")

    if owner:
        parts.append("<h2>Supplied by the BEFN operator</h2><p>Photographs the operator supplied, each with the "
                     "credit it carries and the operator's own statement of permission.</p><ul>")
        for r in owner:
            parts.append(f"<li><strong>{e(r['name'])}</strong> — {e(r.get('credit', ''))}. "
                         f"Permission: {e(r.get('attestation', ''))} · "
                         "Changes: cropped to BEFN's portrait, card and thumbnail shapes and converted to WebP.</li>")
        parts.append("</ul>")

    full = sorted(((k, v) for k, v in (fullbody or {}).items()
                   if v.get("ok") is True and v.get("sport") == FULLBODY_ON.get(sport)), key=lambda kv: kv[0])
    if full:
        parts.append("<h2>Full-body cut-outs supplied by the BEFN operator</h2><p>Full-length photographs the operator "
                     "supplied for the champions pages, each with its credit and the operator's own statement of "
                     "permission.</p><ul>")
        for k, v in full:
            parts.append(f"<li><strong>{e(v.get('name') or k.replace('-', ' ').title())}</strong> — {e(v.get('credit', ''))}. "
                         f"Permission: {e(v.get('attestation', ''))} · "
                         "Changes: background removed, trimmed to the figure and converted to WebP.</li>")
        parts.append("</ul>")

    parts.append(f"<p>{len(images)} photographs in all. A {who} with no photograph here is shown by name alone, "
                 "or by their initials; BEFN does not use a photograph it cannot account for.</p></body></html>")
    return "\n".join(parts) + "\n", len(commons), len(press), len(owner), len(images)


def main():
    fullbody = json.loads(FULLBODY.read_text(encoding="utf-8")).get("cutouts", {}) if FULLBODY.exists() else {}
    for register, out, sport, who, wording in PAGES:
        reg = json.loads(register.read_text(encoding="utf-8")) if register.exists() else {"images": []}
        text, commons, press, owner, total = page(reg, sport, who, wording, fullbody)
        out.write_text(text, encoding="utf-8")
        print(f"{out.name}: {commons} Commons, {press} press-kit, {owner} owner-supplied, {total} in all")


if __name__ == "__main__":
    main()
