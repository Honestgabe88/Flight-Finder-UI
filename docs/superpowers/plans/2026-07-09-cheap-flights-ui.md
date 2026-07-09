# Cheap Flights UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development-cc (recommended) or executing-plans-cc to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 4-page web UI (landing → form → loading → results) in front of the read-only `cheap_flights` project, where the search backend is a Claude agent (Kiwi + lastminute MCP tools) plus a vendored Google Flights scraper, merged and ranked server-side.

**Architecture:** A small Node.js server serves static vanilla HTML/CSS/JS pages. On `POST /search` it runs, in parallel, (a) the vendored deterministic Google Flights scraper and (b) a headless `claude -p` agent that calls the Kiwi + lastminute MCP tools; it merges/ranks all sources into a top-5 `results.json` that the results page renders. The loading page polls `GET /status` until the job finishes.

**Tech Stack:** Node.js 20 (built-in `http` + `node:test`, no web framework), vanilla HTML/CSS/JS, `playwright` + `playwright-extra` + `puppeteer-extra-plugin-stealth` (vendored scraper), `claude` CLI 2.1.197 (headless agent), `impeccable` skill (visual polish), headless Playwright for self-verification (no display in container).

**User decisions (already made):**
- "Keep Google Flights" — it competes for the top 5 alongside Kiwi + lastminute.
- Stack is plain HTML/CSS/JS, no framework — chosen so watching Claude Code build stays clean.
- Search backend is the agent-driven "Option C" (real multi-source + real booking links).
- Display currency is **USD**.
- Trips are **round-trip with the return date optional** (blank = one-way).
- Vibe: minimalist, fun, tongue-in-cheek. Landing = **pink rotating globe** + trilingual scrolling marquee.
- The marquee — `今度は今度、今は今` / `Kondo wa kondo, ima wa ima` / `Next time is Next time, Now is Now`, scrolling horizontally one after another — appears on **both** Landing and Loading.
- "minutes long search is fine" — no source cap needed.
- **Step 0 must be the headless-agent MCP-auth spike before any UI polish** (user-ordered gate).
- The backend at `/workspaces/other_project` is **read-only** — never written to; the scraper is copied out.

---

## File Structure

```
/workspaces/cheap_flights_UI/
  package.json              # deps + scripts (Task 0)
  .gitignore               # (Task 0)
  server.js                # static serving + POST /search + GET /status (Task 8)
  config.js                # shared constants: EUR_TO_USD, MAXH, ports, paths (Task 0)
  lib/
    gflights.js            # VENDORED backend scraper provider (Task 2)
    search.js              # VENDORED orchestrator, output path made configurable (Task 2)
    merge.js               # pure normalize + merge + filter + rank + top-5 (Task 3)
    agentSearch.js         # spawn `claude -p`, get normalized Kiwi+lastminute options (Task 4)
  scripts/
    spike-agent.sh         # Step 0 headless-agent MCP-auth probe (Task 1)
    shot.mjs               # headless Playwright: load a URL, assert DOM, save screenshot (Task 5)
  public/
    index.html             # landing (Task 6)
    search.html            # form (Task 7)
    loading.html           # loading + poll (Task 9)
    results.html           # results cards (Task 10)
    styles.css             # shared theme + marquee + globe (Task 5, extended per page)
    marquee.js             # builds the trilingual scrolling marquee (Task 5)
    app.js                 # small shared helpers (Task 7)
  .captures/
    results.json           # search output the UI reads (gitignored, written at runtime)
    sample-results.json    # committed fixture for page dev + tests (Task 5)
  test/
    merge.test.js          # unit tests for lib/merge.js (Task 3)
    agentSearch.test.js    # unit tests for output parsing (Task 4)
  docs/superpowers/
    specs/2026-07-09-cheap-flights-ui-design.md   # the approved spec (exists)
    plans/2026-07-09-cheap-flights-ui.md          # this plan
    spikes/2026-07-09-headless-agent-mcp.md       # spike verdict (Task 1)
```

### Normalized option schema (the contract every layer speaks)

```js
// One flight option, produced by lib/merge.js and consumed by results.html
{
  source: "kiwi" | "lastminute" | "google",
  priceUsd: 147,               // number, USD
  approxPrice: false,          // true only for google (converted from EUR)
  airline: "Copa Airlines",    // display string
  route: ["MIA", "PTY", "BOG"],// IATA codes incl. layovers
  stops: 1,                    // number
  durationMin: 342,            // total minutes
  depTime: "2026-08-13T06:24:00", // ISO local, or "HH:MM" if that's all we have
  arrTime: "2026-08-13T11:06:00",
  bookingUrl: "https://kiwi.com/u/jcgctqw" // real link (google = flights page)
}
```

### results.json envelope

```js
{
  status: "done" | "pending" | "error",
  query: { origin, dest, departDate, returnDate|null },
  generatedAt: "<ISO>",         // stamped by the server, not by a plan-time clock
  options: [ /* up to 5 option objects, cheapest first */ ],
  notes: [ "Kiwi/lastminute unavailable headless — see verdict", ... ] // honest caveats
}
```

---

### Task 0: Project scaffold & dependencies

**Goal:** A runnable Node project with the right dependencies, folder structure, and shared config — nothing UI yet.

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `config.js`
- Create: `.captures/.gitkeep`, `lib/.gitkeep`, `public/.gitkeep`, `scripts/.gitkeep`, `test/.gitkeep`

**Acceptance Criteria:**
- [ ] `npm ls` shows `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth` installed.
- [ ] `node -e "require('./config.js')"` prints nothing and exits 0.
- [ ] `node --test` runs (0 tests, exit 0) — confirms the test runner works.

**Verify:** `npm ls --depth=0 && node --test` → dependencies listed, test runner exits 0.

**Steps:**

- [ ] **Step 1: Initialize package.json**

Create `package.json`:
```json
{
  "name": "cheap-flights-ui",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "start": "node server.js",
    "test": "node --test",
    "spike": "bash scripts/spike-agent.sh"
  },
  "dependencies": {
    "playwright": "^1.61.1",
    "playwright-extra": "^4.3.6",
    "puppeteer-extra-plugin-stealth": "^2.11.2"
  }
}
```

- [ ] **Step 2: Install dependencies and the Chromium browser**

Run: `cd /workspaces/cheap_flights_UI && npm install && npx playwright install chromium`
Expected: `node_modules/` populated; Chromium downloaded (or "is already installed").

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
.captures/results.json
.captures/gflights_results.json
*.log
.DS_Store
```

- [ ] **Step 4: Create `config.js`**

```js
// Shared constants. Keep everything tunable in ONE place.
const path = require('path');

