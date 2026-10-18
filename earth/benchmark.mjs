// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import os from 'node:os';
import { createEarthCore } from './core/index.js';
import { defaultDataset } from './server/main.js';
const core = createEarthCore({ datasets: [await defaultDataset()] }),
  samples = [],
  start = process.cpuUsage();
const plan = {
  schema_version: 1,
  tool: 'contains_point',
  arguments: { dataset: 'natural-earth-countries', point: [-75.7, 45.4] },
};
for (let i = 0; i < 20; i++) await core.execute(plan);
for (let i = 0; i < 200; i++) {
  const t = performance.now();
  await core.execute(plan);
  samples.push(performance.now() - t);
}
samples.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      schema_version: 1,
      workload:
        '200 full-layer point-containment queries; 20 warmups; 260 generalized map units',
      node: process.version,
      os: os.platform(),
      arch: os.arch(),
      cpu: os.cpus()[0].model,
      samples: 200,
      p50_ms: samples[100],
      p95_ms: samples[190],
      max_ms: samples[199],
      cpu_us: process.cpuUsage(start),
      rss_bytes: process.memoryUsage().rss,
      limitations:
        'Single local machine and reference dataset. Not network, load, device or rendering certification.',
    },
    null,
    2,
  ),
);
