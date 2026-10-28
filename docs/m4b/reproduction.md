# Run M4-B locally

Use the existing repositories and pinned Rust 1.99.1. Current acceptance servers are stopped; loopback addresses in evidence are historical.

## Build and targeted checks

From `/Users/wenyan/Finalverse/dev/worktrees/core-m4b-20261028`:

    CARGO_TARGET_DIR=/Users/wenyan/Finalverse/dev/worktrees/core-m2-20261027/target CARGO_INCREMENTAL=0 cargo test -p fen --test creator --offline
    CARGO_TARGET_DIR=/Users/wenyan/Finalverse/dev/worktrees/core-m2-20261027/target CARGO_INCREMENTAL=0 cargo clippy -p fen -p ei -p ek -p ec -p el --all-targets --offline -- -D warnings
    CARGO_TARGET_DIR=/Users/wenyan/Finalverse/dev/worktrees/core-m2-20261027/target CARGO_INCREMENTAL=0 cargo build --release -p fen --offline
    cargo fmt --all -- --check
    python3 scripts/check_m4b_evidence.py docs/m4b/evidence

From `/Users/wenyan/Finalverse/dev/worktrees/earth-web-m4b-20261028`:

    node --test experience-player/test/*.test.mjs
    FEN_EARTH_DEPENDENCIES=/Users/wenyan/Finalverse/earth-web/node_modules node experience-player/build.mjs

The standalone build reuses installed Cesium 1.138.0; it does not require installing the full Earth app or changing its Node requirements.

## Launch a new owned registry

Use a new scratch directory. The approved read-only catalog remains at `/Users/wenyan/Finalverse/dev/fen-20261028/catalog`; its source preparation is documented in the accepted M3-C/M4-A reproduction report. Create separate new owner-only publisher/admin files with `fen --init-token NEW_FILE`; values are not printed. Never put credentials into command arguments, links or source code.

Run the built binary with:

    fen --root /absolute/new-registry \
      --catalog /Users/wenyan/Finalverse/dev/fen-20261028/catalog \
      --web-root /Users/wenyan/Finalverse/dev/worktrees/earth-web-m4b-20261028/experience-player/dist \
      --publisher-token-file /absolute/publisher.token \
      --admin-token-file /absolute/admin.token \
      --bind 127.0.0.1:0

Use the printed OS-assigned port. Non-loopback bindings are refused. From Core, against this fresh registry and a new output directory:

    python3 scripts/review_m4b.py \
      --endpoint http://127.0.0.1:PRINTED_PORT \
      --token-file /absolute/publisher.token \
      --request /Users/wenyan/Finalverse/dev/fen-20261028/catalog/publish-request.json \
      --output /absolute/new-m4b-http-evidence

The helper checks owned health before mutation, bypasses environment proxies for loopback, and creates the public original plus its approved Winter Festival derivative. Its direct-publication negative check needs a fresh registry without a saved receipt. Repeating it against an already-approved registry is not the same test. No token values are printed.

Open the original share path on the printed origin:

    /x/montreal-after-dark/16f19110720a52c4a0a02567c2f070286b88e022de90a3ad66470287eb63ebea

Expand Local creator access and enter the publisher credential. Keep Offline deterministic ideas selected. Use Winter festival, Create a plan, Preview changes, Compare original, Back to my preview, Approve this plan, Save version, then Publish & share. Press Play independently to consent to audio. Open the copied link in a new tab; no creator credential, approval or playback is inherited. Restore original version changes the local draft pointer; immutable published versions remain available. Reject draft or Close preview releases temporary resources.

Optional model adapters: host `FINALVERSE_EI_ENDPOINT` serves the existing `ei::Request` → strict `CreationProposal` JSON contract. Use loopback HTTP for local inference or HTTPS for remote inference, with no URL credentials/query/fragment. Optional `FINALVERSE_EI_TOKEN` stays in the host environment. Select Host-configured model explicitly in the UI. No real model was exercised during acceptance; raw model APIs require an adapter, not just an API key.

Stop the owned service with Ctrl+C. It drains handlers and prints `FEN shutdown complete`. Keep its registry for local saved histories and immutable publications. The accepted delivery registry is `/Users/wenyan/Finalverse/dev/m4b-20261028/registry-delivery`; intermediate candidate registries/evidence are retained separately. No public hosting is configured.
