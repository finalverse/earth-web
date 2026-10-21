# Earth–World Bridge development guide

Status: **local v0.6 integration preview, not a public release**. FSIP is 0.1;
the independent spatial SDK remains its existing v0.4 release candidate. The
public Earth v0.3 deployment is unchanged. Read [acceptance](acceptance.md) before
describing a demonstration as accepted or enabling the hosted pilot.

## What actually runs

The existing `earthd` process owns sessions, proposals and a small bridge in its
dedicated PostgreSQL database. It does not connect to MutSea's database. MutSea's
authenticated `FinalverseWorld` capability calls the private bridge, then uses
the existing `ComposerBridge`, `PlaceKernel` and pinned `ContentCatalog`.
Native object streaming, permissions, inventory, avatars and rendering remain
the existing implementations.

The local rehearsal uses a **separate**, newly provisioned PostgreSQL world with
two sandbox regions. Existing Harbor, hosted Lumi, public websites and unrelated
databases are outside that rehearsal. The nine Genesis templates are unchanged.

The reviewed native Starter Library is a deployment prerequisite. Its original
CC0 packages must have the exact versions/hashes in `src/bridge.rs`. The server
independently checks manifests, native mesh/material hashes, parts, triangles,
asset bytes, lights, terrain, clearance and parcel permissions. Missing or
different assets refuse preview. No arbitrary URL or authoring code is accepted.

## Configure the two authorities

First apply the additive session and bridge migrations through the operator
database connection. The runtime account has DML access, not DDL or superuser
privileges. `node earth/intelligence/dev-db.mjs` and its `--test` variant apply
both migrations **only to their dedicated local development databases**. Do not
point this helper at a hosted or shared database.

The optional `bridge` member in the existing private runtime configuration is:

```json
{
  "socket": "/run/finalverse-intelligence/world.sock",
  "token_file": "/run/finalverse-intelligence/world-token",
  "grid_id": "11111111-1111-4111-8111-111111111111",
  "region_ids": ["22222222-2222-4222-8222-222222222222"],
  "loopback_tcp": false
}
```

Replace those example UUIDs with the persistent, operator-assigned FSIP grid
authority ID and actual native region UUID. Keep them stable across restarts.
Never reuse another deployment's identity/key for a sandbox. Region identity
comes from the server, not model output or a matching region name.

Use a newly generated, private 64-character hexadecimal **world service** key,
distinct from the existing owner credentials. Configuration, key and database
URL files are owner-only; the socket directory is owned by the service account
and mode 0700, with a mode-0600 socket. Runtime and native adapter can share a
dedicated Unix service identity. No key belongs in Git, a URL, a model prompt,
process arguments or the distributable viewer.

MutSea's corresponding configuration:

```ini
[FinalverseWorld]
Enabled = true
DataDirectory = /data/finalverse
ContentLibraryDirectory = /config/approved-catalog

[FinalverseComposer]
Enabled = true
Regions = 22222222-2222-4222-8222-222222222222

[FinalverseEarthBridge]
Enabled = true
GridId = 11111111-1111-4111-8111-111111111111
CredentialFile = /run/finalverse-intelligence/world-token
SocketPath = /run/finalverse-intelligence/world.sock
```

The runtime still binds literal loopback for its owner API. For an isolated Mac
Docker Desktop rehearsal only, `loopback_tcp: true` makes the same narrow private
routes available on that existing loopback listener. The native adapter can use
`LocalDevelopmentOrigin = http://host.docker.internal:18651/` instead of a socket.
This explicit development option accepts only loopback/Docker-host origins,
refuses redirects/proxies and uses a separate Host/credential boundary. It is
not a new public AI endpoint. Prefer the Unix socket on the hosted world machine.

## Source-backed pavilion

Create and approve a source-backed spatial workspace using the existing
[Earth CLI](../intelligence/developer-guide.md). Then use that owned session:

