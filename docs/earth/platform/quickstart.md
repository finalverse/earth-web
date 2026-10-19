# v0.4A developer quickstart

Status: locally packaged development candidate. Nothing has been published to npm or deployed over the public v0.3 preview. Use Node **24.22.0** (the tested runtime), npm and a modern browser. No global TypeScript, database, paid model key, Finalverse account or MutSea installation is needed.

## Build and install the package

From a checkout of `codex/earth-v04-platform`:

```sh
npm ci --ignore-scripts
npm run earth:sdk:build
npm run earth:test
npm run earth:platform:test
npm run earth:platform:serve -- --sdk-demo --port 18641
```

Open `http://127.0.0.1:18641/` and select **Run SDK acceptance**. It queries real Montréal facilities and the Ridgecrest archive, saves/exports/imports/reopens a workspace and verifies its receipt. The demo uses its own storage prefix, preserving v0.3 workspaces. Stop with Ctrl-C. Use a different free `--port` when another local service owns 18641; never terminate an unknown process.

The generated artifact is `artifacts/finalverse-earth-0.4.0-dev.1.tgz`. In a separate empty directory, install **that artifact**, not a nonexistent registry release:

```sh
npm init -y
npm install --ignore-scripts /absolute/path/to/finalverse-earth/artifacts/finalverse-earth-0.4.0-dev.1.tgz
```

Save this as `query.mjs` and run `node query.mjs` while the development server is running:

```js
import { EarthClient } from '@finalverse/earth';
const earth = new EarthClient({
  endpoint: 'http://127.0.0.1:18641',
  applicationId: 'finalverse.sdk-example',
  timeoutMs: 15000,
  retries: 0,
});
for await (const page of earth.datasets.pages()) {
  console.log(page.items.map((d) => d.title));
}
const places = await earth.places.search('Montréal');
const result = await earth.spatial.withinRadius({
  dataset: 'wri-canada-power-plants',
  place_id: places.data.features[0].id,
  radius_m: 100000,
  fuels: ['Biomass', 'Geothermal', 'Hydro', 'Solar', 'Wave and Tidal', 'Wind'],
  limit: 100,
});
console.log(result.data.total, result.receipt); // 24 archival facilities
```

## Browser application

Use a normal ESM bundler to import `@finalverse/earth`; the SDK imports no React/Cesium/DOM package. Set `endpoint` to your **service origin**, without `/api/v1`. `earth/platform/example/` is the executable framework-free example; the independent Energy Explorer is the larger application template.

Serve reviewed application assets and its API from one origin. Do not bypass CORS with a wildcard or embed privileged operator tokens in browser code. The local runtime supports reviewed same-origin apps only; it is not an untrusted plugin sandbox. [Manifest and grants](manifests.md) explains installation.

## Local workspace

Pass a Storage-compatible object explicitly (`localStorage` in your application, or an in-memory adapter in Node). `createApplicationRuntime(manifest, {client, storage})` validates the manifest, then `await runtime.start()` checks the real server installation/version/grants. `runtime.workspaces()` requires approved local read/write capabilities. Save a version-1 `Workspace` with its camera, dataset versions, query, receipt, notes and optional application state. See [API](sdk.md).

No workspace endpoint or cloud synchronization is implied. Importing a v0.3 export uses `store.importLegacy(text, 'energy')` explicitly and creates a new ID/app namespace. Existing exports/storage remain unchanged. App-scoped exports use the same schema version with an application identifier; older v0.3 readers reject unsupported new application IDs rather than silently reinterpreting them.

## Troubleshooting

- **404 on capabilities/catalog:** the endpoint is v0.3 or the wrong origin. New contracts require the isolated v0.4 server; the public preview intentionally remains unchanged.
- **403 / CAPABILITY_DENIED:** an app/tool/dataset/radius is not approved. Review the operator grant; editing the browser manifest does not change authority.
- **CORS/host failure:** use the same origin and a configured loopback port. Do not add proxy destinations from user/model input.
- **Unknown application/version:** install the reviewed manifest plus a separate grant through the local runtime CLI; there is no public installation endpoint.
- **Stale development modules:** the development runtime sends `no-store`. Production hashed assets retain their normal caching policy.
- **Storage quota/schema error:** export backups and check the five-document/1 MiB limits. Credentials are rejected in application-state keys.
- **AI unavailable:** deterministic queries work. `--ai` is opt-in for a loopback Ollama model, not public hosted inference.

API source of truth: `earth/contracts/openapi.json`, generated from the actual 25 tool definitions. `npm run earth:contracts` regenerates it; CI rejects drift. Distances use WGS84 ellipsoidal metres, positions longitude/latitude, and temporal instants explicit UTC Z with half-open ranges. No implicit interpolation or live-data claims.
