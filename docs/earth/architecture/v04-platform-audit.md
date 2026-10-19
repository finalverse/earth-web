# v0.4 platform audit · 2026-10-19

Baseline: clean `main`, `27380d9bedb6d2496eb017ff3f38b2bb7c984698`; work proceeds on `codex/earth-v04-platform`. Origin is `finalverse/finalverse-earth`, maintained globe upstream `finalverse/gods-eye-view`. The public v0.3 readiness/status checks pass, with AI and world integration disabled. Its release, runtime, DNS and website are preserved.

## Reuse and readiness

The existing Node HTTP transport, 25 deterministic spatial/temporal operators, immutable registry, optional least-privilege PostGIS adapter, source checksums/provenance, UTC contracts and bounded Ollama planner are working components with v0.3 regression evidence. Preserve them and their licensed upstream schema/geography helpers. This is a preview baseline, not a claim of independently audited production certification.

Experimental components include the repository-only SDK (generic argument records, no distributable typed package), browser-local five-document store, trusted in-process application budget wrapper and local single-turn planner. The existing application wrapper constrains tool calls in-process but is not a server-side installation/grant mechanism or JavaScript sandbox.

## Gaps and risks

- No public OpenAPI contract, clean SDK artifact test, typed per-tool argument/result contracts, timeout/error/retry policy or cursor pagination.
- No server-installed application manifests/grants; a browser declaration cannot grant authority. Scoped requests must use server-owned policies, preserving registry/PostGIS access controls and checking every referenced dataset, including joins, comparisons and place resolution.
- Same-origin JavaScript shares origin storage and can call public anonymous APIs. Restrict this milestone to reviewed local/same-origin apps. Namespaced storage prevents accidental collisions; it is not protection from malicious same-origin code. No untrusted remote plugin execution or privileged browser token.
- v0.3 documents must remain readable without altering existing storage. New application documents need explicit app IDs and import/migration rules. Never export provider credentials.
- CORS remains exact-origin/loopback. Separate public frontend hosting needs a reviewed same-origin reverse proxy, not wildcard CORS or arbitrary proxy destinations.
- Model proposals need validation without pre-executing them. Conversation history is context, never authoritative feature data; data artifacts must reference real receipts.

## Architecture and sequence

1. Publish an OpenAPI 3.1 contract derived from real tool schemas; add conformance tests and correlation/error/pagination contracts.
2. Build a dependency-free ESM TypeScript package `@finalverse/earth`, with explicit app scope, typed query groups, cancellation, timeouts and opt-in safe GET retries. Pack locally; do not publish to npm.
3. Install validated manifests and separately approved grant policies in the server. Apply dataset/tool/budget policy before the existing deterministic executor. Unsupported capabilities fail closed.
4. Reuse the v0.3 workspace validator/store in the package, with scoped storage and explicit legacy import. Keep renderer/framework adapters outside the core package.
5. Pass v0.4A package, TypeScript, HTTP, permission, schema and compatibility gates before starting the independent application.
6. Build Energy Explorer as a separate package that installs the SDK tarball, with its own manifest/tests/build. Reuse Cesium through public APIs and retained credits, not private Earth renderer modules.
7. Add a small provider-neutral, ordered session event contract; reuse the local Ollama proposal boundary. Separate proposals, approval and deterministic result artifacts. Ground follow-ups in actual selected feature IDs.

Rust migration is deferred: no measured Node/serialization bottleneck justifies duplicating the working query engine or PostGIS. React adapters are also deferred until a real consumer requires them. The independent application will demonstrate an optional Cesium rendering boundary without coupling the core SDK.

## Related AI systems inspected

The existing Finalverse AI gateway is a Python BSD-licensed world planner with bounded context, structured output, usage and request IDs. Its world actions and authenticated MutSea capability should not be imported into an anonymous Earth app. Hermon's API-shape design uses OpenAI/Ollama-compatible model/message/tool/stream contracts. Reuse these conceptual provider boundaries, cancellation and usage vocabulary; do not claim remote Hermon connectivity or copy private deployment configuration. Existing services are unchanged.

No public deployment or npm publication is part of this implementation run. Release readiness will be documented separately from local/CI evidence.
