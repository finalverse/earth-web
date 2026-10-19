# v0.3 preview acceptance · 2026-10-19

Starting point: `dc765e773a133d58c7ac1d6120ee111d4e848deb`, clean `main`. Maintained globe pin and immediate GitHub parent remain `finalverse/gods-eye-view`; no inherited renderer source was changed. Historical v0.2 CI runs were rechecked: all four Earth jobs and all inherited jobs, including Street Level, succeeded.

## Implemented and tested

- Finalverse raster symbol, header wordmark, measured-dimension favicon/PWA manifest, loading mark, dark/light themes, documentation/dark/light SVG compositions and 1200 × 630 social artwork. No traced vector-master claim.
- Ion-free branding through Cesium's public credit API. Actual software/data credits remain accessible; WRI and USGS attribution remain visible in their respective experiences.
- Seven bounded temporal tools, strict UTC/interval validation, dataset/version comparisons, explicit missing-observation counts, provenance and execution receipts. Numeric observations only; no silent interpolation.
- An independent checked USGS provider: 90 real July 2019 Ridgecrest event records. The Canadian energy catalog remains unchanged; zero populated annual generation fields are reported as a coverage gap.
- Timeline scrub/play/pause/speed/reset, interval and before/after review, source-event inspection and portable evidence export.
- Browser-local workspace create/save/open/duplicate/import/export/delete; no account or cloud synchronization. Dataset versions and camera ranges validated. Saved query plans do not run automatically on import/open.
- Opaque local ellipsoid fixes far-side geometry showing through ocean space. Request-render mode avoids continuous redraw of an unchanged scene. Source-backed reference labels and a derived coordinate grid add local context without online imagery.
- Public-origin configuration, readiness/health endpoints, private aggregate metrics, safe JSON request logs, proxy configuration, dedicated service and reversible rollout script. Default public configuration has no AI or operator registration.
- The Finalverse product website has a new staged `/earth` route and navigation entry; existing routes remain intact.

## Evidence

| Check | Actual result |
| --- | --- |
| Earth + optional PostGIS | **40 passed, 0 skipped** on Node 24.22.0; includes temporal sidecar SQL round trip, RLS, rollback, cross-backend parity and idle reconnect |
| Inherited suite | **7,748 passed, 1 skipped**, including serialized Node 24 allocation checks |
| Production build/artifact | Independent build and allowlist/notice audit passed; inherited source/dependency pin verifies |
| Package/import boundaries | Passed, with new transport-neutral modules explicitly owned; core has no Node database/browser dependency |
| Formatting | Adopted formatting check passed (1,426 files); changed Earth sources also formatted |
| Native browser | Mac in-app browser: real 90-event scene, interval changes, source inspection, play/pause, theme switching, workspace save/reload/open and restored cursor verified |
| Local model | Actual Ollama `llama3.2:3b` produced a temporal plan yielding all 90 events; first observed planning time ~16 s under development load. Boundary dates require explicit UTC review. Public AI remains off |
| Private Linux staging | Dedicated checksum-verified Node 24.22.0 installed under the Earth user's local runtime directory; existing host Node unchanged. Loopback readiness, Montréal **24** matches and historical **90** events passed with AI disabled |
| Product website | Nine-page production build passed; `/earth` is staged, not proof of public availability |

`benchmark-v03-temporal.json` records a reproducible 200-sample / 20-warmup local core workload. Latest median interval/comparison/aggregation times are approximately 0.84 / 1.06 / 0.86 ms, with p95 approximately 3.72 / 2.94 / 2.28 ms and process RSS ~82 MiB. No v0.2 temporal workload existed, so these are not an improvement claim or SLA. Local concurrent builds affected timing. One emulated PostGIS setup hit the normal 5-second seed budget during contention; the idle rerun passed. The migration-only DDL budget is 30 seconds, while normal runtime limits remain unchanged. Broader sustained-load/device testing is still required.

## Public-release gates

| Gate | Status |
| --- | --- |
| G1 clean production build | Local candidate passed; final commit/CI pending |
| G2 core tests | Passed locally, including PostGIS |
| G3 browser smoke | Mac passed; responsive/cross-browser acceptance still being completed |
| G4 security | Host/origin, capability, body/query budgets, private metrics, path confinement and data isolation tested; no independent penetration-test claim |
| G5 licensing | Dataset/software provenance recorded; ion services disabled; restricted inherited feeds excluded |
| G6 brand | Integrated; assets documented |
| G7 documentation | Core/API/deployment/getting-started documentation updated; final rollout evidence pending |
| G8 rollback | Script prepared and syntax-checked; real service rollback pending |
| G9 production health | Not deployed publicly |
| G10 public geographic workflow | Not verified publicly |

No v0.3 GitHub Release or GA claim is authorized by this record while mandatory public-preview gates remain pending. DNS access was confirmed read-only, but no Earth record or existing website configuration was changed during the preflight. Private staging is not public deployment. A Node 24 runtime was installed alongside the host's default Node 22, not over it. Third-party extensions, collaboration, remote model services and immersive-world handoff remain v0.4+ work.
