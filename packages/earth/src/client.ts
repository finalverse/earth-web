// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { EarthError } from './errors.js';
import { LocalWorkspaces } from './workspaces.js';
import type {
  ClientOptions,
  PlanningOptions,
  PlanProposal,
  ProviderDiscovery,
  RequestOptions,
  PageOptions,
  PageResult,
  Dataset,
  Feature,
  QueryPlan,
  QueryResult,
  ToolName,
  ToolArguments,
  Capabilities,
  StorageAdapter,
} from './types.js';
const temporalNames = [
  'features_at_time',
  'features_during_interval',
  'spatial_changes',
  'compare_snapshots',
  'aggregate_over_time',
  'nearest_at_time',
  'intersects_during_interval',
] as const;
type TemporalName = (typeof temporalNames)[number];
type SpatialName = Exclude<ToolName, TemporalName | 'list_layers'>;
export class EarthClient {
  readonly endpoint: string;
  readonly applicationId?: string;
  private readonly prefix: string;
  private readonly transport: typeof fetch;
  private readonly timeout: number;
  private readonly retries: number;
  constructor(options: ClientOptions) {
    const u = new URL(options.endpoint);
    if (
      !['https:', 'http:'].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.pathname !== '/' ||
      u.search ||
      u.hash
    )
      throw new EarthError(
        'Use the Earth service origin, without credentials or an API suffix.',
        'CONFIGURATION',
      );
    if (
      options.applicationId &&
      !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(options.applicationId)
    )
      throw new EarthError('Invalid application ID.', 'CONFIGURATION');
    this.endpoint = u.origin;
    this.applicationId = options.applicationId;
    this.prefix =
      '/v1' + (this.applicationId ? '/apps/' + this.applicationId : '');
    this.transport = options.fetch ?? globalThis.fetch?.bind(globalThis);
    this.timeout = options.timeoutMs ?? 15000;
    this.retries = options.retries ?? 0;
    if (
      !Number.isInteger(this.timeout) ||
      this.timeout < 1 ||
      this.timeout > 60000 ||
      ![0, 1, 2].includes(this.retries) ||
      typeof this.transport !== 'function'
    )
      throw new EarthError(
        'Invalid timeout, retries or Fetch implementation.',
        'CONFIGURATION',
      );
  }
  private async request<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const timeout = options.timeoutMs ?? this.timeout;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000)
      throw new EarthError('Invalid timeout.', 'CONFIGURATION');
    const requestId = options.requestId ?? crypto.randomUUID();
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        requestId,
      )
    )
      throw new EarthError('Invalid request correlation ID.', 'CONFIGURATION');
    const timer = AbortSignal.timeout(timeout),
      signal = AbortSignal.any([
        timer,
        ...(options.signal ? [options.signal] : []),
      ]);
    let encoded: string | undefined;
    try {
      encoded = body === undefined ? undefined : JSON.stringify(body);
    } catch {
      throw new EarthError(
        'Request must serialize to JSON.',
        'INVALID_REQUEST',
      );
    }
    if (encoded && new TextEncoder().encode(encoded).length > 16384)
      throw new EarthError('Request exceeds 16 KiB.', 'PAYLOAD_TOO_LARGE');
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await this.transport(this.endpoint + this.prefix + path, {
          method: encoded ? 'POST' : 'GET',
          headers: {
            'X-Request-ID': requestId,
            ...(encoded ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(encoded ? { body: encoded } : {}),
          signal,
        });
        const id = r.headers.get('X-Request-ID'),
          retryHeader = r.headers.get('Retry-After'),
          retryAfter = Number(retryHeader),
          retryAfterMs =
            retryHeader !== null &&
            Number.isFinite(retryAfter) &&
            retryAfter >= 0
              ? Math.min(retryAfter * 1000, 60000)
              : null;
        if (
          !encoded &&
          attempt < this.retries &&
          [429, 503].includes(r.status)
        ) {
          await r.body?.cancel();
          const delay = retryAfterMs ?? 250 * 2 ** attempt;
          await new Promise<void>((resolve, reject) => {
            if (signal.aborted) {
              reject(signal.reason);
              return;
            }
            const done = () => {
                signal.removeEventListener('abort', abort);
                resolve();
              },
              handle = setTimeout(done, delay),
              abort = () => {
                clearTimeout(handle);
                reject(signal.reason);
              };
            signal.addEventListener('abort', abort, { once: true });
          });
          continue;
        }
        if (Number(r.headers.get('Content-Length')) > 2 * 1024 * 1024) {
          await r.body?.cancel();
          throw new EarthError(
            'Response exceeds 2 MiB.',
            'RESPONSE_TOO_LARGE',
            r.status,
            id,
          );
        }
        const reader = r.body?.getReader(),
          chunks: Uint8Array[] = [];
        let size = 0;
        if (reader) {
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.length;
              if (size > 2 * 1024 * 1024) {
                await reader.cancel();
                throw new EarthError(
                  'Response exceeds 2 MiB.',
                  'RESPONSE_TOO_LARGE',
                  r.status,
                  id,
                );
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        let data: unknown;
        try {
          data = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          throw new EarthError(
            'Earth returned invalid JSON.',
            'INVALID_RESPONSE',
            r.status,
            id,
          );
        }
        if (!r.ok) {
          const v = data as { error?: unknown; code?: unknown };
          throw new EarthError(
            typeof v.error === 'string' ? v.error : 'Earth request failed.',
            typeof v.code === 'string' ? v.code : 'HTTP_ERROR',
            r.status,
            id,
            retryAfterMs,
          );
        }
        return data as T;
      } catch (e) {
        if (options.signal?.aborted)
          throw new EarthError('Request cancelled.', 'ABORTED', 0, requestId);
        if (timer.aborted)
          throw new EarthError(
            'Earth request timed out.',
            'TIMEOUT',
            0,
            requestId,
          );
        if (e instanceof EarthError) throw e;
        throw new EarthError(
          'Earth endpoint is unavailable.',
          'NETWORK_ERROR',
          0,
          requestId,
          null,
          e,
        );
      }
    }
  }
  query<K extends ToolName>(
    plan: QueryPlan<K>,
    options?: RequestOptions,
  ): Promise<QueryResult<K>> {
    return this.request('/query', plan, options);
  }
  readonly datasets = {
    list: (options: PageOptions = {}) =>
      this.request<PageResult<Dataset>>(
        '/catalog/datasets' + this.pageQuery(options),
        undefined,
        options,
      ),
    features: (dataset: string, options: PageOptions = {}) =>
      this.request<PageResult<Feature>>(
        '/catalog/datasets/' +
          this.datasetId(dataset) +
          '/features' +
          this.pageQuery(options),
        undefined,
        options,
      ),
    pages: (options: PageOptions = {}) =>
      this.pages<Dataset>('/catalog/datasets', options),
    featurePages: (dataset: string, options: PageOptions = {}) =>
      this.pages<Feature>(
        '/catalog/datasets/' + this.datasetId(dataset) + '/features',
        options,
      ),
  };
  readonly places = {
    search: (query: string, options: RequestOptions = {}) =>
      this.query(
        {
          schema_version: 1,
          tool: 'search_features',
          arguments: { dataset: 'natural-earth-places', query, limit: 20 },
        },
        options,
      ),
  };
  readonly spatial = {
    query: <K extends SpatialName>(
      tool: K,
      args: ToolArguments[K],
      options?: RequestOptions,
    ) =>
      this.query(
        { schema_version: 1, tool, arguments: args } as QueryPlan<K>,
        options,
      ),
    withinRadius: (
      args: ToolArguments['within_distance'],
      options?: RequestOptions,
    ) =>
      this.query(
        { schema_version: 1, tool: 'within_distance', arguments: args },
        options,
      ),
    nearest: (args: ToolArguments['nearest'], options?: RequestOptions) =>
      this.query(
        { schema_version: 1, tool: 'nearest', arguments: args },
        options,
      ),
  };
  readonly temporal = {
    query: <K extends TemporalName>(
      tool: K,
      args: ToolArguments[K],
      options?: RequestOptions,
    ) =>
      this.query(
        { schema_version: 1, tool, arguments: args } as QueryPlan<K>,
        options,
      ),
  };
  readonly capabilities = {
    get: (options?: RequestOptions) =>
      this.request<Capabilities>('/capabilities', undefined, options),
  };
  readonly ai = {
    providers: (options?: RequestOptions) => {
      if (!this.applicationId)
        throw new EarthError(
          'Provider discovery requires a registered application scope.',
          'CONFIGURATION',
        );
      return this.request<ProviderDiscovery>(
        '/ai/providers',
        undefined,
        options,
      );
    },
    propose: (question: string, options: PlanningOptions = {}) => {
      if (options.context && !this.applicationId)
        throw new EarthError(
          'Planning context requires a registered application scope.',
          'CONFIGURATION',
        );
      return this.request<PlanProposal>(
        '/ai/plan',
        { question, ...(options.context ? { context: options.context } : {}) },
        options,
      );
    },
  };
  readonly workspaces = {
    local: (applicationId: string, storage: StorageAdapter) =>
      new LocalWorkspaces(applicationId, storage),
  };
  private datasetId(id: string) {
    if (!/^[-a-z0-9]{1,80}$/.test(id))
      throw new EarthError('Invalid dataset ID.', 'CONFIGURATION');
    return id;
  }
  private pageQuery(options: PageOptions) {
    const p = new URLSearchParams();
    if (options.limit !== undefined) p.set('limit', String(options.limit));
    if (options.cursor !== undefined) p.set('cursor', options.cursor);
    return p.size ? '?' + p.toString() : '';
  }
  private async *pages<T>(
    path: string,
    options: PageOptions,
  ): AsyncGenerator<PageResult<T>> {
    let cursor = options.cursor;
    const seen = new Set<string>();
    for (let i = 0; i < 501; i++) {
      const r = await this.request<PageResult<T>>(
        path + this.pageQuery({ ...options, cursor }),
        undefined,
        options,
      );
      yield r;
      if (r.page.next_cursor === null) return;
      if (seen.has(r.page.next_cursor))
        throw new EarthError('Pagination cursor repeated.', 'INVALID_RESPONSE');
      seen.add(r.page.next_cursor);
      cursor = r.page.next_cursor;
    }
    throw new EarthError('Pagination budget exceeded.', 'BUDGET_EXCEEDED');
  }
}
