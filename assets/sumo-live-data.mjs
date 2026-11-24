/* BEFN Sumo live basho mode: the day, the title race, the upset of the day and a daily recap,
   worked out from a basho snapshot's bout-by-bout records (the live preview-details.json during a
   basho, or an archive file shaped like it). Pure functions; tests replay a finished basho day by day.
   Rules: a win is "win" or "fusen win"; a loss is "loss", "fusen loss" or "absent" (absences count
   against a wrestler in the race). Only Makuuchi is used for the race, upsets and kinboshi. */
import { rows, tierOf, isMakuuchi, position, shortRank, bashoName } from './sumo-home-data.mjs';

const WIN = new Set(['win', 'fusen win']);
const LOSS = new Set(['loss', 'fusen loss', 'absent']);
const makuuchi = details => rows(details?.banzuke).filter(r => isMakuuchi(r.rank));

/* Last day with a decided Makuuchi bout. */
export function completedDay(details) {
  let day = 0;
  for (const r of makuuchi(details)) (r.record || []).forEach((b, i) => { if (b && (b.result === 'win' || b.result === 'loss')) day = Math.max(day, i + 1); });
  return day;
}

export function through(r, day) {
  let w = 0, l = 0;
  for (const b of (r.record || []).slice(0, day)) { if (!b) continue; if (WIN.has(b.result)) w++; else if (LOSS.has(b.result)) l++; }
  return { w, l };
}

/* Title race after `day`: leaders on the fewest losses, then one and two behind. For each contender,
   the other contenders he has not yet faced this basho (still possible meetings). */
export function titleRace(details, day, { maxChasers = 8 } = {}) {
  if (!day) return null;
  const list = makuuchi(details).map(r => ({ id: r.rikishiID, name: r.shikonaEn, rank: r.rank, ...through(r, day),
    met: new Set((r.record || []).slice(0, day).filter(Boolean).map(b => b.opponentID)) }));
  const best = Math.min(...list.map(x => x.l));
  const pick = n => list.filter(x => x.l === best + n).sort((a, b) => b.w - a.w || position(a.rank) - position(b.rank));
  const leaders = pick(0), one = pick(1), two = pick(2).slice(0, maxChasers);
  const contenders = [...leaders, ...one, ...two];
  /* "Still to face" only once the race is narrow (day 9 on, at most 8 men within one loss). */
  const narrow = day >= 9 && leaders.length + one.length <= 8;
  const view = x => ({ id: x.id, name: x.name, rank: x.rank, w: x.w, l: x.l,
    notMet: narrow ? contenders.filter(o => o.id !== x.id && !x.met.has(o.id) && o.l <= best + 1).map(o => ({ id: o.id, name: o.name })) : [] });
  return { day, daysLeft: 15 - day, leaders: leaders.map(view), one: one.map(view), two: two.map(view), lead: { w: leaders[0]?.w, l: best } };
}

/* Bouts of one day in Makuuchi, each counted once from the winner's record. */
function dayBouts(details, day) {
  const all = makuuchi(details), byId = new Map(all.map(r => [r.rikishiID, r]));
  const out = [];
  for (const r of all) {
    const b = (r.record || [])[day - 1];
    if (!b || b.result !== 'win') continue;
    const o = byId.get(b.opponentID);
    if (o) out.push({ winner: r, loser: o, kimarite: b.kimarite || '' });
  }
  return out;
}

/* Upset of the day: the lower-ranked winner with the largest rank gap. Kinboshi: a Maegashira beating a Yokozuna. */
export function dayHighlights(details, day) {
  if (!day) return null;
  const bouts = dayBouts(details, day);
  const view = x => ({ id: x.rikishiID, name: x.shikonaEn, rank: x.rank });
  const ups = bouts.map(b => ({ ...b, gap: position(b.winner.rank) - position(b.loser.rank) })).filter(b => b.gap > 0).sort((a, b) => b.gap - a.gap);
  const upset = ups[0] ? { winner: view(ups[0].winner), loser: view(ups[0].loser), kimarite: ups[0].kimarite, gap: ups[0].gap } : null;
  const kinboshi = bouts.filter(b => tierOf(b.winner.rank) === 'Maegashira' && tierOf(b.loser.rank) === 'Yokozuna').map(b => ({ winner: view(b.winner), loser: view(b.loser), kimarite: b.kimarite }));
  return { day, upset, kinboshi, bouts: bouts.length };
}

/* Daily recap: one short text a reader can copy or share, plus the parts it is made of. */
export function recap(details, day) {
  const race = titleRace(details, day), hi = dayHighlights(details, day);
  if (!race || !hi) return null;
  const name = bashoName(details.bashoId);
  const names = a => a.length <= 2 ? a.map(x => x.name).join(' and ') : a.slice(0, 2).map(x => x.name).join(', ') + ' and ' + (a.length - 2) + ' more';
  const lead = race.leaders.length === 1 ? race.leaders[0].name + ' leads at ' + race.leaders[0].w + '–' + race.leaders[0].l
    : names(race.leaders) + ' share the lead at ' + race.leaders[0].w + '–' + race.leaders[0].l;
  const playoff = day === 15 && race.leaders.length > 1;
  /* Once the title is known (a finished basho), name the playoff winner if he was one of the tied leaders. */
  const champ = (details.basho?.data?.yusho || []).find(y => y.type === 'Makuuchi');
  const winner = playoff && champ ? race.leaders.find(x => x.id === champ.rikishiId) : null;
  const parts = [playoff ? name + ', day 15: ' + names(race.leaders) + ' finished level at ' + race.leaders[0].w + '–' + race.leaders[0].l + (winner ? '; ' + winner.name + ' won the playoff for the title.' : '; a playoff decides the title.')
    : name + ', day ' + day + ': ' + lead + (race.one.length ? ', with ' + race.one.length + ' one behind' : '') + '.'];
  if (hi.upset) parts.push('Upset of the day: ' + hi.upset.winner.name + ' (' + shortRank(hi.upset.winner.rank) + ') beat ' + hi.upset.loser.name + ' (' + shortRank(hi.upset.loser.rank) + ')' + (hi.upset.kimarite ? ' by ' + hi.upset.kimarite : '') + '.');
  for (const k of hi.kinboshi) parts.push('Kinboshi: ' + k.winner.name + ' beat Yokozuna ' + k.loser.name + '.');
  return { day, race, highlights: hi, playoff, text: parts.join(' ') };
}

/* A finished basho snapshot cut back to `day` (for tests, and to preview live mode outside a basho). */
export function asOfDay(details, day) {
  const cut = bz => Object.fromEntries(Object.entries(bz || {}).map(([k, v]) => {
    const data = v && 'data' in v ? v.data : v;
    const side = s => (data?.[s] || []).map(r => { const rec = (r.record || []).map((b, i) => i < day ? b : null); const t = through({ record: rec }, day); return { ...r, record: rec, wins: t.w, losses: t.l }; });
    return [k, { ...(v && 'data' in v ? v : {}), data: { ...data, east: side('east'), west: side('west') } }];
  }));
  return { ...details, banzuke: cut(details.banzuke), basho: { ...details.basho, data: { ...details.basho?.data, yusho: [], specialPrizes: [], endDate: '2999-01-01T00:00:00Z' } } };
}
