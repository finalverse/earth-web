# Integration of existing Earth Web branches

Every remote branch tip below was merged into local main. Branches and commits are retained; no branch was deleted, reset or force-pushed.

| Remote branch | Observed commit |
| --- | --- |
| origin/claude/mobile-4d-world-app-k98w5m | `3218b7d427b52c0ef6cc1f86e1580c3c70b87f3b` |
| origin/codex/community-weather-base | `fa69852323267e7f4c81176c7a8bf5d005515ceb` |
| origin/codex/confluence-v07 | `a8673478a8cf2b60b35503ceeda4e7d1a0b55d31` |
| origin/codex/earth-v04-platform | `f6f8f7f65e6b64028db01eb192f3738e067e2c0b` |
| origin/codex/earth-v05-intelligence | `abe53f1172ebead4fc0cd08bde3ca1132626dc14` |
| origin/codex/spatial-conversations | `85a187f5610a3ff68fdf217cfb545203776161c0` |
| origin/feat/cctv-us-registry | `9542a5e58b19277d1f9b6698a46f69fdaa5fc5c1` |
| origin/feat/global-radar | `9c2fce42546c4c98b9276fad51e0765ec096225f` |
| origin/feat/voice-geometry | `b234d7b427635c09727fae834870cd20453ff360` |
| origin/feat/voice-on-device | `b55663e3ce74156c31d243f1fe4352a0828627f1` |
| origin/feat/voice-outlines | `41b2475362903ef113b03c3ea57ef153a9de8c14` |
| origin/german/street-level-slim | `392141bfc50d73c3e151862ea57100b2f96d1515` |
| origin/integration/all-branches-oct23 | `fa24b2e7bf7ac1fd3952724309514702d5c17201` |
| origin/intro-sequence-first-light | `e9ddc37788e51deb7569207b18704d0908c98899` |
| origin/main | `6444afecce42962f5438f606c81e491fd5963290` |
| origin/refactor/context-controls | `43db5c19bb13501959e2c2f6176b5a8a49f5c87a` |
| origin/stack/voice-core-outlines | `01979bba1eaac31b1f5d9c794ac926baee32a7fe` |

The accumulated integration branch brought mobile Web, radar, the intro and spatial building evidence. Voice geometry and optional device-local voice were integrated with the current application instead of replacing current provider, OAuth, catalog and host protections. The old community base overlaps newer weather implementations. The old single-provider street-level refactor conflicts with subsequently shipped Google/KartaView/Panoramax support; the newer multi-provider implementation was retained. Its obsolete structural removals were superseded rather than removing working providers.

Integration fixes preserve deterministic caller scope, referent/card agreement, unavailable-feed semantics, per-session Overpass gating, local tool-profile limits, source injection, canonical schema compatibility, and the final Cyber stylesheet cascade. The current explicit named-view commands remain supported, and prompt text stays within existing limits.

The one reviewed local globe source override is the additive administrative geometry helper/type matching used by voice areas. The original maintained source hashes remain recorded; the local reviewed hash is separate in `earth/globe.lock.json`. No artifact download signature or checksum verification was disabled.

Real geographic compilation, native world admission and a production deployment are separate uncompleted gates. The older mobile branch is a browser shell, not an iOS/Android native application.
