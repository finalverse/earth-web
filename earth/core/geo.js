// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import proj4 from 'proj4';
import geographic from 'geographiclib-geodesic';

const LLH = '+proj=longlat +datum=WGS84 +units=degrees +no_defs';
const XYZ = '+proj=geocent +datum=WGS84 +units=m +no_defs';
export function point(value) {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > 3 ||
    !value.every(Number.isFinite) ||
    Math.abs(value[0]) > 180 ||
    Math.abs(value[1]) > 90 ||
    (value.length === 3 && (value[2] < -12000 || value[2] > 100000000))
  )
    throw new Error(
      'Expected WGS84 [longitude, latitude, ellipsoidal height?] in metres.',
    );
  return value;
}
export function transform(position, from, to) {
  if (
    !['EPSG:4979', 'EPSG:4978'].includes(from) ||
    !['EPSG:4979', 'EPSG:4978'].includes(to)
  )
    throw new Error(
      'Supported CRS: EPSG:4979 (WGS84 ellipsoidal height) and EPSG:4978 (ECEF).',
    );
  if (
    !Array.isArray(position) ||
    position.length !== 3 ||
    !position.every(Number.isFinite)
  )
    throw new Error('Three finite coordinates required.');
  if (from === 'EPSG:4979') point(position);
  if (
    from === 'EPSG:4978' &&
    (Math.hypot(...position) < 1 || Math.hypot(...position) > 110000000)
  )
    throw new Error('ECEF point outside supported Earth extent.');
  const result =
    from === to
      ? [...position]
      : proj4(
          from === 'EPSG:4979' ? LLH : XYZ,
          to === 'EPSG:4979' ? LLH : XYZ,
          position,
        );
  if (!result.every(Number.isFinite))
    throw new Error('Coordinate transform failed.');
  if (to === 'EPSG:4979') point(result);
  return result;
}
export function distance(a, b) {
  point(a);
  point(b);
  return geographic.Geodesic.WGS84.Inverse(a[1], a[0], b[1], b[0]).s12;
}
function frame(anchor) {
  point(anchor);
  const lon = (anchor[0] * Math.PI) / 180,
    lat = (anchor[1] * Math.PI) / 180;
  return [
    [-Math.sin(lon), Math.cos(lon), 0],
    [
      -Math.sin(lat) * Math.cos(lon),
      -Math.sin(lat) * Math.sin(lon),
      Math.cos(lat),
    ],
    [
      Math.cos(lat) * Math.cos(lon),
      Math.cos(lat) * Math.sin(lon),
      Math.sin(lat),
    ],
  ];
}
export function toEnu(position, anchor) {
  const a = transform(anchor, 'EPSG:4979', 'EPSG:4978'),
    p = transform(position, 'EPSG:4979', 'EPSG:4978');
  return frame(anchor).map((row) =>
    row.reduce((sum, v, i) => sum + v * (p[i] - a[i]), 0),
  );
}
export function fromEnu(position, anchor) {
  if (
    !Array.isArray(position) ||
    position.length !== 3 ||
    !position.every(Number.isFinite)
  )
    throw new Error('Finite ENU coordinates required.');
  const rows = frame(anchor),
    a = transform(anchor, 'EPSG:4979', 'EPSG:4978');
  return transform(
    a.map(
      (v, i) => v + rows.reduce((s, row, j) => s + row[i] * position[j], 0),
    ),
    'EPSG:4978',
    'EPSG:4979',
  );
}
export function validateAnchor(a) {
  const keys = [
    'schema_version',
    'geo_anchor_id',
    'world_id',
    'region_id',
    'creator_id',
    'position',
    'crs',
    'vertical_datum',
    'heading_deg',
    'metres_per_unit',
    'local_origin',
    'visibility',
    'precision_decimals',
  ];
  if (
    !a ||
    Object.keys(a).some((k) => !keys.includes(k)) ||
    a.schema_version !== 1 ||
    ['geo_anchor_id', 'world_id', 'region_id', 'creator_id'].some(
      (k) => typeof a[k] !== 'string' || !a[k] || a[k].length > 128,
    ) ||
    a.crs !== 'EPSG:4979' ||
    a.vertical_datum !== 'WGS84_ELLIPSOID' ||
    !Number.isFinite(a.heading_deg) ||
    a.heading_deg < 0 ||
    a.heading_deg >= 360 ||
    !Number.isFinite(a.metres_per_unit) ||
    a.metres_per_unit < 0.1 ||
    a.metres_per_unit > 100 ||
    !['public', 'approximate', 'hidden'].includes(a.visibility) ||
    !Number.isInteger(a.precision_decimals) ||
    a.precision_decimals < 0 ||
    a.precision_decimals > 2 ||
    !Array.isArray(a.local_origin) ||
    a.local_origin.length !== 3 ||
    !a.local_origin.every(Number.isFinite)
  )
    throw new Error('Invalid versioned GeoAnchor.');
  if (a.position?.length !== 3)
    throw new Error('GeoAnchor needs ellipsoidal height.');
  point(a.position);
  return a;
}
export function localToEarth(position, a) {
  validateAnchor(a);
  if (
    !Array.isArray(position) ||
    position.length !== 3 ||
    !position.every(Number.isFinite) ||
    position[0] < 0 ||
    position[0] >= 256 ||
    position[1] < 0 ||
    position[1] >= 256 ||
    position[2] < 0 ||
    position[2] > 4096
  )
    throw new Error('Outside a 256 m region.');
  const d = position.map((v, i) => (v - a.local_origin[i]) * a.metres_per_unit),
    h = (a.heading_deg * Math.PI) / 180;
  return fromEnu(
    [
      d[0] * Math.cos(h) - d[1] * Math.sin(h),
      d[0] * Math.sin(h) + d[1] * Math.cos(h),
      d[2],
    ],
    a.position,
  );
}
export function earthToLocal(position, a) {
  validateAnchor(a);
  const d = toEnu(position, a.position),
    h = (a.heading_deg * Math.PI) / 180;
  const local = [
    d[0] * Math.cos(h) + d[1] * Math.sin(h),
    -d[0] * Math.sin(h) + d[1] * Math.cos(h),
    d[2],
  ].map((v, i) => v / a.metres_per_unit + a.local_origin[i]);
  // Use the same region boundary contract in both directions.
  localToEarth(local, a);
  return local;
}
export function publicAnchor(a) {
  validateAnchor(a);
  if (a.visibility === 'hidden') return null;
  const common = {
    schema_version: 1,
    geo_anchor_id: a.geo_anchor_id,
    world_id: a.world_id,
    region_id: a.region_id,
    visibility: a.visibility,
    crs: a.crs,
  };
  if (a.visibility === 'approximate')
    return {
      ...common,
      crs: 'OGC:CRS84',
      position: a.position
        .slice(0, 2)
        .map((v) => Number(v.toFixed(a.precision_decimals))),
      precision_decimals: a.precision_decimals,
    };
  return {
    ...common,
    position: [...a.position],
    vertical_datum: a.vertical_datum,
  };
}
