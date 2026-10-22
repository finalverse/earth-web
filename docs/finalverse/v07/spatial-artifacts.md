# Spatial artifact references

FSIP 0.1 gains an additive `artifact_reference` document variant. Existing v0.6
experience manifests are unchanged. Rust types generate the checked-in JSON
schema and TypeScript declarations.

The reference defines artifact/session IDs, owner, typed category, immutable
version, canonical FSIP source locator, permissions, optional explicit spatial
context, provenance, content SHA-256, lifecycle and creation time. Categories are
conversation, research, geographic workspace, visualization, scene proposal,
asset preview and world execution receipt. This slice exposes existing verified
`spatial_workspace` records as geographic workspaces; declaring a category does
not claim its producer is implemented.

The original data remains in `earth_intelligence.artifacts`. A reference is not a
new copy of the artifact. A native viewer receives a bounded preview containing
original query, source/receipt and at most six facilities. The Web/CLI surface
can open the original source snapshot without re-executing its query. Generated
explanations remain distinct from archival geographic observations and schematic
native exhibition geometry.

Missing license/context fields remain explicitly unavailable. They are not
filled with invented licenses or inferred georeferencing. A content hash is an
integrity reference, not an authorization grant. Possessing an artifact UUID or
seeing a participant in a region grants no access or editing authority.
