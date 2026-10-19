// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { createEarthCore } from './index.js';
import { TEMPORAL_TOOLS } from './temporal.js';
import { SPATIAL_TOOLS } from './spatial.js';
const TOOLS = [
  'list_layers',
  'search_features',
  'contains_point',
  'bbox_candidates',
  'measure_distance',
  'transform_coordinates',
  ...SPATIAL_TOOLS,
  ...TEMPORAL_TOOLS,
];
export function createApplication({ manifest, datasets, principal }) {
  if (
    !manifest ||
    manifest.schema_version !== 1 ||
    !/^\w[\w.-]{0,63}$/.test(manifest.id) ||
    typeof manifest.version !== 'string' ||
    Object.keys(manifest).some(
      (k) =>
        ![
          'schema_version',
          'id',
          'version',
          'datasets',
          'tools',
          'max_results',
        ].includes(k),
    ) ||
    !Array.isArray(manifest.tools) ||
    !manifest.tools.length ||
    manifest.tools.some((t) => !TOOLS.includes(t)) ||
    !Array.isArray(manifest.datasets) ||
    manifest.datasets.some((d) => typeof d !== 'string') ||
    !Number.isInteger(manifest.max_results) ||
    manifest.max_results < 1 ||
    manifest.max_results > 100
  )
    throw new Error('Invalid application capabilities.');
  const config = structuredClone(manifest),
    core = createEarthCore({
      datasets: datasets.filter((d) => config.datasets.includes(d.id)),
      principal,
      allowedTools: config.tools,
    });
  return {
    ...core,
    async execute(plan, options) {
      if (plan?.arguments?.limit > config.max_results)
        throw new Error('Application result budget exceeded.');
      const scoped = structuredClone(plan);
      if (
        [
          'search_features',
          'contains_point',
          'bbox_candidates',
          'query_features',
          'nearest',
          'within_distance',
          'bounding_box',
          'contains',
          'intersects',
          'spatial_join',
          ...TEMPORAL_TOOLS,
        ].includes(scoped?.tool) &&
        scoped.arguments
      )
        scoped.arguments.limit ??= config.max_results;
      return core.execute(scoped, options);
    },
  };
}
