#!/usr/bin/env python3
"""Cache boxer photographs from promoter press kits into assets/img/boxing/.

Rights: the owner attested on 2026-11-22 that BEFN may republish fighter photographs
from the promoters listed in SOURCES, with the promoter credited. That attestation is
the only basis for this script; it covers nobody else, so a promoter that is not in
SOURCES is never fetched. See docs/design/IMAGE-GUIDE.md.

What it will not do:
  * fetch from a site whose robots.txt disallows us or ClaudeBot (fail closed);
  * take a photograph credited to a picture agency (Getty, AP, Reuters, ...), whose
    licence does not travel with a press kit;
  * fetch a photo twice: an id already in the register is left alone.

Usage:
  python3 -I scripts/boxing-portrait-intake.py --limit 30 [--dry-run] [--names "A,B"]

Processing needs Pillow where it is available, and falls back to macOS `sips`, which
crops centred rather than top-biased; rows made that way carry "centredCrop": true so
a later Pillow pass can redo them.
"""
import argparse, csv, hashlib, json, re, shutil, subprocess, sys, tempfile, unicodedata, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parent.parent
REGISTER = ROOT / "data/boxing-image-register.json"
OUT_DIR = ROOT / "assets/img/boxing"
PRIORITY = ROOT / "docs/design/boxing-photo-priority.csv"
AGENT = "BEFN-image-intake/1.0 (+https://black-eye-fight-news.onrender.com)"
ROBOTS_AGENTS = ("befn-image-intake", "claudebot", "*")
ATTESTATION = ("Owner attested 2026-11-22 that BEFN may republish fighter photographs "
               "from Matchroom, Queensberry, BOXXER, PBC, MVP and Salita press kits, "
               "with the promoter credited.")
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
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get("Content-Type", "")


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


def salita_photo(page_url):
    html, _ = get(page_url)
    html = html.decode("utf-8", "replace")
    m = re.search(r'(https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/[^"\'\\ )]+\.(?:jpg|jpeg|png|webp))', html)
    return m.group(1) if m else None


SOURCES = [
    {"id": "matchroom", "promoter": "Matchroom Boxing", "site": "www.matchroomboxing.com",
     "roster": "https://www.matchroomboxing.com/boxers-2/", "parse": parse_matchroom},
    {"id": "boxxer", "promoter": "BOXXER", "site": "www.boxxer.com",
     "roster": "https://www.boxxer.com/fighters/", "parse": parse_boxxer},
    {"id": "salita", "promoter": "Salita Promotions", "site": "www.salitapromotions.com",
     "roster": "https://www.salitapromotions.com/boxers", "parse": parse_salita,
     "photo": salita_photo},
]
# Promoters covered by the attestation but not fetched, with the reason. Their photos
# need the owner to supply them by hand until the reason changes.
NOT_FETCHED = {
    "PBC": "premierboxingchampions.com answers an automated request with HTTP 403",
    "MVP": "mostvaluablepromotions.com robots.txt disallows ClaudeBot and sets ai-train=no",
    "Queensberry": "queensberry.co.uk is the merchandise store; it carries no fighter roster",
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
}

FREE_LICENCE = re.compile(r"^(cc[ -]?by([ -]?sa)?([ -]?\d(\.\d)?)?|cc0|public domain|pd[- ])", re.I)
WIKI_UA = {"User-Agent": AGENT}


def wiki_api(host, params):
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers=WIKI_UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read())


def commons_photo(name):
    """A free Commons photograph of this boxer, with its licence and photographer."""
    page = list(wiki_api("en.wikipedia.org", {
        "action": "query", "titles": name, "prop": "pageimages|extracts", "piprop": "original",
        "exintro": 1, "explaintext": 1, "exsentences": 2, "redirects": 1}).get("query", {}).get("pages", {}).values())[0]
    intro = page.get("extract") or ""
    if not re.search(r"\bbox(er|ing)\b", intro, re.I):
        return None, "no English Wikipedia article calling them a boxer"
    source = (page.get("original") or {}).get("source", "")
    if not source:
        return None, "the article carries no free lead photograph"
    filename = urllib.parse.unquote(urllib.parse.urlparse(source).path.split("/")[-1])
    info = list(wiki_api("commons.wikimedia.org", {
        "action": "query", "titles": "File:" + filename, "prop": "imageinfo",
        "iiprop": "url|extmetadata|size"}).get("query", {}).get("pages", {}).values())[0]
    if "missing" in info or not info.get("imageinfo"):
        return None, "the lead photograph is not on Commons (so not freely licensed)"
    ii = info["imageinfo"][0]
    meta = ii.get("extmetadata", {})
    licence = (meta.get("LicenseShortName", {}).get("value") or "").strip()
    if not FREE_LICENCE.match(licence):
        return None, f"licence is not a free one: {licence or 'unstated'}"
    if (ii.get("width") or 0) < 400:
        return None, f"only {ii.get('width')}px wide"
    artist = re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value") or "").strip() or "Unknown photographer"
    artist = re.sub(r"\s+", " ", artist)[:120]
    return {"url": ii["url"], "artist": artist, "licence": licence,
            "licenceUrl": (meta.get("LicenseUrl", {}).get("value") or "").strip(),
            "filePage": ii.get("descriptionurl", ""),
            "credit": f"{artist} · {licence} via Wikimedia Commons"}, ""


