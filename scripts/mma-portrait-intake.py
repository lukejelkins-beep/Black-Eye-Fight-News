#!/usr/bin/env python3
"""Cache fighter photographs from the other MMA promoters into assets/img/mma/.

Rights: the owner's attestation of 2026-11-24, given in answer to the question
  "For 'MMA (other promotions)', do you confirm BEFN may republish press-kit/media fighter
   photos from these promoters, with the promoter credited?"
with PFL, ONE Championship, KSW, RIZIN and Cage Warriors selected. That attestation is the
only basis for this script and it covers nobody else: a promoter that is not in ADAPTERS is
never fetched, and every row is credited to its promoter and carries that promoter's
attestation text (ATTESTATIONS). UFC is not here (scripts/pull-ufc-hires-photos.py), nor
boxing (scripts/boxing-portrait-intake.py). See docs/design/IMAGE-GUIDE.md.

The fetching rules are the boxing intake's, imported from it rather than copied:
  * robots.txt is read for every host before a page or a photograph is fetched, and a host
    that disallows us, ClaudeBot or anthropic-ai, or whose robots.txt cannot be read, is
    skipped (fail closed); a 403, 429 or anti-bot page is reported, never worked around;
  * a photograph credited to a picture agency (Getty, AP, Reuters, ...) is refused;
  * a photograph is taken only from the promoter's own page for that fighter, when the page
    prints the fighter's name, the image itself is labelled with it (alt text or the
    promoter's own record) AND its file name carries it; otherwise it is refused with the
    reason, as the boxing intake refuses a fight-card file that names someone else;
  * a fighter who already has a UFC or boxing photograph is left alone (the local image map
    drops a name two registers share, so a second photograph would hide the first);
  * a photo is never fetched twice: an id already in the register is left alone.

Usage (scripts/photo-runner.py drives it; it can be run by hand too):
  python3 -I scripts/mma-portrait-intake.py --names-file F [--stage DIR] [--dry-run]
      F: one fighter per line, "name<TAB>promoter[<TAB>opponent;opponent]"
      promoter: PFL | ONE Championship | KSW | RIZIN | Cage Warriors
  --stage DIR writes the crops to DIR/mma/files/ and the rows to DIR/mma/result.json and
  registers nothing; without it the rows go straight into data/mma-image-register.json.
"""
import argparse, functools, hashlib, importlib.util, json, re, sys, tempfile, time, urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
REGISTER = ROOT / "data/mma-image-register.json"
OUT_DIR = ROOT / "assets/img/mma"
OTHER_REGISTERS = (ROOT / "data/ufc-image-register.json", ROOT / "data/boxing-image-register.json")


@functools.lru_cache(maxsize=None)
def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


box = _load("befn_boxing_intake", "boxing-portrait-intake.py")
norm, slugify, name_in_file, Refused, AGENCY = box.norm, box.slugify, box.name_in_file, box.Refused, box.AGENCY

QUESTION = ("For 'MMA (other promotions)', do you confirm BEFN may republish press-kit/media fighter photos "
            "from these promoters, with the promoter credited?")
PROMOTERS = ("PFL", "ONE Championship", "KSW", "RIZIN", "Cage Warriors")
# One attestation text per promoter, each naming the date, the question and the promoter.
ATTESTATIONS = {p: (f"Owner attested 2026-11-24 that BEFN may republish {p} press-kit/media fighter photographs, "
                    f"with {p} credited (answer to: \"{QUESTION}\"; selected: {', '.join(PROMOTERS)}).")
                for p in PROMOTERS}
RIGHTS_NOTE = (f"Owner attestation of 2026-11-24, answering \"{QUESTION}\": PFL, ONE Championship, KSW, RIZIN and "
               "Cage Warriors selected. Each row carries its promoter's attestation and credits the promoter.")

# Photographs fetched, looked at by eye and not used (slug -> reason), so a later run does
# not take them back. Written by `scripts/photo-runner.py approve --reject`.
REVIEWED_OUT = {
}


class Blocked(Exception):
    """A host turned us away (robots.txt, 403, 429, anti-bot page): reported, not worked around."""


_robots = {}

