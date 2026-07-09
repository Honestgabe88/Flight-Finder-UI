const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Smoke test: 400 on bad body, 202 + id on good body. (Full job is exercised later.)
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