module.exports = {
  PORT: Number(process.env.PORT || 5173),
  // Approximate EUR→USD rate for Google Flights prices (scraper is EUR-locked).
  // Honest, fixed, and clearly labeled as approximate in the UI.
  EUR_TO_USD: Number(process.env.EUR_TO_USD || 1.08),
  // Route-scaled travel-time ceiling (hours). Coarse single tier for v1.
  MAXH: Number(process.env.MAXH || 24),
  // Where our search output lives (in OUR folder — never the read-only backend).
  CAPTURES_DIR: path.join(__dirname, '.captures'),
  RESULTS_FILE: path.join(__dirname, '.captures', 'results.json'),
  GFLIGHTS_FILE: path.join(__dirname, '.captures', 'gflights_results.json'),
  // Read-only backend location (we only ever READ from here).
  BACKEND_DIR: '/workspaces/other_project',
};
```

- [ ] **Step 5: Create the folder skeleton**

Run: `mkdir -p lib public scripts test .captures && touch lib/.gitkeep public/.gitkeep scripts/.gitkeep test/.gitkeep .captures/.gitkeep`

- [ ] **Step 6: Verify and commit**

Run: `npm ls --depth=0 && node --test`
Expected: three deps listed; test runner exits 0 with no tests.
```bash
git init 2>/dev/null; git add -A && git commit -m "chore: scaffold cheap-flights-ui project"
```

---

### Task 1: Step 0 — Headless-agent MCP-auth spike (USER-ORDERED GATE)

**Goal:** Prove whether a `claude -p` agent launched headlessly (as the server will launch it) can reach the claude.ai-authenticated Kiwi/lastminute MCP tools and return a real booking URL — and record a written verdict that decides the search-backend path. **No page-styling task (Tasks 6, 7, 9, 10) may start until this verdict is recorded.**

> **USER-ORDERED GATE — NON-SKIPPABLE.** This task was requested by the user in the current conversation. It MUST NOT be closed by walking around it, by declaring it "verified inline", or by substituting a cheaper check. Close only after every item in `acceptanceCriteria` has been re-validated independently, with output captured.

**Files:**
- Create: `scripts/spike-agent.sh`
- Create: `docs/superpowers/spikes/2026-07-09-headless-agent-mcp.md`

**Acceptance Criteria:**
- [ ] Running `bash scripts/spike-agent.sh` executes a real `claude -p` headless run for a fixed route (MIA→BOG, 13/08/2026) and captures its raw stdout to a file.
- [ ] The verdict doc records GREEN or RED with the captured evidence pasted in:
      - **GREEN** = the headless run returned at least one itinerary containing a `bookingUrl`/booking link.
      - **RED** = it did not (auth/tool unavailable), with the exact error captured.
- [ ] The verdict doc states the resulting decision: GREEN → background-agent runner (Task 4 path A); RED → in-session fallback (Task 4 path B), still producing real booking links but with a human-in-the-loop step.

**Verify:** `bash scripts/spike-agent.sh; cat docs/superpowers/spikes/2026-07-09-headless-agent-mcp.md` → verdict line present (GREEN or RED) with captured stdout.

**Steps:**

- [ ] **Step 1: Write the spike script**

Create `scripts/spike-agent.sh`:
```bash
#!/usr/bin/env bash
# Step 0 spike: can a HEADLESS `claude -p` run reach the Kiwi MCP tool and
# return a booking URL? This mirrors how server.js will launch the agent.
set -uo pipefail
OUT="$(dirname "$0")/../.captures/spike-agent-out.txt"
mkdir -p "$(dirname "$OUT")"

PROMPT='Use the Kiwi.com MCP flight-search tool (mcp__claude_ai_Kiwi_com__search-flight) to search one-way flights from Miami (MIA) to Bogota (BOG) departing 13/08/2026, currency USD. Then output ONLY a compact JSON object: {"count": <number of itineraries>, "cheapest": {"priceUsd": <number>, "bookingUrl": "<url>"}}. No prose, no markdown fences.'

echo "Running headless claude -p ... (this may take a minute)"
# --print: non-interactive. We rely on the SAME account MCP config the interactive
# session uses; do NOT pass --strict-mcp-config (that would exclude account servers).
claude --print --output-format text --model claude-sonnet-5 "$PROMPT" 2>&1 | tee "$OUT"

echo ""
echo "----- raw output saved to $OUT -----"
if grep -qiE 'bookingUrl|kiwi\.com/u/|http' "$OUT"; then
  echo "SPIKE RESULT: GREEN (a booking URL appeared in headless output)"
else
  echo "SPIKE RESULT: RED (no booking URL — MCP likely unavailable headless)"
fi
```

- [ ] **Step 2: Make it executable and run it**

Run: `chmod +x scripts/spike-agent.sh && bash scripts/spike-agent.sh`
Expected: either a JSON object containing a `bookingUrl` (GREEN) or an error/empty (RED). Either outcome is a valid, informative result — do not "fix" a RED by faking data.

- [ ] **Step 3: Record the verdict**

Create `docs/superpowers/spikes/2026-07-09-headless-agent-mcp.md` with: the date, the exact command run, the pasted raw stdout from `.captures/spike-agent-out.txt`, the verdict line (`VERDICT: GREEN` or `VERDICT: RED`), and the decision:
- GREEN → "Task 4 implements path A: server spawns `claude -p` per search."
- RED → "Task 4 implements path B: `agentSearch.js` returns a clearly-marked 'needs in-session run' status; during pairing, Claude runs the MCP search in-session and writes the options file. Google scraper still runs headlessly. Booking links remain real."

- [ ] **Step 4: Commit**

```bash
git add scripts/spike-agent.sh docs/superpowers/spikes/2026-07-09-headless-agent-mcp.md
git commit -m "spike: headless-agent MCP-auth probe + verdict"
```

---

### Task 2: Vendor & adapt the Google Flights scraper

**Goal:** Copy the deterministic Google Flights scraper out of the read-only backend into `lib/`, and make its output path configurable so it writes into OUR `.captures/` — never the backend.

**Files:**
- Create: `lib/gflights.js` (verbatim copy of `/workspaces/other_project/scripts/gflights.js`)
- Create: `lib/search.js` (copy of backend `scripts/search.js`, with the output path changed)
- Test: `test/gflights.test.js`

**Acceptance Criteria:**
- [ ] `lib/gflights.js` is a byte-for-byte copy of the backend provider (we didn't modify vendored logic).
- [ ] `lib/search.js` writes to `config.GFLIGHTS_FILE` (our `.captures/`), not the backend's `.captures/`.
- [ ] `node --test test/gflights.test.js` passes — `parseAria` correctly parses a known aria-label into a normalized row.

**Verify:** `node --test test/gflights.test.js` → 1 test passing.

**Steps:**

- [ ] **Step 1: Copy the provider verbatim**

Run: `cp /workspaces/other_project/scripts/gflights.js /workspaces/cheap_flights_UI/lib/gflights.js`
(We read from the read-only backend and copy OUT. We never write into `/workspaces/other_project`.)

- [ ] **Step 2: Copy the orchestrator and repoint its output + provider path**

Run: `cp /workspaces/other_project/scripts/search.js /workspaces/cheap_flights_UI/lib/search.js`

Then edit `lib/search.js`:
- Change the provider require from `require('./gflights')` — it already resolves to our `lib/gflights.js` since both are in `lib/`. Leave as-is.
- Replace the hardcoded output block. Find:
```js
  const outDir = path.join(__dirname, '..', '.captures');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'gflights_results.json'), JSON.stringify(dedup, null, 2));
