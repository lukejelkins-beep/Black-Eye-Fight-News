import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const SP = createRequire(import.meta.url)('../assets/fighter-stats-profile.js');
const doc = JSON.parse(readFileSync(new URL('../data/ufc-bonuses.json', import.meta.url)));
const cut = k => 'assets/img/ufc-cutouts/' + k + '.webp';

test('a fighter with no bonus gets no section', () => {
  assert.equal(SP.bonuses('nobody-here', doc, cut), '');
  assert.equal(SP.bonuses('alexandre-pantoja', null, cut), '');
});

test('each row shows the result badge and the other fighter, with initials when there is no cutout', () => {
  const html = SP.bonuses('alexandre-pantoja', doc, cut);
  const rows = doc.fighters['alexandre-pantoja'].bouts;
  assert.equal((html.match(/<li class=/g) || []).length, rows.length);
  assert.equal((html.match(/befn-power-result is-win/g) || []).length, rows.filter(b => b.outcome === 'W').length);
  assert.equal((html.match(/befn-power-result is-loss/g) || []).length, rows.filter(b => b.outcome === 'L').length);
  assert.match(html, /Estimated bonus earnings/);
  const none = SP.bonuses('alexandre-pantoja', doc, () => '');
  assert.equal((none.match(/bsp-cut is-none/g) || []).length, rows.length);
  assert.ok(!/<img/.test(none));
});

test('money is an estimate and unpriced awards show a dash', () => {
  const html = SP.bonuses('chris-weidman', doc, () => '');
  assert.match(html, /\d+ of 7 bonuses priced/);
  assert.match(html, /Earnings are an estimate/);
  assert.match(html, /bsp-bonus-est">—</);
});
