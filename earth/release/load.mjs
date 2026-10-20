// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// No endpoint argument: every HTTP target is an owned ephemeral loopback server.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createEarthCore } from '../core/index.js';
import { createEarthServer } from '../server/http.js';
import { defaultDataset } from '../server/main.js';
import { pointCatalogs } from '../data/catalogs.js';
import { temporalCatalogs } from '../data/providers.js';
import { VERSION } from '../core/version.js';
import { WorkspaceStore } from '../core/workspace.js';
const cold = performance.now();
const datasets = [
  await defaultDataset(),
  ...(await pointCatalogs()),
  ...(await temporalCatalogs()),
];
const embedded = createEarthCore({ datasets });
const coldSources = performance.now() - cold;
const plans = {
  spatial: {
    tool: 'within_distance',
    arguments: {
      dataset: 'wri-canada-power-plants',
      place_id: 'ne-place-1173',
      radius_m: 100000,
      fuels: ['Hydro', 'Solar'],
      limit: 100,
    },
  },
  grouping: {
    tool: 'cluster_features',
    arguments: {
      dataset: 'wri-canada-power-plants',
      place_id: 'ne-place-1173',
      radius_m: 100000,
      cluster_radius_m: 10000,
      fuels: ['Hydro', 'Solar'],
      limit: 100,
    },
  },
  temporal: {
    tool: 'features_during_interval',
    arguments: {
      dataset: 'usgs-ridgecrest-2019',
      start: '2019-07-04T00:00:00Z',
      end: '2019-07-08T00:00:00Z',
      limit: 100,
    },
  },
  large_result: {
    tool: 'query_features',
    arguments: { dataset: 'wri-canada-power-plants', limit: 100 },
  },
};
for (const plan of Object.values(plans)) plan.schema_version = 1;
async function measure(run, samples = 1000, concurrency = 1) {
  const cpu = process.cpuUsage(),
    start = performance.now(),
    values = [];
  let index = 0,
    errors = 0,
    peakRSS = process.memoryUsage().rss;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (index++ < samples) {
        const begin = performance.now();
        try {
          await run();
        } catch {
          errors++;
        }
        values.push(performance.now() - begin);
        peakRSS = Math.max(peakRSS, process.memoryUsage().rss);
      }
    }),
  );
  const elapsed = performance.now() - start,
    usage = process.cpuUsage(cpu);
  values.sort((a, b) => a - b);
  return {
    samples,
    concurrency,
    p50_ms: values[Math.ceil(samples * 0.5) - 1],
    p95_ms: values[Math.ceil(samples * 0.95) - 1],
    p99_ms: samples >= 1000 ? values[Math.ceil(samples * 0.99) - 1] : null,
    elapsed_ms: elapsed,
    throughput_per_s: (samples * 1000) / elapsed,
    errors,
    error_rate: errors / samples,
    node_cpu_ms: (usage.user + usage.system) / 1000,
    node_peak_rss_bytes: peakRSS,
  };
}
const report = {
  version: VERSION,
  measured_at: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: os.cpus()[0].model,
  memory_bytes: os.totalmem(),
  cold_source_load_ms: coldSources,
  notes: [
    'Cold source measurement excludes static module loading and does not flush OS caches.',
    'Local preview budgets, not production SLA or multi-tenant authentication.',
    'HTTP concurrency represents clients sharing one anonymous public identity; no spoofed principal headers.',
    'PostGIS temporal evaluation remains in Node; database CPU is not included in Node CPU measurements.',
    'Workspace storage is an in-memory StorageAdapter, not browser disk or cloud persistence.',
  ],
  backends: {},
  workspace: null,
  rate_limit: null,
};
let pool;
try {
  const cores = { embedded };
  if (process.env.EARTH_DATABASE_URL_FILE) {
    const { poolFor, connectionFile, PostGISStore } =
      await import('../db/store.js');
    pool = poolFor(await connectionFile(process.env.EARTH_DATABASE_URL_FILE));
    const store = new PostGISStore(pool);
    await store.verifyRuntimeRole();
    const stored = await store.datasets({ id: 'anonymous' });
    for (const dataset of datasets) {
      const match = stored.find((d) => d.id === dataset.id);
      assert.equal(match?.version, dataset.version);
      assert.equal(
        match?.provenance.content_sha256,
        dataset.provenance.content_sha256,
      );
      assert.equal(match?.features.length, dataset.features.length);
    }
    cores.postgis = createEarthCore({ datasets: stored, backend: store });
    report.notes.push(
      'PostGIS uses the isolated cached Linux/amd64 development container on this Apple Silicon host (emulated). Not a native database hardware comparison.',
    );
  }
  for (const [name, core] of Object.entries(cores)) {
    const result = { direct: {}, http: {} };
    report.backends[name] = result;
    for (const [workload, plan] of Object.entries(plans)) {
      const first = performance.now(),
        answer = await core.execute(plan);
      const firstMs = performance.now() - first;
      const expected = await embedded.execute(plan);
      assert.deepEqual(
        answer.data.features.map((f) => f.id).sort(),
        expected.data.features.map((f) => f.id).sort(),
      );
      if (workload === 'grouping')
        assert.deepEqual(answer.data.clusters, expected.data.clusters);
      for (let i = 0; i < 20; i++) await core.execute(plan);
      result.direct[workload] = {
        first_query_ms: firstMs,
        features: answer.data.features.length,
        ...(await measure(() => core.execute(plan))),
      };
    }
    for (const concurrency of [1, 8]) {
      const server = createEarthServer({ core });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const origin = 'http://127.0.0.1:' + server.address().port;
      try {
        result.http[concurrency] = await measure(
          async () => {
            const response = await fetch(origin + '/v1/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(plans.grouping),
              signal: AbortSignal.timeout(10000),
            });
            assert.equal(response.status, 200);
            assert.equal((await response.json()).data.total, 18);
          },
          96,
          concurrency,
        );
      } finally {
        server.closeAllConnections();
        await new Promise((r) => server.close(r));
      }
    }
  }
  const server = createEarthServer({ core: embedded });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const statuses = {};
    for (let i = 0; i < 130; i++) {
      const response = await fetch(
        'http://127.0.0.1:' + server.address().port + '/v1/status',
      );
      statuses[response.status] = (statuses[response.status] || 0) + 1;
      await response.arrayBuffer();
    }
    assert.deepEqual(statuses, { 200: 120, 429: 10 });
    report.rate_limit = { requests: 130, statuses };
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  let stored = '[]';
  const storage = {
    getItem: () => stored,
    setItem: (_, text) => {
      stored = text;
    },
  };
  const store = new WorkspaceStore(storage),
    result = await embedded.execute(plans.grouping);
  const document = {
    schema_version: 1,
    id: 'load',
    title: 'Load fixture',
    notes: '',
    application: 'energy',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    camera: {
      longitude: -73.5,
      latitude: 45.5,
      height: 500000,
      heading: 0,
      pitch: -1,
      roll: 0,
    },
    layers: [],
    selected_features: [],
    temporal_range: null,
    plan: result.plan,
    receipt: result.receipt,
    provenance: [result.provenance],
    saved_views: [],
    application_state: { result },
  };
  store.save(document);
  report.workspace = {
    bytes: Buffer.byteLength(stored),
    save: await measure(() => store.save(document)),
    open: await measure(() => store.open('load')),
  };
  // Conservative preview gates calibrated for a 16 GiB M1 + emulated PostGIS.
  report.budgets = {
    direct_p95_ms: 250,
    http_p95_ms: 1500,
    workspace_p95_ms: 50,
    node_peak_rss_bytes: 512 * 1024 * 1024,
    expected_errors: 0,
  };
  for (const backend of Object.values(report.backends)) {
    for (const workload of Object.values(backend.direct)) {
      assert.equal(workload.errors, 0);
      assert.ok(workload.p95_ms < report.budgets.direct_p95_ms);
    }
    for (const workload of Object.values(backend.http)) {
      assert.equal(workload.errors, 0);
      assert.ok(workload.p95_ms < report.budgets.http_p95_ms);
    }
    for (const workload of [
      ...Object.values(backend.direct),
      ...Object.values(backend.http),
    ])
      assert.ok(
        workload.node_peak_rss_bytes < report.budgets.node_peak_rss_bytes,
      );
  }
  for (const workload of [report.workspace.save, report.workspace.open]) {
    assert.equal(workload.errors, 0);
    assert.ok(workload.p95_ms < report.budgets.workspace_p95_ms);
  }
  report.passed = true;
} finally {
  if (pool) await pool.end();
  await writeFile(
    process.argv[2] || 'artifacts/release/load.json',
    JSON.stringify(report, null, 2) + '\n',
  );
}
console.log(
  JSON.stringify({
    passed: report.passed,
    backends: Object.keys(report.backends),
    production_requests: 0,
  }),
);
