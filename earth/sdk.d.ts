export interface QueryPlan {
  schema_version: 1;
  tool:
    | 'list_layers'
    | 'search_features'
    | 'contains_point'
    | 'bbox_candidates'
    | 'measure_distance'
    | 'transform_coordinates';
  arguments: Record<string, unknown>;
}
export interface QueryResult {
  schema_version: 1;
  plan: QueryPlan;
  summary: string;
  data: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  elapsed_ms: number;
}
export declare class EarthClient {
  constructor(base?: string);
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
