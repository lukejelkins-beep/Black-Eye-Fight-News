#!/usr/bin/env python3
"""Regenerate the cut-outs listed in data/sumo/cutouts.json from the approved portraits.

Selection of which portraits get a cut-out (full-body only) is recorded in the
manifest; this script rebuilds those files so the process is reproducible.
Usage: python3 scripts/sumo-build-cutouts.py
"""
import json, os, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
approved = json.load(open(os.path.join(root, 'data/sumo/approved-photos.json')))['bySourceId']
path = os.path.join(root, 'data/sumo/cutouts.json')
manifest = json.load(open(path))
for sid, entry in manifest['bySourceId'].items():
    src = approved[sid]
    subprocess.run([sys.executable, os.path.join(root, 'scripts/sumo-cutout.py'),
                    os.path.join(root, src['path']), os.path.join(root, entry['path'])], check=True)
    entry['sourceSha256'] = src['sha256']
    entry['bytes'] = os.path.getsize(os.path.join(root, entry['path']))
json.dump(manifest, open(path, 'w'), indent=2, ensure_ascii=False)
open(path, 'a').write('\n')
print(len(manifest['bySourceId']), 'cut-outs rebuilt')
