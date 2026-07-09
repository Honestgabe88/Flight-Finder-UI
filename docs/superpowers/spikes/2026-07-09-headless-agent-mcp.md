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

## Follow-up probe 2 — scoped permission bypass

The Probe 1 failure was a *permission gate*, not missing auth (the agent
named the exact tool string, so the MCP server IS loaded headlessly). The
`claude` CLI exposes a non-interactive permission mode. Re-ran the same
prompt with `--permission-mode bypassPermissions`:

```bash
claude --print --output-format text --model claude-sonnet-5 \
  --permission-mode bypassPermissions "$PROMPT"
```

Raw captured output (`.captures/spike-agent-out-2.txt`), exit code 0:

```
{"count": 15, "cheapest": {"priceUsd": 147, "bookingUrl": "https://kiwi.com/u/d73rxc"}}
```

A real search (15 itineraries) with a real booking URL, returned by a
fully headless subprocess — exactly what `server.js` needs.

## VERDICT: GREEN (requires `--permission-mode bypassPermissions`)

A headless `claude -p` agent CAN complete an MCP flight search and return
a real booking URL, **provided the permission prompt is bypassed** with
`--permission-mode bypassPermissions` (Probe 1 proved the default mode
stalls on an unanswerable approval prompt; Probe 2 proved the bypass flag
resolves it). The account MCP servers are available headlessly; only the
interactive approval gate was in the way.

## Probe 3 — least-privilege scoped allowlist (the approach we ship)

`bypassPermissions` (Probe 2) works but disables ALL permission prompts for
the subprocess — an unnecessarily broad grant, since the search prompt embeds
user-typed origin/destination and could carry a prompt-injection payload.
Re-ran with a scoped allowlist instead of the blanket bypass:

```bash
claude --print --output-format text --model claude-sonnet-5 \
  --allowedTools=mcp__claude_ai_Kiwi_com__search-flight,mcp__claude_ai_lastminute_com__search_flights \
  "$PROMPT" < /dev/null
```

Result (exit 0): a JSON array with real Kiwi itineraries (`$147`, `kiwi.com/u/…`)
AND real lastminute itineraries (`$262.81`+, full `lastminute.ie/msr/…` deep-links).
Both sources work headlessly under the scoped allowlist. Note: `--allowedTools`
is variadic, so it must be passed in `=` form (`--allowedTools=a,b`) or it will
swallow the positional prompt argument.

**Security decision:** ship the **scoped allowlist**, NOT `bypassPermissions`.
The headless agent may call only the two read-only flight-search tools; any
attempt to run Bash/Edit/Write or reach another MCP server hits the permission
gate, which a `--print` subprocess cannot satisfy — so it is safely blocked.
This is least-privilege and neutralizes prompt-injection escalation via the
search fields.

## Resulting decision

Task 4 implements **path A**: `server.js` spawns
`claude --print --allowedTools=mcp__claude_ai_Kiwi_com__search-flight,mcp__claude_ai_lastminute_com__search_flights`
per search to run the Kiwi + lastminute MCP search headlessly, under a
least-privilege allowlist. No human-in-the-loop is required. The Google
Flights scraper still runs headlessly and deterministically alongside it.
