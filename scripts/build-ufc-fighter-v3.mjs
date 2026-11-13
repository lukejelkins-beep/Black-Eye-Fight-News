// Post-ingestion only. All inputs are local, already sourced UFC snapshots.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import power from '../assets/fighter-power-index.js';
import scout from '../assets/ufc-prospect-contender.js';

const day = 86400000;
const url = value => typeof value === 'string' && /^https:\/\/[^/\s]+\//i.test(value);
const date = value => /^\d{4}-\d\d-\d\d$/.test(value || '') &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const bounded = value => Math.min(100, Math.max(0, value));
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const count = value => Number.isInteger(value) && value >= 0;
const nameKey = power.normalize;
const sum = (rows, fn) => rows.reduce((total, row) => total + fn(row), 0);
const weighted = (parts, coverage, minimum) => {
  const measured = parts.filter(([value]) => numeric(value));
  const available = sum(measured, part => part[1]);
  return measured.length >= minimum && available >= coverage
    ? sum(measured, ([value, weight]) => value * weight) / available : null;
};
export function finishType(method) {
  const value = String(method || '').toLowerCase().replace(/_/g, ' ');
  if (/^(?:ko|tko|knockout|technical knockout)\b/.test(value)) return 'ko';
  if (/^(?:technical submission|submission|sub)\b/.test(value)) return 'submission';
  return /\b(?:decision|disqualification|dq)\b/.test(value) ? 'other' : null;
}

function monthsBefore(asOf, months) {
  const cutoff = new Date(asOf);
  const originalDay = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const last = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(originalDay, last));
  return cutoff.toISOString().slice(0, 10);
}

const fields = [
  ['slpm', 'Significant strikes landed/min', 'rate', 'sigLanded', 60],
  ['sapm', 'Significant strikes absorbed/min', 'rate', 'sigAbsorbed', 60, true],
  ['diff', 'Significant-strike differential/15', 'rate', 'sigStrikeDifferential', 900],
  ['kd', 'Knockdowns/15', 'rate', 'knockdowns', 900],
  ['td', 'Takedowns/15', 'rate', 'takedowns', 900],
  ['control', 'Control seconds/15', 'rate', 'controlSec', 900],
  ['net', 'Net control seconds/15', 'rate', 'controlDifferentialSec', 900],
  ['sub', 'Submission attempts/15', 'rate', 'subAttempts', 900],
  ['acc', 'Significant-strike accuracy', 'pct', 'sigLanded', 'sigAttempted', false, 50],
  ['tdDef', 'Takedown defence', 'def', 'takedowns', 'takedownAttempts', false, 10],
  ['ko', 'KO/TKO wins', 'count'],
  ['submission', 'Submission wins', 'count'],
  ['strDef', '', 'def', 'sigLanded', 'sigAttempted', false, 50],
  ['damage', '', 'oppRate', 'knockdowns', 900, true],
  ['reversals', '', 'rate', 'reversals', 900],
  ['tdAcc', '', 'pct', 'takedowns', 'takedownAttempts', false, 10],
  ['oppControl', '', 'oppRate', 'controlSec', 900, true],
];

function metric(rows, bouts, spec) {
  const [id, , type, field, divisor, , minAttempts] = spec;
  if (type === 'count') {
    const decided = bouts.filter(x => x.outcome !== 'NC');
    if (decided.length < 2 || decided.some(x => x.outcome === 'W' && !finishType(x.method))) return null;
    return { value: decided.filter(x => x.outcome === 'W' && finishType(x.method) === id).length, bouts: decided.length };
  }
  const paired = type === 'def' || type === 'oppRate';
  const measured = [];
  for (const row of rows) {
    const stats = paired ? row.other : row.metrics;
    const value = stats?.[field];
    const attempts = stats?.[divisor];
    if (type === 'pct' || type === 'def') {
      if (count(value) && count(attempts) && attempts >= value && attempts > 0)
        measured.push({ n: type === 'def' ? attempts - value : value, d: attempts, seconds: row.cageSec });
    } else if (numeric(value) && (field.endsWith('Differential') || field.endsWith('DifferentialSec') || count(value)) &&
      (!/control/i.test(field) || Math.abs(value) <= row.cageSec)) {
      measured.push({ n: value, d: row.cageSec, seconds: row.cageSec });
    }
  }
  const seconds = sum(measured, row => row.seconds);
  const denominator = sum(measured, row => row.d);
  if (measured.length < 2 || (minAttempts ? denominator < minAttempts : seconds < 600)) return null;
  return { value: sum(measured, row => row.n) * (minAttempts ? 100 : divisor) / denominator,
    bouts: measured.length, seconds, ...(minAttempts ? { attempts: denominator } : {}) };
}

