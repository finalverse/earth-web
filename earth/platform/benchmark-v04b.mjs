// Reproducible bounded in-process workload. Not a public-service benchmark.
import { writeFile } from 'node:fs/promises';
const start = performance.now();
const { createEarthCore } = await import('../core/index.js'),
  { defaultDataset } = await import('../server/main.js'),
  { pointCatalogs } = await import('../data/catalogs.js'),
  { temporalCatalogs } = await import('../data/providers.js'),
  { EarthClient, LocalWorkspaces } =
    await import('../../packages/earth/dist/index.js');
const datasets = [
    await defaultDataset(),
    ...(await pointCatalogs()),
    ...(await temporalCatalogs()),
  ],
  core = createEarthCore({ datasets }),
  loadMs = performance.now() - start;
const plan = {
  schema_version: 1,
  tool: 'cluster_features',
  arguments: {
    dataset: 'wri-canada-power-plants',
    place_id: 'ne-place-1173',
    radius_m: 100000,
    cluster_radius_m: 10000,
    fuels: ['Hydro', 'Solar'],
    limit: 100,
  },
};
const first = performance.now(),
  result = await core.execute(plan),
  coldQuery = performance.now() - first;
async function sample(fn, n = 100) {
  for (let i = 0; i < 20; i++) await fn();
  const values = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn();
    values.push(performance.now() - t);
  }
  values.sort((a, b) => a - b);
  return {
    samples: n,
    median_ms: values[Math.floor(n / 2)],
    p95_ms: values[Math.floor(n * 0.95)],
  };
}
const memory = new Map(),
  store = new LocalWorkspaces('finalverse.energy-explorer', {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
  }),
  now = new Date().toISOString(),
  w = {
    schema_version: 1,
    id: 'benchmark',
    title: 'Source-backed test workspace',
    notes: 'Benchmark only',
    application: 'finalverse.energy-explorer',
    created_at: now,
    updated_at: now,
    camera: {
      longitude: -73.56,
      latitude: 45.5,
      height: 560000,
      heading: 0,
      pitch: -Math.PI / 2,
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
const report = {
  measured_at: now,
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  cold_module_and_source_load_ms: loadMs,
  first_cluster_query_ms: coldQuery,
  workloads: {
    cluster_query: await sample(() => core.execute(plan)),
    temporal_query: await sample(() =>
      core.execute({
        schema_version: 1,
        tool: 'features_during_interval',
        arguments: {
          dataset: 'usgs-ridgecrest-2019',
          start: '2019-07-04T00:00:00Z',
          end: '2019-07-08T00:00:00Z',
          limit: 100,
        },
      }),
    ),
    sdk_initialization: await sample(
      () =>
        new EarthClient({
          endpoint: 'http://127.0.0.1:18644',
          applicationId: 'finalverse.energy-explorer',
        }),
      1000,
    ),
    workspace_save: await sample(() => store.save(w)),
    workspace_open: await sample(() => store.open(w.id)),
  },
  workspace_bytes: new TextEncoder().encode(store.export(w.id)).length,
  rss_mib: process.memoryUsage().rss / 1024 / 1024,
  heap_used_mib: process.memoryUsage().heapUsed / 1024 / 1024,
  limitations:
    'One Mac process; first query after dataset/module load, OS filesystem cache uncontrolled; 20 warmups then 100 samples (SDK: 1000); no concurrent load. In-memory Storage, not disk durability. Process RSS/heap are not browser/GPU or SDK-only memory. Browser rendering and local AI measured separately. No improvement/SLA/throughput claim.',
};
await writeFile(
  'docs/earth/platform/benchmark-v04b.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
