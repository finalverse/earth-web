# Finalverse Earth v0.3 · public preview

[Launch Earth](https://earth.finalverse.com) · [Product overview](https://finalverse.com/earth) · [Source and releases](https://github.com/finalverse/finalverse-earth/releases)

No account, hosted AI subscription or map-provider key is required. Use a modern WebGL-capable desktop browser. This is a browser application, separate from the Finalverse native world viewer; it does not require MutSea.

## Your first geographic analysis

1. Open [Energy Explorer](https://earth.finalverse.com/energy.html).
2. Keep Montréal, 100 km and renewable facilities selected; choose **Explore facilities**. The pinned archive returns **24** facilities.
3. Select a result. Inspect its source coordinates, WGS84 distance and reported capacity. Capacity is not actual electricity generation.
4. Choose **Compare available reporting years**. The Canadian source has no populated annual generation reports; the UI reports missing coverage.
5. Choose **Export evidence JSON** to keep the typed plan, source provenance and execution receipt.

## Explore change through time

Open [Space-Time](https://earth.finalverse.com/time.html). The bundled USGS archive contains **90** Ridgecrest events between July 4 and July 8, 2019. Play/pause the UTC timeline, adjust its speed, inspect an event, or compare cumulative snapshots. A newly observed source record does not establish when a real-world feature was created. Event time, later catalog updates and acquisition time remain distinct. This is a historical catalog, not a live hazard service.

## Save your workspace

Expand **Spatial workspaces · saved on this device**. Set a title and notes, then **Save**. **Open** restores the camera, layer/version references, time and saved plan; review and run the plan to refresh its analysis. A saved receipt is labeled as saved evidence. **Duplicate** creates a new document. **Export** makes a portable JSON backup, and the import control accepts the versioned document. Importing an already saved ID preserves the existing document as a separate copy.

Up to five documents fit in local storage, with a 1 MiB limit per document. They are browser/device specific; clearing browser data removes them. Export valuable work. No cloud synchronization, automatic imported-plan execution or multi-user collaboration is included.

## Local inference and development

Public hosted inference is **off**. Geographic queries and exports work without it. To use your own Ollama endpoint/model, follow [Start locally](../../README.md#start-locally) and the opt-in AI setup. Review a proposed plan before execution. The model receives the question only when you explicitly enable inference; it cannot execute arbitrary SQL or world mutations.

The [HTTP API](api.md), [space-time contracts](space-time.md) and repository JavaScript/TypeScript/Python clients support independent applications. Public API requests are rate limited. Operator dataset uploads, metrics, PostGIS and model endpoints are not public capabilities.

## Release packages

GitHub provides the full tagged source automatically. Clone the release tag to rebuild with Node 24.14–24.x (24.22.0 tested), `npm ci --ignore-scripts` and `npm run earth:build`.

If using the prebuilt **web-server** tarball attached to the preview release:

1. Download its adjacent `SHA256SUMS` and verify the archive (`shasum -a 256 -c SHA256SUMS` on macOS, `sha256sum -c SHA256SUMS` on Linux).
2. Extract into a new directory. Review `BUILD.json` and `INSTALL.md`.
3. With Node 24.22.0, run `npm ci --omit=dev --ignore-scripts`, then `node earth/server/main.js`.
4. Open `http://127.0.0.1:18640/energy.html`. Stop with Ctrl-C.

The tarball includes built browser assets, API source, bundled reference data, manifests and notices; it excludes Node, dependencies and credentials. Internet access is required to install npm dependencies. It is not a native Mac installer or a complete source checkout for renderer rebuilding; use the tagged repository for development. Checksums identify the published bytes; they are not a code-signing/notarization claim. For hosting, follow the [deployment guide](deployment.md); do not expose the development listener directly.

## Preview limits and feedback

The globe uses approved local geometry on an ellipsoid, without satellite imagery, terrain or paid ion content. Source credits remain available. Data is archival and incomplete; no live-energy, real-time hazard, medical/legal or engineering-safety service is offered. Local inference quality depends on the selected model.

Mac Chrome and the in-app WebKit browser were exercised; core CI runs on macOS, Windows and Linux, plus PostGIS. This is not certification of all GPUs, browsers or mobile devices. Broader sustained-load/device testing, streaming, cloud workspaces and third-party application isolation remain future work.

Report a reproducible issue through [GitHub Issues](https://github.com/finalverse/finalverse-earth/issues), including browser/OS, the non-sensitive plan and dataset version. Do not post credentials, private location history or confidential workspace exports. See [verification](verification-v03.md) for measured results and [data/software licensing](licensing.md) for provenance.
