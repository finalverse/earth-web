// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { validateValue } from '../../src/tools/schema.js';
export const CAPABILITIES = Object.freeze([
  'earth.datasets.read',
  'earth.spatial.query',
  'earth.temporal.query',
  'earth.workspace.local.read',
  'earth.workspace.local.write',
  'earth.ai.plan',
]);
const id = {
  type: 'string',
  minLength: 3,
  maxLength: 80,
  pattern: '^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$',
};
const names = (items, maxItems = 32) => ({
  type: 'array',
  minItems: 1,
  maxItems,
  uniqueItems: true,
  items,
});
export const manifestSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'manifest_version',
    'id',
    'name',
    'version',
    'api_version',
    'entry',
    'runtime',
    'capabilities',
    'datasets',
    'tools',
    'budgets',
  ],
  properties: {
    manifest_version: { type: 'string', enum: ['1.0'] },
    id,
    name: { type: 'string', minLength: 1, maxLength: 100 },
    version: {
      type: 'string',
      pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[a-z0-9.-]+)?$',
      maxLength: 64,
    },
    api_version: { type: 'string', enum: ['1'] },
    entry: {
      type: 'string',
      maxLength: 160,
      pattern: '^\\./(?!.*//)[a-zA-Z0-9/_-]+\\.html$',
    },
    runtime: { type: 'string', enum: ['trusted-same-origin'] },
    capabilities: names(
      { type: 'string', enum: [...CAPABILITIES] },
      CAPABILITIES.length,
    ),
    datasets: names({ type: 'string', pattern: '^[-a-z0-9]{1,80}$' }, 16),
    tools: names({ type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' }),
    budgets: {
      type: 'object',
      additionalProperties: false,
      required: ['max_features', 'max_radius_m'],
      properties: {
        max_features: { type: 'integer', minimum: 1, maximum: 100 },
        max_radius_m: { type: 'number', minimum: 1, maximum: 500000 },
      },
    },
  },
};
export function validateManifest(input) {
  if (
    new TextEncoder().encode(JSON.stringify(input)).length > 16384 ||
    validateValue(manifestSchema, input).length
  )
    throw new Error('Invalid application manifest.');
  const m = structuredClone(input);
  for (const k of ['capabilities', 'datasets', 'tools'])
    if (new Set(m[k]).size !== m[k].length)
      throw new Error('Duplicate manifest permission.');
  if (m.entry.includes('//')) throw new Error('Invalid application entry.');
  return m;
}
export const toolCapability = (name) =>
  [
    'features_at_time',
    'features_during_interval',
    'spatial_changes',
    'compare_snapshots',
    'aggregate_over_time',
    'nearest_at_time',
    'intersects_during_interval',
  ].includes(name)
    ? 'earth.temporal.query'
    : ['list_layers', 'inspect_feature', 'get_provenance'].includes(name)
      ? 'earth.datasets.read'
      : 'earth.spatial.query';
