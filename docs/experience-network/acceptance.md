# M3-C / M4-A — Experience Publishing + Web Player

**PASS — validated local publish → share → browser → explore works.** No public service was deployed.

## Baselines, commits and isolation

Accepted M3-A was confirmed through its report and clean delivery commits:

- Core: d476e2876e4329811227668f7ff5be83d109840e; runtime 98f8c0f4c152ea5cae0a7101a10401a89cb3ac2a.
- Infinity: e0bb10a9e2e48e470066990fe5a899a34f84f297; runtime 52c1b8b5b17853e77baf104e2fdd74c52ff29faa.
- Earth Web baseline: d40593d10c67b92610bc6d58ab9f6a61aa243317, with installed/locked Cesium 1.138.0.
- Accepted Montréal source: SpatialDB 2cd92aed2da317757e877f6d0954d308ca9796cf, publication 09946919b5bf53526eea44ad7938323785094f48a5aac48529aa628b544823fc, root 95f9780b1106c47f4bea87c2609396d425743b0ba0faa72d9d84ebfc2a980caf.

User-confirmed M1-C deliveries remain accepted: Core ada5e2bafcf363c226409c0d712d43e367025989, iOS 75694056aa4b0b627431320153d87e016a73a12c, Android be01f0a2a1983ab1c9a72d632d5d0fd913a8fe21. Their reported tests and simulator/emulator/service checks were not repeated. Physical devices and cloud continuity remain deferred. The reported private-dependency prerequisite for M1-B PR #1 was not changed.

| Repository | Branch | Worktree |
|---|---|---|
| Core | feat/experience-network | /Users/wenyan/Finalverse/dev/worktrees/core-fen-20261028 |
| Earth Web | feat/experience-web-player | /Users/wenyan/Finalverse/dev/worktrees/earth-web-fen-20261028 |

Core implementation: **d12d5562de320088cbe1c12ff2bfa4c3024b4aab**.
Web implementation: **2f4f890b977c718df3a5f3206f6445cafdd796f1**, followed by timing correction **022e58305d51f00f30913a3c9822de7ba5ba37cf**. Acceptance records follow these implementation commits.

No new repository, primary-checkout branch switch, merge or push. Accepted M2/M3-A and mobile worktrees and other product source were preserved. Sites' local-only workflow was used; there was no Site registration, cloud synchronization or hosting action.

## Contracts and deterministic validation

The additive el::network module contains closed typed contracts:

- finalverse.network-publication/v1: immutable publication/version and current status projection.
- finalverse.publication-content/v1: canonical experience identity, title, description, creator attribution/license, parent reference, remix permission, visibility, unchanged M2 package, asset closure and fallback.
- finalverse.web-scene/v1: pinned SpatialDB source/provenance, explicit east/up/south frame, bounded integer coordinates, original entity references and GLBs.
- finalverse.web-fallback/v1: Cesium district and accessible entity-list presentation, with unsupported native capabilities declared.
- finalverse.publish-request/v1 and finalverse.approved-publication-catalog/v1.

Canonical JSON and SHA-256 determine immutable publication identity. Status is separate so an administrator can mark an edition unavailable without changing its content. Existing SIL/EL/package/plan formats and source modules are unchanged; evidence/compatibility.json records the comparison.

The functional fen crate and CLI load a locally approved catalog. Preparation verifies the accepted root, geography hash, every selected source asset hash/length, complete identity set and source metadata permitting redistribution with attribution. Unknown terrain source notes remain null. Provenance comes from the accepted publication or unchanged M2 audio catalog.

Publishing uses existing package validation and EC compilation against a closed capability catalog. This slice supports the reviewed native interaction/resource contract and approved WAVs/GLBs. Unknown schemas/fields, duplicate keys, executable data, changed bindings, missing assets and changed provenance/licenses fail closed. There is no arbitrary asset upload, URL fetch or script/native-binary execution.

