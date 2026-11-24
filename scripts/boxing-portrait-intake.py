#!/usr/bin/env python3
"""Cache boxer photographs from promoter press kits into assets/img/boxing/.

Rights: the owner attested on 2026-11-22 that BEFN may republish fighter photographs
from Matchroom, Queensberry, BOXXER, PBC, MVP and Salita, and on 2026-11-24 the same for
Top Rank, with the promoter credited. Those attestations are the only basis for this
script; they cover nobody else, so a promoter that is not in SOURCES is never fetched.
Each row records the attestation its promoter falls under. See docs/design/IMAGE-GUIDE.md.

What it will not do:
  * fetch from a site whose robots.txt disallows us or ClaudeBot (fail closed);
  * take a photograph credited to a picture agency (Getty, AP, Reuters, ...), whose
    licence does not travel with a press kit;
  * fetch a photo twice: an id already in the register is left alone.

Where it looks, in order: each allowlisted promoter's roster, then that promoter's own
event pages (a photograph is taken only when the name beside it and its file name both
name the boxer), then Wikimedia Commons (a file picked by eye in COMMONS_PICKS, else the
Wikipedia article's lead photograph).

Usage:
  python3 -I scripts/boxing-portrait-intake.py --limit 30 [--dry-run] [--names "A,B"]
  python3 -I scripts/boxing-portrait-intake.py --names "A,B" --commons-candidates DIR
      (lists and saves thumbnails of every free Commons photograph tied to each boxer,
       for review by eye; changes nothing in the repository)
  python3 -I scripts/boxing-portrait-intake.py --names-file F --stage DIR
      (staging, for scripts/photo-runner.py: the crops go to DIR/boxing/files/ and the rows
       that would be registered to DIR/boxing/result.json; nothing under assets/ or data/
       is written, and nothing is registered until the runner's approve step)

Processing needs Pillow where it is available, and falls back to macOS `sips`, which
crops centred rather than top-biased; rows made that way carry "centredCrop": true so
a later Pillow pass can redo them.
"""
import argparse, csv, functools, hashlib, json, re, shutil, subprocess, sys, tempfile, time, unicodedata, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parent.parent
REGISTER = ROOT / "data/boxing-image-register.json"
OUT_DIR = ROOT / "assets/img/boxing"
PRIORITY = ROOT / "docs/design/boxing-photo-priority.csv"
AGENT = "BEFN-image-intake/1.0 (+https://black-eye-fight-news.onrender.com)"
# anthropic-ai added 2026-11-24 (photo runner): a site that turns away Anthropic's crawler
# token is skipped too, which only ever narrows what is fetched.
ROBOTS_AGENTS = ("befn-image-intake", "claudebot", "anthropic-ai", "*")
ATTESTATION = ("Owner attested 2026-11-22 that BEFN may republish fighter photographs "
               "from Matchroom, Queensberry, BOXXER, PBC, MVP and Salita press kits, "
               "with the promoter credited.")
# The owner's answer of 24 Nov 2026 ("Yes, I attest Top Rank") to: "You confirm BEFN may
# republish Top Rank's press-kit fighter photos with credit". Same terms as the above.
TOP_RANK_ATTESTATION = ("Owner attested 2026-11-24 that BEFN may republish Top Rank's press-kit "
                        "fighter photographs, with Top Rank credited.")
# Every attestation a row may carry, by date; the register keeps the same map.
ATTESTATIONS = {"2026-11-22": ATTESTATION, "2026-11-24": TOP_RANK_ATTESTATION}
RIGHTS_NOTE = ATTESTATION + " " + TOP_RANK_ATTESTATION
AGENCY = re.compile(r"\b(getty|gettyimages|associated[-_ ]?press|\bap\b|reuters|afp|pa[-_ ]?images|shutterstock|alamy|imago)\b", re.I)
SPECS = {"portrait": (4, 5, 480), "card": (16, 9, 800), "thumb": (1, 1, 240)}


def norm(name):
    s = unicodedata.normalize("NFD", str(name or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def slugify(name):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", norm(name))).strip("-")


def get(url, timeout=25):
    # A promoter's filename can carry an accent; percent-encode the path so urllib can send it.
    parts = urlparse(url)
    if any(ord(c) > 127 for c in url):
        url = parts._replace(path=urllib.parse.quote(parts.path, safe="/%"),
                             query=urllib.parse.quote(parts.query, safe="=&%")).geturl()
    req = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "*/*"})
    return with_backoff(lambda: _read(req, timeout))


def _read(req, timeout):
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get("Content-Type", "")


def with_backoff(call, tries=5):
    """Wait as long as a server asks when it answers 429 (Wikimedia rate-limits shared IPs)."""
    for attempt in range(tries):
        try:
            return call()
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == tries - 1:
                raise
            wait = e.headers.get("Retry-After", "")
            time.sleep(min(int(wait) if wait.isdigit() else 15, 60) + 1)


