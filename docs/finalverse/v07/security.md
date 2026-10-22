# Confluence security boundary

- One non-code session per grant; explicit avatar, grid and region audience.
- A single-use native join binds the current authenticated capability session.
- One-hour expiry, stored token hash, owner-only revocation, private output files.
- Read and proposal permissions are independent; neither permits approval,
  provider selection, local file access, shell execution, SQL, or world writes.
- Native relay credentials stay server-side. Browser/scoped CLI keys cannot call
  private native transport or owner session-management endpoints.
- Private transport rejects Origin headers and requires its fixed Host and
  distinct credential. Local public-facing runtime still binds literal loopback.
- Same-session artifact checks precede model context assembly. Original content
  hashes enter request idempotency; source/model text never becomes permission.
- Revocation is serialized against access checks. Previously authorized model
  work may finish; revocation does not claim to cancel or undo it.
- Strict replay sequence/session checks, byte/event/history quotas, and a shared
  concurrency budget reserve PostgreSQL connection capacity.
- New native logins/regions clear display state and queued actions. Uncertain
  sent messages are inspected in the source ledger and never blindly repeated.

Regression tests use two distinct participants, a deterministic streaming model,
real disposable PostgreSQL, private-file checks and the actual HTTP authorization
middleware. They cover wrong participant/login, single-use replay, private code
sessions, foreign artifacts, provider/file escalation, revocation, expiry,
restart recovery and concurrent readers. OS sandbox and existing world approval
regressions remain separate required checks.

Production SSO, Internet-facing service hardening, abuse controls and hosted
Lumi federation are not implied by a local scoped preview.
