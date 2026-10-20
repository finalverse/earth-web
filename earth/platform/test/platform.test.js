import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { fixture, manifest, datasets, renewable } from './fixtures.mjs';
import { installApplications } from '../applications.js';
import { validateManifest } from '../manifest.js';
import { createEarthCore } from '../../core/index.js';
import { EarthClient } from '../../../packages/earth/dist/index.js';
const spec = JSON.parse(
  await readFile(new URL('../../contracts/openapi.json', import.meta.url)),
);
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({
  $id: 'https://finalverse.com/contracts/v1',
  components: spec.components,
});
const check = (name, value) => {
  const f = ajv.compile({
    $ref: 'https://finalverse.com/contracts/v1#/components/schemas/' + name,
  });
  assert.ok(f(value), JSON.stringify(f.errors));
};
test('external runtime validation preserves grants and does not pre-execute a proposal', async (t) => {
  const { url, core } = await fixture(t);
  let executions = 0;
  const execute = core.execute;
  core.execute = async (...args) => {
    executions++;
    return execute(...args);
  };
  const response = await fetch(
    url + '/v1/apps/' + manifest.id + '/query/validate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_version: 1,
        tool: 'within_distance',
        arguments: renewable,
      }),
    },
  );
  assert.equal(response.status, 200);
  const proposal = await response.json();
  assert.equal(proposal.requires_review, true);
  check('QueryRequest', proposal.plan);
  assert.equal(executions, 0);
  const denied = await fetch(
    url + '/v1/apps/' + manifest.id + '/query/validate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema_version: 1,
        tool: 'execute_sql',
        arguments: { sql: 'DELETE' },
      }),
    },
  );
  assert.equal(denied.status, 403);
  assert.equal(executions, 0);
});
test('OpenAPI, actual tool schemas and SDK requests agree with live response contracts', async (t) => {
  const { url, core } = await fixture(t),
    c = new EarthClient({ endpoint: url, applicationId: manifest.id });
  assert.equal(spec.openapi, '3.1.1');
  check('ApplicationManifest', manifest);
  assert.equal(
    spec.components.schemas.QueryRequest.oneOf.length,
    core.definitions().length,
  );
  for (const tool of core.definitions()) {
    const schema = spec.components.schemas.QueryRequest.oneOf.find(
      (x) => x.properties.tool.const === tool.name,
    );
    assert.deepEqual(schema.properties.arguments, tool.inputSchema);
  }
  check('Capabilities', await c.capabilities.get());
  check('DatasetPage', await c.datasets.list({ limit: 2 }));
  check(
    'FeaturePage',
    await c.datasets.features('wri-canada-power-plants', { limit: 3 }),
  );
  const q = await c.spatial.withinRadius(renewable);
  check('QueryRequest', q.plan);
  check('QueryResult', q);
  assert.equal(q.data.total, 24);
  const temporal = await c.temporal.query('features_during_interval', {
    dataset: 'usgs-ridgecrest-2019',
    start: '2019-07-04T00:00:00Z',
    end: '2019-07-08T00:00:00Z',
  });
  check('QueryResult', temporal);
  assert.equal(temporal.data.total, 90);
  const r = await fetch(url + '/v1/apps/' + manifest.id + '/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema_version: 1,
      tool: 'execute_sql',
      arguments: {},
    }),
  });
  assert.equal(r.status, 403);
  check('Error', await r.json());
  const served = await (await fetch(url + '/v1/openapi.json')).json();
  delete served.request_id;
  assert.deepEqual(served, spec);
});
test('invalid manifests, privilege requests, duplicates and oversized budgets are rejected', () => {
  for (const mutate of [
    (m) => (m.entry = 'https://remote.invalid/app.js'),
    (m) => (m.entry = './../index.html'),
    (m) => (m.runtime = 'remote-plugin'),
    (m) => (m.manifest_version = '2'),
    (m) => m.capabilities.push('os.shell'),
    (m) => m.capabilities.push(m.capabilities[0]),
    (m) => (m.budgets.max_features = 101),
    (m) => (m.extra = 'secret'),
  ]) {
    const m = structuredClone(manifest);
    mutate(m);
    assert.throws(() => validateManifest(m));
    check('ApplicationManifest', manifest);
    const f = ajv.compile(spec.components.schemas.ApplicationManifest);
    if (
      m.entry.includes('..') ||
      m.capabilities.includes('os.shell') ||
      m.runtime === 'remote-plugin' ||
      m.extra ||
      m.manifest_version === '2' ||
      m.budgets.max_features === 101
    )
      assert.equal(f(m), false);
  }
  const core = createEarthCore({ datasets });
  const g = structuredClone(manifest);
  g.tools.push('execute_sql');
  assert.throws(() => installApplications(core, [{ manifest, grant: g }]));
});
test('server scopes enforce tools, all dataset references, place dependencies and resource budgets', async (t) => {
  const grant = structuredClone(manifest);
  grant.datasets = ['wri-canada-power-plants'];
  grant.capabilities = grant.capabilities.filter(
    (c) => c !== 'earth.temporal.query' && c !== 'earth.ai.plan',
  );
  grant.budgets = { max_features: 2, max_radius_m: 10000 };
  const { url } = await fixture(t, { applications: [{ manifest, grant }] }),
    c = new EarthClient({ endpoint: url, applicationId: manifest.id });
  const denied = [
    () => c.spatial.withinRadius(renewable),
    () =>
      c.spatial.query('spatial_join', {
        left: 'wri-canada-power-plants',
        right: 'natural-earth-countries',
        predicate: 'contains',
      }),
    () =>
      c.temporal.query('compare_snapshots', {
        dataset: 'wri-canada-power-plants',
        comparison_dataset: 'usgs-ridgecrest-2019',
        before: '2019-01-01T00:00:00Z',
        after: '2020-01-01T00:00:00Z',
      }),
    () => c.ai.propose('show Canada'),
    () => c.datasets.features('natural-earth-countries'),
  ];
  for (const call of denied)
    await assert.rejects(
      call,
      (e) =>
        e.status === 403 && e.code === 'CAPABILITY_DENIED' && !!e.requestId,
    );
  const r = await c.spatial.withinRadius({
    dataset: 'wri-canada-power-plants',
    point: [-73.57, 45.5],
    radius_m: 10000,
  });
  assert.ok(r.data.features.length <= 2);
  const page = await c.datasets.features('wri-canada-power-plants');
  assert.equal(page.items.length, 2);
  assert.equal(page.page.limit, 2);
  const layers = [];
  for await (const p of c.datasets.pages()) layers.push(...p.items);
  assert.equal(layers.length, 1);
  const missing = new EarthClient({
    endpoint: url,
    applicationId: 'unknown.application',
  });
  await assert.rejects(
    () => missing.capabilities.get(),
    (e) => e.status === 403,
  );
  // Anonymous v0.3 public data remains public, not a sandbox bypass into private data.
  const base = new EarthClient({ endpoint: url });
  assert.equal((await base.datasets.list()).items.length, 4);
});
test('cursor iteration is bounded, immutable-snapshot aware and validates cursor content', async (t) => {
  const { url } = await fixture(t),
    c = new EarthClient({ endpoint: url, applicationId: manifest.id });
  const ids = [];
  for await (const p of c.datasets.featurePages('usgs-ridgecrest-2019', {
    limit: 17,
  }))
    ids.push(...p.items.map((f) => f.id));
  assert.equal(new Set(ids).size, 90);
  const first = await c.datasets.list({ limit: 1 });
  assert.ok(first.page.next_cursor);
  for (const cursor of [
    'not.json',
    'a'.repeat(513),
    Buffer.from(
      JSON.stringify({
        dataset: 'catalog',
        snapshot: first.page.snapshot,
        offset: -1,
      }),
    ).toString('base64url'),
  ])
    await assert.rejects(
      () => c.datasets.list({ cursor }),
      (e) => e.status === 400,
    );
  const cursor = Buffer.from(
    JSON.stringify({ dataset: 'catalog', snapshot: 'changed', offset: 1 }),
  ).toString('base64url');
  await assert.rejects(
    () => c.datasets.list({ cursor }),
    (e) => e.status === 409 && e.code === 'CONFLICT',
  );
});
test('model proposals validate but do not pre-execute tools, and correlation IDs survive transport', async (t) => {
  let executed = 0;
  const core = createEarthCore({ datasets }),
    wrapped = {
      ...core,
      async execute(...args) {
        executed++;
        return core.execute(...args);
      },
    };
  const { url } = await fixture(t, {
      core: wrapped,
      planner: {
        propose: async () => ({
          schema_version: 1,
          tool: 'within_distance',
          arguments: renewable,
        }),
      },
    }),
    c = new EarthClient({ endpoint: url, applicationId: manifest.id });
  const p = await c.ai.propose('Renewables within 100 km of Montréal');
  assert.equal(executed, 0);
  assert.equal(p.requires_review, true);
  const requestId = crypto.randomUUID(),
    r = await c.query(p.plan, { requestId });
  assert.equal(executed, 1);
  assert.equal(r.request_id, requestId);
  const bad = await fixture(t, {
    planner: {
      propose: async () => ({
        schema_version: 1,
        tool: 'within_distance',
        arguments: { ...renewable, point: [999, 0] },
      }),
    },
  });
  await assert.rejects(
    () =>
      new EarthClient({
        endpoint: bad.url,
        applicationId: manifest.id,
      }).ai.propose('bad'),
    (e) => e.status === 400,
  );
});
