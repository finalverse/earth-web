# M9 discovery preview assets

These are offline Blender renders of the **actual accepted M8 Montréal Winter Market geometry**. No AI-generated images, invented buildings, replacement meshes or new scene props were used.

| Asset | Contents | Resolution |
| --- | --- | --- |
| `winter-market.jpg` | Overview of the complete 28-object market scene | 1200 × 800 |
| `market-detail.jpg` | Close view of the existing stalls, lanterns, benches, stage and tree | 1200 × 800 |

Source: accepted `market.blend` from the M8 offline GLB interchange demonstration. SHA-256: `1ea6c620cc3705fd5794018e79e8f2e31a86b0d4fb6db467dd5cdff46680874e`.

Source Creative Graph hash: `1fa9b22ecb6c89e80820a46c30bd6f05a7f91848434ddf0257aeb778c2e7a010`.

Rendered with installed Blender **5.2.2 LTS**, Cycles CPU, 48 samples, denoising, JPEG quality 88. The original 28 mesh geometries, materials and spatial transforms remain unchanged. Only preview cameras, world background and lighting rigs were added in memory; the source `.blend` was never saved or modified. The source hash was rechecked after rendering. No services, software installation or network fetches were used.

These previews show authored generated market objects, **not surveyed geography**, and are **not browser screenshots**. Their studio lighting differs from the interactive web renderer. The surrounding source-backed Montréal district is not present in this standalone interchange scene, so no district image is claimed.

See `provenance.json` for image checksums, camera positions and measured render durations. Reproducible trusted render script and logs are retained in the local scratch directory `/Users/wenyan/Finalverse/dev/m9-preview-assets-20261030/`. The two images together occupy less than 170 KiB.
