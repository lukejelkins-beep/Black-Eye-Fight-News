/* BEFN Sumo basho analysis: what the Basho review and the live-basho page show for one day.
   Works on a snapshot shaped like preview-details.json (the live basho, or an archive file through
   asDetails). Pure functions; tests replay saved basho. Makuuchi only.
   Rules as in sumo-live-data.mjs: a win is "win" or "fusen win"; a loss is "loss", "fusen loss" or
   "absent". Predictor chances come from sumo-predict.mjs and use only what was known that morning. */
import { rows, isMakuuchi, position, tierOf } from './sumo-home-data.mjs';
import { completedDay, through } from './sumo-live-data.mjs';
import { bashoPredictions, expectedWins, nextMorning, pickWith } from './sumo-predict.mjs';

const maku = details => rows(details?.banzuke).filter(r => isMakuuchi(r.rank));
const view = r => ({ id: r.rikishiID, name: r.shikonaEn, rank: r.rank });
const resultOn = (r, day) => { const b = (r.record || [])[day - 1]; if (!b) return null; return /win/.test(b.result) ? 'win' : /loss|absent/.test(b.result) ? 'loss' : null; };

/* Standings after `day`: fewest losses, then most wins, then rank. Place is shared on equal records. */
export function standings(details, day, { limit = 10 } = {}) {
  const list = maku(details).map(r => ({ ...view(r), ...through(r, day), today: resultOn(r, day), yesterday: day > 1 ? through(r, day - 1) : null }));
  list.sort((a, b) => a.l - b.l || b.w - a.w || position(a.rank) - position(b.rank));
  let place = 0;
  list.forEach((x, i) => { if (!i || x.l !== list[i - 1].l || x.w !== list[i - 1].w) place = i + 1; x.place = place; });
  return list.slice(0, limit);
}

/* Net wins (wins minus losses) day by day for the men at the top after `upto`. */
export function raceSeries(details, upto, { count = 4 } = {}) {
  if (!upto) return [];
  const top = standings(details, upto, { limit: count });
  const byId = new Map(maku(details).map(r => [r.rikishiID, r]));
  return top.map(x => ({ ...x, points: Array.from({ length: upto }, (_, i) => { const t = through(byId.get(x.id), i + 1); return { day: i + 1, w: t.w, l: t.l, net: t.w - t.l }; }) }));
}

/* Everything for one basho: per-day results with the morning's chance, and running scores. */
export function analysis(details, model, { day } = {}) {
  const completed = completedDay(details);
  const sel = Math.min(Math.max(1, Number(day) || completed || 1), Math.max(1, completed));
  const preds = (model && bashoPredictions(details, model) || []).filter(q => isMakuuchi(q.a.rank) && isMakuuchi(q.b.rank) && q.day <= completed);
  const bout = q => {
    const w = q.aWon ? q.a : q.b, l = q.aWon ? q.b : q.a, p = q.aWon ? q.p : 1 - q.p;
    return { day: q.day, winner: view(w), loser: view(l), p, called: p >= 0.5, kimarite: q.kimarite,
      kinboshi: tierOf(w.rank) === 'Maegashira' && tierOf(l.rank) === 'Yokozuna' };
  };
  const all = preds.map(bout);
  const today = all.filter(b => b.day === sel).sort((a, b) => Math.min(position(a.winner.rank), position(a.loser.rank)) - Math.min(position(b.winner.rank), position(b.loser.rank)));
  const tally = list => ({ hit: list.filter(b => b.called).length, n: list.length });
  const shock = list => list.filter(b => !b.called).sort((a, b) => a.p - b.p)[0] || null;
  /* Expected wins through the selected day: who is beating the predictor, and who is falling short. */
  const missed = new Map(maku(details).map(r => [r.rikishiID, (r.record || []).slice(0, sel).filter(b => b && b.result === 'absent').length]));
  const exp = expectedWins(preds.filter(q => q.day <= sel), { isMakuuchi }).filter(x => x.bouts >= Math.min(5, sel)).map(x => ({ ...x, missed: missed.get(x.id) || 0 }));
  const byDelta = exp.slice().sort((a, b) => b.delta - a.delta);
  return {
    bashoId: details.bashoId, completed, day: sel, hasModel: !!preds.length,
    bouts: today, dayScore: tally(today), dayShock: shock(today),
    soFar: tally(all.filter(b => b.day <= sel)), bashoShock: shock(all.filter(b => b.day <= sel)),
    table: standings(details, sel), race: raceSeries(details, completed),
    over: byDelta.filter(x => x.delta > 0.5).slice(0, 4), under: byDelta.reverse().filter(x => x.delta < -0.5 && !x.missed).slice(0, 4)
  };
}

/* Picks for a day not yet fought (live mode): pairs [{ rikishiId, opponentId }] from the announced
   torikumi, rated the morning of `day` (everything through the day before). */
export function picks(details, model, pairs, day) {
  if (!pairs?.length || !model) return [];
  /* A saved basho replayed as a preview (#review?liveday=N) uses the chances saved for it. */
  const saved = model.archive?.[details.bashoId];
  const M = saved ? null : nextMorning(model, { details, completed: day - 1 });
  if (!saved && !M) return [];
  const byId = new Map(maku(details).map(r => [Number(r.rikishiID), r]));
  const out = [];
  for (const m of pairs) {
    const x = byId.get(Number(m.rikishiId)), y = byId.get(Number(m.opponentId));
    if (!x || !y) continue;
    const [a, b] = position(x.rank) <= position(y.rank) ? [x, y] : [y, x];
    const p = saved ? saved[day + ':' + a.rikishiID + ':' + b.rikishiID] : pickWith(M, model, a.rikishiID, b.rikishiID)?.p;
    if (p != null) out.push({ day, a: view(a), b: view(b), p });
  }
  return out.sort((m, n) => position(m.a.rank) - position(n.a.rank));
}
