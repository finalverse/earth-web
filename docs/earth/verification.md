# Verification record — 2026-10-19

This is an experimental developer milestone, not a production or public-service acceptance certificate.

## Baseline

Starting branch `main`, clean worktree, upstream commit `93ea088f4556a5a65b3292a2d15142d5a6c562bc`. Origin is `finalverse/finalverse-earth`; upstream is `bilawalsidhu/gods-eye-view`. Tests/build ran on macOS Apple Silicon (Apple M1), Node **24.22.0**, npm, with Chromium auto-download/install scripts disabled. The first local Node 22 install attempt was superseded by the supported Node 24 baseline; its partial results are not used as verification.

The pristine upstream production build passed (6.37 s; existing large-chunk warning). The upstream suite passed **7,748 tests**, with **one skipped**, including the Node 24 serialized allocation gates. The same suite passed again after adding Earth exports/dependencies. Original MIT/license notices remain intact. The npm audit at installation reported zero known vulnerabilities; this is not a security certification.

## Earth acceptance

| Gate                            | Status and evidence                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent install/build       | VERIFIED locally, locked dependencies, separate `dist-earth/`                                                                                                                                     |
| Globe and approved dataset      | VERIFIED in native Safari and embedded WebKit: 260 Natural Earth map units, no provider account                                                                                                   |
| Feature inspection/results      | VERIFIED Canada selection, geometry, feature inspector and provenance together                                                                                                                    |
| Model-free queries              | VERIFIED automated geometry/CRS tests and actual JS/Python HTTP calls                                                                                                                             |
| AI plan                         | VERIFIED actual local Ollama `llama3.2:3b`, “Show me Canada”; geometry equals direct query                                                                                                        |
| UI review path                  | VERIFIED proposal displayed before Run; reviewed query executes through the shared API                                                                                                            |
| Third-party app                 | VERIFIED browser Country Explorer through the same SDK, with no Cesium runtime import                                                                                                             |
| Optional MutSea                 | PARTIAL: five public fictional references; disabled by default; native handoff remains unverified                                                                                                 |
| Existing systems                | PRESERVED: no viewer/MutSea/Studio/gateway/website changes or production database operations                                                                                                      |
| Automated tests                 | VERIFIED **13 Earth tests**, zero failures; private visibility, holes/dateline, geodesic references, CRS, anchors/redaction, capabilities, HTTP bounds, static path escape and polar tessellation |
| Build/license audit             | VERIFIED separate output roots and six notice files; no inherited public asset tree copied                                                                                                        |
| Package boundaries / formatting | VERIFIED; Earth exports classified, headless core does not import renderer                                                                                                                        |
| Cross-platform CI               | CONFIGURED for macOS/Linux/Windows, not claimed executed                                                                                                                                          |
| Public deployment / GA          | PLANNED, not delivered by this milestone                                                                                                                                                          |

Two real visual defects were found and fixed: Cesium's nested embedded blob worker scripts needed a CSP script allowance, and polar reference vertices caused singular rhumb-line subdivision. The latter uses Cesium geodesic tessellation for visualization while preserving the original authoritative/query coordinates. A real polar geometry test covers that regression. Native Safari needed its window raised to resume WebGL rendering while testing; blank background-window captures are not evidence of acceptance.

## Performance

Reproduce with `npm run earth:bench`; [machine-readable result](benchmark-macos-arm64.json). Workload: 20 warmups then 200 full-layer point-containment queries over 260 generalized map units. Observed median **6.53 ms**, p95 **8.16 ms**, max **16.52 ms**, process RSS approximately **237 MiB**. This includes result cloning and provenance generation. It is a local core microbenchmark, not network throughput or concurrent-user capacity.

The embedded-browser first ready metric was observed at 5.46 seconds while the upstream suite was also running. This is diagnostic evidence, not an isolated startup benchmark or device target. No FPS, mobile support, browser matrix, load SLA or production scalability claim is made. Large ingestion, untrusted plugins, remote authentication and broader performance/load tests remain open.

## Repeat the checks

```sh
npm run earth:test
npm run earth:build
npm run earth:audit-build
npm run earth:bench
npm run check:boundaries
npm run format:check
npm test
```

Start `npm run earth:start`; search Canada, inspect its geometry and provenance, then use the independent SDK example. With local Ollama available, restart with `--ai`, ask “Show me Canada”, review and execute the proposed plan. With `--mutsea`, confirm the optional fictional catalog appears without any geographic pins. Do not convert an unverified destination reference into a claimed native teleport success.
