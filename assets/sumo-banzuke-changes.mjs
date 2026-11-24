/* BEFN banzuke changes: what a newly released banzuke did to each wrestler, read against his
   record at the basho before. Input: the new banzuke (an archive file, or the saved release of the
   next basho, which has ranks but no bouts yet) and the archive file of the basho before.
   Pure functions; every label below is a stated rule applied to those two files. */
import { position, parseRank, tierOf, isSanyaku, isMakuuchi, bashoName } from './sumo-home-data.mjs';

const RANKS = f => {
  const out = [];
  for (const b of Object.values(f?.banzuke || {})) for (const r of b.rows || []) out.push(r);
  return out;
};
/* A winning record (kachi-koshi): more wins than half the bouts of the division the wrestler was in.
   Absences count as losses for this, as on the banzuke. */
export function winning(r) {
  const bouts = tierOf(r.rank) === 'Makushita' ? 7 : 15;
  return r.wins > bouts / 2;
}
export const recordText = r => r.wins + '–' + r.losses + (r.absences ? '–' + r.absences : '');
const level = rank => {
  const t = tierOf(rank);
  return t === 'Yokozuna' ? 6 : t === 'Ozeki' ? 5 : isSanyaku(rank) ? 4 : t === 'Maegashira' ? 3 : t === 'Juryo' ? 2 : t === 'Makushita' ? 1 : 0;
};

