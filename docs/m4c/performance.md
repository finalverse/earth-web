# M4-C measured performance

Date: 2026-10-29. Apple M1, 16 GiB RAM, macOS 27.0.1, IAB Chromium 156.0.0.0, Cesium 1.138.0. Local loopback FEN and approved assets, Node 22.18.0 for the standalone build/tests, Rust 1.99.1. No full Earth root app build was run; that app declares a newer Node engine. Mobile means a resized desktop browser viewport, not a physical mobile GPU.

## Method and budget

Player controls record first meaningful interaction availability from navigation. First geometry and all-geometry marks are separate. Scene initialization runs from controls-ready to all models-ready. CPU submission samples cover Cesium preRender→postRender wall time, including startup/presentation switches and CPU stalls; they do not measure GPU completion. A bounded rAF interval ring is independently reported. Snapshots are short local observations, not steady-state, cold-network or thermal-soak benchmarks.

Balanced/low target 30 FPS (33.3 ms budget); high targets 60 (16.7 ms). Low uses 0.65 resolution scale/50 particles/8 street lights; balanced 0.9/100/14; high 1.0/180/20 with bloom. Two primitives per authored street lamp plus one approved object marker produce the recorded decoration counts. Hardware pixel ratio and actual drawing buffer are reported independently.

GPU elapsed timing is unavailable (`gpu_timings_ms: null`). Cesium geometry/texture byte counters are estimates, excluding framebuffers, shader/driver memory and total VRAM. Texture estimate zero is valid for these untextured GLBs; it does not mean the entire renderer consumes zero texture memory. Optional Chromium JS heap is a process/browser estimate affected by collection and other documents.

## Captured samples

| Snapshot | Viewport | Controls / first geometry / all geometry ms | Scene init ms | CPU p50 / p95 ms (n) | rAF p50 / p95 ms (n) | JS heap bytes |
| --- | --- | --- | --- | --- | --- | --- |
| Original desktop | 1440×1000 | 326 / 514 / 1417 | 1091 | 4.60 / 29.30 (33) | 16.70 / 17.50 (180) | 63,313,615 |
| Refined fixture, high | 1440×1000 | 326 / 514 / 1417 | 1091 | 4.60 / 29.30 (42) | 16.70 / 17.60 (180) | 49,580,873 |
| Model preview, balanced | 1440×1000 | 286 / 443 / 1012 | 726 | 6.30 / 27.30 (26) | 16.70 / 17.60 (153) | 47,583,158 |
| Fresh fixture recipient, balanced | 390×844 | 176 / 277 / 943 | 767 | 4.30 / 18.90 (26) | 16.70 / 17.50 (180) | 65,895,875 |
| Fresh model recipient, balanced | 1280×900 | 184 / 283 / 1024 | 840 | 4.40 / 18.30 (28) | 16.70 / 17.60 (180) | 55,550,328 |

The high-quality fixture's CPU p95 **29.3 ms exceeds the 16.7 ms desktop target budget**. Its rAF mean was 19.625 ms (~51 callbacks/s); callbacks are not Cesium render completions. Balanced rendering is capped at a 30 FPS target even when rAF runs near 60. No stable 60 FPS or GPU frame-time claim is supported. Balanced p95 observations fall below 33.3 ms here, but do not prove all supported devices meet that budget.

All 139 models and 139 custom shaders were ready. Estimated geometry memory was 5,251,208 bytes, GLB texture estimate 0. Fixture high drawing buffer was 1323×778 with 41 decorations; mobile balanced 314×484 with 29; mobile low 226×349 with 17. Lower quality preserved source identity, selection and consented three-source audio.

Verified experience payload: 140 scene/geometry assets, 5,507,936 bytes before audio; 143 assets, 6,660,068 bytes after audio. This excludes HTML/JS/Cesium static transfer, HTTP overhead and caches. The standalone bundle has 401 files; all file hashes are in `evidence/artifacts.json`. No CDN dependency is needed by the standalone bundle.

## Creation latency

Fixture browser generation 43.0 ms, follow-up 19.9 ms, final preview activation 19.9 ms, save 26.7 ms, publish 139.3 ms. Whole scripted workflow 67.637 s includes deliberate user-interface steps and pauses.

Final actual Ollama model request: 12.460 s server receipt, 12.519 s browser generation; 956 input / 164 output tokens reported by the provider. Preview activation 60.7 ms, save 30.6 ms, publish 137.9 ms. Whole scripted workflow 73.202 s. Inference uses an existing local installed model; model load/cache state and UI pauses were not controlled. These observations do not establish a first-time-visitor under-three-minute benchmark.

Offline HTTP-only workflow took 222.24 ms, excluding browser rendering, real inference and human review. It is not comparable to the GUI workflow or an inference latency measurement.

## Cleanup and storage

Every recorded cleanup stage has zero owned models, custom shaders, decorations, guide timers, render observers, animation frames, object URLs, audio contexts/sources, in-flight assets and viewer ownership. Server draft/planning counts are zero; live model cancellation was exercised. See `evidence/browser-review.json` and `evidence/cleanup.json`. Process/driver allocations after teardown were not profiled.

Reused the existing shared Rust target and pinned installed Cesium dependencies. Free disk fell during builds/model use and was 6.47 GiB at cleanup. No build directories, shared caches, source trees or model weights were removed. No model weights or dependencies were downloaded for this milestone.
