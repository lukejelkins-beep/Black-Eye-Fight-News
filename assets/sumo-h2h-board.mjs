/**
 * Head-to-head board: one rikishi's record against everyone on the current
 * banzuke. Pure functions so the colouring and the "recent" window are tested
 * without a browser.
 *
 * Records come from the research cache (Sumo API history, not JSA-certified).
 * Career mode uses the small activePairs summary that the page already loads;
 * the recent window needs every bout, so it reads the full chronology.
 */
import { pairKey } from './sumo-matchup.mjs';

const BASHO_MONTHS = [1, 3, 5, 7, 9, 11];

/** The n most recent basho ids ending at (and including) bashoId, newest first. */
export function recentBashoIds(bashoId, n = 6) {
  const m = /^(\d{4})(\d{2})$/.exec(String(bashoId || ''));
  if (!m) return [];
  let year = Number(m[1]), idx = BASHO_MONTHS.indexOf(Number(m[2]));
  if (idx < 0) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(String(year) + String(BASHO_MONTHS[idx]).padStart(2, '0'));
    if (--idx < 0) { idx = BASHO_MONTHS.length - 1; year--; }
  }
  return out;
}

/**
 * Record of `a` against `b`. Returns {wins, losses, total, latest} where latest
 * is up to five newest meetings as {bashoId, day, winnerId, kimarite}; or null
 * when the cache cannot answer (for example the recent window before the full
 * chronology has loaded). A pair with no meetings returns total 0.
 */
export function boardRecord(summary, full, a, b, window = null) {
  const first = Number(a), second = Number(b);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second) || first === second) return null;
  const key = pairKey(first, second);
  const flip = first !== Math.min(first, second);
  const toRow = m => ({ bashoId: String(m[0]), day: Number(m[1]), winnerId: Number(m[2]), kimarite: typeof m[3] === 'string' ? m[3] : null });
  if (window) {
    if (!full?.pairs) return null;
    const pair = full.pairs[key];
    const ids = new Set(window);
    const rows = (pair?.regular || []).filter(m => Array.isArray(m) && ids.has(String(m[0]))).map(toRow);
    const wins = rows.filter(r => r.winnerId === first).length;
    return { wins, losses: rows.length - wins, total: rows.length, latest: rows.slice(0, 5) };
  }
  if (!summary?.activePairs) return null;
  const pair = summary.activePairs[key];
  if (!pair) return { wins: 0, losses: 0, total: 0, latest: [] };
  const wa = Number(pair.winsA), wb = Number(pair.winsB);
  if (!Number.isSafeInteger(wa) || !Number.isSafeInteger(wb)) return null;
  return {
    wins: flip ? wb : wa, losses: flip ? wa : wb, total: wa + wb,
    latest: (Array.isArray(pair.latest) ? pair.latest : []).filter(m => Array.isArray(m) && m[6] !== 'special').map(toRow).slice(0, 5)
  };
}

/**
 * Colour band for a record: 'win', 'loss', 'even' or 'none', plus a strength
 * from 1 to 4 that grows with the number of meetings (one meeting says little,
 * ten says a lot). Mirrors the reading of the classic H2H banzuke: the colour
 * says who leads, the depth says how much evidence there is.
 */
export function recordTone(rec) {
  if (!rec || !rec.total) return { tone: 'none', strength: 0 };
  const tone = rec.wins > rec.losses ? 'win' : rec.wins < rec.losses ? 'loss' : 'even';
  const strength = rec.total >= 10 ? 4 : rec.total >= 6 ? 3 : rec.total >= 3 ? 2 : 1;
  return { tone, strength };
}

/** Totals for the selected rikishi across a list of records. */
export function boardTotals(records) {
  let wins = 0, losses = 0, met = 0, ahead = 0, behind = 0;
  for (const r of records) {
    if (!r || !r.total) continue;
    met++; wins += r.wins; losses += r.losses;
    if (r.wins > r.losses) ahead++; else if (r.wins < r.losses) behind++;
  }
  return { wins, losses, met, ahead, behind };
}