function fightKey(bout) {
  return nameKey(bout.opponent);
}

function timeline(cached, verified = []) {
  const rows = [];
  // Reviewed result wins a conflict. A one-day offset accommodates UFC event-local dates.
  for (const bout of [...verified, ...cached]) {
    if (!rows.some(x => fightKey(x) === fightKey(bout) && Math.abs(Date.parse(x.date) - Date.parse(bout.date)) <= day))
      rows.push(bout);
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export function buildV3({ progress, postfight, research = {}, profiles, asOf }) {
  if (!date(asOf)) throw new Error('A valid snapshot date is required');
  const cutoff = monthsBefore(asOf, 18);
  const cached = new Map();
  const individuals = new Map();
  const sidesByBout = new Map();
  const completed = new Set(['completed', 'draw', 'no_contest']);
  for (const fight of Object.values(progress.bouts || {})) {
    if (fight.org !== 'ufc' || !completed.has(fight.status) || !date(fight.eventDate) || fight.eventDate > asOf) continue;
    const a = nameKey(fight.a?.name), b = nameKey(fight.b?.name);
    if (!a || !b || a === b || !fight.id) continue;
    const winner = String(fight.result?.winnerId ?? '');
    if (fight.status === 'completed' && (!winner || ![String(fight.a.id), String(fight.b.id)].includes(winner))) continue;
    for (const [self, other] of [[fight.a, fight.b], [fight.b, fight.a]]) {
      const key = nameKey(self.name);
      const row = { date: fight.eventDate, opponent: other.name, boutId: String(fight.id),
        outcome: fight.status === 'draw' ? 'D' : fight.status === 'no_contest' ? 'NC' : winner === String(self.id) ? 'W' : 'L',
        method: fight.result?.method, titleFight: fight.titleFight === true };
      if (!cached.has(key)) cached.set(key, { name: self.name, rows: [] });
      cached.get(key).rows.push(row);
    }
  }
  for (const record of Object.values(research.profiles || {})) {
    if (record.source !== 'UFCalendar' || record.sport !== 'MMA' || !date(record.observedOn) || record.observedOn > asOf) continue;
    const key = nameKey(record.name);
    if (!key) continue;
    const outcomes = { win: 'W', loss: 'L', draw: 'D', no_contest: 'NC' };
    const history = (record.recentHistory || []).filter(x => x.promotion === 'ufc' && date(x.date) &&
      x.date <= asOf && x.opponent && Object.hasOwn(outcomes, x.result)).map(x => ({
      date: x.date, opponent: x.opponent, outcome: outcomes[x.result], method: x.method, titleFight: x.titleFight === true,
    }));
    if (!cached.has(key)) cached.set(key, { name: record.name, rows: [] });
    const entry = cached.get(key);
    entry.rows = entry.rows.concat(history);
  }
  for (const record of Object.values(postfight.fighters || {})) {
    if (record.scope !== 'ufc-only') continue;
    const key = nameKey(record.name);
    for (const row of record.recentBouts || []) {
      if (!row.boutId || !count(row.cageSec) || !row.cageSec || row.cageSec > 1500 || !row.metrics) continue;
      if (!sidesByBout.has(row.boutId)) sidesByBout.set(row.boutId, new Map());
      sidesByBout.get(row.boutId).set(key, row);
    }
  }
  for (const profile of profiles) {
    if (profile.organisation !== 'UFC' || profile.sport !== 'MMA' || !url(profile.source) ||
        profile.review?.credentialsChecked !== true || !date(profile.review.checkedAt) || profile.review.checkedAt > asOf) continue;
    const key = nameKey(profile.name);
    if (individuals.has(key)) continue;
    individuals.set(key, profile);
    if (!cached.has(key)) cached.set(key, { name: profile.name, rows: [] });
  }
  for (const [key, entry] of cached) {
    entry.history = timeline(entry.rows);
    const profile = individuals.get(key);
    const reviewed = (profile?.latest || []).filter(x => date(x.date) && x.date <= asOf && url(x.source) &&
      x.opponent && x.method && ['W', 'L', 'D', 'NC'].includes(x.outcome));
    entry.recent = timeline(entry.rows, reviewed).slice(0, 5).map(bout => {
      const match = entry.history.find(x => fightKey(x) === fightKey(bout) && x.outcome === bout.outcome &&
        Math.abs(Date.parse(x.date) - Date.parse(bout.date)) <= day);
      const sides = sidesByBout.get(match?.boutId);
      const row = sides?.get(key);
      if (!row || row.outcome !== bout.outcome) return bout;
      const opponent = sides.get(fightKey(bout));
      return { ...bout, cageSec: row.cageSec, metrics: row.metrics, other: opponent?.metrics };
    });
    entry.active = entry.recent[0]?.date >= cutoff;
    const covered = entry.recent.filter(x => x.metrics && x.outcome !== 'NC');
    entry.metrics = Object.fromEntries(fields.map(spec => [spec[0], metric(covered, entry.recent, spec)]));
  }

  const population = [...cached.values()].filter(entry => entry.active);
  const baselines = Object.fromEntries(fields.map(([id, , type]) =>
    [id, population.map(entry => {
      const measure = entry.metrics[id];
      return measure && type === 'count' ? measure.value * 5 / measure.bouts : measure?.value;
    }).filter(numeric)]));
  function percentile(id, value) {
    const values = baselines[id];
    if (!numeric(value) || values.length < 20) return null;
    const lower = values.filter(x => x < value).length;
    const tied = values.filter(x => x === value).length;
    const higher = values.length - lower - tied;
    if (!higher && lower) return 100;
    if (!lower && higher) return 35;
    return 35 + 65 * (lower + tied / 2) / values.length;
  }
  function opponentQuality(bout) {
    const rank = bout.opponentRankAtFight;
    const age = (Date.parse(bout.date) - Date.parse(bout.opponentRankCheckedAt)) / day;
    if (count(rank) && rank >= 1 && rank <= 15 && age >= 0 && age <= 90 &&
        /^https:\/\/(www\.)?ufc\.com\//i.test(bout.opponentRankSource || '')) return 100 - (rank - 1) * 2;
    const recordAge = (Date.parse(bout.date) - Date.parse(bout.opponentUfcRecordCheckedAt)) / day;
    if (url(bout.opponentUfcRecordSource) && recordAge >= 0 && recordAge <= 90 &&
        count(bout.opponentUfcFightsAtFight) && count(bout.opponentUfcWinsAtFight) &&
        bout.opponentUfcFightsAtFight >= 4 && bout.opponentUfcWinsAtFight <= bout.opponentUfcFightsAtFight)
      return 45 + 55 * bout.opponentUfcWinsAtFight / bout.opponentUfcFightsAtFight;
    const prior = cached.get(fightKey(bout))?.history.filter(x =>
      Date.parse(bout.date) - Date.parse(x.date) > day && ['W', 'L'].includes(x.outcome)) || [];
    if (prior.length < 3) return null;
    return 45 + 45 * (prior.filter(x => x.outcome === 'W').length + 1) / (prior.length + 2) +
      10 * Math.min(prior.length / 10, 1);
  }

  const boards = fields.filter(([, label]) => label).map(([id, label, type, , , reverse]) => {
    const eligible = population.filter(x => x.metrics[id] && (type !== 'count' || x.metrics[id].value > 0));
    eligible.sort((a, b) => (reverse ? 1 : -1) * (a.metrics[id].value - b.metrics[id].value) ||
      b.metrics[id].bouts - a.metrics[id].bouts || a.name.localeCompare(b.name));
    const positions = new Map();
    let previous, rank;
    eligible.forEach((entry, i) => {
      const metric = entry.metrics[id];
      if (previous !== metric.value) rank = i + 1;
      positions.set(nameKey(entry.name), rank);
      previous = metric.value;
    });
    return { id, label, type, eligible: eligible.length, positions,
      leaders: eligible.filter(entry => positions.get(nameKey(entry.name)) <= 10).map(entry => ({
        name: entry.name, rank: positions.get(nameKey(entry.name)), ...entry.metrics[id],
      })) };
  });

  const fighters = {};
  for (const [key, profile] of individuals) {
    const entry = cached.get(key);
    const fights = entry.recent.filter(x => x.outcome !== 'NC');
    const scored = fights.map((bout, i) => ({
      result: bout.outcome === 'W' ? 100 : bout.outcome === 'D' ? 50 : 0,
      weight: 5 - i, quality: opponentQuality(bout), bout,
    }));
    const recent = scored.length >= 2 ? weighted(scored.map(x => [x.result, x.weight]), 1, 2) : null;
    const qualified = scored.filter(x => numeric(x.quality));
    const quality = qualified.length >= 2 ? mean(qualified.map(x => x.quality)) : null;
    const performance = qualified.length >= 2 ? mean(qualified.map(x => x.result === 100
      ? 55 + .45 * x.quality : x.result === 0 ? .45 * x.quality : .5 * (50 + x.quality))) : null;
    const daysAgo = fights.length ? (Date.parse(asOf) - Date.parse(fights[0].date)) / day : null;
    const recency = daysAgo === null ? null : bounded(100 - daysAgo / 5.5);
    const stat = profile.verifiedStats?.scope === 'ufc-only' &&
      url(profile.verifiedStats.source) && date(profile.verifiedStats.observedOn) &&
      profile.verifiedStats.observedOn <= asOf && count(profile.verifiedStats.sampleBouts)
      ? power.careerData({ stats: profile.verifiedStats }) : null;
    const percentage = value => numeric(value) && value >= 0 && value <= 100 ? value : null;
    const proxy = stat && {
      slpm: stat.slpm, sapm: stat.sapm, diff: numeric(stat.slpm) && numeric(stat.sapm) ? (stat.slpm - stat.sapm) * 15 : null,
      kd: stat.kd15, td: stat.td15, sub: stat.sub15, acc: percentage(profile.verifiedStats.strAcc),
      tdDef: percentage(profile.verifiedStats.tdDef), tdAcc: percentage(profile.verifiedStats.tdAcc),
      strDef: percentage(profile.verifiedStats.strDef),
      control: numeric(stat.controlShare) ? stat.controlShare * 900 : null,
      oppControl: numeric(stat.controlAgainst) ? stat.controlAgainst * 900 : null,
      damage: stat.kdAgainst15, reversals: stat.rev15,
    };
    const recentScore = id => percentile(id, entry.metrics[id]?.value);
    const recentLower = id => recentScore(id) === null ? null : 135 - recentScore(id);
    const sourceInputs = (score, lower, career = false) => {
      const actual = type => fights.length >= 2 && entry.metrics[type] ? percentile(type,
        entry.metrics[type].value * 5 / entry.metrics[type].bouts) : null;
      const finish = type => {
        const rate = type === 'ko' ? stat?.koRate : stat?.subFinishRate;
        return career && numeric(rate) ? percentile(type, rate * 5) : actual(type);
      };
      const ko = finish('ko'), submission = finish('submission');
      const chance = (n, score) => numeric(n) && n > 0 ? score : null;
      return {
        striking: weighted([[score('acc'),20],[score('slpm'),20],[weighted([[score('kd'),1],[ko,1]],1,1),25],
          [score('diff'),20],[quality === null || score('diff') === null ? null : .8 * score('diff') + .2 * quality,15]], 50, 2),
        wrestling: weighted([[weighted([[score('td'),1],[score('tdAcc'),1]],1,1),30],
          [score('tdDef'),35],[score('control'),20],[score('reversals'),15]], 50, 2),
        grappling: weighted([[submission,30],[score('sub'),20],[score('control'),25],[lower('oppControl'),25]], 50, 2),
        defence: weighted([[score('strDef'),35],[score('tdDef'),25],
          [weighted([[lower('sapm'),1],[lower('damage'),1]],1,1),25],[lower('oppControl'),15]], 50, 2),
        effectiveness: weighted([[chance(entry.metrics.ko?.value ?? stat?.koRate, ko),1],
          [chance(entry.metrics.submission?.value ?? stat?.subFinishRate, submission),1]], 1, 1),
      };
    };
    const measured = sourceInputs(recentScore, recentLower);
    const fromProfile = id => percentile(id, proxy?.[id]);
    const audited = sourceInputs(fromProfile, id => fromProfile(id) === null ? null : 135 - fromProfile(id), true);
    const dominance = weighted([[recentScore('diff'), 60], [recentScore('net'), 40]], 40, 1);
    const form = recent === null ? null : weighted([[recent,40],[quality,30],[dominance,20],[recency,10]],50,2);
    const technical = {};
    for (const id of ['striking', 'wrestling', 'grappling', 'defence']) {
      const value = measured[id] ?? audited[id];
      technical[id] = { score: value === null ? null : Math.round(value),
        source: measured[id] !== null ? 'Cached UFC bout statistics' : audited[id] !== null ? stat?.source : null };
    }
    technical.form = { score: form === null ? null : Math.round(form), source: form === null ? null : 'Documented UFC results' };
    const offense = ['striking','wrestling','grappling'].map(id => technical[id].score).filter(numeric).sort((a,b) => b-a);
    const skills = weighted([[offense[0],50],[offense[1],15],[technical.defence.score,35]],65,2);
    const credential = Math.min(100, sum(Object.values(power.credentialBonuses(profile)), x => x.points) * 100 / 12);
    const champion = profile.category === 'Champion' && /^https:\/\/(www\.)?ufc\.com\//i.test(profile.review.championStatusSource || '');
    const titleWins = entry.history.filter(x => x.titleFight && x.outcome === 'W').length;
    const achievements = champion ? 100 : titleWins ? Math.min(95, 65 + titleWins * 10) : null;
    const finishes = measured.effectiveness ?? audited.effectiveness;
    const components = { performance, technical: skills, form, achievements, finishes, credentials: credential || null };
    const points = [[performance,30],[skills,25],[form,20],[achievements,10],[finishes,10],[credential || null,5]];
    const total = performance === null || skills === null || form === null ? null : weighted(points,75,3);
    const legacy = scout.classify(profile, power);
    const career = legacy.ufcBouts ? 55 + 45 * (legacy.ufcWins + 1) / (legacy.ufcBouts + 2) : null;
    const trajectory = recent === null ? null : weighted([[recent,30],[quality,25],[dominance,20],
      [career,15],[credential || null,10]], 45, 2);
    const proven = scored.filter(x => x.result === 100 && x.quality >= 76).length >= 2 || legacy.rankedWins > 0 ||
      (legacy.verifiedRank != null && scored.filter(x => x.result === 100).length >= 2 && qualified.length >= 2);
    const category = champion ? 'Champion' : !legacy.eligible || trajectory === null ? 'Unassessed'
      : !entry.active ? 'Roster' : trajectory >= 75 && proven ? 'Contender'
      : trajectory >= 60 && legacy.ufcBouts <= 9 && scored.slice(0,2).some(x => x.result === 100) ? 'Prospect' : 'Roster';
    fighters[key] = {
      power: total === null ? null : Math.round(total), components: Object.fromEntries(Object.entries(components)
        .map(([id, value]) => [id, value === null ? null : Math.round(value)])),
      powerCoverage: sum(points.filter(([value]) => numeric(value)), part => part[1]),
      technical, category, trajectory: champion || !legacy.eligible || trajectory === null ? null : Math.round(trajectory),
      officialRank: legacy.verifiedRank ?? null, rankingSource: legacy.verifiedRank ? profile.ranking.source : null,
      lastFightDate: entry.recent[0]?.date ?? null, recent: entry.recent.map(({ date, opponent, outcome, method, metrics }) =>
        ({ date, opponent, outcome, method, hasStats: !!metrics })),
      metrics: Object.fromEntries(boards.filter(board => entry.metrics[board.id]).map(board =>
        [board.id, { ...entry.metrics[board.id], rank: board.positions.get(key) ?? null }])),
      opponentEvidence: qualified.length,
    };
  }
  return { schema: 3, asOf, cutoff, population: population.length, fighters,
    boards: boards.map(({ positions, ...board }) => board) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = name => JSON.parse(fs.readFileSync(new URL('../data/' + name + '.json', import.meta.url)));
  const profiles = ['champion','ranked','contender','prospect','roster'].flatMap(cohort => {
    try { return Object.values(read('ufc-' + cohort + '-profiles').fighters); }
    catch (error) { if (error.code === 'ENOENT' && cohort === 'ranked') return []; throw error; }
  });
  const progress = read('ufcalendar-rich-progress');
  const asOf = process.argv[2] || new Date().toISOString().slice(0, 10);
  const data = buildV3({ progress, postfight: read('ufc-postfight-metrics'), research: read('ufcalendar-fighter-research'), profiles, asOf });
  const dest = new URL('../data/ufc-fighter-v3.json', import.meta.url);
  const next = JSON.stringify(data) + '\n';
  if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== next) fs.writeFileSync(dest, next);
  console.log('UFC Fighter V3', asOf, Object.keys(data.fighters).length, 'reviewed profiles,', data.population, 'active fighters');
}
