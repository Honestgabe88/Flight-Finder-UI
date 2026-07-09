# Council Transcript — UI strategy for `cheap_flights`

**Date:** 2026-07-08
**Question counciled:** What is the best strategy to build a UI for the `cheap_flights` project?

---

## Original question (from the user)

Convene the council to deliberate on the best strategy to build a UI for the `cheap_flights` backend (read-only project), which will be built using the `impeccable` skill and tested/debugged live with the Playwright CLI in a headless browser.

## Framed question given to all advisors

The backend is **not** a REST API — it's an LLM agent workflow (an Opus playbook run inside Claude Code, delegating to Sonnet/Haiku sub-agents + scraper scripts). Only Google Flights (`scripts/search.js`, a headless node CLI writing `.captures/gflights_results.json`) is callable model-free; Kiwi + lastminute (the only sources with one-click **booking links**) are MCP servers needing a model tool-call and may be absent headless. Hard domain rules: ≥2 sources, route-scaled travel-time ceiling, rank on effective fare, verify outliers, every option carries a booking URL, return ≥5 options. No database — state is files (`ROUTES.md`, `.captures/*.json`). Build constraints: dev container with no display; iterate with the `impeccable` frontend skill + headless Playwright.

**Four options debated:**
- **A. Drive the agent** — UI kicks off an agent run and streams its output. All sources + booking links, but slow, costly, non-deterministic, MCP needs interactive auth.
- **B. Thin deterministic API over `search.js` only** — fast, cheap, headless, but Google-Flights-only breaks the ≥2-source rule and loses booking links.
- **C. New backend layer** reimplementing orchestration outside Claude — biggest lift, duplicates the project.
- **D. Results viewer only** — visualizes prior `.captures/*.json`; not interactive.

---

## Advisor responses (de-anonymized)

### The Contrarian  *(shown to reviewers as Response C)*

The framing hides the real fault line: **A, B, and C all pretend the ≥2-source rule is a UI problem when it's actually a runtime-availability problem.** Kiwi and lastminute are MCP servers callable only through a model tool-call, and absent in headless runs. That single fact quietly kills B and D, cripples C, and makes A far worse than advertised.

**B is the trap.** "Fast, cheap, headless" — and it structurally *cannot* satisfy your own hard rules. One source, no booking URL, no cross-check. You'd ship a UI that violates every correctness invariant the project exists to enforce. That's not an MVP; it's the "beautiful UI that lies."

**A's hidden killer is auth, not speed.** If MCP can't authenticate non-interactively, then even Option A can't reliably produce booking links or a second source in an automated UI run. Has anyone confirmed MCP works outside an interactive Claude Code session? That's the question everyone's avoiding.

**C duplicates the agent** — but Kiwi/lastminute have no public API you're allowed to hit; you'd be reimplementing scraping you don't have. **D** isn't a strategy, it's a screenshot.

Before writing one line: prove MCP can be driven programmatically and produce a booking link headlessly. If it can't, your only honest options are A (accept slow/costly/interactive) or explicitly renegotiate the ≥2-source rule.

### The First Principles Thinker  *(shown to reviewers as Response E)*

You're treating "the UI" as one thing. It isn't, and that's the whole confusion.

A flight search has two jobs that got welded together: **Job 1: find the truth** (cross-check sources, rank effective fare, verify outliers — the expensive, non-deterministic agent work). **Job 2: let a human act on it** (browse ranked options, click a booking link). Job 2 is cheap, deterministic, and where all the "impeccable UI" value lives. Job 1 is the agent, and you already built it.

So the real question isn't "which of A/B/C/D." It's: **must search be synchronous with viewing?** Everything painful — cost, latency, MCP interactive auth, non-determinism — comes from forcing a human to sit and wait while an Opus agent thinks. Nobody books a flight in the 3 seconds an API returns.

That collapses the false choice. A and D aren't rivals — they're two ends of one async pipeline. The UI submits a route (kicks an agent run, per A), the run writes `.captures/*.json` + booking links to files, and the UI reads those files (per D). B and C exist only to fake synchrony, and each breaks a hard rule to do it.

Build the results viewer first (D) — it's honest today against real captures. Wire the async trigger (A) second. Skip B and C. Who's the user? Someone who wants a right answer, not a fast one.

### The Expansionist  *(shown to reviewers as Response A)*

**This isn't a flight site, it's a *reasoning theater*.** Every flight site on earth shows you a sorted table. None show you the *thinking*. Option A's "slow and non-deterministic" is the product, not the bug. When a user watches Opus expand "cheap Lisbon in October" into gateway nodes, fire five sub-agents, and catch a fare that's a mirage on effective cost — that's a moat Kayak structurally cannot copy. Trust compounds when you see the work.

**ROUTES.md is the sleeper asset.** Render it as a live route-topology graph — gateway nodes brightening with confidence, decaying edges fading. Every search enriches a shared brain. A data flywheel hiding inside a markdown file. Expose it.

**The 10x version:** don't build a search box. Build a glass-cockpit trip planner where the agent's reasoning stream *is* the interface — expandable plan cards, live sub-agent status, an interactive ROUTES.md graph, one-click booking links surfaced the instant judgment lands, and the user steering mid-flight ("skip red-eyes," "widen the dates").

