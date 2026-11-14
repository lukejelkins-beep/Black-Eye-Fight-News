import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const approval=read('data/ufc-36-month-roster-approval.json'),registry=read('data/ufc-independent-full-career-verification.json'),primary=read('data/ufc-unified-wave17-official-source-review-20261114.json'),feeder=read('data/ufc-feeder-bout-evidence.json');
const cases={
 'bia-mesquita':{id:'174',b:[['65895','Irina Alekseeva','win'],['60722','Montse Rendon','win'],['66004','Melissa Mullins','win']],feeder:[]},
 'blake-bilder':{id:'2779',b:[['59741','Shane Young','win'],['61340','Kyle Nelson','loss'],['59860','JeongYeong Lee','loss']],feeder:['88258']},
 'changho-lee':{id:'417',b:[['38816','Xiao Long','win'],['60298','Cortavious Romious','win'],['60425','Timmy Cuamba','loss']],feeder:[]},
 'connor-matthews':{id:'2848',b:[['38988','Dennis Buzukja','loss'],['60996','Jose Delgado','loss'],['60847','Yadier del Valle','loss']],feeder:['84099','88250']},
 'damian-pinas':{id:'458',b:[['60685','Wes Schultz','win'],['66446','Cesar Almeida','win'],['83727','Andrey Pulyaev','win']],feeder:['88287']},
 'denys-bondar':{id:'1069',b:[['61633','Malcolm Gordon','loss'],['60174','Carlos Hernandez','loss'],['39038','Ronaldo Rodriguez','loss']],feeder:[]}
};
test('frozen 783 roster and six complete exhaustive UFC careers with 18 original numeric IDs',()=>{
 assert.equal(approval.status,'approved');assert.equal(approval.approvedFighters.length,783);
 assert.equal(new Set(approval.approvedFighters).size,783);
 assert.equal(primary.nonproduction,true);assert.equal(primary.certificationGranted,false);
 assert.deepEqual(Object.keys(primary.fighters),Object.keys(cases));
 let total=0;for(const [slug,x] of Object.entries(cases)){
  assert.ok(approval.approvedFighters.includes(slug),slug);
  const r=registry.fighters[slug],p=primary.fighters[slug];
  assert.ok(r&&r.sourceCoverageAttested===true,slug);
  assert.equal(r.scope,'complete_official_ufc_career',slug);
  assert.equal(r.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(r.sourceSnapshot.sourceCommit,primary.pinnedSource.sourceCommit,slug);
  assert.equal(r.officialFighterUrl,p.officialFighterUrl,slug);
  assert.equal(r.fighterUrl,p.pinnedGrecoFighterUrl,slug);
  assert.equal(r.officialUfcCareerBoutCount,3,slug);
  assert.deepEqual(r.verifiedNumericFighterIds,[x.id],slug);
  assert.deepEqual(r.bouts.map(b=>[b.nativeBoutId,b.opponent,b.result]),x.b,slug);
  assert.equal(new Set(r.bouts.map(b=>b.fightUrl)).size,3,slug);
  for(const b of r.bouts){
   assert.equal(b.nativeFighterId,x.id,slug);
   assert.match(b.fightUrl,/^https:\/\/ufcstats\.com\/fight-details\/[0-9a-f]{16}$/i,slug);
   assert.ok(p.bouts.some(z=>z.date===b.date&&z.opponent===b.opponent&&z.result===b.result),slug);
  }
  total+=r.bouts.length;
 }
 assert.equal(total,18);
});
test('four exact DWCS native records preserved as feeder-only without inflating the UFC-only career',()=>{
 for(const [slug,x] of Object.entries(cases)){
  const actual=feeder.bouts.filter(z=>z.fighterSlug===slug);
  assert.deepEqual(actual.map(z=>z.boutId).sort(),x.feeder.slice().sort(),slug);
  for(const id of x.feeder){const row=actual.find(z=>z.boutId===id);assert.ok(row);
   assert.equal(row.sourceUrl,registry.fighters[slug].officialFighterUrl,slug);
   assert.ok(!registry.fighters[slug].bouts.some(z=>z.nativeBoutId===id),slug);
  }
  if(x.feeder.length)assert.deepEqual(registry.fighters[slug].sourceVerifiedExcludedFeederBouts.map(z=>z.nativeBoutId).sort(),x.feeder.slice().sort(),slug);
 }
});
test('Connor official Jose Miguel Delgado and Greco Jose Delgado names tied to ONE exact original opposing numeric fighter ID',()=>{
 const a=registry.fighters['connor-matthews'];const d=a.disambiguation;
 assert.ok(d);assert.equal(d.opponentOfficialFullName,'Jose Miguel Delgado');
 assert.equal(d.opponentPinnedHistoricalName,'Jose Delgado');
 assert.equal(d.verifiedOriginalNativeOpponentNumericId,'436');
 assert.equal(d.verifiedOriginalNativeBoutId,'60996');
 assert.equal(d.verifiedExactFightUrl,a.bouts.find(z=>z.nativeBoutId==='60996').fightUrl);
 assert.equal(d.officialEventResult,'https://www.ufc.com/event/ufc-fight-night-february-15-2025');
 const p=primary.fighters['connor-matthews'].bouts.find(z=>z.date==='2025-02-15');
 assert.equal(p.verifiedOfficialNameAlias,'Jose Miguel Delgado');
 assert.equal(p.sourceVerifiedNativeOpponentFighterId,'436');
});
test('completed-fight cutoff, RTU official final and detailed outcomes are strict',()=>{
 const bia=registry.fighters['bia-mesquita'];assert.ok(!bia.bouts.some(x=>x.date>='2026-11-14'));
 assert.match(bia.sourceScopeVerified,/Upcoming 2026-11-14 Macy Chiasson bout not yet completed/);
 const changho=registry.fighters['changho-lee'];
 assert.equal(changho.bouts[0].nativeBoutId,'38816');
 assert.equal(changho.bouts[0].date,'2024-06-22');
 assert.equal(changho.bouts[0].opponent,'Xiao Long');
 assert.match(changho.sourceScopeVerified,/Road to UFC 2 live final/);
 assert.deepEqual(registry.fighters['denys-bondar'].bouts.map(x=>x.result),['loss','loss','loss']);
 assert.deepEqual(registry.fighters['connor-matthews'].bouts.map(x=>x.result),['loss','loss','loss']);
 assert.deepEqual(registry.fighters['damian-pinas'].bouts.map(x=>x.result),['win','win','win']);
});
