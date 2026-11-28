"""Gym (Sherdog Association list) and dated fight history for every fighter in the given fights files.

Usage: python collect_fighters.py fights_2025.json [fights_2026.json ...]
Reads and updates gyms.json and hist.json in the current directory, fetching only fighters not already there.
Eight requests in flight, a short pause after each. Sherdog permission: owner, 28 Nov 2026.
"""
import json, re, sys, time, urllib.request, concurrent.futures as cf
from pathlib import Path
from bs4 import BeautifulSoup

UA = {"User-Agent": "Mozilla/5.0"}
M = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}
load = lambda p: json.load(open(p)) if Path(p).exists() else {}
G, H = load("gyms.json"), load("hist.json")
fights = [x for fn in sys.argv[1:] for x in json.load(open(fn))]
urls = sorted({x[k] for x in fights for k in ("a_url", "b_url") if x[k]} - set(G))


def one(u):
    for _ in range(3):
        try:
            h = urllib.request.urlopen(urllib.request.Request("https://www.sherdog.com" + u, headers=UA), timeout=30).read().decode("utf8", "ignore")
            s = BeautifulSoup(h, "lxml")
            gyms = []
            for a in s.select('a[href*="fightfinder?association="] span, [itemprop=memberOf] span[itemprop=name]'):
                t = a.get_text(strip=True)
                if t and t not in gyms:
                    gyms.append(t)
            rows = []
            for tr in s.select(".module.fight_history table tr"):
                r, d = tr.select_one(".final_result"), tr.select_one(".sub_line")
                if not r or not d:
                    continue
                m = re.match(r"(\w{3}) / (\d+) / (\d{4})", d.get_text(strip=True))
                if m:
                    rows.append((f"{m[3]}-{M[m[1]]:02d}-{int(m[2]):02d}", r.get_text(strip=True)))
            return u, gyms, rows
        except Exception:
            time.sleep(2)
    return u, None, None


with cf.ThreadPoolExecutor(8) as ex:
    for u, g, r in ex.map(one, urls):
        if g is None:
            print("failed", u)
            continue
        G[u], H[u] = {"gyms": g}, r
        time.sleep(0.2)
json.dump(G, open("gyms.json", "w"), indent=1)
json.dump(H, open("hist.json", "w"))
print(len(urls), "fetched; total", len(G))
