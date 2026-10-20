import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EarthClient,
  EarthError,
  LocalWorkspaces,
  validateWorkspace,
  createApplicationRuntime,
} from '../dist/index.js';
import { fixture, manifest } from '../../../earth/platform/test/fixtures.mjs';
const w = () => ({
  schema_version: 1,
  id: 'old-work',
  title: 'My archive',
  notes: 'Preserve me',
  application: 'energy',
  created_at: '2020-01-01T00:00:00Z',
  updated_at: '2020-01-01T00:00:00Z',
  camera: {
    longitude: -73.5,
    latitude: 45.5,
    height: 100000,
    heading: 0,
    pitch: -1,
    roll: 0,
  },
  layers: [],
  selected_features: [],
  temporal_range: null,
  plan: null,
  receipt: null,
  provenance: [],
  saved_views: [],
});
const storage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
test('SDK cancellation, timeout, safe retries, response caps and typed HTTP errors', async () => {
  const blocked = (_u, { signal }) =>
    new Promise((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      else
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
    });
  const c = new EarthClient({
    endpoint: 'http://127.0.0.1:18641',
    fetch: blocked,
    timeoutMs: 15,
  });
  await assert.rejects(
    () => c.capabilities.get(),
    (e) => e instanceof EarthError && e.code === 'TIMEOUT',
  );
  await assert.rejects(
    () => c.capabilities.get({ signal: AbortSignal.abort() }),
    (e) => e.code === 'ABORTED',
  );
  let calls = 0;
  const response = () =>
    new Response(JSON.stringify({ error: 'Busy', code: 'RATE_LIMITED' }), {
      status: 429,
      headers: { 'Retry-After': '0', 'X-Request-ID': crypto.randomUUID() },
    });
  const retry = new EarthClient({
    endpoint: 'http://127.0.0.1:18641',
    retries: 2,
    fetch: async () => {
      calls++;
      return response();
    },
  });
  await assert.rejects(
    () => retry.capabilities.get(),
    (e) => e.code === 'RATE_LIMITED' && e.status === 429,
  );
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(() =>
    retry.query({ schema_version: 1, tool: 'list_layers', arguments: {} }),
  );
  assert.equal(calls, 1);
  const large = new EarthClient({
    endpoint: 'http://127.0.0.1:18641',
    fetch: async () =>
      new Response('x', { headers: { 'Content-Length': '3000000' } }),
  });
  await assert.rejects(
    () => large.capabilities.get(),
    (e) => e.code === 'RESPONSE_TOO_LARGE',
  );
  for (const endpoint of [
    'https://u:p@example.com',
    'https://example.com/api/v1',
    'file:///private',
  ])
    assert.throws(() => new EarthClient({ endpoint }));
});
test('legacy workspaces migrate explicitly without overwriting, app stores isolate and reject credentials', () => {
  const s = storage();
  s.setItem('finalverse-earth-workspaces-v1', JSON.stringify([w()]));
  const a = new LocalWorkspaces(manifest.id, s),
    b = new LocalWorkspaces('other.application', s);
  const imported = a.importLegacy(JSON.stringify(w()), 'energy');
  assert.equal(imported.notes, 'Preserve me');
  assert.notEqual(imported.id, 'old-work');
  assert.deepEqual(JSON.parse(s.getItem('finalverse-earth-workspaces-v1')), [
    w(),
  ]);
  assert.equal(b.list().length, 0);
  assert.throws(() => b.open(imported.id));
  const exported = a.export(imported.id);
  assert.equal(exported, a.export(imported.id));
  a.import(exported);
  assert.equal(a.list().length, 2);
  const reopened = new LocalWorkspaces(manifest.id, s);
  assert.equal(reopened.open(imported.id).notes, 'Preserve me');
  assert.throws(() => b.import(exported));
  assert.throws(() =>
    a.save({
      ...imported,
      application_state: { config: { api_key: 'do-not-store' } },
    }),
  );
  assert.equal(validateWorkspace(w()).application, 'energy');
  assert.throws(() => a.import(JSON.stringify({ ...w(), schema_version: 9 })));
});
test('runtime checks real installation/version and workspace grants before starting', async (t) => {
  const { url } = await fixture(t),
    client = new EarthClient({ endpoint: url, applicationId: manifest.id }),
    runtime = createApplicationRuntime(manifest, {
      client,
      storage: storage(),
    });
  assert.equal(runtime.state, 'created');
  assert.throws(() => runtime.workspaces());
  await runtime.start();
  assert.equal(runtime.state, 'ready');
  assert.equal(runtime.workspaces().list().length, 0);
  runtime.stop();
  assert.equal(runtime.state, 'stopped');
  assert.throws(() => runtime.workspaces());
  const altered = createApplicationRuntime(
    { ...manifest, version: '9.0.0' },
    { client, storage: storage() },
  );
  await assert.rejects(() => altered.start(), /incompatible/);
});
test('default browser Fetch keeps its required global receiver and Retry-After respects the deadline', async () => {
  const original = globalThis.fetch;
  let c;
  try {
    globalThis.fetch = function () {
      assert.equal(this, globalThis);
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    };
    c = new EarthClient({ endpoint: 'http://127.0.0.1:18641' });
  } finally {
    globalThis.fetch = original;
  }
  assert.equal((await c.capabilities.get()).ok, true);
  let calls = 0;
  const limited = new EarthClient({
    endpoint: 'http://127.0.0.1:18641',
    timeoutMs: 20,
    retries: 1,
    fetch: async () => {
      calls++;
      return new Response('{}', {
        status: 429,
        headers: { 'Retry-After': '60' },
      });
    },
  });
  await assert.rejects(
    () => limited.capabilities.get(),
    (e) => e.code === 'TIMEOUT',
  );
  assert.equal(calls, 1);
});