def robots_allows(site, path="/"):
    """True only when no group that applies to us disallows `path`. Fail closed on error."""
    body, last = None, ""
    for attempt in range(2):  # one retry: a timeout is not an answer either way
        try:
            body, _ = get(f"https://{site}/robots.txt", timeout=25)
            break
        except Exception as e:
            last = str(e)
    if body is None:
        return False, f"robots.txt unreadable: {last}"
    agent, rules = None, {a: [] for a in ROBOTS_AGENTS}
    for line in body.decode("utf-8", "replace").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, _, value = (p.strip() for p in line.partition(":"))
        key, value = key.lower(), value.strip()
        if key == "user-agent":
            agent = value.lower()
        elif key in ("disallow", "allow") and agent in rules:
            rules[agent].append((key, value))
    for a in ROBOTS_AGENTS:
        for kind, value in rules[a]:
            if kind == "disallow" and value and path.startswith(value.rstrip("*")):
                return False, f"robots.txt disallows {a or '*'} from {value}"
    return True, ""


# --- roster adapters: one page per promoter, name -> photo URL ----------------------

def parse_matchroom(html, base):
    out = {}
    for card in re.findall(r'<div class="boxer-card"[^>]*href="([^"]+)".*?<img[^>]+src="([^"]+)"', html, re.S):
        href, img = card
        slug = href.rstrip("/").rsplit("/", 1)[-1]
        out.setdefault(norm(slug.replace("-", " ")), (urljoin(base, img), href))
    return out


def parse_boxxer(html, base):
    out = {}
    for block in re.split(r"<article", html)[1:]:
        img = re.search(r'src="(https://www\.boxxer\.com/wp-content/uploads/[^"]+\.(?:jpg|jpeg|png|webp))"', block)
        name = re.search(r"<h2[^>]*>\s*([^<]{3,60}?)\s*</h2>", block)
        if img and name:
            out.setdefault(norm(name.group(1)), (img.group(1), base))
    return out


def parse_salita(html, base):
    out = {}
    for href in sorted(set(re.findall(r'href="(/boxers/[a-z0-9-]+)"', html))):
        out.setdefault(norm(href.rsplit("/", 1)[-1].replace("-", " ")), (None, urljoin(base, href)))
    return out


class Refused(Exception):
    """A photograph looked for and refused, with the reason recorded in the skip list."""


def salita_photo(page_url, name=None):
    html, _ = get(page_url)
    html = html.decode("utf-8", "replace")
    m = re.search(r'(https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/[^"\'\\ )]+\.(?:jpg|jpeg|png|webp))', html)
    return m.group(1) if m else None


def parse_toprank(xml, base):
    """Top Rank's roster is the fighter pages its sitemap lists (the /fighters page shows
    eleven at a time); each page carries the fighter's press-kit photograph."""
    out = {}
    for slug in sorted(set(re.findall(r"<loc>https://(?:www\.)?toprank\.com/fighters/([a-z0-9-]+)/?</loc>", xml))):
        out.setdefault(norm(slug.replace("-", " ")), (None, f"https://toprank.com/fighters/{slug}"))
    return out


def toprank_photo(page_url, name):
    """The profile photograph on a Top Rank fighter page (the hero image, served from
    api.toprank.com). Taken only when the page's own heading and the image's alt text
    both print the boxer's name and the file name carries it too."""
    for site, path in (("toprank.com", urlparse(page_url).path), ("api.toprank.com", "/storage/uploads/")):
        ok, why = robots_allows(site, path)
        if not ok:
            raise Refused(f"{site}: {why}")
    html = get(page_url)[0].decode("utf-8", "replace")
    return toprank_hero(html, name)


def toprank_hero(html, name):
    hero = re.search(r'class="fighter-hero__img"[^>]*>\s*<img\b([^>]*)>', html)
    src = hero and re.search(r'\bsrc="(https://api\.toprank\.com/storage/uploads/[^"]+)"', hero.group(1))
    if not src:
        return None
    alt = re.search(r'\balt="([^"]*)"', hero.group(1))
    h1 = re.search(r"<h1[^>]*>(?:<!--\[-->)?\s*([^<]+?)\s*(?:<!--\]-->)?</h1>", html)
    printed = {norm(alt.group(1)) if alt else "", norm(h1.group(1)) if h1 else ""}
    if printed != {norm(name)}:
        raise Refused(f"the page prints {sorted(printed)}, not {name}")
    if not name_in_file(name, src.group(1)):
        raise Refused(f"the file name does not carry the boxer's name: {src.group(1)}")
    return src.group(1)


# --- event pages: the same promoter's fight-card photographs ------------------------
# A roster lists only a promoter's current stable. Its event pages carry a photograph
# of each fighter on the card, from the same press kit, so they reach a boxer who has
# headlined for that promoter without being signed to it (Salita's 5 Dec card, or a
# Matchroom opponent). A photograph is taken from an event page only when BOTH the
# name printed beside it and its file name carry the boxer's surname: a card that
# reuses one fighter's file for the opponent ("Opetaia-oppo.png" under Claudio Squeo)
# is then refused rather than guessed at.

