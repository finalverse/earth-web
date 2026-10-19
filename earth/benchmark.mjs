// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import os from 'node:os';
import { createEarthCore } from './core/index.js';
import { defaultDataset } from './server/main.js';
import { pointCatalogs } from './data/catalogs.js';
import { RENEWABLE_FUELS } from './core/constants.js';
const started = performance.now();
let datasets = [await defaultDataset(), ...(await pointCatalogs())],
  backend = null,
  pool = null;
if (process.argv.includes('--postgis')) {
  const { poolFor, connectionFile, PostGISStore } =
    await import('./db/store.js');
  pool = poolFor(await connectionFile(process.env.EARTH_DATABASE_URL_FILE));
  backend = new PostGISStore(pool);
  await backend.verifyRuntimeRole();
  datasets = await backend.datasets({ id: 'anonymous' });
}
const core = createEarthCore({ datasets, backend }),
  datasetReady = performance.now() - started;
const jobs = [
  [
    'country_contains',
    {
      tool: 'contains_point',
      arguments: { dataset: 'natural-earth-countries', point: [-75.7, 45.4] },
    },
  ],
  [
    'montreal_renewables_100km',
    {
      tool: 'within_distance',
      arguments: {
        dataset: 'wri-canada-power-plants',
        place_id: 'ne-place-1173',
        radius_m: 100000,
        fuels: [...RENEWABLE_FUELS],
        limit: 100,
      },
    },
  ],
  [
    'facility_bounding_box',
    {
      tool: 'bounding_box',
      arguments: {
        dataset: 'wri-canada-power-plants',
        bbox: [-74, 45, -73, 46],
        limit: 100,
      },
    },
  ],
];
const cpu = process.cpuUsage(),
  workloads = [];
try {
  for (const [name, p] of jobs) {
    const plan = { schema_version: 1, ...p },
      samples = [];
    let result;
    for (let i = 0; i < 20; i++) await core.execute(plan);
    for (let i = 0; i < 200; i++) {
      const t = performance.now();
      result = await core.execute(plan);
      samples.push(performance.now() - t);
    }
    samples.sort((a, b) => a - b);
    workloads.push({
      name,
      samples: 200,
      warmups: 20,
      p50_ms: samples[100],
      p95_ms: samples[190],
      max_ms: samples[199],
      result_count: result.data.total ?? result.data.features.length,
    });
  }
  console.log(
    JSON.stringify(
      {
        schema_version: 2,
        core_version: '0.2.0',
        backend: backend ? 'PostGIS' : 'embedded',
        node: process.version,
        os: os.platform(),
        arch: os.arch(),
        cpu: os.cpus()[0].model,
        dataset_load_registry_ms: datasetReady,
        layers: core
          .layers()
          .map((d) => ({
            id: d.id,
            features: d.feature_count,
            version: d.version,
          })),
        workloads,
        cpu_us: process.cpuUsage(cpu),
        rss_bytes: process.memoryUsage().rss,
        limitations:
          'Single-machine warm core calls including validation, result copies and receipts. Dataset startup excludes Node module import time. No HTTP/network overhead. Optional local PostGIS runs amd64 emulation on Apple Silicon; not production or device certification.',
      },
      null,
      2,
    ),
  );
} finally {
  if (pool) await pool.end();
}
