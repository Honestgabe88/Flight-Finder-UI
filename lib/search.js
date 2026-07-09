// Orchestrator: run the Google Flights provider across MANY origins x dates,
// then filter (<=MAXH hours), dedupe, rank by price, and emit normalized JSON + a summary.
//
//   node scripts/search.js
//   ORIGINS="Paris,London,Madrid" DATES="2026-08-11,2026-08-13" MAXH=24 CONC=3 node scripts/search.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const { searchOne } = require('./gflights');

const ORIGINS = (process.env.ORIGINS || 'Paris,London,Madrid,Lisbon,Frankfurt,Amsterdam,Dublin,Rome').split(',').map((s) => s.trim());
const DEST = process.env.DEST || 'Miami';
const DATES = (process.env.DATES || '2026-08-11,2026-08-13').split(',').map((s) => s.trim());
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
  for (const o of ORIGINS) for (const d of DATES) combos.push({ o, d });
  const t0 = Date.now();
  process.stderr.write(`Searching ${DEST} from ${ORIGINS.length} origins x ${DATES.length} dates = ${combos.length} combos (conc ${CONC})\n`);

  const res = await pool(combos, CONC, async ({ o, d }) => {
    const r = await searchOne(browser, o, DEST, d).catch((e) => ({ origin: o, date: d, error: String(e), rows: [] }));
    process.stderr.write(`  ${o.padEnd(10)} ${d}: ${r.error ? 'ERR ' + r.error : r.challenge ? 'CHALLENGE' : r.count + ' flights'}\n`);
    return r;
  });
  await browser.close();

  let all = res.flatMap((r) => r.rows || []);
  all = all.filter((r) => r.durationMin == null || r.durationMin <= MAXH * 60);
  const seen = new Map();
  for (const r of all) {
    const k = `${r.origin}|${r.date}|${r.airline}|${r.depTime}|${r.price_eur}`;
    if (!seen.has(k)) seen.set(k, r);
  }
  const dedup = [...seen.values()].sort((a, b) => a.price_eur - b.price_eur);

  const { CAPTURES_DIR, GFLIGHTS_FILE } = require('../config');
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });
  fs.writeFileSync(GFLIGHTS_FILE, JSON.stringify(dedup, null, 2));

  const issues = res.filter((r) => r.error || r.challenge).map((r) => `${r.origin} ${r.date}:${r.error ? 'ERR' : 'CHALLENGE'}`);
  console.log(`\n=== Google Flights -> ${DEST} | ${combos.length} combos | ${((Date.now() - t0) / 1000) | 0}s ===`);
  console.log(`Parsed ${all.length} flights (<=${MAXH}h), ${dedup.length} unique. Saved -> .captures/gflights_results.json`);
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