def name_in_file(name, url):
    """True when the file name carries one of the boxer's names whole ("Leo-thumb.webp"
    for Angelo Leo), or a 4+ letter start of one (Salita names files by first name:
    "litzy", "steph" for Stephanie)."""
    words = norm(urllib.parse.unquote(urlparse(url).path.rsplit("/", 1)[-1])).split()
    return any(w == t or (len(w) >= 4 and t.startswith(w)) for t in norm(name).split() for w in words)


@functools.lru_cache(maxsize=None)
def get_cached(url):
    return get(url)[0]


def matchroom_event_pages(name):
    body = get_cached("https://www.matchroomboxing.com/events-sitemap.xml")
    surname = slugify(name).rsplit("-", 1)[-1]
    return [u for u in re.findall(r"<loc>([^<]+)</loc>", body.decode("utf-8", "replace"))
            if "/events/" in u and surname in urlparse(u).path.rstrip("/").rsplit("/", 1)[-1].split("-")]


def parse_matchroom_event(html, page):
    """{norm(name): (photo, page)} for each fighter shown on a Matchroom fight card."""
    out = {}
    for chunk in re.split(r'class="boxer-[12]"', html)[1:]:
        img = re.search(r'<img[^>]*\bsrc="(https://www\.matchroomboxing\.com/app/uploads/[^"]+)"', chunk)
        h2 = re.search(r"<h2>(.*?)</h2>", chunk, re.S)
        if not img or not h2:
            continue
        who = re.sub(r"<p.*?</p>", " ", h2.group(1), flags=re.S)
        who = norm(re.sub(r"<[^>]+>", " ", who))
        if who and who != "tbc":
            out.setdefault(who, (img.group(1), page))
    return out


def salita_event_pages(name):
    body = get_cached("https://www.salitapromotions.com/events")
    return [urljoin("https://www.salitapromotions.com/", h) for h in
            sorted(set(re.findall(r'href="(/events/[a-z0-9-]+-vs-[a-z0-9-]+)"', body.decode("utf-8", "replace"))))]


def parse_salita_event(html, page):
    """Salita's event hero: one photograph per side of the headline, in billing order
    (left, then right), and the page's own "A vs B" title names the sides."""
    title = re.search(r"<title>([^<·|]+?)\s+vs\.?\s+([^<·|]+?)\s*[·|<]", html)
    if not title:
        return {}
    hero = []
    for url in re.findall(r'(https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/public-media/[^"&\\ )]+\.(?:jpg|jpeg|png|webp))',
                          urllib.parse.unquote(html)):
        if url not in hero and "-vs-" not in url:
            hero.append(url)
    if len(hero) < 2:
        return {}
    out = {}
    card = norm(re.sub(r"<[^>]+>", " ", html))
    for side, url in zip(title.groups(), hero[:2]):
        # The title gives surnames only: key the photograph by every "<first> <surname>"
        # the card prints, and name_in_file() then has to agree with the one looked up.
        for first in re.findall(r"\b([a-z]+) " + re.escape(norm(side)) + r"\b", card):
            out.setdefault(f"{first} {norm(side)}", (url, page))
    return out


# A lazy-load placeholder ("-30x17.jpg") or a flag icon is not a photograph of anyone.
THUMBNAIL = re.compile(r"-\d{1,3}x\d{1,3}\.\w+$|\.svg$", re.I)

EVENT_PAGES = {"matchroom": (matchroom_event_pages, parse_matchroom_event),
               "salita": (salita_event_pages, parse_salita_event)}


SOURCES = [
    {"id": "matchroom", "promoter": "Matchroom Boxing", "site": "www.matchroomboxing.com",
     "roster": "https://www.matchroomboxing.com/boxers-2/", "parse": parse_matchroom},
    {"id": "boxxer", "promoter": "BOXXER", "site": "www.boxxer.com",
     "roster": "https://www.boxxer.com/fighters/", "parse": parse_boxxer},
    {"id": "salita", "promoter": "Salita Promotions", "site": "www.salitapromotions.com",
     "roster": "https://www.salitapromotions.com/boxers", "parse": parse_salita,
     "photo": salita_photo},
    # Owner attestation of 2026-11-24. Top Rank's event pages carry only the event's key
    # art, no photograph per fighter, so it has no event-page adapter.
    {"id": "toprank", "promoter": "Top Rank", "site": "toprank.com",
     "roster": "https://toprank.com/sitemap.xml", "parse": parse_toprank,
     "photo": toprank_photo, "attestation": TOP_RANK_ATTESTATION},
]
# Promoters covered by the attestation but not fetched, with the reason. Their photos
# need the owner to supply them by hand until the reason changes.
# A roster whose page address misspells a boxer: (source, our name) -> the roster's key.
# Each was checked against the boxer's own page on that roster, whose title spells the
# name correctly, so the photograph is of the boxer we mean.
ROSTER_SPELLING = {
    ("matchroom", "diego pacheco"): "diego pachecho",  # /boxers/diego-pachecho/, titled "Diego Pacheco"
}
NOT_FETCHED = {
    "PBC": "premierboxingchampions.com answers an automated request with HTTP 403",
    "MVP": "mostvaluablepromotions.com robots.txt disallows ClaudeBot and sets ai-train=no",
    "Queensberry": ("queensberry.co.uk is the merchandise store and carries no fighter roster; "
                    "queensberrypromotions.com is a parked domain (checked 2026-11-24)"),
}


