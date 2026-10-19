import { temporalCatalogs } from '../data/providers.js';
// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import {
  connectionFile,
  earthConnection,
  poolFor,
  migrate,
  PostGISStore,
} from '../db/store.js';
import { createEarthCore } from '../core/index.js';
import { createEarthServer } from '../server/http.js';
import { EarthClient } from '../sdk.js';
import { defaultDataset } from '../server/main.js';
import { pointCatalogs } from '../data/catalogs.js';
import { RENEWABLE_FUELS } from '../core/constants.js';
import { dataset, feature } from './fixtures.js';
const adminFile = process.env.EARTH_TEST_ADMIN_URL_FILE,
  appFile = process.env.EARTH_TEST_URL_FILE;
test('database URL guard refuses other products and SQL-shaped database names', () => {
  for (const url of [
    'postgres://localhost/mutsea',
    'postgres://localhost/creditchain',
    'postgres://localhost/earth_test;DROP',
    'http://localhost/earth_dev',
  ])
    assert.throws(() => earthConnection(url));
});
test(
  'PostGIS migration, source preservation, RLS, atomic rollback, indexes and cross-backend parity',
  { skip: !adminFile || !appFile },
  async (t) => {
    const adminURL = new URL(await connectionFile(adminFile)),
      appURL = new URL(await connectionFile(appFile));
    assert.equal(adminURL.hostname, appURL.hostname);
    assert.equal(adminURL.port, appURL.port);
    const database = 'earth_test_' + randomUUID().replaceAll('-', '');
    assert.match(database, /^earth_test_[a-f0-9]{32}$/);
    const control = poolFor(adminURL.href);
    let admin, app;
    t.after(async () => {
      try {
        if (app) await app.end();
        if (admin) await admin.end();
        // Server-side backend shutdown may trail socket close on fast runners.
        // Wait briefly rather than force-terminating still-closing connections.
        for (let attempt = 0; ; attempt++) {
          try {
            await control.query(`DROP DATABASE IF EXISTS "${database}"`);
            break;
          } catch (error) {
            if (error.code !== '55006' || attempt >= 4) throw error;
            await delay(100);
          }
        }
      } finally {
        await control.end();
      }
    });
    await control.query(`CREATE DATABASE "${database}"`);
    adminURL.pathname = '/' + database;
    appURL.pathname = '/' + database;
    admin = poolFor(adminURL.href);
    app = poolFor(appURL.href);
    await migrate(admin);
    await migrate(admin);
    assert.equal(
      Number(
        (await admin.query('SELECT count(*) FROM earth.migrations')).rows[0]
          .count,
      ),
      3,
    );
    const store = new PostGISStore(app);
    await store.verifyRuntimeRole();
    await assert.rejects(
      new PostGISStore(admin).verifyRuntimeRole(),
      /non-owner/,
    );
    const bundled = [
      await defaultDataset(),
      ...(await pointCatalogs()),
      ...(await temporalCatalogs()),
    ];
    await store.seed(bundled);
    await store.seed(bundled);
    const loaded = await store.datasets({ id: 'anonymous' }),
      country = loaded.find((d) => d.id === 'natural-earth-countries');
    assert.equal(
      country.provenance.database_derivation.affected_features.length,
      41,
    );
    assert.deepEqual(
      country.features.find((f) => f.id === 'ne-CAN-44').geometry,
      bundled[0].features.find((f) => f.id === 'ne-CAN-44').geometry,
    );
    assert.deepEqual(
      loaded.find((d) => d.id === 'usgs-ridgecrest-2019').temporal,
      bundled.find((d) => d.id === 'usgs-ridgecrest-2019').temporal,
    );
    const temporalCore = createEarthCore({ datasets: loaded, backend: store });
    assert.equal(
      (
        await temporalCore.execute({
          schema_version: 1,
          tool: 'features_during_interval',
          arguments: {
            dataset: 'usgs-ridgecrest-2019',
            start: '2019-07-04T00:00:00Z',
            end: '2019-07-08T00:00:00Z',
          },
        })
      ).data.total,
      90,
    );
    const local = createEarthCore({ datasets: bundled }),
      db = createEarthCore({ datasets: loaded, backend: store });
    const plan = {
      schema_version: 1,
      tool: 'within_distance',
      arguments: {
        dataset: 'wri-canada-power-plants',
        place_id: 'ne-place-1173',
        radius_m: 100000,
        fuels: [...RENEWABLE_FUELS],
        limit: 100,
      },
    };
    const clusterPlan={...plan,tool:'cluster_features',arguments:{...plan.arguments,cluster_radius_m:10000}};
    const localGroups=await local.execute(clusterPlan), dbGroups=await db.execute(clusterPlan);
    assert.deepEqual(localGroups.data.clusters,dbGroups.data.clusters);
    assert.deepEqual(localGroups.data.fuel_groups,dbGroups.data.fuel_groups);
    const a = await local.execute(plan),
      b = await db.execute(plan);
    assert.equal(b.data.total, 24);
    const server = createEarthServer({ core: db });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const http = await new EarthClient(
        `http://127.0.0.1:${server.address().port}`,
      ).query(plan);
      assert.equal(http.data.total, 24);
    } finally {
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    }
    assert.deepEqual(
      b.data.features.map((f) => f.id),
      a.data.features.map((f) => f.id),
    );
    a.data.measurements.forEach((m, i) =>
      assert.ok(
        Math.abs(m.distance_m - b.data.measurements[i].distance_m) < 0.00001,
      ),
    );
    const owner = { id: 'alice', canRegister: true };
    await store.register(
      dataset('private', [feature('secret', [1, 1])], {
        visibility: 'private',
      }),
      owner,
    );
    for (let i = 0; i < 12; i++)
      await Promise.all(
        ['alice', 'bob', 'anonymous'].map(async (id) => {
          const r = await store.transaction({ id }, (c) =>
            c.query("SELECT id FROM earth.datasets WHERE id='private'"),
          );
          assert.equal(r.rowCount, id === 'alice' ? 1 : 0);
        }),
      );
    assert.equal(
      (
        await app.query(
          "SELECT current_setting('earth.principal',true) AS principal",
        )
      ).rows[0].principal,
      '',
    );
    await admin.query(
      "CREATE FUNCTION earth.reject_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='reject' THEN RAISE EXCEPTION 'intentional test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_fixture BEFORE INSERT ON earth.features FOR EACH ROW EXECUTE FUNCTION earth.reject_fixture()",
    );
    await assert.rejects(
      store.register(
        dataset('rollback', [
          feature('accept', [0, 0]),
          feature('reject', [1, 1]),
        ]),
        owner,
      ),
    );
    assert.equal(
      (
        await store.transaction(owner, (c) =>
          c.query("SELECT id FROM earth.datasets WHERE id='rollback'"),
        )
      ).rowCount,
      0,
    );
    const fixture = dataset('fixture', [
      feature('east', [179.8, 0]),
      feature('west', [-179.8, 0]),
    ]);
    await store.register(fixture, owner);
    const bounds = await store.boundingBox(
      'fixture',
      [179, -1, -179, 1],
      owner,
    );
    assert.deepEqual(bounds.map((f) => f.id).sort(), ['east', 'west']);
    await assert.rejects(
      store.topology(
        'fixture',
        { type: 'Point', coordinates: [0, 0] },
        'DROP TABLE earth.features',
        owner,
      ),
    );
    const explain = await store.transaction({ id: 'anonymous' }, async (c) => {
      await c.query('SET LOCAL enable_seqscan=off');
      return c.query(
        "EXPLAIN (FORMAT JSON) SELECT id FROM earth.features WHERE dataset_id='wri-canada-power-plants' AND point_latitude BETWEEN 44.59 AND 46.42 AND ST_DWithin(geom::geography,ST_SetSRID(ST_MakePoint(-73.585243,45.501945),4326)::geography,100000,true)",
      );
    });
    assert.ok(
      JSON.stringify(explain.rows).includes('features_dataset_latitude'),
    );
    const area = dataset('area', [
      {
        type: 'Feature',
        id: 'box',
        properties: { name: 'Box' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
        },
      },
    ]);
    await store.register(area, owner);
    assert.equal(
      (
        await store.topology(
          'area',
          { type: 'Point', coordinates: [1, 1] },
          'contains',
          owner,
        )
      ).length,
      1,
    );
    assert.equal(
      (
        await store.topology(
          'area',
          { type: 'Point', coordinates: [0, 0] },
          'contains',
          owner,
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await store.topology(
          'area',
          { type: 'Point', coordinates: [0, 0] },
          'intersects',
          owner,
        )
      ).length,
      1,
    );
    assert.equal(
      (
        await store.transaction({ id: 'bob' }, (c) =>
          c.query("SELECT id FROM earth.features WHERE dataset_id='private'"),
        )
      ).rowCount,
      0,
    );
  },
);

