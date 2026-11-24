/* One rule for when a UFC Form score is shown (QA audit C01, 25 Nov 2026).
 * The Fighters hub, the fighter profile and the stats leaderboard all read
 * data/ufc-fighter-form.json, but each decided for itself whether to show a number:
 * the hub required a certified record, the profile and the board did not, and the
 * board fell back to an older Form column while the file was loading or missing.
 * Now all three ask this one function. A Form score is shown only when the fighter's
 * record is certified and the score is a real number; otherwise the page says why.
 * Display only: this changes no certificate, rating or data file. */
(function (root) {
  const shown = entry => !!entry && entry.certified === true && Number.isFinite(entry.form);
  const reason = entry => !entry ? 'none'
    : entry.certified !== true ? 'uncertified'
    : Number.isFinite(entry.form) ? 'shown' : 'limited';
  const api = { shown, reason };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BEFNFormRule = api;
})(typeof self !== 'undefined' ? self : this);