```
Replace with:
```js
  const { CAPTURES_DIR, GFLIGHTS_FILE } = require('../config');
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });
  fs.writeFileSync(GFLIGHTS_FILE, JSON.stringify(dedup, null, 2));
```

- [ ] **Step 3: Write the failing test for `parseAria`**

Create `test/gflights.test.js`:
```js
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
```

- [ ] **Step 4: Run the test**

Run: `node --test test/gflights.test.js`
Expected: PASS (the vendored `parseAria` already implements this).

- [ ] **Step 5: Commit**

```bash
git add lib/gflights.js lib/search.js test/gflights.test.js
git commit -m "feat: vendor Google Flights scraper, output into our .captures"
```

---

### Task 3: Pure normalize + merge + rank module

**Goal:** A dependency-free module that turns raw Google rows and agent-supplied Kiwi/lastminute options into the shared option schema, applies the travel-time ceiling, dedupes, ranks by USD price, ensures source diversity, and returns the top 5.

**Files:**
- Create: `lib/merge.js`
- Test: `test/merge.test.js`

**Acceptance Criteria:**
- [ ] `normalizeGoogleRow(row)` converts a scraper row to an option: `priceUsd = round(price_eur * EUR_TO_USD)`, `approxPrice = true`, `source = "google"`, builds a Google Flights page URL as `bookingUrl`.
- [ ] `mergeOptions({ googleRows, agentOptions, query })` filters out options over the `MAXH` ceiling, dedupes, sorts ascending by `priceUsd`, and returns at most 5.
- [ ] When ≥2 sources are available, the top-5 contains at least 2 distinct `source` values (source diversity), satisfying the ≥2-source rule.
- [ ] `node --test test/merge.test.js` passes.

**Verify:** `node --test test/merge.test.js` → all tests passing.

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `test/merge.test.js`:
```js
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
  assert.equal(out[0].priceUsd, 147);                       // cheapest first
  assert.ok(!out.some(o => o.durationMin > 24 * 60));       // over-ceiling removed
  const sources = new Set(out.map(o => o.source));
  assert.ok(sources.size >= 2);                             // source diversity
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `node --test test/merge.test.js`
Expected: FAIL ("Cannot find module '../lib/merge'").

- [ ] **Step 3: Implement `lib/merge.js`**

```js
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
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test test/merge.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/merge.js test/merge.test.js
git commit -m "feat: pure normalize/merge/rank module with source diversity"
```

---

### Task 4: Agent search runner (Kiwi + lastminute via `claude -p`)

**Goal:** A module that, given a route + dates, obtains normalized Kiwi/lastminute options. Path A (spike GREEN): spawn a headless `claude -p` agent. Path B (spike RED): return a clearly-marked "needs in-session run" status so the pairing session can fill it in. Also a pure parser (unit-tested) that extracts the JSON array from agent stdout.

**Files:**
- Create: `lib/agentSearch.js`
- Test: `test/agentSearch.test.js`

**Acceptance Criteria:**
- [ ] `extractOptions(stdout)` finds and parses the JSON array in an agent's text output (tolerating surrounding prose or ```` ```json ```` fences) and returns an array of option objects; returns `[]` on no parseable array.
- [ ] `runAgentSearch(query)` (Path A) builds a prompt instructing the agent to call both MCP tools and emit ONLY the JSON array in our schema, spawns `claude --print`, and resolves to the parsed options; on non-zero exit or empty parse it resolves to `{ options: [], note: <reason> }`.
- [ ] The path (A vs B) is selected by reading the Task 1 verdict file; if the verdict is RED, `runAgentSearch` short-circuits to `{ options: [], note: "in-session run required (spike RED)" }` without spawning.
- [ ] `node --test test/agentSearch.test.js` passes.

**Verify:** `node --test test/agentSearch.test.js` → parser tests passing.

**Steps:**

- [ ] **Step 1: Write failing parser tests**

Create `test/agentSearch.test.js`:
```js
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
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test test/agentSearch.test.js`
Expected: FAIL ("Cannot find module '../lib/agentSearch'").

- [ ] **Step 3: Implement `lib/agentSearch.js`**

```js
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const VERDICT_FILE = path.join(__dirname, '..', 'docs', 'superpowers', 'spikes',
  '2026-07-09-headless-agent-mcp.md');

// Least-privilege allowlist: the headless agent may call ONLY these two read-only
// flight-search MCP tools. Everything else stays behind the permission gate a
// `--print` subprocess cannot satisfy, so a prompt-injection via the search fields
// cannot escalate to Bash/file access.
const ALLOWED_MCP_TOOLS = 'mcp__claude_ai_Kiwi_com__search-flight,mcp__claude_ai_lastminute_com__search_flights';

// Extract the first top-level JSON array from arbitrary agent text output.
function extractOptions(stdout) {
  if (!stdout) return [];
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  const slice = stdout.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// dd/mm/yyyy for Kiwi; the agent is told the format explicitly too.
function toDMY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function buildPrompt(query) {
  const ret = query.returnDate ? ` Return date ${toDMY(query.returnDate)} (dd/mm/yyyy).` : ' One-way.';
  return [
    `Search flights from ${query.origin} to ${query.dest} departing ${toDMY(query.departDate)} (dd/mm/yyyy).${ret}`,
    `Currency USD. Call BOTH the Kiwi.com MCP tool (mcp__claude_ai_Kiwi_com__search-flight)`,
    `and the lastminute.com MCP tool (mcp__claude_ai_lastminute_com__search_flights).`,
    `Then output ONLY a JSON array (no prose, no code fences). Each element:`,
    `{"source":"kiwi"|"lastminute","priceUsd":<number>,"approxPrice":false,"airline":<string>,`,
    `"route":[<IATA codes>],"stops":<number>,"durationMin":<number>,"depTime":<ISO>,"arrTime":<ISO>,`,
    `"bookingUrl":<string>}. Include up to the 8 cheapest per source.`,
  ].join(' ');
}

function spikeIsGreen() {
  try {
    return /VERDICT:\s*GREEN/i.test(fs.readFileSync(VERDICT_FILE, 'utf8'));
  } catch {
    return false; // no verdict yet → treat as not-green (safe)
  }
}

// Path A: spawn headless claude -p. Resolves to { options, note }.
function runAgentSearch(query, { timeoutMs = 5 * 60 * 1000 } = {}) {
  if (!spikeIsGreen()) {
    return Promise.resolve({ options: [], note: 'in-session run required (spike RED or not yet run)' });
  }
  const prompt = buildPrompt(query);
  return new Promise((resolve) => {
    const child = spawn('claude', ['--print', '--output-format', 'text', '--model', 'claude-sonnet-5',
      `--allowedTools=${ALLOWED_MCP_TOOLS}`, prompt],
      { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      const options = extractOptions(out);
      if (options.length) resolve({ options, note: null });
      else resolve({ options: [], note: `agent returned no options (exit ${code})${err ? ': ' + err.slice(0, 200) : ''}` });
    });
    child.on('error', (e) => { clearTimeout(timer); resolve({ options: [], note: `spawn failed: ${e.message}` }); });
  });
}

module.exports = { extractOptions, runAgentSearch, buildPrompt, toDMY };
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `node --test test/agentSearch.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/agentSearch.js test/agentSearch.test.js
git commit -m "feat: agent search runner + robust output parser (spike-gated path)"
```

---

### Task 5: Static server foundation, shared theme, marquee & screenshot harness

**Goal:** A Node server that serves `public/`, a committed `sample-results.json` fixture, the shared CSS theme (pink, CJK-capable font stack), the reusable trilingual marquee component, and a headless-Playwright screenshot script for self-verification.

**Files:**
- Create: `server.js` (static serving only for now; search routes added in Task 8)
- Create: `public/styles.css`
- Create: `public/marquee.js`
- Create: `.captures/sample-results.json`
- Create: `scripts/shot.mjs`

**Acceptance Criteria:**
- [ ] `node server.js` serves `public/index.html` at `http://localhost:PORT/` (once index exists) and returns 404 for unknown paths.
- [ ] `scripts/shot.mjs <url> <outfile>` loads a URL headlessly and writes a PNG — the self-verification tool for all page tasks.
- [ ] `buildMarquee()` in `marquee.js` renders all three phrases (`今度は今度、今は今`, `Kondo wa kondo, ima wa ima`, `Next time is Next time, Now is Now`) in a horizontally scrolling, looping strip.
- [ ] `.captures/sample-results.json` matches the results.json envelope with 5 realistic options (one per source at minimum), for page development without running a live search.

