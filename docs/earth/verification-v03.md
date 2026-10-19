# v0.3 preview acceptance · 2026-10-19

Starting point: `dc765e773a133d58c7ac1d6120ee111d4e848deb`, clean `main`. Maintained globe pin and immediate GitHub parent remain `finalverse/gods-eye-view`; no inherited renderer source was changed. Historical v0.2 CI runs were rechecked: all four Earth jobs and all inherited jobs, including Street Level, succeeded.

## Implemented and tested

- Finalverse raster symbol, header wordmark, measured-dimension favicon and 192/512 pixel app icons, loading mark, dark/light themes, documentation/dark/light SVG compositions and 1200 × 630 social artwork. No traced vector-master claim.
- Ion-free branding through Cesium's public credit API. Actual software/data credits remain accessible; WRI and USGS attribution remain visible in their respective experiences.
- Seven bounded temporal tools, strict UTC/interval validation, dataset/version comparisons, explicit missing-observation counts, provenance and execution receipts. Numeric observations only; no silent interpolation.
- An independent checked USGS provider: 90 real July 2019 Ridgecrest event records. The Canadian energy catalog remains unchanged; zero populated annual generation fields are reported as a coverage gap.
- Timeline scrub/play/pause/speed/reset, interval and before/after review, source-event inspection and portable evidence export.
- Browser-local workspace create/save/open/duplicate/import/export/delete; no account or cloud synchronization. Dataset versions and camera ranges validated. Saved query plans do not run automatically on import/open.
- Opaque local ellipsoid fixes far-side geometry showing through ocean space. Request-render mode avoids continuous redraw of an unchanged scene. Source-backed reference labels and a derived coordinate grid add local context without online imagery.
- Public-origin configuration, readiness/health endpoints, private aggregate metrics, safe JSON request logs, proxy configuration, dedicated service and reversible rollout script. Default public configuration has no AI or operator registration.
- The Finalverse product website has a live `/earth` route and navigation entry; existing routes remain intact.

## Evidence

| Check                     | Actual result                                                                                                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Earth + optional PostGIS  | **42 passed, 0 skipped** on Node 24.22.0; includes temporal sidecar SQL round trip, RLS, rollback, cross-backend parity and idle reconnect                                                                                                                                        |
| Inherited suite           | **7,748 passed, 1 skipped**, including serialized Node 24 allocation checks                                                                                                                                                                                                       |
| Production build/artifact | Independent build and allowlist/notice audit passed; inherited source/dependency pin verifies                                                                                                                                                                                     |
| Package/import boundaries | Passed, with new transport-neutral modules explicitly owned; core has no Node database/browser dependency                                                                                                                                                                         |
| Formatting                | Adopted formatting check passed (1,426 files); changed Earth sources also formatted                                                                                                                                                                                               |
| Native browser            | Mac in-app browser: real 90-event scene, interval changes, source inspection, play/pause, theme switching, workspace save/reload/open and restored cursor verified                                                                                                                |
| Local model               | Actual Ollama `llama3.2:3b` produced a temporal plan yielding all 90 events; first observed planning time ~16 s under development load. A follow-up grounded prompt test returned the exact exclusive UTC boundaries in ~11.35 s; review remains mandatory. Public AI remains off |
| Private Linux staging     | Dedicated checksum-verified Node 24.22.0 installed alongside the unchanged default host runtime. Loopback readiness, Montréal **24** matches and historical **90** events passed with AI disabled                                                                                 |
| Product website           | Nine-page production build passed; `/earth` and all seven existing product routes return HTTP 200 publicly                                                                                                                                                                        |

`benchmark-v03-temporal.json` records a reproducible 200-sample / 20-warmup local core workload. Latest median interval/comparison/aggregation times are approximately 0.84 / 1.06 / 0.86 ms, with p95 approximately 3.72 / 2.94 / 2.28 ms and process RSS ~82 MiB. No v0.2 temporal workload existed, so these are not an improvement claim or SLA. Local concurrent builds affected timing. One emulated PostGIS setup hit the normal 5-second seed budget during contention; the idle rerun passed. The migration-only DDL budget is 30 seconds, while normal runtime limits remain unchanged. Broader sustained-load/device testing is still required.

## Public-release gates

| Gate                           | Status                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 clean production build      | Passed; all four Earth CI jobs green at runtime commit `55610c2`                                                                                |
| G2 core tests                  | Passed locally, including PostGIS                                                                                                               |
| G3 browser smoke               | Mac passed; 390 × 844 layout has no horizontal overflow or timeline/status overlap; other browser/device coverage remains limited               |
| G4 security                    | Host/origin, capability, body/query budgets, private metrics, path confinement and data isolation tested; no independent penetration-test claim |
| G5 licensing                   | Dataset/software provenance recorded; ion services disabled; restricted inherited feeds excluded                                                |
| G6 brand                       | Integrated; assets documented                                                                                                                   |
| G7 documentation               | API/contracts, setup, public usage, deployment, provenance and limits documented                                                                |
| G8 rollback                    | Actual service v0.3 → v0.2 → v0.3 cycle passed; a deliberately failing candidate automatically restored the healthy service                     |
| G9 production health           | HTTPS readiness/status passed; dedicated service enabled at boot; trusted certificate and renewal dry-run passed                                |
| G10 public geographic workflow | Public Chrome globe rendered 24 Montréal facilities; 27 external HTTPS checks and JS/Python SDK workflows passed                                |

The deployment/public preview gates above are accepted at the stated scope. This is not GA or independent penetration-test certification. [Public HTTPS evidence](public-acceptance-v03.json) records 27 checks, including 24 Montréal facilities, 90 historical events, explicit missing-generation coverage, private endpoint/origin rejection, conditional cache revalidation, both public sites and the existing MutSea account portal. The final transport fix handles nginx compression's weak ETags and proper missing-static-page responses; GET/HEAD, tag lists/wildcards and path confinement are covered by the same HTTP regression test.

[Earth CI at the runtime commit](https://github.com/finalverse/finalverse-earth/actions/runs/39220667493) passed on macOS, Windows, Linux and with PostGIS. The local 42/42 PostGIS run includes the workspace preservation fix; final HTTP assertions pass in the 42-test CI run. The inherited suite result was recorded before these isolated Earth transport/workspace fixes; inherited source and renderer pins remain unchanged.

The public service is read-only, with AI/operator registration off. Secrets and detailed operational rollback records remain private. Browser workspaces are local, not server backups. Additional device/GPU testing and sustained multi-client load remain outside this preview's certification. Third-party extensions, collaboration, streaming, remote model services and immersive-world handoff remain v0.4+ work.
