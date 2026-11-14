#!/usr/bin/env node
// BEFN boxing foundation builder — research branch only.
// Never writes production, never fetches an API or external site.
// Inputs: dated ranking snapshot, existing site scouting archive and
// independently reconciled CompuBox per-bout JSON reports.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const read = p => fs.readFileSync(path.join(ROOT,p),'utf8');
const write = (p,s) => {
  const dest = path.join(ROOT,p);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,s,'utf8');
};
const normalize = s => String(s||'').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim();
const unique = arr => [...new Set(arr)];
const slug = s => normalize(s).replace(/\s+/g,'-');
function fail(m){throw new Error(m);}
function siteBoxers(){
  const html = read('index.html');
  const marker = 'window.COMBAT_DATA = ';
  const start = html.indexOf(marker);
  if(start < 0) fail('No embedded COMBAT_DATA found in site');
  const from = start + marker.length;
  const to = html.indexOf('\n',from);
  if(to < 0) fail('COMBAT_DATA line missing');
  const embedded = JSON.parse(html.slice(from,to).trim().replace(/;\s*$/,''));
  if(!Array.isArray(embedded.fighters))fail('Site fighters missing');
  return embedded.fighters.filter(x=>x.sport==='Boxing');
}
const roster = JSON.parse(read('research/boxing/2026-11-14-cohort-preview.json'));
if(roster.fighters.length !== 499) fail('Expected 499 candidates; review roster revision first');
const site = siteBoxers();
const rosterByName = new Map();
for (const f of roster.fighters) {
  for(const alias of unique([f.fighter,...(f.name_variants||[])])){
    const k=normalize(alias);
    if(rosterByName.has(k) && rosterByName.get(k)!==f.fighter)fail('Ambiguous roster alias: '+alias);
    rosterByName.set(k,f.fighter);
  }
}
const legacyByName = new Map();
const extras = [];
for(const f of site){
  const canonical = rosterByName.get(normalize(f.name));
  if(canonical){
    if(legacyByName.has(canonical)) fail('Duplicate site scouting record: '+canonical);
    legacyByName.set(canonical,f);
  }else{
    extras.push(f);
  }
}