**Verify:** `node scripts/shot.mjs about:blank /tmp/blank.png && ls -l /tmp/blank.png` → PNG created (proves the harness works before pages exist).

**Steps:**

- [ ] **Step 1: Static server**

Create `server.js`:
```js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { PORT } = require('./config');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  // Search routes (POST /search, GET /status) are added in Task 8.
  serveStatic(req, res);
});

server.listen(PORT, () => console.log(`Cheap Flights UI on http://localhost:${PORT}`));
module.exports = { server };
```

- [ ] **Step 2: Shared theme CSS**

Create `public/styles.css`:
```css
:root {
  --pink: #ff4fa3;
  --pink-soft: #ffd9ec;
  --ink: #1a1a1a;
  --paper: #fffafd;
  --font: -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
  /* CJK-capable stack so 今度は今度、今は今 renders cleanly */
  --font-cjk: "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", var(--font);
}
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font); color: var(--ink); background: var(--paper); }
.btn {
  display: inline-block; padding: 0.9rem 2rem; border: none; border-radius: 999px;
  background: var(--pink); color: white; font-size: 1.1rem; cursor: pointer;
  text-decoration: none; transition: transform .12s ease, box-shadow .12s ease;
}
.btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(255,79,163,.35); }

/* Trilingual marquee — three phrases scrolling horizontally, one after another */
.marquee { overflow: hidden; white-space: nowrap; width: 100%; }
.marquee__track { display: inline-block; padding-left: 100%; animation: marquee 22s linear infinite; }
.marquee__phrase { display: inline-block; margin: 0 2.5rem; font-size: 1.4rem; color: var(--pink); }
.marquee__phrase--cjk { font-family: var(--font-cjk); }
@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-100%); } }
@media (prefers-reduced-motion: reduce) { .marquee__track { animation: none; } }
```

- [ ] **Step 3: Reusable marquee component**

Create `public/marquee.js`:
```js
// Builds the trilingual scrolling marquee used on landing + loading.
// The three phrases all mean the same thing; they scroll by one after another.
window.buildMarquee = function buildMarquee(mountSelector) {
  const phrases = [
    { text: '今度は今度、今は今', cjk: true },
    { text: 'Kondo wa kondo, ima wa ima', cjk: false },
    { text: 'Next time is Next time, Now is Now', cjk: false },
  ];
  const mount = document.querySelector(mountSelector);
  if (!mount) return;
  const wrap = document.createElement('div');
  wrap.className = 'marquee';
  const track = document.createElement('div');
  track.className = 'marquee__track';
  // Duplicate the sequence so the loop reads continuously.
  for (let i = 0; i < 2; i++) {
    for (const p of phrases) {
      const span = document.createElement('span');
      span.className = 'marquee__phrase' + (p.cjk ? ' marquee__phrase--cjk' : '');
      span.textContent = p.text;
      track.appendChild(span);
    }
  }
  wrap.appendChild(track);
  mount.appendChild(wrap);
};
```

- [ ] **Step 4: Sample results fixture**

Create `.captures/sample-results.json`:
```json
{
  "status": "done",
  "query": { "origin": "Miami", "dest": "Bogota", "departDate": "2026-08-13", "returnDate": null },
  "generatedAt": "2026-07-09T00:00:00.000Z",
  "options": [
    { "source": "kiwi", "priceUsd": 147, "approxPrice": false, "airline": "Copa Airlines", "route": ["MIA","PTY","BOG"], "stops": 1, "durationMin": 342, "depTime": "2026-08-13T06:24:00", "arrTime": "2026-08-13T11:06:00", "bookingUrl": "https://kiwi.com/u/jcgctqw" },
    { "source": "lastminute", "priceUsd": 158, "approxPrice": false, "airline": "Avianca", "route": ["MIA","BOG"], "stops": 0, "durationMin": 205, "depTime": "2026-08-13T08:00:00", "arrTime": "2026-08-13T11:25:00", "bookingUrl": "https://www.lastminute.com/flights/deal/example" },
    { "source": "google", "priceUsd": 162, "approxPrice": true, "airline": "LATAM", "route": ["MIA","BOG"], "stops": 0, "durationMin": 210, "depTime": "10:00 AM", "arrTime": "1:30 PM", "bookingUrl": "https://www.google.com/travel/flights?q=Flights%20to%20Bogota%20from%20Miami%20on%202026-08-13%20one%20way&curr=USD&hl=en" },
    { "source": "kiwi", "priceUsd": 171, "approxPrice": false, "airline": "Copa Airlines", "route": ["MIA","PTY","BOG"], "stops": 1, "durationMin": 401, "depTime": "2026-08-13T17:14:00", "arrTime": "2026-08-13T22:55:00", "bookingUrl": "https://kiwi.com/u/pzb58h" },
    { "source": "lastminute", "priceUsd": 189, "approxPrice": false, "airline": "American Airlines", "route": ["MIA","BOG"], "stops": 0, "durationMin": 200, "depTime": "2026-08-13T19:30:00", "arrTime": "2026-08-13T22:50:00", "bookingUrl": "https://www.lastminute.com/flights/deal/example2" }
  ],
  "notes": []
}
```

- [ ] **Step 5: Screenshot harness**

Create `scripts/shot.mjs`:
```js
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
```

- [ ] **Step 6: Verify the harness and commit**

Run: `node scripts/shot.mjs about:blank /tmp/blank.png && ls -l /tmp/blank.png`
Expected: `saved /tmp/blank.png` and a non-zero PNG file.
```bash
git add server.js public/styles.css public/marquee.js .captures/sample-results.json scripts/shot.mjs
git commit -m "feat: static server, theme, trilingual marquee, screenshot harness"
```

---

### Task 6: Landing page

**Goal:** The landing page — a pink, slowly rotating globe, the trilingual scrolling marquee, and a single button through to the search form. Polished with the `impeccable` skill.

**Files:**
- Create: `public/index.html`

**Acceptance Criteria:**
- [ ] `http://localhost:PORT/` shows a pink rotating globe (CSS animation), the marquee with all three phrases, and a button linking to `/search.html`.
- [ ] A screenshot via `scripts/shot.mjs` shows the globe + at least one of the marquee phrases.
- [ ] The page uses `impeccable` for visual refinement (spacing, type scale, the tongue-in-cheek tone).

