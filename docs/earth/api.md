# Contracts and API

All coordinates use explicit axis order. GeoJSON uses **OGC:CRS84** `[longitude, latitude]` in degrees. API `EPSG:4979` uses an explicitly declared application order `[longitude, latitude, ellipsoidal_height_m]` (rather than authority-native latitude-first axis order). `EPSG:4978` is Earth-centred Earth-fixed `[X,Y,Z]` in metres. Heights are **WGS84 ellipsoidal**, not mean sea level. Unsupported CRS/datum/units are rejected.

Dataset records include ID, title, immutable source version, visibility, GeoJSON features and provenance. Only operator-loaded public/authorized datasets are visible. Clients cannot register URLs, local files or principals. Provenance carries original URL, commit, source hash, curated-content hash, license, attribution, units, static-reference temporal status, processing time and quality limitations. Source timestamps are not fabricated: `observed_at` is null for this static reference layer.

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
