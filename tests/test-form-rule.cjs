/* One Form rule across the Fighters hub, profile and leaderboard (QA audit C01). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const R = require('../assets/form-rule.js');

// The rule
const fixture = {
  certifiedScored: { certified: true, form: 72 },
  certifiedLimited: { certified: true, form: null },
  uncertifiedScored: { certified: false, form: 88 },   // 94 such rows existed in the 18:20 artifact
  missingFlag: { form: 60 },
};
assert.strictEqual(R.shown(fixture.certifiedScored), true);
assert.strictEqual(R.shown(fixture.certifiedLimited), false);
assert.strictEqual(R.shown(fixture.uncertifiedScored), false, 'an uncertified record never shows a Form number');
assert.strictEqual(R.shown(fixture.missingFlag), false, 'certification must be explicit');
assert.strictEqual(R.shown(null), false);
assert.deepStrictEqual(Object.values(fixture).map(R.reason), ['shown', 'limited', 'uncertified', 'uncertified']);
assert.strictEqual(R.reason(undefined), 'none');

// Every surface asks the same rule, and the board no longer substitutes the older Form column.
const read = f => fs.readFileSync(path.join(__dirname, '..', 'assets', f), 'utf8');
const insights = read('fighter-insights.js'), hub = read('fighters-hub.js');
assert.ok(/formOf=i=>\{[^}]*formShown\(e\)/.test(insights), 'leaderboard uses the shared rule');
assert.ok((insights.match(/if\(id==='form'\)\{const e=formEntry\(stats\);return formShown\(e\)\?e\.form:null;\}/g) || []).length === 2, 'both profile render paths use the shared rule');
assert.ok(!/st\.metric==="form"&&formData\?formOf\(r\[0\]\):r\[col\]/.test(insights), 'no fallback to the older ratings.form column');
assert.ok(insights.includes('Loading Form…'), 'board says Loading while the Form file is not in');
assert.ok(insights.includes('Form not shown until this record is certified'), 'profile explains an uncertified record');
assert.ok(hub.includes('Form not shown until this record is certified'), 'hub uses the same wording');
assert.ok(/const scored=f=>formShown\(f\)/.test(hub) && /window\.BEFNFormRule\.shown\(f\)/.test(hub), 'hub uses the shared rule');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.indexOf('assets/form-rule.js') > -1 && html.indexOf('assets/form-rule.js') < html.indexOf('assets/fighter-insights.js'), 'rule loads before the pages that use it');
console.log('form rule: ok');
