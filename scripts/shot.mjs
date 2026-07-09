// Headless self-verification: load a URL, save a PNG. No display needed.
// Usage: node scripts/shot.mjs <url> <outfile.png>
import { chromium } from 'playwright';

const [, , url = 'about:blank', out = '/tmp/shot.png'] = process.argv;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`saved ${out}`);
