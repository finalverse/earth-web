# Develop with Earth Intelligence v0.5

Use this guide from the repository root on macOS or Linux x64/ARM64. Node 24,
Rust 1.92+ and Docker are needed for the complete development setup. Inference
is optional; install/configure Ollama separately and choose an already installed
local completion model. No model downloads, paid keys or cloud routes are implicit.

## Build the existing application and native executables

```sh
npm ci --ignore-scripts
npm run earth:sdk:build
npm ci --prefix apps/energy-explorer --ignore-scripts
npm run earth:energy:build
cargo build --locked --manifest-path earth/intelligence/Cargo.toml
export PATH="$PWD/earth/intelligence/target/debug:$PATH"
earth --help
```

If `CARGO_TARGET_DIR` is set, add its `debug` directory instead. Do not overwrite
an unrelated existing executable named `earth`.

Start the existing Earth authority in a dedicated terminal:

```sh
node earth/release/serve.mjs --port 18650 --surface energy
```

The reviewed `finalverse.intelligence` grant is installed by this development
launcher. The Node service remains read-only, with its own AI disabled; Rust
inference does not require enabling the Node AI planner.

## Initialize dedicated session storage and configuration

```sh
node earth/intelligence/dev-db.mjs
project=$(mktemp -d)
printf 'export function add(a,b){return a-b;}\n' > "$project/add.mjs"
printf "import test from 'node:test'; import assert from 'node:assert/strict'; import {add} from './add.mjs'; test('adds',()=>assert.equal(add(2,3),5));\n" > "$project/add.test.mjs"
earth config init \
  --database-url-file "$HOME/.local/share/finalverse-earth/intelligence-dev/runtime-url" \
  --bind 127.0.0.1:18651 --earth-origin http://127.0.0.1:18650 \
  --ollama-origin http://127.0.0.1:11434 --default-model llama3.2:3b \
  --code-root "$project" --node-binary "$(command -v node)" \
  --browser-assets "$PWD/apps/energy-explorer/dist"
```

The helper reuses **only** the dedicated Earth development PostGIS container and
creates `earth_intelligence_dev`, an unprivileged DML role and the session schema.
It never resets databases or rotates a pre-existing role's missing credential.
Private credential values are not printed. It does not touch MutSea/Postgres
services elsewhere. `config init` refuses existing config/token files. The default
config path is `~/.local/share/finalverse-earth/intelligence-dev/config.json`.

Omit the Ollama/model flags for deterministic tool operation without inference.
Omit code-root/Node flags to disable coding. JSON config fields are documented by
`src/config.rs`; `earth config` prints paths/policy, not credential file contents.
The daemon requires the unprivileged role; run the migration helper as the local
development administrator, not as the runtime login.

Start in another terminal:

```sh
earthd --config "$HOME/.local/share/finalverse-earth/intelligence-dev/config.json"
```

The daemon refuses non-loopback origins/binds and a second owner of the same DB.
Do not proxy its endpoints publicly.

## Use real commands

```sh
earth doctor
earth models
earth datasets
earth places Montréal
earth
earth ask "Explain an event log in one sentence."
earth ask "Show renewable energy facilities within 100 km of Montréal" --mode spatial
earth sessions
earth sessions pending --session <session-uuid>
```

Review the returned typed proposal **and** SHA-256, then explicitly approve:

```sh
earth sessions approve <proposal-uuid> --sha256 <reviewed-sha256> --session <session-uuid>
earth --session <session-uuid>
```

Interactive commands: `/help`, `/models`, `/sessions`, `/resume UUID`,
`/mode chat|spatial|code`, `/file relative.js`, `/pending`, `/approve UUID`,
`/cancel`, `/workspace`, `/exit`. Changing mode creates a new session. Resuming
uses its persisted mode and conversation; it does not replay approved actions.
`--json` emits NDJSON protocol events for automation. Ctrl-C while streaming
requests cancellation; a disconnected client can resume by its session ID.