**Verify:** `node server.js &` then `node scripts/shot.mjs http://localhost:5173/ /tmp/landing.png` → PNG shows globe + marquee; DOM assert (below) passes.

**Steps:**

- [ ] **Step 1: Write the landing HTML**

Create `public/index.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Now is Now — cheap flights</title>
  <link rel="stylesheet" href="/styles.css" />
  <style>
    .hero { min-height: 100vh; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 2rem; text-align: center; }
    .globe { width: 160px; height: 160px; border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, #ff8cc6, var(--pink) 60%, #d81b78);
      box-shadow: inset -12px -12px 30px rgba(0,0,0,.25), 0 10px 30px rgba(255,79,163,.4);
      position: relative; overflow: hidden; animation: spin 12s linear infinite; }
    .globe::before, .globe::after { content: ""; position: absolute; inset: 0;
      background: repeating-linear-gradient(90deg, transparent 0 18px, rgba(255,255,255,.18) 18px 20px);
      border-radius: 50%; }
    .globe::after { background: repeating-linear-gradient(0deg, transparent 0 22px, rgba(255,255,255,.12) 22px 24px); }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .globe { animation: none; } }
    .tagline { color: var(--pink); font-weight: 600; letter-spacing: .02em; }
  </style>
</head>
<body>
  <main class="hero">
    <div class="globe" role="img" aria-label="Pink spinning globe"></div>
    <div id="marquee-mount" style="width:100%"></div>
    <p class="tagline">Stop saying next time.</p>
    <a class="btn" href="/search.html">Find me a flight →</a>
  </main>
  <script src="/marquee.js"></script>
  <script>buildMarquee('#marquee-mount');</script>
</body>
</html>
```

- [ ] **Step 2: Verify with a screenshot + DOM assert**

Run:
```bash
node server.js & SRV=$!; sleep 1
node scripts/shot.mjs http://localhost:5173/ /tmp/landing.png
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:5173/');const g=await p.locator('.globe').count();const m=await p.locator('.marquee__phrase').count();const btn=await p.locator('a.btn').getAttribute('href');console.log({globe:g,phrases:m,btn});if(g<1||m<3||btn!=='/search.html')process.exit(1);await b.close();})()"
kill $SRV
```
Expected: `{ globe: 1, phrases: 6, btn: '/search.html' }` (6 = 3 phrases duplicated for the loop), exit 0.

- [ ] **Step 3: Apply impeccable polish**

Use the `impeccable` skill to refine the landing: type scale, vertical rhythm, globe finish, button feel, and the tongue-in-cheek tone. Re-screenshot to confirm.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: landing page — pink globe, marquee, CTA"
```

---

### Task 7: Search form page

**Goal:** The form page — origin, destination, depart date, optional return date — with client-side validation, that POSTs to `/search` and redirects to the loading page with the returned job id.

**Files:**
- Create: `public/search.html`
- Create: `public/app.js`

**Acceptance Criteria:**
- [ ] Form has: origin (text), destination (text), depart date (date, required), return date (date, optional).
- [ ] Submitting with empty required fields shows an inline validation message and does not navigate.
- [ ] On valid submit it `POST`s JSON `{ origin, dest, departDate, returnDate }` to `/search` and, on the `{ id }` response, navigates to `/loading.html?id=<id>`.
- [ ] DOM assert confirms the four fields and the submit handler exist.

**Verify:** DOM assert (below) → exit 0. (Live POST is exercised end-to-end in Task 11.)

**Steps:**

- [ ] **Step 1: Shared helper**

Create `public/app.js`:
```js
// Small shared browser helpers.
window.postJSON = async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${url} → ${res.status}`);
  return res.json();
};
```

- [ ] **Step 2: Form HTML + validation**

