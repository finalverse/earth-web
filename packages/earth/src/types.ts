// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import type { ToolArguments } from './generated/tools.js';
export type { ToolArguments };
export type ToolName = keyof ToolArguments;
export type Position =
  | [longitude: number, latitude: number]
  | [longitude: number, latitude: number, heightM: number];
export type Bounds = [west: number, south: number, east: number, north: number];
export type CRS = 'OGC:CRS84' | 'EPSG:4979' | 'EPSG:4978';
export interface Geometry {
  type:
    | 'Point'
    | 'MultiPoint'
    | 'LineString'
    | 'MultiLineString'
    | 'Polygon'
    | 'MultiPolygon';
  coordinates: unknown[];
}
export interface Feature<
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  type: 'Feature';
  id: string;
  properties: P;
  geometry: Geometry;
}
export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}
export interface Interval {
  start: string;
  end: string;
}
export interface Observation {
  id: string;
  feature_id: string;
  field: string;
  value: number;
  interval: Interval;
  event_at: string | null;
  observed_at: string | null;
  valid_interval: Interval | null;
  ingested_at: string;
  source: string;
}
export interface Dataset {
  id: string;
  title: string;
  version: string;
  feature_count: number;
  provenance: Record<string, unknown>;
  temporal: { kind: string; observation_count: number; [key: string]: unknown };
}
export interface Receipt {
  execution_id: string;
  executed_at: string;
  plan_sha256: string;
  core_version: string;
  access: 'read-only';
}
export type QueryPlan<K extends ToolName = ToolName> = K extends ToolName
  ? { schema_version: 1; tool: K; arguments: ToolArguments[K] }
  : never;
export interface FeatureData extends FeatureCollection {
  total?: number;
  truncated?: boolean;
  observations?: Observation[];
  interval?: Interval;
  missing_observations?: number;
  analysis?: { center?: Position; [key: string]: unknown };
  measurements?: { feature_id: string; distance_m: number }[];
  [key: string]: unknown;
}
export type ToolData<K extends ToolName> = K extends 'list_layers'
  ? { layers: Dataset[] }
  : K extends 'distance' | 'measure_distance'
    ? { distance_m: number; units: string; [key: string]: unknown }
    : K extends 'transform_coordinates' | 'coordinate_transform'
      ? { position: number[]; [key: string]: unknown }
      : FeatureData;
export interface QueryResult<K extends ToolName = ToolName> {
  schema_version: 1;
  plan: QueryPlan<K>;
  summary: string;
  data: ToolData<K>;
  provenance?: Record<string, unknown>;
  receipt: Receipt;
  elapsed_ms: number;
  request_id?: string;
}
export interface Page {
  limit: number;
  next_cursor: string | null;
  total: number;
  snapshot: string;
}
export interface PageResult<T> {
  items: T[];
  page: Page;
  provenance?: Record<string, unknown>;
  request_id?: string;
}
export type Capability =
  | 'earth.datasets.read'
  | 'earth.spatial.query'
  | 'earth.temporal.query'
  | 'earth.workspace.local.read'
  | 'earth.workspace.local.write'
  | 'earth.ai.plan';
export interface ApplicationManifest {
  manifest_version: '1.0';
  id: string;
  name: string;
  version: string;
  api_version: '1';
  entry: string;
  runtime: 'trusted-same-origin';
  capabilities: Capability[];
  datasets: string[];
  tools: ToolName[];
  budgets: { max_features: number; max_radius_m: number };
}
export interface Capabilities {
  api_version: '1';
  platform_version: string;
  application_id?: string;
  application_version?: string;
  runtime?: 'trusted-same-origin';
  capabilities: Capability[];
  tools: ToolName[];
  datasets: string[];
  budgets: { max_features: number; max_radius_m: number };
  ai_enabled: boolean;
  workspace_storage: string;
}
export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  requestId?: string;
}
export interface PageOptions extends RequestOptions {
  limit?: number;
  cursor?: string;
}
export interface ClientOptions {
  endpoint: string;
  applicationId?: string;
  timeoutMs?: number;
  retries?: 0 | 1 | 2;
  fetch?: typeof fetch;
}
export interface Camera {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}
export interface Workspace {
  schema_version: 1;
  id: string;
  title: string;
  notes: string;
  application: string;
  created_at: string;
  updated_at: string;
  camera: Camera;
  layers: { id: string; version: string; visible: boolean }[];
  selected_features: string[];
  temporal_range: Interval | null;
  plan: QueryPlan | null;
  receipt: Receipt | null;
  provenance: Record<string, unknown>[];
  saved_views: { title: string; camera: Camera }[];
  application_state?: Record<string, unknown>;
}
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
