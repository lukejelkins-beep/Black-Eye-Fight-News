import assert from 'node:assert/strict';
import {wikidataIdentity,socialProfileURL,officialProfileIdentities,registerCandidate,rosterCounts,normName} from '../scripts/discover-social-profiles.mjs';
assert.equal(normName('Jiří Procházka'),'jiriprochazka');
const entity={id:'Q12345',labels:{en:{value:'Jane Example'}},descriptions:{en:{value:'American mixed martial artist'}},
 claims:{
  P2002:[{rank:'normal',mainsnak:{datavalue:{value:'JaneMMA'}}}],
  P2003:[{rank:'normal',mainsnak:{datavalue:{value:'jane.mma'}}}],
  P11892:[{rank:'normal',mainsnak:{datavalue:{value:'jane.mma'}}}]
 }};
assert.deepEqual(wikidataIdentity(entity,'Jane Example','mma').map(p=>p.platform).sort(),['Instagram','Threads','X']);
assert.equal(wikidataIdentity(entity,'Different Jane','mma').length,0);
assert.equal(wikidataIdentity(entity,'Jane Example','boxing').length,0);
assert.equal(socialProfileURL('https://x.com/Example123').platform,'X');
assert.equal(socialProfileURL('https://www.threads.com/@fighter.example/').platform,'Threads');
assert.equal(socialProfileURL('https://www.instagram.com/p/abcDEF12/'),null);
assert.equal(socialProfileURL('https://x.com/fighter/status/1234567890123456789'),null);
const athlete='<h1>Jane Example</h1><script type="application/ld+json">'+JSON.stringify({'@type':'Person',name:'Jane Example',sameAs:['https://www.instagram.com/jane.mma/','https://x.com/JaneMMA']})+'</script>';
assert.equal(officialProfileIdentities(athlete,'Jane Example','mma','https://www.ufc.com/athlete/jane-example').length,2);
assert.equal(officialProfileIdentities('<h1>Other Person</h1>'+athlete,'Jane Example','mma','https://www.ufc.com/athlete/jane-example').length,0);
assert.equal(officialProfileIdentities(athlete,'Jane Example','mma','https://unknown.example/athlete/jane-example').length,0);
const cfg={platforms:{X:{accounts:[]},Instagram:{accounts:[]}},threads:{accounts:[],allowlistedUsernames:[]}};
const roster={fighters:[{name:'Jane Example',sport:'mma',tier:'contender',profiles:{X:null,Instagram:null},status:'identity-research-needed'}]};
const conflicts=[];
for(const c of wikidataIdentity(entity,'Jane Example','mma'))assert.equal(registerCandidate(cfg,roster,c,conflicts),true);
assert.equal(cfg.threads.allowlistedUsernames[0],'jane.mma');
assert.equal(rosterCounts(roster).withThreads,1);
assert.equal(rosterCounts(roster).tracked,1);
assert.equal(registerCandidate(cfg,roster,{platform:'X',username:'DifferentX',name:'Jane Example',sport:'mma',evidenceUrl:'test'},conflicts),false);
assert.equal(conflicts.length,1);
console.log('Identity discovery tests passed: exact sports/person links, conflicts, Threads, safe official JSON-LD.');
