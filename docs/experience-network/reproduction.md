# Reproduce the local distribution slice

The acceptance services are stopped. Evidence URLs are historical loopback locations, not public hosting.

## Build

From /Users/wenyan/Finalverse/dev/worktrees/core-fen-20261028:

    cargo fmt --all -- --check
    CARGO_TARGET_DIR=/Users/wenyan/Finalverse/dev/worktrees/core-m2-20261027/target CARGO_INCREMENTAL=0 cargo test -p fen --offline
    CARGO_TARGET_DIR=/Users/wenyan/Finalverse/dev/worktrees/core-m2-20261027/target CARGO_INCREMENTAL=0 cargo clippy -p fen -p el --all-targets --offline -- -D warnings
    CARGO_TARGET_DIR=/Users/wenyan/Finalverse/dev/worktrees/core-m2-20261027/target CARGO_INCREMENTAL=0 cargo build --release -p fen --offline

From /Users/wenyan/Finalverse/dev/worktrees/earth-web-fen-20261028:

    node --test experience-player/test/*.test.mjs
    FEN_EARTH_DEPENDENCIES=/Users/wenyan/Finalverse/earth-web/node_modules node experience-player/build.mjs

The optional dependency path selects existing installed dependencies; no absolute dependency is committed. Omit it in a normal checkout with dependencies installed. The build checks Cesium 1.138.0 and copies its browser distribution/license into ignored experience-player/dist/. The full Earth Web application's existing Node requirements/build are unchanged.

## Derive an approved catalog

Use a new output directory whose parent exists, from Core:

    python3 scripts/prepare_network_reference.py \
      --publication /Users/wenyan/Finalverse/dev/urban-p19-20261027/offline-final/publication-1/scene-publications/09946919b5bf53526eea44ad7938323785094f48a5aac48529aa628b544823fc.json \
      --objects /Users/wenyan/Finalverse/dev/urban-p19-20261027/offline-final/publication-1/objects \
      --output /absolute/new-approved-catalog

This reads the accepted CAS without starting SpatialDB or changing source. It refuses changed hashes, missing identities or unestablished source redistribution metadata. It writes approved assets, preview metadata, a publish request and receipt.

## Start and review an owned registry

Set FEN to the built target/release/fen path. Create two new token files using "$FEN" --init-token FILE. Values are not printed; do not put them in arguments or URLs.

    "$FEN" --root /absolute/new-registry \
      --catalog /absolute/new-approved-catalog \
      --web-root /Users/wenyan/Finalverse/dev/worktrees/earth-web-fen-20261028/experience-player/dist \
      --publisher-token-file /absolute/publisher.token \
      --admin-token-file /absolute/admin.token \
      --bind 127.0.0.1:0

The server prints its OS-assigned Local URL. Non-loopback binds are refused. Credentials must be distinct and owner-only.

From Core, use the printed URL, a fresh unpublished registry and new evidence directory:

    python3 scripts/review_experience_network.py \
      --endpoint http://127.0.0.1:PRINTED_PORT \
      --publisher-token-file /absolute/publisher.token \
      --admin-token-file /absolute/admin.token \
      --request /absolute/new-approved-catalog/publish-request.json \
      --output /absolute/new-http-evidence

This publishes the public reference, verifies links/assets, then tests a separate private version and unavailability. It leaves the public reference available. Identical public publishing is idempotent; unavailable private test versions are not resurrected, so use a fresh registry for a complete review rerun.

Open the printed share URL. Select an entity, inspect attribution/provenance, press Play, and Share the exact edition/selection. A recipient gets fresh playback consent. Close preview disposes owned resources. Ctrl+C drains the owned server and exits cleanly; data remains.

## Check stored evidence

    python3 scripts/check_network_evidence.py \
      docs/experience-network/evidence/http-review.json \
      docs/experience-network/evidence/browser-review.json \
      docs/experience-network/evidence/catalog-preparation.json

Retained catalog/registries are under /Users/wenyan/Finalverse/dev/fen-20261028. No deployment or public exposure was performed.
