# M5 acceptance — local engineering delivery

2026-10-29. Implemented the consumer path **Choose → Explore → Make It Mine → Save → Share → Make Your Own**. The default path needs no prompt, account, AI configuration or developer credential. This is a local, bounded guest preview service, not a public launch or a proven market-leadership claim.

## Exact code and worktrees

| Repository | Tested implementation commit | Worktree / branch |
| --- | --- | --- |
| finalverse/finalverse | `d56e4a01a25b7c72cb833881e0395d5547b27d54` | `/Users/wenyan/Finalverse/dev/worktrees/core-m5-20261029` · `feat/m5-smart-experiences` |
| finalverse/earth-web | `ced4a861ddbbba17125818d523b5964603bd3ad6` | `/Users/wenyan/Finalverse/dev/worktrees/earth-web-m5-20261029` · `feat/m5-instant-creation` |

A subsequent local documentation/evidence commit completes each branch. The hashes above identify the tested source; `git rev-parse HEAD` identifies the full delivered branch. Accepted M4-C parents remain `b8d85af7fa72cedec823f424d60ac3a3f7247586` and `b7c1ba017722191d17b22b274f61bdd12130046a`. All eleven protected primary/accepted checkouts remain clean at their original heads; see [preservation receipt](evidence/preservation.json). No merge, push, history rewrite or public deployment was performed.

## Delivered behavior

- Versioned, hashed declarative template contracts, typed observed/authored/simulated context, deterministic recommendations, composition, adaptation and bounded plan cache inside existing EL/EI/EC/EK/FEN boundaries.
- Winter Wonderland, Cyberpunk Montréal, Golden Hour, Jazz Night, Festival of Lights and Quiet Montréal, reviewed as actual 3D scenes at the same District viewpoint. They differ in lighting, atmospheric treatment, mix, camera/guide cadence, interaction and decorative lights, as well as palette.
- Instant template activation, eight deterministic quick controls, responsive discovery, progressive advanced controls, static-view preference, navigation/selection, private temporary save, explicit guest sharing and recipient Make Your Own.
- Bounded temporary guest credentials/drafts/links, expiry/cleanup, quotas, size limits, exact approval, remix/license enforcement and no publisher privilege inheritance.
- Optional real local AI personalization with template/range/environment context, actual provider receipts, grounded effective descriptions, refusal and cancellation.

## New verification

| Verification | Result | Scope |
| --- | --- | --- |
| New Rust M5 tests | **21 passed** | Template integrity/versions/cache, context, adaptation, assets, guest authorization/expiry/quotas, approval, lineage, cancellation, model bounds/provenance and grounded descriptions |
| New Node M5 tests | **12 passed** | Actual edition/derivative reopening, hashes, template rights/parameters, provenance, expiry, simulated labels, camera bounds and device hints |
| Directly affected compatibility checks | **4 passed** | One existing M4-C filtered-context Rust test; three existing presentation/quality/interval Node tests |
| Total targeted tests | **37 passed** | 33 new + 4 affected compatibility checks; historical M4-C/native suites were not rerun or counted anew |
| Live HTTP | **33 checks passed** | Real local template/quick/save/share/recipient flow, privilege and consent failures, stale hashes, preserved source CAS, quota, close and M4-C authoring smoke |
| Evidence consistency | **106 checks passed** | Cross-checks captured HTTP, browser, hashes, lineage, provider receipt, asset closure, viewports and cleanup |
| Build/static checks | Passed | FEN release, targeted Clippy, rustfmt, standalone 403-file player bundle, JS syntax/Prettier, Git whitespace checks |

Core/Web test and build logs are repository-local. [Artifact hashes](evidence/artifacts.json) identify both source commits, the built binary and all bundle files. [Evidence seal](evidence/sha256.json) identifies the captured files.

## Browser journeys and visual review

The reproducible [CUA journey](/Users/wenyan/Finalverse/dev/worktrees/earth-web-m5-20261029/experience-player/review-journey.mjs) in Earth Web drove actual UI controls: open Montréal, select Winter Wonderland, explore/select a real source building, More Magical, authorize/save, consent/share, open a fresh document, verify isolation, Make Your Own, Warmer and a derivative share. Its records are [desktop](evidence/journey.json) and [mobile](evidence/mobile-journey.json).