const reportDir = path.join(ROOT,'research/boxing/compubox/bouts');
const compu = new Map();
const reportIds = [];
if(fs.existsSync(reportDir)){
  const files=fs.readdirSync(reportDir).filter(x=>/^\d+\.json$/.test(x)).sort();
  for(const file of files){
    const report=JSON.parse(fs.readFileSync(path.join(reportDir,file),'utf8'));
    if(report.qa!=='pass_all_category_sum_checks' || !Array.isArray(report.fighters) || report.fighters.length!==2)continue;
    if(reportIds.includes(report.source_id))fail('Duplicate CompuBox report '+report.source_id);
    reportIds.push(report.source_id);
    for(const row of report.fighters){
      if(!row.roster_fighter || !roster.fighters.some(x=>x.fighter===row.roster_fighter))continue;
      const slot=compu.get(row.roster_fighter)||[];
      if(row.rounds.length===0 || !row.totals)fail('Malformed validated report '+report.source_id);
      slot.push({
        report_id:report.source_id,
        date:report.fight_date,
        report_title:report.report_title,
        opponent_name:null, // resolved using independent fight ledger later
        source_url:report.url,
        verification:'round_totals_reconciled',
        total:row.totals.total,
        jab:row.totals.jab,
        power:row.totals.power,
        rounds:row.rounds
      });
      compu.set(row.roster_fighter,slot);
    }
  }
}
function baseLegacy(f){
  if(!f) return null;
  const recent=(f.latest||[]).slice(0,5).map(b=>({
    date_text:b.date||null,opponent_text:b.opponent||null,
    outcome:b.outcome||null,method_text:b.method||null,
    verified:false,verification:'site_archive_needs_independent_bout_ledger'
  }));
  return {
    archive_record:f.record||null,
    record_verified:false,
    record_status:'archived_not_reconciled',
    existing_category:f.category||null,
    report_name:f.report||null,
    gym_stance_promotion_notes:f.meta||null,
    next_fight_text:f.next||null,
    next_fight_verified:!!f.nextVerified,
    narrative:Array.isArray(f.analysis)?f.analysis:[],
    recent_bouts:recent,
    source_links:(f.sources||[]).filter(x=>x.url && /^https:\/\//.test(x.url))
      .map(x=>({label:x.label,url:x.url})),
    verification_note:f.verificationNote||'Previously published scouting profile; review before use'
  };
}
function build(f,extra=false){
  const name = extra ? f.name : f.fighter;
  const prior = extra ? f : legacyByName.get(name);
  const events = extra ? [] : (f.appearances||[]);
  const ranks = events.filter(e=>e.type==='ranking')
    .map(e=>({division:e.division,organisation:e.organization,rank:e.rank,
      published_date:roster.sources_as_of[e.organization]||roster.snapshot_date}));
  const titles = events.filter(e=>e.type==='champion')
    .map(e=>({division:e.division,organisation:e.organization,
      classification:e.title_classification||'world',
      published_date:roster.sources_as_of[e.organization]||roster.snapshot_date,
      confirmation_status:'provisional_ranking_snapshot'}));
  const sources = new Set(events.map(x=>x.organization));
  const punches=(compu.get(name)||[]).sort((a,b)=>b.date.localeCompare(a.date));
  const archive=baseLegacy(prior);
  const tier=titles.length?'ranked_titleholder_snapshot':ranks.length?'ranked':'scouting_extension';
  const divisions=extra?[f.division]:f.divisions;
  return {
    id:'boxing-'+slug(name),name,
    sport:'Boxing',
    scope:extra?'supplementary_legacy_scouting':'provisional_top_ranked_roster',
    cohort_approved:false,
    divisions,
    primary_division:divisions.length===1?divisions[0]:null,
    primary_division_review:divisions.length>1,
    identity_aliases:extra?[f.name]:(f.name_variants||[]),
    status:tier,
    ranking_snapshot_date:roster.snapshot_date,
    rankings:ranks,
    titles,
    ranked_by:[...sources],
    archived_scouting:archive,
    professional_record:{
      wins:null,losses:null,draws:null,knockouts:null,
      display:archive?.archive_record||null,
      verified:false,verification:'awaiting_professional_bout_ledger'
    },
    windows:{
      last_5:{fights_verified:null,results_verified:null,punch_metrics:null,coverage:'pending_bout_ledger'},
      last_10:{fights_verified:null,results_verified:null,punch_metrics:null,coverage:'pending_bout_ledger'},
      career:{fights_verified:null,results_verified:null,punch_metrics:null,coverage:'pending_bout_ledger'}
    },
    compubox:{
      report_count:punches.length,
      verified_report_fights:punches,
      aggregate_metrics:null,
      coverage:'unknown_without_complete_fight_history'
    },
    media:{portrait_url:null,rights_status:'not_yet_cleared'},
    review:{
      source_snapshot:true,
      identity_verified:!extra && divisions.length===1 && f.name_variants.length<=1,
      fight_ledger_verified:false,
      photo_rights_cleared:false,
      ready_to_publish:false,
      blockers:unique([
        'professional_record_and_fights_require_verification',
        ...(divisions.length>1?['review_multiple_weight_divisions']:[]),
        ...(f.name_variants&&f.name_variants.length>1?['review_name_variations']:[]),
        ...(extra?['outside_ranked_cohort_approval_pending']:[])
      ])
    }
  };
}
const profiles=[
  ...roster.fighters.map(f=>build(f)),
  ...extras.map(f=>build(f,true))
].sort((a,b)=>a.name.localeCompare(b.name));
const uniqueIds = new Set(profiles.map(x=>x.id));
if(uniqueIds.size!==profiles.length) fail('Profile ID collision');
if(profiles.length!==499+extras.length)fail('Incorrect total');
const countedRanked=profiles.filter(x=>x.scope==='provisional_top_ranked_roster').length;
const withArchived=profiles.filter(x=>x.archived_scouting).length;
const withPunch=profiles.filter(x=>x.compubox.report_count>0).length;
const archivalEntries=profiles.reduce((s,p)=>s+(p.archived_scouting?.recent_bouts.length||0),0);
const storedPunchAppearances=profiles.reduce((s,p)=>s+p.compubox.report_count,0);
const result={
  schema_version:'befn.boxing.profiles.foundation.v1',
  generated_at:new Date().toISOString(),
  status:'RESEARCH_ONLY_NO_PRODUCTION_DEPLOY',
  source_roster_date:roster.snapshot_date,
  data_quality_rule:'Missing or unverified fight and punch data are null, never zero. Archive scouting results are not independently certified.',
  summary:{
    total:profiles.length,
    ranked_provisional:countedRanked,
    supplementary_scouts:extras.length,
    existing_profiles_reused:withArchived,
    existing_ranked_profiles_reused:legacyByName.size,
    archival_recent_bout_entries:archivalEntries,
    fighters_with_validated_compubox_bouts:withPunch,
    validated_compubox_bout_reports:reportIds.length,
    matched_report_performances:storedPunchAppearances,
    published_profiles:0
  },
  profiles
};
if(result.summary.total !== 509 || withArchived !== 78 || archivalEntries !== 345){
  // Explicitly stop if source inventory changes: audit before accepting changed counts.
  fail('Legacy inventory unexpected: '+JSON.stringify(result.summary));
}
write('research/boxing/generated/boxing-profiles-foundation-v1.json', JSON.stringify(result,null,2)+'\n');
const qa=[
'# Boxing profile foundation build QA',
'',
'Research branch only; no site deployment. Generated: '+result.generated_at,
'',
'| Measure | Count |',
'|---|---:|',
...Object.entries(result.summary).map(([k,v])=>'| '+k.replaceAll('_',' ')+' | '+v+' |'),
'',
'## Rules',
'- Every candidate retains all five-source ranking appearances and separately tagged title snapshots.',
'- A boxer appearing in two divisions has one profile and two sets of ranking memberships; primary class is pending review.',
'- A retained legacy scouting profile and its recent fights remain labelled archive/unverified until independently certified.',
'- Verified CompuBox *single-bout reports* may show on a profile, but five/ten/career punch metrics remain unavailable until full bout histories are established.',
'- No athlete portrait hotlinks copied from previous site data without reuse rights.',
'- No preview profile is marked ready to publish.',
'',
'## Required next stage',
'1. Certify fighter identity and the ranking/champion roster, including cross-division boxers.',
'2. Match independently verified professional bout histories to the cohort, starting with existing scouting profiles.',
'3. Reuse linked CompuBox report cache and pair each report with date/opponent identity.',
'4. Compute accurate five-/ten-/career results first and punch measures for covered bouts only.',
'5. Review profile design on the research preview before promoting a tested batch to production.',
''
];

function csvValue(value){
  const s=String(value===null||value===undefined?'':value);
  return /[,"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function isoDate(text){
  const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const m=String(text||'').match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if(!m)return null;
  const month=months[m[2].toLowerCase()];
  if(!month)return null;
  const year=Number(m[3]),day=Number(m[1]);
  const actual=new Date(Date.UTC(year,month-1,day));
  if(actual.getUTCFullYear()!==year||actual.getUTCMonth()!==month-1||actual.getUTCDate()!==day)return null;
  return actual.toISOString().slice(0,10);
}
const queue=[];
for(const p of profiles){
  if(!p.archived_scouting)continue;
  const weight=p.titles.length?1:p.rankings.some(r=>r.organisation==='RING')?2:p.rankings.length?3:4;
  const source_urls=p.archived_scouting.source_links.map(x=>x.url).filter(x=>!x.includes('google.com/search'));
  p.archived_scouting.recent_bouts.forEach((bout,i)=>{
    // Some legacy opponents include internally generated initials; do not
    // guess identities when populating a verified professional fight ledger.
    const opponent_candidate = String(bout.opponent_text||'').replace(/^[A-Z]{2}\s+(?=[A-Za-z])/,'');
    queue.push({
      priority:weight,
      boxer:p.name,
      boxer_id:p.id,
      division:p.primary_division||p.divisions.join('; '),
      ranking_scout_status:p.status,
      legacy_recency_position:i+1,
      date_text:bout.date_text,
      fight_date_iso:isoDate(bout.date_text),
      opponent_raw:bout.opponent_text,
      opponent_candidate:opponent_candidate,
      outcome_archived:bout.outcome,
      method_archived:bout.method_text,
      source_urls:source_urls,
      ledger_status:'NEEDS_INDEPENDENT_VERIFICATION',
      opponent_id:null,
      compubox_report_id:null,
      official_outcome:null,
      verified_bout_id:null
    });
  });
}
if(queue.length!==345)fail('Unexpected archived fight queue count: '+queue.length);
queue.sort((a,b)=>a.priority-b.priority||
  String(b.fight_date_iso).localeCompare(String(a.fight_date_iso))||
  a.boxer.localeCompare(b.boxer)||a.legacy_recency_position-b.legacy_recency_position);
const ledgerCols=['priority','boxer','boxer_id','division','ranking_scout_status',
  'legacy_recency_position','date_text','fight_date_iso','opponent_raw','opponent_candidate',
  'outcome_archived','method_archived','source_urls','ledger_status',
  'opponent_id','compubox_report_id','official_outcome','verified_bout_id'];
const ledgerCsv=[ledgerCols.join(','),...queue.map(x=>ledgerCols.map(col=>csvValue(col==='source_urls'?x[col].join('; '):x[col])).join(','))].join('\n')+'\n';
write('research/boxing/generated/archived-bout-verification-queue.csv', ledgerCsv);
const badDates=queue.filter(x=>!x.fight_date_iso).length;
write('research/boxing/generated/archived-bout-verification-qa.json',
  JSON.stringify({as_of:roster.snapshot_date,entries:queue.length,provisional:queue.length,
    fighters_in_queue:unique(queue.map(x=>x.boxer)).length,
    unresolved_date_format:badDates,priority_1:queue.filter(x=>x.priority===1).length,
    priority_2:queue.filter(x=>x.priority===2).length,
    priority_3:queue.filter(x=>x.priority===3).length,
    priority_4:queue.filter(x=>x.priority===4).length,
    records_verified:0,compubox_links_verified_to_ledger:0,
    note:'Previous site research entries are not verified professional fight records.'},null,2)+'\n');

write('research/boxing/generated/profile-foundation-qa.md',qa.join('\n'));
process.stdout.write('Foundation build complete: '+JSON.stringify(result.summary)+'\n');
