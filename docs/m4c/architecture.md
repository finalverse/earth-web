# M4-C — Experience Intelligence & Visual Excellence

Date: 2026-10-29. Scope: local Core/FEN and the existing Earth Web experience player. This extends accepted M4-B; SIL, EL, EC, EK, Cesium and immutable publication remain the platform boundaries.

## Intent to experience

`Human intent → EI semantic Intention → typed EL proposal → EC validation → isolated preview → exact-hash authorization → EK execution → private save → explicit immutable publication`

EI now produces a bounded semantic recipe: title, description, lighting, approved material palette, visual intensities, approved audio gains and source waypoint IDs. Models cannot select executable code, permissions, licenses, arbitrary assets or world commands. Host lowering derives ordered EL modifications and their permission/capability declarations. EC validates the result against the unchanged root document, approved catalog, source bindings and policy. EK still gates saving through its existing authorization/history machinery.

`CreativeStep` declares operation, capability, permission, affected resources, input hash, typed parameters, prior-step dependency, validation requirements, reversibility and provenance. The step list must equal the deterministic projection of the proposal's modifications. It is inspectable execution metadata, not a parallel workflow engine. Optional visual/waypoint/step fields use serde defaults and omit empty values, preserving older canonical documents and proposal hashes.

## Existing provider inspection and reuse

Inspected, without modifying:

- `/Users/wenyan/ClaudeProjects/maple/crates/maple-model-router/src/lib.rs`
- `/Users/wenyan/ClaudeProjects/maple-chat/crates/maple-chat-providers/src/openai_compatible.rs`
- `/Users/wenyan/ClaudeProjects/maple-chat/crates/maple-chat-providers/src/ollama.rs`
- `/Users/wenyan/ClaudeProjects/hermon/crates/hermon-core/src/provider.rs`
- `/Users/wenyan/ClaudeProjects/hermon/crates/hermon-core/src/ollama.rs`
- Existing EI `Provider`, FEN creator and EK authoring contracts in the accepted Core worktree.

The Maple router's synchronous transport and implicit fallback do not fit cancellable HTTP planning with explicit failure. Chat adapters also return UI streaming types. Reused the protocol patterns behind EI's existing intention boundary, adding narrow FEN transport adapters and EI semantic lowering. No provider framework, repository, dependency or replacement kernel was added.

Supported protocols: OpenAI-compatible `/chat/completions` with strict JSON schema, Ollama `/api/chat` with schema format, and explicit deterministic `creative-fixture`. Existing M4-B `fixture` and `configured` paths remain. Configurable protocol, endpoint, model, auth and timeout are server settings. Discovery uses `/models` or `/api/tags`, bounded to 32 model identifiers/256 KiB/3 seconds.

Requests have a 2-second connection timeout, 90-second default per-request timeout (configurable 50–180000 ms), at most one retry for unavailable/rate-limit failures, 100 ms backoff, 32 KiB context, 1 MiB response, and 900 generated-token request limit. Cancellation drops the HTTP future through SIL's token; request leases are bounded to eight and released on completion. Provider failures are classified, never converted into fixture success. Receipts distinguish requested and reported model, real inference, attempts, actual latency, optional provider-reported tokens and semantic intention hash.

Only loopback HTTP or HTTPS endpoints are allowed. Remote endpoints require explicit bearer authentication and per-generation remote-context consent. URL credentials, queries, fragments, redirects and ambient proxies are refused. `auth=none` discards stale token environment values. Tokens are server-only headers; registry credentials never enter model context. Remote discovery can contact the configured provider after authenticated probe, but sends no experience context. Structured output is still untrusted and parsed/validated locally.

Bounded context contains the user request, experience ID, source root, current authored recipe, at most four approved public anchor IDs with generic labels, approved audio identifiers, capabilities, interaction IDs and provenance constraints. It excludes raw geometry/audio, registry credentials and private revision history. The browser shows destination and context before remote creation.

Protocol references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Ollama chat API](https://docs.ollama.com/api/chat). Wire compatibility was verified with local mocks; only Ollama was exercised with an actual model.

## Iterative authoring and lineage

Each draft keeps up to 16 immutable proposal/recipe/provider revisions and a cursor. Refinement uses current recipe context and an optimistic exact proposal hash, validates against the unchanged root, clears approval and requires preview again. Undo/restore select revisions and also clear approval. Saved editions refuse further refinement. Reject/cancel release the draft. Existing accepted version restoration stays in EK.

Private save persists a content-addressed revision journal next to the private version; the journal is not published. Public editions contain only the exact approved proposal/version and immutable parent publication. Restart-to-library UI for private journals is deferred. The minimal `creative_graph` response is a projection of existing source publication, creator, audio assets, effects, materials and waypoints. It introduces no graph storage or alternative lineage authority.

New creator endpoints: authenticated `GET /api/v1/creator/providers[?probe=1]`, `POST /api/v1/creator/cancel-request`, and `POST /api/v1/creator/{id}/refine`. Existing actions now include draft `undo`/`restore`; exact-hash preview, approval, save, publish, reject and cancel remain. Unknown fields fail closed.

## Visual and audio presentation

The existing Cesium renderer loads the same 139 source GLBs. Fixed host-authored material shaders supply stable facade color variation, masonry/window patterns, emissive windows, roof/snow differentiation, ground/road paving, bounded roughness/specular treatment, haze and four street-light falloffs. Ground/sidewalk treatment is a graphic overlay where approved source categories exist, not newly surveyed sidewalk geometry. Palette choices are winter stone, heritage stone, copper/glass and midnight neon. Lights/decorations are authored from approved spatial bounds, without editing source geometry or identity.

Cesium directional/ambient lighting, exposure, ACES tone mapping and optional bloom provide composition. Snow is a bounded screen-space authored particle effect; haze is shader depth treatment. These are stylized presentation, not observed weather, reconstructed building detail or physically accurate global illumination.

Quality tiers adjust resolution, particle count, decorations, bloom and 30/60 FPS targets. Reduced-motion branches use static snow and immediate camera changes. Opening composition, explicit district/lane/roof viewpoints, selected-source focus, reset and optional guided views retain the current camera on refinement. Pointer/wheel input and creator typing stop guided movement. Visual-first layout collapses creator/provenance/diagnostics; mobile creator sits below the scene.

Approved Sonic-compatible original audio is reused with recipe gains and short gain ramps. Preview/refinement stops playback and requires a fresh Play action. Quality changes preserve existing consent. No inference or network work enters an audio callback. Resource ownership covers models, shaders, decorations, URLs, timers, observers, animation frames, fetches, audio and viewer teardown. Performance reports separate CPU submission, animation callbacks and unavailable GPU timing.
