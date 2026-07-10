const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeGoogleRow, mergeOptions } = require('../lib/merge');

const query = { origin: 'Miami', dest: 'Bogota', departDate: '2026-08-13', returnDate: null };

test('normalizeGoogleRow converts EUR→USD, marks approx, builds a booking URL', () => {
  const row = { source: 'google_flights', origin: 'Miami', dest: 'Bogota', date: '2026-08-13',
    price_eur: 100, stops: 1, airline: 'Avianca', durationMin: 300,
    depAirport: 'Miami', depTime: '9:00 AM', arrAirport: 'Bogota', arrTime: '2:00 PM' };
  const o = normalizeGoogleRow(row, query);
  assert.equal(o.source, 'google');
  assert.equal(o.priceUsd, 108);         // 100 * 1.08
  assert.equal(o.approxPrice, true);
  assert.equal(o.stops, 1);
  assert.match(o.bookingUrl, /google\.com\/travel\/flights/);
});

test('mergeOptions filters over-ceiling, ranks by price, caps at 5', () => {
  const agentOptions = [
    { source: 'kiwi', priceUsd: 147, approxPrice: false, airline: 'Copa', route: ['MIA','PTY','BOG'], stops: 1, durationMin: 342, depTime: '06:24', arrTime: '11:06', bookingUrl: 'https://kiwi.com/u/a' },
    { source: 'lastminute', priceUsd: 160, approxPrice: false, airline: 'Avianca', route: ['MIA','BOG'], stops: 0, durationMin: 200, depTime: '08:00', arrTime: '11:20', bookingUrl: 'https://lastminute.com/b' },
    { source: 'kiwi', priceUsd: 999, approxPrice: false, airline: 'Slow', route: ['MIA','X','BOG'], stops: 1, durationMin: 6000 /* 100h > ceiling */, depTime: '01:00', arrTime: '05:00', bookingUrl: 'https://kiwi.com/u/c' },
  ];
  const googleRows = [
    { source: 'google_flights', price_eur: 120, stops: 1, airline: 'LATAM', durationMin: 400, depTime: '10:00', arrTime: '4:00 PM', origin: 'Miami', dest: 'Bogota', date: '2026-08-13' },
  ];
  const out = mergeOptions({ googleRows, agentOptions, query });
  assert.ok(out.length <= 5);
  // Cheapest first: google row normalizes to 120 EUR * 1.08 = 129.6 -> round 130 USD,
  // which is genuinely cheaper than kiwi's $147 and under the 24h ceiling (400min).
  assert.equal(out[0].priceUsd, 130);
  assert.ok(!out.some(o => o.durationMin > 24 * 60));       // over-ceiling removed
  const sources = new Set(out.map(o => o.source));
  assert.ok(sources.size >= 2);                             // source diversity
});

test('round-trip: normalize carries tripType + a "through" booking URL', () => {
  const rt = { origin: 'Miami', dest: 'Bogota', departDate: '2026-08-13', returnDate: '2026-08-20' };
  const row = { source: 'google_flights', origin: 'Miami', dest: 'Bogota', date: '2026-08-13',
    returnDate: '2026-08-20', price_eur: 300, stops: 0, airline: 'Avianca', durationMin: 300,
    depTime: '9:00 AM', arrTime: '2:00 PM', tripType: 'roundtrip', legDetails: 'outbound-only' };
  const o = normalizeGoogleRow(row, rt);
  assert.equal(o.tripType, 'roundtrip');
  assert.equal(o.legDetails, 'outbound-only');
  assert.equal(o.returnDate, '2026-08-20');
  assert.match(o.bookingUrl, /through/);                    // round-trip booking link
});

test('mergeOptions drops Google rows whose trip type != the requested trip type', () => {
  const rt = { origin: 'Miami', dest: 'Bogota', departDate: '2026-08-13', returnDate: '2026-08-20' };
  const googleRows = [
    // A stray ONE-WAY label at half the price must NOT undercut the round-trip total.
    { source: 'google_flights', price_eur: 120, stops: 1, airline: 'Cheap OW', durationMin: 400,
      depTime: '10:00', arrTime: '4:00 PM', origin: 'Miami', dest: 'Bogota', date: '2026-08-13',
      returnDate: null, tripType: 'oneway', legDetails: 'full' },
    { source: 'google_flights', price_eur: 300, stops: 0, airline: 'RT Fair', durationMin: 300,
      depTime: '08:00', arrTime: '1:00 PM', origin: 'Miami', dest: 'Bogota', date: '2026-08-13',
      returnDate: '2026-08-20', tripType: 'roundtrip', legDetails: 'outbound-only' },
  ];
  const out = mergeOptions({ googleRows, agentOptions: [], query: rt });
  assert.ok(out.every((o) => o.tripType === 'roundtrip'));   // one-way stray removed
  assert.ok(out.some((o) => o.airline === 'RT Fair'));
  assert.ok(!out.some((o) => o.airline === 'Cheap OW'));
});
