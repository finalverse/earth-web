// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// Reuses upstream's transport-neutral tool/schema and administrative geometry code.
import { defineTool, composeCatalog } from '../../src/tools/catalog.js';
import { decodeRing, polygonsContain } from '../../src/data/adminBoundaries.js';
import { distance, point, transform } from './geo.js';

export const VERSION = '0.1.0';
const str = { type: 'string', minLength: 1, maxLength: 128 };
const pos = {
  type: 'array',
  minItems: 2,
  maxItems: 3,
  items: { type: 'number' },
};
const limit = { type: 'integer', minimum: 1, maximum: 100 };
const schema = (properties, required) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const stamp = () => new Date().toISOString();
export function naturalEarthDataset(pack, sha256) {
  const features = pack.features.map((f, i) => ({
    type: 'Feature',
    id: `ne-${f.iso || 'unit'}-${i}`,
    properties: {
      name: f.name,
      iso: f.iso || null,
      type: f.type || 'Map unit',
    },
    geometry: {
      type: 'MultiPolygon',
      coordinates: f.polygons.map((poly) =>
        poly.map((encoded) => {
          const r = decodeRing(encoded, f.d ?? pack.meta.decimals);
          return [...r, r[0]];
        }),
      ),
    },
  }));
  return {
    id: 'natural-earth-countries',
    title: 'Countries and map units',
    version: pack.meta.commit,
    visibility: 'public',
    features,
    provenance: {
      source: pack.meta.url,
      source_commit: pack.meta.commit,
      source_sha256: pack.meta.sha256,
      content_sha256: sha256,
      license: 'Public domain',
      license_url: 'https://www.naturalearthdata.com/about/terms-of-use/',
      attribution:
        'Made with Natural Earth; curated by God’s Eye View contributors',
      crs: 'OGC:CRS84',
      units: 'degrees',
      time: { kind: 'static_reference', observed_at: null },
      quality:
        'Generalized reference polygons; not navigation, legal boundaries or current observations.',
      curation: pack.meta.curation,
    },
  };
}
export function createEarthCore({
  datasets = [],
  principal = { id: 'anonymous' },
  allowedTools = null,
} = {}) {
  if (typeof principal?.id !== 'string' || !principal.id)
    throw new Error('Trusted principal required.');
  const principalId = principal.id;
  const registry = new Map();
  for (const dataset of datasets) {
    if (
      registry.has(dataset.id) ||
      !dataset.id ||
      !Array.isArray(dataset.features) ||
      dataset.features.length > 10000 ||
      !dataset.provenance?.license
    )
      throw new Error('Invalid operator dataset.');
    registry.set(dataset.id, structuredClone(dataset));
  }
  const visible = (d) =>
    d.visibility === 'public' ||
    (principalId !== 'anonymous' &&
      typeof d.owner_id === 'string' &&
      d.owner_id === principalId);
  const get = (id) => {
    const d = registry.get(id);
    if (!d || !visible(d)) throw new Error('Dataset unavailable.');
    return d;
  };
  const publicMetadata = (d) => ({
    id: d.id,
    title: d.title,
    version: d.version,
    feature_count: d.features.length,
    provenance: structuredClone(d.provenance),
  });
  function result(d, features, summary, extra = {}) {
    return {
      summary,
      data: {
        type: 'FeatureCollection',
        features: structuredClone(features),
        ...extra,
      },
      provenance: {
        ...structuredClone(d.provenance),
        dataset_id: d.id,
        dataset_version: d.version,
        processed_at: stamp(),
      },
    };
  }
  function tool(name, title, inputSchema, run) {
    return defineTool({
      name,
      title,
      description: title,
      kind: 'query',
      inputSchema,
      run,
    });
  }
  const tools = [
    tool('list_layers', 'List authorized datasets', schema({}, []), () => ({
      summary: 'Authorized reference layers',
      data: {
        layers: [...registry.values()].filter(visible).map(publicMetadata),
      },
    })),
    tool(
      'search_features',
      'Search geographic feature names',
      schema({ dataset: str, query: str, limit }, ['dataset', 'query']),
      (args) => {
        const d = get(args.dataset),
          q = args.query.trim().normalize('NFKD').toLowerCase();
        if (!q) throw new Error('Search text required.');
        const rows = d.features.filter((f) =>
          f.properties.name.normalize('NFKD').toLowerCase().includes(q),
        );
        return result(
          d,
          rows.slice(0, args.limit ?? 20),
          `${rows.length} matching reference features`,
          { total: rows.length, truncated: rows.length > (args.limit ?? 20) },
        );
      },
    ),
    tool(
      'contains_point',
      'Find generalized polygons containing a WGS84 point',
      schema({ dataset: str, point: pos, limit }, ['dataset', 'point']),
      (args) => {
        point(args.point);
        const d = get(args.dataset);
        const rows = d.features.filter((f) =>
          polygonsContain(f.geometry.coordinates, args.point[1], args.point[0]),
        );
        return result(
          d,
          rows.slice(0, args.limit ?? 20),
          `${rows.length} reference polygons contain this point`,
          {
            boundary_model: 'planar generalized source polygons',
            total: rows.length,
          },
        );
      },
    ),
    tool(
      'bbox_candidates',
      'Find polygon-envelope candidates, including across the dateline',
      schema(
        {
          dataset: str,
          bbox: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: { type: 'number' },
          },
          limit,
        },
        ['dataset', 'bbox'],
      ),
      (args) => {
        const [w, s, e, n] = args.bbox;
        if (
          !args.bbox.every(Number.isFinite) ||
          w < -180 ||
          w > 180 ||
          e < -180 ||
          e > 180 ||
          s < -90 ||
          n > 90 ||
          s > n
        )
          throw new Error('Invalid [west,south,east,north] extent.');
        const intervals =
            w <= e
              ? [[w, e]]
              : [
                  [w, 180],
                  [-180, e],
                ],
          d = get(args.dataset);
        const rows = d.features.filter((f) =>
          f.geometry.coordinates.some(([ring]) => {
            const xs = ring.map((p) => p[0]),
              ys = ring.map((p) => p[1]);
            return (
              Math.max(...ys) >= s &&
              Math.min(...ys) <= n &&
              intervals.some(
                ([a, b]) => Math.min(...xs) <= b && Math.max(...xs) >= a,
              )
            );
          }),
        );
        return result(
          d,
          rows.slice(0, args.limit ?? 20),
          `${rows.length} envelope candidates`,
          {
            total: rows.length,
            approximation: 'Envelope overlap; not exact polygon intersection.',
          },
        );
      },
    ),
    tool(
      'measure_distance',
      'Measure WGS84 ellipsoidal surface distance',
      schema({ from: pos, to: pos }, ['from', 'to']),
      (args) => ({
        summary: 'Ellipsoidal geodesic distance',
        data: {
          distance_m: distance(args.from, args.to),
          units: 'm',
          altitude_used: false,
        },
        provenance: {
          method: 'GeographicLib WGS84 inverse geodesic',
          crs: 'EPSG:4979',
          processed_at: stamp(),
        },
      }),
    ),
    tool(
      'transform_coordinates',
      'Transform WGS84 geodetic/ECEF coordinates',
      schema(
        {
          position: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: { type: 'number' },
          },
          from: str,
          to: str,
        },
        ['position', 'from', 'to'],
      ),
      (args) => ({
        summary: 'Deterministic coordinate transformation',
        data: {
          position: transform(args.position, args.from, args.to),
          crs: args.to,
          units: args.to === 'EPSG:4978' ? 'm' : 'degrees,degrees,m',
        },
        provenance: {
          method: 'Proj4js WGS84 geocentric transformation',
          vertical_datum: 'WGS84_ELLIPSOID',
          processed_at: stamp(),
        },
      }),
    ),
  ].filter((t) => allowedTools === null || allowedTools.includes(t.name));
  const catalog = composeCatalog({ tools });
  return {
    layers: () => [...registry.values()].filter(visible).map(publicMetadata),
    definitions: () =>
      catalog.list().map((t) => ({
        name: t.name,
        title: t.title,
        inputSchema: t.inputSchema,
      })),
    features(id) {
      const d = get(id);
      return result(d, d.features, d.title);
    },
    async execute(plan, { signal } = {}) {
      if (
        !plan ||
        plan.schema_version !== 1 ||
        Object.keys(plan).some(
          (k) => !['schema_version', 'tool', 'arguments'].includes(k),
        )
      )
        throw new Error('Invalid versioned query plan.');
      const started = performance.now();
      const value = await catalog.call(plan.tool, plan.arguments, { signal });
      return {
        schema_version: 1,
        plan: structuredClone(plan),
        ...value,
        elapsed_ms: performance.now() - started,
      };
    },
  };
}
