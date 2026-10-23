# Earth Core integration and R0 inventory

Earth Web continues its existing Cesium globe, country search, energy/time workflows, saved workspaces and local read-only AI. The new place panel in the embedded country workspace consumes `@finalverse/earth-core@0.1.0`; the older `earth/sdk.js` remains the spatial-query client. No renderer or query backend was replaced.

The versioned SDK tarball is retained under `vendor/`, installed through the lockfile, and works without a sibling checkout or registry publication. Core source: finalverse/earth commit `c7f4f49`. Tarball SHA-256: `f48ab7dfde59059bf991f9dfabc0de2d38a92ad20a5db995e05a52af35b5f69d`. Rebuild Core and review its version, tests and hash before updating this dependency.

## Working experience

Open the existing country workspace. The place panel accepts `geo:latitude,longitude[,ellipsoid-height]` or a canonical USAP entity address. Explore Montréal moves to its geographic anchor; Go validates coordinates, Back returns through in-memory navigation history, and Copy destination shares only the URI. A Cesium marker is pickable and exposes coordinates and source metadata. Coordinates preserve ellipsoid height and axis order. Reduced motion uses a camera cut, controls have labels and status announcements, and controls wrap on narrow screens.

Geographic navigation is entirely local. It does not imply real city terrain, footprints, roads, buildings or a live world. The scene is the existing generalized Natural Earth map on an ellipsoid. SpatialDB scene-graph representations are deliberately not advertised as renderer capabilities. The separate geographic compiler and web-compatible tile consumer remain producer/client follow-up work.

## Optional entity service

`EARTH_SPATIALDB_ENDPOINT` configures an explicit operator-chosen HTTPS origin (loopback HTTP in development). It enables the same-origin `GET /v1/earth-core/entities/{uuid}` route. Without configuration it returns 503 and the panel explains that place details are not connected. Metadata is validated by Core before inspection, including identity, publication version, coordinates and cache policy.

The gateway forwards only the current request's Bearer credential. It never substitutes Earth operator credentials, fixture tokens, or a shared service account. No token is put in browser history, clipboard links, URLs or local storage. The existing Earth operator routes retain their separate authorization. Private/upstream denied and missing resources all return the same unavailable response; upstream bodies never reach users. Requests share the existing rate limiter, host/origin checks, self-only CSP and no-store policy. Query parameters are rejected for entity resolution. Credential-bearing URLs, redirects, unbounded bodies and arbitrary resolver destinations are refused.

The panel's anonymous request currently cannot resolve a private SpatialDB fixture. A per-user Finalverse authentication/session integration is not implemented. Do not put an Alice fixture token into public server configuration to make it appear to work. Existing configured world links remain separate; new resource world references are metadata, and the panel explicitly says authenticated client entry is required. No simulated login or fabricated admission button is provided.

## Validation and deployment

- `npm run earth:test`: embedded regressions plus six SDK/gateway/navigation tests.
- `npm run earth:build` and `npm run earth:audit-build`: existing build and notice audit.
- `node scripts/qa-earth-navigation.mjs`: real Cesium in headless Chromium, desktop/mobile viewports, reduced motion, geographic navigation/back/error/fallback and original country search. This is not a real SpatialDB dataset/browser proof.
- Core's separate `integration/live.mjs` exercised the actual isolated SpatialDB producer's synthetic publication; that is metadata interoperability, not city rendering.

Do not deploy from this task. Follow the established operator process under `earth/deploy` and retain its production hardening. No public website change, privileged command or successful deployment is claimed.

## R0 acceptance boundaries

Implemented and locally tested: shared SDK consumption, geographic navigation, marker/entity inspection, return navigation, metadata gateway and unavailable-service fallback. Existing country/query functionality remains in place.

BLOCKED: real Montréal terrain/buildings/roads, measured geographic alignment and a licensed/versioned SpatialDB Geo publication. The pre-acquisition source/licensing audit is in Earth Core `docs/audit.md`; no new geographic datasets were downloaded. Native world admission and live Confluence/Lumi/session integration are NOT TESTED. Physical mobile/tablet/GPU performance and production deployment are NOT TESTED. These gaps prevent claiming complete Earth Web R0 acceptance.
