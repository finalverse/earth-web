# Local operator guide

Use a dedicated local development database. Back up existing data and stop the
owned runtime before upgrading its binary; preserve its prior binary/image and
config for rollback. Do not apply this preview to production implicitly.

`earth/intelligence/dev-db.mjs` now applies additive migration
`003_confluence.sql` along with the existing migrations, then grants the existing
unprivileged runtime role access. It neither resets session data nor touches a
native MutSea world database. Existing private bridge configuration is reused.

```sh
# Dedicated disposable regression database, never a production connection.
node earth/intelligence/dev-db.mjs --test
export EARTH_INTELLIGENCE_TEST_DATABASE_URL_FILE=/private/test-runtime-url
cargo +1.92.0 test --locked --manifest-path earth/intelligence/Cargo.toml --test confluence -- --include-ignored

# Owner grants one existing non-code session to an explicitly named avatar.
earth --config /private/runtime-config.json --session SESSION_UUID confluence invite \
  --agent AVATAR_UUID --grid GRID_UUID --region REGION_UUID --can-propose \
  --output /private/confluence-grant.json

# Omit --can-propose for a read-only participant. Output is created with mode 0600.
# A recipient can replay without the owner's credential or configuration:
earth --json confluence read --origin http://127.0.0.1:18651 \
  --grant-file /private/confluence-grant.json --after 0

# Owner revocation is immediate for subsequent native/Web/CLI access checks.
earth --config /private/runtime-config.json --session SESSION_UUID \
  confluence revoke GRANT_UUID
```

Keep the grant file private. In the native test viewer paste its handoff token
following `/connect `; never use an owner credential, login password or token in
a URL. In the existing local Web view expand **Confluence · shared conversation**
and paste the scoped key into its password field. No key is stored in browser
storage or ordinary viewer settings. The browser is read-only.

MutSea uses the existing private Earth transport and `FinalverseWorld` avatar
capability. No additional public listener, port-forward rule or database user is
needed. Existing WorldKernel/WorldLine continue to own mutations and Undo.
The native diagnostic probe also has a `confluence` mode with private account,
handoff and evidence files; it validates real login, capability relay, source
inspection and read/propose policy. It is not a production agent runtime.

After restart or a new native login, issue a fresh handoff for the same Earth
session. Never replay an uncertain mutation or a sent message to recover a UI.
To roll back this preview, restore the old runtime/module and retain the new
access table as inert metadata; do not delete conversation or world data.
