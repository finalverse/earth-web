# Security assessment — local experimental core

The service binds **127.0.0.1 only**. It is not an authenticated internet server. Do not expose it with a reverse proxy or change the listener to `0.0.0.0` without a separate authentication, authorization and operational review.

Implemented boundaries:

- Fixed loopback Host/origin allowlists mitigate browser cross-origin requests and DNS rebinding. No permissive CORS or cookies.
- Fixed read-only operators and schema validation reject extra properties, arbitrary code, SQL, file paths, dataset URLs and unknown actions.
- Public/owner registry filtering occurs in the core, not only the UI. HTTP clients cannot supply a principal. Private registry support is an embedded contract, not public signup.
- JSON requests are limited to 16 KiB, queries to 100 results, HTTP clients to 120 API requests/minute, model calls to two concurrently with a 20-second upstream deadline, and model responses to 32 KiB. Server connection/header/time bounds apply.
- Local Ollama is explicitly enabled and defaults to a loopback-only endpoint. No API keys, cloud fallback, world passwords, user-location inference or private MutSea access is used.
- Static serving resolves real paths within `dist-earth`; source, environment and credential files are not served. CSP limits scripts, connections, workers and images to the application and its Cesium resources.
- Approximate/hidden anchor serialization strips exact/private frame data before publication. No account or GeoAnchor publishing service is introduced.

Residual limitations: the operator and local machine are trusted. These in-memory rate/concurrency controls are not distributed resource isolation. Application manifests restrict core tools but are not a code sandbox. Dataset loading is operator-only and is not a hardened untrusted-file ingestion pipeline. Static dependency/provider licensing and supply-chain audits remain required before distribution. The inherited full upstream app has a much broader surface and is not enabled by Earth startup. LLM answers can be wrong; schema validation limits operations but does not establish intent. Only deterministic execution results should be treated as query evidence.

Report a security issue privately through repository maintainers; omit credentials, private location data and session URLs from public reports. No vulnerability bounty or guaranteed response SLA is represented.
