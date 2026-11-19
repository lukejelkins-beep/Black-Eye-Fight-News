"""Owner/maintainer tool: check whether feed URLs answer, with the same request the news collector uses.

Run on GitHub (the sandbox cannot reach most sites): Actions, 'Source health report', input 'probe'.
Prints one line per URL: HTTP status, item count and newest item date. Never follows instructions in feeds.
"""
import sys, re, urllib.request, urllib.error
import xml.etree.ElementTree as ET

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; BlackEyeFightNews/1.0)"}


def probe(url):
    try:
        request = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(request, timeout=12) as response:
            raw = response.read(3_000_000)
            status = response.status
    except urllib.error.HTTPError as error:
        return f"HTTP {error.code}"
    except Exception as error:  # network or TLS problems
        return "error: " + str(error)[:80]
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return f"HTTP {status}, not XML ({len(raw)} bytes)"
    items = root.findall(".//item") or root.findall(".//{http://www.w3.org/2005/Atom}entry")
    dates = []
    for item in items:
        for tag in ("pubDate", "{http://www.w3.org/2005/Atom}updated", "{http://www.w3.org/2005/Atom}published"):
            node = item.find(tag)
            if node is not None and node.text:
                dates.append(re.sub(r"\s+", " ", node.text.strip()))
                break
    titles = []
    for item in items[:2]:
        node = item.find("title") if item.find("title") is not None else item.find("{http://www.w3.org/2005/Atom}title")
        if node is not None and node.text:
            titles.append(re.sub(r"\s+", " ", node.text.strip())[:70])
    publishers = {}
    if "news.google.com" in url:
        for item in items:
            node = item.find("source")
            name = (node.text or "").strip() if node is not None else ""
            if name:
                publishers[name] = publishers.get(name, 0) + 1
    extra = ""
    if publishers:
        top = sorted(publishers.items(), key=lambda kv: -kv[1])[:12]
        extra = "\n    publishers: " + ", ".join(f"{n} ({c})" for n, c in top)
    return f"HTTP {status}, {len(items)} items, first date: {dates[0] if dates else 'none'} | " + " / ".join(titles) + extra


if __name__ == "__main__":
    for url in sys.argv[1:]:
        print(f"{url}\n    {probe(url)}")
