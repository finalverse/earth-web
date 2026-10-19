# v0.4A → v0.4B implementation acceptance and release assessment

Baseline: clean `main` at `27380d9bedb6d2496eb017ff3f38b2bb7c984698`. Work is isolated on `codex/earth-v04-platform`. Foundation commit `cfad05d` passed [all four CI jobs](https://github.com/finalverse/finalverse-earth/actions/runs/39237212272) before intelligence/application implementation began. The maintained upstream pin, inherited renderer modules, Viewer, MutSea and websites are unchanged.

**Decision: implementation milestone verified locally; public release is not approved.** Public Earth remains v0.3.0 with AI/world integration disabled. No npm package or new public deployment was published. This is a production-oriented foundation and reference application, not a GA claim.

| v0.4B gate                      | Evidence                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A · public SDK                  | Independent `apps/energy-explorer` installs `@finalverse/earth` from its packed tarball. Only SDK, Cesium and its own modules enter application code. Package graph/import tests pass.                                                                                                                                                             |
| B/C · manifest and authority    | Own manifest, separate operator grant and runtime lifecycle. HTTP tests deny unknown tools, ungranted datasets/selected context, oversized radius/results, unknown app installation and missing capability classes.                                                                                                                                |
| D · grounded geography          | Montréal resolves to actual `ne-place-1173`. Complete 100 km renewable selection: 24 records / 17 connected groups. Hydro+solar: 18 / 12 groups. Solar: five / three groups. GeographicLib ellipsoidal grouping crosses the dateline in a synthetic test; source grouping matches PostGIS.                                                         |
| E · chat/map coupling           | Actual browser: conversation facility button highlights the globe; direct globe point selection updates the record inspector and source context. Selected Longueil TS Malbouef: Solar, 10 MW reported capacity, year 2017, 96.71 km from origin.                                                                                                   |
| F · no LLM required             | Deterministic discovery, grouping, fuel comparison and local documents operate without planning. Foundation browser runtime and scoped server tests run with AI disabled. No paid key or MutSea dependency.                                                                                                                                        |
| G · actual local model          | `llama3.2:3b` on local Ollama returns reviewed hydro/solar plan and “Only solar” refinement. Separate real HTTP acceptance script executes only after explicit approval and verifies 18 then five records. See `local-ai-v04b.json`.                                                                                                               |
| H · invalid model output        | Server rejects unsupported tools/datasets and schema errors before returning a proposal. Planning executes zero tools. Named-fuel broadening fails closed; pending IDs are single use; cancellation and replay do not execute tools. Session events conform to the language-neutral schema.                                                        |
| I · portable workspace          | Actual browser save → JSON download → reload → file chooser import → reopen. Filters, selected source feature, layer state, sampled radius, camera, result snapshot, provenance and original receipt survive. Open performs no query. Existing v0.3 Energy files migrate explicitly into a new app document.                                       |
| J · evidence visible            | Dataset snapshot, source attribution, reported years, archival/current distinction, method, parameters, count, UTC execution time, receipt and source links/notices are visible. Local snapshots are explicitly unverified editable content.                                                                                                       |
| K · compatibility               | Existing 42 tests pass with the dedicated PostGIS database enabled, including RLS, rollback, topology, time and new grouping parity. Legacy Earth build/artifact audit/import boundaries pass. Existing v0.3 workspace tests pass. Public status/readiness remains healthy.                                                                        |
| L · tests/CI                    | Eighteen platform/SDK/clean-package/session tests, five independent app tests and 42 database-enabled Earth tests pass locally. CI runs SDK and independent app install/types/tests/build/audit on macOS/Windows/Linux, plus the database integration job. Remote v0.4B result is recorded after its focused push.                                 |
| M/O · clean build and packaging | Fresh app `npm ci --ignore-scripts` uses its own lockfile and real SDK artifact. Own strict TS build and portable npm pack command create a static distribution archive without macOS resource forks with manifest, README and licensing. No source-tree backend import. Static deployment still requires the documented same-origin platform API. |
| N · no public anonymous AI      | Isolated development server binds loopback; model endpoint/model selected only by operator. Exact-origin public configuration refuses a planner in this preview. No cloud fallback, browser provider secrets or remotely installable application code.                                                                                             |

## Functional corrections found by real integration

- The v0.4A browser check exposed a Fetch receiver requirement and stale raw-module caching; default Fetch is now correctly bound and development responses use no-store.
- The first small-model comparison broadened two explicit source fuels into all renewables. The intent schema/prompt now require explicit fuel arrays and the adapter rejects a broadened named-fuel proposal.
- A follow-up dropped the prior radius. A deliberately narrow “only/just [fuel]” normalizer preserves the canonical approved place, radius and operation; general new geographic requests still require a valid model plan.
- Reload/import initially had no sampled-radius overlay. It is now saved as bounded display rings and restored without querying. Malformed geometry/comparisons are rejected before app-specific import persistence. Source facts remain separate from model text.

A supported HTTP prompt was also rejected before execution during a later repeat check; fresh-process verification subsequently passed both recorded scenarios. Local-model interpretation/cold-start reliability is not certified by these examples. Keep deterministic controls available and test a wider prompt corpus before public AI release.

## Performance and security limits

See [performance report](performance-v04.md), [architecture and session protocol](intelligence-v04.md), [application tutorial](../../../apps/energy-explorer/README.md), [SDK reference](sdk.md) and [manifest/security model](manifests.md).

Verified on an Apple Silicon Mac and in the in-app Chromium browser; native mobile, Safari/Firefox, accessibility certification, GPU memory, broad device/load coverage, external security review and live imagery/terrain providers are not certified here. Provider-neutral routing has one implemented local adapter. Sessions are bounded in-memory logs, not durable distributed agents. Only trusted same-origin apps are supported, and app IDs are not authenticated identities. Imported receipts are not signed attestations. Source geography/energy data is generalized and archival.

## Public release checklist — still requires approval

- [x] Focused source changes, schema compatibility, package install, strict typing, scoped authorization and deterministic integration tests.
- [x] Local model path verified without cloud credentials; public AI stays disabled.
- [x] Actual browser plan review/execution, map selection and workspace export/import evidence.
- [x] Independent build/package, attribution, qualified measurements and developer documentation.
- [ ] Review final branch CI and exact release commit; confirm all four jobs pass.
- [ ] Choose reviewed applications and operator grants for the public host; retain anonymous bounds and no public AI.
- [ ] Stage a clean distribution with HTTPS, CSP, readiness, rollback and a fresh browser check on the target host.
- [ ] Complete supported-browser/accessibility, package provenance and focused abuse/load review for the intended audience.
- [ ] Obtain explicit release approval before any production deployment, npm publication or release tag.

No long-running soak or browser screenshot pass alone substitutes for those release decisions. Next implementation is a staged release rehearsal of these two milestones, followed by a separately scoped CLI/durable-session design; do not start multiple new products while the release boundary is unresolved.

Local artifact hashes and archive inspection: [artifacts-v04.json](artifacts-v04.json). Browser evidence: [combined restored workspace and source selection](../media/energy-v04-workspace.png).
