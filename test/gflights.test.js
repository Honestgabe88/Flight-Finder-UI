const { test } = require('node:test');
const assert = require('node:assert');
const { parseAria } = require('../lib/gflights');

test('parseAria extracts a normalized row from a Google Flights aria-label', () => {
  const al =
    'From 517 euros. Nonstop flight with French bee. Leaves Paris Orly Airport at ' +
    '5:00 PM on Thursday, August 13 and arrives at Miami International Airport at ' +
    '8:50 PM on Thursday, August 13. Total duration 9 hr 50 min.';
  const row = parseAria(al);
  assert.equal(row.price_eur, 517);
  assert.equal(row.stops, 0);
  assert.equal(row.airline, 'French bee');
  assert.equal(row.durationMin, 590);
  assert.match(row.depAirport, /Paris Orly/);
  assert.equal(row.depTime, '5:00 PM');
});
