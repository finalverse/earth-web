# Optional PostgreSQL/PostGIS

The default Earth demo uses bundled, in-memory datasets. PostgreSQL is optional and must use a **separate `earth_*` database**. The connection guard rejects other names. Never point these migrations at MutSea, CreditChain or another product's tables.

## Isolated local development

Install Docker separately. The pinned official image is PostGIS 3.5 / PostgreSQL 17, Linux amd64 (emulated on Apple Silicon):

```sh
docker pull --platform linux/amd64 postgis/postgis@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6
npm run earth:db:start
EARTH_DATABASE_URL_FILE="$HOME/.local/share/finalverse-earth/postgis-dev/runtime-url" \
  npm run earth:start -- --postgis
```

The helper requires the pinned image locally; it does not pull a floating tag. A separately pinned OCI manifest also supports Docker Desktop's verified save/load conversion of the same image layers. It uses container `finalverse-earth-postgis-dev`, volume `finalverse-earth-postgis-v02`, loopback port 18643, a 768 MiB memory limit and 1.5 CPUs. No other containers/volumes are stopped or pruned. Tested on this development Mac; Docker/Windows and native ARM database images are not certified.

Generated admin/runtime passwords and URL files live under `~/.local/share/finalverse-earth/postgis-dev/` (private directory, files 0600). Passwords are not passed as Docker command arguments or printed. The container reads its initial password from a mounted secret file. The runtime role has no superuser, RLS-bypass, database-creation or role-creation rights. Startup rejects table-owner/superuser/RLS-bypass roles. Stop with `npm run earth:db:stop`; data is retained. No helper deletes the volume.

The helper migrates and seeds the three approved datasets. Restart is idempotent. Existing IDs are immutable; a conflicting version/hash fails instead of overwriting data. Use a new versioned dataset ID for changed data. Back up the dedicated volume/database before administrative changes. Application roles have no UPDATE/DELETE permission; there is no dataset-delete API.

For your own isolated server, an administrator must install PostGIS, create a dedicated database and an unprivileged login role, run migrations using a separate admin URL file, and grant `earth_app` to that login. Keep administrative URLs out of the server process:

```sh
EARTH_DATABASE_ADMIN_URL_FILE=/private/path/admin-url npm run earth:db:migrate
EARTH_DATABASE_URL_FILE=/private/path/runtime-url npm run earth:db:seed
EARTH_DATABASE_URL_FILE=/private/path/runtime-url npm run earth:start -- --postgis
```

## Storage and access

`earth.datasets` stores immutable manifests, source versions, owner, visibility, provenance and registration timestamps. `earth.features` stores original GeoJSON, valid query geometry, properties and indexes. The original data is returned for inspection/export. Row-level security is enabled and forced on both tables. Every application transaction binds a trusted principal with transaction-local `set_config`; anonymous requests cannot adopt an owner ID. The pooled context is reset by commit/rollback. The local operator token maps to one fixed operator identity; it is not a multi-user identity service.

The migration ledger records source SHA-256 and applies each migration once under an advisory lock. Editing an applied migration fails. Add a new migration instead. All registration batches commit atomically; failed inserts leave no partial dataset.

### Source geometry and topology

The inherited generalized country outline has 41 self-intersecting features under PostGIS validation. The pinned reference importer explicitly derives valid query geometries using `ST_MakeValid`; it preserves exact original GeoJSON in `source_geometry` and records affected feature IDs, reasons and the derivation in provenance. It does not rewrite upstream source or claim survey accuracy. Embedded queries use the original geometry; database topology may differ near these defects. New operator datasets with invalid PostGIS topology are rejected; the reference exception is restricted to the approved country source hash.

### Indexes and RLS

GiST indexes cover geometry and geography. PostgreSQL's security barrier can prevent their use by non-leakproof PostGIS predicates under RLS. We do not disable RLS or mark PostGIS functions leakproof. Point-distance queries use a stored latitude B-tree prefilter, then exact `ST_DWithin`/`ST_Distance` on WGS84 geography. The conservative latitude window uses 110,000 m/degree, below WGS84's minimum meridional degree length; it never defines the final distance result. Runtime EXPLAIN checks verify this prefilter is usable. Geometry/bounding-box/join queries remain bounded, but GiST acceleration is not claimed for the RLS runtime path. Large-dataset scaling is an open gate.

## Integration tests

The opt-in suite creates and drops a uniquely named `earth_test_*` database on the explicitly configured server. Use only a disposable development PostgreSQL instance; administrative access is required. It never drops `earth_dev` or another product database.

```sh
EARTH_TEST_ADMIN_URL_FILE="$HOME/.local/share/finalverse-earth/postgis-dev/admin-url" \
EARTH_TEST_URL_FILE="$HOME/.local/share/finalverse-earth/postgis-dev/runtime-url" \
  npm run earth:test
```

Checks include migration replay, source-coordinate preservation, real-data parity with the embedded engine, private-row isolation across pooled principals, runtime-role rejection, HTTP/SDK access, intentional insert failure/rollback and usable index plans. Without these files the integration test explicitly skips. For repeatable local query timings, run `EARTH_DATABASE_URL_FILE=... npm run earth:bench -- --postgis`.