# --- Wikimedia Commons: the second source, for boxers no press kit reaches ----------
# Owner approved it on 2026-11-22. Only freely licensed files, only where the English
# Wikipedia article says the subject is a boxer, and every photographer is credited on
# photo-credits.html, which is what CC BY and CC BY-SA ask for in return.
# Commons lead photographs vary: some are studio portraits, some are a moment at
# ringside. These were looked at and rejected, so a later run does not take them back.
# A boxer listed here keeps the tile until a usable photograph exists.
REVIEWED_OUT = {
    "keith-thurman": "the lead photograph is two fighters mid-exchange; which one he is cannot be told from a thumbnail",
    "ramla-ali": "the lead photograph is a ringside moment in black and white with her face turned away",
    "erislandy-lara": "the lead photograph is mid-fight, side-on, and the face is small at thumbnail size",
    "carlos-adames": "the lead photograph is a training shot with his hand across his face",
    # 2026-11-24 batch (champions and coming-up cards)
    "daniel-dubois": "the lead photograph is a ring walk in a crowd: a dozen people in frame and his face small",
    "oshaquie-foster": "the lead photograph is a podcast still: hood up and a microphone across his mouth",
}

# Press-kit photographs fetched, looked at and not used (same reasons as above).
REVIEWED_OUT_PRESS = {
    # 2026-11-24 (Top Rank run): clear studio portraits, but the roster's file name does
    # not name the boxer, so nothing but the roster's link ties the photograph to him.
    "andy-cruz": "the roster's file name (PJAF6801-copy.jpeg) does not name him",
    "shakhram-giyasov": "the roster's file name (EM1_9245) does not name him",
}

# Commons beyond the lead photograph (2026-11-24): `--commons-candidates DIR` lists every
# free photograph in a boxer's Commons category, and every file found by name with
# boxing in its categories or description, and saves a thumbnail of each to DIR. A
# person looks at them; the one that is a clear, single-subject face shot is named here
# (slug -> Commons file), and only a file named here is ever taken from that search.
# Its licence, size and agency checks are run again at fetch time.
COMMONS_PICKS = {
}
# Candidates looked at and not used, with the reason, so a later look starts without them.
REVIEWED_OUT_FILES = {
    # 2026-11-24, looked at by eye
    "File:Gemälde Agit Kabayel.jpg": "a painted mural of him, not a photograph",
    "File:Daniel Dubois walkout (cropped).jpg": "the same ring walk as the lead: security, camera crew and his face small",
    "File:Daniel Dubois walkout.jpg": "a ring walk seen from the stands: a crowd, his face tiny",
    "File:Erislandy Lara.jpg": "the lead photograph already reviewed out: mid-fight, side-on, face small",
    "File:Russell vs Masuk Rio2016.jpg": "two boxers in a clinch at Rio 2016, his face turned away",
}

FREE_LICENCE = re.compile(r"^(cc[ -]?by([ -]?sa)?([ -]?\d(\.\d)?)?|cc0|public domain|pd[- ])", re.I)
WIKI_UA = {"User-Agent": AGENT}


def wiki_api(host, params):
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers=WIKI_UA)
    time.sleep(0.5)  # stay well inside Wikimedia's rate limit
    return json.loads(with_backoff(lambda: _read(req, 25))[0])


def wiki_article(name):
    """The English Wikipedia lead of this boxer's article. When the plain name is someone
    else (Josh Kelly the actor) or a disambiguation page, try "<name> (boxer)", which is
    still accepted only if its own lead calls the subject a boxer."""
    name = name.replace("’", "'")  # Wikipedia titles use a straight apostrophe
    for title in (name, f"{name} (boxer)"):
        page = list(wiki_api("en.wikipedia.org", {
            "action": "query", "titles": title, "prop": "pageimages|extracts|pageprops", "piprop": "original", "ppprop": "wikibase_item",
            "exintro": 1, "explaintext": 1, "exsentences": 2, "redirects": 1}).get("query", {}).get("pages", {}).values())[0]
        intro = page.get("extract") or ""
        if re.search(r"\bbox(er|ing)\b", intro, re.I) and "may refer to" not in intro:
            return page
    return None