test(
  'idle database connection loss reconnects without crashing or retaining a principal',
  { skip: !adminFile || !appFile },
  async (t) => {
    const adminURL = new URL(await connectionFile(adminFile)),
      runtimeURL = new URL(await connectionFile(appFile));
    assert.equal(adminURL.host, runtimeURL.host);
    assert.equal(adminURL.pathname, runtimeURL.pathname);
    const admin = poolFor(adminURL.href),
      app = poolFor(runtimeURL.href);
    t.after(async () => {
      await app.end();
      await admin.end();
    });
    const client = await app.connect();
    const identity = (
      await client.query('SELECT pg_backend_pid() AS pid,current_user AS role')
    ).rows[0];
    client.release();
    const disconnected = once(app, 'error', {
      signal: AbortSignal.timeout(5000),
    });
    const killed = await admin.query(
      'SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE pid=$1 AND datname=current_database() AND usename=$2',
      [identity.pid, identity.role],
    );
    assert.equal(killed.rows[0]?.terminated, true);
    const [error] = await disconnected;
    assert.equal(error.code, '57P01');
    const result = await new PostGISStore(app).transaction(
      { id: 'anonymous' },
      (c) =>
        c.query(
          "SELECT pg_backend_pid() AS pid,current_setting('earth.principal',true) AS principal",
        ),
    );
    assert.notEqual(result.rows[0].pid, identity.pid);
    assert.equal(result.rows[0].principal, 'anonymous');
  },
);
