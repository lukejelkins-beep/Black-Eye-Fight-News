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

export function recordSummary(record) {
  const data = Array.isArray(record) ? record : [];
  const out = { win: 0, loss: 0, absence: 0, pending: 0, completed: 0 };
  for (const item of data) {
    const result = String(item?.result ?? '').toLowerCase();
    if (result === 'win') { out.win++; out.completed++; }
    else if (result === 'loss') { out.loss++; out.completed++; }
    else if (result === 'absent' || result === 'absence' || result === 'kyujo') out.absence++;
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
    ...entry, summary: recordSummary(entry.record)
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
