# v0.3 public-preview deployment

Primary app: `https://earth.finalverse.com`. Product page: `https://finalverse.com/earth`. One Earth runtime; the product page links to it. Basic queries need no account or AI key. The existing Finalverse and MutSea services remain separate.

## Observed preflight · 2026-10-19

The existing Finalverse HTTPS site is served by Maple nginx from its versioned `current` release. `/earth` currently returns 404. `earth.finalverse.com` has no A record. Maple's default Node is **22.22.1**, while this repository requires Node 24.14–24.x or 26.x. Install a dedicated, checksum-verified **24.22.0** runtime; do not replace the host's Node used by other services. No Earth vhost, DNS, certificate, user or production service was changed by this preflight. DNS authorization/credentials and a tested staging rollout are separate gates.

## Build and stage

From a clean checkout at the approved commit, run Node 24.22.0:

```sh
npm ci --ignore-scripts
npm run earth:test
npm run earth:build
npm run earth:audit-build
npm run check:boundaries
```

Stage a dedicated release directory `/srv/finalverse-earth/releases/<commit>` containing `dist-earth/`, `earth/`, the pinned `src/` modules, package manifests and license notices. Install from the same lock with `npm ci --omit=dev --ignore-scripts`; don't publish source or dependencies through nginx. Review `earth/globe.lock.json` with `node earth/upstream.mjs verify`. Generate `FILES.sha256` over the staged immutable files, excluding itself and mutable logs. Never package credential files, `.env`, `.git`, workspace documents or local model state.

`earth/deploy/finalverse-earth.service` runs a dedicated unprivileged user, explicit Node binary, loopback listener, memory/task bounds and JSON request logs. The public default has **no AI, operator registration, cloud model keys, database or MutSea dependency**. Optional local planning remains available in development with `--ai`; a bounded public model service needs its own budget/abuse acceptance. Optional PostGIS stays private and must use the existing least-privilege Earth role and a private credential file. No production database reset is required.

For a first installation, create the dedicated user/root, review ownership, point `current` at the staged candidate, install the unit and start it **without a public vhost**. Verify `/healthz`, `/readyz`, historical queries, static assets and a controlled process restart over localhost. Readiness tests the configured database when one is enabled. `/metrics` contains only aggregate request/error/query/planning counts and uptime, and must remain private.

## Activation and rollback

`earth/deploy/switch.sh <release-id>` verifies the checksum manifest, atomically switches a dedicated current symlink, restarts only `finalverse-earth`, and restores the previous target on failed readiness. It retains both releases. It deliberately refuses first installation; no implicit adoption of an existing service. Test candidate → prior → candidate, and a deliberately failing candidate, **in staging** before production. The script is prepared and syntax-checked; a real server rollback is not yet accepted.

After the application gates pass, use a **new dedicated nginx vhost** based on `earth/deploy/nginx.conf`. Issue/renew a certificate for the exact hostname through the existing ACME webroot. Keep other vhosts byte-identical, run `nginx -t`, then reload. The proxy overwrites its client-IP header, hides metrics/operator endpoints and keeps all Node/SQL ports private. The app permits only its exact HTTPS origin and local HTTP origins; no wildcard CORS. Structured logs omit queries, request bodies, URLs, addresses and credentials. The application enforces per-client request budgets; the model also has bounded concurrency/timeout. Add edge-wide connection/rate controls appropriate to the actual gateway load.

Create only the reviewed Earth DNS record after authorization and service/certificate validation. Record its prior state for rollback. Verify anonymous public HTTPS (without hosts overrides), source credits, real Montréal lookup, timeline, export, private endpoints, CSP, reboot/restart and external service health. A preview is not GA.

The release gate record is `docs/earth/verification-v03.md`. Do not publish a v0.3 GitHub Release or advertise a live app until the public, certificate and rollback checks pass.
