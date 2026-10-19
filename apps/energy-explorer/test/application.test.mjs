import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validateApplicationManifest,
  LocalWorkspaces,
  EarthClient,
  IntelligenceSession,
} from '@finalverse/earth';
import {
  APP,
  initial,
  energyPlan,
  makeWorkspace,
  restoreWorkspace,
  selectedFeature,
} from '../.test-build/model.js';
const feature = {
  type: 'Feature',
  id: 'source-fixture',
  properties: { name: 'Synthetic test plant', fuel: 'Hydro', capacity_mw: 1 },
  geometry: { type: 'Point', coordinates: [-73.5, 45.5] },
};
const result = {
  schema_version: 1,
  plan: energyPlan(initial),
  summary: 'Synthetic fixture, not a source record',
  data: { type: 'FeatureCollection', features: [feature], total: 1 },
  receipt: {
    execution_id: crypto.randomUUID(),
    executed_at: '2026-10-19T00:00:00.000Z',
    plan_sha256: '0'.repeat(64),
    core_version: '0.4.0-dev.1',
    access: 'read-only',
  },
  elapsed_ms: 1,
};
const camera = {
  longitude: -73.5,
  latitude: 45.5,
  height: 500000,
  heading: 0,
  pitch: -Math.PI / 2,
  roll: 0,
};
test('independent app manifest is valid, bounded and requests no world, shell or network capability', async () => {
  const m = validateApplicationManifest(
    JSON.parse(await readFile(new URL('../earth-app.json', import.meta.url))),
  );
  assert.equal(m.id, APP);
  assert.equal(m.budgets.max_features, 100);
  assert.ok(m.tools.includes('cluster_features'));
  assert.ok(!m.capabilities.includes('earth.temporal.query'));
});
test('application snapshot export/import restores filters, selection, camera, evidence and isolated ID', () => {
  const map = new Map(),
    store = new LocalWorkspaces(APP, {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
    }),
    w = makeWorkspace({
      title: 'test',
      filters: initial,
      result,
      camera,
      selected: feature.id,
      layers: [],
    });
  store.save(w);
  const text = store.export(w.id),
    copy = store.import(text),
    restored = restoreWorkspace(store.open(copy.id));
  assert.notEqual(copy.id, w.id);
  assert.deepEqual(restored.filters, initial);
  assert.equal(restored.selected, feature.id);
  assert.deepEqual(restored.workspace.camera, camera);
  assert.deepEqual(restored.result.receipt, result.receipt);
  assert.equal(
    selectedFeature(restored.result, feature.id).properties.name,
    feature.properties.name,
  );
  const invalid = structuredClone(w);
  invalid.application_state.result.data.features[0].geometry.coordinates = [
    200, 45,
  ];
  assert.throws(() => restoreWorkspace(invalid), /geometry/);
  const mismatched = structuredClone(w);
  mismatched.application_state.result.receipt.execution_id =
    crypto.randomUUID();
  assert.throws(() => restoreWorkspace(mismatched), /evidence/);
});
test('application selection is included in planning context; review does not execute until explicit approval', async () => {
  const requests = [],
    client = new EarthClient({
      endpoint: 'http://localhost',
      applicationId: APP,
      fetch: async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) });
        return Response.json(
          url.endsWith('/ai/plan')
            ? {
                plan: energyPlan(initial),
                provider: 'fixture',
                requires_review: true,
              }
            : result,
        );
      },
    }),
    session = new IntelligenceSession(client);
  const proposal = await session.propose('Only hydro', {
    plan: result.plan,
    selected: { dataset: 'wri-canada-power-plants', feature_id: feature.id },
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.context.selected.feature_id, feature.id);
  await session.approve(proposal);
  assert.equal(requests.length, 2);
  assert.ok(requests[1].url.endsWith('/query'));
  assert.equal(
    session.replay().events.at(-1).payload.receipt.execution_id,
    result.receipt.execution_id,
  );
  session.close();
});
test('no private implementation imports or backend runtime dependency enter independent application', async () => {
  for (const f of ['main.ts', 'map.ts', 'model.ts']) {
    const source = await readFile(
      new URL('../src/' + f, import.meta.url),
      'utf8',
    );
    assert.ok(
      !/from\s+['"](?:\.\.\/){2,}|earth\/(?:core|server|web)|src\/app\//.test(
        source,
      ),
    );
  }
  const p = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url)),
  );
  assert.deepEqual(Object.keys(p.dependencies).sort(), [
    '@finalverse/earth',
    'cesium',
  ]);
  assert.ok(p.dependencies['@finalverse/earth'].endsWith('.tgz'));
});

test('saved display filters are bounded coordinates and malformed analysis is rejected before use', async () => {
  const { displayRings, resultFeatures } =
    await import('../.test-build/model.js');
  assert.throws(
    () =>
      displayRings([
        [
          [190, 0],
          [0, 0],
          [0, 1],
          [190, 0],
        ],
      ]),
    /filter/,
  );
  assert.throws(
    () =>
      resultFeatures({
        ...result,
        data: {
          ...result.data,
          fuel_groups: [
            {
              fuel: 'Hydro',
              count: 1,
              reported_capacity_mw: 'invented',
              missing_capacity: 0,
            },
          ],
        },
      }),
    /comparison/,
  );
  const rings = [
    [
      [-74, 45],
      [-73, 45],
      [-73, 46],
      [-74, 45],
    ],
  ];
  const w = makeWorkspace({
    title: 'Outline',
    filters: initial,
    result,
    camera,
    selected: null,
    layers: [],
    rings,
  });
  assert.deepEqual(restoreWorkspace(w).rings, rings);
});
