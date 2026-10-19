// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { booleanIntersects } from '@turf/boolean-intersects';
import { instant, interval, temporalMetadata } from './time.js';
import { distance, point } from './geo.js';
import { validateGeometry } from './registry.js';
import { resolvePlace } from './spatial.js';
export const TEMPORAL_TOOLS = [
  'features_at_time',
  'features_during_interval',
  'spatial_changes',
  'compare_snapshots',
  'aggregate_over_time',
  'nearest_at_time',
  'intersects_during_interval',
];
const text = { type: 'string', minLength: 1, maxLength: 160 },
  time = { type: 'string', minLength: 20, maxLength: 24 };
const common = {
  dataset: text,
  field: text,
  limit: { type: 'integer', minimum: 1, maximum: 100 },
  point: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 },
  place_id: text,
  radius_m: { type: 'number', minimum: 0.001, maximum: 500000 },
  fuels: {
    type: 'array',
    items: { type: 'string', maxLength: 40 },
    maxItems: 12,
  },
};
const schema = (p, r) => ({
  type: 'object',
  properties: p,
  required: r,
  additionalProperties: false,
});
export function temporalTools({ tool, registry, principal, result }) {
  function select(d, args, predicate) {
    let center = null;
    if (args.point && args.place_id)
      throw new Error('Choose a point or source place.');
    if (args.point) {
      point(args.point);
      center = args.point;
    }
    if (args.place_id)
      center = resolvePlace(registry, principal, args.place_id).position;
    if (args.radius_m && !center) throw new Error('Radius needs a center.');
    if (args.field && !d.temporal?.fields.some((f) => f.id === args.field))
      throw new Error('Temporal field unavailable.');
    const features = d.features.filter(
      (f) =>
        (!args.fuels || args.fuels.includes(f.properties.fuel)) &&
        (!args.radius_m ||
          (f.geometry.type === 'Point' &&
            distance(center, f.geometry.coordinates) <= args.radius_m)),
    );
    const ids = new Set(features.map((f) => f.id));
    const observations = (d.temporal?.observations || []).filter(
      (o) =>
        ids.has(o.feature_id) &&
        (!args.field || o.field === args.field) &&
        predicate(o),
    );
    return { features, observations, center };
  }
  const at = (t) => {
    const ms = instant(t);
    return (o) =>
      instant(o.interval.start) <= ms && instant(o.interval.end) > ms;
  };
  const during = (a, b) => {
    const [s, e] = interval({ start: a, end: b });
    return (o) => instant(o.interval.start) < e && instant(o.interval.end) > s;
  };
  function output(d, args, selection, extra = {}) {
    const ids = new Set(selection.observations.map((o) => o.feature_id));
    let features = selection.features.filter((f) => ids.has(f.id));
    if (extra.nearest) {
      if (!selection.center)
        throw new Error('Nearest needs a point or source place.');
      features.sort(
        (a, b) =>
          distance(selection.center, a.geometry.coordinates) -
          distance(selection.center, b.geometry.coordinates),
      );
    }
    const total = features.length,
      shown = features.slice(0, args.limit ?? 100),
      shownIds = new Set(shown.map((f) => f.id));
    return result(
      d,
      shown,
      `${total} features with source-supported temporal observations`,
      {
        total,
        truncated: total > shown.length,
        observations: selection.observations
          .filter((o) => shownIds.has(o.feature_id))
          .slice(0, 2000),
        observations_total: selection.observations.length,
        observations_truncated: selection.observations.length > 2000,
        temporal: temporalMetadata(d),
        missing_observations: selection.features.length - total,
        explanation:
          d.temporal?.explanation ||
          'No time observations: static geometry is not a historical fact.',
        analysis: {
          center: selection.center,
          radius_m: args.radius_m ?? null,
          time_basis: d.temporal?.time_basis ?? null,
          interpolation: 'none',
        },
        ...extra,
      },
    );
  }
  return [
    ...['features_at_time', 'nearest_at_time'].map((name) =>
      tool(
        name,
        'Source features at an explicit UTC instant',
        schema({ ...common, at: time }, ['dataset', 'at']),
        (args) => {
          const d = registry.get(args.dataset, principal);
          if (
            name === 'nearest_at_time' &&
            d.features.some((f) => f.geometry.type !== 'Point')
          )
            throw new Error('Point dataset required.');
          return output(d, args, select(d, args, at(args.at)), {
            at: args.at,
            nearest: name === 'nearest_at_time',
          });
        },
      ),
    ),
    ...[
      'features_during_interval',
      'intersects_during_interval',
      'aggregate_over_time',
    ].map((name) =>
      tool(
        name,
        'Analyze source observations during a half-open interval',
        schema(
          {
            ...common,
            start: time,
            end: time,
            ...(name === 'intersects_during_interval'
              ? { geometry: { type: 'object' } }
              : {}),
            ...(name === 'aggregate_over_time'
              ? {
                  aggregation: {
                    type: 'string',
                    enum: ['count', 'min', 'max', 'mean'],
                  },
                }
              : {}),
          },
          [
            'dataset',
            'start',
            'end',
            ...(name === 'intersects_during_interval' ? ['geometry'] : []),
          ],
        ),
        (args) => {
          const d = registry.get(args.dataset, principal),
            s = select(d, args, during(args.start, args.end));
          if (name === 'intersects_during_interval') {
            validateGeometry(args.geometry, { operand: true });
            s.features = s.features.filter((f) =>
              booleanIntersects(f.geometry, args.geometry),
            );
            const ids = new Set(s.features.map((f) => f.id));
            s.observations = s.observations.filter((o) =>
              ids.has(o.feature_id),
            );
          }
          let extra = { interval: { start: args.start, end: args.end } };
          if (name === 'aggregate_over_time') {
            const groups = new Map();
            for (const o of s.observations) {
              const key = JSON.stringify([
                o.field,
                o.interval.start,
                o.interval.end,
              ]);
              if (!groups.has(key))
                groups.set(key, {
                  field: o.field,
                  interval: o.interval,
                  values: [],
                });
              groups.get(key).values.push(o.value);
            }
            const aggregation = args.aggregation ?? 'count';
            extra.aggregates = [...groups.values()]
              .sort((a, b) => a.interval.start.localeCompare(b.interval.start))
              .map(({ field, interval, values }) => ({
                field,
                interval,
                count: values.length,
                aggregation,
                value:
                  aggregation === 'count'
                    ? values.length
                    : aggregation === 'min'
                      ? Math.min(...values)
                      : aggregation === 'max'
                        ? Math.max(...values)
                        : values.reduce((a, b) => a + b, 0) / values.length,
                units:
                  aggregation === 'count'
                    ? 'observations'
                    : d.temporal.fields.find((f) => f.id === field).units,
              }));
            if (extra.aggregates.length > 1000)
              throw new Error(
                'Aggregate output budget exceeded. Narrow the interval.',
              );
          }
          return output(d, args, s, extra);
        },
      ),
    ),
    ...['compare_snapshots', 'spatial_changes'].map((name) =>
      tool(
        name,
        'Compare available measurements, not inferred creation/deletion',
        schema(
          {
            ...common,
            before: time,
            after: time,
            comparison_dataset: text,
            window_start: time,
          },
          ['dataset', 'before', 'after'],
        ),
        (args) => {
          instant(args.before);
          instant(args.after);
          if (instant(args.before) > instant(args.after))
            throw new Error('Before must not follow after.');
          const d = registry.get(args.dataset, principal),
            other = args.comparison_dataset
              ? registry.get(args.comparison_dataset, principal)
              : d;
          if (
            args.window_start &&
            instant(args.window_start) > instant(args.before)
          )
            throw new Error('Window must start before the snapshots.');
          const predicate = (t) =>
            args.window_start
              ? instant(t) === instant(args.window_start)
                ? () => false
                : during(args.window_start, t)
              : at(t);
          const a = select(d, args, predicate(args.before)),
            b = select(other, args, predicate(args.after));
          if (
            JSON.stringify(d.temporal?.fields) !==
            JSON.stringify(other.temporal?.fields)
          )
            throw new Error('Comparable field contracts required.');
          const index = (rows) => {
            const map = new Map();
            for (const o of rows) {
              const k = JSON.stringify([o.feature_id, o.field]),
                previous = map.get(k);
              if (
                !previous ||
                instant(o.interval.start) > instant(previous.interval.start)
              )
                map.set(k, o);
            }
            return map;
          };
          const featuresBefore = new Map(d.features.map((f) => [f.id, f])),
            featuresAfter = new Map(other.features.map((f) => [f.id, f]));
          const left = index(a.observations),
            right = index(b.observations),
            changes = [];
          for (const key of new Set([...left.keys(), ...right.keys()])) {
            const before = left.get(key),
              after = right.get(key);
            const f = (before || after).feature_id;
            const fa = featuresBefore.get(f),
              fb = featuresAfter.get(f);
            const geometry_changed = !!(
              fa &&
              fb &&
              JSON.stringify(fa.geometry) !== JSON.stringify(fb.geometry)
            );
            changes.push({
              feature_id: f,
              field: (before || after).field,
              status: !before
                ? 'newly_observed'
                : !after
                  ? 'not_observed'
                  : before.value !== after.value || geometry_changed
                    ? 'changed'
                    : 'unchanged',
              before: before ?? null,
              after: after ?? null,
              delta: before && after ? after.value - before.value : null,
              geometry_changed,
            });
          }
          const total = changes.length,
            counts = Object.fromEntries(
              ['newly_observed', 'not_observed', 'changed', 'unchanged'].map(
                (k) => [k, changes.filter((c) => c.status === k).length],
              ),
            ),
            limited = changes.slice(0, args.limit ?? 100),
            ids = new Set(limited.map((c) => c.feature_id));
          return result(
            d,
            other.features.filter((f) => ids.has(f.id)),
            `${total} measurement comparisons`,
            {
              total,
              truncated: total > limited.length,
              changes: limited,
              change_counts: counts,
              window_start: args.window_start ?? null,
              comparison_provenance: structuredClone(other.provenance),
              before: args.before,
              after: args.after,
              temporal: temporalMetadata(d),
              explanation:
                'Missing reports do not prove creation, removal or zero output. No interpolation; geometry is the catalog reference, not surveyed historical position.',
            },
          );
        },
      ),
    ),
  ];
}
