"""Japanese and Spanish combat-sports headlines, translated to English.

Sources: Google News search RSS, one search per sport query, keeping only stories from
publishers on the owner-approved list (data/news-language-sources.json). Only the headline
is translated (DeepL); the original headline and link are always kept.

Safety: translation is skipped (never guessed) when no key is set or the provider reports
too little allowance left. A headline is translated once and cached. No key is ever printed.
"""
import argparse, datetime as dt, email.utils, hashlib, json, os, re, sys, time, unicodedata
import urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

try:
    from news_dedupe import deduplicate
except ModuleNotFoundError:  # unittest loads this file by path
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from news_dedupe import deduplicate

UTC = dt.timezone.utc
SOURCES_FILE = Path("data/news-language-sources.json")
OUT_FILE = Path("data/news-language-live.json")
CACHE_FILE = Path("data/news-language-cache.json")
EDITIONS = {"ja": [("ja", "JP", "JP:ja")], "es": [("es-419", "MX", "MX:es-419"), ("es", "ES", "ES:es")]}
LANGUAGE_NAME = {"ja": "Japanese", "es": "Spanish"}
DEEPL_SOURCE = {"ja": "JA", "es": "ES"}
MAX_AGE_HOURS = 72
KEEP_PER_LANGUAGE = 60
MAX_NEW_TRANSLATIONS_PER_RUN = 60
MAX_HEADLINE_CHARS = 200
SAFE_ALLOWANCE_SHARE = 0.9  # never use more than 90 percent of the provider's allowance
UA = {"User-Agent": "Mozilla/5.0 (compatible; BlackEyeFightNews/1.0)"}


def norm(text):
    return unicodedata.normalize("NFKC", str(text or "")).strip().casefold()


def stamp(value):
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None


def search_url(query, edition):
    hl, gl, ceid = edition
    return ("https://news.google.com/rss/search?" +
            urllib.parse.urlencode({"q": query + " when:3d", "hl": hl, "gl": gl, "ceid": ceid}))


def parse_items(raw):
    """Google News RSS -> [{title, url, publisher, publishedAt}]. The title's ' - Publisher' tail is removed."""
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    items = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        source = item.find("source")
        publisher = (source.text or "").strip() if source is not None else ""
        when = stamp(item.findtext("pubDate"))
        if not (title and link.startswith("https://") and publisher and when):
            continue
        tail = " - " + publisher
        if title.endswith(tail):
            title = title[: -len(tail)].rstrip()
        items.append({"title": title, "url": link, "publisher": publisher, "publishedAt": when})
    return items


def approved_names(config, language):
    return {norm(p["name"]): p for p in config[language]["approved"]}


def select(items, approved, sport, now):
    """Keep recent stories from approved publishers only; the rest is dropped unread."""
    chosen = []
    for it in items:
        publisher = approved.get(norm(it["publisher"]))
        age = (now - it["publishedAt"]).total_seconds() / 3600
        if not publisher or age > MAX_AGE_HOURS or age < -2 or len(it["title"]) > MAX_HEADLINE_CHARS:
            continue
        chosen.append({**it, "sport": sport, "publisherEnglish": publisher.get("english") or it["publisher"]})
    return chosen


def cache_key(language, text):
    return hashlib.sha1((language + "\n" + text).encode("utf-8")).hexdigest()[:20]


class DeepL:
    def __init__(self, key, opener=urllib.request.urlopen):
        self.key = key.strip()
        self.host = "https://api-free.deepl.com" if self.key.endswith(":fx") else "https://api.deepl.com"
        self.opener = opener

    def _call(self, path, fields=None):
        data = urllib.parse.urlencode(fields, doseq=True).encode() if fields is not None else None
        req = urllib.request.Request(self.host + path, data=data, headers={"Authorization": "DeepL-Auth-Key " + self.key, **UA})
        with self.opener(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))

    def usage(self):
        reply = self._call("/v2/usage")
        return {"used": reply.get("character_count"), "limit": reply.get("character_limit")}

    def translate(self, texts, language):
        reply = self._call("/v2/translate", {"text": texts, "source_lang": DEEPL_SOURCE[language], "target_lang": "EN-GB"})
        return [t["text"] for t in reply["translations"]]


def allowance_left(usage):
    used, limit = usage.get("used"), usage.get("limit")
    if not isinstance(used, int) or not isinstance(limit, int) or limit <= 0:
        return 0
    return max(0, int(limit * SAFE_ALLOWANCE_SHARE) - used)


