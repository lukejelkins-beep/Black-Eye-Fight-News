import test from "node:test";
import assert from "node:assert/strict";
import {lostFighters} from "../scripts/check-ufc-worker-retention.mjs";

test("an empty replacement worklog cannot discard researched athletes",()=>{
 const old={fighters:{"nina-milosevic":{status:"source_research"}}};
 const replacement={fighters:{}};
 assert.deepEqual(lostFighters(old,replacement),["nina-milosevic"]);
});
test("updating research status and adding fighters preserves existing work",()=>{
 const old={fighters:{"nina-milosevic":{status:"source_research"}}};
 const next={fighters:{"nina-milosevic":{status:"committed"},"new-fighter":{status:"source_research"}}};
 assert.deepEqual(lostFighters(old,next),[]);
});
test("new worklog has no previous entries to preserve",()=>{
 assert.deepEqual(lostFighters(null,{fighters:{"candidate":{}}}),[]);
});