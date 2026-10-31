# M5 performance — measured local observations

2026-10-29 · Apple M1, 16 GiB RAM, macOS 27.0.1, IAB Chromium 156.0.0.0, Cesium 1.138.0. Rust 1.99.1 and Node 22.18.0. Mobile means a resized desktop browser viewport with low presentation quality, not a physical mobile GPU. The larger Earth root application declares a newer Node engine; only the standalone player was built/tested here.

## Consumer latency against targets

| Operation | Engineering target | Measured observation |
| --- | --- | --- |
| Initial complete geometry | ≤5 s | Desktop 1081 ms; mobile 855 ms (one run each; partial scene/controls appeared earlier) |
| Template activation/switch | ≤2 s | n=12; p50 32.1 ms, p95 43.3 ms, max 88.0 ms |
| Quick personalization | ≤1 s | n=8; p50 42.9 ms, p95 46.3 ms, max 46.7 ms |
| Open personalization controls | ≤500 ms | 6.4 ms (single observation) |
| Guest share creation | ≤3 s | n=4; p50 20.3 ms, p95 31.4 ms, max 37.9 ms |
| Full creator → recipient → derivative journey | <180 s | Desktop 12.545 s; mobile 12.016 s |
| Optional actual model | Variable | 23.031 s; 1991/298 reported input/output tokens |

Percentiles use sorted index `floor((n-1)*q)`; these are small samples. Template/quick timings include validated local requests and application of the preview through a frame callback. They are not GPU completion timings, and camera transitions remain interactive. Share timing excludes user thinking/consent time; full journey includes actual UI actions, tab setup and evidence capture. The no-model journey does not depend on Ollama. Cached compiled plans, an already running service and local approved assets were used; no cold Internet or first-time-human benchmark is established.

## Renderer observations

The renderer targets 30 FPS for balanced/low and 60 FPS for high. A 33.3/16.7 ms budget is a target, not a guarantee. CPU wall time from Cesium preRender→postRender measures submission work/stalls, not GPU completion. rAF callback intervals are separately recorded and do not equal renderer draw rate. Quantiles are omitted for snapshots with fewer than ten callback samples.

| Snapshot | Quality / drawing buffer | CPU p50 / p95 ms (n) | rAF p50 / p95 ms (n) | JS heap bytes |
| --- | --- | --- | --- | --- |
| Desktop initial | balanced / 725×457 | 5.80 / 24.50 (19) | — / — (0) | 60,740,580 |
| Desktop personalized | balanced / 725×457 | 5.40 / 23.70 (26) | 16.70 / 16.90 (94) | 53,224,084 |
| Mobile initial | low / 226×349 | 6.30 / 22.20 (16) | — / — (1; insufficient) | 53,495,929 |
| Mobile personalized | low / 226×349 | 6.10 / 16.40 (24) | 16.70 / 17.40 (88) | 46,151,327 |

GPU elapsed time was unavailable and is explicitly null in the receipts. No stable 60 FPS claim is supported. Geometry bytes from Cesium were 5,251,208, texture estimate 0 for these untextured GLBs. Those estimates exclude framebuffers, shaders and total VRAM. JS heap is an optional Chromium estimate affected by collection and other documents.

Template switching reused all 139 model objects/shaders/URLs with no geometry reconstruction. Golden Hour and Quiet Montréal used one approved object marker and omitted street-light pairs; other balanced templates used 29 decorations. Low mode reduces resolution, snow and decoration budgets. Scene labels continue to disclose estimated source forms and authored detail.

Verified experience transfer is 140 scene/geometry assets / 5,507,936 bytes before sound, and 143 assets / 6,660,068 bytes after consent. This excludes the static player/Cesium bundle, HTTP overhead and caches. The standalone bundle has 403 files with individual hashes in `evidence/artifacts.json`.

All measured Close stages returned application ownership counters to zero. Server diagnostics after testing have no active guest sessions, drafts or model jobs; immutable temporary read editions/cache entries remain bounded until expiry because the local user preview is intentionally running. No driver-level post-teardown allocation measurement was performed. Existing shared Rust/Node artifacts were reused; no dependency/model download or cache/model/source deletion was performed. Disk snapshots are in `evidence/cleanup.json`.
