// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { validateWorkspace } from '@finalverse/earth';
import type {
  QueryPlan,
  QueryResult,
  Camera,
  Workspace,
  Feature,
} from '@finalverse/earth';
export const APP = 'finalverse.energy-explorer',
  DATASET = 'wri-canada-power-plants';
export const RENEWABLE = [
  'Biomass',
  'Geothermal',
  'Hydro',
  'Solar',
  'Wave and Tidal',
  'Wind',
];
export interface Filters {
  place_id: string;
  radius_m: number;
  cluster_radius_m: number;
  fuels: string[];
}
export const initial: Filters = {
  place_id: 'ne-place-1173',
  radius_m: 100000,
  cluster_radius_m: 10000,
  fuels: [...RENEWABLE],
};
export function energyPlan(filters: Filters): QueryPlan<'cluster_features'> {
  if (
    !/^[-a-z0-9]{1,80}$/.test(filters.place_id) ||
    !Number.isFinite(filters.radius_m) ||
    filters.radius_m < 1 ||
    filters.radius_m > 500000 ||
    !Number.isFinite(filters.cluster_radius_m) ||
    filters.cluster_radius_m < 1 ||
    filters.cluster_radius_m > 50000 ||
    !Array.isArray(filters.fuels) ||
    filters.fuels.length > 12
  )
    throw new Error(
      'Choose a catalog place, 0–500 km radius and 0–50 km grouping edge.',
    );
  return {
    schema_version: 1,
    tool: 'cluster_features',
    arguments: { dataset: DATASET, ...structuredClone(filters), limit: 100 },
  };
}
export function resultFeatures(result: QueryResult): Feature[] {
  const data = result?.data as { features?: Feature[] };
  if (!Array.isArray(data?.features) || data.features.length > 100)
    throw new Error('Expected a bounded feature result.');
  for (const f of data.features)
    if (
      typeof f.id !== 'string' ||
      f.geometry?.type !== 'Point' ||
      !Array.isArray(f.geometry.coordinates) ||
      f.geometry.coordinates.length < 2 ||
      !f.geometry.coordinates
        .slice(0, 2)
        .every((n) => typeof n === 'number' && Number.isFinite(n)) ||
      Math.abs(Number(f.geometry.coordinates[0])) > 180 ||
      Math.abs(Number(f.geometry.coordinates[1])) > 90 ||
      typeof f.properties?.name !== 'string'
    )
      throw new Error('Invalid saved facility geometry.');
  const d = data as import('@finalverse/earth').FeatureData;
  if (
    result.schema_version !== 1 ||
    !result.receipt ||
    !Number.isFinite(result.elapsed_ms) ||
    !result.plan ||
    typeof result.summary !== 'string'
  )
    throw new Error('Invalid saved result envelope.');
  if (
    d.total !== undefined &&
    (!Number.isInteger(d.total) || d.total < d.features.length)
  )
    throw new Error('Invalid saved result count.');
  if (d.analysis?.center) {
    const p = d.analysis.center;
    if (
      !Array.isArray(p) ||
      p.length < 2 ||
      !p.every(Number.isFinite) ||
      Math.abs(p[0]) > 180 ||
      Math.abs(p[1]) > 90
    )
      throw new Error('Invalid saved query origin.');
  }
  if (
    d.analysis?.radius_m !== undefined &&
    d.analysis.radius_m !== null &&
    (!Number.isFinite(d.analysis.radius_m) ||
      Number(d.analysis.radius_m) < 1 ||
      Number(d.analysis.radius_m) > 500000)
  )
    throw new Error('Invalid saved radius.');
  if (
    d.measurements &&
    (!Array.isArray(d.measurements) ||
      d.measurements.length > 100 ||
      d.measurements.some(
        (m) =>
          !d.features.some((f) => f.id === m.feature_id) ||
          !Number.isFinite(m.distance_m) ||
          m.distance_m < 0,
      ))
  )
    throw new Error('Invalid saved measurements.');
  if (
    d.clusters &&
    (!Array.isArray(d.clusters) ||
      d.clusters.length > 100 ||
      d.clusters.some(
        (g) =>
          typeof g.id !== 'string' ||
          !Array.isArray(g.feature_ids) ||
          g.count !== g.feature_ids.length ||
          g.feature_ids.some((id) => !d.features.some((f) => f.id === id)),
      ))
  )
    throw new Error('Invalid saved groups.');
  if (
    d.fuel_groups &&
    (!Array.isArray(d.fuel_groups) ||
      d.fuel_groups.length > 12 ||
      d.fuel_groups.some(
        (g) =>
          typeof g.fuel !== 'string' ||
          !Number.isInteger(g.count) ||
          g.count < 0 ||
          !Number.isFinite(g.reported_capacity_mw) ||
          !Number.isInteger(g.missing_capacity),
      ))
  )
    throw new Error('Invalid saved fuel comparison.');
  return data.features;
}
export function selectedFeature(
  result: QueryResult | null,
  id: string,
): Feature | null {
  return result
    ? (resultFeatures(result).find((f) => f.id === id) ?? null)
    : null;
}
export function displayRings(input: unknown): number[][][] {
  if (input === undefined) return [];
  if (
    !Array.isArray(input) ||
    input.length > 8 ||
    input.some(
      (r) =>
        !Array.isArray(r) ||
        r.length < 4 ||
        r.length > 520 ||
        r.some(
          (p) =>
            !Array.isArray(p) ||
            p.length !== 2 ||
            !p.every(Number.isFinite) ||
            Math.abs(p[0]) > 180 ||
            Math.abs(p[1]) > 90,
        ),
    )
  )
    throw new Error('Invalid saved display filter.');
  return structuredClone(input);
}
export function makeWorkspace({
  title,
  filters,
  result,
  camera,
  selected,
  layers,
  rings = [],
}: {
  title: string;
  filters: Filters;
  result: QueryResult | null;
  camera: Camera;
  selected: string | null;
  layers: Workspace['layers'];
  rings?: number[][][];
}): Workspace {
  const now = new Date().toISOString();
  return validateWorkspace({
    schema_version: 1,
    id: crypto.randomUUID(),
    title,
    notes:
      'Archival source analysis. Saved results are a local snapshot, not authenticated server evidence. Re-run explicitly to refresh.',
    application: APP,
    created_at: now,
    updated_at: now,
    camera,
    layers,
    selected_features: selected ? [selected] : [],
    temporal_range: null,
    plan: result?.plan ?? energyPlan(filters),
    receipt: result?.receipt ?? null,
    provenance: result?.provenance ? [result.provenance] : [],
    saved_views: [],
    application_state: {
      filters: structuredClone(filters),
      display_rings: displayRings(rings),
      ...(result ? { result: structuredClone(result) } : {}),
    },
  });
}
export function restoreWorkspace(value: Workspace) {
  const w = validateWorkspace(value);
  if (w.application !== APP)
    throw new Error(
      'Use the explicit legacy Energy import for a v0.3 workspace.',
    );
  const state = w.application_state;
  let filters = structuredClone(initial);
  if (state?.filters) {
    filters = state.filters as unknown as Filters;
    energyPlan(filters);
  } else if (w.plan?.arguments && 'place_id' in w.plan.arguments) {
    const a = w.plan.arguments;
    filters = {
      place_id: String(a.place_id),
      radius_m: 'radius_m' in a ? Number(a.radius_m) : 100000,
      cluster_radius_m: 10000,
      fuels: 'fuels' in a ? (a.fuels ?? []) : [],
    };
    energyPlan(filters);
  }
  const result = state?.result as QueryResult | undefined;
  if (result) {
    resultFeatures(result);
    if (
      JSON.stringify(result.plan) !== JSON.stringify(w.plan) ||
      result.receipt?.execution_id !== w.receipt?.execution_id
    )
      throw new Error(
        'Saved evidence does not match the workspace plan/receipt.',
      );
  }
  return {
    workspace: w,
    rings: displayRings(state?.display_rings),
    filters,
    result: result ?? null,
    selected:
      result && w.selected_features[0]
        ? (selectedFeature(result, w.selected_features[0])?.id ?? null)
        : null,
  };
}
