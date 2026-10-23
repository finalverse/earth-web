# Earth Web integration verification

This is a development integration, not completed real-terrain product acceptance.

| Check | Measured result |
| --- | --- |
| Full ordinary unit suite, bounded to four workers | 8,613 passed; 1 skipped; 0 failed |
| Serialized focus allocation gate | 1 passed |
| Serialized overlay allocation gate | 14 passed |
| Embedded Earth tests | 47 passed; 2 optional PostGIS tests skipped |
| Earth Core build/types/lint/conformance/pins | 12 tests passed; compatibility checks passed |
| Upstream production build | PASS; existing large-chunk warning remains |
| Embedded Earth build and notice audit | PASS |
| Package/import boundaries | PASS |
| Formatting | 1,532 source files checked |
| Spanish/Russian catalog coverage | PASS |
| Actual Cesium browser workflow | PASS at 1440×1000 and 390×844, software rendering |
| Destination-marker picking and keyboard focus | PASS in both viewport tests |
| Core-to-SpatialDB metadata | PASS against live isolated synthetic publication |
| Actual real Montréal terrain/buildings/roads | BLOCKED by source access and missing verified Geo publication |
| Native persistent-world admission | NOT TESTED; requires authoritative session integration |
| Physical mobile/GPU performance and production deployment | NOT TESTED |
| Hosted GitHub Actions run | NOT TESTED locally; workflow execution is separate |

Browser measurements and limitations are in `navigation-measurements.json`. Screenshots are generated under ignored `qa-artifacts/earth-navigation/`; no screenshot is substituted for service interoperability. The browser uses bundled generalized geography, never real city geometry disguised as a fixture.

Standard full verification is `npm test`. In this cloud machine, the equivalent existing runner plan was executed with `--test-concurrency=4 --test-timeout=60000` for ordinary tests, then both `allocationTestArgs` invocations sequentially, preserving every exit status. No test assertion or performance budget was disabled. The single ordinary skip and two embedded PostGIS skips remain distinct from executed passes. The serialized allocation suites completed separately, with 15 executed tests and no skips.

Also run `npm run earth:test`, `npm run earth:build`, `npm run earth:audit-build`, `npm run build`, `npm run check:boundaries`, `npm run format:check`, `npm run i18n` and `node scripts/qa-earth-navigation.mjs`. Core's own commands are documented in finalverse/earth.

All observed older remote branch tips are included in main; see `branch-integration.md` for exact tips and conflict decisions. Existing evolved weather, imagery-provider and authentication behavior was retained over incompatible older implementations.

## Remaining real-data prerequisite

The environment proxy returned HTTP 403 for both `donnees.montreal.ca` and `open.canada.ca`. Those two narrowly scoped domain additions were saved in the environment configuration draft. Review and save them in environment settings, then publish the environment before retrying the source/licence audit. This is separate from Git publication and does not deploy the application. A successful catalogue/licence read is still only the first prerequisite: dataset versions, asset hosts, redistribution terms, vertical datum and geographic alignment must be verified before SpatialDB Geo can publish a real Montréal scene.
