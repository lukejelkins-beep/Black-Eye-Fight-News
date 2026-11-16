#!/usr/bin/env python3
"""Import the 82 owner-approved JSA kimarite photographs into the Sumo preview.

No photo is guessed from a search result: official catalogue index 01..82 maps
to the same numbered JSA /Kimarite/detail/{id}/ page and .jpg photograph.
Stored locally to prevent browser hotlink/referrer failures on mobile.
"""
from __future__ import annotations
import concurrent.futures
import os
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "https://www.sumo.or.jp/img/kimarite/kimarite_{:02d}.jpg"
OUTPUT = Path(__file__).resolve().parents[1] / "assets/sumo-kimarite/jsa"
EXPECTED = range(1, 83)

def valid_jpeg(data: bytes) -> bool:
    return len(data) > 4000 and data.startswith(b"\\xff\\xd8\\xff") and data.rstrip().endswith(b"\\xff\\xd9")

def fetch(n: int) -> tuple[int, str]:
    dest = OUTPUT / f"kimarite_{n:02d}.jpg"
    if dest.is_file() and valid_jpeg(dest.read_bytes()):
        return n, "existing"
    url = BASE.format(n)
    last_error = None
    for retry in range(4):
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; BEFN-Sumo-Reference/1.0; authorized reuse)",
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                "Referer": f"https://www.sumo.or.jp/Kimarite/detail/{n}/",
            }
            req = Request(url, headers=headers)
            with urlopen(req, timeout=25) as response:
                data = response.read(2_000_000)
                content_type = response.headers.get("Content-Type", "")
            if len(data) >= 2_000_000 or not valid_jpeg(data):
                raise ValueError(f"Unexpected response ({len(data)} bytes, {content_type!r})")
            tmp = dest.with_suffix(".jpg.part")
            tmp.write_bytes(data)
            os.replace(tmp, dest)
            return n, f"downloaded {len(data):,} bytes"
        except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
            last_error = str(exc)
            time.sleep(1.5 * (retry + 1))
    return n, f"FAILED: {last_error}"

def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as workers:
        results = sorted(workers.map(fetch, EXPECTED))
    for number, result in results:
        print(f"kimarite_{number:02d}.jpg: {result}")
    failed = [number for number, result in results if result.startswith("FAILED")]
    passed = [number for number in EXPECTED if (OUTPUT / f"kimarite_{number:02d}.jpg").is_file()
              and valid_jpeg((OUTPUT / f"kimarite_{number:02d}.jpg").read_bytes())]
    print(f"JSA PHOTO AUDIT: {len(passed)}/82 valid photographs; failed: {failed}")
    return 1 if failed or len(passed) != 82 else 0

if __name__ == "__main__":
    sys.exit(main())
