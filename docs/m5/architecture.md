# M5 — Smart Experience Engine & Instant Creation

2026-10-29 · local Core/FEN and Earth Web implementation.

## Composition within the existing platform

`Discovery → SEE template/context composition → typed EL proposal → EC validation → preview → exact-hash user authorization → EK save → temporary guest edition`

SEE is implemented in existing crates: data contracts in `el::smart`, deterministic composition/cache/recommendation in `fen::smart`, and bounded guest hosting in `fen::guest`. EI's existing context gets one optional smart-template field; the M4-C model transport, EC policy, EK history and immutable publication compiler are reused. No crate, provider framework, graph database, alternate authorization engine or rendering backend was introduced.

`finalverse.smart-template/v1` contains identity/version, creator/provenance/license, title/description, authored style-preview metadata, environment compatibility, required/optional capabilities and explicit fallbacks, approved asset pins, visual/audio/camera/interaction composition, adaptation rules, performance budget, bounded parameters, editorial rank and publication/extraction policy. A pin is `{id, version, digest}` with a canonical content hash. Resolution requires the exact curated pin. Shares seal the complete template definition, rather than looking up mutable defaults when reopened. Template curation is reviewed host code, not a guest upload endpoint.

`finalverse.environment-context/v1` separates observed source facts from authored selection and simulated effects. Observed data comes from the approved catalog: publication/root, actual geometry-class/status counts, sorted identity digest, asset pins and host-supported capabilities. The context does not interpret 139 source entities as 139 surveyed buildings. Environmental observations are empty: no Terra weather query was added. Season/time are artistic choices; snow/haze are labeled `authored_simulation`. Device flags are presentation hints, not service authorization. Unsupported required capabilities make a template incompatible; absent device audio selects silence, low quality reduces effects/resolution, and reduced motion uses static particles/immediate camera.

Six static curated specifications reuse approved Sonic audio and the M2 light specification. Different lighting, snow/haze, material treatment, sound mix, camera/guide cadence, waypoint count and decorative-light policy distinguish them. Jazz Night uses original synthesized music with jazz-inspired staging; it does not claim a jazz recording. CSS poster art is explicitly an authored style preview. Native screenshots show the actual scene separately.

Recommendations are deterministic: environment/capability compatibility, device suitability, editorial rank and optional explicit template interests. All six fit this reviewed district's supported profile. There is no inferred preference, visitor identifier collection or hidden behavioral ranking.

## Instant plans and contextual personalization

No model request occurs in template application or eight quick actions. A bounded cache retains at most 64 compiled plans keyed by immutable base version, exact template pin, context and optional inherited public recipe. EC/EK preview validation still runs when a cached plan is installed. Geometry, 139 model objects, shaders and approved asset manifests stay in the existing viewer on a switch. Client epochs reject obsolete server mutations; pending fetches are aborted and late model commits are refused.

Quick controls deterministically change supported values, produce a newly validated proposal, and clear the saved authorization. Save explicitly approves the exact preview hash through existing EK history. Share requires a saved exact version and a separate consent checkbox; the combined share action can perform that exact save after consent.

Optional guest AI uses only the host-configured local M4-C adapter. Context adds the selected template pin, typed environment, approved ranges and current recipe; it excludes guest credentials, share capabilities, raw geometry/audio and private history. Remote guest inference is disabled. Real receipts carry requested/reported model, actual latency, provider-reported tokens and raw intention hash. The share also retains an effective intention hash and model attribution.

Model prose is not a statement of rendered facts. After device/range adaptation, the compiler derives the publication description from the actual lighting, palette, warmth, haze, snow and audio settings. The creative title and bounded values can come from AI. This closes a quality issue seen during review: generated prose described changes absent from its own typed values. Host grounding is disclosed in adaptations and does not substitute a fixture for a failed model request. Request/schema/provider failures remain visible.

## Guest trust and retention boundary

Visitors explore without credentials. Starting an approved template issues a random temporary guest bearer credential kept only in that document's memory. It is not a publisher/admin key, cookie, URL parameter or localStorage entry. Guest transport authentication scopes access to a single personal draft; EC/EK remain the proposal authorization/execution authorities.

A guest gets one draft, 120 mutations, three share requests and two local-model requests over a fixed 30-minute session. Service limits are 64 sessions, 12 session creations/minute, 128 temporary shares, 24 guest model requests/hour and two concurrent guest model jobs. Guest write bodies are limited to 16 KiB. The model adapter retains its connection/request/response/context/token limits and classified errors. Cancellation owns a SIL token plus an HTTP lease; cancellation, supersession, expiry and dropped handlers prevent late commits. A weakly owned 30-second sweep releases expired sessions/jobs/shares.

Temporary shares are in memory, expire within one hour or at service restart, and never enter the durable publisher catalog. They reuse the approved publication compiler with an EK-produced version; no guest path calls `Registry::publish` with Publisher privileges. Immutable parent/source/asset attribution is retained. A recipient gets a new credential only after Make Your Own, inherits the approved public recipe and creates a separately authorized derivative. Lineage is capped at eight; a child cannot outlive its temporary parent. Denied/private/unavailable parents cannot be used. Publishing does not enable automatic template extraction.

Read links are separate random capabilities; the server stores their hashes. A read capability cannot authorize guest writes. Expiry denies future metadata/asset requests with 410; it cannot recall bytes already delivered to a recipient. Anonymous drafts confer no account ownership or durable hosting. Durable authenticated creator/account/asset management is not introduced here; the privileged local M4-C publisher workflow remains separate. These process-local limits and loopback-only binding are not an Internet-scale abuse-prevention service.

Same-origin write checks, CSP, no-referrer policy, bounded schemas, approved bytes/licenses and original source identity checks remain. No model-supplied script, shell, asset URL, world command or permission escalation is executed.
