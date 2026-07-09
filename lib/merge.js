// Pure functions: no I/O, no network. Turn raw source data into ranked options.
const { EUR_TO_USD, MAXH } = require('../config');

function googleFlightsUrl(query) {
  const q = `Flights to ${query.dest} from ${query.origin} on ${query.departDate} one way`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=USD&hl=en`;
}

// A Google scraper row → shared option schema (price is EUR → approximate USD).
function normalizeGoogleRow(row, query) {
  return {
    source: 'google',
    priceUsd: Math.round(row.price_eur * EUR_TO_USD),
    approxPrice: true,
    airline: row.airline || 'Unknown',
    route: [row.depAirport || row.origin, row.arrAirport || row.dest].filter(Boolean),
    stops: row.stops ?? 0,
    durationMin: row.durationMin ?? null,
    depTime: row.depTime || null,
    arrTime: row.arrTime || null,
    bookingUrl: googleFlightsUrl(query),
  };
}

function underCeiling(o) {
  return o.durationMin == null || o.durationMin <= MAXH * 60;
}

function dedupeKey(o) {
  return `${o.source}|${o.airline}|${o.depTime}|${o.priceUsd}`;
}

// Ensure the final 5 shows ≥2 sources when possible: take cheapest overall, but
// guarantee at least one option from a second source is present.
function pickTop5(sorted) {
  const top = sorted.slice(0, 5);
  const sources = new Set(top.map((o) => o.source));
  if (sources.size >= 2 || sorted.length <= 5) return top;
  // Only one source in the top 5 but other sources exist deeper — swap the 5th
  // for the cheapest option from a different source.
  const other = sorted.find((o) => !sources.has(o.source));
  if (other) top[top.length - 1] = other;
  return top;
}

function mergeOptions({ googleRows = [], agentOptions = [], query }) {
  const google = googleRows.map((r) => normalizeGoogleRow(r, query));
  const all = [...agentOptions, ...google].filter(underCeiling);
  const seen = new Map();
  for (const o of all) if (!seen.has(dedupeKey(o))) seen.set(dedupeKey(o), o);
  const sorted = [...seen.values()].sort((a, b) => a.priceUsd - b.priceUsd);
  return pickTop5(sorted);
}

module.exports = { normalizeGoogleRow, mergeOptions, googleFlightsUrl };
