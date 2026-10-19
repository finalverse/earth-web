// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import {
  EarthClient,
  LocalWorkspaces,
} from '../../packages/earth/dist/index.js';
import { createEarthCore } from '../core/index.js';
import { datasets, renewable, manifest } from './test/fixtures.mjs';
const core = createEarthCore({ datasets });
const summarize = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return {
    samples: a.length,
    median_ms: s[Math.floor(s.length / 2)],
    p95_ms: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))],
  };
};
async function bench(fn, n = 100) {
  for (let i = 0; i < 20; i++) await fn();
  const a = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn();
    a.push(performance.now() - t);
  }
  return summarize(a);
}
const spatial = await bench(() =>
  core.execute({
    schema_version: 1,
    tool: 'within_distance',
    arguments: renewable,
  }),
);
const temporal = await bench(() =>
  core.execute({
    schema_version: 1,
    tool: 'features_during_interval',
    arguments: {
      dataset: 'usgs-ridgecrest-2019',
      start: '2019-07-04T00:00:00Z',
      end: '2019-07-08T00:00:00Z',
    },
  }),
);
const initialization = await bench(
  () =>
    new EarthClient({
      endpoint: 'http://127.0.0.1:18641',
      applicationId: manifest.id,
    }),
  1000,
);
const memory = new Map(),
  store = new LocalWorkspaces(manifest.id, {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
  }),
  now = new Date().toISOString(),
  workspace = {
    schema_version: 1,
    id: 'bench',
    title: 'Benchmark',
    notes: 'Synthetic local store, not a user document',
    application: manifest.id,
    created_at: now,
    updated_at: now,
    camera: {
      longitude: 0,
      latitude: 0,
      height: 100000,
      heading: 0,
      pitch: -1,
      roll: 0,
    },
    layers: [],
    selected_features: [],
    temporal_range: null,
    plan: null,
    receipt: null,
    provenance: [],
    saved_views: [],
  };
const save = await bench(() => store.save(workspace));
const load = await bench(() => store.open('bench'));
const result = {
  measured_at: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  workloads: {
    spatial,
    temporal,
    sdk_initialization: initialization,
    workspace_save: save,
    workspace_load: load,
  },
  rss_mib: process.memoryUsage().rss / 1024 / 1024,
  limits:
    '20 warmups per workload. In-process core and in-memory Storage adapter; not HTTP, disk durability, browser rendering or public throughput. SDK construction is lazy and does not contact a model/server. No controlled before/after improvement claim.',
};
await writeFile(
  'docs/earth/platform/benchmark-v04a.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
