# Upstream and data audit

Upstream: `bilawalsidhu/gods-eye-view`, starting commit `93ea088f4556a5a65b3292a2d15142d5a6c562bc`; local `upstream` remote retained. Finalverse fork: `finalverse/finalverse-earth`. Inherited source remains attributed to Bilawal Sidhu and upstream contributors. The original LICENSE and existing third-party notice sections are preserved. New Earth code has separate Finalverse MIT attribution.

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
