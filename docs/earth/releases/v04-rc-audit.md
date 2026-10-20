# v0.4 RC architecture audit

Audited 2026-10-19 from `f6f8f7f65e6b64028db01eb192f3738e067e2c0b` on
`codex/earth-v04-platform`; RC work uses `codex/earth-v04-rc`.
Origin main was `27380d9bedb6d2496eb017ff3f38b2bb7c984698`: three commits
behind, no conflicting main commits. The maintained upstream source remains
pinned to `93ea088f4556a5a65b3292a2d15142d5a6c562bc`.

## Findings and disposition

| Area | Source evidence | Finding / RC response |
|---|---|---|
| Local AI | `earth/server/planner.js` | Loopback URL validation did not prevent HTTP redirects. Reject redirects for both discovery and planning; test an actual redirect target receives no requests. |
| SDK transport | `packages/earth/src/client.ts` | Default redirect following could move queries to an unreviewed origin. Reject redirects; retain typed transport errors and cancellation. |
| Workspace | `earth/core/workspace.js` | Receipt field accepted arbitrary JSON despite the declared receipt type. Validate existing v0.3/v0.4 receipt shape. Import never executes plans; receipt contents remain unsigned, editable evidence. |
| Permissions | `earth/platform/applications.js`, `earth/server/http.js` | Operator grants intersect requested capabilities, datasets, tools and budgets server-side. App ID is a scope selector, not authentication. No permission escalation found in inspected paths. |
| Browser trust | `earth/platform/manifest.js` | Only trusted same-origin applications are supported. Local storage namespaces do not isolate hostile same-origin JavaScript. Untrusted plugins/private tenant data are out of scope. |
| Data/SQL | `earth/db/store.js`, migrations | Parameterized queries, dedicated Earth database guard, non-owner runtime role and row policy. Retain existing isolation tests. |
| Query bounds | core, HTTP, SDK | 100 output features, complete-selection clustering, 16 KiB query bodies, two planners, API rate and socket/time budgets. Measure local concurrency without bypassing these bounds. |
| Provider policy | planner/router | Explicit local-only provider, bounded responses, no cloud fallback; public-origin configuration refuses AI. Model nondeterminism is a known fail-closed limitation. |
| Product | independent Energy app | Discovery/analysis operate without AI. Disable Propose when no verified local provider is available. Keep source dates, attribution and unsigned-import notices. |
| Backend parity | `earth/core/spatial.js` | Generic query truncation depended on storage order. Sort source IDs before limiting; regression uses reversed input and bounded-load checks compare both backends. Temporal collection order remains unspecified. |
| Test ownership | Earth/app/SDK test scripts | The inherited all-`.test.mjs` discovery audit conflicted with separately run platform suites. Align owned suites with existing Earth `.test.js` convention and keep explicit CI commands; inherited source and runner remain unchanged. |
| Contracts | `earth/contracts/build.mjs`, platform tests | Generated OpenAPI and SDK share actual tool definitions. Workspace operations are local SDK operations, not invented server endpoints. |
| Distribution | SDK/app pack scripts | SDK and app packages existed; full server bundle, SBOM, independent staging and rollback evidence were missing. Add explicit release tooling and local rehearsal. |
| Deployment | `earth/deploy/` | Existing public service remains v0.3, AI off. RC stages only on loopback; production service unit and router are not changed. |
| CI | `.github/workflows/earth.yml` | Existing Mac/Linux/Windows and database jobs passed for baseline; RC needs its own runs. No historical CI result may be relabeled as an RC pass. |

## Compatibility

API v1 and schema-1 workspaces remain supported. A valid v0.3 receipt remains
readable. Malformed receipts previously tolerated by the local validator now
fail import before persistence; missing/invalid evidence must be repaired by
its author, not silently presented as a valid execution. No automatic import
execution or privileged browser credentials are introduced.

## Baseline and remaining gates

Current-machine baseline: core 40 passed / two database-dependent skips,
platform/SDK 18 passed, independent app five passed. Database tests, load,
extracted full application, rollback and current browser checks require fresh
RC evidence. Detailed gate disposition belongs in the RC validation report.

The release is a public-data preview, not an authenticated multi-tenant host,
untrusted application sandbox, signed attestation service or unrestricted AI
endpoint. v0.5 Rust runtime implementation is a separate milestone after RC
readiness; it is not included in this audit or RC scope.
