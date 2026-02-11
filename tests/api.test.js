const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const dataFile = path.join(repoRoot, 'data', 'notes.json');
let server;

async function waitForServer(url, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (_err) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('Server did not start in time');
}

test.before(async () => {
  fs.writeFileSync(dataFile, JSON.stringify({ notes: [] }, null, 2));
  server = spawn('node', ['server.js'], {
    cwd: repoRoot,
    stdio: 'ignore',
    env: { ...process.env, PORT: '3300' }
  });
  await waitForServer('http://127.0.0.1:3300/api/health');
});

test.after(() => {
  if (server) server.kill('SIGTERM');
});

test('health endpoint works', async () => {
  const res = await fetch('http://127.0.0.1:3300/api/health');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('create and list notes works', async () => {
  const form = new FormData();
  form.append('title', 'Team update');
  form.append('content', 'Finish AWS rollout');
  form.append('labels', 'ops,release');
  form.append('pinned', 'true');

  const createRes = await fetch('http://127.0.0.1:3300/api/notes', {
    method: 'POST',
    body: form
  });

  assert.equal(createRes.status, 201);
  const note = await createRes.json();
  assert.equal(note.title, 'Team update');
  assert.equal(note.pinned, true);

  const listRes = await fetch('http://127.0.0.1:3300/api/notes?search=rollout');
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.equal(list.length, 1);
});
