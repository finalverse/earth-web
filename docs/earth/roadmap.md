# Delivery plan

## v0.2 — Spatial Intelligence Foundation

Implemented as an experimental local platform: maintained globe pin, explicit WGS84/ECEF/ENU APIs, deterministic spatial operators, versioned datasets/provenance, real WRI Canada Energy Explorer, source-grounded local AI intent, backward-compatible SDK methods and optional isolated PostGIS persistence with row security. The [verification report](verification.md) separates executed checks from open production gates. There is no general-purpose cloud GIS, live energy feed or public identity service in this milestone.

## v0.3 proposal — Unified Space-Time Intelligence

Start with one bounded, reproducible question: **what changed between two source snapshots, and what evidence supports the answer?**

1. Add `valid_time`, `observed_at`, `ingested_at` and source snapshot IDs without fabricating timestamps for archival layers. Keep original observations immutable; retain corrections as a new version.
2. Select one openly licensed historical dataset with real observation timestamps and redistribution rights. Build a temporal fixture with independently verified reference answers before adding a provider.
3. Add typed `query_at_time` and `compare_snapshots` tools. Results must distinguish source change, missing coverage and actual observed change; preserve input hashes and method/tolerance metadata.
4. Introduce versioned spatial workspaces that reference datasets, reviewed plans, visibility and exported receipts. Keep workspace state separate from geographic source records.
5. Add a timeline and before/after review using the existing globe. The model proposes a temporal query; deterministic execution supplies the comparison and citations. Preserve a headless path and application capability budgets.
6. Evaluate a bounded streaming adapter and simulation contract only after historical comparisons pass. Simulated output must remain explicitly separate from observed data.

Acceptance: repeatable temporal answers, clock/time-zone/interval tests, private workspace isolation, restart/replay, bounded ingestion and query/load benchmarks, visible before/after browser verification, and continued standalone operation. No streaming/live claims until an actual maintained feed and freshness policy exist.

## v0.4 — Application platform

Distributable SDK packages, independent applications, permissioned manifests, isolated plugin execution, data adapters (including evaluated GeoParquet/OGC paths), provider governance and supported deployment profiles. Public multi-user operation needs identity, authorization, rate/resource isolation, backups, moderation/abuse policy and a real operating model; the loopback operator token is not a substitute.

## Product gates and ecosystem boundaries

Before a supported public release: expand browser/device/load coverage, validate large-data query plans under RLS, automate signed data/package provenance, establish update/recovery policy, resolve provider/asset terms for any additional content, and document security/support ownership. The local 1,159-facility sample and one camera-flight measurement do not certify those gates.

Existing Finalverse work remains separate: native Confluence conversation, world-layout planning and WorldLine before/after review; packaged viewer onboarding/fresh-install acceptance; art, lighting, collision/LOD and broader performance hardening. Earth may supply explicit geographic anchors and analysis through optional adapters; it does not replace working MutSea login, world transactions, inventory, appearance or rendering. Fictional destinations remain unanchored until deliberately published under a privacy policy.
