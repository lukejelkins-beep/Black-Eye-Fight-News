import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCareerEvidence,sharedOfficialUfcIdentitySlugs} from '../scripts/ufc-36-month-stage3-progress.mjs';

// Owner, 24 Nov 2026: a Road to UFC tournament final is certified as a result-only gap bout; a resolved duplicate
// slug is an alias that never certifies and no longer blocks its canonical slug. Everything else stays fail-closed.
const saved=[{date:'2024-06-29',opponent:'Carlos Hernandez',result:'win',promotion:'ufc',source:'native',boutId:'61052'}];
const final={date:'2024-02-03',opponent:'Jiniushiyue',result:'win',savedHistoryGap:true,roadToUfcFinal:true,
 officialUfcSourceUrl:'https://www.ufc.com/news/road-ufc-final-results-scorecards-season-2-finals-winner-interviews',
 officialUfcSourceQuote:'Flyweight Final: Rei Tsuruya defeats Jiniushiyue by TKO (strikes) at 4:59 of Round 1'};
const entry=extra=>({sourceCoverageAttested:true,verificationMethod:'full_official_ufc_fight_listing_crosscheck',
 verifiedAt:'2026-11-24',fighterUrl:'https://ufcstats.com/fighter-details/2f43a3e82661fa99',
 bouts:[{date:'2024-06-29',opponent:'Carlos Hernandez',result:'win',fightUrl:'https://ufcstats.com/fight-details/aaaaaaaaaaaaaaaa'},...extra]});
const verified=e=>evaluateCareerEvidence({name:'Rei Tsuruya'},saved,'2024-06-29','2026-11-14',e,{},'2026-11-14').independentlyVerified;

test('a sourced Road to UFC final is accepted as a result-only gap bout',()=>{
 assert.equal(verified(entry([final])),true);
});
test('a win or loss gap without the Road to UFC flag, quote or UFC.com source still fails',()=>{
 const {roadToUfcFinal,...unflagged}=final;
 assert.equal(verified(entry([unflagged])),false,'plain win gap');
 assert.equal(verified(entry([{...final,officialUfcSourceQuote:''}])),false,'no quote');
 assert.equal(verified(entry([{...final,officialUfcSourceUrl:'https://www.tapology.com/x'}])),false,'not ufc.com');
 assert.equal(verified(entry([{...final,nativeBoutId:'99999'}])),false,'an invented native id is refused');
 assert.equal(verified(entry([{...final,result:'no_contest',roadToUfcFinal:true}])),true,'a no-contest gap was already allowed');
});
test('a Road to UFC final that saved history already holds as a UFC bout is not a gap',()=>{
 const withFinal=[...saved,{date:'2024-02-03',opponent:'Jiniushiyue',result:'win',promotion:'ufc'}];
 assert.equal(evaluateCareerEvidence({name:'Rei Tsuruya'},withFinal,'2024-06-29','2026-11-14',entry([final]),{},'2026-11-14').independentlyVerified,false);
});
test('a resolved duplicate frees the canonical slug and always blocks the alias',()=>{
 const url='https://www.ufc.com/athlete/carlos-hernandez';
 const reg={a:{officialFighterUrl:url},b:{officialFighterUrl:url}};
 assert.deepEqual([...sharedOfficialUfcIdentitySlugs(['a','b'],reg)].sort(),['a','b'],'unresolved pair blocks both');
 const resolved={a:{officialFighterUrl:url},b:{officialFighterUrl:url,ownerConfirmedDuplicateOf:'a'}};
 assert.deepEqual([...sharedOfficialUfcIdentitySlugs(['a','b'],resolved)],['b']);
 const wrongUrl={a:{officialFighterUrl:url+'-2'},b:{officialFighterUrl:url,ownerConfirmedDuplicateOf:'a'}};
 assert.deepEqual([...sharedOfficialUfcIdentitySlugs(['a','b'],wrongUrl)],['b'],'a marked duplicate never certifies, even if malformed');
 const sameUrlMalformed={a:{officialFighterUrl:url},b:{officialFighterUrl:url,ownerConfirmedDuplicateOf:'zzz'}};
 assert.deepEqual([...sharedOfficialUfcIdentitySlugs(['a','b'],sameUrlMalformed)].sort(),['a','b'],'a malformed alias does not free the canonical');
 const third={...resolved,c:{officialFighterUrl:url}};
 assert.deepEqual([...sharedOfficialUfcIdentitySlugs(['a','b','c'],third)].sort(),['a','b','c'],'a third claimant still blocks');
});
