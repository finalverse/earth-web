# Conversation continuity protocol

The existing session protocol remains `1.0`. Existing CLI owner endpoints,
streaming events, cancellation and hash-bound tool approvals remain authoritative.
New access routes are additive:

| Surface | Operation | Scope |
|---|---|---|
| Owner API | `POST /v1/sessions/{id}/confluence` | Issue one-hour avatar/audience grant |
| Owner API | `POST /v1/sessions/{id}/confluence/{grant}/revoke` | Revoke future access |
| Browser / scoped CLI | `GET /v1/browser/confluence?after=N` | Read authorized session events and references |
| Browser | `GET /v1/browser/confluence/artifacts/{id}` | Open a same-session spatial snapshot |
| Private bridge | `POST /v1/world/confluence/{join,read,message,artifact}` | Authenticated native relay only |
| Viewer capability | `op=confluence` with explicit action | Actor and login derived by MutSea, never trusted from caller JSON |

A native join consumes the handoff once and binds the grant to that current
capability session. Reconnection after a new login requires a fresh grant; the
canonical Earth session ID and artifact IDs remain unchanged. The bearer is
hashed at rest. Its one-hour lifetime and revocation apply to native and browser
reads. Browser access is read-only even for a native proposer.

Replay is contiguous and bounded: maximum 32 events / approximately 24 KiB of
event JSON per page, with an explicit next cursor. Native responses are capped
at 60 KiB. A client continues pages until the returned cursor reaches the source
session cursor. The viewer/browser poll only while their views are active, at
approximately one second between settled reads; CLI retains its existing SSE.
This is real persisted delta replay, not simulated typewriter output.

A shared message enters the existing runtime with the authenticated participant
identity and a hash-bound source-context snapshot. A spatial session may receive
a narrative explanation without changing its canonical mode or executing another
query. Optional artifact context must come from the same authorized session.
The model cannot select a different provider, read a file, approve a tool, or
mutate the world through this route. Source context is explicitly untrusted data.

Already sent POSTs are not retried automatically. One newly submitted UI action
may queue behind an in-flight read. That queue is bounded, memory-only and
cleared on login/region change or access failure. Cancellation remains an owner
operation; a reader/proposer cannot cancel another person's work.
