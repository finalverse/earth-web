# Maintained globe reference application

Finalverse Earth preserves the inherited globe runtime as a separate application for compatibility and reviewed upstream updates. Its documentation and broader provider setup live in [finalverse/gods-eye-view](https://github.com/finalverse/gods-eye-view). The independent Earth entry point and Energy Explorer have their own features, startup, data allowlist and safety boundaries in the repository README.

Use `npm run dev` / `npm run build` for this reference application, with its original configuration and provider requirements. Use `npm run earth:start` / `earth:build` for independent Earth. Do not infer that enabling a reference-app provider enables it in Earth, or that its asset/feed terms transfer to Earth distribution.

## Preserved interface contracts

The following descriptions apply to the inherited reference application at the reviewed baseline, not to the independent Earth interface:

- Twenty layers and map sources. **Eighteen have a keyless path.** Availability, keys, coverage and individual source terms still apply; no uptime is guaranteed.
- **Sits on the real ground.** Entity heights are aligned to work with Google 3D tiles, so aircraft park on aprons and cameras stand on street corners instead of floating.
- DISPLAY ▸ **Draw** provides Area, Line or Pin tools. Click vertices, double-click to finish and label the result. These annotations share the reference application's whiteboard/persistence behavior. Per-vertex heights for draped areas/routes are not guaranteed placements. This control and its serialization contract remain unchanged.

These narrow compatibility notes let the inherited regression tests keep checking important documentation promises after the product README was rewritten. They are not a copy of the upstream marketing introduction. Full source history, license and attribution remain preserved. Review actual source and provider policies before enabling hosted integrations.
