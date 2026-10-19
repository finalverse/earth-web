// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { validateTemporal } from './time.js';
import RBush from 'rbush';
import { bbox } from '@turf/bbox';
import { booleanValid } from '@turf/boolean-valid';
import { point } from './geo.js';

export function validateGeometry(geometry, { operand = false } = {}) {
  const depths = {
    Point: 0,
    MultiPoint: 1,
    LineString: 1,
    MultiLineString: 2,
    Polygon: 2,
    MultiPolygon: 3,
  };
  if (
    !geometry ||
    !Object.hasOwn(depths, geometry.type) ||
    Object.keys(geometry).some((k) => !['type', 'coordinates'].includes(k))
  )
    throw new Error('Supported GeoJSON geometry required.');
  let count = 0;
  const visit = (value, depth) => {
    if (depth === 0) {
      point(value);
      if (++count > 250000) throw new Error('Geometry vertex budget exceeded.');
      return;
    }
    if (!Array.isArray(value) || !value.length || value.length > 250000)
      throw new Error('Invalid coordinate array.');
    for (const child of value) visit(child, depth - 1);
  };
  visit(geometry.coordinates, depths[geometry.type]);
  const lines =
    geometry.type === 'LineString'
      ? [geometry.coordinates]
      : geometry.type === 'MultiLineString'
        ? geometry.coordinates
        : [];
  if (
    operand &&
    lines.some((line) =>
      line.some((p, i) => i && Math.abs(p[0] - line[i - 1][0]) > 180),
    )
  )
    throw new Error('Split antimeridian lines before topology queries.');
  if (lines.some((line) => line.length < 2))
    throw new Error('Line strings need at least two positions.');
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  for (const polygon of polygons)
    for (const ring of polygon) {
      if (
        ring.length < 4 ||
        ring[0][0] !== ring.at(-1)[0] ||
        ring[0][1] !== ring.at(-1)[1]
      )
        throw new Error('Closed polygon rings required.');
      if (
        operand &&
        ring.some((p, i) => i && Math.abs(p[0] - ring[i - 1][0]) > 180)
      )
        throw new Error(
          'Split antimeridian polygons before planar topology queries; distance and crossing bounding boxes are supported directly.',
        );
    }
  if (operand && !booleanValid(geometry))
    throw new Error('Invalid query topology.');
  return count;
}
function validateDataset(input, owner = null) {
  const d = structuredClone(input);
  if (
    !d ||
    !/^[-a-z0-9]{1,80}$/.test(d.id) ||
    typeof d.title !== 'string' ||
    d.title.length > 200 ||
    typeof d.version !== 'string' ||
    !d.version ||
    d.version.length > 128 ||
    !['public', 'private'].includes(d.visibility) ||
    !Array.isArray(d.features) ||
    d.features.length > 10000 ||
    !d.provenance?.license
  )
    throw new Error('Invalid operator dataset.');
  if (owner) d.owner_id = owner;
  let vertices = 0;
  const ids = new Set();
  for (const f of d.features) {
    if (
      f.type !== 'Feature' ||
      typeof f.id !== 'string' ||
      !f.id ||
      f.id.length > 160 ||
      ids.has(f.id) ||
      typeof f.properties?.name !== 'string' ||
      f.properties.name.length > 300
    )
      throw new Error('Invalid or duplicate feature identity.');
    ids.add(f.id);
    vertices += validateGeometry(f.geometry);
    if (vertices > 1500000) throw new Error('Dataset vertex budget exceeded.');
  }
  validateTemporal(d);
  return d;
}
export class DatasetRegistry {
  #items = new Map();
  #indexes = new Map();
  #registration = Promise.resolve();
  constructor(datasets = []) {
    for (const dataset of datasets) this.#insert(validateDataset(dataset));
  }
  #insert(dataset) {
    if (this.#items.has(dataset.id) || this.#items.size >= 16)
      throw new Error('Dataset exists or registry budget exceeded.');
    this.#items.set(dataset.id, dataset);
  }
  #visible(d, principal) {
    return (
      d.visibility === 'public' ||
      (principal.id !== 'anonymous' && d.owner_id === principal.id)
    );
  }
  get(id, principal) {
    const d = this.#items.get(id);
    if (!d || !this.#visible(d, principal))
      throw new Error('Dataset unavailable.');
    return d;
  }
  values(principal) {
    return [...this.#items.values()].filter((d) => this.#visible(d, principal));
  }
  index(id, principal) {
    const d = this.get(id, principal);
    let index = this.#indexes.get(id);
    if (!index) {
      index = new RBush();
      index.load(
        d.features.map((f) => {
          const [minX, minY, maxX, maxY] = bbox(f.geometry, {
            recompute: true,
          });
          return { minX, minY, maxX, maxY, feature: f };
        }),
      );
      this.#indexes.set(id, index);
    }
    return index;
  }
  async register(input, principal, persist = null) {
    if (
      principal?.canRegister !== true ||
      !principal.id ||
      principal.id === 'anonymous'
    )
      throw new Error('Dataset registration capability required.');
    if (Object.hasOwn(input, 'owner_id'))
      throw new Error(
        'Dataset owner is assigned by the authenticated operator.',
      );
    const d = validateDataset(input, principal.id);
    const p = d.provenance;
    if (p.crs !== 'OGC:CRS84')
      throw new Error(
        'Registered GeoJSON must explicitly declare OGC:CRS84 longitude/latitude degrees.',
      );
    d.registration = {
      id: crypto.randomUUID(),
      registered_at: new Date().toISOString(),
      principal_id: principal.id,
    };
    for (const field of ['source', 'license_url']) {
      const u = new URL(p[field]);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
        throw new Error('Explicit public source and license URLs required.');
    }
    if (!/^[a-f0-9]{64}$/.test(p.content_sha256 || ''))
      throw new Error('Dataset content checksum required.');
    const operation = this.#registration.then(async () => {
      if (this.#items.has(d.id) || this.#items.size >= 16)
        throw new Error('Dataset exists or registry budget exceeded.');
      if (persist) await persist(d, principal);
      this.#insert(d);
      return structuredClone({
        ...d,
        features: undefined,
        feature_count: d.features.length,
      });
    });
    this.#registration = operation.catch(() => {});
    return operation;
  }
}
