import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const proofs=read('data/ufc-independent-full-career-verification.json');
const sources=read('data/ufc-unified-wave17-dulatov-choinski-gimenis-official-source-review-20261114.json');
const native=read('data/ufcalendar-rich-progress.json');
const feeder=read('data/ufc-feeder-bout-evidence.json');
const cases=[
  {
    "slug": "islam-dulatov",
    "fid": "2869",
    "native": "60812",
    "sourceUrl": "https://ufcstats.com/fight-details/37bc72d5d211b189",
    "opponent": "Adam Fugitt",
    "result": "win",
    "date": "2025-07-19"
  },
  {
    "slug": "mark-choinski",
    "fid": "2857",
    "native": "60873",
    "sourceUrl": "https://ufcstats.com/fight-details/0e8599eca8ccfa32",
    "opponent": "MarQuel Mederos",
    "result": "loss",
    "date": "2025-06-07"
  },
  {
    "slug": "max-gimenis",
    "fid": "422",
    "native": "65907",
    "sourceUrl": "https://ufcstats.com/fight-details/87dcb3eab20f6ac1",
    "opponent": "Josh Hokit",
    "result": "loss",
    "date": "2025-11-08"
  }
];
test('wave17 three complete official UFC careers preserve source, native bout and opposing-corner results',()=>{
 assert.equal(roster.approvedFighters.length,783);
 assert.equal(sources.nonproduction,true);
 assert.equal(sources.certificationGranted,false);
 assert.deepEqual(Object.keys(sources.fighters),cases.map(c=>c.slug));
 for(const c of cases){
  assert.ok(roster.approvedFighters.includes(c.slug));
  const proof=proofs.fighters[c.slug],src=sources.fighters[c.slug];
  assert.equal(proof.sourceCoverageAttested,true,c.slug);
  assert.equal(proof.scope,'complete_official_ufc_career',c.slug);
  assert.equal(proof.verificationMethod,'full_official_ufc_fight_listing_crosscheck',c.slug);
  assert.equal(proof.sourceSnapshot.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da',c.slug);
  assert.equal(proof.officialFighterUrl,src.officialFighterUrl,c.slug);
  assert.equal(proof.fighterUrl,src.pinnedGrecoFighterUrl,c.slug);
  assert.deepEqual(proof.verifiedNumericFighterIds,[c.fid],c.slug);
  assert.equal(proof.officialUfcCareerBoutCount,1,c.slug);
  assert.deepEqual(proof.bouts,[{date:c.date,opponent:c.opponent,result:c.result,fightUrl:c.sourceUrl,nativeBoutId:c.native,nativeFighterId:c.fid}],c.slug);
  const match=native.bouts[c.native];
  assert.equal(match?.status,'completed',c.slug);
  assert.equal(match?.org,'ufc',c.slug);
  assert.ok(Math.abs(Date.parse(match.eventDate)-Date.parse(c.date))<=86400000,c.slug);
  const own=[match.a,match.b].find(x=>String(x?.id)===c.fid);
  const other=[match.a,match.b].find(x=>String(x?.id)!==c.fid);
  assert.ok(own&&other,c.slug);
  assert.equal(other.name,c.opponent,c.slug);
  assert.equal(match.result?.winnerId===c.fid?'win':'loss',c.result,c.slug);
 }
});
test('Islam DWCS is excluded, Max cancelled booking is excluded, UFC scorecard overrides misleading graphical Win badges',()=>{
 const d=proofs.fighters['islam-dulatov'];
 assert.deepEqual(d.sourceVerifiedExcludedFeederBouts.map(x=>x.nativeBoutId),['84055']);
 assert.equal(feeder.bouts.filter(x=>x.boutId==='84055'&&x.fighterSlug==='islam-dulatov').length,1);
 assert.equal(native.bouts['84055'].a.name,'Vanilto Antunes');
 assert.ok(!d.bouts.some(x=>x.nativeBoutId==='84055'));
 const max=proofs.fighters['max-gimenis'];
 assert.equal(native.bouts['66469'].status,'cancelled');
 assert.ok(!max.bouts.some(x=>x.nativeBoutId==='66469'));
 assert.equal(proofs.fighters['mark-choinski'].bouts[0].result,'loss');
 assert.equal(max.bouts[0].result,'loss');
});
