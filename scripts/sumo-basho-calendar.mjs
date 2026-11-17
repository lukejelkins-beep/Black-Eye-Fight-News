/**
 * Which basho is the Sumo preview about right now? Pure date logic, no network.
 * Six grand tournaments a year (Jan, Mar, May, Jul, Sep, Nov), 15 days each,
 * starting on the second Sunday of the month. The banzuke for the next basho
 * is published about two weeks before it starts.
 */
export const BASHO_MONTHS = [1, 3, 5, 7, 9, 11];
const DAY = 86400000;

export function tokyoDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const utc = iso => Date.parse(iso + 'T00:00:00Z');
const iso = ms => new Date(ms).toISOString().slice(0, 10);

export function bashoStart(year, month) {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstSunday = 1 + ((7 - firstOfMonth.getUTCDay()) % 7);
  return iso(Date.UTC(year, month - 1, firstSunday + 7));
}
export const bashoIdFor = (year, month) => String(year) + String(month).padStart(2, '0');

function bashoList(year) {
  const list = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const m of BASHO_MONTHS) list.push({ id: bashoIdFor(y, m), startDate: bashoStart(y, m) });
  }
  return list;
}

/**
 * phase: 'live'    day 1 through the day after day 15 (final results land late)
 *        'pre'     banzuke published, tournament not started (start - 13 days)
 *        'between' otherwise; keep showing the most recent basho
 */
export function resolveBasho(now = new Date()) {
  const today = utc(tokyoDate(now));
  const list = bashoList(Number(tokyoDate(now).slice(0, 4)));
  let pick = null;
  for (let i = 0; i < list.length; i++) {
    const start = utc(list[i].startDate);
    if (today >= start - 13 * DAY && today <= start + 15 * DAY) {
      const phase = today < start ? 'pre' : 'live';
      pick = { ...list[i], previousBashoId: list[i - 1].id, phase, day: phase === 'live' ? Math.min(15, Math.round((today - start) / DAY) + 1) : null };
      break;
    }
    if (today > start + 15 * DAY && (i + 1 >= list.length || today < utc(list[i + 1].startDate) - 13 * DAY)) {
      pick = { ...list[i], previousBashoId: list[i - 1].id, phase: 'between', day: null };
      break;
    }
  }
  return pick;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const nowArg = process.argv.indexOf('--now');
  const r = resolveBasho(nowArg > 0 ? new Date(process.argv[nowArg + 1]) : new Date());
  console.log(r.id + ' ' + r.phase);
}
