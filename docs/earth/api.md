# Contracts and API

All coordinates use explicit axis order. GeoJSON uses **OGC:CRS84** `[longitude, latitude]` in degrees. API `EPSG:4979` uses an explicitly declared application order `[longitude, latitude, ellipsoidal_height_m]` (rather than authority-native latitude-first axis order). `EPSG:4978` is Earth-centred Earth-fixed `[X,Y,Z]` in metres. Heights are **WGS84 ellipsoidal**, not mean sea level. Unsupported CRS/datum/units are rejected.

Dataset records include ID, title, immutable source version, visibility, GeoJSON features and provenance. Only operator-loaded public/authorized datasets are visible. Anonymous clients cannot register data, URLs, local files or principals. The opt-in operator endpoint accepts bounded inline datasets without fetching their provenance URLs. Provenance carries original URL, commit, source hash, curated-content hash, license, attribution, units, static-reference temporal status, processing time and quality limitations. Source timestamps are not fabricated: `observed_at` is null for this static reference layer.

## Version 1 query plan

```json
{
  "schema_version": 1,
  "tool": "search_features",
  "arguments": {
    "dataset": "natural-earth-countries",
    "query": "Canada",
    "limit": 5
  }
}
```

Unknown fields and operators are rejected. Results contain the validated plan, summary, typed data, provenance and elapsed core time. Processing timestamps/time measurements vary; the geometry and numeric results are deterministic for the pinned dataset/library versions.

| Tool                    | Arguments                                      | Output                                                     |
| ----------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `list_layers`           | `{}`                                           | Authorized layer metadata                                  |
| `search_features`       | dataset, query (1–128 chars), limit (1–100)    | Name substring matches; default 20                         |
| `contains_point`        | dataset, point `[lon,lat,height?]`, limit      | Generalized planar polygon containment                     |
| `bbox_candidates`       | dataset, bbox `[west,south,east,north]`, limit | Envelope overlaps; west > east crosses dateline            |
| `measure_distance`      | from/to `[lon,lat,height?]`                    | WGS84 inverse ellipsoidal surface metres; altitude ignored |
| `transform_coordinates` | position `[x,y,z]`, from, to                   | WGS84 geodetic/ECEF coordinates                            |

Endpoints: `GET /v1/status`, `/v1/layers`, `/v1/tools`, `/v1/datasets/:id/features`, `/v1/worlds`; `POST /v1/query` with the plan above; optional `POST /v1/ai/plan` with `{"question":"Show me Canada"}`. The last returns a validated plan and `requires_review:true`; it executes no world mutation. AI is disabled by default.

## Application manifest

`earth/examples/country-explorer.manifest.json` declares schema version, application ID/version, allowed dataset IDs, tool names and maximum query results. `createApplication` enforces these constraints for embedded application cores. It loads no third-party JavaScript, binary or Python. The example browser page is ordinary caller code using the same API; its manifest is illustrative and does not turn an anonymous HTTP client into a privileged principal. The public local HTTP service exposes only public approved data. Multi-user authentication, remote deployment and untrusted plugin execution are outside this release.

## GeoAnchor

`geo.js` accepts only explicit versioned anchors with world/region IDs, creator, WGS84 ellipsoidal position, heading, scale, local origin, visibility and precision. A 256 m local region is converted through ECEF/ENU, never by pretending grid coordinates are longitude/latitude. Supported local bounds are x/y `[0,256)`, z `[0,4096]`; there is no terrain/geoid correction. Public approximate output omits height, creator and the exact frame, limits precision to at most two decimal degrees, and labels its 2D CRS. Hidden anchors publish nothing. No production anchor store or publication endpoint exists yet. Fictional MutSea worlds have **no anchor**.

## v0.2 additions

The six v0.1 operators remain supported. The query-plan envelope remains `schema_version:1`. Modern operators are:

