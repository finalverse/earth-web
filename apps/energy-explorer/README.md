# Finalverse Energy Explorer

An independent spatial intelligence application built against the packaged **`@finalverse/earth`** SDK. It queries public source snapshots, draws an ion-free Cesium globe, compares energy sources, groups facilities by ellipsoidal distance and saves portable local workspaces. Local AI proposes reviewed queries; deterministic discovery and analysis work with AI disabled.

This is **v0.4 development software**, not the public v0.3 deployment. Its trusted same-origin runtime is not a sandbox or an authenticated multi-tenant service.

## Build from a clean checkout

Use Node 24.14+ (24.x; verified with 24.22.0) and npm. No MutSea, Viewer, cloud key or database is required for the embedded source snapshot.

```sh
# At the finalverse-earth repository root:
npm ci --ignore-scripts
npm run earth:sdk:build
npm ci --prefix apps/energy-explorer --ignore-scripts
npm test --prefix apps/energy-explorer
npm run build --prefix apps/energy-explorer
node earth/platform/serve.mjs \
  --manifest apps/energy-explorer/earth-app.json \
  --grant earth/platform/dev-grants/energy-explorer.json \
  --web-root apps/energy-explorer/dist --port 18644
```

Open <http://127.0.0.1:18644/>. Search **Montréal**, choose a radius and fuel filter, then **Analyze this area**. The demo grant is an operator-owned file; the browser manifest cannot authorize itself. The server binds loopback only.

For optional local inference, install Ollama from its official source, pull `llama3.2:3b`, and add `--ai` to the server command. The router discovers the configured model at loopback, refuses remote/cloud fallback, has a planning deadline and limits concurrency. No paid key is required. If unavailable, use the deterministic controls.

## One useful workflow

1. Find Montréal and analyze all renewables within 100 km, using a 10 km grouping edge.
2. Inspect fuel counts and reported capacity. Click a facility button in the conversation artifact to highlight it on the globe, or select a globe point to update the record inspector and future planning context.
3. **Ask about this selection** adds exact source facts to conversation. Ask “Compare hydro and solar facilities within 100 km of Montréal and identify clusters.” Inspect the proposed dataset, place ID, units and filter before **Approve & run**. Nothing executes merely because a model proposes it.
4. A follow-up such as “Only solar” receives the approved previous query as context. Models may fail; use controls when the interpretation is incomplete. There is no fabricated fallback plan.
5. Save locally, export JSON, import the file and reopen it. Filters, camera, layers, selection, result snapshot, provenance and receipt survive. Opening never executes a query; **Analyze** explicitly refreshes evidence.
6. To import an old v0.3 Energy workspace, enable **Import v0.3 Energy as a new copy**. The original store/file remains untouched. Legacy workspaces without result snapshots reopen their query references; re-run to produce new evidence.

## Methods and limitations

- Coordinates: WGS84 longitude, latitude in degrees; distances: ellipsoidal surface metres, altitude ignored. GeographicLib performs analysis server-side. Cesium is the display adapter, not the measurement authority.
- Groups: deterministic single-link connected components, using pairwise distances at or below the chosen edge threshold. A chain of connected facilities can span more than that threshold. Singletons are shown. These are geographic groups, not density statistics, grid connections or economic conclusions.
- Clustering requires a complete selection of at most 100 records; otherwise narrow the radius/filter. Maximum radius is 500 km; grouping edge is 50 km. Server grants may be narrower.
- Comparison: counts and sums of source **reported capacity** by fuel, with missing capacity counts. MW capacity is not electricity generation. Facilities are not weighted by population, demand or verified present operations.
- WRI GPPD v1.3.0 is archival (2021 release); per-record reporting years vary. Annual generation coverage is absent for this Canadian extract. No unsupported time filter or live feed is offered. Natural Earth locations and boundaries are generalized reference data.
- Radius display uses 128 sampled geodesic perimeter points, joined by display edges. White result bounds are display envelopes. Neither changes authoritative distance membership.
- Five local documents per application. Snapshots/receipts in imported files are untrusted editable content, not signed attestations. Review files before sharing. No user account, cloud workspace sync or persistent agent memory is provided.
- No imagery/terrain/ion service is used. Required Cesium, Natural Earth and WRI notices remain visible and bundled under `public/notices`.

## Package independently

```sh
npm run package --prefix apps/energy-explorer
```

Output: `apps/energy-explorer/artifacts/finalverse-energy-explorer-0.4.0-dev.1.tgz` containing `package/dist/` browser files, manifest, package descriptor, README and license. Extract the archive and serve `package/dist/` alongside the reviewed same-origin API; it is a static application distribution, not an npm registry publication. The application has its own lockfile, tests and entry; source imports only the SDK, Cesium and its own modules. It never imports private Earth implementation modules. The reproducible SDK tarball is an explicit dependency in this checkout; it is not claimed to be published on npm.

A different host must provide the versioned Earth API on the **same origin**, register the reviewed application and a separate operator grant, serve the static distribution with CSP and HTTPS, and retain notices. Static files alone do not implement the API. Do not point this development application at the unchanged public v0.3 service: it does not install the v0.4 app scope. Public release requires the release checklist and approval.

For another industry, retain the SDK/session/workspace wiring, replace the manifest datasets/tools and the domain-specific filters/map adapter. Do not copy grants as if they were user authorization.

When maintaining this development checkout after changing the SDK, rebuild its tarball, then run `npm install @finalverse/earth@file:../../artifacts/finalverse-earth-0.4.0-dev.1.tgz --ignore-scripts` **inside `apps/energy-explorer`** to update the lockfile integrity. Positional file arguments resolve differently when invoked from the repository root with `--prefix`. Consumers use the committed lockfile and the clean `npm ci --prefix apps/energy-explorer` command above. Published versions will require a new package version for changed artifacts.
