# v0.4 measured workloads

These are qualified local observations, not service-level objectives, throughput claims or a comparison against a controlled old build. Raw reports are committed alongside this document.

## Repeatable engine/SDK/storage workload

Run after `npm run earth:sdk:build`:

```sh
node earth/platform/benchmark-v04b.mjs
```

Node 24.22.0, macOS ARM64. WRI hydro+solar within 100 km of Montréal, 10 km single-link edge, complete 18-record selection. Twenty warmups followed by 100 measurements per engine/storage workload; SDK construction uses 1,000 samples. Stored document includes the actual result snapshot and evidence (25,464 bytes in this run).

| Measurement                          | Observed median |       p95 |
| ------------------------------------ | --------------: | --------: |
| Grouped energy query                 |         1.20 ms |   1.38 ms |
| Ninety-event archival temporal query |         0.62 ms |   0.71 ms |
| Lazy SDK construction                |       0.0014 ms | 0.0015 ms |
| Workspace save, in-memory adapter    |         0.68 ms |   0.85 ms |
| Workspace open, in-memory adapter    |         0.46 ms |   0.61 ms |

One first module/source load was 117.5 ms; the first grouped query after it was 22.4 ms. OS filesystem cache was not controlled. Process RSS was 183.3 MiB and heap used 62.1 MiB after all workloads; this includes datasets, imported modules and benchmark allocations, not just the SDK. Storage results do not measure disk durability or actual browser localStorage. Data: `benchmark-v04b.json`. v0.4A's different workload is retained in `benchmark-v04a.json`, without an improvement claim.

## Actual browser observations

One final-build reload/import in the Codex in-app Chromium browser: startup 525.2 ms; runtime manifest/discovery handshake 96.1 ms; next requested render frame 25.3 ms. The original saved execution was 26.9 ms; it did not rerun on import. Browser-reported JS heap was 38.4 MiB used / 67.3 MiB total. `performance.memory` is a coarse Chromium facility and is not GPU memory or a portable measurement API. Cache state, active desktop workload and thermal conditions were not controlled.

These values are displayed under **Local session & performance** and recorded in `browser-v04b.json`. Browser execution engine observations varied while other checks ran, so the UI value is not an isolated warm-query benchmark. Render-to-next-frame is not an input-latency distribution or an FPS certification. Broader device and sustained-load tests remain release work.

## Actual local inference

The repeatable optional acceptance command is:

```sh
# Start the isolated Energy Explorer server with --ai first.
node earth/platform/verify-local-intelligence.mjs
```

The successful recorded run used local `llama3.2:3b`: hydro+solar planning 3.06 s, then “Only solar” 2.96 s; 18 then five actual records. Token counts, original receipts, engine times and round trips are in `local-ai-v04b.json`. These two observations follow earlier model warmup, not controlled cold-model measurements or a general accuracy/latency guarantee. The first intent errors discovered during integration are documented in acceptance; unsupported or ambiguous questions can still fail. No paid/cloud inference was used.

## Build footprint

The separate app bundles SDK/UI code and the existing Cesium runtime/assets. The browser application chunk is roughly 41 KiB before gzip, plus CSS, HTML, Cesium assets and notices; this is not the total download. Use `npm run earth:energy:package` to create the actual archive, and inspect its size/hash for release review. SDK has zero runtime dependencies and no React/Cesium/DOM coupling. Archive and SDK sizes/hashes are captured in the release-readiness record. No npm publication or public deployment has occurred.
