export interface QueryPlan {
  schema_version: 1;
  tool:
    | 'list_layers'
    | 'search_features'
    | 'contains_point'
    | 'bbox_candidates'
    | 'measure_distance'
    | 'transform_coordinates'
    | 'distance'
    | 'buffer'
    | 'contains'
    | 'intersects'
    | 'nearest'
    | 'within_distance'
    | 'bounding_box'
    | 'spatial_join'
    | 'coordinate_transform'
    | 'query_features'
    | 'inspect_feature'
    | 'get_provenance'
    | 'features_at_time'
    | 'features_during_interval'
    | 'spatial_changes'
    | 'compare_snapshots'
    | 'aggregate_over_time'
    | 'nearest_at_time'
    | 'intersects_during_interval';
  arguments: Record<string, unknown>;
}
export interface QueryResult {
  schema_version: 1;
  plan: QueryPlan;
  summary: string;
  data: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  elapsed_ms: number;
  receipt: {
    execution_id: string;
    executed_at: string;
    plan_sha256: string;
    core_version: string;
    access: string;
  };
}
export declare class EarthClient {
  constructor(base?: string, options?: { token?: string | null });
  listLayers(options?: {
    signal?: AbortSignal;
  }): Promise<{ layers: Record<string, unknown>[] }>;
  registerDataset(
    dataset: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<Record<string, unknown>>;
  executeSpatialPlan(
    plan: QueryPlan,
    options?: { signal?: AbortSignal },
  ): Promise<QueryResult>;
  spatialQuery(
    tool: QueryPlan['tool'],
    args: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<QueryResult>;
  queryFeatures(
    dataset: string,
    filters?: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<QueryResult>;
  inspectFeature(
    dataset: string,
    feature_id: string,
    options?: { signal?: AbortSignal },
  ): Promise<QueryResult>;
  getProvenance(
    dataset: string,
    options?: { signal?: AbortSignal },
  ): Promise<QueryResult>;
  layers(options?: {
    signal?: AbortSignal;
  }): Promise<{ layers: Record<string, unknown>[] }>;
  query(
    plan: QueryPlan,
    options?: { signal?: AbortSignal },
  ): Promise<QueryResult>;
  propose(
    question: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ plan: QueryPlan; requires_review: true; provider: string }>;
}

/** UTC instants with explicit Z; intervals are half-open, [start,end). */
export interface TemporalInterval {
  start: string;
  end: string;
}
export interface TemporalObservation {
  id: string;
  feature_id: string;
  field: string;
  value: number;
  interval: TemporalInterval;
  event_at: string | null;
  observed_at: string | null;
  valid_interval: TemporalInterval | null;
  ingested_at: string;
  source: string;
}
export interface SpatialSnapshot {
  dataset_id: string;
  dataset_version: string;
  at: string;
  feature_ids: string[];
}
export interface SpatialEvent {
  id: string;
  event_at: string;
  feature_id: string;
  source: string;
}
export interface SpatialWorkspace {
  schema_version: 1;
  id: string;
  title: string;
  notes: string;
  application: 'countries' | 'energy' | 'time';
  created_at: string;
  updated_at: string;
  camera: {
    longitude: number;
    latitude: number;
    height: number;
    heading: number;
    pitch: number;
    roll: number;
  };
  layers: { id: string; version: string; visible: boolean }[];
  selected_features: string[];
  temporal_range: TemporalInterval | null;
  plan: QueryPlan | null;
  receipt: QueryResult['receipt'] | null;
  provenance: Record<string, unknown>[];
  saved_views: { title: string; camera: SpatialWorkspace['camera'] }[];
}
export interface TemporalQuery {
  dataset: string;
  field?: string;
  limit?: number;
  point?: number[];
  place_id?: string;
  radius_m?: number;
  fuels?: string[];
}
export type TemporalPlan =
  | {
      schema_version: 1;
      tool: 'features_at_time' | 'nearest_at_time';
      arguments: TemporalQuery & { at: string };
    }
  | {
      schema_version: 1;
      tool:
        | 'features_during_interval'
        | 'aggregate_over_time'
        | 'intersects_during_interval';
      arguments: TemporalQuery &
        TemporalInterval & {
          geometry?: Record<string, unknown>;
          aggregation?: 'count' | 'min' | 'max' | 'mean';
        };
    }
  | {
      schema_version: 1;
      tool: 'compare_snapshots' | 'spatial_changes';
      arguments: TemporalQuery & {
        before: string;
        after: string;
        comparison_dataset?: string;
        window_start?: string;
      };
    };
