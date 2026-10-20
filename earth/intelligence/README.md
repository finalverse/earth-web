# Earth Intelligence · v0.5 development preview

A native Rust `earth` CLI and an authenticated, local `earthd` runtime. Chat,
spatial analysis and approved coding operations share durable PostgreSQL sessions.
The existing Node Earth service remains the geographic authority.

This is a **local developer foundation**, not a public inference service or an
autonomous coding agent. It does not change the public v0.3 deployment.

Start with the [developer guide](../../docs/earth/intelligence/developer-guide.md).

```sh
cargo build --locked --manifest-path earth/intelligence/Cargo.toml
cargo test --locked --manifest-path earth/intelligence/Cargo.toml
cargo clippy --locked --manifest-path earth/intelligence/Cargo.toml --all-targets -- -D warnings
```

Requires Rust 1.92+, PostgreSQL and an unprivileged dedicated database role.
Optional local Ollama enables inference; no cloud adapter or API key is required.
The separately installed Node 24 binary is needed only for approved JavaScript
tests. macOS and Linux x64/ARM64 are the supported initial development targets;
Windows coding is deliberately unavailable until a verified sandbox exists.

Read the [architecture and protocol](../../docs/earth/intelligence/architecture.md),
[security review](../../docs/earth/intelligence/security.md),
[acceptance/performance report](../../docs/earth/intelligence/acceptance.md), and
[v0.6 roadmap](../../docs/earth/intelligence/roadmap-v06.md).