Supported model-generated spatial plans are `within_distance`,
`cluster_features` and `features_during_interval`. Source discovery is currently
the bundled Canadian place catalog. Named fuel filters and explicit distances
are honored; unspecified distance/grouping defaults are shown before approval.
For a temporal example, ask for Ridgecrest earthquakes from `2019-07-04` to
`2019-07-07` (end exclusive). Temporal receipts are available as artifacts;
Energy Explorer continuation currently supports facility results only.

## Bring an approved spatial workspace into the browser

```sh
earth workspace export --session <spatial-session> --output /tmp/earth-spatial.json
earth workspace share --session <spatial-session> --output /tmp/earth-spatial-share.json
```

Open `http://127.0.0.1:18651/`. Read the share key locally from the private share
file and enter it in the password field. Do not paste it into an issue, URL or
chat. The page restores source facilities, camera, attribution, receipt and the
original protocol event. Select a facility and download the portable workspace.
Energy Explorer on port 18650 can import the exported JSON as a separate local
workspace; the original query is not silently executed again.

```sh
earth workspace revoke --session <spatial-session>
earth sessions export --session <session-uuid> --output /tmp/earth-private-session.json
```

Sharing is explicit, limited to one immutable spatial snapshot and expires after
one hour. Session export includes private conversation/events and artifact
references, not secret credentials or automatic uploads. Fetch an artifact body
with `earth sessions artifact <artifact-uuid> --session <session-uuid>`.

## Coding: inspect → propose → review → approve → test

```sh
earth ask "Correct add so that it returns the sum. Preserve the export." \
  --mode code --file add.mjs --model qwen2.5-coder:3b
earth workspace read add.mjs --session <code-session>
earth workspace search return --files add.mjs --session <code-session>
earth sessions pending --session <code-session>
earth sessions approve <patch-proposal> --sha256 <reviewed-sha256> --session <code-session>
earth workspace test --files add.test.mjs --read-files add.mjs --session <code-session>
earth sessions approve <test-proposal> --sha256 <reviewed-sha256> --session <code-session>
earth sessions artifact <test-artifact> --session <code-session>
earth ask "Explain this recorded test outcome." --session <code-session> --artifact <test-artifact>
```

Model and tests are configurable; use installed model names. Test explanation is
generated narrative from an **explicit same-session test receipt**, with bounded
output excerpts. It cannot propose a patch or execute another tool. Patch mode
uses `--file`; explanation uses `--artifact`; they cannot be combined.

Patches replace one existing bounded UTF-8 file atomically after optimistic hash
validation. New files, multi-file transactions, arbitrary executables, package
installation, shell, git push and background jobs are unsupported. Tests are
explicit JavaScript ESM files through the operator's Node binary. Every imported
local file must be separately listed under `--read-files`; no project-wide read
grant is supplied. Review tests before approving them; see the
[sandbox limits](security.md). Failed tests produce an inspectable result rather
than an automatic edit/retry loop.

An unauthorized operation must fail without changing a file:

```sh
earth workspace read ../outside.txt --session <code-session>
```

## Verification and cleanup

```sh
cargo fmt --manifest-path earth/intelligence/Cargo.toml --check
cargo clippy --locked --manifest-path earth/intelligence/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path earth/intelligence/Cargo.toml
node earth/intelligence/dev-db.mjs --test
export EARTH_INTELLIGENCE_TEST_DATABASE_URL_FILE="$HOME/.local/share/finalverse-earth/intelligence-dev/test-runtime-url"
export EARTH_INTELLIGENCE_NODE_BINARY="$(command -v node)"
cargo test --locked --manifest-path earth/intelligence/Cargo.toml --test runtime -- --ignored --nocapture
npm run earth:test
npm run earth:platform:test
npm run earth:energy:test
```

The integration harness refuses any DB name other than `earth_intelligence_test`,
uses generated test identities/temp files, and never runs recovery against the
development session DB. Tests use deterministic labeled providers, no paid keys.
CI exercises Rust and actual OS network-denial checks on macOS and Linux
x64/ARM64; Linux x64 also runs database and native CLI integration. Baseline Earth CI continues to cover Windows separately.

Quit the foreground daemon and Node service with Ctrl-C. Stop only the dedicated
development database with `npm run earth:db:stop`; volumes are retained. Do not
delete user databases, broadly prune Docker or kill unrelated service processes.
