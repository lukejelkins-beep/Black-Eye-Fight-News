import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Research-only exception diagnostics. This MUST NOT grant certification.
const load=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const cache=load('ufcalendar-rich-progress.json');
const profiles=load('ufcalendar-fighter-research.json').profiles;
const archive=load('ufc-research-archive.json');
const proofs=load('ufc-independent-full-career-verification.json').fighters;
const approval=load('ufc-36-month-roster-approval.json');
const targets=['hyunsung-park','wang-cong'];
const numeric=v=>/^[1-9][0-9]*$/.test(String(v??''));
test('Wave94: reserved exceptions remain independently uncertified pending native/source/round gates',()=>{
  assert.equal(approval.approvedFighters.length,783);
  for(const slug of targets){
    assert.ok(approval.approvedFighters.includes(slug),slug+' must belong to frozen cohort');
    assert.ok(!proofs[slug],slug+' already has canonical certification proof; do not duplicate');
    const rows=(profiles[slug]?.recentHistory||[]).filter(r=>r.source==='native'&&r.promotion==='ufc'&&numeric(r.boutId));
    assert.ok(rows.length>0,slug+' missing native history');
    const bouts=rows.map(row=>{
      const b=cache.bouts[row.boutId]||{};
      const opposite=[b.a,b.b].filter(Boolean);
      const matching=opposite.filter(c=>opposite.some(x=>x!==c&&x.name===row.opponent));
      const own=matching[0]||null;
      const paired=Boolean(b.a?.id&&b.b?.id&&b.a.id!==b.b.id);
      const id=own?.id||null;
      const indexedByDate=Object.entries(archive.fights||{}).filter(([key])=>String(key).includes(String(b.eventDate||row.date)));
      const measuredSource=indexedByDate.filter(([key,f])=>Array.isArray(f.rounds)&&f.rounds.some(round=>
        ['a','b'].some(k=>round?.[k]&&Object.entries(round[k]).some(([metric,v])=>metric!=='sourceByMetric'&&Number.isFinite(v)))));
      return {nativeBoutId:row.boutId,event:b.event,date:b.eventDate,opponent:row.opponent,
        sourceOutcome:row.result,cacheStatus:b.status,winningId:b.result?.winnerId??null,
        nativeFighterId:id,cornerA:b.a?.name,cornerAId:b.a?.id,
        cornerB:b.b?.name,cornerBId:b.b?.id,roundRetrieval:cache.roundDone?.[row.boutId]??null,
        paired,archiveDateKeyCount:indexedByDate.length,measuredArchiveDateKeys:measuredSource.map(([k])=>k).slice(0,8)};
    });
    const ids=[...new Set(bouts.map(b=>b.nativeFighterId).filter(Boolean))];
    const indexedOfficial=Object.values(cache.bouts||{}).filter(b=>b.org==='ufc'&&ids.some(id=>b.a?.id===id||b.b?.id===id))
      .map(b=>({id:b.id,event:b.event,date:b.eventDate,status:b.status,rounds:cache.roundDone?.[b.id]??null}));
    console.log('BEFN_WAVE94_NATIVE_EXCEPTION_PREFLIGHT='+JSON.stringify({slug,ids,bouts,indexedOfficial}));
  }
});