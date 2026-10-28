# M4-C reproduction

Date: 2026-10-29. These commands are local only. Both branches remain unmerged/unpushed. Do not run historical M4-B/native acceptance as part of this recipe.

## Build and targeted verification

Core worktree `/Users/wenyan/Finalverse/dev/worktrees/core-m4c-20261029`, web worktree `/Users/wenyan/Finalverse/dev/worktrees/earth-web-m4c-20261029`. Use pinned Rust 1.99.1 and existing dependencies; no install is required on this machine.

```sh
cd /Users/wenyan/Finalverse/dev/worktrees/core-m4c-20261029
export CARGO_TARGET_DIR=/Users/wenyan/Finalverse/dev/worktrees/core-m2-20261027/target
export CARGO_INCREMENTAL=0
cargo test --offline -p fen --test m4c
cargo clippy --offline -p fen --lib -- -D warnings
cargo fmt --all -- --check
cargo build --offline --release -p fen
python3 scripts/check_m4c_evidence.py docs/m4c/evidence

cd /Users/wenyan/Finalverse/dev/worktrees/earth-web-m4c-20261029
node --test experience-player/test/*.test.mjs
FEN_EARTH_DEPENDENCIES=/Users/wenyan/Finalverse/earth-web/node_modules node experience-player/build.mjs
```

The standalone tests/build ran with Node 22.18.0. This does not claim compatibility/build acceptance for the larger root Earth application, whose Node engine requirement is newer. Existing installed Prettier can check only the changed player files; no package update is needed. Source and generated player files must match `evidence/artifacts.json` before reproducing the screenshots.

## Reopen retained local editions

The owned review server has stopped. Retained registry/CAS and private token files are outside Git under `/Users/wenyan/Finalverse/dev/m4c-20261029`. Existing approved catalog is read-only at `/Users/wenyan/Finalverse/dev/fen-20261028/catalog`.

For actual local model creation, the already-installed Ollama service must expose `qwen2.5-coder:3b`. No automatic installation/download/cloud model selection is performed. Start the server explicitly:

```sh
cd /Users/wenyan/Finalverse/dev/worktrees/core-m4c-20261029
FINALVERSE_EI_PROTOCOL=ollama \
FINALVERSE_EI_ENDPOINT=http://127.0.0.1:11434 \
FINALVERSE_EI_MODEL=qwen2.5-coder:3b \
FINALVERSE_EI_AUTH=none \
/Users/wenyan/Finalverse/dev/worktrees/core-m2-20261027/target/release/fen \
  --root /Users/wenyan/Finalverse/dev/m4c-20261029/registry-final \
  --catalog /Users/wenyan/Finalverse/dev/fen-20261028/catalog \
  --web-root /Users/wenyan/Finalverse/dev/worktrees/earth-web-m4c-20261029/experience-player/dist \
  --publisher-token-file /Users/wenyan/Finalverse/dev/m4c-20261029/publisher.token \
  --admin-token-file /Users/wenyan/Finalverse/dev/m4c-20261029/admin.token \
  --bind 127.0.0.1:55926
```

Append one of these paths to `http://127.0.0.1:55926`:

- Original: `/x/montreal-after-dark/16f19110720a52c4a0a02567c2f070286b88e022de90a3ad66470287eb63ebea`
- Refined fixture: `/x/montreal-after-dark/18c91c65962d51dbae56a6e830d108270438045b81c55aeff56b658e7e6906b3`
- Real model: `/x/montreal-after-dark/0f6cb2bd4f09444f684fb2566abae18051c22a58d62e67a632a47eee05111bd4`

Links require the local service; they are not publicly hosted. A visitor opens without a token and must press Play for audio. Creator actions require the private publisher token in the Local creator access disclosure; it stays in tab memory. Do not put it in a URL, screenshot, report, source file or shell argument. Close clears the draft and resources; reopening is a new app document, not an account/session migration. Ctrl+C gracefully drains FEN. Do not stop the user's pre-existing Ollama service.

## Offline HTTP verification with fresh storage

For a repeatable fresh run, create a new owner-only scratch directory and new registry root, using `fen --init-token NEW_FILE` twice to create owner-only publisher/admin token files. Use the same approved catalog, web root and loopback bind. The HTTP review script publishes the original approved catalog request, creates/refines an offline proposal and verifies the resulting immutable edition. It expects a fresh registry. Provider discovery in that particular review requires the configured local model to be available; it does not run paid/model inference itself.

```sh
python3 scripts/review_m4c.py \
  --endpoint http://127.0.0.1:55926 \
  --token-file /absolute/private/publisher.token \
  --output /absolute/scratch/new-http-review
```

`--output` must not already exist. The source catalog path in the local review helper is machine-specific and deliberately points to the accepted read-only catalog. Do not use a public endpoint. Pure automated Rust/Node tests use mocks/fixtures and need no live provider.

## Provider alternatives and review steps

For an OpenAI-compatible endpoint, set `FINALVERSE_EI_PROTOCOL=openai`, an explicit endpoint base (for example a local `/v1` base), model and auth. The adapter appends `/chat/completions` and `/models`. Loopback permits explicit `none`; remote requires HTTPS and `bearer`, with `FINALVERSE_EI_TOKEN` supplied privately to the process environment. The browser shows the remote destination/context and requires consent before transmitting an intention. Never commit secrets. Servers/models must support the structured-output schema; unsupported requests fail visibly with no fixture fallback. Live remote and local OpenAI-compatible inference have not been verified.

Select the explicitly labeled offline provider to reproduce Winter Festival. Generate, preview, compare original, approve, then refine “Make the lighting warmer, reduce the snow and add a softer musical atmosphere.” Observe the cleared approval, undo/restore, preview again, approve, save, explicitly publish and open Share in a new tab. Generated proposals alone never play audio. Verify original source disclosure and independently press Play in the recipient. Model mode uses the same path and displays its actual provider receipt. Cancel while planning and Close after playback to inspect zero owned resources in local diagnostics.

Captured screenshots and receipts, their SHA-256 seal, and artifact/source hashes are under `docs/m4c/evidence/`. The evidence checker cross-checks existing captures without contacting a service or requesting inference. It does not claim to re-execute the browser, GPU profiling or native acceptance.
