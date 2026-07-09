// Small shared browser helpers.
window.postJSON = async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${url} → ${res.status}`);
  return res.json();
};
