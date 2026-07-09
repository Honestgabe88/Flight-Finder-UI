const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const VERDICT_FILE = path.join(__dirname, '..', 'docs', 'superpowers', 'spikes',
  '2026-07-09-headless-agent-mcp.md');

// Least-privilege allowlist: the headless agent may call ONLY these two read-only
// flight-search MCP tools. Everything else (Bash, Edit, Write, other MCP servers)
// stays behind the permission gate, which a non-interactive `--print` subprocess
// cannot satisfy — so a prompt-injection via the search fields cannot escalate to
// arbitrary actions. Confirmed working headlessly for both sources (spike doc).
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
