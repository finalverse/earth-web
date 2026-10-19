// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import pg from 'pg';
import { readFile, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DatasetRegistry } from '../core/registry.js';
export function earthConnection(connectionString) {
  let u;
  try {
    u = new URL(connectionString);
  } catch {
    throw new Error('A valid dedicated Earth PostgreSQL URL is required.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    !/^\/earth_[a-z0-9_]+$/.test(u.pathname)
  )
    throw new Error(
      'Use a dedicated earth_* database; other databases are refused.',
    );
  return connectionString;
}
export async function connectionFile(path) {
  const info = await stat(path);
  if (process.platform !== 'win32' && info.mode & 0o077)
    throw new Error('Database URL file must be private (0600).');
  return earthConnection((await readFile(path, 'utf8')).trim());
}
export function poolFor(connectionString) {
  const pool = new pg.Pool({
    connectionString: earthConnection(connectionString),
    max: 4,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    query_timeout: 8000,
    application_name: 'finalverse-earth-v02',
  });
  // pg removes failed idle clients before emitting this event. Active query
  // errors still reject normally; a background disconnect must not crash Node.
  pool.on('error', (error) => {
    const code = /^[A-Z0-9]{5}$/.test(error.code || '')
      ? error.code
      : 'TRANSPORT';
    console.error(
      `[earth-db] idle connection lost (${code}); pool will reconnect on demand.`,
    );
  });
  return pool;
}
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(98640802)');
    await client.query('CREATE SCHEMA IF NOT EXISTS earth');
    await client.query(
      'CREATE TABLE IF NOT EXISTS earth.migrations (id text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const directory = new URL('./migrations/', import.meta.url);
    for (const file of (await readdir(directory))
      .filter((f) => /^\d{3}_[a-z_]+\.sql$/.test(f))
      .sort()) {
      const id = file.slice(0, -4),
        sql = await readFile(new URL(file, directory), 'utf8'),
        digest = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query(
        'SELECT sha256 FROM earth.migrations WHERE id=$1',
        [id],
      );
      if (existing.rowCount) {
        if (existing.rows[0].sha256 !== digest)
          throw new Error('Applied migration changed; create a new migration.');
      } else {
        await client.query(sql);
        await client.query(
          'INSERT INTO earth.migrations(id,sha256) VALUES($1,$2)',
          [id, digest],
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
const projection =
  "jsonb_build_object('type','Feature','id',f.id,'properties',f.properties,'geometry',f.source_geometry) AS feature";
export class PostGISStore {
  constructor(pool) {
    this.pool = pool;
  }
  async verifyRuntimeRole() {
    const r = await this.pool.query(
      "SELECT r.rolsuper,r.rolbypassrls,EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='earth' AND c.relowner=r.oid) AS owns_tables FROM pg_roles r WHERE r.rolname=current_user",
    );
    if (r.rows[0].rolsuper || r.rows[0].rolbypassrls || r.rows[0].owns_tables)
      throw new Error(
        'Earth runtime must use a non-owner role without superuser or RLS bypass.',
      );
  }
  async transaction(principal, run, { write = false } = {}) {
    if (!principal?.id || principal.id.length > 128)
      throw new Error('Trusted database principal required.');
    const client = await this.pool.connect();
    try {
      await client.query(write ? 'BEGIN' : 'BEGIN READ ONLY');
      await client.query("SELECT set_config('earth.principal',$1,true)", [
        principal.id,
      ]);
      const value = await run(client);
      await client.query('COMMIT');
      return value;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async register(dataset, principal, { repairReference = false } = {}) {
    if (principal.canRegister !== true)
      throw new Error('Dataset registration capability required.');
    // Re-validate the complete batch before the atomic insert.
    new DatasetRegistry([dataset]);
    return this.transaction(
      principal,
      async (client) => {
        const { features, ...manifest } = structuredClone(dataset);
        const invalid = await client.query(
          'SELECT f.id,ST_IsValidReason(ST_GeomFromGeoJSON(f.geometry::text)) AS reason FROM jsonb_to_recordset($1::jsonb) AS f(id text,geometry jsonb) WHERE NOT ST_IsValid(ST_GeomFromGeoJSON(f.geometry::text))',
          [JSON.stringify(features)],
        );
        const repair =
          repairReference &&
          dataset.id === 'natural-earth-countries' &&
          dataset.provenance.content_sha256 ===
            'b9f865783a8e539cd39ea6a0fb506c86482f04a5723fb48b6059b1c634456e50';
        if (invalid.rowCount && !repair)
          throw new Error(
            'Invalid source topology; operator datasets must be valid before registration.',
          );
        if (invalid.rowCount)
          manifest.provenance.database_derivation = {
            method: 'PostGIS ST_MakeValid for query geometry only',
            source_geometry_preserved: true,
            affected_features: invalid.rows,
            limitations:
              'Generalized source boundaries remain non-authoritative; topology may differ from embedded source-geometry queries.',
          };
        await client.query(
          'INSERT INTO earth.datasets(id,version,owner_id,visibility,manifest) VALUES($1,$2,$3,$4,$5)',
          [
            dataset.id,
            dataset.version,
            principal.id,
            dataset.visibility,
            JSON.stringify(manifest),
          ],
        );
        await client.query(
          `INSERT INTO earth.features(dataset_id,id,properties,source_geometry,geom) SELECT $1,f.id,f.properties,f.geometry,ST_SetSRID(CASE WHEN $3::boolean THEN ST_MakeValid(ST_GeomFromGeoJSON(f.geometry::text)) ELSE ST_GeomFromGeoJSON(f.geometry::text) END,4326) FROM jsonb_to_recordset($2::jsonb) AS f(id text,properties jsonb,geometry jsonb)`,
          [
            dataset.id,
            JSON.stringify(
              features.map((f) => ({
                id: f.id,
                properties: f.properties,
                geometry: f.geometry,
              })),
            ),
            repair,
          ],
        );
        return { registered: dataset.id, feature_count: features.length };
      },
      { write: true },
    );
  }
  async seed(datasets) {
    const principal = { id: 'earth-seed', canRegister: true };
    for (const dataset of datasets) {
      const exists = await this.transaction(principal, (c) =>
        c.query('SELECT manifest FROM earth.datasets WHERE id=$1', [
          dataset.id,
        ]),
      );
      if (exists.rowCount) {
        const old = exists.rows[0].manifest;
        if (
          old.version !== dataset.version ||
          old.provenance.content_sha256 !== dataset.provenance.content_sha256
        )
          throw new Error('Seed conflicts with an existing immutable dataset.');
      } else
        await this.register({ ...dataset, owner_id: principal.id }, principal, {
          repairReference: true,
        });
    }
  }
  async datasets(principal) {
    return this.transaction(principal, async (c) => {
      const rows = await c.query(
        `SELECT d.manifest,COALESCE(jsonb_agg(jsonb_build_object('type','Feature','id',f.id,'properties',f.properties,'geometry',f.source_geometry) ORDER BY f.id) FILTER(WHERE f.id IS NOT NULL),'[]'::jsonb) AS features FROM earth.datasets d LEFT JOIN earth.features f ON f.dataset_id=d.id GROUP BY d.id ORDER BY d.id`,
      );
      return rows.rows.map((r) => ({ ...r.manifest, features: r.features }));
    });
  }
  async proximity(dataset, point, radius, fuels, principal) {
    return this.transaction(principal, async (c) => {
      const r = await c.query(
        `SELECT ${projection},ST_Distance(f.geom::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,true) AS distance_m FROM earth.features f WHERE f.dataset_id=$1 AND ($4::float8 IS NULL OR f.point_latitude BETWEEN $6::float8 AND $7::float8) AND ($4::float8 IS NULL OR ST_DWithin(f.geom::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,$4,true)) AND ($5::text[] IS NULL OR f.properties->>'fuel'=ANY($5::text[]))`,
        [
          dataset,
          point[0],
          point[1],
          radius ?? null,
          fuels?.length ? fuels : null,
          radius === undefined ? null : point[1] - radius / 110000,
          radius === undefined ? null : point[1] + radius / 110000,
        ],
      );
      return r.rows;
    });
  }
  async topology(dataset, geometry, operation, principal) {
    const predicate =
      operation === 'contains'
        ? 'ST_Contains'
        : operation === 'intersects'
          ? 'ST_Intersects'
          : null;
    if (!predicate) throw new Error('Unsupported topology operator.');
    return this.transaction(principal, async (c) =>
      (
        await c.query(
          `SELECT ${projection} FROM earth.features f WHERE f.dataset_id=$1 AND ${predicate}(f.geom,ST_SetSRID(ST_GeomFromGeoJSON($2),4326))`,
          [dataset, JSON.stringify(geometry)],
        )
      ).rows.map((r) => r.feature),
    );
  }
  async boundingBox(dataset, bounds, principal) {
    const [w, s, e, n] = bounds;
    return this.transaction(principal, async (c) =>
      (
        await c.query(
          `SELECT ${projection} FROM earth.features f WHERE f.dataset_id=$1 AND (($2::float8<=$4::float8 AND ST_Intersects(f.geom,ST_MakeEnvelope($2,$3::float8,$4,$5::float8,4326))) OR ($2>$4 AND (ST_Intersects(f.geom,ST_MakeEnvelope($2,$3,180,$5,4326)) OR ST_Intersects(f.geom,ST_MakeEnvelope(-180,$3,$4,$5,4326)))))`,
          [dataset, w, s, e, n],
        )
      ).rows.map((r) => r.feature),
    );
  }
  async spatialJoin(left, right, predicate, principal) {
    const fn =
      predicate === 'contains'
        ? 'ST_Contains'
        : predicate === 'intersects'
          ? 'ST_Intersects'
          : null;
    if (!fn) throw new Error('Unsupported join predicate.');
    return this.transaction(principal, async (c) => {
      const r = await c.query(
        `SELECT l.id AS left_id,r.id AS right_id FROM earth.features l JOIN earth.features r ON l.geom&&r.geom AND ${fn}(l.geom,r.geom) WHERE l.dataset_id=$1 AND r.dataset_id=$2 LIMIT 100001`,
        [left, right],
      );
      if (r.rowCount > 100000) throw new Error('Spatial join budget exceeded.');
      return r.rows;
    });
  }
}