Start with A, but architect the stream as first-class UI. B and D are demos of a corpse; C rebuilds the one differentiated thing. Ship the reasoning.

### The Outsider  *(shown to reviewers as Response D)*

I don't want to watch a robot think. I want a plane ticket.

**Option A** sounds cool for ten seconds, then I'd hate it. Sixty seconds staring at a screen is an eternity — I abandon sites that take four. And it *costs money to search*? I'm gone. But A is the ONLY one with real Book buttons; a result I can't book is a screenshot, not a product.

**Option B** feels great to use and is completely broken as a product. Instant and free, but no booking links means I find a $312 flight, get excited, and then... copy it into another site myself? A really fast dead end.

**Option C** — you want to build now, and this is a long project. Not the question. **Option D** is a museum. Old searches for trips that aren't mine.

What would feel best: the speed of B with the booking links of A. Start with the fast free scraper for an instant result, show options immediately, and put a **"Get real bookable prices"** button that triggers the slow/expensive agent only when I've decided I care. Ship B's frontend now, wired so A plugs in behind that button.

### The Executor  *(shown to reviewers as Response B)*

Build **B + D fused into one app** — the only thing that runs headless, model-free, and demoable THIS session. A and C are dead on arrival: A needs interactive MCP auth you don't have; C is a rewrite.

Monday-morning order:
1. **Read-only harness.** In the UI folder (not the backend), `server.js` shells out to `node /workspaces/other_project/scripts/search.js`, reads the capture JSON, serves it. Never write into the read-only backend — pass a `.captures` path you own via env, or copy the file out.
2. **Ship D first, same hour.** Point the frontend at an existing `gflights_results.json` → a real ranked table on screen (effective fare, stops, duration, layover), zero latency. Demo in <60 min.
3. **Wire the trigger.** A Search button → POST → step 1 → repaint = B: live, deterministic, GF-only.

**No-display reality:** never headed; drive/verify with headless Playwright + screenshots/trace. Surface honest gaps, don't hide them: GF-only = show "Kiwi/lastminute unavailable headless"; no deeplinks = link to GF search, mark "no direct deeplink." Booking links + multi-source wait for interactive mode.

---

## Peer reviews (anonymization mapping: A=Expansionist, B=Executor, C=Contrarian, D=Outsider, E=First Principles)

**Reviewer 1** — Strongest: **E** (isolates synchronous-vs-async as the real variable; maps A+D onto one pipeline that satisfies the hard rules). Biggest blind spot: **A** (bets on the reasoning stream without asking if the agent can run headless at all). All missed: the MCP tools are present *right now* and empirically checkable in one call — the debate's central unknown was answerable, and nobody checked.

**Reviewer 2** — Strongest: **E** (dissolves A/B/C/D structurally where D reaches it only emotionally). Biggest blind spot: **A** (romanticizes the stream, ignores MCP-auth feasibility → a glass cockpit with no bookable flights). All missed: the empirical gate — one probe of the present MCP tools settles it.

**Reviewer 3** — Strongest: **E** (grounds the "fast now, agent behind a button" instinct in architecture where D treats it as taste). Biggest blind spot: **A** (never checks whether it can actually book a flight). All missed: nobody verified the load-bearing fact; C asks but doesn't check.

**Reviewer 4** — Strongest: **E** (async collapses cost/latency/auth/non-determinism at once, trades away no hard rule). Biggest blind spot: **A** (auth/runtime feasibility; D shares it). All missed: verifying MCP headless (5-minute test), and nobody questioned whether the ≥2-source/booking-URL *rules themselves* are renegotiable.

**Reviewer 5** — Strongest: **E** (false-choice reframing + concrete build order; C is sharpest critique but stops at "prove MCP works" with no path). Biggest blind spot: **A** (sells the theater, skips whether the engine legally starts). All missed: the "absent headless" premise that kills B/D and cripples C is assertion, not tested fact — the servers are present as callable tools here.

---

## Chairman's verdict

See `council-report-2026-07-08.html` for the formatted verdict. Summary:

- **Agreement:** search need not be synchronous; the ≥2-source + booking-link rules are load-bearing; B and C are weak (B ships a partial answer as if whole, C duplicates the project); the file-based viewer surface is honest and buildable today.
- **Clash:** speed-first (Outsider) vs. reasoning-as-product (Expansionist); and whether B has any legitimate role (Executor yes, Contrarian "the trap").
- **Blind spot caught (unanimous):** the whole debate rests on an *untested* assumption — that the Kiwi/lastminute MCP booking sources don't work in an automated/headless run. Those tools are callable in this very environment. One probe decides everything.
- **Recommendation:** Adopt First Principles' async architecture (decouple search from viewing); build the results-viewer surface first, wire an async agent trigger second; use the Outsider's "fast GF result now, real bookable prices behind a button" as the honest UX; keep the Expansionist's reasoning-stream + ROUTES.md graph as phase 2; skip C. **But gate the architecture on the empirical MCP probe first.**
- **One thing to do first:** Run the probe — call the Kiwi `search-flight` and lastminute `generate_booking_link` MCP tools once, now, and confirm whether they return results + a booking URL in this environment. That single fact determines how much of the plan is buildable.
