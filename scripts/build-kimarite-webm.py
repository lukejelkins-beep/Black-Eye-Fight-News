#!/usr/bin/env python3
"""Transcode BEFN-owned, permission-authorised NHK demonstration extracts into WebM loops.

Inputs are local source files supplied under the project's NHK permission. This
tool intentionally DOES NOT scrape or download videos from YouTube/NHK.
Select cut points after visually reviewing each NHK technique demonstration.

Example:
  python3 scripts/build-kimarite-webm.py --source-dir /path/to/nhk-videos
"""
from __future__ import annotations
import argparse
import csv
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

RIGHTS = "NHK permission confirmed by BEFN owner"
CREDIT = "NHK WORLD-JAPAN"
REPO_ROOT = Path(__file__).resolve().parents[1]
SLUG = re.compile(r"^[a-z]+$")

def run(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True)

def parse_cut(row: dict[str, str]) -> tuple[str, str, float, float, str] | None:
    slug = (row.get("slug") or "").strip().lower()
    source = (row.get("source_file") or "").strip()
    if not SLUG.fullmatch(slug):
        raise ValueError(f"Invalid kimarite slug: {slug!r}")
    if not source:
        return None
    if Path(source).is_absolute() or ".." in Path(source).parts:
        raise ValueError(f"Unsafe source_file path: {source!r}")
    if (row.get("reviewed") or "").strip().lower() != "yes":
        raise ValueError(f"Source for {slug} must have reviewed=yes before encoding")
    start = float(row.get("start_seconds") or "0")
    duration = float(row.get("duration_seconds") or "0")
    if not (0 <= start and 1.2 <= duration <= 8.0):
        raise ValueError(f"{slug} must have a reviewed 1.2–8s cut interval")
    url = (row.get("source_url") or "").strip()
    if not url.startswith("https://"):
        raise ValueError(f"Missing verified HTTPS NHK source URL for {slug}")
    return slug, source, start, duration, url

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cuts", type=Path, default=REPO_ROOT/"data/sumo/kimarite-clip-cuts.csv")
    p.add_argument("--source-dir", type=Path, required=True, help="Directory of permission-supplied NHK source videos")
    p.add_argument("--output-dir", type=Path, default=REPO_ROOT/"assets/sumo-kimarite")
    p.add_argument("--manifest", type=Path, default=REPO_ROOT/"data/sumo/kimarite-media.json")
    p.add_argument("--strict", action="store_true", help="Fail if any reviewed source file is unavailable")
    args = p.parse_args()
    if not shutil.which("ffmpeg"):
        p.error("ffmpeg must be installed")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    existing = json.loads(args.manifest.read_text()) if args.manifest.exists() else {"schemaVersion": 1, "clips": {}}
    if existing.get("schemaVersion") != 1 or not isinstance(existing.get("clips"), dict):
        raise SystemExit("Refusing to overwrite invalid clip manifest")
    clips = dict(existing["clips"])
    built = skipped = 0
    with args.cuts.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cut = parse_cut(row)
            if not cut:
                skipped += 1
                continue
            slug, relative, start, duration, url = cut
            source = args.source_dir/relative
            if not source.is_file():
                if args.strict:
                    raise FileNotFoundError(source)
                print(f"SKIP {slug}: approved source file not present: {source}")
                skipped += 1
                continue
            webm = args.output_dir/f"{slug}.webm"
            poster = args.output_dir/f"{slug}.jpg"
            temp_webm = webm.with_suffix(".webm.tmp")
            temp_poster = poster.with_suffix(".jpg.tmp")
            try:
                run(["ffmpeg","-hide_banner","-loglevel","error","-y",
                     "-ss",str(start),"-i",str(source),"-t",str(duration),
                     "-vf","fps=24,scale=640:-2:flags=lanczos,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p",
                     "-an","-c:v","libvpx-vp9","-deadline","good","-cpu-used","3",
                     "-crf","39","-b:v","0","-row-mt","1","-f","webm",str(temp_webm)])
                run(["ffmpeg","-hide_banner","-loglevel","error","-y",
                     "-ss",str(start+min(0.5,duration/2)),"-i",str(source),"-frames:v","1",
                     "-vf","scale=640:-2:flags=lanczos","-q:v","3","-f","image2",str(temp_poster)])
                temp_webm.replace(webm)
                temp_poster.replace(poster)
            except subprocess.CalledProcessError as err:
                for path in (temp_webm, temp_poster):
                    path.unlink(missing_ok=True)
                print(f"FAIL {slug}: {err.stderr}", file=sys.stderr)
                raise
            clips[slug] = {"webm":f"assets/sumo-kimarite/{slug}.webm",
                           "poster":f"assets/sumo-kimarite/{slug}.jpg",
                           "credit": CREDIT, "rights": RIGHTS,
                           "sourceUrl": url, "durationSeconds": duration}
            built += 1
            print(f"BUILT {slug}: {webm.stat().st_size:,} bytes; cut {start:.2f}s+{duration:.2f}s")
    final = {"schemaVersion":1, "source":CREDIT,
             "usage":"BEFN educational kimarite demonstration loops, authorised by project owner",
             "clips":dict(sorted(clips.items()))}
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(final,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"RESULT: {built} encoded, {skipped} pending, {len(clips)} in manifest")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
