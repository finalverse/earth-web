// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { OllamaPlanner } from '../../server/planner.js';
import { EarthClient } from '../../../packages/earth/dist/index.js';
import { WorkspaceStore, validateWorkspace } from '../../core/workspace.js';
import { createEarthCore } from '../../core/index.js';
import { dataset, feature } from '../../test/fixtures.js';

test('bounded generic queries choose the same stable source IDs regardless of backend storage order', async () => {
  const rows = [
    feature('z', [1, 1]),
    feature('a', [2, 2]),
    feature('b', [3, 3]),
  ];
  const plan = {
    schema_version: 1,
    tool: 'query_features',
    arguments: { dataset: 'test', limit: 2 },
  };
  const first = await createEarthCore({
    datasets: [dataset('test', rows)],
  }).execute(plan);
  const second = await createEarthCore({
    datasets: [dataset('test', [...rows].reverse())],
  }).execute(plan);
  assert.deepEqual(
    first.data.features.map((f) => f.id),
    ['a', 'b'],
  );
  assert.deepEqual(first.data.features, second.data.features);
  assert.equal(first.data.total, 3);
  assert.equal(first.data.truncated, true);
});

async function listen(t, handler) {
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(
    () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  );
  return 'http://127.0.0.1:' + server.address().port;
}

test('local provider and SDK refuse actual HTTP redirects without contacting the target', async (t) => {
  let escaped = 0;
  const target = await listen(t, (req, res) => {
    escaped++;
    res.end('{}');
  });
  const source = await listen(t, (req, res) => {
    res.writeHead(307, { Location: target + '/unreviewed' });
    res.end();
  });
  const planner = new OllamaPlanner({ endpoint: source + '/api/chat' });
  await assert.rejects(planner.discover());
  await assert.rejects(planner.propose('Private planning question'));
  const client = new EarthClient({ endpoint: source, retries: 2 });
  await assert.rejects(client.datasets.list(), { code: 'NETWORK_ERROR' });
  await assert.rejects(
    client.query({ schema_version: 1, tool: 'list_layers', arguments: {} }),
    { code: 'NETWORK_ERROR' },
  );
  assert.equal(
    escaped,
    0,
    'No redirected request, including a 307 POST body, may escape.',
  );
});

test('real in-flight SDK cancellation closes the request and preserves typed correlation', async (t) => {
  let closed;
  const disconnected = new Promise((r) => {
    closed = r;
  });
  const origin = await listen(t, (req, res) => {
    res.on('close', closed);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{'); // A response that never completes: cancel its body too.
  });
  const controller = new AbortController();
  const id = crypto.randomUUID();
  const promise = new EarthClient({ endpoint: origin }).datasets.list({
    signal: controller.signal,
    requestId: id,
  });
  setTimeout(() => controller.abort(), 40);
  await assert.rejects(
    promise,
    (error) => error.code === 'ABORTED' && error.requestId === id,
  );
  await Promise.race([
    disconnected,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection did not close.')), 1000),
    ),
  ]);
});

test('v0.3 receipt workspaces remain readable; malformed evidence cannot overwrite saved work', () => {
  const document = {
    schema_version: 1,
    id: 'v03',
    title: 'Legacy research',
    notes: '',
    application: 'energy',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    camera: {
      longitude: -73.5,
      latitude: 45.5,
      height: 500000,
      heading: 0,
      pitch: -1,
      roll: 0,
    },
    layers: [],
    selected_features: [],
    temporal_range: null,
    plan: null,
    receipt: {
      execution_id: crypto.randomUUID(),
      executed_at: '2026-10-01T00:00:00Z',
      plan_sha256: 'a'.repeat(64),
      core_version: '0.3.0',
      access: 'read-only',
    },
    provenance: [],
    saved_views: [],
  };
  let text = '[]';
  const store = new WorkspaceStore({
    getItem: () => text,
    setItem: (_, value) => {
      text = value;
    },
  });
  store.save(document);
  assert.deepEqual(
    validateWorkspace(JSON.parse(store.export('v03'))),
    document,
  );
  for (const invalid of [
    {},
    'claim',
    { ...document.receipt, access: 'write' },
    { ...document.receipt, executed_at: 'yesterday' },
    { ...document.receipt, plan_sha256: 'not-a-digest' },
  ]) {
    assert.throws(() =>
      store.import(JSON.stringify({ ...document, receipt: invalid })),
    );
    assert.equal(store.list().length, 1);
    assert.deepEqual(store.open('v03'), document);
  }
});
