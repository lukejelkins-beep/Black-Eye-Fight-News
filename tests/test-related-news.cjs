const assert = require('assert');
const { execFileSync } = require('child_process');
const rn = require('../assets/related-news.js');

const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = { esc, safeURL: x => (/^https:/.test(x) ? esc(x) : '#') };
const mk = (n, title, extra = {}) => ({ url: 'https://x.test/' + n, title, source: 'Src' + n, publishedAt: new Date(Date.UTC(2026, 10, 10, n)).toISOString(), ...extra });
const titles = (stories, names, limit) => rn.relatedNews(stories, names, limit).map(r => r.story.title);

// ratio and closeSpelling agree with Python's difflib and the importer.
const py = (a, b) => parseFloat(execFileSync('python3', ['-c', 'import difflib,sys;print(difflib.SequenceMatcher(None,sys.argv[1],sys.argv[2]).ratio())', a, b]).toString());
for (const [a, b] of [['maldozhanova', 'moldazhanova'], ['sergei', 'sergey'], ['baumgardner', 'baumgartner'], ['turhan', 'durhan'], ['abcdef', 'fedcba'], ['', 'x']]) {
  assert(Math.abs(rn.ratio(a, b) - py(a, b)) < 1e-9, a + '/' + b);
}
assert(rn.closeSpelling(['maldozhanova', 'zarina'], ['moldazhanova', 'zarina']));
assert(!rn.closeSpelling(['john', 'wood'], ['john', 'wool']), 'a differing part under 5 letters is not close spelling');
assert(!rn.closeSpelling(['jones'], ['johns']), 'one-part names never match loosely');

// Exact names, in any order, with hyphens, accents, curly apostrophes and possessives.
const s = [
  mk(1, 'Alycia Baumgardner retains title after war with Turhan'),
  mk(2, "Elif Nur Turhan's coach speaks out"),
  mk(3, 'Baumgardner Alycia weigh-in drama'),
  mk(4, 'Kim Su-hyeon wins again'),
  mk(5, 'Dricus du Plessis reacts'),
  mk(6, 'Conor O’Malley stays busy')
];
assert.deepStrictEqual(titles(s, ['Alycia Baumgardner']), ['Baumgardner Alycia weigh-in drama', 'Alycia Baumgardner retains title after war with Turhan']);
assert.deepStrictEqual(titles(s, ['Elif Nur Turhan']), ["Elif Nur Turhan's coach speaks out"]);
assert.deepStrictEqual(titles(s, ['Suhyeon Kim']), ['Kim Su-hyeon wins again']);
assert.deepStrictEqual(titles(s, ['Dricus Du Plessis']), ['Dricus du Plessis reacts']);
assert.deepStrictEqual(titles(s, ["Conor O'Malley"]), ['Conor O’Malley stays busy']);
assert.deepStrictEqual(titles([mk(1, 'Sergey Bilostenniy signs')], ['Sergei Bilostenniy']), ['Sergey Bilostenniy signs'], 'close spelling of one part');
assert.deepStrictEqual(titles([mk(1, 'José Aldo vs Jose Aldo')], ['Jose Aldo']).length, 1, 'accents fold');

// No guessing: surname alone, first name alone, one-word fighters and look-alike names show nothing.
assert.deepStrictEqual(titles(s, ['Jake Baumgardner']), []);
assert.deepStrictEqual(titles([mk(1, 'Baumgardner on top')], ['Alycia Baumgardner']), [], 'surname-only headline is not a match');
assert.deepStrictEqual(titles([mk(1, 'Alycia returns')], ['Alycia Baumgardner']), []);
assert.deepStrictEqual(titles([mk(1, 'Teremoana Teremoana fights')], ['Teremoana']), [], 'one-word names are not matchable');
assert.deepStrictEqual(titles([mk(1, 'John Wood wins')], ['John Wool']), [], 'differing part under 5 letters');
assert.deepStrictEqual(titles([mk(1, 'Carlos Hernandezz wins')], ['Carlos Hernandez']).length, 1);
assert.deepStrictEqual(titles([mk(1, 'Tom Aspinall and Jon Jones')], []), []);
assert.deepStrictEqual(rn.relatedNews(null, ['A B']), []);

// Latest three, newest first, any fighter on the card, one entry per story, matched names reported.
const many = [1, 2, 3, 4, 5].map(n => mk(n, 'Tom Aspinall update ' + n));
many.push(mk(9, 'Ciryl Gane and Tom Aspinall'));
many.push(mk(8, 'Unrelated story'));
const top = rn.relatedNews(many, ['Tom Aspinall', 'Ciryl Gane']);
assert.deepStrictEqual(top.map(r => r.story.title), ['Ciryl Gane and Tom Aspinall', 'Tom Aspinall update 5', 'Tom Aspinall update 4']);
assert.deepStrictEqual(top[0].matched, ['Tom Aspinall', 'Ciryl Gane']);
assert.strictEqual(rn.relatedNews(many, ['Tom Aspinall'], 2).length, 2);
const dup = [mk(1, 'Tom Aspinall one'), { ...mk(1, 'Tom Aspinall one again'), publishedAt: '2026-11-11T00:00:00Z' }];
assert.strictEqual(rn.relatedNews(dup, ['Tom Aspinall']).length, 1, 'same url is shown once');

// Source link and date are required: a story without either is never shown.
const bad = [mk(1, 'Tom Aspinall no date', { publishedAt: '' }), mk(2, 'Tom Aspinall http link', { url: 'http://x.test/2' }), mk(3, 'Tom Aspinall no source', { source: '' }), mk(4, 'Tom Aspinall good')];
assert.deepStrictEqual(titles(bad, ['Tom Aspinall']), ['Tom Aspinall good']);

// Markup escapes everything, links out safely and shows the date and source.
const html = rn.relatedHTML(rn.relatedNews([mk(1, '<b>Tom Aspinall</b> & co', { source: 'A&B' })], ['Tom Aspinall']), h, { when: () => '10 Nov' });
assert(!html.includes('<b>Tom') && html.includes('&lt;b&gt;Tom Aspinall&lt;/b&gt; &amp; co') && html.includes('A&amp;B') && html.includes('10 Nov'));
assert(html.includes('target="_blank"') && html.includes('rel="noopener noreferrer"') && html.includes('datetime="2026-11-10T01:00:00.000Z"'));
assert(!html.includes('rn-names'), 'matched names are shown only when asked');
assert(rn.relatedHTML(rn.relatedNews([mk(1, 'Tom Aspinall x')], ['Tom Aspinall']), h, { showNames: true }).includes('rn-names'));
assert.strictEqual(rn.relatedHTML([], h), '');
assert.strictEqual(rn.relatedHTML(null, h), '');

console.log('related-news tests passed');
