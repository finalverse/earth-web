# Maintained upstream consolidation — 2026-10-20

The operator requested local work be consolidated into main and pushed, followed
by synchronization with `https://github.com/finalverse/gods-eye-view.git`.

## History and conflict policy

1. Fast-forward main from `27380d9bedb6d2496eb017ff3f38b2bb7c984698` to the
   coherent local v0.4 milestone `5d3fb90725cccb330ebee01a1ea4338b0f6c291e`
   and push normally. All prior commits remain in history.
2. Fetch maintained main at `de2138e84c1778fd98a48b7c9fd0b9788c318946`.
   It contains exactly 158 commits after the previous maintained pin
   `93ea088f4556a5a65b3292a2d15142d5a6c562bc`.
3. Merge on a temporary integration branch, retaining both histories. Three
   conflicts: retain Finalverse README; combine upstream World Packet and Earth
   exports; combine upstream package boundaries and Earth boundaries. No reset,
   force-push or upstream code deletion is used.

Upstream changes cover Gemini voice, typed sends and ownership, CCTV catalog
refresh/source handling, terrain request bounds, aircraft/maritime breakdowns,
World Packet extraction, tests and documentation. They remain inherited code
with original attribution. Their hosted/provider claims are not added to the
independent Earth product's README or API.

## Integration checks

- All 11 pinned globe source, license and reference-data hashes are unchanged
  at the new maintained commit. Update the pin's commit, retain reviewed hashes.
  Locked Cesium and Vite plugin versions are unchanged.
- Root dependency lock remains unchanged. A separate RC CI defect was corrected:
  rebuild SDK after shared-source formatting, refresh only its integrity in the
  independent application lock, then clean-install. No third-party pins change.
  A regression now checks the app's integrity against the actual SDK tarball.
- Inherited full runner: 8,223 tests pass, one native Windows DACL test is
  conditionally skipped on macOS. This includes serialized allocation probes.
- Core with isolated PostGIS: 42 pass. SDK/platform: 23 pass including the new
  integrity regression. Independent app: five pass, strict build and clean
  installation pass. Globe build, pinned-source check, package boundaries,
  adopted formatting and whitespace checks pass.
- No production deployment, database migration, cloud AI enablement, npm publish
  or public release is performed by this consolidation. Public status was
  checked and remains v0.3 with AI disabled.

The v0.4 RC validation record remains explicit about browser and final artifact
gates. Merging source to main does not declare a release or close those gates.