# Owner's decision, 2026-11-24 (selector "The runner refused some sources to stay safe. Which should I open
# up?" -> "PFL (232 fighters)"): PFL's photo bucket answers robots.txt with S3's own 403 AccessDenied, which
# is how S3 says there is no such object in a bucket whose listing is private. For this one host only, that
# 403 counts as "no robots.txt", so nothing is disallowed. Any other host, and any other answer, still fails closed.
NO_ROBOTS_FILE_ON_403 = {"pflmma-prod.s3.amazonaws.com"}


def host_ok(url):
    """robots.txt of the URL's host allows the path; cached per host and path prefix."""
    p = urlparse(url)
    key = (p.netloc, p.path.split("/")[1] if "/" in p.path else "")
    if key not in _robots:
        _robots[key] = box.robots_allows(p.netloc, p.path or "/")
    ok, why = _robots[key]
    if not ok and p.netloc in NO_ROBOTS_FILE_ON_403 and why.startswith("robots.txt unreadable") and "403" in why:
        ok = True
    if not ok:
        raise Blocked(f"{p.netloc}: {why}")


def fetch_text(url):
    host_ok(url)
    try:
        body, ctype = box.get(url)
    except box.urllib.error.HTTPError as e:
        if e.code in (401, 403, 429, 503):
            raise Blocked(f"{urlparse(url).netloc}: HTTP {e.code}")
        raise
    text = body.decode("utf-8", "replace")
    # Cloudflare injects a "challenge-platform" script into ordinary pages too, so only a real challenge counts.
    if re.search(r"ddos-guard|<title>\s*(Just a moment|Attention Required)|cf-chl-(?:form|widget|bypass)", text, re.I):
        raise Blocked(f"{urlparse(url).netloc}: anti-bot challenge page")
    return text


def labelled(name, url, printed, alt, hashed_file_ok=False):
    """The checks every adapter's photograph must pass (see the module docstring).
    hashed_file_ok: RIZIN only (owner, 2026-11-24, "RIZIN (8 fighters)"). RIZIN names every photograph by a
    hash, so the file-name check is replaced by its fighter list printing the name and labelling the image
    with it; every other check still applies."""
    if norm(printed) != norm(name):
        raise Refused(f"the page prints {printed!r}, not {name}")
    if norm(alt) != norm(name):
        raise Refused(f"the image is labelled {alt!r}, not {name}")
    if not hashed_file_ok and not name_in_file(name, url):
        raise Refused(f"the file name does not carry the fighter's name: {url.rsplit('/', 1)[-1]}")
    if AGENCY.search(url):
        raise Refused("agency photograph: licence does not transfer")
    if SCENE.search(urllib.parse.unquote(url.rsplit("/", 1)[-1])):
        raise Refused(f"the file name describes a scene, not a portrait: {url.rsplit('/', 1)[-1]}")
    tiny = re.search(r"-(\d{1,4})x(\d{1,4})\.\w+$", url)
    if url.lower().endswith(".svg") or (tiny and int(tiny.group(1)) < 200):
        raise Refused(f"a placeholder, icon or thumbnail, not a photograph: {url.rsplit('/', 1)[-1]}")
    return url


# A news or video still that names the fighter ("...-rodrigues-and-janet-todd-showdown-...") is not a
# portrait: two people, or a moment in a fight. Refused here rather than left to the look by eye.
SCENE = re.compile(r"(?:^|[-_ ])(vs|v|and|showdown|rewatch|highlights?|faceoff|face-off|weigh-?in|press|presser|"
                   r"fight|knockout|ko|tko|submission|recap|preview|interview|walkout)(?:[-_ .]|$)", re.I)


# --- adapters: the promoter's own page for one fighter -> (photo, page, identity basis) ----

def pfl(person):
    pfl_mod = _load("befn_pfl", "enrich-pfl-official-portraits.py")
    for page in pfl_mod.url_candidates(person["name"], person.get("eventIds", [])):
        try:
            html = fetch_text(page)
        except box.urllib.error.HTTPError:
            continue
        photo = pfl_mod.verify_profile(html, person["name"])
        if photo:
            title = re.search(r"<title>([^<|–—]+)", html)
            host_ok(photo)
            # PFL's bodyshot is labelled "fighter" on the athlete's own page, whose title
            # names them (scripts/enrich-pfl-official-portraits.py checks both).
            return labelled(person["name"], photo, title.group(1).strip() if title else "", person["name"]), page, \
                "pflmma.com athlete page: title names the fighter; the page's fighter bodyshot; file name carries the name"
    return None


