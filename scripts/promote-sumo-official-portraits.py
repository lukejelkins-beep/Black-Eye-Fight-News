#!/usr/bin/env python3
"""Promote 190 source-identified official portraits into isolated Sumo test assets."""
import json, pathlib, shutil, hashlib, sys
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1]
staging=ROOT/'qa/sumo-official-portrait-staging'
review=json.loads((staging/'download-review.json').read_text())['records']
roster=json.loads((ROOT/'data/sumo/rikishi-index.json').read_text())['rikishi']
manifest_path=ROOT/'data/sumo/approved-photos.json'
manifest=json.loads(manifest_path.read_text())
source={r['sourceId']:r for r in review}
assert len(roster)==190 and len(source)==190
directory=ROOT/'assets/sumo-photos';directory.mkdir(exist_ok=True)
updated={}
for w in roster:
    sid=w['sourceId'];row=source[sid]
    choices=[]
    for entry in row['downloads']:
        path=staging/'candidate-images'/entry['file']
        if not path.is_file():continue
        with Image.open(path) as img:
            if img.size==(270,474) and img.format=='JPEG':
                choices.append((entry,path))
    if len(choices)!=1:
        raise RuntimeError(f"{w['shikonaEn']} ({sid}): expected one 270x474 JPEG, found {len(choices)}")
    entry,path=choices[0]
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest==entry['sha256']
    dest=directory/f'jsa-{sid}.jpg'
    shutil.copyfile(path,dest)
    updated[str(sid)]={
        'approved':True,'path':f'assets/sumo-photos/jsa-{sid}.jpg',
        'name':w['shikonaEn'],'sourceId':sid,'officialNskId':w['officialNskId'],
        'license':'Official JSA portrait — permission attested by BEFN operator, 2026-11-16',
        'credit':'Japan Sumo Association',
        'sourceUrl':entry['sourceUrl'],
        'profileUrl':row['profileUrl'],
        'sha256':digest,
        'changes':'Original official JPEG; CSS may crop',
        'identityBasis':'JSA official profile page matched to roster NSK identifier; user accepted visual identity'
    }
manifest['bySourceId'].update(updated)
manifest['description']='190 official JSA portrait images with operator-attested permission; prior separately licensed images retained on disk as backups.'
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
assert len(updated)==190
print(json.dumps({'promoted':len(updated),'manifestEntries':len(manifest['bySourceId']),'missing':0}))