```sh
earth --config /private/runtime-config.json --session "$SESSION_UUID" \
  experience plan 'Create an exhibition from this renewable-energy workspace.' \
  --grid "$GRID_UUID" --region "$REGION_UUID" --output /private/pavilion.json
```

Planning prints the session/request identifiers before inference, so an
interrupted request can be inspected. A request UUID can be supplied with
`--request-id`; repeating the same successful request returns the same manifest,
without another model call. Changed input or interrupted/failed planning is not
automatically repeated. Use `earth --session … experience list` to find its state.

The first compiler supports the approved archival WRI Canada facility workspace.
It pins the **committed immutable artifact**, receipt and source record IDs.
It checks ownership and the artifact hash again at handoff and approval. A newer
workspace does not silently replace an already reviewed source snapshot.

The Montréal demonstration uses 18 hydro/solar records within 100 km, with six
source-linked exhibit markers and generated pavilion geometry. Exhibit positions
are index-based gallery positions, **not facility locations**. The source anchor's
zero height is an explicit reference convention, not measured elevation. WRI's
2021 release is archival; capacity is reported source capacity, not live output.
Generated interpretation is separately labeled. Source records retain CC BY 4.0;
the original Starter Library geometry retains CC0-1.0.

## Virtual-only garden

```sh
earth --config /private/runtime-config.json experience plan \
  'Create a floating garden in Confluence.' --virtual-only \
  --grid "$GRID_UUID" --region "$CONFLUENCE_REGION_UUID" \
  --output /private/garden.json
```

This path does not read an Earth dataset or require geographic coordinates. Its
frame is explicitly virtual. The model selects bounded seating/tree choices;
the deterministic compiler selects the approved assets and layout. It cannot
invent geography, source records, privileges, downloads, scripts or SQL.

## Native review and creation

Log into the intended grid/region with the existing world account. Open
**Create → Earth → World**. The panel shows the actual avatar UUID to associate
with the handoff; a matching display name is insufficient.

```sh
earth --config /private/runtime-config.json experience handoff "$EXPERIENCE_UUID" \
  --agent "$AVATAR_UUID" --output /private/one-use-handoff.json
```

The command writes the secret to a new mode-0600 file and prints only its path,
grant ID and expiry, including with `--json`. Paste its `token` into the native
panel. Do not put it in a browser/deep-link URL.

1. **Preview** consumes the one-use, five-minute handoff for the actual avatar,
   grid and region. Native siting/budget validation runs without creating objects.
2. Read the title, schematic/virtual context, generated interpretation, source
   attribution/exhibits, permissions and proposed placement. The native preview
   expires in two minutes and belongs to this login session.
3. **Approve & create** performs the single durable authorization transition and
   calls the existing native transaction. **Reject** cancels the pending preview.
4. **Visit** uses the server-resolved place entrance. **Inspect** shows the
   WorldLine operation and bindings; save the native plan ID to inspect later.
5. **Undo** uses the existing native fingerprint and permission checks. It refuses
   to erase later edits. It does not need model inference or a live Earth server.

Wrong-region/actor handoffs, replay, revoked/expired approvals, a disconnected
viewer and generic `commit`/`undo` routes cannot bypass the bridge checks. After
a new login, an old uncommitted preview must be rejected and previewed again.

Generic Creator Library export of a bridge place is deliberately refused until
that format can preserve its separate data licensing and WorldBindings. Existing
non-FSIP creator releases are unaffected. This preview is not a commerce rollout.

## Receipts, events and recovery

Owner API routes use the existing bearer/Host/Origin policy:

| Operation | Route |
|---|---|
| List/propose | `GET/POST /v1/sessions/{session}/experiences` |
| Inspect | `GET /v1/experiences/{experience}` |
| Issue one-use handoff | `POST /v1/experiences/{experience}/handoff` |
| Revoke | `POST /v1/experiences/{experience}/grants/{grant}/revoke` |
| Replay audit events | `GET /v1/experiences/{experience}/grants/{grant}/events?after=0` |