def one(person):
    one_mod = _load("befn_one", "enrich-one-official-portraits.py")
    for page in one_mod.profile_urls(person["name"]):
        try:
            html = fetch_text(page)
        except box.urllib.error.HTTPError:
            continue
        photo = one_mod.verify(html, person["name"], person.get("opponents", []))
        if photo:
            host_ok(photo)
            # verify() already requires an "About <name>" heading and an image whose alt
            # text carries the name (or an og:image whose file name is the full name).
            return labelled(person["name"], photo, person["name"], person["name"]), page, \
                "onefc.com athlete page: 'About <name>' heading; image alt names the fighter; file name carries the name"
    return None


_ksw_index = {}


def ksw(person):
    if not _ksw_index:
        xml = fetch_text("https://www.kswmma.com/sitemap-fighters.xml")
        for slug in re.findall(r"<loc>https://www\.kswmma\.com/en/fighter/([a-z0-9-]+)</loc>", xml):
            _ksw_index.setdefault(slug, f"https://www.kswmma.com/en/fighter/{slug}")
    page = _ksw_index.get(slugify(person["name"]))
    if not page:
        return None
    html = fetch_text(page)
    title = re.search(r"<title>\s*([^<|]+?)\s*\|", html)
    img = re.search(r'<img[^>]*class="fighter-photo-lg"[^>]*>', html)
    if not img:
        raise Refused("no profile photograph on the fighter page")
    src = re.search(r'\bsrc="([^"]+)"', img.group(0))
    alt = re.search(r'\balt="([^"]*)"', img.group(0))
    url = urllib.parse.urljoin(page, src.group(1)) if src else ""
    # The page's own og:image is the same file before KSW's 800 px WebP conversion.
    og = re.search(r'og:image"\s+content="([^"]+)"', html)
    if og and url and url.startswith(og.group(1)):
        url = og.group(1)
    host_ok(url)
    return labelled(person["name"], url, title.group(1) if title else "", alt.group(1) if alt else ""), page, \
        "kswmma.com fighter page: title and photo alt name the fighter; file name carries the surname"


_rizin_index = {}


def rizin(person):
    if not _rizin_index:
        data = json.loads(fetch_text("https://jp.rizinff.com/json/fighters-mma.json").lstrip("﻿"))
        for group in data:
            for f in group.get("fighters", []):
                _rizin_index.setdefault(norm(f.get("english_name")), f)
    f = _rizin_index.get(norm(person["name"]))
    if not f:
        return None
    page = "https://jp.rizinff.com/_tags/" + urllib.parse.quote(f.get("tag", ""))
    src = urllib.parse.urljoin("https://jp.rizinff.com/", f.get("img_src", ""))
    if src:
        host_ok(src)
    return labelled(person["name"], src, f.get("english_name", ""), f.get("english_name", ""), hashed_file_ok=True), page, \
        "RIZIN's MMA fighter list prints this English name and pairs it with this photograph (hashed file name; owner decision 2026-11-24)"


def cage_warriors(person):
    # cagewarriors.com answered robots.txt with HTTP 403 on 2026-11-24, so host_ok() blocks
    # it until that changes; no fighter-page adapter is written for a site we cannot read.
    host_ok("https://www.cagewarriors.com/fighters/")
    raise Refused("no Cage Warriors fighter-page adapter yet")


ADAPTERS = {"PFL": pfl, "ONE Championship": one, "KSW": ksw, "RIZIN": rizin, "Cage Warriors": cage_warriors}


def empty_register():
    return {"version": 1, "sport": "mma", "basePath": "assets/img/mma/", "rights": "promoter-press-kit",
            "rightsNote": RIGHTS_NOTE, "attestations": dict(ATTESTATIONS), "images": [], "skipped": []}


def load_register():
    reg = json.loads(REGISTER.read_text(encoding="utf-8")) if REGISTER.exists() else empty_register()
    reg["rightsNote"], reg["attestations"] = RIGHTS_NOTE, dict(ATTESTATIONS)
    return reg


def held_elsewhere():
    names = set()
    for path in OTHER_REGISTERS:
        if path.exists():
            names |= {norm(r["name"]) for r in json.loads(path.read_text(encoding="utf-8"))["images"]}
    return names


