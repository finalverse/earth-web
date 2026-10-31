# M5 reproduction and local preview

2026-10-29. The local preview is **http://127.0.0.1:57454/**. Choose a template, Explore, Make It Mine, use a quick action, Save personal version, then Share and explicitly confirm. No prompt, account, model setup or developer credential is needed. Audio starts only on Play. Guest drafts last 30 minutes; links last at most one hour or until restart. A recipient selects Make Your Own to create a separately authorized temporary derivative.

## Source/build checks

```sh
cd /Users/wenyan/Finalverse/dev/worktrees/core-m5-20261029
export CARGO_TARGET_DIR=/Users/wenyan/Finalverse/dev/worktrees/core-m2-20261027/target
export CARGO_INCREMENTAL=0
cargo test --offline -p fen --test m5
cargo test --offline -p fen --test m4c approved_context_omits_credentials_raw_assets_and_private_history
cargo clippy --offline -p fen --lib -- -D warnings
cargo fmt --all -- --check
cargo build --offline --release -p fen
python3 scripts/check_m5_evidence.py docs/m5/evidence

cd /Users/wenyan/Finalverse/dev/worktrees/earth-web-m5-20261029
node --test experience-player/test/m5.test.mjs experience-player/test/m4c.test.mjs
FEN_EARTH_DEPENDENCIES=/Users/wenyan/Finalverse/earth-web/node_modules node experience-player/build.mjs
```

Tests use local fixtures/mocks and frozen capture times; no paid/live inference is required. Do not rerun full historical M4-C/native acceptance. Installed Node 22.18.0 was used for this standalone target, not the larger root application build.

## Service ownership and restart

The owned FEN process ID is recorded in `/Users/wenyan/Finalverse/dev/m5-20261029/fen.pid`. Stop only that process with SIGINT (verify it still names this FEN listener before signaling). Stopping invalidates all temporary guest links. Do not stop the pre-existing Ollama service or remove model weights.

Use the retained owner-only registry/token files and approved read-only catalog to restart:

```sh
FINALVERSE_EI_PROTOCOL=ollama \
FINALVERSE_EI_ENDPOINT=http://127.0.0.1:11434 \
FINALVERSE_EI_MODEL=qwen2.5-coder:3b \
FINALVERSE_EI_AUTH=none \
/Users/wenyan/Finalverse/dev/worktrees/core-m2-20261027/target/release/fen \
  --root /Users/wenyan/Finalverse/dev/m5-20261029/registry-final \
  --catalog /Users/wenyan/Finalverse/dev/fen-20261028/catalog \
  --web-root /Users/wenyan/Finalverse/dev/worktrees/earth-web-m5-20261029/experience-player/dist \
  --publisher-token-file /Users/wenyan/Finalverse/dev/m5-20261029/publisher.token \
  --admin-token-file /Users/wenyan/Finalverse/dev/m5-20261029/admin.token \
  --bind 127.0.0.1:57454
```

The server binds only loopback. The original approved publication is durable in this registry; temporary guest editions are not. Existing installed Ollama `qwen2.5-coder:3b` is optional. Without a model, omit the EI environment configuration and use the complete instant path. Guest remote inference is disabled; the separate privileged M4-C adapter remains available for its authorized local workflow. Never put role credentials into browser guest flows, URLs, source or reports.

For a new empty registry, create new private token files with `fen --init-token NEW_FILE` and publish the approved catalog's `publish-request.json` once using host publisher authorization. The default landing screen opens that available original. Do not use a public bind or expose developer role credentials to visitors.

## Repeat the HTTP checks

```sh
cd /Users/wenyan/Finalverse/dev/worktrees/core-m5-20261029
python3 scripts/review_m5.py \
  --endpoint http://127.0.0.1:57454 \
  --publisher-token-file /Users/wenyan/Finalverse/dev/m5-20261029/publisher.token \
  --output /absolute/scratch/new-m5-http-review
```

The output directory must not exist. The helper expects the single original public registry entry, uses new bounded guest sessions, closes its sessions in normal/error exit, and leaves only temporary read editions until expiry. Its ownership checks compare to pre-run counts so it does not claim other visitors' resources. It does not invoke a model. Allow the global session-issuance window to reset if running many copies quickly.

## Reproduce the automated UI journey

`experience-player/review-journey.mjs` exports `runM5Journey` for the Codex CUA runtime. It uses only supplied CUA tab methods, not hidden app APIs or synthetic success states. Import it in cua_repl and supply an owned loopback tab factory and optional screenshot/record callback. For mobile, create an about:blank tab, apply the documented viewport capability at 390×844, then navigate, so initial device selection is measured at that width. Desktop reference is 1280×720. Reset temporary viewport overrides and close returned test tabs afterward.

```js
const {runM5Journey} = await import('file:///Users/wenyan/Finalverse/dev/worktrees/earth-web-m5-20261029/experience-player/review-journey.mjs');
const result = await runM5Journey({
  origin: 'http://127.0.0.1:57454',
  newTab: url => cua.createBrowserTab('2', url, {visible: false}),
});
// Save result without its live `tabs` handles; close those handles after review.
```

Use the selected browser ID from the current CUA inventory rather than assuming this machine's `2` on another installation. The script measures the whole journey, verifies fresh document isolation and closes previews. It is not a first-time-human study. The evidence checker only verifies captured receipts/hashes; it does not claim to rerun the browser or profile the GPU.

Optional AI review: choose Cyberpunk, Make It Mine, expand local AI, confirm the displayed bounded-context destination, request “Give this futuristic night the title Neon Reverie. Make the original musical atmosphere softer. Keep source buildings and approved assets unchanged.” Review the actual grounded description before authorizing a share. Test an impossible floating-city/deletion request for refusal; cancel a separate live request to verify no late mutation.
