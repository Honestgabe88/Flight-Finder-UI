// Google Flights provider: stealth browser, consent-handling, full aria-label parse.
// Exports searchOne(browser, origin, dest, date) -> { ..., rows:[normalized] }
// CLI single run: node scripts/gflights.js "Paris" "Miami" 2026-08-13
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

// GF aria-labels carry the whole itinerary, e.g.:
// "From 517 euros. Nonstop flight with French bee. Leaves Paris Orly Airport at 5:00 PM on
//  Thursday, August 13 and arrives at Miami International Airport at 8:50 PM ... Total duration 9 hr 50 min."
function parseAria(al) {
  const price = (al.match(/From\s+([\d,]+)\s+euro/i) || [])[1];
  if (!price) return null;
  const stops = /Nonstop/i.test(al) ? 0 : parseInt((al.match(/(\d+)\s+stop/i) || [])[1] || '0', 10);
  const airline = (al.match(/flight with ([^.]+?)\./i) || [])[1];
  const depAirport = (al.match(/Leaves ([^.]+?) at /i) || [])[1];
  const depTime = (al.match(/Leaves [^.]+? at ([\d:]+\s?[AP]M)/i) || [])[1];
  const arrAirport = (al.match(/arrives at ([^.]+?) at /i) || [])[1];
  const arrTime = (al.match(/arrives at [^.]+? at ([\d:]+\s?[AP]M)/i) || [])[1];
  const dur = (al.match(/Total duration ([\dhrmin ]+?)\./i) || [])[1];
  let durationMin = null;
  if (dur) {
    const h = +((dur.match(/(\d+)\s*hr/) || [])[1] || 0);
    const m = +((dur.match(/(\d+)\s*min/) || [])[1] || 0);
    durationMin = h * 60 + m;
  }
  const layover = (al.match(/Layover \(([^)]+)\)/i) || [])[1] || null;
  return {
    price_eur: +price.replace(/,/g, ''), stops,
    airline: airline && airline.trim(), durationMin, duration: dur && dur.trim(),
    depAirport: depAirport && depAirport.trim(), depTime,
    arrAirport: arrAirport && arrAirport.trim(), arrTime, layover,
  };
}

async function searchOne(browser, origin, dest, date) {
  const url = `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${dest} from ${origin} on ${date} one way`)}&curr=EUR&hl=en&gl=US`;
  const ctx = await browser.newContext({ locale: 'en-US', timezoneId: 'America/New_York', userAgent: UA, viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  let challenge = false, error = null, rows = [];
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const consent = page.locator('button:has-text("Accept all"), button:has-text("Reject all"), form[action*="consent"] button, button[aria-label*="Accept"]');
    if (await consent.first().isVisible({ timeout: 6000 }).catch(() => false)) {
      await consent.first().click().catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
    await page.waitForSelector('[role="listitem"], li[aria-label]', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const head = await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '').catch(() => '');
    if (/unusual traffic|not a robot|recaptcha/i.test(head)) challenge = true;
    const labels = await page.evaluate(() => {
      const s = new Set();
      for (const el of document.querySelectorAll('[aria-label]')) {
        const al = el.getAttribute('aria-label') || '';
        if (/euro/i.test(al) && /(flight|nonstop|stop)/i.test(al)) s.add(al);
      }
      return [...s];
    }).catch(() => []);
    rows = labels.map(parseAria).filter(Boolean).map((r) => ({ source: 'google_flights', origin, dest, date, ...r }));
  } catch (e) { error = e.message.split('\n')[0]; }
  await ctx.close();
  return { origin, date, challenge, error, count: rows.length, rows };
}

module.exports = { searchOne, parseAria };

if (require.main === module) {
  (async () => {
    const [o = 'Paris', d = 'Miami', date = '2026-08-13'] = process.argv.slice(2);
    const b = await chromium.launch({ headless: true });
    console.log(JSON.stringify(await searchOne(b, o, d, date), null, 2));
    await b.close();
  })();
}