The last route returns JSON or, with `Accept: text/event-stream`, durable
`fsip.event` frames. Resume with `after=<last sequence>`; GET replay never retries
a POST. Browser share grants cannot access these owner routes. The existing
spatial-only browser continuation retains the original workspace/provenance and
can select its source records without re-executing the query.

Only the separately authenticated private native transport can redeem a handoff,
authorize a native plan or report an authoritative receipt. The receipt binds
every asset placement to actual streamed native entity UUIDs and, for exhibits,
source record IDs. Native `.fsip.jsonl` stores that sidecar beside existing
WorldLine; legacy scene structures and fingerprinted geometry are not rewritten.

Interrupted inference is marked failed, and an interrupted execution is marked
**unknown**. Neither is automatically replayed. Use native **Inspect** to reconcile
a proven committed/compensated/undone WorldLine outcome. An unresolved native
intent or a changed fingerprint requires administrator review. If the bridge is
offline, the native receipt remains authoritative and reports synchronization
as pending. Native reads and guarded Undo remain available when new handoffs are
disabled. Live/unknown world grants pin their original source sessions against
normal session pruning; revocation does not destroy evidence of a possible write.

## Existing Lumi

The viewer offers **Ask Lumi to review** only where her existing hosted citizen
is interactive. The protected `experience` command resolves the controller's
actual native experience through a read-only world tool. It passes a bounded,
credential-free evidence summary to the existing conversation gateway. It creates
no autonomous goal, build preview, new citizen, duplicated memory or edit grant.
The same Lumi identity can explain/propose improvements and inspect a recorded
result; creation still needs the human's native approval.

The new read-only path has contract/policy tests. **Hosted end-to-end Lumi review
is not accepted until the coordinated native/runtime/gateway pilot is deployed
and verified with her existing identity and PostgreSQL history.** Region-local
review does not implement cross-region citizen migration. v0.7 remains gated.

## Build and verify

```sh
cargo fmt --manifest-path earth/intelligence/Cargo.toml --check
cargo clippy --locked --all-targets --manifest-path earth/intelligence/Cargo.toml -- -D warnings
cargo test --locked --manifest-path earth/intelligence/Cargo.toml
cargo run --locked --manifest-path earth/intelligence/Cargo.toml --bin fsip-schema > earth/fsip/fsip-0.1.schema.json
node earth/fsip/build.mjs
node --test earth/fsip/*.test.mjs
```

Use the dedicated test database environment variable described in the runtime
guide to run `--test bridge -- --include-ignored` and the existing explicit
PostgreSQL/native-CLI and OS-sandbox integration suites. CI includes the bridge
suite plus a generated schema/binding drift check.

MutSea's `MutSea.ContentTests` includes FSIP budgets, audience, source-link and
unknown-field denials. `MutSea.EarthBridgeSmoke` is an explicit private-account
native-capability/UDP probe: preview/apply/inspect/undo/independent observation.
It uses the pinned Unix-compatible diagnostic SDK documented by ProtocolSmoke;
do not replace simulator assemblies with that client SDK. Real model and native
checks are distinguished from synthetic unit fixtures in the acceptance ledger.

Native viewer builds and all existing tests must pass, followed by a real launch,
source review, scene inspection and Undo. A successful API response alone is not
viewer acceptance. No public download or v0.7 promotion follows automatically.

## Private native fixture notes

For local GUI checks, select the isolated grid before entering credentials. Use
an explicit `x-grid-location-info://<grid-authority>/region/<region>/x/y/z` start
location when supplying one; a generic `secondlife://<region>/…` URL selects the
inherited grid. The viewer now clears supplied explicit-grid credentials if a
startup location changes the grid, with a regression test for same-grid retention
and cross-grid clearing. Never pass secrets through `--login` or other process
arguments. Keep session files private and disposable.

The inherited GUI password field accepts at most 16 characters. The current
public registration service deliberately requires 12–16 printable ASCII
characters; an operator-created fixture must respect that limit for GUI tests
even though native administrative provisioning accepts longer secrets. A CLI
login alone does not prove compatibility with the GUI password field.