def translate_new(stories, language, cache, client, usage, now):
    """Fill cache for headlines not seen before, within the allowance. Returns characters sent."""
    pending, seen = [], set()
    for s in stories:
        key = cache_key(language, s["title"])
        if key not in cache and key not in seen:
            pending.append((key, s["title"])); seen.add(key)
    pending = pending[:MAX_NEW_TRANSLATIONS_PER_RUN]
    sent = 0
    budget = allowance_left(usage) if usage else 0
    batch = []
    for key, text in pending:
        if sent + len(text) > budget:
            break
        batch.append((key, text)); sent += len(text)
    for start in range(0, len(batch), 40):
        chunk = batch[start:start + 40]
        for (key, text), english in zip(chunk, client.translate([t for _, t in chunk], language)):
            cache[key] = {"en": english.strip(), "at": now.isoformat()}
    return sent


def build_stories(stories, language, cache, now):
    out = []
    for s in stories:
        entry = cache.get(cache_key(language, s["title"]))
        if not entry or not entry.get("en"):
            continue  # never show an untranslated headline as if it were English
        out.append({
            "id": cache_key(language, s["url"]), "title": entry["en"], "originalTitle": s["title"],
            "language": language, "translatedFrom": LANGUAGE_NAME[language], "translationProvider": "DeepL",
            "sport": s["sport"], "source": s["publisherEnglish"], "sourceOriginal": s["publisher"],
            "url": s["url"], "publishedAt": s["publishedAt"].isoformat(),
        })
    kept, _ = deduplicate(out)
    kept.sort(key=lambda a: a["publishedAt"], reverse=True)
    return kept[:KEEP_PER_LANGUAGE]


def fetch(url, opener=urllib.request.urlopen):
    req = urllib.request.Request(url, headers=UA)
    with opener(req, timeout=15) as response:
        return response.read(3_000_000)


def collect(config, now, fetcher=fetch):
    """Return ({language: [stories]}, report) with no translation yet."""
    found, report = {}, []
    for language in ("ja", "es"):
        approved = approved_names(config, language)
        stories, seen_urls = [], set()
        for sport, queries in config[language]["queries"].items():
            for query in queries:
                for edition in EDITIONS[language]:
                    url = search_url(query, edition)
                    try:
                        items = parse_items(fetcher(url))
                    except Exception as error:  # a search that fails is reported, not fatal
                        report.append(f"{language} {sport} '{query}' {edition[1]}: failed ({str(error)[:60]})")
                        continue
                    chosen = select(items, approved, sport, now)
                    report.append(f"{language} {sport} '{query}' {edition[1]}: {len(items)} found, {len(chosen)} from approved publishers")
                    for s in chosen:
                        if s["url"] not in seen_urls and norm(s["title"]) not in {norm(x["title"]) for x in stories}:
                            seen_urls.add(s["url"]); stories.append(s)
        found[language] = stories
    return found, report


def run(args):
    now = dt.datetime.now(UTC)
    config = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}
    cutoff = now - dt.timedelta(days=30)
    cache = {k: v for k, v in cache.items() if (dt.datetime.fromisoformat(v["at"]) > cutoff)}
    found, report = collect(config, now)
    key = os.environ.get("DEEPL_API_KEY", "").strip()
    client = DeepL(key) if key else None
    usage, note = None, "no translation key set: headlines stay untranslated and are not published"
    if client:
        try:
            usage = client.usage()
            note = f"translation allowance: {usage['used']} of {usage['limit']} characters used"
        except Exception as error:
            client, note = None, f"translation unavailable ({type(error).__name__}); headlines not published"
    sent = 0
    if client and not args.check_key:
        for language, stories in found.items():
            try:
                sent += translate_new(stories, language, cache, client, usage, now)
            except Exception as error:
                note += f"; {language} translation stopped ({type(error).__name__})"
    print(note)
    for line in report:
        print(" ", line)
    if args.check_key:
        return 0
    stories = {lang: build_stories(found[lang], lang, cache, now) for lang in found}
    payload = {
        "schemaVersion": 1, "attemptedAt": now.isoformat(),
        "lastSuccessfulAt": now.isoformat() if any(stories.values()) else None,
        "provider": "DeepL", "note": "Headlines only are machine-translated. The original headline and link are kept with each story.",
        "allowance": usage, "charactersSentThisRun": sent,
        "counts": {lang: len(v) for lang, v in stories.items()},
        "stories": stories["ja"] + stories["es"],
    }
    print(f"Language news: {payload['counts']}, {sent} characters translated this run")
    if args.dry_run:
        for s in payload["stories"][:8]:
            print("  ", s["language"], s["sport"], s["source"], "|", s["title"][:80])
        return 0
    OUT_FILE.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    CACHE_FILE.write_text(json.dumps(cache, indent=1, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print a summary and write nothing")
    ap.add_argument("--check-key", action="store_true", help="only report the translation allowance")
    sys.exit(run(ap.parse_args()))
