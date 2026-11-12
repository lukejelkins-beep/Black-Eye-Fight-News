#!/usr/bin/env node
import {checkDeploymentFreshness} from "./ufc-qa-freshness.mjs";
import {setTimeout as delay} from "node:timers/promises";
const base=process.env.BEFN_PROFILE_QA_BASE||"https://blackeyefightnews.com.au";
for(let n=0;n<3;n++){
 const x=await checkDeploymentFreshness({base,root:process.cwd()});
 if(x.ok){console.log("Production matches GitHub checkout ("+x.checked+" assets).");process.exit(0);}
 console.error("PRODUCTION OUT OF DATE: "+x.stale.map(v=>v.file+": "+v.reason).join("; "));
 if(n<2)await delay(7000);
}
console.error("Skipping expensive browser installation until Render deployment is current.");
process.exit(1);
