# Application manifest and operator grants · v1.0

`earth/platform/manifest.js` owns the shared validation contract, copied into the SDK build. The OpenAPI `ApplicationManifest` schema describes the same fields. IDs are stable reverse-domain-style identifiers; versions are explicit. `entry` must be a relative HTML path without traversal, queries or remote URLs. `api_version` is `1`; the only supported runtime is `trusted-same-origin`.

Required fields: `manifest_version`, `id`, `name`, `version`, `api_version`, `entry`, `runtime`, `capabilities`, `datasets`, `tools`, `budgets`. The executable example is `earth/platform/dev-grants/sdk-example.json`. Feature budgets are 1–100, radius budgets 1–500,000 metres. Duplicates, unknown fields/capabilities/tools and larger budgets are rejected.

Capabilities implemented: `earth.datasets.read`, `earth.spatial.query`, `earth.temporal.query`, `earth.workspace.local.read`, `earth.workspace.local.write`, `earth.ai.plan`. Filesystem, shell, arbitrary network, database, world mutation and remote-plugin capabilities are **unsupported**, not implicit permissions.

## Authority

A manifest requests permissions. The operator separately installs a grant (same schema/identity/version) whose dataset/tool/capability sets and budgets cannot exceed the request. A denied or absent grant never becomes authority through HTTP headers, model output or client initialization. Installed public scopes use `/v1/apps/{applicationId}/...`. The server validates every call before the existing core executor, including join/comparison datasets and the place-provider dependency. Registry and optional database authorization remain authoritative.

The application ID is a routing scope, **not an authenticated user identity**. Approved public scopes are callable anonymously within their budgets. The legacy anonymous API still exposes approved public data; restricting one app does not make public datasets private. There is no private-app identity service or arbitrary code loader in this milestone. Operator credentials stay server-side and are not provided to the application runtime.

Same-origin code shares origin authority and can inspect origin storage; namespacing protects against accidental collisions, not malicious same-origin JavaScript. Use only reviewed applications. An iframe, a manifest prompt or a client-side check is not a security sandbox. Third-party remote hosting, authenticated private applications and untrusted plugin isolation require a later reviewed design.

## Lifecycle

The SDK runtime validates the request manifest, initializes a client with an explicit app ID, obtains real server grants, checks identity/version/runtime and verifies all required permissions. It then becomes `ready`; errors are surfaced to the caller/error hook. `stop()` prevents subsequent runtime workspace access. Stopping the local runtime is not revocation of an already approved public server scope or deletion of local data.

AI availability is distinct from approval: an approved `earth.ai.plan` grant can exist while the service reports `ai_enabled:false`. Deterministic operation remains available. Proposals are schema/policy checked without executing tools; applying a reviewed plan goes through the scoped query endpoint again.