Desktop **1280×720: 12.545 s**. Mobile-width **390×844: 12.016 s**. Both completed below 180 seconds without model inference or credential entry, including the recipient derivative. All original geometry was ready in **1.081 s / 0.855 s** on the reference machine. These are scripted local runs, including tool/UI pauses and screenshot capture, not first-time-human usability findings. Human usability validation remains pending.

Recipients were fresh app documents in the same IAB profile, with no inherited document-memory guest token, draft or audio consent. They are not claims of incognito, physical-phone or cloud continuity testing. Geometry loads progressively; all 139 models were ready before derivative sharing. Separate recipient checks confirmed no horizontal overflow at 390 px and no camera/waypoint control overlap. After explicit Play, three approved audio sources ran; template switching stopped them and required consent again.

Twelve template activations across two passes retained **139 models, 139 shaders and 139 object URLs**. The gallery used Still views and the same District camera. Eight quick controls changed bounded presentation without inference. All recorded Close stages released owned models, shaders, decorations, timers, observers, frames, URLs, audio, fetches and viewer ownership. These are application counters, not a GPU-driver memory profiler. See [visual gallery](visual-gallery.md), [visual records](evidence/visual-review.json), [interaction records](evidence/interaction-review.json), [recipient review](evidence/recipient-review.json) and [performance](performance.md).

## Actual AI result and safety

Installed local Ollama 0.40.11 ran **qwen2.5-coder:3b**, one accepted request, **23.031 s**, **1991 input / 298 output provider-reported tokens**. The Cyberpunk template became “Neon Reverie”; its music gain changed **520 → 400**, with the supported neon/night geometry-preserving treatment retained. The share contains the exact model attribution, receipt and effective recipe hash. A new recipient reopened it without guest authority/audio consent and verified source/model attribution.

A small model did not reliably fulfill every artistic instruction. An exploratory output retained typed values while describing absent visual changes. That test candidate was not accepted for delivery and its temporary link was invalidated by restart. The final compiler always derives descriptions from the effective validated settings. The actual accepted run's receipt and effective recipe hash agree; there is no deterministic fixture represented as a model success. See [model receipt and publication](evidence/model-edition.json), [browser model review](evidence/model-review.json) and [quality review](evidence/model-quality-review.json).

“Create an impossible floating city and delete buildings” produced an intelligible unsupported-operation refusal without changing source geometry. A separate live request was canceled; no late draft/model result was committed. Guest tokens failed privileged publisher/creator operations, share capabilities failed write authorization, stale hashes failed save, and sharing without approval/consent was refused. Old temporary links returned 410 after restart. Source identities, immutable parents, approved bytes and source attribution were retained.

All editions keep **143 approved asset references**. Original sorted-source identity digest: `88699acb974ebb351a6862d0a5afd64276b78f1eed59ee6cb1be229edde7567e`. Browser verification reached **143 assets / 6,660,068 bytes** after audio consent. The server-wide remote credential guard and exact publisher/admin secret scans passed; no secret values are recorded.

## Runtime and limits

One owned preview service is intentionally retained at **http://127.0.0.1:57454/**. Test-only earlier servers stopped. It is loopback-only; guest links expire within one hour or on service restart. The pre-existing Ollama service remains untouched. No source trees, acceptance evidence, shared caches or model weights were deleted. See [runtime cleanup receipt](evidence/cleanup.json) and [reproduction/stop instructions](reproduction.md).

Deferred: actual first-time-user review, physical mobile/native acceptance, public hosting/CDN and distributed abuse controls, durable authenticated creator/account ownership, user-uploaded assets/templates, automatic template extraction, marketplace, multiplayer/M6/M7, live Terra observations and general cross-city catalogs. Forced WebGL-context-loss/OS reduced-motion testing and steady-state GPU profiling were not performed; the explicit Still views path was visually used. The source city remains simplified and may be estimated; stylized materials/particles/lighting are not surveyed facades or observed weather. Stable 60 FPS is not established.
