# v0.6 rollback and deployment boundary

The local pilot is isolated. No hosted service, public site, GitHub branch or
download has been changed by the v0.6 rehearsal. Hosted enablement requires a
separate authorized, coordinated pilot with the existing Lumi runtime.

## Preserve before changing a world

Record the native image digest, module DLL hash, configuration, region UUIDs,
PostgreSQL backup and all WorldLine/FSIP journals. Keep a tested previous image.
Use the native backup mechanism before a normal restart. Do not delete volumes,
regenerate region/avatar identities, reset Lumi memory, or replace inventories.
The new bridge migration is additive and belongs to the separate intelligence
database, not MutSea's canonical world database.

## Disable safely

1. Revoke outstanding owner handoffs. Record any executing/unknown outcome.
2. Set `FinalverseEarthBridge.Enabled = false` and restart through the normal
   native service path. This blocks new handoffs/approval; existing sidecars remain
   loaded. Keep the composer enabled for native receipt inspection and guarded Undo.
3. Inspect and Undo test experiences through the authenticated native panel.
   Fingerprint mismatch or native recovery-required state is a review gate, not
   permission to delete edited objects or replay a failed creation.
4. Retain the runtime's grants, audit and source artifacts until native outcomes
   reconcile. Turning off the bridge does not mean an uncertain write disappeared.

A native world keeps streaming its persistent objects without an Earth daemon.
If Earth is unavailable, Undo can complete locally and synchronize its receipt
later. Do not mark an unconfirmed operation committed merely to clear an error.

## Revert binaries

Prefer the tested new module with the bridge disabled while retaining sidecar
interpretation and export guards. If an older module is necessary, first remove
or reconcile active FSIP test experiences with the new guarded executor, then
restore the recorded old image/configuration. Keep the original journals and
database snapshots. An older binary does not understand every FSIP sidecar and
must not be used to publish a source-backed experience as a generic CC0 recipe.

The viewer can revert independently to the previous preview; no renderer, wire
object representation, avatar or inventory migration was introduced. Keep the
new private viewer profile separate from the user's normal install/settings.

## Hosted pilot checklist

Before approval, review the exact commits/artifacts and this ledger. Use one world
host for native adapter, private bridge/runtime and gateway where practical;
no new public AI port is required. Preserve the current hosted Lumi identity,
controller, database and service lease. Upgrade the native read tool, gateway
context filter and agent command together. Enable only an approved sandbox or
controller-owned pilot area. Verify original Harbor, native login, independent
observer, reboot, source licensing, eligible Undo, model costs and frame time.
Only then consider a signed release or v0.7.