The catalog has **143 assets / 6,660,068 bytes**: 139 unchanged entity GLBs, one bounded derived preview document and three unchanged M2 audio assets. Preview bounds use 1 mm and the anchor uses 1 microdegree / 1 mm height; source geometry remains unchanged. The 139 source identities have SHA-256 88699acb974ebb351a6862d0a5afd64276b78f1eed59ee6cb1be229edde7567e, matching the accepted baseline.

## Registry behavior and APIs

| Method and route | Behavior |
|---|---|
| POST /api/v1/publications | Publisher-authorized immutable publication; identical content is idempotent |
| GET /api/v1/publications | Available public editions for visitors; operator visibility follows role |
| GET /api/v1/experiences/{id}/versions/{sha} | Exact version and status |
| GET .../assets/{sha} | Publication-scoped, verified approved bytes |
| GET .../link?entity={uuid} | Versioned link and optional validated selection |
| GET .../relationships | Role-scoped parent/derivative references |
| POST .../unavailable | Administrator-only persistent unavailability |
| GET /x/{id}/{sha}?entity={uuid} | Public browser entry with no credentials/session |

Distinct owner-only token files authorize publishing and administration. Visitors cannot retrieve private metadata, listings, links or assets. There is no global public CAS route: each asset retrieval checks its publication. Parent availability, remix permission and private-to-public derivation are checked. Parent references, creator/source attribution, licenses and remix permission provide minimum future-remix metadata; a web remix editor is deferred.

Records commit through atomic create-if-absent links. Failure before committing a record can leave private unreachable CAS data, which public routes cannot serve. Reads reject symlinks and invalid hashes. Byte inspection validates PCM16 WAV and self-contained GLB v2, refusing external resources/extensions.

ETag handling checks visibility, availability and stored integrity before 304. Caches must revalidate. Unavailability blocks future retrieval; it cannot erase public bytes already downloaded.

The server binds only to loopback, rejects unexpected Host headers/cross-origin writes, has no CORS relaxation or access logs, bounds bodies and applies MIME/CSP protection. CSP allows bundled Cesium WebAssembly through wasm-unsafe-eval while keeping JavaScript evaluation blocked. Storage work runs on blocking workers outside the async reactor.

## Browser player

Earth Web's existing Cesium stack is reused in experience-player/. This is a separate entry point inside the existing repository, not a native-renderer port or replacement Earth application.

Verified:

- Anonymous versioned-link opening without installation or native clients.
- Publication/EL package and approved asset integrity checks before use.
- Rendering all 139 original GLBs; orbit/zoom/reset/focus; geometry picking and accessible entity selection.
- Canonical identity, source feature ID, estimated quality and original source notes displayed.
- Title, creator, source/audio attribution, rights, parent/remix metadata and an authored-night display fallback.
- User-click audio activation for score, ambience and chimes. The mix is stereo; native Sonic spatial acoustics are explicitly unavailable.
- Copyable links restoring the same source selection in a fresh tab with fresh playback consent.
- Explanations for unsupported world sessions, live Terra queries, native rendering and spatial audio.
- Responsive desktop/390 px layout, keyboard focus styles, native selection and focus-contained share dialog.
- Owned cancellation, model/viewer destruction, audio stop/close, blob revocation and listener cleanup.

The player makes no authoritative MutSea command, live Terra or AI call. It never inherits service credentials, session state or playback grants.

## Executed tests and environment

Rust **1.99.1**, Node **22.18.0** for this standalone entry point, macOS **27.0.1**, Cesium **1.138.0**, actual in-app **Chromium 156.0.0.0**. The browser-reported user agent is preserved. Widths 1280 px and 390 px were checked, including 390×844; these are desktop responsive viewport tests, not physical-phone tests.

| Check | Result |
|---|---|
| cargo test -p fen --offline | **18 passed**, none ignored |
| cargo fmt --all -- --check | passed |
| cargo clippy -p fen -p el --all-targets --offline -- -D warnings | passed |
| cargo build --release -p fen --offline | passed |
| Node browser-contract tests | **10 passed** |
| Player formatting and JS syntax | passed |
| Build using existing installed Cesium | passed; no install/CDN |
| Real release-server HTTP walkthrough | **19 checks passed**, all 143 assets verified |
| Real browser walkthrough | **6 recorded stages passed** |
| Cross-correlated evidence checker | passed |

