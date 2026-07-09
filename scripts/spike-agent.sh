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
