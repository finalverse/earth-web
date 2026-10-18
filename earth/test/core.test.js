// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEarthCore } from '../core/index.js';
import { createApplication } from '../core/application.js';
import {
  distance,
  transform,
  toEnu,
  fromEnu,
  localToEarth,
  earthToLocal,
  publicAnchor,
} from '../core/geo.js';
import { defaultDataset } from '../server/main.js';
const dataset = await defaultDataset();
const plan = (tool, args) => ({ schema_version: 1, tool, arguments: args });
const near = (a, b, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
test('approved source pin, public-domain provenance and actual feature count', () => {
  assert.equal(dataset.features.length, 260);
  assert.equal(dataset.version, 'ca96624a56bd078437bca8184e78163e5039ad19');
  assert.equal(
    dataset.provenance.source_sha256,
    '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255',
  );
  assert.equal(dataset.provenance.license, 'Public domain');
  assert.equal(
    dataset.provenance.content_sha256,
    'b9f865783a8e539cd39ea6a0fb506c86482f04a5723fb48b6059b1c634456e50',
  );
  assert.equal(dataset.provenance.time.observed_at, null);
});
test('direct search and point containment return the real Canada feature', async () => {
  const core = createEarthCore({ datasets: [dataset] });
  const a = await core.execute(
    plan('search_features', { dataset: dataset.id, query: 'Canada', limit: 5 }),
  );
  const b = await core.execute(
    plan('contains_point', { dataset: dataset.id, point: [-75.7, 45.4] }),
  );
  assert.equal(a.data.features[0].properties.iso, 'CAN');
  assert.equal(b.data.features[0].id, a.data.features[0].id);
  assert.equal(a.data.features[0].geometry.type, 'MultiPolygon');
  assert.equal(a.provenance.crs, 'OGC:CRS84');
  a.data.features[0].properties.name = 'tampered';
  assert.equal(
    (await core.execute(a.plan)).data.features[0].properties.name,
    'Canada',
  );
});
test('holes, dateline envelopes and private layers respect their stated contract', async () => {
  const ring = (w, e) => [
    [w, -5],
    [e, -5],
    [e, 5],
    [w, 5],
    [w, -5],
  ];
  const f = (id, coordinates) => ({
    type: 'Feature',
    id,
    properties: { name: id },
    geometry: { type: 'MultiPolygon', coordinates },
  });
  const synthetic = {
    ...dataset,
    id: 'synthetic',
    features: [
      f('east', [[ring(178, 180)]]),
      f('west', [[ring(-180, -178)]]),
      f('hole', [[ring(-10, 10), ring(-2, 2)]]),
    ],
  };
  const secret = {
    ...dataset,
    id: 'private',
    title: 'Private layer title',
    visibility: 'private',
    owner_id: 'owner',
  };
  const core = createEarthCore({ datasets: [synthetic, secret] });
  assert.equal(core.layers().length, 1);
  assert.throws(() => core.features('private'), /unavailable/);
  assert.equal(
    createEarthCore({ datasets: [secret], principal: { id: 'owner' } }).layers()
      .length,
    1,
  );
  const a = await core.execute(
    plan('bbox_candidates', { dataset: 'synthetic', bbox: [179, -1, -179, 1] }),
  );
  assert.deepEqual(
    a.data.features.map((f) => f.id),
    ['east', 'west'],
  );
  assert.equal(
    (
      await core.execute(
        plan('contains_point', { dataset: 'synthetic', point: [0, 0] }),
      )
    ).data.total,
    0,
  );
});
test('known ECEF reference, poles, dateline and ellipsoidal geodesic references', () => {
  const equator = transform([0, 0, 0], 'EPSG:4979', 'EPSG:4978');
  near(equator[0], 6378137);
  near(equator[1], 0);
  near(equator[2], 0);
  near(
    transform([0, 90, 0], 'EPSG:4979', 'EPSG:4978')[2],
    6356752.314245,
    1e-5,
  );
  for (const p of [
    [179.9, 45, 400],
    [-179.9, -45, 0],
    [15, 89.9, 100],
  ])
    transform(
      transform(p, 'EPSG:4979', 'EPSG:4978'),
      'EPSG:4978',
      'EPSG:4979',
    ).forEach((v, i) => near(v, p[i], 1e-6));
  near(distance([0, 0], [1, 0]), 111319.49079327357, 1e-5);
  near(distance([0, 0], [180, 0]), 20003931.45862544, 1e-4);
  near(distance([179.9, 0], [-179.9, 0]), 22263.89815865, 1e-4);
});
test('ENU/GeoAnchor round trips preserve region frame; approximate public output strips exact coordinates', () => {
  const a = {
    schema_version: 1,
    geo_anchor_id: 'explicit-example',
    world_id: 'example',
    region_id: 'region',
    creator_id: 'private-owner',
    position: [12.123456, 45.123456, 100],
    crs: 'EPSG:4979',
    vertical_datum: 'WGS84_ELLIPSOID',
    heading_deg: 32,
    metres_per_unit: 1,
    local_origin: [128, 128, 20],
    visibility: 'approximate',
    precision_decimals: 2,
  };
  const local = [140, 140, 30],
    geo = localToEarth(local, a);
  earthToLocal(geo, a).forEach((v, i) => near(v, local[i]));
  const enu = [100, -50, 20];
  toEnu(fromEnu(enu, a.position), a.position).forEach((v, i) =>
    near(v, enu[i]),
  );
  const published = publicAnchor(a);
  assert.deepEqual(published.position, [12.12, 45.12]);
  for (const key of [
    'creator_id',
    'local_origin',
    'heading_deg',
    'metres_per_unit',
  ])
    assert.ok(!(key in published));
  assert.equal(publicAnchor({ ...a, visibility: 'hidden' }), null);
  assert.throws(() => localToEarth([256, 100, 20], a), /Outside/);
  assert.throws(
    () => localToEarth([100, 100, 20], { ...a, vertical_datum: 'unknown' }),
    /Invalid/,
  );
});
test('invalid coordinates, unsupported CRS, injected arguments and unknown actions fail closed', async () => {
  const core = createEarthCore({ datasets: [dataset] });
  for (const p of [
    plan('delete_world', {}),
    plan('search_features', {
      dataset: dataset.id,
      query: 'Canada',
      sql: 'DROP TABLE',
    }),
    plan('contains_point', { dataset: dataset.id, point: [0, 91] }),
    { ...plan('list_layers', {}), execute: 'code' },
  ])
    await assert.rejects(core.execute(p));
  assert.throws(() => transform([NaN, 0, 0], 'EPSG:4979', 'EPSG:4978'));
  assert.throws(() => transform([0, 0, 0], 'EPSG:4326', 'EPSG:4978'));
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    core.execute(plan('list_layers', {}), { signal: c.signal }),
  );
});
test('application capability and result budgets constrain queries without executing plugin code', async () => {
  const manifest = {
    schema_version: 1,
    id: 'example.country-explorer',
    version: '0.1.0',
    datasets: [dataset.id],
    tools: ['search_features'],
    max_results: 5,
  };
  const app = createApplication({ manifest, datasets: [dataset] });
  assert.equal(
    (
      await app.execute(
        plan('search_features', { dataset: dataset.id, query: 'Canada' }),
      )
    ).data.features.length,
    1,
  );
  await assert.rejects(
    app.execute(plan('measure_distance', { from: [0, 0], to: [1, 1] })),
  );
  await assert.rejects(
    app.execute(
      plan('search_features', { dataset: dataset.id, query: 'a', limit: 6 }),
    ),
  );
  assert.throws(() =>
    createApplication({
      manifest: { ...manifest, tools: ['arbitrary_code'] },
      datasets: [dataset],
    }),
  );
});