Rust tests cover canonical/schema validation, immutable/idempotent publish/restart, role separation, private retrieval/list/assets/link denial, parent/remix rights, invalid links/versions, MIME/hash/size/license failures, GLB restrictions, corruption, symlinks, failed-publication non-exposure, source-note unknowns, Host/origin/body boundaries, concurrency and availability-before-304. Node tests cover integrity, private/unavailable refusal, link context, schemas/fallbacks, unlicensed/oversized assets, byte/MIME checks, bounded streams and metrics.

No M0–M2, M3-A native, M1-C mobile or full Earth Web suite was repeated. Legacy source was unchanged and the new surface/integration were tested.

## Published reference and measurements

Immutable edition:

16f19110720a52c4a0a02567c2f070286b88e022de90a3ad66470287eb63ebea

Share path:

/x/montreal-after-dark/16f19110720a52c4a0a02567c2f070286b88e022de90a3ad66470287eb63ebea

Entry tested: CARTO-BAT-TOIT:66541, entity 0448039a-cd33-5938-a8d1-ff09b01a7b0c. A recipient restored that selection with **zero audio contexts**. A real canvas click then selected CARTO-BAT-TOIT:67097, entity 500e9e1d-9014-516c-819a-8a735700c2db.

Desktop verified all 143 assets and activated three Web Audio sources after a click. Both previews closed with zero models, blob URLs, audio contexts, audio sources and in-flight assets, and the viewer destroyed. Final-origin browser console errors: **zero**.

Warm local measurements from document navigation:

| Measurement | Desktop | 390 px recipient |
|---|---:|---:|
| Entity controls usable | 489 ms | 300 ms |
| First geometry ready | 638 ms | 402 ms |
| All 139 models ready | 1,283 ms | 1,052 ms |

Release HTTP review: **1.725 s**. These are single-run local measurements, not isolated benchmarks or traction. Module-relative timing drafts were superseded by the final navigation-based records.

Preview success, start, audio, share, open-from-share and optional return counters stay in the tab. No analytics endpoint, account cookie or visitor identifier exists. One visit bit is written only with the optional checkbox. Return measurement was not enabled during acceptance; no traction claim is made.

Raw evidence includes publication/catalog/HTTP/browser records, screenshots, source/binary/build fingerprints, preserved-repository inventory, credential scan and cleanup. All owned registry runs and browser tabs stopped cleanly. Data/evidence remain available for reproduction.

## Disk and source safety

Available disk was approximately **7.9 GiB** initially; final observation is recorded in cleanup evidence. Existing Cargo targets and Earth Web dependencies were reused. Player distribution is approximately 22 MiB. No source, accepted worktree, user asset, fixture, dependency cache or acceptance evidence was deleted. No broad cleanup occurred.

## Verification limits and next milestones

Forced WebGL failure was not injected; the accessible entity-list fallback is implemented. Optional return storage, other browser engines and physical devices were not tested. Audio activation/ownership was verified, not perceptual listening quality. Creator identity is asserted by the trusted local publisher, not federated public identity.

This is a **local/staging registry and browser path**, not a publicly reachable network. It supports the curated catalog and reviewed package contract. Native Creator publishing controls/direct authored-history import, arbitrary uploads, richer Studio/Song approval, recursive attribution workflows, full native materials/lighting, Sonic spatial acoustics, live world admission, cloud continuity and a web remix editor remain deferred.

Next: a narrow native Creator publishing adapter and licensed creative-asset exports, then permission-aware derivative editing. A public pilot needs separately authorized identity/TLS/deployment and abuse/rate operations. No marketplace, feed, monetization, autonomous public publishing or unrestricted AI distribution was started.

See reproduction.md for commands and clean shutdown.
