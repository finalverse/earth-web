// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { booleanContains } from '@turf/boolean-contains';
import { booleanIntersects } from '@turf/boolean-intersects';
import { bbox } from '@turf/bbox';
import clipping from 'polygon-clipping';
import geographic from 'geographiclib-geodesic';
import { point, distance, transform, toEnu, fromEnu } from './geo.js';
import { validateGeometry } from './registry.js';
export { RENEWABLE_FUELS } from './constants.js';
export const SPATIAL_TOOLS = [
  'distance',
  'buffer',
  'contains',
  'intersects',
  'nearest',
  'within_distance',
  'bounding_box',
  'spatial_join',
  'coordinate_transform',
  'query_features',
  'inspect_feature',
  'get_provenance',
];
const str = { type: 'string', minLength: 1, maxLength: 160 },
  pos = { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 },
  limit = { type: 'integer', minimum: 1, maximum: 100 };
const geometry = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: [
        'Point',
        'MultiPoint',
        'LineString',
        'MultiLineString',
        'Polygon',
        'MultiPolygon',
      ],
    },
    coordinates: { type: 'array', maxItems: 250000 },
  },
  required: ['type', 'coordinates'],
  additionalProperties: false,
};
const pointArgs = {
  dataset: str,
  point: pos,
  place_id: str,
  fuels: {
    type: 'array',
    items: { type: 'string', maxLength: 40 },
    maxItems: 12,
  },
  limit,
};
const extent = {
  type: 'array',
  items: { type: 'number' },
  minItems: 4,
  maxItems: 4,
};
const schema = (properties, required) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
export function resolvePlace(registry, principal, id) {
  const places = registry.get('natural-earth-places', principal),
    feature = places.features.find((f) => f.id === id);
  if (!feature) throw new Error('Place unavailable.');
  return {
    position: feature.geometry.coordinates,
    place: {
      id: feature.id,
      name: feature.properties.name,
      dataset_id: places.id,
      dataset_version: places.version,
      source: places.provenance.source,
    },
  };
}
export function geodesicBuffer(center, radius, steps = 128) {
  if (!Number.isInteger(steps) || steps < 16 || steps > 512)
    throw new Error('Buffer sampling budget is 16–512 steps.');
  point(center);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 500000)
    throw new Error('Buffer radius must be 0–500000 metres.');
  if (radius >= Math.min(distance(center, [0, 90]), distance(center, [0, -90])))
    throw new Error(
      'Pole-enclosing display buffers are unsupported; point distance queries remain available.',
    );
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const p = geographic.Geodesic.WGS84.Direct(
      center[1],
      center[0],
      (i * 360) / steps,
      radius,
    );
    let lon = p.lon2;
    while (lon - center[0] > 180) lon -= 360;
    while (lon - center[0] < -180) lon += 360;
    ring.push([lon, p.lat2]);
  }
  ring.push([...ring[0]]);
  const pieces = [];
  for (const shift of [-360, 0, 360]) {
    const intersection = clipping.intersection(
      [[ring]],
      [
        [
          [
            [shift - 180, -90],
            [shift + 180, -90],
            [shift + 180, 90],
            [shift - 180, 90],
            [shift - 180, -90],
          ],
        ],
      ],
    );
    for (const poly of intersection)
      pieces.push(
        poly.map((r) =>
          r.map(([x, y]) => [Math.max(-180, Math.min(180, x - shift)), y]),
        ),
      );
  }
  return { type: 'MultiPolygon', coordinates: pieces };
}
function boxParts(values) {
  const [w, s, e, n] = values;
  if (
    !values.every(Number.isFinite) ||
    Math.abs(w) > 180 ||
    Math.abs(e) > 180 ||
    Math.abs(s) > 90 ||
    Math.abs(n) > 90 ||
    s >= n ||
    w === e
  )
    throw new Error('Non-empty [west,south,east,north] bounds required.');
  return (
    w < e
      ? [[w, e]]
      : [
          [w, 180],
          [-180, e],
        ]
  ).map(([a, b]) => ({
    type: 'Polygon',
    coordinates: [
      [
        [a, s],
        [b, s],
        [b, n],
        [a, n],
        [a, s],
      ],
    ],
  }));
}
export function spatialTools({
  tool,
  registry,
  principal,
  result,
  backend = null,
}) {
  const get = (id) => registry.get(id, principal);
  const center = (args) => {
    if (!!args.point === !!args.place_id)
      throw new Error(
        'Supply exactly one explicit point or authorized place ID.',
      );
    return args.point
      ? { position: point(args.point), place: null }
      : resolvePlace(registry, principal, args.place_id);
  };
  const selected = (d, rows, summary, args, extra = {}) =>
    result(d, rows.slice(0, args.limit ?? 20), summary, {
      total: rows.length,
      truncated: rows.length > (args.limit ?? 20),
      ...extra,
    });
  async function proximity(args, nearest) {
    const d = get(args.dataset),
      origin = center(args);
    if (d.features.some((f) => f.geometry.type !== 'Point'))
      throw new Error('Distance/nearest dataset must contain points.');
    if (nearest === false && args.radius_m === undefined)
      throw new Error('Radius required.');
    const records = backend
      ? await backend.proximity(
          d.id,
          origin.position,
          args.radius_m,
          args.fuels,
          principal,
        )
      : d.features
          .filter(
            (f) =>
              !args.fuels?.length || args.fuels.includes(f.properties.fuel),
          )
          .map((f) => ({
            feature: f,
            distance_m: distance(origin.position, f.geometry.coordinates),
          }))
          .filter(
            (r) => args.radius_m === undefined || r.distance_m <= args.radius_m,
          );
    records.sort(
      (a, b) =>
        a.distance_m - b.distance_m ||
        a.feature.id.localeCompare(b.feature.id, 'en'),
    );
    const shown = records.slice(0, args.limit ?? 20),
      capacity = records.reduce(
        (s, r) =>
          s +
          (Number.isFinite(r.feature.properties.capacity_mw)
            ? r.feature.properties.capacity_mw
            : 0),
        0,
      );
    return result(
      d,
      shown.map((r) => r.feature),
      `${records.length} matching facilities in this source snapshot`,
      {
        total: records.length,
        truncated: records.length > shown.length,
        measurements: shown.map((r) => ({
          feature_id: r.feature.id,
          distance_m: r.distance_m,
        })),
        analysis: {
          center: origin.position,
          place: origin.place,
          radius_m: args.radius_m ?? null,
          capacity_mw: capacity,
          capacity_meaning: 'Sum of reported source capacity, not live output.',
          method: 'WGS84 ellipsoidal surface distance; altitude ignored',
          backend: backend ? 'PostGIS' : 'embedded',
        },
        explanation: `${records.length} records match the requested filters in ${d.title}; ${shown.length} are shown. Reported capacity totals ${capacity.toFixed(2)} MW. This archival dataset is not a complete or current facility census.`,
      },
    );
  }
  async function topology(args, operation) {
    const d = get(args.dataset);
    validateGeometry(args.geometry, { operand: true });
    const [minX, minY, maxX, maxY] = bbox(args.geometry);
    const rows = backend
      ? await backend.topology(d.id, args.geometry, operation, principal)
      : registry
          .index(d.id, principal)
          .search({ minX, minY, maxX, maxY })
          .map((r) => r.feature)
          .filter((f) =>
            (operation === 'contains' ? booleanContains : booleanIntersects)(
              f.geometry,
              args.geometry,
            ),
          );
    rows.sort((a, b) => a.id.localeCompare(b.id, 'en'));
    return selected(d, rows, `${rows.length} ${operation} matches`, args, {
      method: `2D lon/lat simple-feature topology via ${backend ? 'PostGIS (see database derivation in provenance)' : 'Turf'}; contains excludes boundary-only matches.`,
    });
  }
  return [
    tool(
      'distance',
      'WGS84 ellipsoidal distance',
      schema({ from: pos, to: pos }, ['from', 'to']),
      (a) => ({
        summary: 'Ellipsoidal surface distance',
        data: {
          distance_m: distance(a.from, a.to),
          units: 'm',
          altitude_used: false,
        },
        provenance: { method: 'GeographicLib WGS84 inverse' },
      }),
    ),
    tool(
      'buffer',
      'Sample an ellipsoidal point buffer',
      schema(
        {
          point: pos,
          radius_m: { type: 'number', minimum: 1, maximum: 500000 },
        },
        ['point', 'radius_m'],
      ),
      (a) => ({
        summary: 'Derived geodesic point buffer',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'analysis-buffer',
              properties: { name: 'Derived analysis buffer' },
              geometry: geodesicBuffer(a.point, a.radius_m),
            },
          ],
          analysis: {
            center: a.point,
            radius_m: a.radius_m,
            steps: 128,
            approximation:
              '128 geodesic perimeter samples; straight segments approximate the boundary.',
          },
        },
        provenance: {
          method:
            'GeographicLib WGS84 Direct with polygon-clipping dateline split',
          crs: 'OGC:CRS84',
          kind: 'derived_analysis',
        },
      }),
    ),
    tool(
      'contains',
      'Find features containing a geometry',
      schema({ dataset: str, geometry, limit }, ['dataset', 'geometry']),
      (a) => topology(a, 'contains'),
    ),
    tool(
      'intersects',
      'Find intersecting features',
      schema({ dataset: str, geometry, limit }, ['dataset', 'geometry']),
      (a) => topology(a, 'intersects'),
    ),
    tool(
      'within_distance',
      'Find facilities within ellipsoidal distance',
      schema(
        {
          ...pointArgs,
          radius_m: { type: 'number', minimum: 1, maximum: 500000 },
        },
        ['dataset', 'radius_m'],
      ),
      (a) => proximity(a, false),
    ),
    tool(
      'cluster_features',
      'Group a complete bounded point selection using ellipsoidal edges',
      schema(
        {
          ...pointArgs,
          radius_m: { type: 'number', minimum: 1, maximum: 500000 },
          cluster_radius_m: { type: 'number', minimum: 1, maximum: 50000 },
        },
        ['dataset', 'radius_m', 'cluster_radius_m'],
      ),
      async (a) => {
        const output = await proximity(a, false),
          data = output.data;
        if (data.truncated)
          throw new Error(
            'Clustering requires a complete selection. Narrow the radius or fuel filter.',
          );
        const features = [...data.features].sort((x, y) =>
            x.id < y.id ? -1 : x.id > y.id ? 1 : 0,
          ),
          parent = features.map((_, i) => i),
          root = (i) => {
            while (parent[i] !== i) {
              parent[i] = parent[parent[i]];
              i = parent[i];
            }
            return i;
          };
        for (let i = 0; i < features.length; i++)
          for (let j = i + 1; j < features.length; j++)
            if (
              distance(
                features[i].geometry.coordinates,
                features[j].geometry.coordinates,
              ) <= a.cluster_radius_m
            )
              parent[root(j)] = root(i);
        const groups = new Map(),
          fuels = new Map();
        features.forEach((f, i) => {
          const r = root(i);
          if (!groups.has(r)) groups.set(r, []);
          groups.get(r).push(f.id);
          const fuel = String(f.properties.fuel || 'Unspecified');
          if (!fuels.has(fuel))
            fuels.set(fuel, {
              fuel,
              count: 0,
              reported_capacity_mw: 0,
              missing_capacity: 0,
              feature_ids: [],
            });
          const g = fuels.get(fuel);
          g.count++;
          g.feature_ids.push(f.id);
          if (Number.isFinite(f.properties.capacity_mw))
            g.reported_capacity_mw += f.properties.capacity_mw;
          else g.missing_capacity++;
        });
        data.clusters = [...groups.values()].map((ids) => ({
          id: 'cluster:' + ids[0],
          feature_ids: ids,
          count: ids.length,
        }));
        data.fuel_groups = [...fuels.values()].sort((x, y) =>
          x.fuel < y.fuel ? -1 : 1,
        );
        data.analysis.clustering = {
          method:
            'Single-link connected components; WGS84 ellipsoidal edge distances',
          edge_threshold_m: a.cluster_radius_m,
          complete: true,
          maximum_pair_tests: 4950,
        };
        output.summary = `${features.length} source facilities in ${data.clusters.length} connected groups`;
        data.explanation +=
          ' Groups use single-link connectivity, not density inference or grid connectivity. Group members can be farther apart than the edge threshold.';
        return output;
      },
    ),
    tool(
      'nearest',
      'Find nearest point features',
      schema(
        {
          ...pointArgs,
          radius_m: { type: 'number', minimum: 1, maximum: 20000000 },
        },
        ['dataset'],
      ),
      (a) => proximity(a, true),
    ),
    tool(
      'bounding_box',
      'Find features intersecting geographic bounds',
      schema({ dataset: str, bbox: extent, limit }, ['dataset', 'bbox']),
      async (a) => {
        const d = get(a.dataset),
          parts = boxParts(a.bbox);
        let rows;
        if (backend) rows = await backend.boundingBox(d.id, a.bbox, principal);
        else {
          const found = new Map();
          for (const g of parts) {
            const [minX, minY, maxX, maxY] = bbox(g);
            for (const { feature: f } of registry
              .index(d.id, principal)
              .search({ minX, minY, maxX, maxY }))
              if (booleanIntersects(f.geometry, g)) found.set(f.id, f);
          }
          rows = [...found.values()];
        }
        rows.sort((x, y) => x.id.localeCompare(y.id, 'en'));
        return selected(d, rows, `${rows.length} bounding-box matches`, a, {
          bbox: a.bbox,
        });
      },
    ),
    tool(
      'spatial_join',
      'Join authorized layers by spatial relation',
      schema(
        {
          left: str,
          right: str,
          predicate: { type: 'string', enum: ['contains', 'intersects'] },
          limit,
        },
        ['left', 'right', 'predicate'],
      ),
      async (a) => {
        const left = get(a.left),
          right = get(a.right),
          matches = [];
        let inspected = 0;
        if (left.features.length * right.features.length > 3000000)
          throw new Error('Spatial join budget exceeded.');
        if (backend)
          matches.push(
            ...(await backend.spatialJoin(
              left.id,
              right.id,
              a.predicate,
              principal,
            )),
          );
        else
          for (const l of left.features) {
            const [minX, minY, maxX, maxY] = bbox(l.geometry);
            for (const { feature: r } of registry
              .index(right.id, principal)
              .search({ minX, minY, maxX, maxY })) {
              if (++inspected > 100000)
                throw new Error('Spatial join candidate budget exceeded.');
              if (
                (a.predicate === 'contains'
                  ? booleanContains
                  : booleanIntersects)(l.geometry, r.geometry)
              )
                matches.push({ left_id: l.id, right_id: r.id });
            }
          }
        matches.sort(
          (x, y) =>
            x.left_id.localeCompare(y.left_id, 'en') ||
            x.right_id.localeCompare(y.right_id, 'en'),
        );
        return {
          summary: `${matches.length} spatial relationships`,
          data: {
            matches: matches.slice(0, a.limit ?? 20),
            total: matches.length,
            truncated: matches.length > (a.limit ?? 20),
          },
          provenance: {
            method: '2D simple-feature topology',
            inputs: [left, right].map((d) => ({
              dataset_id: d.id,
              version: d.version,
              ...d.provenance,
            })),
          },
        };
      },
    ),
    tool(
      'coordinate_transform',
      'Convert explicit WGS84/ECEF/Web Mercator/local ENU coordinates',
      schema(
        {
          position: { ...pos, minItems: 3 },
          from: {
            type: 'string',
            enum: ['EPSG:4979', 'EPSG:4978', 'EPSG:3857', 'LOCAL:ENU'],
          },
          to: { type: 'string', enum: ['EPSG:4979', 'EPSG:4978', 'EPSG:3857', 'LOCAL:ENU'] },
          anchor: { ...pos, minItems: 3 },
        },
        ['position', 'from', 'to'],
      ),
      (a) => {
        let p = a.position;
        if (a.from === 'LOCAL:ENU' || a.to === 'LOCAL:ENU') {
          if (!a.anchor)
            throw new Error('ENU requires a WGS84 ellipsoidal anchor.');
          point(a.anchor);
        }
        if (a.from === 'LOCAL:ENU') p = fromEnu(p, a.anchor);
        else if (a.from !== 'EPSG:4979')
          p = transform(p, a.from, 'EPSG:4979');
        else point(p);
        const output =
          a.to === 'LOCAL:ENU'
            ? toEnu(p, a.anchor)
            : a.to !== 'EPSG:4979'
              ? transform(p, 'EPSG:4979', a.to)
              : p;
        return {
          summary: 'Explicit coordinate conversion',
          data: {
            position: output,
            crs: a.to,
            axis_order:
              a.to === 'EPSG:4979'
                ? 'longitude,latitude,ellipsoidal_height'
                : a.to === 'LOCAL:ENU'
                  ? 'east,north,up'
                  : 'x,y,z',
            units: a.to === 'EPSG:4979' ? 'degrees,degrees,m' : 'm',
            anchor: a.anchor ?? null,
          },
          provenance: {
            method: 'Proj4js WGS84 / ECEF / Web Mercator with an explicit ECEF/ENU tangent frame',
            vertical_datum: 'WGS84_ELLIPSOID',
          },
        };
      },
    ),
    tool(
      'query_features',
      'Query an authorized dataset',
      schema(
        {
          dataset: str,
          query: { type: 'string', maxLength: 128 },
          country: { type: 'string', pattern: '^[A-Z]{3}$' },
          fuels: pointArgs.fuels,
          limit,
        },
        ['dataset'],
      ),
      (a) => {
        const d = get(a.dataset),
          q = (a.query || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        const rows = d.features
          .filter(
            (f) =>
              f.properties.name
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .includes(q) &&
              (!a.fuels?.length || a.fuels.includes(f.properties.fuel)) &&
              (!a.country || f.properties.country === a.country),
          )
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return selected(d, rows, `${rows.length} matching features`, a);
      },
    ),
    tool(
      'inspect_feature',
      'Inspect an authorized feature',
      schema({ dataset: str, feature_id: str }, ['dataset', 'feature_id']),
      (a) => {
        const d = get(a.dataset),
          f = d.features.find((f) => f.id === a.feature_id);
        if (!f) throw new Error('Feature unavailable.');
        return result(d, [f], f.properties.name);
      },
    ),
    tool(
      'get_provenance',
      'Inspect dataset provenance',
      schema({ dataset: str }, ['dataset']),
      (a) => {
        const d = get(a.dataset);
        return {
          summary: d.title,
          data: { dataset_id: d.id, version: d.version },
          provenance: structuredClone(d.provenance),
        };
      },
    ),
  ];
}