def wanted_names(limit, only):
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
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    w, h = im.size
    files = {}
    for kind, (rw, rh, maxw) in SPECS.items():
        target = rw / rh
        if w / h > target:
            cw, ch = round(h * target), h
            box = ((w - cw) // 2, 0, (w - cw) // 2 + cw, ch)
        else:
            cw, ch = w, round(w / target)
            box = (0, round((h - ch) * 0.1), cw, round((h - ch) * 0.1) + ch)
        crop = im.crop(box)
        if crop.width > maxw:
            crop = crop.resize((maxw, round(maxw * rh / rw)), Image.LANCZOS)
        name = f"{slug}-{kind}.webp"
        crop.save(OUT_DIR / name, "WEBP", quality=82, method=5)
        files[kind] = name
    return files, False, (w, h)


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
    args = ap.parse_args()

    register = json.loads(REGISTER.read_text(encoding="utf-8")) if REGISTER.exists() else {
        "version": 1, "sport": "boxing", "basePath": "assets/img/boxing/",
        "rights": "promoter-press-kit, wikimedia-cc", "rightsNote": ATTESTATION, "images": [], "skipped": []}
    have = {r["id"] for r in register["images"]}
    want = wanted_names(args.limit, args.names)
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
        for key, name in list(want_keys.items()):
            if key not in roster:
                continue
            slug = slugify(name)
            if slug in have:
                continue
            photo, page = roster[key]
            try:
                if photo is None and src.get("photo"):
                    photo = src["photo"](page)
                if not photo:
                    skipped.append({"name": name, "promoter": src["promoter"], "reason": "no photo on the page"})
                    continue
                if AGENCY.search(photo):
                    skipped.append({"name": name, "promoter": src["promoter"], "reason": "agency photograph: licence does not transfer"})
                    continue
                if args.dry_run:
                    report.append(f"  would fetch {name} <- {photo}")
                    want_keys.pop(key, None)
                    continue
                data, ctype = get(photo)
                if not ctype.lower().startswith("image/"):
                    skipped.append({"name": name, "promoter": src["promoter"], "reason": f"not an image: {ctype}"})
                    continue
                with tempfile.TemporaryDirectory() as tmp:
                    raw = Path(tmp) / "original"
                    raw.write_bytes(data)
                    files, centred, size = process(raw, slug, report)
                row = {"id": slug, "name": name, "files": files, "credit": src["promoter"],
                       "promoter": src["promoter"], "sourceUrl": photo, "sourcePage": page,
                       "rights": "promoter-press-kit", "attestation": ATTESTATION,
                       "sha256": hashlib.sha256(data).hexdigest(),
                       "originalSize": f"{size[0]}x{size[1]}",
                       "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}
                if centred:
                    row["centredCrop"] = True
                if size[0] < 480:
                    row["lowRes"] = True
                register["images"].append(row)
                have.add(slug)
                added.append(name)
            except Exception as e:
                skipped.append({"name": name, "promoter": src["promoter"], "reason": f"fetch failed: {e}"})
            want_keys.pop(key, None)

    # Second source: Commons, for the boxers no press kit we can reach carries.
    taken_from_commons = 0
    for key, name in list(want_keys.items()):
        slug = slugify(name)
        if slug in have or args.no_wikimedia:
            continue
        if slug in REVIEWED_OUT:
            skipped.append({"name": name, "reason": "Commons photograph reviewed and not used: " + REVIEWED_OUT[slug]})
            want_keys.pop(key, None)
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

    if not args.dry_run:
        register["generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        register["images"].sort(key=lambda r: r["id"])
        register["skipped"] = sorted(skipped, key=lambda r: r["name"])
        REGISTER.write_text(json.dumps(register, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print("\n".join(report))
    print(f"added {len(added)}: {', '.join(sorted(added)) or '-'}")
    print(f"not taken {len(skipped)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
