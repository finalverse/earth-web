# Finalverse Earth v0.4 release candidate

This is an isolated public-data preview candidate. It is not the public v0.3
service, an authenticated tenant host, or a public AI inference endpoint.

## Install and run

Use Node.js 24.14–24.x (verified with 24.22.0) and npm. Verify the archive against
the separately supplied `SHA256SUMS`; extract into a new empty directory. Do not
install over an existing checkout or release.

```sh
tar -xzf finalverse-earth-runtime-0.4.0-rc.1.tgz
cd package
node earth/release/verify.mjs .
npm ci --omit=dev --ignore-scripts
node earth/release/serve.mjs --surface energy --port 18648
```

Open `http://127.0.0.1:18648/`. The independent Energy Explorer and its scoped
API use the same origin. For the globe, Countries, Energy and Time applications,
start a second process with `--surface globe --port 18649`; open that origin.
Both processes reuse the same core and bundled immutable source snapshots.
`/readyz`, `/v1/status`, `/v1/openapi.json` and `/v1/capabilities` are available.
Both listen only on loopback; no cloud keys, login or AI inference are enabled.

Optional PostgreSQL/PostGIS uses the existing documented Earth migrations and
seed, a non-owner runtime role and `EARTH_DATABASE_URL_FILE` pointing to a 0600
file. Never reuse another product's database. No migration or write occurs at
server startup. See the source repository's `docs/earth/database.md`.

## SDK and independent application

`distributions/` contains the zero-dependency ESM TypeScript SDK and independent
Energy Explorer package. To exercise the SDK in a separate empty directory:

```sh
npm init -y
npm install /absolute/path/to/distributions/finalverse-earth-0.4.0-rc.1.tgz --ignore-scripts
cp /absolute/path/to/earth/release/consumer.mjs ./consumer.mjs
node consumer.mjs http://127.0.0.1:18648
```

Node resolves imports relative to the copied consumer file. No source checkout imports are required.
The application package's `dist/` is portable static content; serve it through
an Earth server with its separately reviewed manifest and grant. Do not expose
untrusted third-party JavaScript on the same origin or mistake an app ID for
authentication. Browser workspace namespaces are conveniences, not sandboxes.

## Upgrade, compatibility and rollback

Export local workspaces before changing browser origins. Schema-1 v0.3 documents
remain readable. Invalid imported receipt shapes are rejected; imported evidence
is unsigned and never automatically executes a plan. Browser storage is local
to each origin and is not a cloud account or backup.

Keep the previous extracted release and its installed dependencies intact.
Verify the new release, install in a separate directory and test it on a separate
loopback port. Stop the old owned process, activate the new directory and probe
`/readyz`. On failure, stop the new process and restart the previous command and
directory. Do not remove databases, Docker volumes, old releases or workspaces.
`earth/release/rehearse.mjs` exercises these transitions using owned child
processes and atomic local symlink changes; it does not change the production
systemd service or public DNS. Linux production switching is separately documented
in `docs/earth/deployment.md` and requires deployment approval.

## Data, licensing and limits

WRI facility records are archival reported capacity, not live power generation.
USGS Ridgecrest is a historical snapshot. Natural Earth is a bundled geography
snapshot. No synthetic data is presented as observed data. AI is disabled in
this candidate entry point; the development planner remains a separate opt-in
local-only facility with reviewed plans, not autonomous execution.

Retain `LICENSE`, `earth/LICENSE`, `licenses/`, `SBOM.cdx.json` and browser
`notices/`. The maintained upstream is `finalverse/gods-eye-view`; inherited
work retains its original authorship and notices. The SBOM inventories both
lockfiles, including development dependencies explicitly marked optional.
It is an inventory, not an audit or warranty of third-party license compliance.
Release validation and supported-browser limits are recorded in
`docs/earth/releases/v04-rc-validation.md` in the source repository.
