# Typed SDK and HTTP API · v0.4 candidate

`@finalverse/earth` is a dependency-free ESM package with strict generated per-tool TypeScript argument types, feature/receipt/temporal/workspace types and plain JavaScript output. Node 24 and modern browser Fetch/Web Crypto/AbortSignal are the supported runtime profile. No browser DOM access or framework/renderer imports enter the package.

| Group          | Implemented methods                                                 |
| -------------- | ------------------------------------------------------------------- |
| `places`       | `search(query, options)` against authoritative Natural Earth places |
| `datasets`     | `list`, `features`, async `pages`, async `featurePages`             |
| `spatial`      | typed `query(tool,args)`, `withinRadius`, `nearest`                 |
| `temporal`     | typed `query(tool,args)` for seven temporal tools                   |
| `capabilities` | `get()` for actual global/app policy and availability               |
| `workspaces`   | `local(applicationId, storage)` with explicit caller storage        |
| `ai`           | optional `propose(question)`, always `requires_review:true`         |
| client         | typed `query(plan, options)` for all actual 25 operators            |

Every request supports `AbortSignal`, a 1–60,000 ms per-call timeout and optional UUID correlation. Default timeout is 15 seconds; retries default to zero. Explicit retries 1/2 affect GET 429/503 only, respect Retry-After within the overall deadline and never replay proposal/query POSTs. Responses are capped at 2 MiB. `EarthError` exposes a stable code, status, request ID and optional retry delay; a non-enumerable cause supports local diagnosis. Server logs/errors remain sanitized.

Cursor pages return `items`, `page.limit`, `page.total`, `page.snapshot` and `page.next_cursor`. Cursors are bounded, snapshot-scoped offsets, not credentials or access tokens. The server rechecks policy on every page. Dataset changes return 409; callers restart pagination. Iterators detect repetition and cap page count. No offset is silently interpreted as a geographic coordinate.

Workspace methods: `list`, `save`, `open`, `duplicate`, `export`, `import`, `importLegacy`, `delete`. Exports use deterministic key ordering. Imported duplicate IDs create new documents. Existing v0.3 schema-1 exports are readable; migration to an app namespace requires explicit legacy application choice and preserves originals. New optional `application_state` is bounded to 64 KiB/depth 8 and rejects credential-like keys. Overall existing five-document/1 MiB limits remain. Browser persistence and receipts do not establish server backups or a durable WorldLine.

The transport-neutral API contract is `earth/contracts/openapi.json` (OpenAPI 3.1.1). Core JSON argument schemas are generated directly; additional domain checks (valid geometry, Gregorian instants, exact place IDs, one point or place, ownership) remain deterministic executor checks. Coordinates/ranges/precision follow the existing [API](../api.md) and [space-time](../space-time.md) specifications. The API version remains `/v1`; this SDK's `0.4.0-dev.1` version is separate from the reused `0.3.0` deterministic engine receipt version.

No React adapter is shipped without a real consumer. The independent application owns its Cesium dependency and rendering adapter. A Rust rewrite is deferred until measured bottlenecks justify one; current query/permission contracts are language neutral.
