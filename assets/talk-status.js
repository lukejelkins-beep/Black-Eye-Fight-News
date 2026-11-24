/* Fight Talk status wording (QA audit A05, 25 Nov 2026).
 * The page said "Live feed checked <time>", which is when the collector last ran,
 * even when no post had changed for hours and a platform was down; and while the
 * feed was still loading the empty box was headed "No posts match these filters".
 * These helpers keep three facts apart: still loading, when posts last changed
 * (updatedAt), when the collector last checked (checkedAt), and which platforms
 * could not be reached. Pure so tests run in Node. */
(function (root) {
  const loading = s => !s.lastAttempt || s.loading;
  // fmt: full local date and time. time (optional): time of day only, used for the check
  // time when it falls on the same local day as the post time, to keep the line short.
  const sameDay = (a, b) => { const x = new Date(a), y = new Date(b); return x.toDateString() === y.toDateString(); };
  function freshness(s, fmt, time) {
    if (s.highlights) return 'Highlights from the previous four weeks';
    if (s.error) return s.error;
    if (loading(s) || !s.checkedAt) return 'Loading Fight Talk…';
    const parts = [];
    if (s.updatedAt) parts.push('Posts updated ' + fmt(s.updatedAt));
    const checked = s.updatedAt && time && sameDay(s.updatedAt, s.checkedAt) ? time(s.checkedAt) : fmt(s.checkedAt);
    parts.push((s.updatedAt ? 'checked ' : 'Feed checked ') + checked);
    const down = (s.platformStatus || []).filter(p => p && p.state === 'unavailable').map(p => p.platform).filter(Boolean);
    if (down.length) parts.push(down.join(' and ') + (down.length === 1 ? ' is' : ' are') + ' unavailable');
    return parts.join(' · ');
  }
  const emptyHeading = s => (!s.highlights && loading(s)) ? 'Loading Fight Talk…' : 'No posts match these filters';
  const api = { freshness, emptyHeading };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BEFNTalkStatus = api;
})(typeof self !== 'undefined' ? self : this);
