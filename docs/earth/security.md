# Security boundaries — v0.3 public preview

The Node service binds **127.0.0.1 only**. Local development and the reviewed public deployment are separate configurations. The public preview serves only approved public reference datasets through HTTPS; it does not provide authenticated private-data hosting or public model inference. Follow the [accepted deployment profile](deployment.md) rather than exposing the development listener or broadening it to `0.0.0.0`.

Implemented boundaries:

- Local Host/origin allowlists and an explicit configured HTTPS origin mitigate cross-origin requests and DNS rebinding. The public proxy overwrites Host/client identity headers; forwarded identity is trusted only on a physical loopback connection. No permissive CORS or account cookies.
- Fixed read-only operators and schema validation reject extra properties, arbitrary code, SQL, file paths, dataset URLs and unknown actions.
- Public/owner registry filtering occurs in the core, not only the UI. HTTP clients cannot supply a principal. An optional bearer-token file grants one fixed local operator identity; it is not public signup or a multi-user identity service.
- Query/AI JSON requests are limited to 16 KiB; authenticated dataset registration to 2 MiB, ordinary query tools to 100 features (temporal observation responses are separately capped at 2,000 records), HTTP clients to 120 API requests/minute, model calls to two concurrently with a 20-second upstream deadline, and model responses to 32 KiB. Server connection/header/time bounds apply.
- Local Ollama is explicitly enabled and defaults to a loopback-only endpoint. No API keys, cloud fallback, world passwords, user-location inference or private MutSea access is used.
- Static serving resolves real paths within `dist-earth`; source, environment and credential files are not served. CSP limits scripts, connections, workers and images to the application and its Cesium resources.
- Approximate/hidden anchor serialization strips exact/private frame data before publication. No account or GeoAnchor publishing service is introduced.

Residual limitations: the operator and local machine are trusted. These in-memory rate/concurrency controls are not distributed resource isolation. Application manifests restrict core tools but are not a code sandbox. Dataset loading is operator-only, validates bounded inline GeoJSON and provenance, and is not a hardened untrusted-file ingestion pipeline. Optional PostgreSQL uses a dedicated earth_* database and a non-owner, non-superuser role with forced row security. Index limitations are documented; security is not disabled for benchmark gains. Registration batches roll back on failure. Static dependency/provider licensing and supply-chain audits remain required before distribution. The inherited full upstream app has a much broader surface and is not enabled by Earth startup. LLM answers can be wrong; schema validation limits operations but does not establish intent. Only deterministic execution results should be treated as query evidence.

## Public deployment additions

- A dedicated locked service account and root-owned immutable releases separate Earth from other product services. The unit restricts filesystem/privileges, memory (512 MiB) and tasks (64). The host default Node remains unchanged.
- HTTPS uses a trusted hostname certificate, HSTS and a verified renewal dry-run. Private keys, DNS credentials and operator token files are excluded from source and release packages.
- The Earth-only edge budgets 2 API requests/second/client with burst 16, 32 connections/client, bounded bodies/timeouts and explicit 429 responses. Public operator registration and metrics return 404; model planning is disabled. PostgreSQL remains optional and private.
- JSON request logs omit bodies, query strings, addresses and credentials. Aggregate metrics are private; no product analytics or location tracking was added.
- Readiness checks the configured database when enabled. Checksummed atomic switching passed a real version rollback and automatic failing-candidate recovery; existing services were preserved.
- HTTP tests cover weak/list/wildcard cache validators, missing static paths, symlink confinement, schema/budget violations, private layers and origins. External HTTPS checks and a clean package install passed. This is not an independent penetration test or sustained-load certification.

Report a security issue privately through repository maintainers; omit credentials, private location data and session URLs from public reports. No vulnerability bounty or guaranteed response SLA is represented.
