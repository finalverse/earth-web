# v0.5 implementation baseline

Started 2026-10-20 from clean main `d06857c1efd6a62436129092b5b0327a342fcc42`.
GitHub's compare API reports **19 ahead / zero behind** maintained main
`de2138e84c1778fd98a48b7c9fd0b9788c318946`. Fork parent is
`finalverse/gods-eye-view`. The prior 158 commits are merged, not cherry-picked
or hidden through history rewriting.

Both CI workflows passed for this baseline:

- [Independent Earth Core: Mac, Windows, Linux x64/ARM64 and PostGIS](https://github.com/finalverse/finalverse-earth/actions/runs/39398285562)
- [Inherited CI](https://github.com/finalverse/finalverse-earth/actions/runs/39398285559)

Local checks: 8,223 inherited tests pass with one Windows-only skip; 42 core /
23 SDK-platform / five independent app tests pass. Pinned-source verification,
formatting, boundaries, strict builds and extracted application/SDK/rollback
rehearsals pass. v0.4 final release/browser evidence remains separately tracked;
the operator explicitly authorized v0.5 development after upstream consolidation.
No public runtime or v0.4 release promotion is implied.

## Reuse audit

| Existing component | Decision |
|---|---|
| `earth/server/intelligence.js` | Retain v0.4 provider routing and reviewed-plan behavior. New runtime does not replace it. |
| `earth/server/planner.js`, intents | Preserve local-only endpoints, redirect refusal, bounded payloads and grounding lessons. |
| `earth/core`, OpenAPI, grants | Reuse deterministic spatial/temporal execution and receipts through HTTP; add a validation seam rather than duplicating geometry. |
| `packages/earth` | Preserve ESM SDK and portable workspace contract. No Rust/Node private imports in third-party apps. |
| Independent Energy Explorer | Reuse workspace snapshot/receipt/layer shape for explicit browser continuation. |
| Sibling Finalverse agent runtime | Inspected transport, domain/runtime and PostgreSQL store. It binds MutSea citizens and a separate synchronous storage API; do not import that service or its credentials into Earth. |
| Sibling AI gateway | Existing local structured composer is Python and world-specific. Keep it independent; do not make a running world gateway mandatory. |
| Maintained Gemini voice | Inherited application feature, not an Earth Intelligence cloud adapter. No implicit credentials or cloud routing. |

## Foundation boundary

One Rust process provides authenticated sessions, PostgreSQL events/artifacts,
provider routing, approved tools and local browser continuation. A separate native
`earth` binary is its client. Node remains the spatial authority. Browser sharing
is limited to explicitly published spatial artifacts; private coding content is
not automatically exposed. No anonymous coding or public inference listener.

Installed local Ollama models were discovered, including `llama3.2:3b` and
`qwen2.5-coder:3b`; `qwen3.5:cloud` is excluded by local-only policy. Real model
`/api/show` advertises completion and tool capabilities. Only verified adapters
will be implemented; provider availability is optional.