Create `public/search.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Where to? — Now is Now</title>
  <link rel="stylesheet" href="/styles.css" />
  <style>
    .form-wrap { max-width: 520px; margin: 8vh auto; padding: 0 1.25rem; }
    h1 { color: var(--pink); }
    label { display: block; margin: 1rem 0 .35rem; font-weight: 600; }
    input { width: 100%; padding: .8rem 1rem; border: 2px solid var(--pink-soft);
      border-radius: 12px; font-size: 1rem; }
    input:focus { outline: none; border-color: var(--pink); }
    .row { display: flex; gap: 1rem; } .row > div { flex: 1; }
    .error { color: #c41d63; min-height: 1.2rem; margin-top: .75rem; }
    .btn { margin-top: 1.25rem; width: 100%; text-align: center; }
  </style>
</head>
<body>
  <main class="form-wrap">
    <h1>Where to?</h1>
    <form id="search-form" novalidate>
      <label for="origin">From</label>
      <input id="origin" name="origin" placeholder="Miami (city or airport)" />
      <label for="dest">To</label>
      <input id="dest" name="dest" placeholder="Bogota (city or airport)" />
      <div class="row">
        <div><label for="departDate">Depart</label><input id="departDate" name="departDate" type="date" /></div>
        <div><label for="returnDate">Return (optional)</label><input id="returnDate" name="returnDate" type="date" /></div>
      </div>
      <div class="error" id="error" role="alert"></div>
      <button class="btn" type="submit">Search flights</button>
    </form>
  </main>
  <script src="/app.js"></script>
  <script>
    const form = document.getElementById('search-form');
    const errEl = document.getElementById('error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.textContent = '';
      const body = {
        origin: form.origin.value.trim(),
        dest: form.dest.value.trim(),
        departDate: form.departDate.value,
        returnDate: form.returnDate.value || null,
      };
      if (!body.origin || !body.dest || !body.departDate) {
        errEl.textContent = 'Please fill in From, To, and a Depart date.';
        return;
      }
      try {
        const { id } = await window.postJSON('/search', body);
        window.location.href = `/loading.html?id=${encodeURIComponent(id)}`;
      } catch (err) {
        errEl.textContent = 'Could not start the search. Is the server running?';
      }
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: DOM assert**

Run:
```bash
node server.js & SRV=$!; sleep 1
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:5173/search.html');const ids=['origin','dest','departDate','returnDate'];for(const id of ids){if(await p.locator('#'+id).count()!==1){console.error('missing',id);process.exit(1);}}await p.click('button[type=submit]');const err=await p.locator('#error').textContent();console.log('validation msg:',err);if(!err)process.exit(1);await b.close();})()"
kill $SRV
```
Expected: prints a non-empty validation message (empty-submit path), exit 0.

- [ ] **Step 4: impeccable polish + commit**

Refine spacing/labels/focus states with `impeccable`, then:
```bash
git add public/search.html public/app.js
git commit -m "feat: search form with validation + POST /search"
```

---

### Task 8: Search orchestration routes on the server

**Goal:** Add `POST /search` (start an async job: run the Google scraper + agent in parallel, merge, write `results.json`) and `GET /status?id=` (poll job state) to the server. Single in-flight job is fine for a learning app.

**Files:**
- Modify: `server.js`

**Acceptance Criteria:**
- [ ] `POST /search` with a valid body returns `{ id }` immediately (202) and kicks off the job in the background.
- [ ] The job runs `lib/search.js` (Google) and `lib/agentSearch.runAgentSearch` (Kiwi+lastminute) concurrently, merges via `lib/merge.mergeOptions`, and writes the results.json envelope (with `generatedAt` stamped at write time) to `config.RESULTS_FILE`.
- [ ] `GET /status?id=<id>` returns `{ status: "pending" }` while running and `{ status: "done", ...envelope }` (or `{ status: "error", message }`) when finished.
- [ ] A `POST /search` with a missing field returns 400 with a JSON error.

**Verify:** `node --test test/server.test.js` (below) → POST returns an id and status transitions to done/error with a mocked-fast path; plus manual `curl`.

**Steps:**

- [ ] **Step 1: Add job state + routes to `server.js`**

Add near the top of `server.js` (after existing requires):
```js
const { spawn } = require('node:child_process');
const { CAPTURES_DIR, RESULTS_FILE, GFLIGHTS_FILE, MAXH } = require('./config');
const { mergeOptions } = require('./lib/merge');
const { runAgentSearch } = require('./lib/agentSearch');

const jobs = new Map(); // id → { status, envelope?, message? }
let jobSeq = 0;

function readBody(req) {
  return new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => resolve(d)); });
}

// Run the EUR scraper as a child process (it writes GFLIGHTS_FILE), then read rows.
function runGoogle(query) {
  return new Promise((resolve) => {
    const env = { ...process.env, ORIGINS: query.origin, DEST: query.dest, DATES: query.departDate, MAXH: String(MAXH), CONC: '2' };
    const child = spawn('node', [path.join(__dirname, 'lib', 'search.js')], { env, cwd: __dirname });
    child.on('close', () => {
      try { resolve(JSON.parse(fs.readFileSync(GFLIGHTS_FILE, 'utf8'))); }
      catch { resolve([]); }
    });
    child.on('error', () => resolve([]));
  });
}

async function runJob(id, query) {
  try {
    const [googleRows, agent] = await Promise.all([ runGoogle(query), runAgentSearch(query) ]);
    const options = mergeOptions({ googleRows, agentOptions: agent.options, query });
    const notes = [];
    if (agent.note) notes.push(agent.note);
    if (!options.length) notes.push('No options found — try different dates or airports.');
    const envelope = { status: 'done', query, generatedAt: new Date().toISOString(), options, notes };
    fs.mkdirSync(CAPTURES_DIR, { recursive: true });
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(envelope, null, 2));
    jobs.set(id, { status: 'done', envelope });
  } catch (e) {
    jobs.set(id, { status: 'error', message: e.message });
  }
}
```
> Note on `new Date()`: this runs at request time on the live server (not in a plan/workflow sandbox), so it is fine here.

- [ ] **Step 2: Wire the routes into the request handler**

Replace the `http.createServer(...)` handler body with:
```js
const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  if (req.method === 'POST' && urlPath === '/search') {
    const body = JSON.parse((await readBody(req)) || '{}');
    if (!body.origin || !body.dest || !body.departDate) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'origin, dest and departDate are required' }));
      return;
    }
    const query = { origin: body.origin, dest: body.dest, departDate: body.departDate, returnDate: body.returnDate || null };
    const id = String(++jobSeq);
    jobs.set(id, { status: 'pending' });
    runJob(id, query); // fire-and-forget
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id }));
    return;
  }
  if (req.method === 'GET' && urlPath === '/status') {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const job = jobs.get(id);
    res.writeHead(job ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(job ? (job.status === 'done' ? { status: 'done', ...job.envelope } : job) : { error: 'unknown id' }));
    return;
  }
  serveStatic(req, res);
});
```

- [ ] **Step 3: Server test with a fast-mocked job path**

Create `test/server.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Smoke test: 400 on bad body, 202 + id on good body. (Full job is exercised in Task 11.)
test('POST /search validates and returns an id', async () => {
  process.env.PORT = '5199';
  delete require.cache[require.resolve('../server.js')];
  const { server } = require('../server.js');
  await new Promise((r) => server.listen(5199, r));

  const bad = await postJSON(5199, '/search', { origin: 'Miami' });
  assert.equal(bad.status, 400);

  const ok = await postJSON(5199, '/search', { origin: 'Miami', dest: 'Bogota', departDate: '2026-08-13' });
  assert.equal(ok.status, 202);
  assert.ok(ok.json.id);

  server.close();
});

