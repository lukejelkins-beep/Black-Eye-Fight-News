/* BEFN Sumo storylines: short stories about the latest finished basho, worked out from its saved
   archive file (data/sumo/basho-archive/YYYYMM.json) and the predictor (data/sumo/predictor.json).
   Pure functions; each card is a count or comparison of those files, worded to match it.
   Cards use the Stories page's editorial shape: { tag, metric, headline, description, memberIds, link }. */
import { isMakuuchi, position, plainRank, bashoName } from './sumo-home-data.mjs';
import { asDetails } from './sumo-review-data.mjs';
import { analysis } from './sumo-analysis-data.mjs';
import { strength, ratingsMap } from './sumo-predict.mjs';

const one = n => n.toFixed(1);
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

/* Longest run of fought wins in a row in Makuuchi this basho (fusen and absences break nothing and add nothing). */
function streaks(file) {
  const out = [];
  for (const r of file?.banzuke?.Makuuchi?.rows || []) {
    let run = 0, best = 0, from = 0, bestFrom = 0;
    (r.record || []).forEach((b, i) => {
      if (b?.result === 'win') { if (!run) from = i + 1; run++; if (run > best) { best = run; bestFrom = from; } }
      else if (b?.result === 'loss') run = 0;
    });
    if (best) out.push({ id: r.rikishiID, name: r.shikonaEn, rank: r.rank, n: best, from: bestFrom, to: bestFrom + best - 1 });
  }
  return out.sort((a, b) => b.n - a.n || position(a.rank) - position(b.rank));
}

export function storylines(file, model, roster) {
  if (!file || !model) return [];
  const id = file.bashoId, name = bashoName(id), link = 'sumo.html#review/' + id;
  const A = analysis(asDetails(file), model, { day: 15 });
  const cards = [], used = new Set();
  const take = list => list.find(x => !used.has(Number(x.id ?? x.w?.sourceId)));
  const o = A.over[0];
  if (o) used.add(o.id);
  if (o) cards.push({ tag: 'Beat the odds', metric: '+' + one(o.delta), headline: o.name + ' won ' + plural(o.wins, 'bout') + ' from ' + plainRank(o.rank),
    description: 'In the ' + name + ' basho the predictor expected ' + one(o.expected) + ' wins from his ' + o.bouts + ' bouts. No one in Makuuchi beat it by more.', memberIds: [o.id], link });
  const s = A.bashoShock;
  if (s) cards.push({ tag: 'Biggest shock', metric: Math.round(s.p * 100) + '%', headline: s.winner.name + ' beat ' + s.loser.name + ' on day ' + s.day,
    description: plainRank(s.winner.rank) + ' ' + s.winner.name + ' was given a ' + Math.round(s.p * 100) + '% chance that morning against ' + plainRank(s.loser.rank) + ' ' + s.loser.name + (s.kimarite ? ', and won by ' + s.kimarite : '') + '. The longest odds overcome in Makuuchi that basho.', memberIds: [s.winner.id, s.loser.id], link });
  const u = A.under[0];
  if (u) cards.push({ tag: 'Fell short', metric: '−' + one(Math.abs(u.delta)), headline: u.name + ' won ' + plural(u.wins, 'bout') + ' from ' + plainRank(u.rank),
    description: 'Fought all his bouts; the predictor expected ' + one(u.expected) + ' wins. The biggest shortfall in Makuuchi among men who did not miss a day.', memberIds: [u.id], link });
  /* The streak card names the longest run, whoever holds it (it may repeat a name above). */
  const st = streaks(file)[0];
  if (st) used.add(st.id);
  if (st && st.n >= 6) cards.push({ tag: 'Hot streak', metric: String(st.n), headline: st.name + ' won ' + st.n + ' bouts in a row',
    description: 'Days ' + st.from + ' to ' + st.to + ' of the ' + name + ' basho, the longest run of fought wins in Makuuchi.', memberIds: [st.id], link });
  /* Underrated: the biggest gap between banzuke order and the predictor's power order, men now in Makuuchi. */
  const gaps = powerGaps(roster, model).under;
  const g = take(gaps);
  if (g && g.gap >= 5) cards.push({ tag: 'Underrated', metric: '#' + g.power, headline: g.w.shikonaEn + ' is ranked ' + ordinal(g.rank) + ' in Makuuchi but rated ' + ordinal(g.power),
    description: 'The predictor’s power table weighs his rank (' + plainRank(g.w.currentRank) + ') with how he has done against that rank since ' + model.builtFrom.basho[0].slice(0, 4) + '.', memberIds: [Number(g.w.sourceId)], link: 'sumo.html#predict' });
  return cards;
}
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

/* Banzuke order against the predictor's power order for the men now in Makuuchi. `under`: rated well
   above their rank; `over`: ranked above where the predictor puts them. Gap in places, biggest first. */
export function powerGaps(roster, model, { min = 5 } = {}) {
  const R = ratingsMap(model.ratings);
  const now = (roster?.rikishi || []).filter(w => isMakuuchi(w.currentRank));
  const byRank = now.slice().sort((a, b) => position(a.currentRank) - position(b.currentRank)).map(w => w.sourceId);
  const byPower = now.slice().sort((a, b) => strength(b.currentRank, R.get(Number(b.sourceId)) || 0, model) - strength(a.currentRank, R.get(Number(a.sourceId)) || 0, model)).map(w => w.sourceId);
  const all = now.map(w => ({ w, id: Number(w.sourceId), name: w.shikonaEn, rankText: w.currentRank, rank: byRank.indexOf(w.sourceId) + 1, power: byPower.indexOf(w.sourceId) + 1 })).map(x => ({ ...x, gap: x.rank - x.power }));
  return { under: all.filter(x => x.gap >= min).sort((a, b) => b.gap - a.gap), over: all.filter(x => -x.gap >= min).sort((a, b) => a.gap - b.gap), size: now.length };
}
