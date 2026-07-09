const { test } = require('node:test');
const assert = require('node:assert');
const { extractOptions } = require('../lib/agentSearch');

test('extractOptions parses a bare JSON array', () => {
  const s = '[{"source":"kiwi","priceUsd":147,"bookingUrl":"https://kiwi.com/u/a"}]';
  const out = extractOptions(s);
  assert.equal(out.length, 1);
  assert.equal(out[0].priceUsd, 147);
});

test('extractOptions tolerates prose and code fences', () => {
  const s = 'Here are the flights I found:\n```json\n[{"source":"lastminute","priceUsd":160}]\n```\nHope that helps!';
  const out = extractOptions(s);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, 'lastminute');
});

test('extractOptions returns [] when there is no array', () => {
  assert.deepEqual(extractOptions('no json here'), []);
});
