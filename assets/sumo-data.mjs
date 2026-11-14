/* BEFN Sumo — pure, independently testable source-data transformations.
 * All displayed counts must be traceable to the cached API payload; this
 * module never upgrades a partial sample into a certified career record.
 */
export const SOURCE_URL = 'https://www.sumo-api.com/api-guide';
export const JSA_URL = 'https://www.sumo.or.jp/EnSumoDataRikishi/search';
export const DIVISIONS = ['Makuuchi','Juryo','Makushita','Sandanme','Jonidan','Jonokuchi'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function bashoLabel(value) {
  const x = String(value ?? '');
  if (!/^(19|20)\d{2}(01|03|05|07|09|11)$/.test(x)) return x || 'Unknown tournament';
  return MONTHS[Number(x.slice(4)) - 1] + ' ' + x.slice(0,4);
}
export function divisionOf(rank) {
  const r = String(rank ?? '').toLowerCase();
  if (/yokozuna|ozeki|sekiwake|komusubi|maegashira/.test(r)) return 'Makuuchi';
  for (const d of DIVISIONS) if (r.startsWith(d.toLowerCase())) return d;
  return 'Unranked';
}

/** Authoritative current tracked cohort: derive eligibility from the published
 * banzuke for the selected basho, not from potentially stale roster rank text.
 * Strictly refuse to publish partial, duplicated or identity-mismatched data.
 */
export const TRACKED_DIVISIONS = Object.freeze(['Makuuchi','Juryo','Makushita']);
export function trackedBanzukeCohort(sourceRoster, banzukeByDivision) {
  if (!Array.isArray(sourceRoster) || !sourceRoster.length) throw new Error('Missing Sumo source roster');
  const byId = new Map();
  for (const row of sourceRoster) {
    if (!Number.isSafeInteger(row?.sourceId) || row.sourceId <= 0 || byId.has(row.sourceId)) {
      throw new Error('Invalid or duplicate source roster identity');
    }
    byId.set(row.sourceId, row);
  }
  const used = new Set();
  const rikishi = [];
  const divisionCounts = {};
  for (const division of TRACKED_DIVISIONS) {
    const table = banzukeByDivision?.[division];
    if (!table || !Array.isArray(table.east) || !Array.isArray(table.west) ||
        !table.east.length || !table.west.length) {
      throw new Error('Incomplete current banzuke: '+division);
    }
    divisionCounts[division] = 0;
    for (const entry of [...table.east,...table.west]) {
      const id = Number(entry?.rikishiID);
      if (!Number.isSafeInteger(id) || id <= 0 || used.has(id)) {
        throw new Error('Invalid or duplicate banzuke identity: '+division);
      }
      const row = byId.get(id);
      if (!row || !entry?.shikonaEn || !entry?.rank || divisionOf(entry.rank) !== division) {
        throw new Error('Unreconciled banzuke identity/rank: '+division+' / '+id);
      }
      used.add(id);
      divisionCounts[division]++;
      rikishi.push({
        ...row,
        currentRank: entry.rank,
        sourceReportedRank: row.currentRank || null
      });
    }
  }
  return {
    rikishi,
    count: rikishi.length,
    divisionCounts,
    trackedDivisions: [...TRACKED_DIVISIONS]
  };
}

export function recordSummary(record, division = 'Makuuchi') {
  const data = Array.isArray(record) ? record : [];
  const lower = division === 'Makushita' || division === 'Sandanme' ||
    division === 'Jonidan' || division === 'Jonokuchi';
  // The API marks unfought calendar days "absent" in lower divisions, even
  // when a wrestler is simply not scheduled. Absence/kyujo cannot be inferred.
  const out = { win: 0, loss: 0, absence: lower ? null : 0, noBout: 0, pending: 0, completed: 0 };
  for (const item of data) {
    const result = String(item?.result ?? '').toLowerCase();
    if (result === 'win') { out.win++; out.completed++; }
    else if (result === 'loss') { out.loss++; out.completed++; }
    else if (result === 'absent' || result === 'absence' || result === 'kyujo') {
      if (lower) out.noBout++;
      else out.absence++;
    }
    else out.pending++;
  }
  return out;
}
export function sortBanzukeEntries(banzuke) {
  const rows = [...(Array.isArray(banzuke?.east) ? banzuke.east : []),
                ...(Array.isArray(banzuke?.west) ? banzuke.west : [])];
  return rows.sort((a,b) => (Number(a.rankValue) || 99999) - (Number(b.rankValue) || 99999)
      || (a.side === 'East' ? -1 : 1));
}
export function rankTable(banzuke) {
  return sortBanzukeEntries(banzuke).map(entry => ({
    ...entry, summary: recordSummary(entry.record, divisionOf(entry.rank))
  }));
}
export function leadingRikishi(banzuke, count = 6) {
  const list = rankTable(banzuke);
  return list.sort((a,b) => b.summary.win - a.summary.win
    || a.summary.loss - b.summary.loss
    || (Number(a.rankValue) || 99999) - (Number(b.rankValue) || 99999)).slice(0,count);
}
export function currentDay(banzuke) {
  const rows = sortBanzukeEntries(banzuke);
  return Math.max(0, ...rows.map(row => (row.record || []).filter(x =>
    ['win','loss','absent','absence','kyujo'].includes(String(x?.result ?? '').toLowerCase())
  ).length));
}
export function dailyResults(banzuke, day) {
  if (!Number.isInteger(day) || day < 1 || day > 15) return [];
  // List each matchup at most once using a symmetric, stable identity key.
  const seen = new Set(); const results = [];
  for (const row of sortBanzukeEntries(banzuke)) {
    const rec = row.record?.[day - 1];
    if (!rec || !['win','loss'].includes(rec.result)) continue;
    const opponentId = Number(rec.opponentID);
    const selfId = Number(row.rikishiID);
    if (!Number.isInteger(opponentId) || !Number.isInteger(selfId)) continue;
    const key = [selfId,opponentId].sort((a,b)=>a-b).join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    const selfWon = rec.result === 'win';
    results.push({
      key, rikishiId: selfId, rikishi: row.shikonaEn,
      opponentId, opponent: rec.opponentShikonaEn || 'Opponent not supplied',
      winnerId: selfWon ? selfId : opponentId,
      winner: selfWon ? row.shikonaEn : rec.opponentShikonaEn,
      kimarite: rec.kimarite || null,
      rank: row.rank || ''
    });
  }
  return results;
}
export function matchResult(match, id) {
  const athleteId = Number(id);
  if (!match || !(athleteId === Number(match.eastId) || athleteId === Number(match.westId))) return null;
  const opponentId = athleteId === Number(match.eastId) ? Number(match.westId) : Number(match.eastId);
  const opponent = athleteId === Number(match.eastId) ? match.westShikona : match.eastShikona;
  const winner = Number(match.winnerId);
  const hasResult = winner === athleteId || winner === opponentId;
  return {
    bashoId: String(match.bashoId || ''), day: Number(match.day) || null,
    opponentId, opponent: opponent || 'Unknown opponent',
    outcome: !hasResult ? 'pending' : (winner === athleteId ? 'win' : 'loss'),
    kimarite: match.kimarite || null,
    division: match.division || null,
    isFusen: /fusen/i.test(String(match.kimarite || ''))
  };
}
/** Completed current-basho bouts for a tracked wrestler.
 * The source banzuke records have 15 calendar-day positions in ALL divisions.
 * Makushita has non-bout days between up to seven bouts: those must not be
 * counted as loss or kyūjō without a corroborating torikumi.
 */
export function currentBashoMatchSample(entry, bashoId) {
  if (!entry || !Array.isArray(entry.record)) return [];
  const div = divisionOf(entry.rank);
  const rows = [];
  for (const [i, rec] of entry.record.entries()) {
    if (!['win','loss'].includes(String(rec?.result || '').toLowerCase())) continue;
    const oppId = Number(rec.opponentID);
    const result = String(rec.result).toLowerCase();
    rows.push({
      bashoId: String(bashoId || ''),
      day: i + 1,
      boutSequence: rows.length + 1,
      opponentId: Number.isSafeInteger(oppId) && oppId > 0 ? oppId : null,
      opponent: rec.opponentShikonaEn || 'Opponent not supplied',
      outcome: result,
      kimarite: rec.kimarite || null,
      division: div,
      isFusen: /fusen/i.test(String(rec.kimarite || '')),
      sourceScope: 'current-basho-banzuke'
    });
  }
  return rows.reverse();
}

export function validMatchSamples(detail, rikishiId) {
  if (detail?.matches?.status !== 'available' || !Array.isArray(detail?.matches?.data?.records)) return [];
  return detail.matches.data.records
    .map(m => matchResult(m, rikishiId))
    .filter(Boolean)
    .sort((a,b) => b.bashoId.localeCompare(a.bashoId) || (b.day || 0) - (a.day || 0));
}
export function techniqueDistribution(matches, rikishiId) {
  const counts = new Map();
  for (const m of matches || []) {
    if (Number(m?.winnerId) !== Number(rikishiId)) continue;
    const key = String(m.kimarite || '').toLowerCase().trim();
    if (!key || key === 'fusen' || key === 'unknown') continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sampleWins = [...counts.values()].reduce((a,b)=>a+b,0);
  return {
    sampleWins,
    techniques: [...counts].sort((a,b) => b[1] - a[1]).map(([technique,wins]) => ({
      technique, wins, percentage: sampleWins ? Math.round(wins * 1000 / sampleWins) / 10 : 0
    }))
  };
}
export function detailFor(details, id) {
  return Array.isArray(details?.featured) ? details.featured.find(f => Number(f.id) === Number(id)) || null : null;
}
export function banzukeFor(banzuke, id) {
  return sortBanzukeEntries(banzuke).find(x => Number(x.rikishiID) === Number(id)) || null;
}
export function searchRikishi(rikishi, {query = '', division = 'All'} = {}) {
  const q = String(query).trim().toLocaleLowerCase();
  return (Array.isArray(rikishi) ? rikishi : []).filter(r => {
    if (division !== 'All' && divisionOf(r.currentRank) !== division) return false;
    if (!q) return true;
    return [r.shikonaEn, r.shikonaJp, r.heya, r.birthplace, r.currentRank]
      .some(v => String(v || '').toLocaleLowerCase().includes(q));
  });
}
export function snapshotDate(date) {
  if (!date || !Number.isFinite(new Date(date).getTime())) return 'Date not available';
  return new Intl.DateTimeFormat('en-AU', { timeZone:'Australia/Melbourne', day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true }).format(new Date(date)) + ' AEDT';
}


/** Source-derived birthplace country, not citizenship/nationality.
 * No flag is inferred for an unmatched location.
 */
const JAPAN_PREFECTURES = new Set(
 'Hokkaido Aomori Iwate Miyagi Akita Yamagata Fukushima Ibaraki Tochigi Gunma Saitama Chiba Tokyo Kanagawa Niigata Toyama Ishikawa Fukui Yamanashi Nagano Gifu Shizuoka Aichi Mie Shiga Kyoto Osaka Hyogo Nara Wakayama Tottori Shimane Okayama Hiroshima Yamaguchi Tokushima Kagawa Ehime Kochi Fukuoka Saga Nagasaki Kumamoto Oita Miyazaki Kagoshima Okinawa'.split(' ')
);
const COUNTRIES = Object.freeze({
  japan: { name:'Japan', code:'JP', flag:'🇯🇵' },
  mongolia: { name:'Mongolia', code:'MN', flag:'🇲🇳' },
  ukraine: { name:'Ukraine', code:'UA', flag:'🇺🇦' },
  russia: { name:'Russia', code:'RU', flag:'🇷🇺' },
  china: { name:'China', code:'CN', flag:'🇨🇳' },
  kazakhstan: { name:'Kazakhstan', code:'KZ', flag:'🇰🇿' },
  georgia: { name:'Georgia', code:'GE', flag:'🇬🇪' },
  bulgaria: { name:'Bulgaria', code:'BG', flag:'🇧🇬' },
  egypt: { name:'Egypt', code:'EG', flag:'🇪🇬' },
  brazil: { name:'Brazil', code:'BR', flag:'🇧🇷' },
  usa: { name:'United States', code:'US', flag:'🇺🇸' }
});
export function originCountry(birthplace) {
  if (typeof birthplace !== 'string' || !birthplace.trim()) return null;
  const prefix = birthplace.trim().split(',')[0].trim();
  const lower = prefix.toLowerCase();
  if (Object.hasOwn(COUNTRIES,lower)) return COUNTRIES[lower];
  if (/^(united states|usa|u\.s\.a\.)$/i.test(prefix)) return COUNTRIES.usa;
  if (/^japan$/i.test(prefix)) return COUNTRIES.japan;
  const pref = prefix.replace(/-(ken|fu|to|do)$/i,'').trim();
  return JAPAN_PREFECTURES.has(pref) ? COUNTRIES.japan : null;
}

/** East and West occupy different rank slots. We compare actual positions in
 * the combined three-division banzuke (1..190), never raw rankValue values.
 * Cross-division changes are explicitly named and unavailable histories stay null.
 */
export function rankPositions(banzukeByDivision) {
  const positions = new Map();
  let ordinal = 0;
  for (const division of TRACKED_DIVISIONS) {
    const table = banzukeByDivision?.[division];
    if (!table?.east || !table?.west) return null;
    for (const row of sortBanzukeEntries(table)) {
      const id = Number(row.rikishiID);
      if (!Number.isSafeInteger(id) || positions.has(id)) return null;
      positions.set(id,{ position:++ordinal, division, rank:row.rank });
    }
  }
  return positions;
}
export function banzukeMovement(rikishiId, currentBanzuke, priorBanzuke) {
  const current=rankPositions(currentBanzuke), prior=rankPositions(priorBanzuke);
  if(!current||!prior) return {status:'unavailable', label:'Previous rank unavailable', places:null};
  const curr=current.get(Number(rikishiId)), old=prior.get(Number(rikishiId));
  if(!curr) return {status:'unavailable',label:'Current rank unavailable',places:null};
  if(!old) return {status:'new',label:'New to tracked top three',places:null, currentRank:curr.rank};
  const places=old.position-curr.position;
  return {
    status:places>0?'up':places<0?'down':'same',
    places:Math.abs(places),
    label:places>0?'Up '+places+' places':places<0?'Down '+Math.abs(places)+' places':'Unchanged',
    currentRank:curr.rank, previousRank:old.rank,
    previousDivision:old.division, division:curr.division,
    divisionChanged:old.division!==curr.division
  };
}

/** API-provided highest rank only; never infer a historical career high from
 * the current rank or a two-tournament sample.
 */
export function verifiedHighestRank(rikishiDetail) {
  if(!rikishiDetail || typeof rikishiDetail!=='object') return null;
  const candidates=[rikishiDetail.highestRank,rikishiDetail.highestRankString,
    rikishiDetail.careerHighRank,rikishiDetail.maxRank];
  const x=candidates.find(v=>typeof v==='string' && v.trim() && divisionOf(v)!=='Unranked');
  return x||null;
}

/** Only publish H2H when the API provides explicit matchup win/loss totals.
 * A partial tournament sample must not be presented as lifetime head-to-head.
 */
export function verifiedHeadToHead(record, fighterId, opponentId) {
  if(!record || typeof record!=='object') return null;
  const a=Number(fighterId),b=Number(opponentId);
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a===b) return null;
  const idA=Number(record.rikishiId ?? record.rikishiID ?? record.id);
  const idB=Number(record.opponentId ?? record.opponentID ?? record.otherId);
  if(idA!==a || idB!==b) return null;
  const wins=record.wins,losses=record.losses;
  if(!Number.isInteger(wins)||!Number.isInteger(losses)||wins<0||losses<0) return null;
  return {wins,losses,total:wins+losses,source:'sumo-api head-to-head'};
}
