/* BEFN Sumo Insights: promotion runs, stables, rivalries, records. Worked out from the saved basho
   archive (data/sumo/basho-archive), the rank history, the roster and the head-to-head summary.
   Pure functions; tests run them on the saved data. Every figure is a count over those files, and
   each section states its rule. */
import { tierOf, isSanyaku, isMakuuchi, position, kinboshi, rows as detailRows, bashoName } from './sumo-home-data.mjs';

/* One basho as { bashoId, rows } with rows { rikishiID, shikonaEn, rank, wins, losses, absences, record }. */
export const fromArchive = f => ({ bashoId: f.bashoId, yusho: f.yusho || [], rows: Object.values(f.banzuke || {}).flatMap(b => b.rows || []) });
export function fromDetails(details) {
  const pick = bz => detailRows(bz).map(r => ({ rikishiID: r.rikishiID, shikonaEn: r.shikonaEn, rank: r.rank, wins: r.wins, losses: r.losses, absences: r.absences || 0, record: r.record || [] }));
  return [{ bashoId: details.previousBashoId, yusho: [], rows: pick(details.previousBanzuke) },
          { bashoId: details.bashoId, yusho: details.basho?.data?.yusho || [], rows: pick(details.banzuke) }];
}
const byId = b => new Map(b.rows.map(r => [r.rikishiID, r]));

/* Ozeki runs. The usual benchmark (not a written rule) is about 33 wins over three straight basho
   in sanyaku, the last at Sekiwake. For each current Sekiwake or Komusubi with the two latest basho
   in sanyaku and a winning record in the latest: wins so far and wins needed next basho to reach 33. Yokozuna watch: an Ozeki who won
   the latest title (two titles in a row as Ozeki is the usual path). basho = oldest first. */
export const OZEKI_BAR = 33;
export function runs(basho) {
  const last = basho[basho.length - 1], prev = basho[basho.length - 2];
  if (!last || !prev) return { ozeki: [], yokozuna: [] };
  const P = byId(prev);
  const ozeki = [];
  for (const r of last.rows) {
    const t = tierOf(r.rank);
    if (t !== 'Sekiwake' && t !== 'Komusubi') continue;
    const p = P.get(r.rikishiID);
    if (!p || !isSanyaku(p.rank) || ['Yokozuna', 'Ozeki'].includes(tierOf(p.rank))) continue;
    /* A losing record in the latest basho normally ends a run (and usually costs the Sekiwake rank). */
    if (r.wins < 8) continue;
    const so = p.wins + r.wins, needed = OZEKI_BAR - so;
    if (needed > 15) continue;
    ozeki.push({ id: r.rikishiID, name: r.shikonaEn, rank: r.rank, steps: [{ bashoId: prev.bashoId, rank: p.rank, wins: p.wins, losses: p.losses }, { bashoId: last.bashoId, rank: r.rank, wins: r.wins, losses: r.losses }], soFar: so, needed: Math.max(0, needed) });
  }
  ozeki.sort((a, b) => a.needed - b.needed || position(a.rank) - position(b.rank));
  const champ = last.yusho.find(y => y.type === 'Makuuchi');
  const L = byId(last);
  const yokozuna = champ && tierOf(L.get(champ.rikishiId)?.rank) === 'Ozeki'
    ? [{ id: champ.rikishiId, name: L.get(champ.rikishiId).shikonaEn, rank: L.get(champ.rikishiId).rank, wins: L.get(champ.rikishiId).wins, losses: L.get(champ.rikishiId).losses, bashoId: last.bashoId }] : [];
  return { ozeki, yokozuna, next: last.bashoId };
}

/* Stables: the latest basho, by the stable each wrestler belongs to now (roster). */
export function stables(latest, roster) {
  const heya = new Map((roster?.rikishi || []).map(w => [w.sourceId, w.heya]));
  const out = new Map();
  for (const r of latest.rows) {
    const h = heya.get(r.rikishiID);
    if (!h) continue;
    if (!out.has(h)) out.set(h, { heya: h, wrestlers: 0, sekitori: 0, wins: 0, losses: 0, absences: 0, winning: 0, top: null });
    const s = out.get(h);
    s.wrestlers++; s.wins += r.wins; s.losses += r.losses; s.absences += r.absences || 0;
    if (isMakuuchi(r.rank) || tierOf(r.rank) === 'Juryo') s.sekitori++;
    if (r.wins > (tierOf(r.rank) === 'Makushita' ? 3.5 : 7.5)) s.winning++;
    if (!s.top || position(r.rank) < position(s.top.rank)) s.top = { id: r.rikishiID, name: r.shikonaEn, rank: r.rank };
  }
  return [...out.values()].sort((a, b) => b.wins - a.wins || b.sekitori - a.sekitori || a.heya.localeCompare(b.heya));
}

