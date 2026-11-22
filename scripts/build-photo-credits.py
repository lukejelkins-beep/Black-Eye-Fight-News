#!/usr/bin/env python3
"""Generate boxing-photo-credits.html from data/boxing-image-register.json.

CC BY and CC BY-SA ask for the photographer, the licence and the changes made to be
named where the work is used. A photograph in a bout disc has no room for that, so the
credit lives on this page, which every page that can show one links to. Run it after the
intake:  python3 -I scripts/build-photo-credits.py
"""
import html, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTER = ROOT / "data/boxing-image-register.json"
OUT = ROOT / "boxing-photo-credits.html"
e = html.escape

STYLE = ("body{max-width:850px;margin:3rem auto;padding:0 1rem;font:16px/1.6 'DM Sans',system-ui,sans-serif;"
         "background:#f8f4ed;color:#111013}"
         "h1{font-family:'Unbounded','Arial Black',system-ui,sans-serif;font-weight:800;letter-spacing:-.03em;"
         "font-size:clamp(22px,3.4vw,34px);line-height:1.15;margin:0 0 16px}"
         "h2{font-family:'Unbounded','Arial Black',system-ui,sans-serif;font-weight:700;font-size:20px;margin:2rem 0 .5rem}"
         "a{color:#cf1824}li{margin:1rem 0}")


def main():
    reg = json.loads(REGISTER.read_text(encoding="utf-8"))
    images = sorted(reg["images"], key=lambda r: r["name"])
    commons = [r for r in images if r.get("rights") == "wikimedia-cc"]
    press = [r for r in images if r.get("rights") == "promoter-press-kit"]

    parts = ["<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
             "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
             "<title>Boxing Photo Credits | BEFN</title>",
             "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
             "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
             "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Unbounded:wght@700;800&display=swap\">",
             f"<style>{STYLE}</style></head><body>",
             "<a href=\"index.html#home\">Return to Black Eye Fight News</a>",
             "<h1>Boxing photograph credits</h1>",
             "<p>Every boxer photograph BEFN hosts is listed here with its source, its photographer where one is named, "
             "its licence and what was changed. Photographs are cropped to a portrait, card and thumbnail shape and "
             "converted to WebP; nothing else is altered.</p>"]

    if commons:
        parts.append("<h2>Wikimedia Commons</h2><p>Freely licensed photographs. The licence of each one is linked; "
                     "attribution below is the credit it asks for.</p><ul>")
        for r in commons:
            licence = e(r.get("licence", ""))
            licence_link = (f"<a href=\"{e(r['licenceUrl'])}\">{licence}</a>" if r.get("licenceUrl") else licence)
            page = (f"<a href=\"{e(r['sourcePage'])}\">Source photograph</a>" if r.get("sourcePage") else "Source photograph")
            parts.append(f"<li><strong>{e(r['name'])}</strong> — Photograph by {e(r.get('photographer', 'Unknown photographer'))}. "
                         f"{page} · {licence_link} · Changes: {e(r.get('changes', 'Cropped and converted to WebP.'))}</li>")
        parts.append("</ul>")

    if press:
        promoters = sorted({r.get("promoter", "") for r in press if r.get("promoter")})
        parts.append("<h2>Promoter press kits</h2>"
                     f"<p>Published under the BEFN operator's attestation of 22 November 2026 that these photographs "
                     f"may be republished with the promoter credited: {e(', '.join(promoters))}. "
                     "They are not claimed to be Creative Commons licensed.</p><ul>")
        for r in press:
            page = (f"<a href=\"{e(r['sourcePage'])}\">Source page</a>" if r.get("sourcePage") else "Source page")
            parts.append(f"<li><strong>{e(r['name'])}</strong> — {e(r.get('credit', ''))}. {page} · "
                         "Changes: cropped to BEFN's portrait, card and thumbnail shapes and converted to WebP.</li>")
        parts.append("</ul>")

    parts.append(f"<p>{len(images)} photographs in all. A boxer with no photograph here is shown by name alone, "
                 "or by their initials; BEFN does not use a photograph it cannot account for.</p></body></html>")
    OUT.write_text("\n".join(parts) + "\n", encoding="utf-8")
    print(f"{OUT.name}: {len(commons)} Commons, {len(press)} press-kit, {len(images)} in all")


if __name__ == "__main__":
    main()
