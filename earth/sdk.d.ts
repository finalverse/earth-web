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
    | 'get_provenance';
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
