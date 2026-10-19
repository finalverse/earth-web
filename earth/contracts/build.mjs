// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { createEarthCore } from '../core/index.js';
import { manifestSchema } from '../platform/manifest.js';
import { writeFile, mkdir, readFile, copyFile } from 'node:fs/promises';
const tools = createEarthCore().definitions();
const ref = (n) => ({ $ref: '#/components/schemas/' + n });
const obj = (
  properties,
  required = Object.keys(properties),
  extra = false,
) => ({ type: 'object', properties, required, additionalProperties: extra });
const str = { type: 'string' },
  num = { type: 'number' },
  strings = { type: 'array', items: str };
const instant = {
  type: 'string',
  format: 'date-time',
  pattern: '^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d{3})?Z$',
  description:
    'Explicit UTC Z only; Gregorian validation; intervals are [start,end).',
};
const camera = obj(
  Object.fromEntries(
    ['longitude', 'latitude', 'height', 'heading', 'pitch', 'roll'].map((k) => [
      k,
      num,
    ]),
  ),
);
const schemas = {
  Position: {
    type: 'array',
    prefixItems: [
      { type: 'number', minimum: -180, maximum: 180 },
      { type: 'number', minimum: -90, maximum: 90 },
      num,
    ],
    minItems: 2,
    maxItems: 3,
    items: false,
    description:
      'WGS84 longitude, latitude in degrees, optional ellipsoidal height in metres. No axis guessing.',
  },
  CRS: {
    type: 'string',
    enum: ['OGC:CRS84', 'EPSG:4979', 'EPSG:4978'],
    description:
      'Geographic positions use lon/lat order; ECEF is X,Y,Z metres.',
  },
  Bounds: {
    type: 'array',
    items: num,
    minItems: 4,
    maxItems: 4,
    description:
      '[west,south,east,north] degrees. west > east crosses the antimeridian.',
  },
  Geometry: obj({
    type: {
      type: 'string',
      enum: [
        'Point',
        'MultiPoint',
        'LineString',
        'MultiLineString',
        'Polygon',
        'MultiPolygon',
      ],
    },
    coordinates: { type: 'array', items: {} },
  }),
  Feature: obj({
    type: { const: 'Feature' },
    id: str,
    properties: { type: 'object' },
    geometry: ref('Geometry'),
  }),
  FeatureCollection: obj(
    {
      type: { const: 'FeatureCollection' },
      features: { type: 'array', items: ref('Feature') },
    },
    ['type', 'features'],
    true,
  ),
  TemporalRange: obj({ start: instant, end: instant }),
  TemporalObservation: obj({
    id: str,
    feature_id: str,
    field: str,
    value: num,
    interval: ref('TemporalRange'),
    event_at: { anyOf: [instant, { type: 'null' }] },
    observed_at: { anyOf: [instant, { type: 'null' }] },
    valid_interval: { anyOf: [ref('TemporalRange'), { type: 'null' }] },
    ingested_at: instant,
    source: str,
  }),
  Dataset: obj({
    id: str,
    title: str,
    version: str,
    feature_count: { type: 'integer', minimum: 0 },
    provenance: { type: 'object' },
    temporal: { type: 'object' },
  }),
  Receipt: obj({
    execution_id: { type: 'string', format: 'uuid' },
    executed_at: instant,
    plan_sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    core_version: str,
    access: { const: 'read-only' },
  }),
  QueryRequest: {
    oneOf: tools.map((t) =>
      obj(
        {
          schema_version: { const: 1 },
          tool: { const: t.name },
          arguments: t.inputSchema,
        },
        [
          'schema_version',
          'tool',
          ...(t.inputSchema.required.length ? ['arguments'] : []),
        ],
      ),
    ),
  },
  QueryResult: obj(
    {
      schema_version: { const: 1 },
      plan: ref('QueryRequest'),
      summary: str,
      data: { type: 'object' },
      provenance: { type: 'object' },
      receipt: ref('Receipt'),
      elapsed_ms: { type: 'number', minimum: 0 },
      request_id: str,
    },
    ['schema_version', 'plan', 'summary', 'data', 'receipt', 'elapsed_ms'],
    false,
  ),
  ApplicationManifest: manifestSchema,
  Capabilities: obj(
    {
      api_version: { const: '1' },
      platform_version: str,
      application_id: str,
      application_version: str,
      runtime: { const: 'trusted-same-origin' },
      capabilities: strings,
      tools: strings,
      datasets: strings,
      budgets: obj({
        max_features: { type: 'integer', minimum: 1, maximum: 100 },
        max_radius_m: { type: 'number', minimum: 1, maximum: 20000000 },
      }),
      ai_enabled: { type: 'boolean' },
      workspace_storage: str,
      request_id: str,
    },
    [
      'api_version',
      'platform_version',
      'capabilities',
      'tools',
      'datasets',
      'budgets',
      'ai_enabled',
    ],
    true,
  ),
  Error: obj(
    {
      error: str,
      code: {
        type: 'string',
        enum: [
          'INVALID_REQUEST',
          'CAPABILITY_DENIED',
          'FORBIDDEN',
          'NOT_FOUND',
          'CONFLICT',
          'PAYLOAD_TOO_LARGE',
          'RATE_LIMITED',
          'UNAVAILABLE',
        ],
      },
      request_id: str,
    },
    ['error', 'code', 'request_id'],
  ),
  Page: obj({
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    next_cursor: { type: ['string', 'null'] },
    total: { type: 'integer', minimum: 0 },
    snapshot: str,
  }),
  DatasetPage: obj(
    {
      items: { type: 'array', items: ref('Dataset') },
      page: ref('Page'),
      request_id: str,
    },
    ['items', 'page'],
  ),
  FeaturePage: obj(
    {
      items: { type: 'array', items: ref('Feature') },
      page: ref('Page'),
      provenance: { type: 'object' },
      request_id: str,
    },
    ['items', 'page', 'provenance'],
  ),
  Workspace: obj(
    {
      schema_version: { const: 1 },
      id: str,
      title: str,
      notes: str,
      application: str,
      created_at: instant,
      updated_at: instant,
      camera,
      layers: {
        type: 'array',
        maxItems: 16,
        items: obj({ id: str, version: str, visible: { type: 'boolean' } }),
      },
      selected_features: { type: 'array', maxItems: 100, items: str },
      temporal_range: { anyOf: [ref('TemporalRange'), { type: 'null' }] },
      plan: { anyOf: [ref('QueryRequest'), { type: 'null' }] },
      receipt: { anyOf: [ref('Receipt'), { type: 'null' }] },
      provenance: { type: 'array', items: { type: 'object' } },
      saved_views: { type: 'array', items: obj({ title: str, camera }) },
      application_state: { type: 'object' },
    },
    [
      'schema_version',
      'id',
      'title',
      'notes',
      'application',
      'created_at',
      'updated_at',
      'camera',
      'layers',
      'selected_features',
      'temporal_range',
      'plan',
      'receipt',
      'provenance',
      'saved_views',
    ],
  ),
};
schemas.ProposalRequest = obj({
  question: { type: 'string', minLength: 1, maxLength: 1000 },
});
schemas.PlanningContext = obj(
  {
    plan: ref('QueryRequest'),
    selected: obj({ dataset: str, feature_id: str }),
  },
  [],
);
schemas.ScopedProposalRequest = obj(
  {
    question: { type: 'string', minLength: 1, maxLength: 1000 },
    context: ref('PlanningContext'),
  },
  ['question'],
);
schemas.ProviderDiscovery = obj(
  {
    providers: { type: 'array', items: { type: 'object' } },
    streaming: { const: false },
    policy: { type: 'object' },
    request_id: str,
  },
  ['providers', 'streaming'],
);
schemas.Proposal = obj(
  {
    plan: ref('QueryRequest'),
    requires_review: { const: true },
    provider: str,
    model: str,
    elapsed_ms: { type: 'number' },
    usage: { type: ['object', 'null'] },
    streaming: { const: false },
    routing: { type: 'object' },
    request_id: str,
  },
  ['plan', 'requires_review', 'provider'],
);
const sessionPayloads = {
  'session.started': obj({ protocol_version: { const: 1 } }),
  'message.delta': obj({
    role: { enum: ['user', 'system'] },
    text: { type: 'string', maxLength: 1000 },
    authoritative: { const: false },
  }),
  'tool.requested': obj({ plan: ref('QueryRequest') }),
  'tool.completed': obj({ result: ref('QueryResult') }),
  'artifact.created': obj({
    artifact_id: { type: 'string', format: 'uuid' },
    kind: { const: 'spatial-result' },
    result: ref('QueryResult'),
  }),
  'plan.proposed': obj({
    proposal_id: { type: 'string', format: 'uuid' },
    proposal: ref('Proposal'),
  }),
  'approval.requested': obj({
    proposal_id: { type: 'string', format: 'uuid' },
  }),
  'execution.completed': obj({
    artifact_id: { type: 'string', format: 'uuid' },
    receipt: ref('Receipt'),
  }),
  'session.completed': obj({ reason: { enum: ['closed', 'cancelled'] } }),
  'session.failed': obj({
    code: str,
    request_id: { type: 'string', format: 'uuid' },
    message: str,
  }),
};
schemas.SessionEvent = {
  oneOf: Object.entries(sessionPayloads).map(([type, payload]) =>
    obj({
      protocol_version: { const: 1 },
      session_id: { type: 'string', format: 'uuid' },
      event_id: { type: 'string', format: 'uuid' },
      sequence: { type: 'integer', minimum: 1 },
      at: { type: 'string', format: 'date-time' },
      request_id: { type: 'string', format: 'uuid' },
      type: { const: type },
      payload,
    }),
  ),
  description:
    'Local SDK session protocol v1. Replaying events never executes tools. No streaming HTTP endpoint is claimed.',
};
const response = (name) => ({
  description: 'Success',
  headers: { 'X-Request-ID': { schema: { type: 'string', format: 'uuid' } } },
  content: { 'application/json': { schema: ref(name) } },
});
const errors = Object.fromEntries(
  [400, 403, 404, 409, 413, 415, 429, 503].map((n) => [
    n,
    {
      description:
        n === 429
          ? 'Budget exhausted; Retry-After seconds'
          : 'Sanitized failure',
      content: { 'application/json': { schema: ref('Error') } },
    },
  ]),
);
const pageParams = [
  {
    in: 'query',
    name: 'limit',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
  },
  { in: 'query', name: 'cursor', schema: { type: 'string', maxLength: 512 } },
];
const paths = {};
for (const scope of ['', '/apps/{applicationId}']) {
  const params = scope
    ? [
        {
          in: 'path',
          name: 'applicationId',
          required: true,
          schema: manifestSchema.properties.id,
        },
      ]
    : [];
  for (const [path, model, description] of [
    ['/capabilities', 'Capabilities', 'Discover granted capabilities'],
    ['/catalog/datasets', 'DatasetPage', 'List authorized datasets'],
    [
      '/catalog/datasets/{datasetId}/features',
      'FeaturePage',
      'Read a bounded immutable feature page',
    ],
  ]) {
    paths['/v1' + scope + path] = {
      get: {
        description,
        parameters: [
          ...params,
          ...(path.includes('catalog') ? pageParams : []),
          ...(path.includes('{datasetId}')
            ? [{ in: 'path', name: 'datasetId', required: true, schema: str }]
            : []),
        ],
        responses: { 200: response(model), ...errors },
      },
    };
  }
  paths['/v1' + scope + '/ai/plan'] = {
    post: {
      description:
        'Optional local inference only when explicitly configured and granted. A proposal is validated but not executed.',
      parameters: params,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref(scope ? 'ScopedProposalRequest' : 'ProposalRequest'),
          },
        },
      },
      responses: { 200: response('Proposal'), ...errors },
    },
  };
  if (scope)
    paths['/v1' + scope + '/ai/providers'] = {
      get: {
        description:
          'Discover operator-configured local planners. No cloud fallback, no browser-supplied endpoint/model.',
        parameters: params,
        responses: { 200: response('ProviderDiscovery'), ...errors },
      },
    };
  paths['/v1' + scope + '/query'] = {
    post: {
      description:
        'Execute one schema-validated, authorized read-only tool. Distances are WGS84 ellipsoidal metres; topology uses documented planar geometry rules. No implicit temporal interpolation.',
      parameters: params,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('QueryRequest') } },
      },
      responses: { 200: response('QueryResult'), ...errors },
    },
  };
}
paths['/v1/openapi.json'] = {
  get: {
    description: 'This contract; legacy v0.3 endpoints remain available.',
    responses: {
      200: {
        description: 'OpenAPI 3.1 document',
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    },
  },
};
paths['/v1/layers'] = {
  get: {
    description: 'Legacy v0.3 authorized layer list.',
    responses: {
      200: {
        description: 'Layers',
        content: {
          'application/json': {
            schema: obj(
              {
                layers: { type: 'array', items: ref('Dataset') },
                request_id: str,
              },
              ['layers'],
            ),
          },
        },
      },
      ...errors,
    },
  },
};
for (const [path, properties, required] of [
  [
    '/v1/status',
    {
      version: str,
      ai_enabled: { type: 'boolean' },
      worlds_enabled: { type: 'boolean' },
      mutsea_required: { const: false },
      request_id: str,
    },
    ['version', 'ai_enabled', 'worlds_enabled', 'mutsea_required'],
  ],
  [
    '/v1/tools',
    {
      tools: {
        type: 'array',
        items: obj({ name: str, title: str, inputSchema: { type: 'object' } }),
      },
      request_id: str,
    },
    ['tools'],
  ],
  [
    '/v1/providers',
    {
      providers: { type: 'array', items: { type: 'object' } },
      request_id: str,
    },
    ['providers'],
  ],
  [
    '/v1/worlds',
    { worlds: { type: 'array', items: { type: 'object' } }, request_id: str },
    ['worlds'],
  ],
])
  paths[path] = {
    get: {
      description: 'Preserved v0.3 discovery endpoint.',
      responses: {
        200: {
          description: 'Discovery metadata',
          content: {
            'application/json': { schema: obj(properties, required) },
          },
        },
        ...errors,
      },
    },
  };
paths['/v1/datasets/{datasetId}/features'] = {
  get: {
    description:
      'Legacy complete authorized feature collection. New SDKs use cursor pages.',
    parameters: [
      { in: 'path', name: 'datasetId', required: true, schema: str },
    ],
    responses: {
      200: {
        description: 'Authorized source snapshot',
        content: {
          'application/json': {
            schema: obj(
              {
                summary: str,
                data: ref('FeatureCollection'),
                provenance: { type: 'object' },
                request_id: str,
              },
              ['summary', 'data', 'provenance'],
            ),
          },
        },
      },
      ...errors,
    },
  },
};
for (const path of ['/healthz', '/readyz'])
  paths[path] = {
    get: {
      description: 'Process health or configured dependency readiness.',
      responses: Object.fromEntries(
        (path === '/readyz' ? [200, 503] : [200]).map((n) => [
          n,
          {
            description: 'Health state',
            content: {
              'application/json': {
                schema: obj({
                  status: {
                    type: 'string',
                    enum: ['ok', 'ready', 'unavailable'],
                  },
                  version: str,
                }),
              },
            },
          },
        ]),
      ),
    },
  };
const doc = {
  openapi: '3.1.1',
  info: {
    title: 'Finalverse Earth Platform',
    version: '0.4.0-dev.1',
    description:
      'API /v1 remains backward compatible with v0.3. Reviewed same-origin app grants are operator-installed, not self-authorized. Generic GeoJSON follows RFC 7946. Temporal instants are the strict UTC subset documented here. Public anonymous endpoints remain read-only and bounded.',
  },
  servers: [
    {
      url: 'http://127.0.0.1:18641',
      description: 'Isolated v0.4 development; public v0.3 is unchanged',
    },
  ],
  paths,
  components: { schemas },
};
await writeFile(
  new URL('./openapi.json', import.meta.url),
  JSON.stringify(doc, null, 2) + '\n',
);
const dir = new URL('../../packages/earth/src/generated/', import.meta.url);
await mkdir(dir, { recursive: true });
function ts(s) {
  if (s.enum) return s.enum.map((x) => JSON.stringify(x)).join(' | ');
  if (s.type === 'object')
    return (
      '{ ' +
      Object.entries(s.properties ?? {})
        .map(
          ([k, v]) =>
            `${JSON.stringify(k)}${s.required?.includes(k) ? '' : '?'}: ${ts(v)}`,
        )
        .join('; ') +
      ' }'
    );
  if (s.type === 'array') return `Array<${s.items ? ts(s.items) : 'unknown'}>`;
  return (
    {
      string: 'string',
      number: 'number',
      integer: 'number',
      boolean: 'boolean',
    }[s.type] ?? 'unknown'
  );
}
await writeFile(
  new URL('tools.ts', dir),
  '// Generated from actual server tool definitions. Do not edit.\nexport interface ToolArguments {\n' +
    tools
      .map((t) => ` ${JSON.stringify(t.name)}: ${ts(t.inputSchema)};`)
      .join('\n') +
    '\n}\n',
);
for (const [source, target] of [
  ['../core/workspace.js', 'workspace-core.js'],
  ['../core/time.js', 'time-core.js'],
  ['../platform/manifest.js', 'manifest-core.js'],
  ['../../src/tools/schema.js', 'schema-core.js'],
]) {
  let text = await readFile(new URL(source, import.meta.url), 'utf8');
  text = text
    .replace("'./time.js'", "'./time-core.js'")
    .replace("'../../src/tools/schema.js'", "'./schema-core.js'");
  await writeFile(new URL(target, dir), text);
}
console.log(
  'Generated OpenAPI 3.1, ' +
    tools.length +
    ' typed tools and shared validators.',
);
