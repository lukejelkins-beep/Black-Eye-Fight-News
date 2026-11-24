/* Canonical URLs for the Fights page tabs (audit D02, 24 Nov 2026).
 *   #fights          Upcoming
 *   #fights/results  Results
 * #calendar and #results are kept as aliases for old links and the Overview
 * buttons. Before this, every alias was rewritten to #fights, so a reload,
 * a second tab or a shared Results link always opened Upcoming.
 * Pure so tests run in Node. */
(function (root) {
  const VIEWS = { upcoming: '#fights', results: '#fights/results' };
  function parse(hash) {
    const parts = String(hash || '').replace(/^#/, '').split('/');
    if (parts[0] === 'results') return { view: 'results', canonical: VIEWS.results };
    if (parts[0] === 'calendar') return { view: 'upcoming', canonical: VIEWS.upcoming };
    if (parts[0] === 'fights') {
      const view = parts[1] === 'results' ? 'results' : 'upcoming';
      return { view, canonical: VIEWS[view] };
    }
    return null;
  }
  const hashFor = view => VIEWS[view] || VIEWS.upcoming;
  const api = { parse, hashFor };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BEFNFightsRoute = api;
})(typeof self !== 'undefined' ? self : this);