export function buildChanges(newFile, prevFile, careerHistory) {
  const prev = new Map(RANKS(prevFile).map(r => [r.rikishiID, r]));
  const history = careerHistory?.bySourceId || {};
  const id = newFile.bashoId;
  const everWas = (rid, test) => (history[String(rid)]?.rank || []).some(x => x.basho < id && test(x.rank));
  const known = rid => !!history[String(rid)];
  const moves = [];
  for (const r of RANKS(newFile)) {
    const p = prev.get(r.rikishiID);
    if (!p) continue;
    const from = position(p.rank), to = position(r.rank);
    if (from == null || to == null) continue;
    moves.push({ id: r.rikishiID, name: r.shikonaEn, from: p.rank, to: r.rank, change: from - to, record: recordText(p), winning: winning(p),
      wins: p.wins, losses: p.losses, absences: p.absences || 0, levelFrom: level(p.rank), levelTo: level(r.rank) });
  }
  /* First time or a return, only when the wrestler's rank history is saved; otherwise the plain label. */
  const tag = (m, beenTest, [first, back, plain]) => ({ ...m, note: !known(m.id) ? plain : everWas(m.id, beenTest) ? back : first });
  const by = (f, sort) => moves.filter(f).sort(sort || ((a, b) => position(a.to) - position(b.to)));

  const headline = {
    yokozuna: by(m => tierOf(m.to) === 'Yokozuna' && tierOf(m.from) !== 'Yokozuna'),
    ozekiUp: by(m => tierOf(m.to) === 'Ozeki' && m.levelFrom < 5),
    ozekiDown: by(m => tierOf(m.from) === 'Ozeki' && m.levelTo < 5),
    kadoban: by(m => tierOf(m.from) === 'Ozeki' && tierOf(m.to) === 'Ozeki' && !m.winning),
    intoSanyaku: by(m => isSanyaku(m.to) && !isSanyaku(m.from)).map(m => tag(m, isSanyaku, ['Sanyaku debut', 'Back in sanyaku', 'Into sanyaku'])),
    outOfSanyaku: by(m => isSanyaku(m.from) && !isSanyaku(m.to)),
    intoMakuuchi: by(m => isMakuuchi(m.to) && !isMakuuchi(m.from)).map(m => tag(m, isMakuuchi, ['Makuuchi debut', 'Back in Makuuchi', 'Into Makuuchi'])),
    outOfMakuuchi: by(m => isMakuuchi(m.from) && !isMakuuchi(m.to)),
    intoJuryo: by(m => tierOf(m.to) === 'Juryo' && tierOf(m.from) === 'Makushita').map(m => tag(m, x => tierOf(x) === 'Juryo' || isMakuuchi(x), ['New sekitori', 'Back to Juryo', 'Into Juryo'])),
    outOfJuryo: by(m => tierOf(m.from) === 'Juryo' && tierOf(m.to) === 'Makushita')
  };

  /* Moves inside the top two divisions (both ranks in Makuuchi or Juryo). */
  const top2 = moves.filter(m => m.levelFrom >= 2 && m.levelTo >= 2);
  const climbs = top2.filter(m => m.change > 0).sort((a, b) => b.change - a.change).slice(0, 6);
  const falls = top2.filter(m => m.change < 0).sort((a, b) => a.change - b.change).slice(0, 6);

  /* Observations: each is a plain rule on the record and the move. */
  const observations = [];
  const upDespite = top2.filter(m => !m.winning && m.change > 0).sort((a, b) => b.change - a.change);
  if (upDespite.length) observations.push({ kind: 'lucky', title: 'Up despite a losing record', text: 'Moved up although they lost more than they won, usually because wrestlers below them did worse.', list: upDespite.slice(0, 4) });
  /* Only ranks with room above (Komusubi, Maegashira, Juryo): a Yokozuna or Ozeki keeping his rank is no story. */
  const heldBack = top2.filter(m => m.winning && m.change <= 0 && ['Komusubi', 'Maegashira', 'Juryo'].includes(tierOf(m.from))).sort((a, b) => a.change - b.change || b.wins - a.wins);
  if (heldBack.length) observations.push({ kind: 'unlucky', title: 'Winning record, no promotion', text: 'A winning record usually means a move up; these stayed put or went down, often because there was no room above.', list: heldBack.slice(0, 4) });
  const eightSeven = top2.filter(m => m.wins === 8 && m.losses === 7 && m.change > 0).sort((a, b) => b.change - a.change);
  if (eightSeven.length) observations.push({ kind: 'jump', title: 'Biggest jump from an 8–7', text: 'The bare minimum winning record, and the biggest reward for it.', list: eightSeven.slice(0, 1) });
  const sevenEight = top2.filter(m => m.wins === 7 && m.losses === 8 && m.change < 0).sort((a, b) => a.change - b.change);
  if (sevenEight.length) observations.push({ kind: 'drop', title: 'Biggest drop from a 7–8', text: 'One loss short of a winning record, and the heaviest price paid for it.', list: sevenEight.slice(0, 1) });
  const absentDrop = top2.filter(m => m.absences >= 8 && m.change < 0).sort((a, b) => a.change - b.change);
  if (absentDrop.length) observations.push({ kind: 'absent', title: 'Dropped after missing bouts', text: 'Absences count as losses on the banzuke.', list: absentDrop.slice(0, 4) });
  const count = t => RANKS(newFile).filter(r => tierOf(r.rank) === t).length;
  const sanyakuSize = { Sekiwake: count('Sekiwake'), Komusubi: count('Komusubi') };
  if (sanyakuSize.Sekiwake > 2 || sanyakuSize.Komusubi > 2) observations.push({ kind: 'slots', title: 'An extra sanyaku place', text: 'The banzuke has ' + sanyakuSize.Sekiwake + ' Sekiwake and ' + sanyakuSize.Komusubi + ' Komusubi; two of each is the minimum, extra places are added when more wrestlers have earned one.', list: [] });

  return { bashoId: id, previousBashoId: prevFile?.bashoId, name: bashoName(id), previousName: bashoName(prevFile?.bashoId || ''),
    headline, climbs, falls, observations, moves: moves.sort((a, b) => position(a.to) - position(b.to)), sanyakuSize };
}

/* The table: Makuuchi and Juryo, best rank first. */
export const tableRows = c => c.moves.filter(m => m.levelTo >= 2);
export { position, parseRank, tierOf };
