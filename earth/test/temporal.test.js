// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEarthCore } from '../core/index.js';
import { createApplication } from '../core/application.js';
import { instant, interval } from '../core/time.js';
import { temporalCatalogs } from '../data/providers.js';
import { pointCatalogs } from '../data/catalogs.js';
import { feature, dataset } from './fixtures.js';
const call = (core, tool, args) =>
  core.execute({ schema_version: 1, tool, arguments: args });
const stamp = '2020-01-01T00:00:00.000Z',
  end = '2021-01-01T00:00:00.000Z';
function fixture() {
  const f = [
    feature('a', [179, 0]),
    feature('b', [-179, 0]),
    feature('north', [0, 90]),
  ];
  return dataset('test-time', f, {
    temporal: {
      schema_version: 1,
      kind: 'simulation',
      time_basis: 'observation_time',
      fields: [{ id: 'value', units: 'synthetic' }],
      observations: f.map((f, i) => ({
        id: f.id + '-observation',
        feature_id: f.id,
        field: 'value',
        value: i + 1,
        interval: { start: stamp, end },
        observed_at: stamp,
        event_at: null,
        valid_interval: null,
        ingested_at: end,
        source: 'https://example.org/synthetic',
      })),
    },
  });
}
test('strict UTC, invalid Gregorian dates, time zones, zero/reversed intervals', () => {
  assert.equal(instant('2020-02-29T00:00:00Z'), Date.parse('2020-02-29'));
  for (const s of [
    '2021-02-29T00:00:00Z',
    '2020-01-01',
    '2020-01-01T24:00:00Z',
    '2020-01-01T00:00:00+00:00',
    'not-a-date',
  ])
    assert.throws(() => instant(s));
  assert.throws(() => interval({ start: stamp, end: stamp }));
  assert.throws(() => interval({ start: end, end: stamp }));
});
test('snapshot interval boundaries, gaps, no interpolation and cancellation', async () => {
  const core = createEarthCore({ datasets: [fixture()] });
  assert.equal(
    (await call(core, 'features_at_time', { dataset: 'test-time', at: stamp }))
      .data.total,
    3,
  );
  const r = await call(core, 'features_at_time', {
    dataset: 'test-time',
    at: end,
  });
  assert.equal(r.data.total, 0);
  assert.equal(r.data.missing_observations, 3);
  assert.equal(r.data.analysis.interpolation, 'none');
  assert.equal(r.data.temporal.kind, 'simulation');
  await assert.rejects(() =>
    core.execute(
      {
        schema_version: 1,
        tool: 'features_at_time',
        arguments: { dataset: 'test-time', at: stamp },
      },
      { signal: AbortSignal.abort() },
    ),
  );
});
test('temporal distance across antimeridian and at poles uses ellipsoidal point distances', async () => {
  const core = createEarthCore({ datasets: [fixture()] });
  const r = await call(core, 'nearest_at_time', {
    dataset: 'test-time',
    point: [180, 0],
    at: stamp,
    limit: 2,
  });
  assert.equal(r.data.total, 3);
  assert.deepEqual(
    new Set(r.data.features.map((f) => f.id)),
    new Set(['a', 'b']),
  );
  const p = await call(core, 'nearest_at_time', {
    dataset: 'test-time',
    point: [0, 90],
    at: stamp,
    limit: 1,
  });
  assert.equal(p.data.features[0].id, 'north');
  await assert.rejects(
    call(core, 'nearest_at_time', { dataset: 'test-time', at: stamp }),
  );
});
test('interval intersection and complete aggregates respect clipping and source semantics', async () => {
  const core = createEarthCore({ datasets: [fixture()] });
  const r = await call(core, 'intersects_during_interval', {
    dataset: 'test-time',
    start: stamp,
    end,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [178, -1],
          [180, -1],
          [180, 1],
          [178, 1],
          [178, -1],
        ],
      ],
    },
  });
  assert.equal(r.data.total, 1);
  const a = await call(core, 'aggregate_over_time', {
    dataset: 'test-time',
    start: stamp,
    end,
    aggregation: 'mean',
    limit: 1,
  });
  assert.equal(a.data.aggregates[0].value, 2);
  assert.equal(a.data.total, 3);
  assert.equal(a.data.truncated, true);
});
test('snapshot/dataset version comparison distinguishes missing observations and modified values', async () => {
  const a = fixture(),
    b = fixture();
  b.id = 'test-next';
  b.version = '2';
  b.temporal.observations[0].value = 9;
  b.features[0].geometry.coordinates = [177, 0];
  const core = createEarthCore({ datasets: [a, b] });
  const r = await call(core, 'compare_snapshots', {
    dataset: a.id,
    comparison_dataset: b.id,
    before: stamp,
    after: stamp,
  });
  assert.equal(r.data.change_counts.changed, 1);
  assert.equal(r.data.changes[0].delta, 8);
  assert.equal(r.data.changes[0].geometry_changed, true);
  assert.equal(r.data.comparison_provenance.license, 'CC0-1.0');
  const gap = await call(core, 'spatial_changes', {
    dataset: a.id,
    before: stamp,
    after: end,
  });
  assert.equal(gap.data.change_counts.not_observed, 3);
  assert.equal(gap.data.changes[0].delta, null);
});
test('private temporal datasets and capability/limit boundaries fail closed', async () => {
  const d = fixture();
  d.visibility = 'private';
  d.owner_id = 'owner';
  const core = createEarthCore({ datasets: [d] });
  await assert.rejects(
    call(core, 'features_at_time', { dataset: d.id, at: stamp }),
  );
  const app = createApplication({
    manifest: {
      schema_version: 1,
      id: 'time-app',
      version: '1',
      datasets: [d.id],
      tools: ['features_at_time'],
      max_results: 1,
    },
    datasets: [d],
    principal: { id: 'owner' },
  });
  const r = await call(app, 'features_at_time', { dataset: d.id, at: stamp });
  assert.equal(r.data.features.length, 1);
  await assert.rejects(
    call(app, 'compare_snapshots', {
      dataset: d.id,
      before: stamp,
      after: end,
    }),
  );
});
test('temporal dataset validation rejects overlapping measurements and unbounded/ambiguous records', () => {
  for (const mutate of [
    (d) =>
      d.temporal.observations.push({
        ...d.temporal.observations[0],
        id: 'second',
      }),
    (d) => (d.temporal.observations[0].observed_at = null),
    (d) => (d.temporal.observations[0].feature_id = 'absent'),
    (d) => (d.temporal.observations[0].value = Infinity),
    (d) => (d.temporal.observations[0].interval.end = '2020-02-30T00:00:00Z'),
  ]) {
    const d = fixture();
    mutate(d);
    assert.throws(() => createEarthCore({ datasets: [d] }));
  }
});
test('real USGS archive retains 90 source identities/times and versioned provider contracts', async () => {
  const [d] = await temporalCatalogs();
  const core = createEarthCore({ datasets: [d] });
  assert.equal(d.features.length, 90);
  const r = await call(core, 'features_during_interval', {
    dataset: d.id,
    start: '2019-07-04T00:00:00Z',
    end: '2019-07-08T00:00:00Z',
  });
  assert.equal(r.data.total, 90);
  assert.equal(r.data.observations.length, 90);
  assert.equal(r.receipt.core_version, '0.3.0');
  const largest = d.features.find((f) => f.properties.magnitude === 7.1);
  assert.ok(largest);
  assert.equal(largest.properties.event_at, '2019-07-06T03:19:53.040Z');
  assert.equal(d.temporal.observations[0].observed_at, null);
  assert.equal(core.providers()[0].category, 'time-aware-observations');
  assert.ok(core.providers()[0].spatial_extent.length === 4);
});
test('Canada annual generation coverage is empty, not a zero-production inference', async () => {
  const [d] = await pointCatalogs();
  const core = createEarthCore({ datasets: [d] });
  const r = await call(core, 'aggregate_over_time', {
    dataset: d.id,
    start: '2013-01-01T00:00:00Z',
    end: '2020-01-01T00:00:00Z',
  });
  assert.equal(r.data.total, 0);
  assert.equal(r.data.missing_observations, 1159);
  assert.deepEqual(r.data.aggregates, []);
  assert.match(r.data.explanation, /No time observations/);
});
test('returned temporal observations are detached from the immutable registry', async () => {
  const core = createEarthCore({ datasets: [fixture()] });
  const p = { dataset: 'test-time', at: stamp };
  const r = await call(core, 'features_at_time', p);
  r.data.observations[0].value = 999;
  r.data.observations[0].interval.start = end;
  assert.equal(
    (await call(core, 'features_at_time', p)).data.observations[0].value,
    1,
  );
});
