# Space-time contracts v1 · Earth Core v0.3

The independent headless core adds seven read-only tools. It retains the v1 plan envelope and existing spatial operations. `earth/core/time.js`, `temporal.js`, `provider.js` and `workspace.js` own the new contracts; rendering and browser storage remain adapters.

| Concept | Implemented representation |
| --- | --- |
| SpatialFeature | Stable GeoJSON `id`, original geometry and properties; coordinate reference in dataset provenance |
| SpatialLayer / SpatialDataset | Immutable registry ID/version, public or owner visibility, source/license/hash, bounded features |
| TemporalObservation | Stable ID, feature ID, field/value, explicit interval, event/observation/ingestion times, optional valid interval, source |
| TemporalInterval | Explicit UTC `[start,end)`, nonempty; invalid calendar rollover and implicit zones rejected |
| SpatialSnapshot | Deterministic source-backed feature/observation selection at an instant or cumulative window |
| SpatialEvent | Source feature/event identity and `event_at`; USGS catalog update is a separate property |
| SpatialWorkspace | Local version-1 document, camera, layer/version references, selection, time range, query, receipt, notes, saved views |
| QueryReceipt | Execution UUID, UTC execution time, canonical plan SHA-256, core version, read-only access; not a durable WorldLine or signed attestation |

Event time describes an occurrence. Observation time describes acquisition of a measurement and may be unknown. Ingestion time records acquisition into this archive. None is inferred from another. USGS origin instants are event time; sensor observation time is null. `catalog_updated_at` describes the preferred solution's update, not the earthquake's occurrence. Queries reproduce the acquired catalog, not historical knowledge availability.

Temporal metadata is an optional sidecar on a dataset, not forced into legacy feature geometry. Up to 16 fields and 50,000 observations per dataset. IDs must reference existing features/fields. Overlapping observations for one feature/field are rejected: publish a new immutable dataset version to represent a correction. No interpolation, extrapolation, imputed generation or automatic zero filling.

## Tools

All accept `dataset`, optional `field`, `limit` (1–100), fuel categories and optional point/source-place radius filtering. Radius is at most 500 km. Visibility and application capabilities apply before temporal filtering.

| Tool | Additional arguments | Result |
| --- | --- | --- |
| `features_at_time` | `at` | Features whose observation interval contains the instant |
| `features_during_interval` | `start`, `end` | Source intervals overlapping the half-open window |
| `nearest_at_time` | `at`, `point` or `place_id` | Ellipsoidal distance order for source points with observations at that instant |
| `intersects_during_interval` | `start`, `end`, GeoJSON `geometry` | Temporal overlap and the existing planar topology model; crossing query geometry must be split |
| `aggregate_over_time` | `start`, `end`, `aggregation` | Count/min/max/mean per source field and exact reporting interval; complete candidate set before feature display truncation |
| `compare_snapshots` / `spatial_changes` | `before`, `after`, optional `comparison_dataset`, `window_start` | Matching feature/field observations: newly observed, not observed, changed or unchanged; numeric delta only when both exist |

`window_start` makes snapshots cumulative `[window_start,before)` and `[window_start,after)`; equal start/before is an empty snapshot. Without it, each snapshot selects observations at that instant. Comparison requires matching field/unit contracts and stable feature IDs. Coordinate changes compare catalog reference geometry; they are not historical surveys. Missing observations do **not** prove physical creation/removal, operation or zero production. Maximum 2,000 returned observations and 1,000 aggregate intervals; explicit totals/truncation accompany bounded results. No sum of mixed earthquake magnitudes or capacity-to-generation conversion is offered.

The browser timeline queries the same API, with one pending request, coalesced scrubbing and bounded playback cadence. Playback pauses in a hidden tab. Mint marks newly displayed records; purple marks already displayed records. Timeline UTC labels show archive time, never live time. Browser before/after review uses `compare_snapshots`, not pixel differences or model-invented changes.

## Providers and persistence

LayerProvider v1 metadata is discoverable through `/v1/providers`: identity, version, category, CRS, spatial and temporal extents, licensing, attribution, capabilities, budget and errors. `earth/data/providers.js` is a reviewed bundled USGS adapter with source/output checksums, separate from WRI. No remote plugin execution, arbitrary URL fetching, credentials or live feeds. Raster, OGC and streaming implementations remain future adapters.

Optional PostGIS stores the temporal sidecar with the immutable dataset manifest in existing JSONB, under the same forced row-level policies. Bounded v0.3 temporal execution runs over the authorized immutable registry snapshot; it does not claim SQL temporal indexes or a new time-series database. The added provider is a new ID and can be seeded without replacing earlier data. No existing database is dropped.

Workspaces use browser storage, five documents / 1 MiB each. Create, save, open, duplicate, export, import and delete are implemented. Export is the portable backup; storage can be cleared by the browser. Version and camera validation run before applying a document. Unknown dataset versions fail closed. Imports never execute their saved plan. Basic exploration requires no sign-in. Collaboration/cloud sync, cross-version migrations, temporal streaming and bitemporal knowledge-as-of queries remain planned.
