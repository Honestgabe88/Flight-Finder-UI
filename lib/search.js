// Orchestrator: run the Google Flights provider across MANY origins x dates,
// then filter (<=MAXH hours), dedupe, rank by price, and emit normalized JSON + a summary.
// One-way by default; supply RETURN to search Google's own bundled ROUND-TRIP option.
//
//   node scripts/search.js
//   ORIGINS="Paris,London,Madrid" DATES="2026-08-11,2026-08-13" MAXH=24 CONC=3 node scripts/search.js
//   # round-trip, flexible return window (each of DATES x RETURN is priced):
//   ORIGINS="Miami" DEST="New Orleans" DATES="2026-08-23" RETURN="2026-09-10..2026-09-17" node scripts/search.js
//
// DATES and RETURN each accept: a single date, a csv list, or an inclusive range "start..end".
// No RETURN -> one-way. Two output files land in .captures/:
//   gflights_results.json  - the ranked, deduped rows (unchanged shape; bare array)
//   gflights_status.json   - per-search outcome sidecar (ok/challenge/error/empty) so an
//                            empty result is never mistaken for "Google had nothing".
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const { searchOne } = require('./gflights');

// Expand a date spec (single | "a,b,c" list | "start..end" inclusive range) into a sorted, unique yyyy-mm-dd list.
function expandDates(spec) {
  const out = [];
  for (const part of String(spec).split(',').map((s) => s.trim()).filter(Boolean)) {
    const range = part.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
    if (range) {
      const end = new Date(range[2] + 'T00:00:00Z');
      const d = new Date(range[1] + 'T00:00:00Z');
      if (isNaN(d) || isNaN(end) || d > end) throw new Error(`Bad date range: ${part}`);
      for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(part)) {
      out.push(part);
    } else {
      throw new Error(`Bad date: ${part} (want yyyy-mm-dd, a csv list, or start..end)`);
    }
  }
  return [...new Set(out)].sort();
}

const ORIGINS = (process.env.ORIGINS || 'Paris,London,Madrid,Lisbon,Frankfurt,Amsterdam,Dublin,Rome').split(',').map((s) => s.trim());
const DEST = process.env.DEST || 'Miami';
const DATES = expandDates(process.env.DATES || '2026-08-11,2026-08-13');
const RETURNS = process.env.RETURN ? expandDates(process.env.RETURN) : [null]; // [null] => one-way
const ROUND_TRIP = RETURNS[0] != null;
const CONC = +(process.env.CONC || 3);
const MAXH = +(process.env.MAXH || 24);

async function pool(items, n, worker) {
  const out = []; let i = 0;
  const run = async () => { while (i < items.length) { const k = i++; out[k] = await worker(items[k]); } };
  await Promise.all(Array.from({ length: n }, run));
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const combos = [];
  for (const o of ORIGINS) for (const d of DATES) for (const ret of RETURNS) combos.push({ o, d, ret });
  const t0 = Date.now();
  const shape = ROUND_TRIP
    ? `${ORIGINS.length} origins x ${DATES.length} dep x ${RETURNS.length} ret`
    : `${ORIGINS.length} origins x ${DATES.length} dates`;
  process.stderr.write(`Searching ${DEST} (${ROUND_TRIP ? 'round-trip' : 'one-way'}) from ${shape} = ${combos.length} combos (conc ${CONC})\n`);

  const res = await pool(combos, CONC, async ({ o, d, ret }) => {
    const r = await searchOne(browser, o, DEST, d, ret).catch((e) => ({ origin: o, date: d, returnDate: ret, error: String(e), rows: [] }));
    const tag = ret ? `${d}→${ret}` : d;
    process.stderr.write(`  ${o.padEnd(10)} ${tag}: ${r.error ? 'ERR ' + r.error : r.challenge ? 'CHALLENGE' : r.count + ' flights'}\n`);
    return r;
  });
  await browser.close();

  let all = res.flatMap((r) => r.rows || []);
  all = all.filter((r) => r.durationMin == null || r.durationMin <= MAXH * 60);
  const seen = new Map();
  for (const r of all) {
    const k = `${r.origin}|${r.date}|${r.returnDate || ''}|${r.airline}|${r.depTime}|${r.price_eur}`;
    if (!seen.has(k)) seen.set(k, r);
  }
  const dedup = [...seen.values()].sort((a, b) => a.price_eur - b.price_eur);

  const { CAPTURES_DIR, GFLIGHTS_FILE, GFLIGHTS_STATUS_FILE } = require('../config');
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });
  fs.writeFileSync(GFLIGHTS_FILE, JSON.stringify(dedup, null, 2));

  // Status sidecar: per-search outcome so an empty/blocked search is never invisible to a reader.
  const statusOf = (r) => (r.error ? 'error' : r.challenge ? 'challenge' : (r.rows || []).length ? 'ok' : 'empty');
  const searches = res.map((r) => ({
    origin: r.origin, date: r.date, returnDate: r.returnDate || null,
    status: statusOf(r), count: (r.rows || []).length, error: r.error || null,
  }));
  const summary = searches.reduce((a, s) => { a.total++; a[s.status]++; return a; },
    { total: 0, ok: 0, challenge: 0, error: 0, empty: 0 });
  const status = {
    generatedAt: new Date().toISOString(),
    tripType: ROUND_TRIP ? 'roundtrip' : 'oneway',
    dest: DEST, origins: ORIGINS, outboundDates: DATES, returnDates: ROUND_TRIP ? RETURNS : [],
    maxh: MAXH, summary, searches,
  };
  fs.writeFileSync(GFLIGHTS_STATUS_FILE, JSON.stringify(status, null, 2));

  const issues = res.filter((r) => r.error || r.challenge).map((r) => `${r.origin} ${r.date}${r.returnDate ? '→' + r.returnDate : ''}:${r.error ? 'ERR' : 'CHALLENGE'}`);
  console.log(`\n=== Google Flights -> ${DEST} (${ROUND_TRIP ? 'round-trip' : 'one-way'}) | ${combos.length} combos | ${((Date.now() - t0) / 1000) | 0}s ===`);
  console.log(`Parsed ${all.length} flights (<=${MAXH}h), ${dedup.length} unique. Saved -> .captures/gflights_results.json`);
  console.log(`Status: ${summary.ok} ok, ${summary.challenge} challenge, ${summary.error} error, ${summary.empty} empty. Saved -> .captures/gflights_status.json`);
  if (issues.length) console.log(`Issues: ${issues.join('  ')}`);
  console.log('\nCheapest 15:');
  console.log('PRICE   STOPS  DURATION    AIRLINE                 FROM            DATE        DEP');
  for (const r of dedup.slice(0, 15)) {
    console.log(
      `EUR ${String(r.price_eur).padEnd(5)} ${String(r.stops).padEnd(5)} ${String(r.duration || '-').padEnd(11)} ` +
      `${String(r.airline || '-').slice(0, 23).padEnd(23)} ${String(r.depAirport || r.origin).slice(0, 15).padEnd(15)} ${r.date}  ${r.depTime || ''}`
    );
  }
})();
