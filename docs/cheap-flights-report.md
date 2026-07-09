# Project Report: `cheap_flights` Backend — for the UI Council

**Prepared:** 2026-07-08
**Source:** read-only inspection of `/workspaces/other_project` (CLAUDE.md, CONTEXT.md, ROUTES.md, `scripts/`, `docs/adr/`, `.captures/`)
**Purpose:** Give the council enough grounding to deliberate on the best strategy for building a UI on top of this project.

---

## 1. What this project actually is

`cheap_flights` finds the cheapest *reasonable* flight for any trip (from/to/dates, where either side may be an airport, city, region, or "anywhere"). **It is not a REST API or a running web server.** It is an **LLM agent workflow** — a curated playbook (`CLAUDE.md`) that an Opus-class model executes inside Claude Code, delegating to cheaper sub-agents and a couple of scraper scripts.

This is the single most important fact for the UI decision: **there is no HTTP endpoint to call.** The "backend" is a model following instructions.

## 2. Architecture — the "bookended" model (ADR-0001)

Opus is expensive per token, so it is kept *out* of the search loop. A run has three parts:

1. **Plan bookend (Opus, thin)** — expands the route into candidate airports/hubs, discovers combos from scratch, then augments with `ROUTES.md` intel. Emits a compact JSON **search plan**. Sees no raw payloads.
2. **Execution middle (disposable sub-agents)** — ~3–5 agents. **Sonnet** drives the flaky multi-source fetch/collate (handles bot-challenges, empty results); **Haiku** parses bulk files. All raw tool traffic lives and dies here. Returns **one compact, over-inclusive candidate set**.
3. **Judgment bookend (Opus, thin)** — value-weighs the candidate set, verifies outliers conditionally, ranks, reports, and writes learnings back to `ROUTES.md`.

## 3. Data sources (and how reachable they are)

| Source | How it's called | Deterministic / model-free? | Notes |
|---|---|---|---|
| **Google Flights** | `scripts/search.js` (Playwright + stealth) | ✅ **Yes** — plain `node` CLI | Writes `.captures/gflights_results.json`. **EUR-locked** (currency + parser hardcoded). No per-flight booking deeplink. |
| **Kiwi** | MCP `mcp__claude_ai_Kiwi_com__search-flight` | ❌ No — needs a model tool-call | Virtual interlining; returns bulk JSON that overflows context. Gives `bookingUrl`. |
| **lastminute** | MCP `..._search_flights` | ❌ No — needs a model tool-call | Needs IATA codes; empty on US-domestic. Gives `booking_link`. |
| **Skyscanner** | `scripts/skyscanner.js` | ⚠️ Blocked | PerimeterX bot defense; needs paid captcha/proxy or API key. |

**Consequence:** Only *one* of the two-plus mandatory sources (Google Flights) can be called without a model in the loop. Kiwi + lastminute — the two that provide **one-click booking links** — are account-MCP servers reachable only via model tool-calls, and **may be absent entirely in headless/cron runs.**

## 4. The deterministic interface that DOES exist

`scripts/search.js`:
```
ORIGINS="Paris,London,Madrid" DEST="Miami" DATES="2026-08-11,2026-08-13" MAXH=24 CONC=3 node scripts/search.js
```
- Fans Google Flights across origins × dates, filters to `<=MAXH` hours, dedupes, ranks by price.
- Writes `.captures/gflights_results.json` — an array of normalized rows:
  `{ source, origin, dest, date, price_eur, stops, airline, durationMin, duration, depAirport, depTime, arrAirport, arrTime, layover }`.
- Requires a one-time `npx playwright install chromium` on a fresh container (now done).
- One output file, overwritten each run → multi-leg searches run sequentially and copy the file between runs.

This JSON is the closest thing to a stable, machine-readable contract the project has today.

## 5. Domain rules that any correct UI must respect (from CLAUDE.md)

- **≥2 independent sources** always cross-checked — never trust one source's "cheapest."
- **Route-scaled travel-time ceiling** (tiers: short-haul ~8–10h, medium ~16h, long-haul ~24h, ultra-long ~48h) — a hard filter, not a value call.
- **Effective fare, not headline fare** — normalize self-transfers (second bag, forced overnight, inter-airport transfer) before ranking.
- **Candidate set is over-inclusive** — mechanical filters only during gathering; value judgment happens once, at the end.
- **Verify before trusting** — single-sourced or outlier fares get a click-through confirmation; label unverified prices.
- **Report honestly** — show each fare's source ("seen on"), flag caveats, every option carries a purchase URL, return ≥5 bookable options.

## 6. Persistent state

No database. State is files:
- `ROUTES.md` — durable route-topology intel (gateway nodes keyed by region-pair, with confidence/corroborations/misses decay). Principles, never live fares (ADR-0002).
- `.captures/*.json` — the most recent search outputs (currently seeded with MIA↔Medellín/Bogotá runs).

## 7. Inputs the system expects (Step 0)

From → To (airport / city / region / "anywhere"); dates + flex; one-way vs round-trip; travel-time ceiling (route-scaled, user-overridable); priority (absolute-cheapest vs cheapest-reasonable, default latter); self-transfer allowed (default yes).

## 8. Environment constraints for the UI build itself

- Dev container, **no display** — a "headed" browser cannot render to the user's screen; live-watching must be via screenshot streaming, Playwright trace/video, or impeccable's `live` local-server mode.
- Playwright CLI + browsers now installed globally (Chromium/Firefox/WebKit).
- This UI folder (`/workspaces/cheap_flights_UI`) is **not** a git repo; the backend is read-only.

---

## The decision the council must weigh

**How should a UI be built for an agent-based flight finder that has no API?** The apparent options, each with a real tension:

- **A. Drive the agent** — UI kicks off a Claude Code / Agent-SDK run and streams its output. *True to the design; preserves all sources + booking links. But slow, costly, non-deterministic, and MCP sources need interactive auth.*
- **B. Thin deterministic API over `search.js` only** — fast, cheap, fully headless. *But Google-Flights-only breaks the ≥2-source rule and loses Kiwi/lastminute booking links.*
- **C. New backend layer** that reimplements orchestration outside Claude. *Most "normal" UI, biggest lift, partially duplicates the project's reason to exist.*
- **D. Results viewer only** — UI visualizes `.captures/*.json` from runs already done by the agent. *Smallest, honest lift; not an interactive search.*

Plus a build-process question: how to iterate on and visually test the UI (via impeccable + Playwright) in a container with no display.
