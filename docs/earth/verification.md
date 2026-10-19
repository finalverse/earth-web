# Verification record — 2026-10-19

Local experimental v0.2 acceptance; not a public-service or device certification.

## Baseline and lineage

Work began on clean `main` at `e89c2ae306312b765b07c7653943eeba85bd3260` (v0.1 independent core). The previous baseline recorded 13 passing Earth tests and 7,748 passing upstream tests, with one skipped. The maintained globe and original upstream both resolved to `93ea088f4556a5a65b3292a2d15142d5a6c562bc` at the source audit.

The owner requested recreation and manually deleted the GitHub Earth repository after backup. The recreated repository's immediate parent is `finalverse/gods-eye-view`; its ultimate source remains `bilawalsidhu/gods-eye-view`. All 13 branches/four tags were restored with identical ref hashes. The pin/lineage record was committed and pushed as `74876cc`. See [fork verification](github-fork-parent.md) and [source update workflow](upstream.md).

## Executed v0.2 checks

Machine: macOS, Apple M1, 16 GiB RAM, Node **24.22.0**. Local database: PostgreSQL 17/PostGIS 3.5 official pinned Linux amd64 image under Docker emulation, dedicated Earth development database. No MutSea/other product database or viewer/service source was modified.

| Gate                                       | Evidence                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinate/spatial/security/API contracts  | **23 tests passed**, zero skipped/failures, including actual PostGIS integration                                                                                                                                                                                                                        |
| PostGIS                                    | Migrations replayed; source coordinates preserved; private RLS isolation across pooled principals; runtime-role rejection; intentional failed insert rolls back; indexed latitude prefilter verified by EXPLAIN                                                                                         |
| Real-data parity                           | Both backends return identical 24 facility IDs for Montréal / 100 km / renewable categories; distances agree within 0.00001 m in the test                                                                                                                                                               |
| Local AI                                   | Actual Ollama `llama3.2:3b`: hyphenated Montréal question → `within_distance` / 24 facilities; Canada → `search_features` / correct source feature                                                                                                                                                      |
| Browser                                    | In-app browser, desktop 1280×900 and default narrow layout: actual globe, 24 highlights, source inspection/distance line, AI proposal → reviewed Run, all three layer toggles                                                                                                                           |
| Evidence export                            | Browser download parsed: 24 original source features, CC BY attribution/provenance, v0.2 receipt and derived-buffer record                                                                                                                                                                              |
| JS/Python/TypeScript                       | Actual energy lookup clients; legacy Python Canada lookup; TypeScript declarations compile under TypeScript 5.9.3 with strict checking                                                                                                                                                                  |
| Build/artifact                             | Separate Earth build passed; 408 files / 12,984,419 bytes at the recorded audit; seven notice files; independent SDK example imports no Cesium runtime                                                                                                                                                  |
| Package boundaries                         | Passed; embedded core imports no renderer/browser/database runtime                                                                                                                                                                                                                                      |
| Legacy documentation                       | 18 targeted checks passed after retargeting two README-specific checks to the short inherited-app compatibility guide; their assertions remain intact                                                                                                                                                   |
| Clean candidate / full upstream regression | VERIFIED: fresh GitHub clone fast-forwarded to local candidate `b15d6c5` before publication; locked `npm ci`, all 23 Earth/PostGIS tests, both builds, artifact audit, boundaries and formatting passed; full upstream suite passed **7,748 tests**, one skipped, including serialized allocation gates |
| CI                                         | Existing macOS/Linux/Windows Earth matrix preserved; a separate Linux PostGIS job added. Hosted completion is not claimed by local checks                                                                                                                                                               |
| Public hosting / release                   | Not performed; local listener remains loopback only                                                                                                                                                                                                                                                     |

The README now describes Finalverse Earth rather than appending the inherited marketing introduction. Upstream authorship, source history, MIT notices and the separate reference application's documentation contracts remain preserved.

One real-model phrasing initially failed the expected result-count check during development. Prompt examples and hyphen normalization were added, then the hyphenated question and country regression passed. This is a bounded demonstration, not a claim of general natural-language accuracy. Human plan review and deterministic source-grounded execution remain necessary. Explanations are deterministic summaries of returned records.

## Performance baseline

Reproduce with `npm run earth:bench`, or `EARTH_DATABASE_URL_FILE=... npm run earth:bench -- --postgis`. The final recorded core samples ran after the upstream test job, not concurrently with it. Each workload uses 20 warmups then 200 samples. Timings include validation, source/result copies and receipt generation; they exclude HTTP and Node module-import startup.

| Metric                          | Embedded          | PostGIS (local amd64 emulation)             |
| ------------------------------- | ----------------- | ------------------------------------------- |
| Dataset load + registry         | 77.5 ms           | 519.9 ms                                    |
| Country containment p50 / p95   | 7.603 / 17.341 ms | 6.792 / 7.840 ms (legacy embedded operator) |
| Montréal radius query p50 / p95 | 1.615 / 2.109 ms  | 4.413 / 9.453 ms                            |
| Facility bounding-box p50 / p95 | 0.054 / 0.111 ms  | 3.107 / 3.965 ms                            |
| Process RSS at sample end       | 208.9 MiB         | 230.0 MiB                                   |

[Embedded samples](benchmark-v02-embedded.json) · [PostGIS samples](benchmark-v02-postgis.json) · [Browser sample](benchmark-v02-browser.json)

One warm local browser reload reported ready in **816.5 ms**. A three-second Canada camera flight rendered **180 frames, about 60.0 FPS**, with a 718×828 canvas, device pixel ratio 1, three layers and 1,159 facilities. This measures a moving request-render scene, not idle FPS, a stress test or a browser/device matrix. Screenshot: [Energy Explorer](media/energy-explorer.jpg).

Actual local AI planning round trips were **7.18 s** for the Montréal question and **1.83 s** for Canada; these are individual observations, not latency percentiles or service targets. The UI's deterministic tool result excludes model planning time. Browser/GPU memory and a cold boot are not measured. Other desktop applications were running. No performance improvement over v0.1 or production capacity is claimed.

## Remaining gates

Larger datasets, concurrent-user/load testing, other physical devices/browsers, hosted authentication/operations, provider/data freshness, SDK distribution and public-release acceptance remain open. RLS may block GiST acceleration; the bounded point-query prefilter is tested, not a general large-GIS scaling guarantee. The inherited country source has 41 invalid generalized outlines; database query geometry is explicitly derived and source data is preserved. See [database limits](database.md), [security](security.md) and [v0.3 proposal](roadmap.md).

Clean candidate reference build completed in 7.08 s with the inherited large-chunk warning. The independent Earth artifact remained 408 files / 12,984,419 bytes with seven notice files. The candidate checkout had no tracked/untracked changes after verification. The npm audit reported zero known vulnerabilities at this check; that is not a security certification.