function postJSON(port, path, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request({ port, path, method: 'POST', headers: { 'content-type': 'application/json' } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, json: d ? JSON.parse(d) : null })); });
    req.end(data);
  });
}
```
> The server must not auto-`listen` when required in tests. Guard the listen call in `server.js`: wrap the final `server.listen(...)` in `if (require.main === module) { ... }`.

- [ ] **Step 4: Guard the listen call**

In `server.js`, change:
```js
server.listen(PORT, () => console.log(`Cheap Flights UI on http://localhost:${PORT}`));
module.exports = { server };
```
to:
```js
if (require.main === module) {
  server.listen(PORT, () => console.log(`Cheap Flights UI on http://localhost:${PORT}`));
}
module.exports = { server };
```

- [ ] **Step 5: Run tests + commit**

Run: `node --test test/server.test.js`
Expected: PASS (validates 400 + 202/id).
```bash
git add server.js test/server.test.js
git commit -m "feat: POST /search + GET /status orchestration routes"
```

---

### Task 9: Loading page

**Goal:** The loading page — the trilingual marquee as the central animation while the search runs — polls `GET /status?id=` and redirects to the results page when the job is done.

**Files:**
- Create: `public/loading.html`

**Acceptance Criteria:**
- [ ] The page reads `id` from the query string and polls `GET /status?id=` every ~2.5s.
- [ ] While pending it shows the marquee (all three phrases) + honest status text ("Searching Kiwi, lastminute, Google…").
- [ ] On `status: "done"` it redirects to `/results.html?id=<id>`; on `status: "error"` it shows the error and a link back to the form.
- [ ] DOM assert confirms the marquee renders and polling starts (mock `/status` via route interception).

**Verify:** DOM assert with a mocked `done` status (below) → redirects to results URL, exit 0.

**Steps:**

- [ ] **Step 1: Loading HTML**

Create `public/loading.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Searching… — Now is Now</title>
  <link rel="stylesheet" href="/styles.css" />
  <style>
    .load-wrap { min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 2.5rem; text-align: center; }
    .status { color: var(--ink); opacity: .7; font-size: 1.05rem; }
    .plane { font-size: 2rem; animation: fly 3s ease-in-out infinite; }
    @keyframes fly { 0%{transform:translateX(-40px)} 50%{transform:translateX(40px) translateY(-8px)} 100%{transform:translateX(-40px)} }
  </style>
