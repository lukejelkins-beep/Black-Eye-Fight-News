/* BEFN Sumo live prediction record (data/sumo/prediction-log.json). Owner, 28 Nov 2026: save every
   pick the morning before its bout, from the January 2027 basho on, and score it after, so the
   predictor keeps a record it cannot rewrite.
   - recordPicks: once the next day's torikumi is announced and before any of that day is fought,
     saves that day's Makuuchi and Juryo picks. A day already saved is never touched again.
   - scoreLog: fills in each saved pick's result once the bout is fought ("a", "b"), or "void" for a
     fusen or an absence. It never changes a saved chance.
   - summary: the running record for the Predictor page.
   Pure functions; scripts/sumo-log-predictions.mjs runs them after each live refresh. */
import { position } from './sumo-home-data.mjs';
import { completedDay } from './sumo-live-data.mjs';
import { nextMorning, pickWith, bashoRows } from './sumo-predict.mjs';
import { announcedTorikumiMatches } from './sumo-data.mjs';

export const DIVISIONS = ['Makuuchi', 'Juryo'];
const r4 = x => Math.round(x * 1e4) / 1e4;
export const emptyLog = () => ({ schemaVersion: 1, note: 'Picks saved before each day of a live basho and never changed; results added after.', basho: {} });

/* Any bout of `day` already decided in the snapshot (in any tracked division)? */
function dayStarted(details, day) {
  return bashoRows(details).some(r => { const b = (r.record || [])[day - 1]; return b && /win|loss/.test(b.result || ''); });
}

/* Save the announced day's picks if they are not saved yet. Returns { log, saved: [division...], reason }. */
export function recordPicks(log, details, model, { now = new Date() } = {}) {
  const out = log || emptyLog(), id = String(details?.bashoId || '');
  const day = Number(details?.announcedDay);
  if (!model?.state || !id || id <= String(model.state.lastBasho)) return { log: out, saved: [], reason: 'no live basho after the predictor state' };
  if (!Number.isInteger(day) || day < 1 || day > 15) return { log: out, saved: [], reason: 'no announced day' };
  const done = completedDay(details);
  if (dayStarted(details, day)) return { log: out, saved: [], reason: 'day ' + day + ' has started: too late to save picks' };
  if (done !== day - 1) return { log: out, saved: [], reason: 'results through day ' + (day - 1) + ' are not all in (completed: ' + done + ')' };
  const B = (out.basho[id] ||= { days: {} });
  const D = (B.days[day] ||= {});
  const M = nextMorning(model, { details, completed: day - 1 });
  const byId = new Map(bashoRows(details).map(r => [Number(r.rikishiID), r]));
  const saved = [];
  for (const division of DIVISIONS) {
    if (D[division]) continue; /* append-only */
    const src = details.torikumi?.[division];
    if (src?.status !== 'available') continue;
    const pairs = announcedTorikumiMatches(src.data, { bashoId: id, division, day }).filter(m => !m.finished);
    const picks = [];
    for (const m of pairs) {
      const x = byId.get(m.rikishiId), y = byId.get(m.opponentId);
      if (!x || !y) continue;
      const [a, b] = position(x.rank) <= position(y.rank) ? [x, y] : [y, x];
      const q = pickWith(M, model, a.rikishiID, b.rikishiID);
      if (!q) continue;
      picks.push({ a: a.rikishiID, b: b.rikishiID, an: a.shikonaEn, bn: b.shikonaEn, ar: a.rank, br: b.rank, p: r4(q.p) });
    }
    if (!picks.length) continue;
    D[division] = { savedAt: now.toISOString(), model: (model.builtAt || '') + '/' + (model.updatedThrough || model.state.lastBasho), picks };
    saved.push(division);
  }
  if (!Object.keys(D).length) delete B.days[day];
  if (!Object.keys(B.days).length) delete out.basho[id];
  return { log: out, saved, reason: saved.length ? '' : 'nothing new to save' };
}

/* Fill in results for saved picks of this basho that have been fought. */
export function scoreLog(log, details) {
  const id = String(details?.bashoId || ''), B = log?.basho?.[id];
  if (!B) return { log, scored: 0 };
  const done = completedDay(details), byId = new Map(bashoRows(details).map(r => [Number(r.rikishiID), r]));
  let scored = 0;
  for (const [d, D] of Object.entries(B.days)) {
    const day = Number(d);
    if (day > done) continue;
    for (const division of Object.keys(D)) for (const pk of D[division].picks) {
      if (pk.r) continue;
      const rec = (byId.get(pk.a)?.record || [])[day - 1];
      if (rec && rec.result === 'win' && Number(rec.opponentID) === pk.b) pk.r = 'a';
      else if (rec && rec.result === 'loss' && Number(rec.opponentID) === pk.b) pk.r = 'b';
      else pk.r = 'void'; /* fusen, absence, or the pairing changed */
      scored++;
    }
  }
  return { log, scored };
}

/* The running record: per division, and per basho. Void bouts are left out. */
export function summary(log) {
  const tally = () => ({ bouts: 0, called: 0, brier: 0, pending: 0, voided: 0 });
  const add = (t, pk) => {
    if (!pk.r) { t.pending++; return; }
    if (pk.r === 'void') { t.voided++; return; }
    const y = pk.r === 'a' ? 1 : 0;
    t.bouts++; t.called += (pk.p >= 0.5) === (y === 1) ? 1 : 0; t.brier += (pk.p - y) ** 2;
  };
  const total = Object.fromEntries(DIVISIONS.map(d => [d, tally()]));
  const basho = [];
  let latest = null;
  for (const id of Object.keys(log?.basho || {}).sort()) {
    const per = Object.fromEntries(DIVISIONS.map(d => [d, tally()]));
    for (const day of Object.keys(log.basho[id].days).map(Number).sort((a, b) => a - b)) {
      const D = log.basho[id].days[day];
      for (const division of Object.keys(D)) for (const pk of D[division].picks) { add(per[division], pk); add(total[division], pk); }
      if (D.Makuuchi?.picks.some(pk => pk.r && pk.r !== 'void')) latest = { bashoId: id, day, picks: D.Makuuchi.picks, savedAt: D.Makuuchi.savedAt };
    }
    basho.push({ bashoId: id, ...per });
  }
  const fin = t => ({ ...t, brier: t.bouts ? Math.round(t.brier / t.bouts * 1e4) / 1e4 : null, rate: t.bouts ? t.called / t.bouts : null });
  return { total: Object.fromEntries(Object.entries(total).map(([k, t]) => [k, fin(t)])), basho: basho.map(b => ({ bashoId: b.bashoId, Makuuchi: fin(b.Makuuchi), Juryo: fin(b.Juryo) })), latest };
}
