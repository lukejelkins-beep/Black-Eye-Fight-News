/**
 * Audit BEFN Sumo test-snapshot quality, no external requests.
 * Outputs facts and omissions; never converts sample data into complete career proof.
 */
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {
  TRACKED_DIVISIONS, originCountry, banzukeMovement, dayMatchups,
  confirmedCareerHigh, verifiedHeadToHead, rankPositions, announcedTorikumiMatches
} from '../assets/sumo-data.mjs';

const read=async p=>JSON.parse(await readFile(p,'utf8'));
const roster=await read('data/sumo/rikishi-index.json');
const details=await read('data/sumo/preview-details.json');
const photos=await read('data/sumo/approved-photos.json');
const current={},previous={};
for(const division of TRACKED_DIVISIONS){
  const now=details.banzuke?.[division],prior=details.previousBanzuke?.[division];
  if(now?.status!=='available'||prior?.status!=='available') throw new Error('Incomplete current/prior banzuke: '+division);
  current[division]=now.data;
  previous[division]=prior.data;
}
const nowPositions=rankPositions(current),priorPositions=rankPositions(previous);
if(!nowPositions||!priorPositions||nowPositions.size!==roster.count)throw new Error('Banzuke rank reconciliation failed');
const idToFighter=new Map(roster.rikishi.map(r=>[r.sourceId,r]));
const movements={up:0,down:0,same:0,new:0,unavailable:0};
const nationalities={};
const unknownOrigins=[],unknownHeights=[],unknownWeights=[],knownHighs=[],unknownHighs=[];
const examples={up:[],down:[],same:[],new:[]};
for(const w of roster.rikishi){
  if(!nowPositions.has(w.sourceId))throw new Error('Missing current banzuke ID '+w.sourceId);
  const country=originCountry(w.birthplace);
  if(country)nationalities[country.name]=(nationalities[country.name]||0)+1;
  else unknownOrigins.push(w.shikonaEn);
  if(!(Number.isFinite(w.heightCm)&&w.heightCm>0))unknownHeights.push(w.shikonaEn);
  if(!(Number.isFinite(w.weightKg)&&w.weightKg>0))unknownWeights.push(w.shikonaEn);
  const movement=banzukeMovement(w.sourceId,current,previous);
  movements[movement.status]++;
  if(examples[movement.status]?.length<7)examples[movement.status].push({
    name:w.shikonaEn,current:w.currentRank,previous:movement.previousRank||null,places:movement.places
  });
  const rich=details.featuredExtras?.find(x=>x.id===w.sourceId)?.rikishi;
  const high=confirmedCareerHigh({currentRank:w.currentRank,previousRank:movement.previousRank,apiDetail:rich?.status==='available'?rich.data:null});
  if(high)knownHighs.push({name:w.shikonaEn,rank:high.rank,evidence:high.evidence});
  else unknownHighs.push(w.shikonaEn);
}
let capturedH2h=0,capturedH2hUsable=0;
for(const extra of details.featuredExtras||[]){
  if(extra.headToHead?.record?.status!=='available')continue;
  capturedH2h++;
  const obj=extra.headToHead.record.data;
  const trusted={...obj,rikishiId:extra.id,opponentId:extra.headToHead.opponentId};
  if(verifiedHeadToHead(trusted,extra.id,extra.headToHead.opponentId))capturedH2hUsable++;
}
const matchupStats={};
for(const division of TRACKED_DIVISIONS){
  const keys=new Set();let completed=0;
  for(let day=1;day<=15;day++){
    for(const match of dayMatchups(current[division],day)){
      if(!match.finished)throw new Error('Unverified pending banzuke fixture published');
      keys.add(day+':'+match.key);completed++;
    }
  }
  const source=details.torikumi?.[division];
  const forthcoming=source?.status==='available'?announcedTorikumiMatches(source.data,{
    bashoId:details.bashoId,division,day:details.announcedDay
  }):[];
  const pending=forthcoming.filter(x=>!x.finished);
  matchupStats[division]={
    namedCompletedBouts:completed,
    separatelyAnnouncedUpcoming:pending.length,
    announcedDay:details.announcedDay||null,
    completedUniqueDayPairings:keys.size,
    futureDataStatus:source?.status||'not-collected'
  };
}
const output={
  status:'ok',schemaVersion:1,collectedAt:details.collectedAt,bashoId:details.bashoId,
  previousBashoId:details.previousBashoId,
  trackedRikishi:roster.count,divisionCounts:roster.divisionCounts,
  countryOrigins:nationalities,unknownOrigins,
  heightsKnown:roster.count-unknownHeights.length,weightsKnown:roster.count-unknownWeights.length,
  unknownHeightExamples:unknownHeights.slice(0,10),unknownWeightExamples:unknownWeights.slice(0,10),
  movement:movements,movementExamples:examples,
  careerHighsConfirmed:knownHighs.length,careerHighsUnknown:unknownHighs.length,careerHighExamples:knownHighs.slice(0,20),
  allTimeH2h:{capturedPairs:capturedH2h,usablePairs:capturedH2hUsable},
  matchingBouts:matchupStats,
  approvedPhotoEntries:Object.values(photos.bySourceId||{}).filter(x=>x?.approved===true).length,
  caveats:[
    'Country flags derive from the recorded birthplace, not citizenship',
    'Movement is based on current-vs-previous positions among the top three divisions only',
    'Only explicit all-time H2H source records count; others stay unavailable',
    'Career highs need historic rank evidence except a proven Yokozuna',
    'Photos are not published without source rights, attribution, and local approved assets',
    'This preview is not a live published results service'
  ]
};
if(unknownOrigins.length)throw new Error('Unresolved source birthplace country: '+unknownOrigins.join(','));
if(movements.unavailable)throw new Error('Unresolved rank movement for tracked current fighter');
await mkdir('qa/sumo-reports',{recursive:true});
await writeFile('qa/sumo-reports/coverage.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({
  tracked:output.trackedRikishi,divisionCounts:output.divisionCounts,
  movement:movements,flags:output.countryOrigins,
  careerHighsConfirmed:output.careerHighsConfirmed,
  heightKnown:output.heightsKnown,weightKnown:output.weightsKnown,
  h2h:output.allTimeH2h,bouts:output.matchingBouts,
  photos:output.approvedPhotoEntries
}));