</head>
<body>
  <main class="load-wrap">
    <div class="plane" aria-hidden="true">🛫</div>
    <div id="marquee-mount" style="width:100%"></div>
    <p class="status" id="status">Searching Kiwi, lastminute, Google…</p>
  </main>
  <script src="/marquee.js"></script>
  <script>
    buildMarquee('#marquee-mount');
    const id = new URLSearchParams(location.search).get('id');
    const statusEl = document.getElementById('status');
    if (!id) { location.href = '/search.html'; }
    async function poll() {
      try {
        const res = await fetch(`/status?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.status === 'done') { location.href = `/results.html?id=${encodeURIComponent(id)}`; return; }
        if (data.status === 'error') { statusEl.textContent = 'Something went wrong: ' + (data.message || 'unknown') + ' — go back and try again.'; return; }
      } catch (_) { /* keep waiting */ }
      setTimeout(poll, 2500);
    }
    poll();
  </script>
</body>
</html>
```

- [ ] **Step 2: DOM assert with mocked status**

Run:
```bash
node server.js & SRV=$!; sleep 1
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.route('**/status*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({status:'done'})}));await p.goto('http://localhost:5173/loading.html?id=1');const m=await p.locator('.marquee__phrase').count();await p.waitForURL('**/results.html*',{timeout:5000});console.log({phrases:m,url:p.url()});if(m<3)process.exit(1);await b.close();})()"
kill $SRV
```
Expected: `{ phrases: 6, url: '.../results.html?id=1' }`, exit 0 (redirect fired on mocked done).

- [ ] **Step 3: impeccable polish + commit**

Refine the animation/tone with `impeccable`, then:
```bash
git add public/loading.html
git commit -m "feat: loading page — marquee + status polling"
```

---

### Task 10: Results page

**Goal:** The results page — fetches the finished envelope and renders up to 5 flight cards (price, airline, route+stops, duration, times, source tag, Book button), with honest markers for approximate Google prices and a graceful empty/error state.

**Files:**
- Create: `public/results.html`

**Acceptance Criteria:**
- [ ] Fetches `GET /status?id=` (or falls back to `/sample-results.json` in dev) and renders `options` as cards.
- [ ] Each card shows: price (with `~` prefix when `approxPrice`), airline, route joined `MIA → PTY → BOG`, stops, duration, dep→arr times, a source tag ("seen on Kiwi/lastminute/Google"), and a **Book** link to `bookingUrl` (opens in a new tab).
- [ ] Empty `options` shows a friendly empty state with a link back to the form; `notes` are displayed as honest caveats.
- [ ] DOM assert against `.captures/sample-results.json` renders exactly 5 cards with 5 Book links.

**Verify:** DOM assert against the sample fixture (below) → 5 cards, 5 book links, exit 0.

**Steps:**

- [ ] **Step 1: Results HTML**

Create `public/results.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your flights — Now is Now</title>
  <link rel="stylesheet" href="/styles.css" />
  <style>
    .results-wrap { max-width: 760px; margin: 5vh auto; padding: 0 1.25rem; }
    h1 { color: var(--pink); }
    .card { border: 2px solid var(--pink-soft); border-radius: 16px; padding: 1.1rem 1.25rem;
      margin: 1rem 0; display: grid; grid-template-columns: 1fr auto; gap: .5rem 1rem; align-items: center; }
    .price { font-size: 1.8rem; font-weight: 700; color: var(--ink); }
    .route { font-weight: 600; } .meta { color: #555; font-size: .92rem; }
    .tag { display: inline-block; font-size: .72rem; text-transform: uppercase; letter-spacing: .04em;
      background: var(--pink-soft); color: #c41d63; padding: .15rem .5rem; border-radius: 999px; }
    .approx { color: #b06; font-size: .8rem; }
    .empty, .notes { text-align: center; color: #555; margin: 2rem 0; }
    .notes { font-size: .88rem; }
  </style>
</head>
<body>
  <main class="results-wrap">
    <h1>Cheapest reasonable flights</h1>
    <div id="cards"></div>
    <div class="notes" id="notes"></div>
    <p class="empty"><a class="btn" href="/search.html">New search</a></p>
  </main>
  <script>
    const id = new URLSearchParams(location.search).get('id');
    const cardsEl = document.getElementById('cards');
    const notesEl = document.getElementById('notes');
    const fmtTime = (t) => t || '';
    const fmtDur = (m) => m == null ? '' : `${Math.floor(m/60)}h ${m%60}m`;
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    function render(env) {
      const options = env.options || [];
      if (!options.length) {
        cardsEl.innerHTML = '<p class="empty">No flights found — try different dates or airports.</p>';
      } else {
        cardsEl.innerHTML = options.map((o) => `
          <div class="card">
            <div>
              <div class="route">${(o.route||[]).join(' → ')} <span class="tag">seen on ${cap(o.source)}</span></div>
              <div class="meta">${o.airline||''} · ${o.stops===0?'nonstop':o.stops+' stop'+(o.stops>1?'s':'')} · ${fmtDur(o.durationMin)}</div>
              <div class="meta">${fmtTime(o.depTime)} → ${fmtTime(o.arrTime)}</div>
            </div>
            <div style="text-align:right">
              <div class="price">${o.approxPrice?'~':''}$${o.priceUsd}</div>
              ${o.approxPrice?'<div class="approx">approx (converted)</div>':''}
              <a class="btn" href="${o.bookingUrl}" target="_blank" rel="noopener">Book</a>
            </div>
          </div>`).join('');
      }
      notesEl.textContent = (env.notes || []).join('  ·  ');
    }

    async function load() {
      try {
        const res = await fetch(id ? `/status?id=${encodeURIComponent(id)}` : '/sample-results.json');
        render(await res.json());
      } catch (_) {
        const res = await fetch('/sample-results.json'); render(await res.json());
      }
    }
    load();
  </script>
</body>
</html>
```
> Dev note: `/sample-results.json` is served from `public/`? No — it lives in `.captures/`. For dev fallback, copy it once: `cp .captures/sample-results.json public/sample-results.json` (committed) so the results page renders without a live search. Add that copy in Step 2.

- [ ] **Step 2: Provide the dev fixture to the page + DOM assert**

Run:
```bash
cp .captures/sample-results.json public/sample-results.json
node server.js & SRV=$!; sleep 1
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:5173/results.html');await p.waitForSelector('.card');const cards=await p.locator('.card').count();const books=await p.locator('a.btn:has-text(\"Book\")').count();const approx=await p.locator('.approx').count();console.log({cards,books,approx});if(cards!==5||books!==5||approx<1)process.exit(1);await b.close();})()"
kill $SRV
```
Expected: `{ cards: 5, books: 5, approx: 1 }` (one Google approx marker), exit 0.

- [ ] **Step 3: impeccable polish + commit**

Refine card hierarchy/spacing/tag styling with `impeccable`, then:
```bash
git add public/results.html public/sample-results.json
git commit -m "feat: results page — 5 cards, source tags, booking links, approx markers"
```

---

### Task 11: End-to-end integration & honest-states pass

**Goal:** Wire everything into a real end-to-end run, confirm the four pages flow together, and verify the honest edge cases (approx Google price, source tags, empty/error states). This is the "does the whole thing actually work" pass.

**Files:**
- Modify: any page/server file needing small fixes discovered during integration (record exact edits when made)
- Create: `docs/superpowers/e2e-notes-2026-07-09.md` (what was run, what came back)

**Acceptance Criteria:**
- [ ] Starting the server and driving landing → form (real route: Miami→Bogota, a near-future date) → loading → results produces a results page with ≥1 real option carrying a working booking link.
- [ ] If the spike (Task 1) was GREEN, at least one option comes from Kiwi or lastminute with a one-click booking URL; if RED, the Google option renders with its approx marker and the loading page's `notes` explain the in-session requirement (no silent failure).
- [ ] Source tags, `~$` approx markers, duration/stops formatting all render correctly on real data.
- [ ] `node --test` (whole suite) passes.

**Verify:** `node --test` → all suites pass; plus the captured e2e screenshots in the notes doc show a populated results page.

**Steps:**

- [ ] **Step 1: Full-suite run**

Run: `node --test`
Expected: all test files pass (gflights, merge, agentSearch, server).

- [ ] **Step 2: Live end-to-end drive with screenshots**

Run:
```bash
node server.js & SRV=$!; sleep 1
# 1) submit a real search via the API, get an id
ID=$(node -e "const http=require('http');const d=JSON.stringify({origin:'Miami',dest:'Bogota',departDate:'2026-08-13'});const r=http.request({port:5173,path:'/search',method:'POST',headers:{'content-type':'application/json'}},s=>{let x='';s.on('data',c=>x+=c);s.on('end',()=>console.log(JSON.parse(x).id))});r.end(d)")
echo "job id: $ID"
# 2) poll until done (up to ~5 min — the agent + scraper are slow, as designed)
for i in $(seq 1 120); do
  ST=$(curl -s "http://localhost:5173/status?id=$ID" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).status)}catch{console.log('pending')}})")
  echo "poll $i: $ST"; [ "$ST" = "done" ] && break; [ "$ST" = "error" ] && break; sleep 3
done
# 3) screenshot the results page
node scripts/shot.mjs "http://localhost:5173/results.html?id=$ID" /tmp/results.png
kill $SRV
```
Expected: status reaches `done`; `/tmp/results.png` shows populated cards (or a clearly-explained empty/notes state if RED).

- [ ] **Step 3: Record e2e notes**

Create `docs/superpowers/e2e-notes-2026-07-09.md`: the route/date used, the spike path (A/B), the number of options and their sources, and whether booking links resolved. Paste the key `results.json` snippet.

- [ ] **Step 4: Final impeccable pass across all four pages**

Use `impeccable` for a consistency pass (shared type scale, color, spacing, motion, the tongue-in-cheek voice) across landing/form/loading/results. Re-screenshot each.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: end-to-end integration + honest edge-state pass"
```

---

## Self-Review

**1. Spec coverage** (spec → task):
- Landing (pink globe + marquee + button) → Task 6. ✔
- Form (origin/dest/depart/optional return) → Task 7. ✔
- Loading (marquee central animation + poll) → Task 9. ✔
- Results (5 cards: price/airline/route/stops/duration/times/source tag/Book) → Task 10. ✔
- Shared trilingual marquee on landing + loading → Task 5 (component) used by 6 + 9. ✔
- Agent-driven backend (Kiwi + lastminute) → Tasks 4 + 8. ✔
- Google Flights kept, EUR→approx USD, page-link booking → Tasks 2 + 3. ✔
- ≥2-source cross-check / source diversity → Task 3 (`pickTop5`). ✔
- Travel-time ceiling → Task 3 (`underCeiling`). ✔
- ≥5 options, each with a booking URL → Tasks 3 + 10. ✔
- USD display → Task 3. ✔
- Step 0 spike before UI polish → Task 1 (gate), enforced by ordering (Tasks 6/7/9/10 blockedBy Task 1). ✔
- Read-only backend never written → Tasks 2 + config (`GFLIGHTS_FILE` in our folder). ✔
- Watch-live build (dev server + forwarded port + headless Playwright screenshots) → Task 5 harness + per-page screenshot verifies. ✔
- Honest caveats (approx markers, notes, empty/error states) → Tasks 10 + 11. ✔

**2. Placeholder scan:** No "TBD"/"add error handling"/"write tests for the above" — every code step has real code and every test step has real assertions. ✔

**3. Type consistency:** The option schema (`source/priceUsd/approxPrice/airline/route/stops/durationMin/depTime/arrTime/bookingUrl`) and envelope (`status/query/generatedAt/options/notes`) are used identically across `merge.js`, `agentSearch.js`, `server.js`, and `results.html`. `mergeOptions({ googleRows, agentOptions, query })` signature matches its callers in Task 8. `buildMarquee(selector)` matches usage in Tasks 6 + 9. ✔

---
```
