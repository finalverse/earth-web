// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEarthCore } from '../core/index.js';
import { DatasetRegistry, validateGeometry } from '../core/registry.js';
import { pointCatalogs } from '../data/catalogs.js';
import { distance } from '../core/geo.js';
import { geodesicBuffer, RENEWABLE_FUELS } from '../core/spatial.js';
import { planIntent } from '../server/intents.js';
import { feature, dataset } from './fixtures.js';
const plan = (tool, args) => ({ schema_version: 1, tool, arguments: args });
const points = dataset('points', [
  feature('east', [179.8, 0]),
  feature('west', [-179.8, 0]),
  feature('origin', [0, 0]),
  feature('hole', [5, 5]),
  feature('inside', [1, 1]),
]);
const polygons = dataset('areas', [
  {
    type: 'Feature',
    id: 'area',
    properties: { name: 'Area with hole' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [4, 4],
          [4, 6],
          [6, 6],
          [6, 4],
          [4, 4],
        ],
      ],
    },
  },
]);
const core = createEarthCore({ datasets: [points, polygons] });
test('ellipsoidal distances and coordinate frames handle dateline, height and ENU', async () => {
  const r = await core.execute(
    plan('distance', { from: [179.8, 0, 20], to: [-179.8, 0, 900] }),
  );
  assert.ok(Math.abs(r.data.distance_m - 44527.7963173) < 0.001);
  assert.equal(r.data.altitude_used, false);
  const a = [-73.585243, 45.501945, 50],
    p = [-73.58, 45.51, 75];
  const enu = await core.execute(
    plan('coordinate_transform', {
      position: p,
      from: 'EPSG:4979',
      to: 'LOCAL:ENU',
      anchor: a,
    }),
  );
  const back = await core.execute(
    plan('coordinate_transform', {
      position: enu.data.position,
      from: 'LOCAL:ENU',
      to: 'EPSG:4979',
      anchor: a,
    }),
  );
  back.data.position.forEach((n, i) => assert.ok(Math.abs(n - p[i]) < 1e-6));
  await assert.rejects(
    core.execute(
      plan('coordinate_transform', {
        position: p,
        from: 'LOCAL:ENU',
        to: 'EPSG:4979',
      }),
    ),
    /anchor/,
  );
  await assert.rejects(
    core.execute(plan('distance', { from: [181, 0], to: [0, 0] })),
  );
});
test('buffer is derived, geodesic, split at dateline and rejects unsupported polar rings', () => {
  const g = geodesicBuffer([179.9, 0], 40000);
  assert.equal(g.coordinates.length, 2);
  for (const poly of g.coordinates)
    for (const ring of poly)
      for (const p of ring) {
        assert.ok(p[0] >= -180 && p[0] <= 180);
        if (Math.abs(p[0]) !== 180)
          assert.ok(Math.abs(distance([179.9, 0], p) - 40000) < 0.001);
      }
  assert.throws(() => geodesicBuffer([0, 89.9], 40000), /Pole/);
});
test('contains excludes boundary/hole, intersects includes boundary, bbox crosses dateline', async () => {
  const query = (tool, geometry) =>
    core.execute(plan(tool, { dataset: 'areas', geometry }));
  assert.equal(
    (await query('contains', { type: 'Point', coordinates: [1, 1] })).data
      .total,
    1,
  );
  assert.equal(
    (await query('contains', { type: 'Point', coordinates: [5, 5] })).data
      .total,
    0,
  );
  assert.equal(
    (await query('contains', { type: 'Point', coordinates: [0, 0] })).data
      .total,
    0,
  );
  assert.equal(
    (await query('intersects', { type: 'Point', coordinates: [0, 0] })).data
      .total,
    1,
  );
  const r = await core.execute(
    plan('bounding_box', { dataset: 'points', bbox: [179, -1, -179, 1] }),
  );
  assert.deepEqual(
    r.data.features.map((f) => f.id),
    ['east', 'west'],
  );
  await assert.rejects(
    core.execute(
      plan('bounding_box', { dataset: 'points', bbox: [1, 0, 1, 10] }),
    ),
  );
});
test('nearest uses exact distance, deterministic ties and explicit limits; join respects holes', async () => {
  const r = await core.execute(
    plan('nearest', { dataset: 'points', point: [180, 0], limit: 2 }),
  );
  assert.deepEqual(
    r.data.features.map((f) => f.id),
    ['east', 'west'],
  );
  assert.equal(r.data.truncated, true);
  const joined = await core.execute(
    plan('spatial_join', {
      left: 'areas',
      right: 'points',
      predicate: 'contains',
    }),
  );
  assert.deepEqual(joined.data.matches, [
    { left_id: 'area', right_id: 'inside' },
  ]);
});
test('registry capabilities, private ownership, immutable IDs and failed persistence are atomic', async () => {
  const registry = new DatasetRegistry(),
    alice = createEarthCore({
      registry,
      principal: { id: 'alice', canRegister: true },
    }),
    bob = createEarthCore({ registry, principal: { id: 'bob' } }),
    anon = createEarthCore({ registry });
  const d = dataset('private', [feature('secret', [0, 0])], {
    visibility: 'private',
  });
  await assert.rejects(anon.registerDataset(d), /capability/);
  await alice.registerDataset(d);
  assert.equal(alice.layers().length, 1);
  assert.equal(bob.layers().length, 0);
  assert.equal(anon.layers().length, 0);
  await assert.rejects(
    bob.execute(plan('nearest', { dataset: 'private', point: [0, 0] })),
    /unavailable/,
  );
  await assert.rejects(alice.registerDataset(d), /exists/);
  await assert.rejects(
    alice.registerDataset({ ...d, id: 'forged', owner_id: 'bob' }),
    /assigned/,
  );
  await assert.rejects(
    registry.register(
      { ...d, id: 'failed' },
      { id: 'alice', canRegister: true },
      async () => {
        throw new Error('disk failure');
      },
    ),
    /disk failure/,
  );
  assert.equal(alice.layers().length, 1);
  assert.throws(() =>
    validateGeometry({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      ],
    }),
  );
});
test('receipts hash normalized plans stably and returned objects cannot mutate registry', async () => {
  const p = plan('inspect_feature', {
      dataset: 'points',
      feature_id: 'inside',
    }),
    copy = structuredClone(p),
    a = await core.execute(p),
    b = await core.execute({
      ...p,
      arguments: { feature_id: 'inside', dataset: 'points' },
    });
  assert.deepEqual(p, copy);
  assert.equal(a.receipt.plan_sha256, b.receipt.plan_sha256);
  assert.notEqual(a.receipt.execution_id, b.receipt.execution_id);
  a.data.features[0].properties.name = 'changed';
  assert.equal(
    (await core.execute(p)).data.features[0].properties.name,
    'inside',
  );
  await assert.rejects(core.execute(plan('run_sql', { sql: 'SELECT secret' })));
});
test('real WRI/NE catalogs ground Montreal renewable query; AI cannot invent coordinates or places', async () => {
  const catalogs = await pointCatalogs(),
    c = createEarthCore({ datasets: catalogs }),
    places = catalogs.find((d) => d.id === 'natural-earth-places').features;
  const intent = {
    intent: 'energy_within_distance',
    query: '',
    place: 'Montreal',
    radius_km: 100,
    renewable_only: true,
  };
  const p = planIntent(intent, places),
    r = await c.execute(p);
  assert.equal(p.arguments.place_id, 'ne-place-1173');
  assert.deepEqual(p.arguments.fuels, RENEWABLE_FUELS);
  assert.equal(r.data.total, 24);
  assert.equal(r.data.features[0].id, 'CAN0008326');
  assert.ok(
    Math.abs(r.data.measurements[0].distance_m - 5507.843499599039) < 1e-5,
  );
  assert.ok(Math.abs(r.data.analysis.capacity_mw - 3104.2) < 1e-6);
  assert.equal(r.provenance.license, 'CC BY 4.0');
  assert.throws(
    () => planIntent({ ...intent, place: 'Invented City' }, places),
    /unambiguous/,
  );
  assert.throws(
    () => planIntent({ ...intent, coordinates: [0, 0] }, places),
    /Invalid/,
  );
  assert.throws(
    () => planIntent({ ...intent, radius_km: 501 }, places),
    /radius/,
  );
});

test('country-scoped place discovery provides complete Canadian grounding without global-limit bias', async () => {
  const catalogs = await pointCatalogs();
  const source = createEarthCore({ datasets: catalogs });
  const result = await source.execute(
    plan('query_features', {
      dataset: 'natural-earth-places',
      country: 'CAN',
      limit: 100,
    }),
  );
  assert.equal(result.data.total, 45);
  assert.equal(result.data.truncated, false);
  assert.ok(result.data.features.every((f) => f.properties.country === 'CAN'));
  assert.ok(result.data.features.some((f) => f.id === 'ne-place-1173'));
  await assert.rejects(
    source.execute(
      plan('query_features', {
        dataset: 'natural-earth-places',
        country: 'CA',
        limit: 100,
      }),
    ),
    /Invalid or unauthorized/,
  );
});
