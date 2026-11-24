/* BEFN Basho review page (sumo.html#review/YYYYMM). Renders buildReview() from sumo-review-data.mjs.
   h = { e, head(id), cutout(id), known(id) } as for the Sumo home. index = archive index.json. */
import { face, who, head, championsBlock, starsBlock, sanyakuBlock, moversBlock } from './sumo-home.mjs?v=20261124-review1';
import { plainRank, bashoName, shortRank } from './sumo-home-data.mjs?v=20261124-review1';

const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';

function selector(h, r, index) {
  const ids = (index?.basho || []).map(b => b.bashoId).sort().reverse();
  const i = ids.indexOf(r.bashoId);
  const newer = i > 0 ? ids[i - 1] : null, older = i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
  return '<div class="srev-pick"><label for="srev-basho">Tournament</label><select id="srev-basho" data-review-select>' +
    ids.map(id => '<option value="' + h.e(id) + '"' + (id === r.bashoId ? ' selected' : '') + '>' + h.e(bashoName(id)) + '</option>').join('') + '</select>' +
    (older ? '<a class="srev-step" href="#review/' + h.e(older) + '" aria-label="Previous tournament, ' + h.e(bashoName(older)) + '">‹ ' + h.e(bashoName(older).split(' ')[0].slice(0, 3)) + '</a>' : '') +
    (newer ? '<a class="srev-step" href="#review/' + h.e(newer) + '" aria-label="Next tournament, ' + h.e(bashoName(newer)) + '">' + h.e(bashoName(newer).split(' ')[0].slice(0, 3)) + ' ›</a>' : '') + '</div>';
}

function top(h, r, file) {
  const c = r.headline.champion;
  const lost = c ? c.lostTo.map(x => h.e(x.opponent) + ' (day ' + x.day + ')') : [];
  const img = c && h.cutout(c.id);
  return '<section class="shome-hero srev-hero"><div class="shome-hero-copy"><div class="shome-kicker">Basho review · ' + h.e(r.headline.venue) + ' · ' + h.e(fmtDate(file.startDate)) + '–' + h.e(fmtDate(file.endDate)) + '</div>' +
    '<h1>' + h.e(r.headline.name) + ' basho</h1>' +
    (c ? '<p>' + h.e(plainRank(c.rank)) + ' ' + who(h, c.id, c.name) + ' won the Makuuchi title at <b>' + c.wins + '–' + c.losses + '</b>' + (lost.length ? ', losing to ' + (lost.length > 1 ? lost.slice(0, -1).join(', ') + ' and ' + lost[lost.length - 1] : lost[0]) : ' without a loss') + '.</p>' : '') +
    selector(h, r, h.index) + '</div>' +
    (img ? '<div class="shome-hero-photo"><img src="' + h.e(img) + '" alt="' + h.e(c.name) + '"><span class="shome-cup">Makuuchi champion</span></div>' : '') + '</section>';
}

function recordsBlock(h, r) {
  const col = (title, list, fmt) => list.length ? '<div class="shome-card shome-wcol"><h3>' + h.e(title) + '</h3><ul>' + list.map(x => '<li><span>' + who(h, x.id, x.name) + ' · ' + h.e(shortRank(x.rank)) + '</span><b>' + h.e(fmt(x)) + '</b></li>').join('') + '</ul></div>' : '';
  const rec = x => x.wins + '–' + x.losses + (x.absences ? '–' + x.absences : '');
  return '<section class="shome-block">' + head(h, 'Who did well, who didn’t', null, 'Makuuchi records. Wrestlers who missed bouts are listed on their own.') + '<div class="shome-watch">' +
    col('Best records', r.records.best, rec) + col('Toughest basho', r.records.worst, rec) + col('Missed bouts (kyujo)', r.records.absent.slice(0, 6), x => x.absences + ' absent · ' + x.wins + '–' + x.losses) + '</div></section>';
}

function upsetsBlock(h, r) {
  if (!r.upsets.length) return '';
  return '<section class="shome-block">' + head(h, 'Upsets of the basho', null, 'Makuuchi wins by the lower-ranked wrestler, biggest gap in rank first.') + '<div class="shome-card srev-list">' +
    r.upsets.map(u => '<div class="srev-up">' + face(h, u.winner.id) + '<div><strong>' + who(h, u.winner.id, u.winner.name) + '</strong> <span class="srev-rk">' + h.e(shortRank(u.winner.rank)) + '</span> beat <strong>' + who(h, u.loser.id, u.loser.name) + '</strong> <span class="srev-rk">' + h.e(shortRank(u.loser.rank)) + '</span>' +
      '<span class="srev-meta">Day ' + u.day + (u.kimarite ? ' · <a href="#kimarite?term=' + h.e(encodeURIComponent(u.kimarite)) + '">' + h.e(u.kimarite) + '</a>' : '') + '</span></div></div>').join('') + '</div></section>';
}

function techniqueBlock(h, r) {
  const t = r.techniques;
  if (!t.total) return '';
  const max = t.top[0]?.count || 1;
  const link = k => '<a href="#kimarite?term=' + h.e(encodeURIComponent(k)) + '">' + h.e(k) + '</a>';
  return '<section class="shome-block">' + head(h, 'Technique of the basho', ['#kimarite', 'All techniques'], t.total + ' fought bouts in Makuuchi, Juryo and Makushita, won with ' + t.kinds + ' different techniques.') +
    '<div class="shome-card srev-tech">' + t.top.map(x => '<div class="srev-trow"><span class="srev-tname">' + link(x.kimarite) + '</span><span class="srev-tbar"><i style="width:' + (x.count / max * 100).toFixed(1) + '%"></i></span><span class="srev-tn">' + x.count + ' · ' + Math.round(x.share * 100) + '%</span></div>').join('') +
    (t.once.length ? '<p class="shome-note">Seen only once: ' + t.once.map(link).join(', ') + '.</p>' : '') + '</div></section>';
}

function dataNotes(h, r) {
  if (!r.notes.length) return '';
  return '<details class="srev-notes"><summary>About this tournament’s data (' + r.notes.length + ')</summary><ul>' + r.notes.map(n => '<li>' + h.e(n) + '</li>').join('') + '</ul></details>';
}

export function renderReview(r, file, h) {
  const d = { ...r, finished: true };
  return '<div class="sumo-home sumo-review">' + top(h, r, file) + (h.dayByDay || '') +
    championsBlock(h, d, null) +
    '<section class="shome-block shome-two">' + starsBlock(h, d) + sanyakuBlock(h, d) + '</section>' +
    (r.kadobanKnown ? '' : '<p class="shome-note">Kadoban flags need the tournament before, which is not saved for ' + h.e(r.headline.name) + '.</p>') +
    recordsBlock(h, r) + upsetsBlock(h, r) + techniqueBlock(h, r) +
    (r.movers ? moversBlock(h, d) : '') +
    dataNotes(h, r) +
    '<p class="shome-source">From the saved Sumo API record of the ' + h.e(r.headline.name) + ' basho (collected ' + h.e(fmtDate(r.source.collectedAt)) + ' ' + h.e((r.source.collectedAt || '').slice(0, 4)) + '). Wins are counted from each wrestler’s bouts.</p></div>';
}
