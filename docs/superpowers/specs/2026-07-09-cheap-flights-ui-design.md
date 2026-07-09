# Design Spec — Cheap Flights UI

**Date:** 2026-07-09
**Status:** Draft for approval
**Author:** pairing session (user + Claude Code)

---

## 1. What we're building & why

A small web UI in front of the read-only `cheap_flights` agent project. **This is
a learning project** — the user's first UI ever. The goal is *not* a consumer
product; it's to learn how to build a UI collaboratively with Claude Code and watch
the process live.

Four pages:

1. **Landing** — a travel-based logo + a single click-through button.
2. **Search form** — origin, destination, dates.
3. **Loading** — a cute, repeating travel-themed animation while the search runs.
4. **Results** — the 5 best flights, each with a real booking link.

## 2. Stack

- **Frontend:** plain HTML + CSS + vanilla JavaScript. No framework, no build step.
  Chosen because the learning goal is "watch Claude build a UI cleanly," and a build
  toolchain (React/Vite) adds failure modes that interrupt the live loop without
  serving that goal.
- **Server:** a small local Node.js server (`server.js`) that serves the pages and
  drives the search.
- **Styling / polish:** the `impeccable` skill, during the build phase only.

## 3. Architecture — agent-driven ("Option C")

The backend is **not** an HTTP API. It's an LLM agent workflow. The booking-link
sources (Kiwi, lastminute) are **MCP tools available to a Claude agent, not to a
plain web server.** Confirmed working 2026-07-09 (Kiwi returned 15 real MIA→BOG
itineraries with real booking URLs in ~4s). See memory `mcp-booking-sources-work`.

So the UI's "backend" is a Claude agent, driven by a button:

```
Search form  →  POST /search  →  server.js spawns a headless Claude agent
                                   (claude -p) that runs the cheap_flights playbook:
                                     • Kiwi        (MCP)  — USD, one-click booking
                                     • lastminute  (MCP)  — USD, one-click booking
                                     • Google Flights (vendored scraper) — EUR, no deeplink
                                   merges + ranks all sources, writes results.json
Loading page  ←── polls GET /status until results.json is ready ──→  Results page
```

### Consequences we accept
- **Cost:** each search launches an AI agent run (real money per search).
- **Latency:** minutes, not seconds — which is exactly why the loading animation exists.
- **Non-determinism:** results may vary run to run.

### STEP 0 — de-risking spike (do this FIRST, before any UI polish)
Verify that a Claude agent launched **headlessly by the server** (`claude -p`
subprocess) can still reach the claude.ai-authenticated Kiwi/lastminute MCP tools.
- If **yes** → full background-agent architecture as drawn above.
- If **no** → fallback: Claude drives the search in-session during pairing (still
  real bookable results, just human-in-the-loop rather than a background process).
Either path yields real booking links. We do not build page polish until this is settled.

## 4. Data sources & the merged result set

The 5 result cards are the best options **merged and ranked across all three
sources**, honoring the project's domain rules:

- **≥2 independent sources** cross-checked (Kiwi + lastminute + Google) — never trust one.
- **Route-scaled travel-time ceiling** — filter out absurd-duration itineraries.
- **Effective fare, not headline fare** — rank on real cost where knowable.
- **≥5 options returned**, each carrying a booking URL.
- **Report honestly** — every card is tagged with its source ("seen on Kiwi").

### Currency & booking-link honesty (decided)
- Display currency: **USD**.
- **Kiwi / lastminute:** native USD, exact price, one-click `bookingUrl`.
- **Google Flights:** scraper is EUR-locked with no per-flight deeplink → shown as an
  **approximate** USD price (converted, marked `~$`), and its "Book" button links to
  the Google Flights **page** for that route (one step, not one click). Clearly labeled.
- **DECIDED:** keep Google Flights in the mix — it competes for the top 5 alongside
  Kiwi and lastminute.

## 5. The four pages in detail

