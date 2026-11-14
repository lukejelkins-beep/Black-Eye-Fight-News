import test from "node:test";
import assert from "node:assert/strict";
import {isOfficialUfcEvent,isFeederUfcEvent} from "../scripts/ufc-official-event-scope.mjs";
import {buildPostfightMetrics} from "../scripts/build-ufc-postfight-metrics.mjs";

const bout=(id,day,event,slug,opponent,otherSlug,significantLanded)=>({
 id:String(id),org:"ufc",status:"completed",eventDate:day,event,
 a:{id:String(id)+"a",name:"Carlos Hernandez",slug},
 b:{id:String(id)+"b",name:opponent,slug:otherSlug},
 result:{round:1,time:"5:00",method:"decision_unanimous",winnerId:String(id)+"a"},
 _significantLanded:significantLanded
});
const archiveFight=b=>({
 promotion:"UFC",date:b.eventDate,event:b.event,
 fighterA:b.a.name,fighterB:b.b.name,
 rounds:[{round:1,
  a:{sigLanded:b._significantLanded,sigAttempted:20},
  b:{sigLanded:3,sigAttempted:10}}]
});
test("UFC-only scope includes official TUF finales, excludes TV and feeder bouts",()=>{
 assert.equal(isOfficialUfcEvent("The Ultimate Fighter Season 28 Finale: Dos Anjos vs Usman"),true);
 assert.equal(isOfficialUfcEvent("The Ultimate Fighter: Team Joanna vs Team Claudia Finale"),true);
 assert.equal(isOfficialUfcEvent("The Ultimate Fighter: Team Jones vs Team Sonnen Episode 4"),false);
 assert.equal(isOfficialUfcEvent("UFC Fight Night: Burns vs Morales"),true);
 assert.equal(isOfficialUfcEvent("Dana White's Contender Series 99"),false);
 assert.equal(isFeederUfcEvent("Road to UFC Season 2"),true);
});
test("two same-name athletes retain separate exact-slug career histories",()=>{
 const b1=bout(9001,"2025-05-17","UFC Fight Night: Burns vs Morales",
  "carlos-hernandez-7","Park Hyun-sung","park-hyun-sung",8);
 const b2=bout(9002,"2024-08-20","UFC Fight Night: Example",
  "carlos-hernandez","Fighter Gamma","fighter-gamma",12);
 const p={bouts:{"9001":b1,"9002":b2}};
 const a={fights:{x:archiveFight(b1),y:archiveFight(b2)}};
 const out=buildPostfightMetrics(p,a,{asOf:"2026-11-14"});
 const first=out.fighters["carlos-hernandez"];
 const second=out.fighters["carlos-hernandez-7"];
 assert(first&&second,"both distinct identities must survive");
 assert.equal(first.careerBouts.length,1);
 assert.equal(second.careerBouts.length,1);
 assert.equal(first.careerBouts[0].boutId,"9002");
 assert.equal(second.careerBouts[0].boutId,"9001");
 assert.equal(first.careerBouts[0].metrics.sigLanded,12);
 assert.equal(second.careerBouts[0].metrics.sigLanded,8);
 assert.equal(out.metricBouts,2);
});
test("TUF finale indexed fight with saved rounds is measured, not discarded",()=>{
 const b=bout(9011,"2018-11-30",
  "The Ultimate Fighter Season 28 Finale: Dos Anjos vs Usman",
  "carlos-hernandez-7","Opponent Four","opponent-four",6);
 const out=buildPostfightMetrics({bouts:{"9011":b}},
  {fights:{one:archiveFight(b)}},{asOf:"2026-11-14"});
 assert.equal(out.metricBouts,1);
 assert.equal(out.fighters["carlos-hernandez-7"].careerBouts[0].metrics.sigLanded,6);
});
