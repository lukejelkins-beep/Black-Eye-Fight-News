/* BEFN Basho review: storylines for one saved tournament (data/sumo/basho-archive/YYYYMM.json).
   Reuses the Sumo home rules (sumo-home-data.mjs) by shaping an archive file like the live snapshot,
   and adds review-only lists. Pure functions; tests run them on the saved archive. */
import { rows, position, tierOf, isMakuuchi, kinboshi, sanyaku, champions, movers, headline, watchList, plainRank } from './sumo-home-data.mjs';

const asBanzuke = file => Object.fromEntries(Object.entries(file?.banzuke || {}).map(([div, b]) => [div, { data: { east: b.rows || [], west: [] } }]));

/* Shape an archive file (and the tournament before it, if saved) like preview-details.json. */
export function asDetails(file, previous) {
  return {
    bashoId: file.bashoId,
    previousBashoId: previous?.bashoId || null,
    basho: { data: { yusho: file.yusho || [], specialPrizes: file.specialPrizes || [], startDate: file.startDate, endDate: file.endDate } },
    banzuke: asBanzuke(file),
    previousBanzuke: previous ? asBanzuke(previous) : {}
  };
}

const fought = r => (r.record || []).filter(b => b && /^(win|loss)$/.test(b.result || ''));

/* Best and worst full records in Makuuchi. Wrestlers who missed bouts are listed separately. */
export function records(details, { limit = 5 } = {}) {
  const maku = rows(details.banzuke).filter(r => isMakuuchi(r.rank));
  const full = maku.filter(r => !(r.absences > 0));
  const best = full.slice().sort((a, b) => b.wins - a.wins || position(a.rank) - position(b.rank)).slice(0, limit);
  const worst = full.slice().sort((a, b) => a.wins - b.wins || position(a.rank) - position(b.rank)).slice(0, limit);
  const absent = maku.filter(r => r.absences > 0).sort((a, b) => b.absences - a.absences || position(a.rank) - position(b.rank));
  const view = r => ({ id: r.rikishiID, name: r.shikonaEn, rank: r.rank, wins: r.wins, losses: r.losses, absences: r.absences || 0 });
  return { best: best.map(view), worst: worst.map(view), absent: absent.map(view) };
}

/* Upsets: Makuuchi bouts won by the lower-ranked wrestler, largest rank gap first.
   Each bout is counted once, from the winner's record. */
export function upsets(details, { limit = 5 } = {}) {
  const all = rows(details.banzuke);
  const byId = new Map(all.map(r => [r.rikishiID, r]));
  const out = [];
  for (const r of all) {
    if (!isMakuuchi(r.rank)) continue;
    (r.record || []).forEach((b, i) => {
      if (!b || b.result !== 'win') return;
      const o = byId.get(b.opponentID);
      if (!o || !isMakuuchi(o.rank)) return;
      const gap = position(r.rank) - position(o.rank);
      if (gap > 0) out.push({ day: i + 1, winner: { id: r.rikishiID, name: r.shikonaEn, rank: r.rank }, loser: { id: o.rikishiID, name: o.shikonaEn, rank: o.rank }, kimarite: b.kimarite || '', gap });
    });
  }
  return out.sort((a, b) => b.gap - a.gap || a.day - b.day).slice(0, limit);
}

/* Winning techniques across all fought bouts in the three tracked divisions (fusen excluded),
   counted once per bout from the winner's record. */
export function techniques(details, { top = 5 } = {}) {
  const counts = new Map();
  let total = 0;
  for (const r of rows(details.banzuke)) {
    for (const b of r.record || []) {
      if (!b || b.result !== 'win' || !b.kimarite || b.kimarite === 'fusen') continue;
      counts.set(b.kimarite, (counts.get(b.kimarite) || 0) + 1);
      total++;
    }
  }
  const list = [...counts].map(([k, n]) => ({ kimarite: k, count: n, share: total ? n / total : 0 })).sort((a, b) => b.count - a.count || a.kimarite.localeCompare(b.kimarite));
  return { total, kinds: list.length, top: list.slice(0, top), once: list.filter(x => x.count === 1).map(x => x.kimarite).sort() };
}

/* Everything the review page shows for one tournament. */
export function buildReview(file, previous, careerHistory) {
  const details = asDetails(file, previous);
  return {
    bashoId: file.bashoId,
    headline: headline(details),
    champions: champions(details),
    kinboshi: kinboshi(details),
    /* Without the tournament before, kadoban and demotion cannot be told apart, so no flag is shown. */
    sanyaku: previous ? sanyaku(details) : sanyaku(details).map(r => ({ ...r, flag: null })),
    kadobanKnown: !!previous,
    movers: previous ? movers(details, careerHistory) : null,
    records: records(details),
    upsets: upsets(details),
    techniques: techniques(details),
    watch: watchList(details),
    notes: file.notes || [],
    source: { urls: file.sourceUrls || [], collectedAt: file.collectedAt }
  };
}
export { plainRank, tierOf };
