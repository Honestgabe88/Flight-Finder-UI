const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { PORT, CAPTURES_DIR, RESULTS_FILE, GFLIGHTS_FILE, MAXH } = require('./config');
const { spawn } = require('node:child_process');
const { mergeOptions } = require('./lib/merge');
const { runAgentSearch } = require('./lib/agentSearch');

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

if (require.main === module) {
  server.listen(PORT, () => console.log(`Cheap Flights UI on http://localhost:${PORT}`));
}
module.exports = { server };