def read_people(path):
    out = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) >= 2 and parts[0].strip():
            out.append({"name": parts[0].strip(), "promoter": parts[1].strip(),
                        "opponents": [o for o in (parts[2].split(";") if len(parts) > 2 else []) if o]})
    return out


def take(person, found, out_dir):
    photo, page, basis = found
    data, ctype = box.get(photo)
    if not ctype.lower().startswith("image/"):
        raise Refused(f"not an image: {ctype}")
    slug = slugify(person["name"])
    box.OUT_DIR = out_dir  # the boxing intake's crop code writes to its module's OUT_DIR
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "original"
        raw.write_bytes(data)
        files, centred, size = box.process(raw, slug, [])
    promoter = person["promoter"]
    row = {"id": slug, "name": person["name"], "files": files, "credit": promoter, "promoter": promoter,
           "sourceUrl": photo, "sourcePage": page, "rights": "promoter-press-kit",
           "attestation": ATTESTATIONS[promoter], "identityBasis": basis,
           "sha256": hashlib.sha256(data).hexdigest(), "originalSize": f"{size[0]}x{size[1]}",
           "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    if centred:
        row["centredCrop"] = True
    if size[0] < 480:
        row["lowRes"] = True
    return row


def run(people, stage="", dry_run=False, delay=1.0):
    reg = load_register()
    have = {r["id"] for r in reg["images"]}
    elsewhere = held_elsewhere()
    out_dir = Path(stage) / "mma" / "files" if stage else OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    added, skipped, blocked = [], [], {}
    for person in people:
        name, promoter, slug = person["name"], person["promoter"], slugify(person["name"])
        skip = lambda reason, kind: skipped.append({"name": name, "promoter": promoter, "reason": reason, "kind": kind})
        if promoter not in ADAPTERS:
            skip("promoter not covered by the owner's attestation", "no source")
            continue
        if slug in have:
            continue
        if norm(name) in elsewhere:
            skip("already has a UFC or boxing photograph", "held elsewhere")
            continue
        if slug in REVIEWED_OUT:
            skip("reviewed and not used: " + REVIEWED_OUT[slug], "rejected by eye")
            continue
        if promoter in blocked:
            skip(blocked[promoter], "blocked host")
            continue
        try:
            time.sleep(delay)
            found = ADAPTERS[promoter](person)
            if not found:
                skip(f"no fighter page for this name on the {promoter} site", "no source")
                continue
            if dry_run:
                print(f"  would fetch {name} <- {found[0]}")
                continue
            row = take(person, found, out_dir)
            reg["images"].append(row)
            have.add(slug)
            added.append(row)
        except Blocked as e:
            blocked[promoter] = str(e)
            skip(str(e), "blocked host")
        except Refused as e:
            skip(str(e), "name mismatch")
        except Exception as e:  # network or parse error: recorded, retried on a later run
            skip(f"fetch failed: {e}", "no source")
    if stage:
        (Path(stage) / "mma" / "result.json").write_text(json.dumps(
            {"images": added, "skipped": skipped, "blocked": blocked}, indent=1, ensure_ascii=False) + "\n",
            encoding="utf-8")
    elif not dry_run:
        write_register(reg, skipped, people)
    print(f"added {len(added)}: {', '.join(r['name'] for r in added) or '-'}")
    print(f"not taken {len(skipped)}; blocked: {blocked or '-'}")
    return added, skipped, blocked


def write_register(reg, skipped=(), looked_at=()):
    """Sort and save; a skip is dropped for anyone who now has a photo, and earlier skips are kept
    for the names this run did not look at (the boxing intake's rule)."""
    have = {r["id"] for r in reg["images"]}
    looked = {norm(p["name"]) for p in looked_at} | {norm(s["name"]) for s in skipped}
    earlier = [s for s in reg.get("skipped", []) if norm(s["name"]) not in looked and slugify(s["name"]) not in have]
    reg["skipped"] = sorted(earlier + [s for s in skipped if slugify(s["name"]) not in have], key=lambda s: s["name"])
    reg["images"].sort(key=lambda r: r["id"])
    reg["generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    REGISTER.write_text(json.dumps(reg, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--names-file", required=True)
    ap.add_argument("--stage", default="", help="staging dir: nothing is registered")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between fighters")
    args = ap.parse_args()
    run(read_people(args.names_file), args.stage, args.dry_run, args.delay)
    return 0


if __name__ == "__main__":
    sys.exit(main())
