# @finalverse/earth · v0.4 development artifact

Renderer-independent ESM TypeScript/JavaScript client for the real `/v1` API. Zero runtime package dependencies; Node 24 and modern browsers with Fetch, Web Crypto and AbortSignal. No DOM access, React, Cesium, MutSea or cloud credentials.

This package is locally packed, not published on npm. See the repository's v0.4 SDK quickstart for artifact installation. Pass the service origin, not `/api/v1`. The public v0.3 service has not been upgraded; run the isolated v0.4 development server for new app/cursor endpoints.

```js
import {EarthClient} from '@finalverse/earth';
const earth=new EarthClient({endpoint:'http://127.0.0.1:18641',applicationId:'finalverse.energy-explorer'});
const datasets=await earth.datasets.list();
const result=await earth.spatial.withinRadius({dataset:'wri-canada-power-plants',place_id:'ne-place-1173',radius_m:100000,limit:100});
console.log(datasets.items,result.data.features,result.receipt);
```

Typed groups: `places`, `datasets`, `spatial`, `temporal`, `workspaces`, `capabilities` and optional `ai.propose`. `query` covers all 25 real tools. Cancellation, per-call timeouts, correlation IDs and sanitized `EarthError` fields are supported. Retries default to zero; opt-in `retries: 1` or `2` affects only GET 429/503, never a proposal/query POST. Cursor iterators are bounded and detect repetition. Retry waiting is within the total request timeout.

Local storage must be passed explicitly; the SDK never reads global browser storage. Runtime startup compares server-installed app identity/version and grants. Same-origin app code is trusted; storage prefixes are not a sandbox. A manifest never grants private data or OS/network/model authority by itself. No remote app loader or arbitrary code execution is included. Existing v0.3 workspace exports can be migrated explicitly to an app namespace; the originals are never overwritten.

Coordinate order is longitude/latitude; ellipsoidal distances/radii are metres. UTC temporal ranges are half-open and missing observations remain missing. The API contract and source licenses are included in the package. Dataset licenses and product trademarks remain separate.
