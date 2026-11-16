#!/usr/bin/env python3
"""Create a tight-looping, mobile-efficient GIF from an approved kimarite video.

Example:
    python scripts/build-kimarite-gif.py /tmp/oshidashi.mov --slug oshidashi \
        --crop 760:426:20:24 --fps 12 --width 480

The crop must include both wrestlers throughout the action and the completed
technique. Do not substitute a generic bout or mislabel the displayed finish.
"""
import argparse
import re
import shutil
import subprocess
from pathlib import Path

def main() -> None:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("source",type=Path,help="Local approved video or screen recording")
    p.add_argument("--slug",required=True,help="Canonical English kimarite")
    p.add_argument("--crop",default=None,help="ffmpeg crop W:H:X:Y; tight but without clipping the wrestlers")
    p.add_argument("--start",type=float,default=0)
    p.add_argument("--duration",type=float,default=None)
    p.add_argument("--fps",type=int,default=12)
    p.add_argument("--width",type=int,default=480)
    p.add_argument("--out",type=Path,default=None)
    args=p.parse_args()
    if not re.fullmatch("[a-z]+",args.slug):p.error("slug must contain lowercase letters only")
    if not args.source.is_file():p.error(f"missing input: {args.source}")
    if args.fps<6 or args.fps>24:p.error("fps must be 6–24")
    if args.width<240 or args.width>960 or args.width%2:p.error("width must be an even 240–960")
    if args.duration is not None and not 0.5<=args.duration<=12:p.error("duration must be 0.5–12 seconds")
    if args.start<0:p.error("start must be nonnegative")
    if args.crop and not re.fullmatch(r"[0-9]+:[0-9]+:[0-9]+:[0-9]+",args.crop):
        p.error("crop must be W:H:X:Y")
    if not shutil.which("ffmpeg"):p.error("ffmpeg is required")
    output=args.out or Path("assets/sumo-kimarite")/(args.slug+".gif")
    output.parent.mkdir(parents=True,exist_ok=True)
    cuts=["-ss",str(args.start)] if args.start else []
    if args.duration:cuts+=["-t",str(args.duration)]
    stages=[f"fps={args.fps}"]
    if args.crop:stages.append(f"crop={args.crop}")
    stages.append(f"scale={args.width}:-2:flags=lanczos")
    flt=",".join(stages)
    vf=f"[0:v]{flt},split[a][b];[a]palettegen=max_colors=112:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle[v]"
    cmd=["ffmpeg","-hide_banner","-loglevel","error","-y",*cuts,"-i",str(args.source)]
    cmd+=["-filter_complex",vf,"-map","[v]","-an","-loop","0",str(output)]
    subprocess.run(cmd,check=True)
    print(f"GIF: {output} ({output.stat().st_size:,} bytes); review loop and technique before adding to manifest")

if __name__=="__main__":main()