### Shared motif — the trilingual scrolling marquee
The same phrase, in three forms that all mean the same thing, scrolls **horizontally
across the screen one after another**, looping continuously:
1. `今度は今度、今は今`
2. `Kondo wa kondo, ima wa ima`
3. `Next time is Next time, Now is Now`

This marquee appears on **both** the Landing and Loading pages, tying them together.
Built in CSS/JS by impeccable. Japanese glyphs require a font stack that includes a
CJK face (e.g. system "Noto Sans JP" / "Hiragino" fallback).

### Page 1 — Landing
- **Vibe:** minimalist, fun, tongue-in-cheek.
- **Logo:** a **pink globe, slowly rotating.**
- **The trilingual scrolling marquee** (see Shared motif above).
- One primary button → navigates to the search form.

### Page 2 — Search form
- **Origin** (city or airport; free text).
- **Destination** (city or airport; free text).
- **Depart date** (required).
- **Return date** (optional — blank = one-way).
- Submit → POST /search → navigate to Loading.
- Light client-side validation (required fields, date sanity).

### Page 3 — Loading
- **The trilingual scrolling marquee** (see Shared motif above) is the central,
  repeating animation during the wait — same phrases as the landing, scrolling
  horizontally one after another.
- May pair with a subtle travel touch (e.g. a small plane tracing across), but the
  marquee is the primary motif.
- Polls `GET /status` until the search completes, then routes to Results.
- Honest status text ("Searching Kiwi, lastminute, Google…").
- Handles the minutes-long wait gracefully (no fake progress bar that lies).

### Page 4 — Results
- The 5 best flights as cards. Each card shows:
  - **Price** (big; USD; `~` prefix if converted from Google).
  - **Airline(s)**.
  - **Route** with stops (e.g. `MIA → PTY → BOG`).
  - **Total duration**.
  - **Depart → arrive** times.
  - **Source tag** ("seen on Kiwi / lastminute / Google").
  - **Book button** → real `bookingUrl` (Kiwi/lastminute) or Google Flights page.
- Graceful empty/error state if a search returns nothing.

## 6. Project file layout (all in our writable folder — backend stays untouched)

```
/workspaces/cheap_flights_UI/
  server.js                 # serves pages + POST /search + GET /status
  public/
    index.html              # landing
    search.html             # form
    loading.html            # animation + poll
    results.html            # results cards
    styles.css              # (impeccable)
    app.js                  # (impeccable)
  lib/
    gflights.js             # VENDORED copy of backend scraper (we never touch backend)
    search.js               # VENDORED orchestrator, adapted to write into our folder
  .captures/
    results.json            # search output the UI reads
  docs/superpowers/specs/   # this spec
```

**Hard constraint:** `/workspaces/other_project` (the backend) is **read-only** —
we only ever read from it (e.g. the playbook/ROUTES.md for the agent's instructions)
and copy scripts *out*. We never write into it.

## 7. How we build & watch it live

- Run `server.js`; VS Code forwards the local port to the user's own browser.
- User watches the real app live (hot refresh) as Claude edits.
- Claude self-checks with **headless Playwright + screenshots** (no display in container).
- `impeccable` drives styling, layout, motion, and iteration during the build phase.

## 8. Out of scope for v1

- Accounts / auth / saved searches.
- Passenger counts, cabin class, multi-city.
- Price history, alerts, or the "reasoning theater" / ROUTES.md graph ideas.
- Mobile-first responsive polish (we'll aim for "looks fine on a laptop" first).

## 9. Resolved decisions

1. **Google Flights:** kept — competes for the top 5 (approx USD, page-link).
2. **Brand/vibe:** minimalist, fun, tongue-in-cheek. Landing = pink rotating globe +
   trilingual scrolling marquee. The marquee (`今度は今度、今は今` / `Kondo wa kondo,
   ima wa ima` / `Next time is Next time, Now is Now`, scrolling horizontally one
   after another) appears on **both** Landing and Loading.
3. **Latency:** minutes-long search is acceptable; no source cap needed.
```
