# Spike: Headless-Agent MCP-Auth Probe

**Date:** 2026-07-09

## Question

Does a HEADLESS `claude -p` subprocess (no interactive session — the same
way `server.js` will later launch the search agent) still have access to
the claude.ai-authenticated Kiwi/lastminute MCP flight-search tools, and
can it return a real booking URL?

## Command run

```bash
bash scripts/spike-agent.sh
```

Which executes, verbatim:

```bash
claude --print --output-format text --model claude-sonnet-5 "$PROMPT" 2>&1 | tee "$OUT"
```

with

```
PROMPT='Use the Kiwi.com MCP flight-search tool (mcp__claude_ai_Kiwi_com__search-flight) to search one-way flights from Miami (MIA) to Bogota (BOG) departing 13/08/2026, currency USD. Then output ONLY a compact JSON object: {"count": <number of itineraries>, "cheapest": {"priceUsd": <number>, "bookingUrl": "<url>"}}. No prose, no markdown fences.'
```

Route: Miami (MIA) → Bogota (BOG), one-way, departing 13/08/2026, currency USD.

## Raw captured output

Full, unedited contents of `.captures/spike-agent-out.txt`:

```
It looks like permission for this tool wasn't granted (or was denied). Could you approve the `mcp__claude_ai_Kiwi_com__search-flight` tool call so I can run the search? I can retry once it's allowed.
```

The script's own grep-based classifier confirmed this in its terminal summary:

```
Running headless claude -p ... (this may take a minute)
It looks like permission for this tool wasn't granted (or was denied). Could you approve the `mcp__claude_ai_Kiwi_com__search-flight` tool call so I can run the search? I can retry once it's allowed.

----- raw output saved to scripts/../.captures/spike-agent-out.txt -----
SPIKE RESULT: RED (no booking URL — MCP likely unavailable headless)
```

## Analysis

The headless run did not error out, hang, or claim the tool was entirely
absent from its toolset — the agent clearly *knows about*
`mcp__claude_ai_Kiwi_com__search-flight` (it names it precisely). But it
never actually invoked the tool. Instead it immediately surfaced a
permission-approval request and stopped, waiting for a human to approve
the tool call — a prompt that has no path to be answered in a
non-interactive `--print` subprocess (there is no TTY, no approval
channel, and the process is not designed to pause for input mid-run in
this mode).

This means: even though the account-level MCP server config for Kiwi.com
is presumably still loaded/visible to the headless process (the agent
named the exact tool string correctly), the *permission gate* that sits
in front of MCP tool calls blocks headless execution. No itinerary data,
no price, no booking URL was returned. Zero itineraries, zero booking
links — the strongest possible RED signal (not a partial/ambiguous
result).

No hang was observed — the process returned promptly with the permission
message rather than timing out.

## VERDICT: RED

A headless `claude -p` agent, launched the way `server.js` would launch
it, cannot complete an MCP flight search: it stalls on an unanswerable
tool-permission approval prompt and returns no itinerary or booking
data.

## Resulting decision

Task 4 implements path B: agentSearch.js returns a marked "needs
in-session run" status; Claude runs the MCP search in-session during
pairing; Google scraper still runs headlessly; booking links remain
real.
