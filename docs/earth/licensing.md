# Upstream and data audit

Maintained foundation: `finalverse/gods-eye-view`, reviewed pin `93ea088f4556a5a65b3292a2d15142d5a6c562bc`; Earth uses the `globe-upstream` remote. Original external upstream: `bilawalsidhu/gods-eye-view`, retained as `original` only in the maintained foundation checkout. Product: `finalverse/finalverse-earth`. Inherited source remains attributed to Bilawal Sidhu and upstream contributors. The original LICENSE and existing third-party notice sections are preserved. New Earth code has separate Finalverse MIT attribution.

**The MIT software license does not license every bundled asset, dataset or service.** The inherited application contains, among other things:

| Material                                             | Recorded terms / disposition                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Natural Earth country/map-unit pack                  | Public domain; approved for this build, original pin/hash and curation recorded |
| TeleGeography submarine cables                       | CC BY-NC-SA 3.0; excluded from Earth runtime/build                              |
| Bhote Koshi imagery and derived event material       | CC BY-NC 4.0; excluded from Earth runtime/build                                 |
| OSM/OpenInfraMap-derived infrastructure              | ODbL obligations; excluded from Earth runtime/build                             |
| Bundled 3D models                                    | Individual asset notices; excluded pending per-asset review                     |
| Google, Cesium ion, Mapillary and other hosted feeds | Service/provider-specific terms and keys; not enabled by default                |

The source fork retains inherited material and its notices for provenance. `earth/vite.config.js` uses a separate entry and `publicDir:false`, so it does not blindly distribute the upstream public tree. Its explicit imports avoid the full feed/tool catalog. Cesium runtime assets are copied by the existing plugin. Before any packaged release, verify the built tree and JavaScript imports, license inventory, and absence of restricted assets.

Approved dataset: `src/data/local_data/natural_earth/countries.json`, **260** actual features. Original source commit `ca96624a56bd078437bca8184e78163e5039ad19`, country GeoJSON SHA-256 `239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255`. Map-unit URL/hash and simplification tolerances are retained in the pack and runtime provenance. This is a generalized reference, not an authoritative statement of borders, current sovereignty, safe navigation or precise survey data.

New geospatial dependencies: Proj4js 2.22.0 (MIT), geographiclib-geodesic 2.2.0 (MIT). Cesium and its dependencies retain their own notices. `package-lock.json` pins actual versions; the inherited package list is broader than the Earth runtime graph. A lockfile inventory is evidence, not a legal clearance or complete transitive asset review.

Primary references: [upstream](https://github.com/bilawalsidhu/gods-eye-view), [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/), [CesiumJS](https://cesium.com/platform/cesiumjs/), [PROJ geodetic/geocentric conversion](https://proj.org/en/stable/operations/conversions/cart.html). Product names and logos do not transfer with source licenses.

## v0.2 data and dependency additions

The approved data allowlist now also includes 1,159 WRI Canadian power-facility records (Global Power Plant Database v1.3.0, **CC BY 4.0**) and 1,251 Natural Earth place references (public domain). The source CSV/repository software license must not be confused with the database license. [Dataset notices](../../earth/data/NOTICE.md) record source commits/hashes, attribution, modifications, quality and reproduction steps. Those notices are copied into the Earth browser artifact; source results/exports retain their provenance.

New runtime dependencies are Turf 7.4.0 modules, RBush 4.0.1, polygon-clipping 0.15.7 and node-postgres 8.23.1, all MIT-licensed. The database driver is server-only. PostgreSQL/PostGIS is an optional external service and retains its own licenses, including PostGIS GPL obligations. No database image is bundled with the browser. The dependency inventory is updated from the resolved lockfile; it is not a legal opinion or a license to redistribute unrelated inherited assets.

## Independent Earth branding (v0.3)

Earth disables the default Cesium ion marketing credit using the public `CreditDisplay.cesiumCredit` API. This specific build has no ion imagery, terrain, geocoder or credentials: the pinned viewer disables those services and Earth loads approved local geometry. This is not a general permission to remove attribution from ion-enabled builds. The [ion attribution guide](https://cesium.com/learn/ion/content-usage-and-attribution-guide/) requires its logo for content created with ion. Any future ion adapter must restore it and its provider credits. Earth leaves the credit widget/provider credits functional, includes CesiumJS attribution in its credit dialog, and preserves Apache/MIT notices in the artifact. WRI's CC BY attribution remains visible on the scene and in results/exports; GitHub attribution alone is not the policy for data providers. Supplied Finalverse raster assets are recorded in `earth/web/brand/PROVENANCE.md`.
