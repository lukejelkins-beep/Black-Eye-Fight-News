/* BEFN Sumo home (Overview): storylines worked out from the saved tournament snapshot
   (data/sumo/preview-details.json), the rank history (career-history.json) and the roster.
   Pure functions, no DOM, so tests can run them on the saved data. Every line a reader sees
   is a count or comparison of those files; nothing is inferred beyond the rule stated with it. */

export const TIERS = ['Yokozuna', 'Ozeki', 'Sekiwake', 'Komusubi', 'Maegashira', 'Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const SANYAKU = new Set(['Yokozuna', 'Ozeki', 'Sekiwake', 'Komusubi']);
const MAKUUCHI = new Set([...SANYAKU, 'Maegashira']);
/* Approximate rows per division, used only to order ranks across divisions. */
const ROWS = { Maegashira: 18, Juryo: 14, Makushita: 60, Sandanme: 100, Jonidan: 110, Jonokuchi: 30 };
const MONTH = { '01': 'January', '03': 'March', '05': 'May', '07': 'July', '09': 'September', '11': 'November' };
const VENUE = { '01': 'Tokyo', '03': 'Osaka', '05': 'Tokyo', '07': 'Nagoya', '09': 'Tokyo', '11': 'Fukuoka' };

export function parseRank(rank) {
  const m = /^(\w+) (\d+) (East|West)$/.exec(String(rank || '').trim());
  if (!m || !TIERS.includes(m[1])) return null;
  return { tier: m[1], number: Number(m[2]), side: m[3] };
}
export const tierOf = rank => parseRank(rank)?.tier || null;
export const isSanyaku = rank => SANYAKU.has(tierOf(rank));
export const isMakuuchi = rank => MAKUUCHI.has(tierOf(rank));

/* Position down the whole banzuke (0 = Yokozuna 1 East). Only for ordering and climb sizes. */
export function position(rank) {
  const r = parseRank(rank);
  if (!r) return null;
  let base = 0;
  for (const t of TIERS) {
    if (t === r.tier) break;
    base += SANYAKU.has(t) ? 4 : ROWS[t] * 2;
  }
  return base + (r.number - 1) * 2 + (r.side === 'West' ? 1 : 0);
}
/* "Maegashira 3 West" -> "M3W", for tight rows. */
export function shortRank(rank) {
  const r = parseRank(rank);
  if (!r) return String(rank || '');
  const p = { Yokozuna: 'Y', Ozeki: 'O', Sekiwake: 'S', Komusubi: 'K', Maegashira: 'M', Juryo: 'J', Makushita: 'Ms', Sandanme: 'Sd', Jonidan: 'Jd', Jonokuchi: 'Jk' }[r.tier];
  return p + r.number + r.side[0];
}
/* "Maegashira 3 West" -> "Maegashira 3"; sanyaku ranks lose the number when it is 1. */
export function plainRank(rank) {
  const r = parseRank(rank);
  if (!r) return String(rank || '');
  return SANYAKU.has(r.tier) && r.number === 1 ? r.tier : r.tier + ' ' + r.number;
}
export const bashoName = id => (MONTH[String(id).slice(4)] || '') + ' ' + String(id).slice(0, 4);
export function nextBasho(id) {
  let y = Number(String(id).slice(0, 4)), m = Number(String(id).slice(4)) + 2;
  if (m > 11) { m = 1; y += 1; }
  const n = String(y) + String(m).padStart(2, '0');
  return { id: n, month: MONTH[n.slice(4)], venue: VENUE[n.slice(4)] };
}
export const venueOf = id => VENUE[String(id).slice(4)] || '';

/* All banzuke rows of a snapshot, best rank first. */
export function rows(banzuke) {
  const out = [];
  for (const [division, v] of Object.entries(banzuke || {})) {
    const data = v && 'data' in v ? v.data : v;
    for (const side of ['east', 'west']) for (const r of data?.[side] || []) out.push({ ...r, division });
  }
  return out.sort((a, b) => (position(a.rank) ?? 1e9) - (position(b.rank) ?? 1e9));
}
const isWin = b => b && /win/.test(b.result || '') && !/fusen/.test(b.result || '');
const bouts = r => (r.record || []).filter(b => b && b.result && b.result !== 'absent');

/* Finished when the snapshot's end date has passed (Japan time). */
export function bashoFinished(details, now = new Date()) {
  const end = details?.basho?.data?.endDate;
  return !!end && new Date(end).getTime() + 15 * 3600e3 < now.getTime();
}

export function headline(details) {
  const data = details?.basho?.data || {};
  const champ = (data.yusho || []).find(y => y.type === 'Makuuchi');
  const all = rows(details?.banzuke);
  const row = champ && all.find(r => r.rikishiID === champ.rikishiId);
  const losses = row ? (row.record || []).map((b, i) => ({ b, day: i + 1 })).filter(x => x.b && /loss/.test(x.b.result || ''))
    .map(x => ({ day: x.day, opponent: x.b.opponentShikonaEn, opponentId: x.b.opponentID })) : [];
  return {
    bashoId: details?.bashoId, name: bashoName(details?.bashoId), venue: venueOf(details?.bashoId),
    champion: champ ? { id: champ.rikishiId, name: row?.shikonaEn || champ.shikonaEn, rank: row?.rank || '', wins: row?.wins ?? null, losses: row?.losses ?? null, lostTo: losses } : null,
    next: nextBasho(details?.bashoId)
  };
}

export function champions(details) {
  const d = details?.basho?.data || {};
  const names = new Map(rows(details?.banzuke).map(r => [r.rikishiID, r.shikonaEn]));
  const nm = (id, fallback) => names.get(id) || fallback;
  const prizeName = { 'Shukun-sho': 'Outstanding Performance Prize', 'Kanto-sho': 'Fighting Spirit Prize', 'Gino-sho': 'Technique Prize' };
  return [
    ...(d.yusho || []).filter(y => y.type === 'Juryo' || y.type === 'Makushita').map(y => ({ id: y.rikishiId, name: nm(y.rikishiId, y.shikonaEn), label: y.type + ' champion' })),
    ...(d.specialPrizes || []).map(p => ({ id: p.rikishiId, name: nm(p.rikishiId, p.shikonaEn), label: prizeName[p.type] || p.type }))
  ];
}

/* Kinboshi: a Maegashira beats a Yokozuna in a fought bout (a fusen win does not count). */
export function kinboshi(details) {
  const all = rows(details?.banzuke);
  const yokozuna = new Map(all.filter(r => tierOf(r.rank) === 'Yokozuna').map(r => [r.rikishiID, r]));
  const out = [];
  for (const r of all) {
    if (tierOf(r.rank) !== 'Maegashira') continue;
    (r.record || []).forEach((b, i) => {
      if (isWin(b) && yokozuna.has(b.opponentID)) out.push({ id: r.rikishiID, name: r.shikonaEn, rank: r.rank, day: i + 1, kimarite: b.kimarite || '', yokozunaId: b.opponentID, yokozuna: yokozuna.get(b.opponentID).shikonaEn });
    });
  }
  return out.sort((a, b) => a.day - b.day);
}

/* Sanyaku scorecard. An Ozeki with a losing record becomes kadoban (must win 8 next time);
   an Ozeki who was already kadoban and loses again drops to Sekiwake. */
export function sanyaku(details) {
  const prev = new Map(rows(details?.previousBanzuke).map(r => [r.rikishiID, r]));
  return rows(details?.banzuke).filter(r => isSanyaku(r.rank)).map(r => {
    const decided = r.wins + r.losses + (r.absences || 0);
    const losing = r.wins < 8 && decided >= 15;
    let flag = null;
    if (tierOf(r.rank) === 'Ozeki' && losing) {
      const p = prev.get(r.rikishiID);
      const wasKadoban = p && tierOf(p.rank) === 'Ozeki' && p.wins < 8;
      flag = wasKadoban ? 'demoted' : 'kadoban';
    }
    return { id: r.rikishiID, name: r.shikonaEn, rank: r.rank, tier: tierOf(r.rank), wins: r.wins, losses: r.losses, absences: r.absences || 0, winning: r.wins >= 8, flag };
  });
}

/* Biggest changes between the previous and the current banzuke, with what each one means. */
export function movers(details, careerHistory, { limit = 4 } = {}) {
  const prev = new Map(rows(details?.previousBanzuke).map(r => [r.rikishiID, r]));
  const history = careerHistory?.bySourceId || {};
  const list = [];
  for (const r of rows(details?.banzuke)) {
    const p = prev.get(r.rikishiID);
    if (!p) continue;
    const from = position(p.rank), to = position(r.rank);
    if (from == null || to == null || from === to) continue;
    /* Debut or return is only claimed when the wrestler's rank history is saved. */
    const known = !!history[String(r.rikishiID)];
    const before = (history[String(r.rikishiID)]?.rank || []).filter(x => x.basho < details.bashoId);
    let note;
    if (isSanyaku(r.rank) && !isSanyaku(p.rank)) note = !known ? 'Into sanyaku' : before.some(x => isSanyaku(x.rank)) ? 'Back in sanyaku' : 'Sanyaku debut';
    else if (isSanyaku(p.rank) && !isSanyaku(r.rank)) note = 'Out of sanyaku';
    else if (isMakuuchi(r.rank) && !isMakuuchi(p.rank)) note = !known ? 'Into Makuuchi' : before.some(x => isMakuuchi(x.rank)) ? 'Back in Makuuchi' : 'Makuuchi debut';
    else if (isMakuuchi(p.rank) && !isMakuuchi(r.rank)) note = 'Out of Makuuchi';
    else if (tierOf(r.rank) === 'Juryo' && tierOf(p.rank) === 'Makushita') note = 'Into Juryo';
    else if (tierOf(p.rank) === 'Juryo' && tierOf(r.rank) === 'Makushita') note = 'Out of Juryo';
    else if (tierOf(p.rank) === tierOf(r.rank) && !isSanyaku(r.rank)) note = (from > to ? 'Up ' : 'Down ') + Math.abs(parseRank(p.rank).number - parseRank(r.rank).number) + ' in ' + tierOf(r.rank);
    else note = from > to ? 'Up a division' : 'Down a division';
    list.push({ id: r.rikishiID, name: r.shikonaEn, from: p.rank, to: r.rank, change: from - to, note, top: Math.min(from, to) });
  }
  /* Moves across a line people watch come first: into or out of sanyaku, then Makuuchi, then
     Juryo; then by size. */
  const weight = m => (/sanyaku/i.test(m.note) ? 3000 : /Makuuchi/.test(m.note) ? 2000 : /Juryo/.test(m.note) ? 1000 : 0) + Math.abs(m.change);
  const up = list.filter(m => m.change > 0).sort((a, b) => weight(b) - weight(a)).slice(0, limit);
  const down = list.filter(m => m.change < 0).sort((a, b) => weight(b) - weight(a)).slice(0, limit);
  return { up, down, from: details?.previousBashoId, to: details?.bashoId };
}

/* Rising stars: the biggest climbs over the last `span` tournaments, among wrestlers now in Juryo
   or above (or Makushita 1-10), from the saved rank history. */
export function risingStars(careerHistory, roster, currentId, { span = 6, limit = 4 } = {}) {
  const ids = [];
  let y = Number(String(currentId).slice(0, 4)), m = Number(String(currentId).slice(4));
  for (let i = 0; i < span; i++) { m -= 2; if (m < 1) { m = 11; y -= 1; } }
  const startId = String(y) + String(m).padStart(2, '0');
  const people = new Map((roster?.rikishi || []).map(w => [w.sourceId, w]));
  const sekitori = (roster?.rikishi || []).filter(w => isMakuuchi(w.currentRank) || tierOf(w.currentRank) === 'Juryo');
  const youngest = sekitori.slice().sort((a, b) => String(b.birthDate).localeCompare(String(a.birthDate)))[0]?.sourceId;
  const out = [];
  for (const [id, h] of Object.entries(careerHistory?.bySourceId || {})) {
    const ranks = (h.rank || []).slice().sort((a, b) => a.basho.localeCompare(b.basho));
    const start = ranks.find(x => x.basho === startId) || ranks.find(x => x.basho > startId && x.basho <= currentId);
    const now = ranks.find(x => x.basho === currentId);
    if (!start || !now || start.basho === now.basho) continue;
    const t = tierOf(now.rank), r = parseRank(now.rank);
    if (!(isMakuuchi(now.rank) || t === 'Juryo' || (t === 'Makushita' && r.number <= 10))) continue;
    const climb = position(start.rank) - position(now.rank);
    if (!(climb > 0)) continue;
    const w = people.get(Number(id));
    const tournaments = ranks.filter(x => x.basho >= start.basho && x.basho <= currentId).length - 1;
    out.push({ id: Number(id), name: h.name || w?.shikonaEn, from: start.rank, fromBasho: start.basho, to: now.rank, climb, tournaments,
      youngestSekitori: Number(id) === youngest, born: w?.birthDate?.slice(0, 4) || null });
  }
  return out.sort((a, b) => b.climb - a.climb).slice(0, limit);
}

/* Watch list for the next banzuke, read from the records (the JSA decides). */
export function watchList(details) {
  const all = rows(details?.banzuke);
  const yusho = details?.basho?.data?.yusho || [];
  const champ = type => yusho.find(y => y.type === type)?.rikishiId;
  const num = r => parseRank(r.rank)?.number ?? 99;
  const pushing = all.filter(r => tierOf(r.rank) === 'Juryo' && ((num(r) <= 5 && r.wins >= 10) || r.rikishiID === champ('Juryo')))
    .sort((a, b) => b.wins - a.wins || num(a) - num(b)).slice(0, 4);
  const atRisk = all.filter(r => tierOf(r.rank) === 'Maegashira' && num(r) >= 12 && r.wins < 8)
    .sort((a, b) => (a.wins - 8 + (num(a) - 17) / 10) - (b.wins - 8 + (num(b) - 17) / 10)).slice(0, 4);
  const knocking = all.filter(r => tierOf(r.rank) === 'Makushita' && ((num(r) <= 5 && r.wins >= 4) || r.rikishiID === champ('Makushita')))
    .sort((a, b) => b.wins - a.wins || num(a) - num(b)).slice(0, 4);
  const view = r => ({ id: r.rikishiID, name: r.shikonaEn, rank: r.rank, record: r.wins + '–' + r.losses + (r.absences ? '–' + r.absences : ''),
    champion: r.rikishiID === champ('Juryo') || r.rikishiID === champ('Makushita') });
  return { pushing: pushing.map(view), atRisk: atRisk.map(view), knocking: knocking.map(view), next: nextBasho(details?.bashoId) };
}

/* Fact of the basho. First choice: a verified family pair (fun-facts-editorial.json) where both
   took a title or prize this basho. Then: a division champion who had been in the division above
   at the previous basho. Returns null when nothing qualifies (the page then links to Stories). */
export function factOfTheBasho(details, editorial) {
  const honours = new Map(champions(details).map(c => [c.id, c.label]));
  const top = (details?.basho?.data?.yusho || []).find(y => y.type === 'Makuuchi');
  if (top) honours.set(top.rikishiId, 'Makuuchi champion');
  const names = new Map(rows(details?.banzuke).map(r => [r.rikishiID, r.shikonaEn]));
  for (const item of editorial?.items || []) {
    const ids = (item.memberIds || []).map(Number);
    if (item.kind === 'family' && ids.length === 2 && ids.every(id => honours.has(id))) {
      return { kind: 'family', title: 'A family double', ids,
        text: item.short.split('. ')[0] + '. This basho ' + ids.map(id => names.get(id) + ' took the ' + honours.get(id).replace(/^(\w+) champion$/, '$1 title')).join(' and ') + '.',
        source: item.sourceLabel, sourceUrl: item.sourceUrl };
    }
  }
  const prev = new Map(rows(details?.previousBanzuke).map(r => [r.rikishiID, r]));
  for (const y of details?.basho?.data?.yusho || []) {
    const p = prev.get(y.rikishiId);
    if (y.type === 'Juryo' && p && isMakuuchi(p.rank)) return { kind: 'bounce', title: 'Straight back up?', ids: [y.rikishiId],
      text: y.shikonaEn + ' won the Juryo title one basho after dropping out of Makuuchi (' + plainRank(p.rank) + ' in ' + bashoName(details.previousBashoId) + ').' };
    if (y.type === 'Makushita' && p && tierOf(p.rank) === 'Juryo') return { kind: 'bounce', title: 'Straight back up?', ids: [y.rikishiId],
      text: y.shikonaEn + ' won the Makushita title one basho after dropping out of Juryo.' };
  }
  return null;
}

export function buildHome({ details, careerHistory, roster, editorial, now = new Date() }) {
  return {
    finished: bashoFinished(details, now),
    headline: headline(details),
    champions: champions(details),
    kinboshi: kinboshi(details),
    sanyaku: sanyaku(details),
    movers: movers(details, careerHistory),
    rising: risingStars(careerHistory, roster, details?.bashoId),
    watch: watchList(details),
    fact: factOfTheBasho(details, editorial)
  };
}
