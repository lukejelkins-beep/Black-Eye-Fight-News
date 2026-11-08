#!/usr/bin/env python3
"""Conservative poster discovery for upcoming cards without a portrait/square poster.

Only select authentic event artwork with matching event identity and sufficient
image dimensions. Never overwrite a previously selected portrait or square poster.
The existing browser-side image fallback remains responsible for delivery failures.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from io import BytesIO
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlsplit

from bs4 import BeautifulSoup
from PIL import Image, UnidentifiedImageError
import requests

DATA = Path("data/upcoming-cards.json")
REPORT = Path("qa/missing-poster-discovery.json")
UA = "Mozilla/5.0 (compatible; BlackEyeFightNewsPosterAudit/1.0; public event research)"
TIMEOUT = 9
MAX_IMAGE_BYTES = 8_000_000
MAX_EVENT_PAGES = 9
MAX_IMAGES = 12
MAX_SEARCH_RESULTS = 10
POOL_SIZE = 4
TRUSTED = (
    "ufc.com", "ufcespanol.com", "onefc.com", "pflmma.com", "rizinff.com",
    "matchroomboxing.com", "queensberry.co.uk", "toprank.com", "boxxer.com",
    "premierboxingchampions.com", "salitapromotions.com", "wbcboxing.com",
    "netflix.com", "tudum.com", "tapology.com", "boxingscene.com",
    "fightmag.com", "mmafighting.com", "sherdog.com", "espn.com",
    "sports.yahoo.com", "cbssports.com", "worldboxingnews.com",
    "sportify.press", "fighttime.ru", "boxingnews24.com", "fightnews.com",
    "boxingnewsonline.net", "mmaweekly.com", "mmajunkie.usatoday.com",
    "the-independent.com", "chasecenter.com", "theo2belfast.com",
    "dazn.com", "boxing247.com", "ringmagazine.com",
)
OFFICIAL = (
    "ufc.com", "ufcespanol.com", "onefc.com", "pflmma.com", "rizinff.com",
    "matchroomboxing.com", "queensberry.co.uk", "toprank.com", "boxxer.com",
    "premierboxingchampions.com", "salitapromotions.com", "wbcboxing.com",
    "dazn.com",
)
BAD_ART = re.compile(r"logo|favicon|avatar|headshot|profile[-_]?pic|placeholder|sprite|"
                     r"advertisement|tracking|pixel\.|default[-_]?image", re.I)
ART_HINT = re.compile(r"poster|key.visual|fight.card|event.art|fightnight|"
                      r"versus|vs[-_]|promo|fight[-_]", re.I)


def host(url: str) -> str:
    try:
        parts = urlsplit(url)
        return (parts.hostname or "").lower() if parts.scheme == "https" else ""
    except ValueError:
        return ""


def trusted(url: str) -> bool:
    h = host(url)
    return bool(h) and any(h == d or h.endswith("." + d) for d in TRUSTED)


def official(url: str) -> bool:
    h = host(url)
    return bool(h) and any(h == d or h.endswith("." + d) for d in OFFICIAL)


def folded(text: str) -> str:
    x = unicodedata.normalize("NFKD", str(text or ""))
    return "".join(c for c in x if not unicodedata.combining(c)).lower()


def surname(name: str) -> str:
    words = re.findall(r"[a-zA-ZÀ-ÿ'-]+", name or "")
    return folded(words[-1]).strip("'") if words else ""


def fighters(event: dict) -> tuple[str, str]:
    bouts = event.get("bouts") or []
    main = next((b for b in bouts if b.get("section") == "main"), bouts[0] if bouts else {})
    pair = main.get("fighters") or []
    return (surname(pair[0]), surname(pair[1])) if len(pair) >= 2 else ("", "")


def matches_event(event: dict, text: str) -> bool:
    one, two = fighters(event)
    t = folded(text)
    return bool(one and two and one != two and len(one) >= 3
                and one in t and two in t)


def future_unresolved(event: dict, today: str) -> bool:
    return bool(event.get("date", "") >= today
                and not event.get("posterPortrait", {}).get("url")
                and not event.get("posterList", {}).get("url")
                and len(event.get("bouts") or []) > 0)


def fetch_text(url: str) -> str:
    if not trusted(url):
        return ""
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={"User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml"}, allow_redirects=True)
        if not r.ok or not trusted(r.url):
            return ""
        if "html" not in r.headers.get("content-type", "").lower():
            return ""
        if len(r.content) > 3_000_000:
            return ""
        return r.text
    except requests.RequestException:
        return ""


def candidates_from_page(event: dict, url: str, body: str) -> list[tuple[str, str, int]]:
    """HTML: require both fighters in the event page, then descriptive artwork."""
    soup = BeautifulSoup(body, "html.parser")
    title = " ".join(tag.get("content", "") for tag in soup.find_all(
        "meta", attrs={"property": "og:title"}))
    title += " " + (soup.title.get_text(" ", strip=True) if soup.title else "")
    title += " " + " ".join(x.get_text(" ", strip=True) for x in soup.find_all("h1")[:3])
    # A generic site-wide page or image gallery is not sufficient evidence.
    if not matches_event(event, title):
        return []
    one, two = fighters(event)
    code = re.search(r"\b(?:ufc|one|pfl|rizin)\s*[-:]?\s*\d+\b",
                     folded(event.get("title", "")))
    event_code = re.sub(r"\W+", "", code.group()) if code else ""
    images: list[tuple[str, str, int]] = []
    seen: set[str] = set()

    def add(raw: str, hint: str, meta: bool = False) -> None:
        if not raw or raw.startswith("data:"):
            return
        image_url = urljoin(url, raw)
        if not host(image_url) or image_url in seen:
            return
        joined = folded(image_url + " " + hint)
        compact = re.sub(r"\W+", "", joined)
        both = one in joined and two in joined
        specific = bool(event_code and event_code in compact)
        promo = bool(ART_HINT.search(joined))
        if BAD_ART.search(joined):
            return
        # Images on news pages are commonly irrelevant. Require identifiable
        # event artwork or a precise, event-specific OG image.
        if not (both or specific or (promo and (one in joined or two in joined))
                or (meta and official(url))):
            return
        priority = (80 if official(url) else 40) + (35 if both else 0)
        priority += (24 if specific else 0) + (16 if promo else 0)
        priority += (12 if meta else 0)
        seen.add(image_url)
        images.append((image_url, hint, priority))

    for tag in soup.find_all("meta"):
        kind = (tag.get("property") or tag.get("name") or "").lower()
        if kind in {"og:image", "og:image:secure_url", "twitter:image",
                    "twitter:image:src"}:
            add(tag.get("content", ""), "Event promotional artwork", meta=True)

    for tag in soup.find_all(["img", "source"])[:180]:
        hint = " ".join([tag.get("alt", ""), tag.get("title", "")])
        choices = [
            tag.get("data-src", ""), tag.get("data-lazy-src", ""),
            tag.get("src", "")
        ]
        srcset = tag.get("srcset") or tag.get("data-srcset") or ""
        if srcset:
            choices += [part.strip().split(" ")[0] for part in srcset.split(",")]
        for candidate in choices:
            add(candidate, hint)
    images.sort(key=lambda item: -item[2])
    return images[:MAX_IMAGES]


def image_dimensions(url: str) -> tuple[int, int] | None:
    if not host(url):
        return None
    try:
        with requests.get(url, timeout=TIMEOUT, stream=True, allow_redirects=True,
                          headers={"User-Agent": UA, "Accept": "image/*"}) as r:
            if not r.ok or not host(r.url):
                return None
            ctype = r.headers.get("content-type", "").lower()
            if ctype and not ctype.startswith("image/"):
                return None
            if int(r.headers.get("content-length") or 0) > MAX_IMAGE_BYTES:
                return None
            content = bytearray()
            for chunk in r.iter_content(65536):
                content.extend(chunk)
                if len(content) > MAX_IMAGE_BYTES:
                    return None
        with Image.open(BytesIO(content)) as img:
            w, h = img.size
        return (w, h)
    except (requests.RequestException, OSError, ValueError,
            UnidentifiedImageError, Image.DecompressionBombError):
        return None


def poster_shape(size: tuple[int, int] | None) -> str:
    if not size:
        return ""
    w, h = size
    ratio = w / h if h else 100
    if 0.52 <= ratio <= 0.92 and w >= 450 and h >= 570:
        return "posterPortrait"
    if 0.92 < ratio <= 1.10 and min(w, h) >= 600:
        return "posterList"
    return ""


def existing_sources(event: dict) -> list[str]:
    links = [event.get("source")]
    for key in ("poster", "posterLandscape"):
        v = event.get(key) or {}
        links.append(v.get("source"))
    for bout in (event.get("bouts") or [])[:8]:
        links.append(bout.get("source"))
    seen = set()
    result = []
    for link in links:
        if isinstance(link, str) and trusted(link) and link not in seen:
            seen.add(link)
            result.append(link)
    return result


def search_links(event: dict) -> list[str]:
    pair = (next((b.get("fighters", []) for b in event.get("bouts", [])
                 if b.get("section") == "main"), [])
            or (event.get("bouts") or [{}])[0].get("fighters", []))
    if len(pair) < 2:
        return []
    query = f'"{pair[0]}" "{pair[1]}" fight poster {event.get("date", "")[:4]}'
    urls = [
        "https://www.bing.com/search?format=rss&q=" + quote_plus(query),
        "https://lite.duckduckgo.com/lite/?q=" + quote_plus(query),
    ]
    found: list[str] = []
    for search_url in urls:
        try:
            r = requests.get(search_url, timeout=TIMEOUT, headers={"User-Agent": UA})
            if not r.ok or len(r.content) > 2_000_000:
                continue
            soup = BeautifulSoup(r.text, "html.parser")
            for tag in soup.find_all("a", href=True):
                link = tag.get("href", "")
                if "uddg=" in link:
                    link = unquote(parse_qs(urlsplit(link).query).get("uddg", [link])[0])
                if trusted(link) and link not in found:
                    found.append(link)
                if len(found) >= MAX_SEARCH_RESULTS:
                    break
        except requests.RequestException:
            pass
    return found


def discover(event: dict) -> dict:
    """Find a newly verified poster without changing the input event."""
    result = {"id": event["id"], "title": event.get("title"),
              "checked_sources": [], "selected": None}
    sources = existing_sources(event)
    discoveries = search_links(event)
    for url in discoveries:
        if url not in sources:
            sources.append(url)
    sources = sources[:MAX_EVENT_PAGES]
    images_seen: set[str] = set()
    options = []
    for page_url in sources:
        body = fetch_text(page_url)
        result["checked_sources"].append({"url": page_url,
                                          "status": "read" if body else "unavailable"})
        if not body:
            continue
        for img_url, hint, priority in candidates_from_page(event, page_url, body):
            if img_url in images_seen:
                continue
            images_seen.add(img_url)
            size = image_dimensions(img_url)
            shape = poster_shape(size)
            if shape:
                w, h = size
                options.append((priority + (18 if shape == "posterPortrait" else 8)
                               + (6 if w >= 850 else 0),
                               shape, img_url, page_url, w, h))
            if len(images_seen) >= 20:
                break
        if len(images_seen) >= 20:
            break
    if options:
        options.sort(key=lambda x: (-x[0], -x[4] * x[5]))
        score, field, url, source, w, h = options[0]
        result["selected"] = {"field": field, "url": url, "source": source,
                              "credit": ("Official event promotional artwork" if official(source)
                                         else "Event promotional artwork via " + host(source)),
                              "kind": ("Portrait event poster" if field == "posterPortrait"
                                       else "Square event poster"),
                              "width": w, "height": h, "score": score}
    return result


def apply_result(event: dict, result: dict) -> bool:
    poster = result.get("selected")
    if not poster or event.get("posterPortrait", {}).get("url") or event.get("posterList", {}).get("url"):
        return False
    field = poster["field"]
    event[field] = {"url": poster["url"], "source": poster["source"],
                    "credit": poster["credit"], "kind": poster["kind"],
                    "width": poster["width"], "height": poster["height"],
                    "verifiedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    dataset = json.loads(DATA.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    today = datetime.now(timezone.utc).date().isoformat()
    # Include only current/future events. A venue-local date is deliberately
    # not converted into a fictitious timestamp.
    unresolved = [e for e in dataset["events"] if future_unresolved(e, today)]
    completed: list[dict] = []
    with ThreadPoolExecutor(max_workers=POOL_SIZE) as pool:
        tasks = [pool.submit(discover, event) for event in unresolved]
        for task in as_completed(tasks):
            result = task.result()
            completed.append(result)
            print(f"Checked {result['id']}: {len(result['checked_sources'])} source pages, "
                  f"{'VERIFIED '+result['selected']['field'] if result['selected'] else 'no valid poster'}")
    by_id = {e["id"]: e for e in dataset["events"]}
    updated = []
    for result in completed:
        if apply_result(by_id[result["id"]], result):
            updated.append(result["id"])
    report = {"checkedAt": now, "unresolvedAtStart": len(unresolved),
              "newPosters": sorted(updated),
              "remainingMissing": len(unresolved) - len(updated),
              "runs": sorted(completed, key=lambda x: x["id"])}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if updated and not args.dry_run:
        DATA.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Poster check finished: {len(updated)} validated; "
          f"{len(unresolved)-len(updated)} still await a suitable poster. "
          f"{'Dry run: no data written.' if args.dry_run else ''}")


if __name__ == "__main__":
    main()