| Tool                      | Required arguments                   | Meaning                                                             |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `distance`                | from, to                             | GeographicLib WGS84 ellipsoidal surface metres; ignores altitude    |
| `buffer`                  | point, radius_m                      | Derived 128-sample point buffer, radius 1–500,000 m; dateline split |
| `contains` / `intersects` | dataset, geometry                    | 2D lon/lat simple-feature topology, optional limit                  |
| `nearest`                 | dataset, exactly one point/place_id  | Sorted point features, optional radius_m/fuels/limit                |
| `within_distance`         | dataset, point or place_id, radius_m | Exact ellipsoidal point-distance filter, radius 1–500,000 m         |
| `bounding_box`            | dataset, bbox                        | Exact 2D intersection with bounds, including split crossing bounds  |
| `spatial_join`            | left, right, predicate               | ID relationships under `contains`/`intersects`, optional limit      |
| `coordinate_transform`    | position, from, to                   | WGS84/ECEF/LOCAL:ENU; explicit three-coordinate anchor for ENU      |
| `query_features`          | dataset                              | Optional name substring/fuels/limit                                 |
| `inspect_feature`         | dataset, feature_id                  | Authorized source feature                                           |
| `get_provenance`          | dataset                              | Authorized source/version/license/provenance                        |

Geometry inputs support Point/MultiPoint/LineString/MultiLineString/Polygon/MultiPolygon. Planar topology operands crossing the antimeridian must be split first; point distances and crossing bounding boxes work directly. Contains excludes boundary-only matches and polygon holes. Pole-enclosing display buffers are rejected; point-distance queries at the poles still work. A sampled display buffer approximates a boundary; it does not decide membership in an exact radius query.

Limits: 100 returned features/relationships (default 20), 16 datasets, 10,000 features per registered dataset, 250,000 vertices per geometry, 1.5 million vertices per dataset, 3 million possible join pairs and 100,000 inspected join candidates/matches. The embedded proximity path scans the bounded point catalog; RTree indexes serve topology, bounds and joins. Database behavior and source-geometry repair are detailed in the database guide. Do not assume exact agreement on invalid generalized source boundaries.

Results add `receipt` with `execution_id`, `executed_at`, canonical `plan_sha256`, `core_version` and `access:'read-only'`. Source features are unchanged; distances live in `data.measurements`, and aggregate/method metadata in `data.analysis`. `total` and `truncated` distinguish the full matching set from the returned limit. Capacity sums are reported source MW, not power generation. Processing time and receipt IDs vary; pinned-source geometry and numeric results remain reproducible within the stated library/backend tolerances.

### Registration and SDK methods

`POST /v1/datasets` accepts at most 2 MiB of inline GeoJSON plus metadata, **only with the explicitly enabled operator bearer token**. Set `EARTH_OPERATOR_TOKEN_FILE` to a private 0600 file containing 32–128 URL-safe characters; generate a random token rather than reusing a world password. Never put it in a URL, README, client bundle or Git remote. The server assigns the fixed operator principal, registration ID and time; client-supplied owners are rejected. Public source/license URLs, SHA-256, license and `OGC:CRS84` declaration are required. The API fetches no submitted URL. Private datasets remain invisible to anonymous callers. IDs cannot be replaced; use a new versioned ID for a new dataset. Persistence is enabled only with PostGIS.

| JavaScript / TypeScript           | Python                               |
| --------------------------------- | ------------------------------------ |
| `registerDataset(dataset)`        | `register_dataset(dataset)`          |
| `listLayers()`                    | `list_layers()`                      |
| `queryFeatures(dataset, filters)` | `query_features(dataset, **filters)` |
| `spatialQuery(tool, arguments)`   | `spatial_query(tool, arguments)`     |
| `inspectFeature(dataset, id)`     | `inspect_feature(dataset, id)`       |
| `getProvenance(dataset)`          | `get_provenance(dataset)`            |
| `executeSpatialPlan(plan)`        | `execute_spatial_plan(plan)`         |

Existing `layers`, `query`, and `propose` aliases remain. Supply an operator token explicitly through `new EarthClient(base,{token})` or Python's `EarthClient(base, token=...)`; do not bake one into a browser application. `createApplication` supports the added tool names and enforces dataset/tool/result capabilities for embedded callers. It still does not load or sandbox third-party code.
