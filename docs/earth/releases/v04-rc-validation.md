# v0.4 RC validation record

Candidate: `0.4.0-rc.1`. This record describes local RC preparation, not a
published release or production deployment. Public v0.3 remains unchanged.

## Recorded evidence

- macOS ARM64 / Node 24.22.0: 42 core tests including PostGIS, 22 platform/SDK
  tests and five independent application tests pass.
- Complete inherited runner: 7,748 passes and one platform-conditional skip
  (native Windows DACL check on macOS), including serialized allocation probes.
- Bounded embedded/PostGIS comparison passes: 1,000 direct samples per workload,
  96 requests at concurrency one/eight, and 130-request rate-limit verification.
  Workloads include spatial, complete grouping, historical time, 100-feature
  results, and local workspace save/open. No production load requests.
- Actual extracted package installation, independent SDK consumer, both Energy
  and globe startup, application denial and disabled public AI pass.
- Actual owned Node processes: successful atomic activation, failed-readiness
  rollback, and corrupt-candidate rejection pass. Previous release uses identical
  RC bits; this does not claim a production v0.3/systemd/database upgrade rehearsal.
- Chromium and native Safari render and analyze the local candidate. Linked
  selection and local saving pass in both; Chromium export/reload/restore passes.
  Final Safari restore and the final clean-commit package checks remain pending.
- Boundary checks pass. Root npm audit succeeded; app audit encountered a
  registry connection reset and requires a successful retry.

Measurements/logs are retained in the operator's private RC scratch directory.
Final distributable artifact hashes and current-commit CI links will be added
after repository consolidation and reproducible package verification.

## Gate disposition

| Gate | Status | Scope |
|---|---|---|
| RC-01 existing tests | PASS | Local suites above; conditional Windows test skipped on Mac |
| RC-02 OpenAPI | PASS | Actual spatial/temporal/discovery/permissions/error contracts; generated schemas |
| RC-03 independent SDK | PASS | Extracted installation, strict consumer types and actual query |
| RC-04 independent app | PASS | Own package/build, extracted same-origin startup |
| RC-05 v0.3 workspaces | PASS | Valid legacy receipt/import preserved; malformed evidence rejected before persistence |
| RC-06 capabilities | PASS | Server-owned grants, denied tools/datasets and bounded resource tests |
| RC-07 security regressions | PASS | Redirect escape, cancellation, import validation, source ordering, existing isolation suite |
| RC-08 bounded load | PASS | Local data parity and documented preview budgets; no production stress |
| RC-09 supported browsers | NOT TESTED | Final combined browser pass still pending; Firefox unavailable |
| RC-10 final package | NOT TESTED | Working-tree artifacts passed; clean-commit reproducibility still pending |
| RC-11 staging smoke | PASS | Local extracted package, no public service or DNS change |
| RC-12 rollback | PASS | Local activation scope above; no production state changed |
| RC-13 attribution/licenses | PASS | Maintained upstream notices, data/renderer attribution, lockfile SBOM and license bundle |
| RC-14 documentation | NOT TESTED | Final hashes, browser evidence and consolidation record pending |

No public-preview readiness claim is made while gates remain untested. The
new v0.5 Rust runtime is not part of this RC; its implementation remains a
separate milestone after RC readiness.
