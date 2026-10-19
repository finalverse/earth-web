// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, symlink, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEarthCore } from '../core/index.js';
import { defaultDataset } from '../server/main.js';
import { createEarthServer } from '../server/http.js';
import { EarthClient } from '../sdk.js';
import { OllamaPlanner } from '../server/planner.js';
import { publicWorlds } from '../adapters/mutsea.js';
import { DatasetRegistry } from '../core/registry.js';
const dataset = await defaultDataset();
async function server(t, options = {}) {
  const value = createEarthServer({
    core: createEarthCore({ datasets: [dataset] }),
    ...options,
  });
  await new Promise((resolve) => value.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        value.close(resolve);
        value.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${value.address().port}`;
}
test('headless SDK and browser routes use same data without AI or MutSea', async (t) => {
  const url = await server(t),
    client = new EarthClient(url);
  assert.equal((await client.layers()).layers.length, 1);
  const q = await client.query({
    schema_version: 1,
    tool: 'search_features',
    arguments: { dataset: dataset.id, query: 'Canada' },
  });
  assert.equal(q.data.features[0].properties.name, 'Canada');
  const state = await (await fetch(url + '/v1/status')).json();
  assert.equal(state.ai_enabled, false);
  assert.equal(state.mutsea_required, false);
  assert.deepEqual((await (await fetch(url + '/v1/worlds')).json()).worlds, []);
  assert.equal(
    (
      await fetch(url + '/v1/ai/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"question":"Canada"}',
      })
    ).status,
    503,
  );
});
test('host, origin, JSON schema and body bounds fail closed without leaking internals', async (t) => {
  const url = await server(t);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.get(
      url + '/v1/layers',
      { headers: { host: 'attacker.invalid' } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on('error', reject);
  });
  assert.equal(hostStatus, 403);
  assert.equal(
    (
      await fetch(url + '/v1/layers', {
        headers: { origin: 'https://attacker.invalid' },
      })
    ).status,
    403,
  );
  for (const value of [
    { schema_version: 1, tool: 'run_sql', arguments: { sql: 'select secret' } },
    { schema_version: 1, tool: 'list_layers', arguments: { extra: true } },
  ]) {
    const r = await fetch(url + '/v1/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
    assert.equal(r.status, 400);
    assert.ok(!(await r.text()).includes('secret'));
  }
  const tooLarge = await fetch(url + '/v1/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'x'.repeat(17000) }),
  });
  assert.equal(tooLarge.status, 413);
});
test('model plans require deterministic validation and explicit review', async (t) => {
  const valid = {
    schema_version: 1,
    tool: 'search_features',
    arguments: { dataset: dataset.id, query: 'Canada', limit: 20 },
  };
  let proposal = valid;
  const url = await server(t, { planner: { propose: async () => proposal } }),
    client = new EarthClient(url);
  const value = await client.propose('Show me Canada');
  assert.deepEqual(value.plan, valid);
  assert.equal(value.requires_review, true);
  proposal = { schema_version: 1, tool: 'delete_world', arguments: {} };
  await assert.rejects(client.propose('Delete a world'));
});
test('rate limit and optional fictional world references stay bounded', async (t) => {
  const url = await server(t, { worlds: publicWorlds });
  const catalog = await (await fetch(url + '/v1/worlds')).json();
  assert.equal(catalog.worlds.length, 5);
  assert.ok(
    catalog.worlds.every(
      (w) => w.geo_anchor === null && w.availability === 'unverified',
    ),
  );
  for (let i = 0; i < 119; i++)
    assert.equal((await fetch(url + '/v1/status')).status, 200);
  assert.equal((await fetch(url + '/v1/status')).status, 429);
  assert.throws(
    () => new OllamaPlanner({ endpoint: 'https://example.com/api/chat' }),
    /Local/,
  );
});

test('static serving confines real paths and emits the Cesium worker-compatible CSP', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'earth-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'web');
  await mkdir(root);
  await writeFile(join(root, 'index.html'), 'Earth fixture');
  await writeFile(join(directory, 'private.txt'), 'private fixture');
  const url = await server(t, { webRoot: root });
  const home = await fetch(url + '/');
  assert.equal(home.status, 200);
  assert.equal(await home.text(), 'Earth fixture');
  assert.ok(
    home.headers
      .get('content-security-policy')
      .includes("script-src 'self' blob:"),
  );
  if (process.platform !== 'win32') {
    await symlink(join(directory, 'private.txt'), join(root, 'escape.txt'));
    const escaped = await fetch(url + '/escape.txt');
    assert.equal(escaped.status, 404);
    assert.ok(!(await escaped.text()).includes('private fixture'));
  }
  const traversal = await fetch(url + '/%2e%2e%2fprivate.txt');
  assert.notEqual(traversal.status, 200);
});

test('operator registration shares the registry while anonymous/private access fails closed', async (t) => {
  const registry = new DatasetRegistry([dataset]),
    token = 'fixture_operator_token_'.repeat(2);
  const url = await server(t, {
    core: createEarthCore({ registry }),
    operatorCore: createEarthCore({
      registry,
      principal: { id: 'operator', canRegister: true },
    }),
    operatorToken: token,
  });
  const anonymous = new EarthClient(url),
    operator = new EarthClient(url, { token });
  const d = {
    id: 'private-fixture',
    title: 'Private test',
    version: '1',
    visibility: 'private',
    features: [
      {
        type: 'Feature',
        id: 'point',
        properties: { name: 'Private point' },
        geometry: { type: 'Point', coordinates: [0, 0] },
      },
    ],
    provenance: {
      crs: 'OGC:CRS84',
      license: 'CC0-1.0',
      license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      source: 'https://example.org/fixture',
      content_sha256: '0'.repeat(64),
    },
  };
  await assert.rejects(anonymous.registerDataset(d), /capability/);
  await operator.registerDataset(d);
  assert.equal((await operator.listLayers()).layers.length, 2);
  assert.equal((await anonymous.listLayers()).layers.length, 1);
  assert.equal(
    (await operator.inspectFeature(d.id, 'point')).data.features[0].id,
    'point',
  );
  await assert.rejects(anonymous.inspectFeature(d.id, 'point'));
  await assert.rejects(new EarthClient(url, { token: 'wrong' }).listLayers());
  await assert.rejects(operator.registerDataset(d));
  assert.equal((await anonymous.listLayers()).layers.length, 1);
});
test('v0.3 typed temporal AI proposals remain grounded and explicitly reviewed', async (t) => {
  const { temporalCatalogs } = await import('../data/providers.js');
  const { planIntent } = await import('../server/intents.js');
  const d = (await temporalCatalogs())[0],
    core = createEarthCore({ datasets: [d] });
  const intent = {
    intent: 'temporal_interval',
    query: 'Ridgecrest',
    place: '',
    radius_km: 0,
    renewable_only: false,
    start: '2019-07-04T00:00:00Z',
    end: '2019-07-08T00:00:00Z',
  };
  const url = await server(t, {
    core,
    planner: { propose: async () => planIntent(intent) },
  });
  const r = await new EarthClient(url).propose(
    'Show the Ridgecrest archive from July 4 to July 8, 2019',
  );
  assert.equal(r.requires_review, true);
  assert.equal(r.plan.tool, 'features_during_interval');
  assert.equal((await new EarthClient(url).query(r.plan)).data.total, 90);
  assert.throws(() => planIntent({ ...intent, start: '2019-02-30T00:00:00Z' }));
  assert.throws(() => planIntent({ ...intent, query: 'secret-dataset' }));
});
test('public reverse-proxy mode accepts only the configured HTTPS origin and keeps metrics private', async (t) => {
  const logs = [];
  const url = await server(t, {
    publicOrigin: 'https://earth.finalverse.com',
    logger: (x) => logs.push(x),
  });
  const r = await fetch(url + '/v1/status', {
    headers: {
      host: 'earth.finalverse.com',
      origin: 'https://earth.finalverse.com',
    },
  });
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('x-request-id'));
  assert.equal(
    (
      await fetch(url + '/v1/status', {
        headers: {
          host: 'earth.finalverse.com',
          origin: 'http://earth.finalverse.com',
        },
      })
    ).status,
    403,
  );
  assert.equal(
    await new Promise((resolve, reject) => {
      http
        .get(
          url + '/metrics',
          { headers: { host: 'earth.finalverse.com' } },
          (r) => {
            r.resume();
            resolve(r.statusCode);
          },
        )
        .on('error', reject);
    }),
    404,
  );
  assert.equal((await fetch(url + '/healthz')).status, 200);
  assert.equal((await fetch(url + '/readyz')).status, 200);
  assert.equal((await fetch(url + '/metrics')).status, 200);
  assert.ok(logs.length > 0);
  assert.ok(
    logs.every((x) => !('url' in x) && !('headers' in x) && !('ip' in x)),
  );
  assert.throws(() =>
    createEarthServer({
      core: createEarthCore(),
      publicOrigin: 'http://earth.finalverse.com',
    }),
  );
});
test('readiness detects a failed database/service without exposing details', async (t) => {
  const url = await server(t, {
    readyCheck: async () => {
      throw new Error('private database URL');
    },
  });
  const r = await fetch(url + '/readyz');
  assert.equal(r.status, 503);
  assert.ok(!(await r.text()).includes('private'));
});