def commons_file(title):
    """Licence, size and credit of one Commons file, or (None, why). Fail closed: a file
    that is not on Commons, whose licence is not a free one, which is credited to a
    picture agency, or which is under 400 px wide is refused."""
    info = list(wiki_api("commons.wikimedia.org", {
        "action": "query", "titles": title, "prop": "imageinfo|categories", "cllimit": "max",
        "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 480}).get("query", {}).get("pages", {}).values())[0]
    if "missing" in info or not info.get("imageinfo"):
        return None, "the photograph is not on Commons (so not freely licensed)"
    ii = info["imageinfo"][0]
    meta = ii.get("extmetadata", {})
    licence = (meta.get("LicenseShortName", {}).get("value") or "").strip()
    if not FREE_LICENCE.match(licence):
        return None, f"licence is not a free one: {licence or 'unstated'}"
    if (ii.get("width") or 0) < 400:
        return None, f"only {ii.get('width')}px wide"
    if ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
        return None, f"not a photograph: {ii.get('mime')}"
    plain = lambda k: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", meta.get(k, {}).get("value") or "")).strip()
    artist = plain("Artist") or "Unknown photographer"
    if AGENCY.search(" ".join((artist, plain("Credit"), plain("Attribution")))):
        return None, "agency photograph: licence unclear"
    artist = artist[:120]
    return {"url": ii["url"], "thumb": ii.get("thumburl", ""), "artist": artist, "licence": licence,
            "licenceUrl": (meta.get("LicenseUrl", {}).get("value") or "").strip(),
            "filePage": ii.get("descriptionurl", ""), "title": info.get("title", title),
            "categories": [c["title"] for c in info.get("categories", [])],
            "description": plain("ImageDescription")[:300],
            "credit": f"{artist} · {licence} via Wikimedia Commons"}, ""


def commons_photo(name):
    """A free Commons photograph of this boxer: the one picked by eye from the Commons
    search (COMMONS_PICKS) when there is one, else the Wikipedia article's lead photograph."""
    page = wiki_article(name)
    if page is None:
        return None, "no English Wikipedia article calling them a boxer"
    pick = COMMONS_PICKS.get(slugify(name))
    if pick:
        return commons_file(pick)
    if slugify(name) in REVIEWED_OUT:
        return None, "lead photograph reviewed and not used: " + REVIEWED_OUT[slugify(name)]
    source = (page.get("original") or {}).get("source", "")
    if not source:
        return None, "the article carries no free lead photograph"
    filename = urllib.parse.unquote(urllib.parse.urlparse(source).path.split("/")[-1])
    return commons_file("File:" + filename)


def commons_category(page):
    """The boxer's Commons category: Wikidata's P373 for the article, which ties the
    category to this boxer rather than to anyone else of the same name."""
    item = (page.get("pageprops") or {}).get("wikibase_item")
    if not item:
        return None
    claims = wiki_api("www.wikidata.org", {"action": "wbgetclaims", "entity": item, "property": "P373"}).get("claims", {})
    for c in claims.get("P373", []):
        value = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if value:
            return "Category:" + value
    # No P373: a Commons category named exactly as the article is the next best tie,
    # provided its own page says boxing (a namesake's category would not).
    title = "Category:" + page.get("title", "")
    cat = list(wiki_api("commons.wikimedia.org", {
        "action": "query", "titles": title, "prop": "revisions", "rvprop": "content", "rvslots": "main"}
        ).get("query", {}).get("pages", {}).values())[0]
    text = json.dumps(cat.get("revisions", ""))
    if "missing" not in cat and re.search(r"box(er|ing)", text, re.I):
        return title
    return None


def commons_candidates(name):
    """Every free photograph on Commons that can be tied to this boxer, for a person to
    look at: the files in the boxer's own category (and its direct subcategories), and
    files found by name whose categories or description also say boxing. Nothing found
    here is used until it is named in COMMONS_PICKS."""
    page = wiki_article(name)
    if page is None:
        return [], "no English Wikipedia article calling them a boxer"
    titles, cat = [], commons_category(page)
    if cat:
        cats = [cat] + [m["title"] for m in wiki_api("commons.wikimedia.org", {
            "action": "query", "list": "categorymembers", "cmtitle": cat, "cmtype": "subcat",
            "cmlimit": 20}).get("query", {}).get("categorymembers", [])]
        for c in cats:
            titles += [m["title"] for m in wiki_api("commons.wikimedia.org", {
                "action": "query", "list": "categorymembers", "cmtitle": c, "cmtype": "file",
                "cmlimit": 60}).get("query", {}).get("categorymembers", [])]
    by_name = [m["title"] for m in wiki_api("commons.wikimedia.org", {
        "action": "query", "list": "search", "srsearch": f'"{name}"', "srnamespace": 6,
        "srlimit": 30}).get("query", {}).get("search", [])]
    out, why = [], []
    for title in dict.fromkeys(titles + by_name):
        if title in REVIEWED_OUT_FILES:
            continue
        found, reason = commons_file(title)
        if not found:
            why.append(f"{title}: {reason}")
            continue
        in_cat = cat in found["categories"]
        text = " ".join(found["categories"] + [found["description"], found["title"]])
        if not in_cat and not (norm(name) in norm(text) and re.search(r"\bbox(er|ing)\b", text, re.I)):
            why.append(f"{title}: not tied to this boxer (outside his category, no boxing context)")
            continue
        out.append(found)
    return out, f"category {cat or 'none'}; " + "; ".join(why)


def review_commons(names, out_dir):
    """Write thumbnails of each boxer's Commons candidates for a person to look at, and
    candidates.json with their licence and photographer. Changes nothing in the repository."""
    out_dir.mkdir(parents=True, exist_ok=True)
    listing = {}
    for name in names:
        try:
            found, why = commons_candidates(name)
        except Exception as e:
            found, why = [], f"Commons lookup failed: {e}"
        listing[slugify(name)] = {"name": name, "note": why, "candidates": []}
        for i, f in enumerate(found):
            thumb = out_dir / f"{slugify(name)}-{i}.jpg"
            try:
                thumb.write_bytes(get(f["thumb"] or f["url"])[0])
                thumb = str(thumb)
            except Exception as e:
                thumb = f"thumbnail failed: {e}"
            listing[slugify(name)]["candidates"].append({**f, "file": thumb})
        print(f"{name}: {len(found)} candidate(s)")
    (out_dir / "candidates.json").write_text(json.dumps(listing, indent=1, ensure_ascii=False), encoding="utf-8")
    return 0


def wanted_names(limit, only, names_file=""):
    if names_file:
        return [n.strip() for n in Path(names_file).read_text(encoding="utf-8").splitlines() if n.strip()]
    if only:
        return [n.strip() for n in only.split(",") if n.strip()]
    rows = list(csv.DictReader(PRIORITY.open(encoding="utf-8-sig")))
    return [r["name"] for r in rows][:limit]


def process(src, slug, report):
    """Write the three crops. Pillow where there is one, else macOS sips (centred)."""
    try:
        from PIL import Image, ImageOps  # noqa: F401
    except ImportError:
        return sips_crops(src, slug, report)
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(src))
    bias = 0.1  # top-biased crop: heads sit high in a press photograph
    fetched = im.size  # recorded as originalSize, before any trimming
    if im.mode in ("RGBA", "LA", "P") and "A" in im.convert("RGBA").getbands():
        # Fight-card photographs are often cut-outs with a transparent surround. Trim to
        # what is visible (else the crop is mostly empty margin), then lay it on a flat
        # near-black, which is what the studio photographs beside it look like; a plain
        # convert("RGB") shows whatever colour sits under the transparent pixels.
        rgba = im.convert("RGBA")
        box = rgba.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
        if box:
            rgba = rgba.crop(box)
        # A cut-out figure (top row mostly clear) has the crown of the head on the top
        # edge, so the usual 10% top bias would cut into it: give it headroom instead.
        top = rgba.getchannel("A").crop((0, 0, rgba.width, 1)).point(lambda a: 1 if a > 16 else 0)
        pad = round(rgba.height * 0.05) if sum(top.getdata()) < rgba.width / 2 else 0
        flat = Image.new("RGBA", (rgba.width, rgba.height + pad), (17, 17, 17, 255))
        flat.alpha_composite(rgba, (0, pad))
        im, bias = flat, (0.0 if pad else bias)
    im = im.convert("RGB")
    w, h = im.size
    files = {}
    for kind, (rw, rh, maxw) in SPECS.items():
        target = rw / rh
        if w / h > target:
            cw, ch = round(h * target), h
            box = ((w - cw) // 2, 0, (w - cw) // 2 + cw, ch)
        else:
            cw, ch = w, round(w / target)
            box = (0, round((h - ch) * bias), cw, round((h - ch) * bias) + ch)
        crop = im.crop(box)
        if crop.width > maxw:
            crop = crop.resize((maxw, round(maxw * rh / rw)), Image.LANCZOS)
        name = f"{slug}-{kind}.webp"
        crop.save(OUT_DIR / name, "WEBP", quality=82, method=5)
        files[kind] = name
    return files, False, fetched


def sips_crops(src, slug, report):
    if not shutil.which("sips"):
        raise RuntimeError("no Pillow and no sips: cannot make crops")
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(src)],
                         capture_output=True, text=True, check=True).stdout
    w = int(re.search(r"pixelWidth: (\d+)", out).group(1))
    h = int(re.search(r"pixelHeight: (\d+)", out).group(1))
    files = {}
    for kind, (rw, rh, maxw) in SPECS.items():
        target = rw / rh
        cw, ch = (round(h * target), h) if w / h > target else (w, round(w / target))
        name = f"{slug}-{kind}.webp"
        dst = OUT_DIR / name
        subprocess.run(["sips", "-s", "format", "webp", "-s", "formatOptions", "82",
                        "-c", str(ch), str(cw), str(src), "--out", str(dst)],
                       capture_output=True, check=True)
        if cw > maxw:
            subprocess.run(["sips", "--resampleWidth", str(maxw), str(dst)], capture_output=True, check=True)
        files[kind] = name
    return files, True, (w, h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=30, help="how far down the priority list to go")
    ap.add_argument("--names", default="", help="comma-separated names instead of the list")
    ap.add_argument("--dry-run", action="store_true", help="say what would be fetched, write nothing")
    ap.add_argument("--no-wikimedia", action="store_true", help="press kits only; skip the Commons fallback")
    ap.add_argument("--commons-candidates", metavar="DIR", default="",
                    help="list the Commons photographs of --names for review, thumbnails into DIR; fetch nothing else")
    ap.add_argument("--no-events", action="store_true", help="rosters only; skip the promoters' event pages")
    ap.add_argument("--names-file", default="", help="one name per line, instead of --names or the list")
    ap.add_argument("--stage", metavar="DIR", default="",
                    help="staging: crops into DIR/boxing/files/, rows into DIR/boxing/result.json; registers nothing")
    args = ap.parse_args()
    global OUT_DIR
    if args.stage:
        OUT_DIR = Path(args.stage) / "boxing" / "files"

    if args.commons_candidates:
        return review_commons(wanted_names(args.limit, args.names, args.names_file), Path(args.commons_candidates))
    register = json.loads(REGISTER.read_text(encoding="utf-8")) if REGISTER.exists() else {
        "version": 1, "sport": "boxing", "basePath": "assets/img/boxing/",
        "rights": "promoter-press-kit, wikimedia-cc", "images": [], "skipped": []}
    register["rightsNote"] = RIGHTS_NOTE
    register["attestations"] = dict(ATTESTATIONS)
    have = {r["id"] for r in register["images"]}
    want = wanted_names(args.limit, args.names, args.names_file)
    held = len(register["images"])  # rows appended after this are the ones this run took
    want_keys = {norm(n): n for n in want}
    report, added, skipped = [], [], []
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for src in SOURCES:
        ok, why = robots_allows(src["site"], urlparse(src["roster"]).path)
        if not ok:
            report.append(f"{src['id']}: skipped, {why}")
            continue
        try:
            body, _ = get(src["roster"])
            roster = src["parse"](body.decode("utf-8", "replace"), src["roster"])
        except Exception as e:
            report.append(f"{src['id']}: roster unreadable: {e}")
            continue
        report.append(f"{src['id']}: {len(roster)} boxers on the roster page")

        def take(key, name, photo, page, via):
            slug = slugify(name)
            try:
                if photo is None and src.get("photo"):
                    try:
                        photo = src["photo"](page, name)
                    except Refused as e:
                        skipped.append({"name": name, "promoter": src["promoter"], "reason": str(e)})
                        return
                if not photo:
                    skipped.append({"name": name, "promoter": src["promoter"], "reason": "no photo on the page"})
                    return
                if AGENCY.search(photo):
                    skipped.append({"name": name, "promoter": src["promoter"], "reason": "agency photograph: licence does not transfer"})
                    return
                if slug in REVIEWED_OUT_PRESS:
                    skipped.append({"name": name, "promoter": src["promoter"],
                                    "reason": "press-kit photograph reviewed and not used: " + REVIEWED_OUT_PRESS[slug]})
                    return
                if args.dry_run:
                    report.append(f"  would fetch {name} <- {photo} ({via})")
                    return
                data, ctype = get(photo)
                if not ctype.lower().startswith("image/"):
                    skipped.append({"name": name, "promoter": src["promoter"], "reason": f"not an image: {ctype}"})
                    return
                with tempfile.TemporaryDirectory() as tmp:
                    raw = Path(tmp) / "original"
                    raw.write_bytes(data)
                    files, centred, size = process(raw, slug, report)
                row = {"id": slug, "name": name, "files": files, "credit": src["promoter"],
                       "promoter": src["promoter"], "sourceUrl": photo, "sourcePage": page,
                       "rights": "promoter-press-kit", "attestation": src.get("attestation", ATTESTATION),
                       "sha256": hashlib.sha256(data).hexdigest(),
                       "originalSize": f"{size[0]}x{size[1]}",
                       "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}
                if via != "roster":
                    row["via"] = via
                if centred:
                    row["centredCrop"] = True
                if size[0] < 480:
                    row["lowRes"] = True
                register["images"].append(row)
                have.add(slug)
                added.append(name)
            except Exception as e:
                skipped.append({"name": name, "promoter": src["promoter"], "reason": f"fetch failed: {e}"})
            finally:
                want_keys.pop(key, None)

        for key, name in list(want_keys.items()):
            rkey = ROSTER_SPELLING.get((src["id"], key), key)
            if rkey in roster and slugify(name) not in have:
                take(key, name, *roster[rkey], "roster")

        # Then the same promoter's fight cards, for a boxer its roster does not list.
        if src["id"] not in EVENT_PAGES or args.no_events:
            continue
        pages_for, parse_event = EVENT_PAGES[src["id"]]
        for key, name in list(want_keys.items()):
            if slugify(name) in have:
                continue
            found = []
            try:
                for page in pages_for(name):
                    ok, why = robots_allows(src["site"], urlparse(page).path)
                    if not ok:
                        report.append(f"  {src['id']} event page skipped: {why}")
                        continue
                    html = get_cached(page).decode("utf-8", "replace")
                    # "O'Shaquie" on the card, "O’Shaquie" in our data: compare without spaces.
                    hit = next((v for k, v in parse_event(html, page).items()
                                if k.replace(" ", "") == key.replace(" ", "")), None)
                    if hit and name_in_file(name, hit[0]) and not THUMBNAIL.search(hit[0]):
                        found.append(hit)
            except Exception as e:
                report.append(f"  {src['id']} event pages for {name} unreadable: {e}")
                continue
            if found:
                # The newest upload (/uploads/YYYY/MM/ or /YYYY-MM/) is the most recent likeness.
                found.sort(key=lambda h: re.findall(r"/(20\d\d)[/-](\d\d)/", h[0]) or [("0", "0")], reverse=True)
                take(key, name, found[0][0], found[0][1], "event page")

    # Second source: Commons, for the boxers no press kit we can reach carries.
    taken_from_commons = 0
    for key, name in list(want_keys.items()):
        slug = slugify(name)
        if slug in have or args.no_wikimedia:
            continue
        try:
            found, why = commons_photo(name)
        except Exception as e:
            found, why = None, f"Commons lookup failed: {e}"
        if not found:
            skipped.append({"name": name, "reason": f"no press kit, and Commons: {why}"})
            want_keys.pop(key, None)
            continue
        if args.dry_run:
            report.append(f"  would fetch {name} from Commons <- {found['credit']}")
            want_keys.pop(key, None)
            continue
        try:
            data, ctype = get(found["url"])
            if not ctype.lower().startswith("image/"):
                raise RuntimeError(f"not an image: {ctype}")
            with tempfile.TemporaryDirectory() as tmp:
                raw = Path(tmp) / "original"
                raw.write_bytes(data)
                files, centred, size = process(raw, slug, report)
            row = {"id": slug, "name": name, "files": files, "credit": found["credit"],
                   "photographer": found["artist"], "licence": found["licence"],
                   "licenceUrl": found["licenceUrl"], "sourceUrl": found["url"],
                   "sourcePage": found["filePage"], "rights": "wikimedia-cc",
                   "changes": "Cropped to BEFN's portrait, card and thumbnail shapes and converted to WebP.",
                   "sha256": hashlib.sha256(data).hexdigest(),
                   "originalSize": f"{size[0]}x{size[1]}",
                   "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            if centred:
                row["centredCrop"] = True
            register["images"].append(row)
            have.add(slug)
            added.append(name + " (Commons)")
            taken_from_commons += 1
        except Exception as e:
            skipped.append({"name": name, "reason": f"Commons fetch failed: {e}"})
        want_keys.pop(key, None)
    if not args.no_wikimedia:
        report.append(f"wikimedia commons: {taken_from_commons} taken")

    for key, name in want_keys.items():
        skipped.append({"name": name, "reason": "not on any allowlisted promoter roster"})
    for promoter, why in NOT_FETCHED.items():
        report.append(f"{promoter}: not fetched, {why}")

    if args.stage and not args.dry_run:
        # Staging: the rows exactly as they would be registered, for a person to look at
        # first. `scripts/photo-runner.py approve` registers the ones that pass.
        (Path(args.stage) / "boxing" / "result.json").write_text(json.dumps(
            {"images": register["images"][held:], "skipped": skipped, "report": report},
            indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    elif not args.dry_run:
        register["generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        register["images"].sort(key=lambda r: r["id"])
        # A run over part of the list (--names) keeps what earlier runs recorded for the
        # names it did not look at, and drops a skip for anyone who now has a photo.
        looked_at = {norm(n) for n in want} | {norm(r["name"]) for r in skipped}
        earlier = [r for r in register.get("skipped", [])
                   if norm(r["name"]) not in looked_at and slugify(r["name"]) not in have]
        register["skipped"] = sorted(earlier + skipped, key=lambda r: r["name"])
        REGISTER.write_text(json.dumps(register, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print("\n".join(report))
    print(f"added {len(added)}: {', '.join(sorted(added)) or '-'}")
    print(f"not taken {len(skipped)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
