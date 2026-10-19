// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { createEarthCore } from './core/index.js';
import { temporalCatalogs } from './data/providers.js';
const start = performance.now();
const datasets = await temporalCatalogs();
const core = createEarthCore({ datasets });
const loaded = performance.now() - start;
const workloads = {
  interval: {
    tool: 'features_during_interval',
    arguments: {
      dataset: datasets[0].id,
      start: '2019-07-04T00:00:00Z',
      end: '2019-07-08T00:00:00Z',
      limit: 100,
    },
  },
  comparison: {
    tool: 'compare_snapshots',
    arguments: {
      dataset: datasets[0].id,
      window_start: '2019-07-04T00:00:00Z',
      before: '2019-07-05T00:00:00Z',
      after: '2019-07-08T00:00:00Z',
    },
  },
  aggregation: {
    tool: 'aggregate_over_time',
    arguments: {
      dataset: datasets[0].id,
      start: '2019-07-04T00:00:00Z',
      end: '2019-07-08T00:00:00Z',
      aggregation: 'count',
    },
  },
};
const output = {
  version: '0.3.0',
  runtime: process.version,
  platform: process.platform,
  arch: process.arch,
  source_features: datasets[0].features.length,
  registry_load_ms: loaded,
  samples: 200,
  warmups: 20,
  workloads: {},
};
for (const [name, p] of Object.entries(workloads)) {
  const values = [];
  for (let i = 0; i < 220; i++) {
    const s = performance.now();
    await core.execute({ schema_version: 1, ...p });
    if (i >= 20) values.push(performance.now() - s);
  }
  values.sort((a, b) => a - b);
  output.workloads[name] = { p50_ms: values[99], p95_ms: values[189] };
}
output.rss_bytes = process.memoryUsage().rss;
output.scope =
  'Core only, local process; not HTTP, frame rate or production SLA';
console.log(JSON.stringify(output, null, 2));