/* Rivalries: all-time meetings (head-to-head summary) between two wrestlers who are both in Makuuchi now. */
export function rivalries(h2hSummary, roster, { limit = 8, min = 8 } = {}) {
  const now = new Map((roster?.rikishi || []).map(w => [w.sourceId, w]));
  const list = [];
  for (const p of Object.values(h2hSummary?.activePairs || {})) {
    const a = now.get(p.a), b = now.get(p.b);
    if (!a || !b || !isMakuuchi(a.currentRank) || !isMakuuchi(b.currentRank) || p.total < min) continue;
    const [lead, trail] = p.winsA >= p.winsB ? [[a, p.winsA], [b, p.winsB]] : [[b, p.winsB], [a, p.winsA]];
    list.push({ a: { id: lead[0].sourceId, name: lead[0].shikonaEn, rank: lead[0].currentRank, wins: lead[1] }, b: { id: trail[0].sourceId, name: trail[0].shikonaEn, rank: trail[0].currentRank, wins: trail[1] },
      total: p.total, latest: (p.latest || [])[0] || null, level: lead[1] === trail[1] });
  }
  /* Most meetings first; among equals, the closer rivalry. */
  return list.sort((x, y) => y.total - x.total || (x.a.wins - x.b.wins) - (y.a.wins - y.b.wins)).slice(0, limit);
}

/* Records across the saved archive (basho oldest first), and from the rank history. */
export function records(basho, careerHistory, roster) {
  const name = new Map();
  for (const b of basho) for (const r of b.rows) name.set(r.rikishiID, r.shikonaEn);
  const tally = (pick) => { const m = new Map(); for (const b of basho) for (const id of pick(b)) m.set(id, (m.get(id) || 0) + 1); return [...m].map(([id, n]) => ({ id, name: name.get(id), n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)); };
  const titles = tally(b => b.yusho.filter(y => y.type === 'Makuuchi').map(y => y.rikishiId));
  const stars = tally(b => kinboshi({ banzuke: { all: { data: { east: b.rows, west: [] } } } }).map(k => k.id));
  /* Longest run of straight wins inside one basho, Makuuchi, fought bouts only (a fusen win or an absence ends the count). */
  let streaks = [];
  for (const b of basho) for (const r of b.rows) {
    if (!isMakuuchi(r.rank)) continue;
    let run = 0, best = 0;
    for (const x of r.record || []) { if (x && x.result === 'win') { run++; best = Math.max(best, run); } else run = 0; }
    if (best >= 10) streaks.push({ id: r.rikishiID, name: r.shikonaEn, n: best, bashoId: b.bashoId });
  }
  streaks.sort((a, b) => b.n - a.n || b.bashoId.localeCompare(a.bashoId));
  /* From the rank history: tournaments from first rank to first Makuuchi, for wrestlers in Makuuchi now. */
  const people = new Map((roster?.rikishi || []).map(w => [String(w.sourceId), w]));
  const fastest = [], comebacks = [];
  for (const [id, h] of Object.entries(careerHistory?.bySourceId || {})) {
    const w = people.get(id);
    if (!w || !isMakuuchi(w.currentRank)) continue;
    const ranks = (h.rank || []).slice().sort((a, b) => a.basho.localeCompare(b.basho));
    if (!ranks.length) continue;
    const first = ranks.findIndex(x => isMakuuchi(x.rank));
    /* Tournaments from debut to first Makuuchi. The debut basho has no rank yet, so the history may
       start one basho later; a later start means the early ranks are missing and the count is skipped. */
    const idx = b => Number(String(b).slice(0, 4)) * 6 + (Number(String(b).slice(4, 6)) - 1) / 2;
    const debut = String(w.debutBasho || '').slice(0, 6);
    if (first > 0 && /^\d{6}$/.test(debut) && idx(ranks[0].basho) - idx(debut) <= 1)
      fastest.push({ id: Number(id), name: w.shikonaEn, n: idx(ranks[first].basho) - idx(debut), from: debut, to: ranks[first].basho });
    /* Comeback: longest spell out of Makuuchi after first reaching it, ended by a return. */
    let out = 0, longest = 0, from = null, back = null;
    for (let i = first + 1; first >= 0 && i < ranks.length; i++) {
      if (!isMakuuchi(ranks[i].rank)) { if (!out) from = ranks[i].basho; out++; }
      else { if (out > longest) { longest = out; back = ranks[i].basho; } out = 0; }
    }
    if (longest >= 4) comebacks.push({ id: Number(id), name: w.shikonaEn, n: longest, back });
  }
  fastest.sort((a, b) => a.n - b.n || a.to.localeCompare(b.to));
  comebacks.sort((a, b) => b.n - a.n);
  const sekitori = (roster?.rikishi || []).filter(w => isMakuuchi(w.currentRank) || tierOf(w.currentRank) === 'Juryo');
  const youngest = sekitori.slice().sort((a, b) => String(b.birthDate).localeCompare(String(a.birthDate))).slice(0, 3)
    .map(w => ({ id: w.sourceId, name: w.shikonaEn, born: String(w.birthDate).slice(0, 10), rank: w.currentRank }));
  const span = basho.length ? bashoName(basho[0].bashoId) + ' to ' + bashoName(basho[basho.length - 1].bashoId) : '';
  return { span, titles: titles.slice(0, 5), stars: stars.slice(0, 5), streaks: streaks.slice(0, 5), fastest: fastest.slice(0, 5), comebacks: comebacks.slice(0, 5), youngest };
}
