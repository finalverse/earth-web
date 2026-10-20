# Earth Intelligence v0.5 security review

Scope: source review, negative HTTP/provider tests, disposable PostgreSQL
integration and actual local process checks. This is **not** an independent
security audit or a claim that approved JavaScript is safe hostile code.

| Threat | Implemented control and verification |
|---|---|
| Prompt/tool injection | Typed tool enum; unknown fields/tools refused; model cannot supply shell, executable, arbitrary URL, SQL or new capabilities. Source-grounded constraints checked before approval. |
| Unapproved writes | Model patch is immutable JSON; explicit SHA-bound, expiring one-use approval; no write at proposal; stale content hash refused; atomic anchored replacement and receipt. |
| Path/symlink escape | Relative component validation, root directory FD, per-component `openat` with `O_NOFOLLOW`, regular bounded text files; parent traversal, hidden/private names and glob syntax refused. Tests exercise actual escapes. |
| Coding exfiltration | Literal loopback inference only; remote descriptor/metadata and redirects refused before forwarding a prompt. Test process network blocked by macOS Seatbelt or Linux seccomp, verified against an actual local listener. |
| Process escalation | Operator-pinned Node binary and fixed bootstrap; explicit file read allowlist; Node permission model denies writes, children, addons, workers and WASI; clean environment/no stdin. No unrestricted shell tool. |
| Resource abuse | Two jobs, one active operation/session; five DB connections; event/artifact/file/request bounds; tests have a 15-second deadline, 128 MiB JS old-space limit and 64 KiB per output stream; process-group cleanup on timeout/cancel. This is not a total process memory limit. |
| Cross-session access | Bearer token hashed at rest, constant-time configured-owner comparison, parameterized owner-filtered queries, cross-owner tests. Share token cannot access private session endpoints. |
| Browser/CSRF/DNS rebinding | Loopback bind, exact Host and Origin, no CORS/cookie auth, no-store/CSP/same-origin resource policy. Share grants are scoped, expiring and revocable. |
| Restart/replay | DB lease, request input hashes and atomic one-use approval; unknown outcomes preserved, no automatic replay. |
| Malicious responses | HTTP/NDJSON byte limits, strict typed plans, exact source plan/receipt hash, geography through Node; DOM `textContent` and terminal control/bidi filtering. |

## Deliberate limits

- Use a dedicated, trusted local checkout or a disposable project. **Do not run
  unreviewed hostile tests.** Node's permission system and network restriction
  are defense in depth, not a complete operating-system VM/container sandbox.
  macOS's `sandbox-exec` availability is checked and fails closed when absent.
  Linux x64/ARM64 filters deny network syscalls and use `no_new_privs`; other OS
  or architecture test execution is refused. Native runtime dependency exploits,
  hard-link attacks and malicious same-user concurrent filesystem changes are
  outside this cooperative local-workspace model. A mount/VM sandbox is a v0.6 gate.
- Read approval is established by the operator's code root plus the explicit
  code session/file or artifact request. Source/test context goes only to the
  configured local provider. Never put credentials in the workspace or a prompt.
  No filename heuristic can identify every secret.
- Conversations/code context and test output can contain private user data;
  PostgreSQL stores durable events/artifacts until retention deletes them.
  Credentials are read from private files, not stored in events. Host encryption,
  backups and local account security are not implemented by this process.
- Configured bearer tokens are local owner identities in v0.5. Revoking a token
  removes access; replacing it produces a different owner identity and does not
  migrate its sessions. Stable authenticated principals and rotation are future
  work. Browser keys are capabilities: anyone who obtains one can read that
  spatial snapshot until expiry/revocation.
- Source/runtime receipts bind inputs/results for inspection; they are not
  signatures, remote attestation or proof that an imported JSON file is genuine.
- An approved patch can complete just before cancellation. Cancellation cannot
  reverse a completed mutation. Restart interruption is `unknown`; inspect the
  current file/receipt and use version control for deliberate rollback.
- No public listener, anonymous coding endpoint, cloud secret distribution,
  automatic git operation, deployment, world mutation or financial action exists.

## Verification commands

See the [developer guide](developer-guide.md) for unit and separate disposable DB
tests. `tests/provider.rs` verifies no redirect/remote metadata prompt forwarding,
real incremental transport and cancellation. `tests/runtime.rs` checks ownership,
idempotency, actual CLI streaming, approval replay, atomic patching, outside-file/
write/child/network denial, restart recovery, retention and share revocation.
Deterministic CI fixtures are labeled and are never represented as real facilities
or model observations. Acceptance with installed models is recorded separately.
