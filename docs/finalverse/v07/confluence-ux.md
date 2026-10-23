# Confluence UX

The compact native HUD from the v0.6 checkpoint remains. Conversation, Activity
and Artifacts share one movable native floater, with remembered geometry and a
one-click Size control. The scene center remains usable. Existing Review/Create
continues to use the native approval flow.

For the local preview, an owner issues a scoped handoff using Earth CLI. In the
viewer composer enter `/connect <handoff>`; it is cleared immediately and never
saved in ordinary settings. The recipient becomes **Earth session**. The viewer
replays the same canonical messages and actual model identity. **Artifacts**
selects source references; **Inspect source** reads their provenance, receipt
and facilities. Conversation messages use the selected same-session source
snapshot as bounded context. `/earth` opens the local source view; `/disconnect`
ends the native display connection without pretending to revoke server access.

The access-key workflow is a developer-preview bridge, not the final public
onboarding experience. Public identity federation, capability exchange without
manual keys, participant display names and cross-device recovery need further
work. Raw capability URLs and owner credentials never appear in this UI.

Native live updates reuse persisted event pages. UI text layout runs on the main
viewer coroutine. Hidden native panels do not poll. Clear changes the display
projection only. Permission/refusal errors direct the user to authoritative
source state rather than silently resending a request.
