# Finalverse Earth brand assets

The owner supplied the Finalverse symbol and existing 48/512 pixel icons for product branding on 2026-10-19. These files are copied unchanged. The 1080-pixel PNG is the raster master used here; the supplied SVG contains embedded raster images and is not treated as a vector master. CSS preserves its proportions. The white tile is intentional for both themes. Finalverse names and marks remain product trademarks; the software MIT license does not grant unrelated trademark rights.

The source named `finalviewer_512.png` is actually 1080 × 1080 and `finalviewer_48.png` is 135 × 135. The manifest declares the measured dimensions, rather than the source filenames. No bitmap upscaling or vector-master claim is made. Header, loading mark, favicon and installed shortcut reuse these assets; layout and dark/light treatments are native CSS.

Horizontal dark/light/documentation SVGs and the social card are native SVG layouts embedding the original supplied raster symbol. They are not traced vector masters. `build.mjs` reproduces the layouts. The 1200 × 630 social PNG is a browser capture of that authored SVG, not an AI-generated scene or an application screenshot.

The installed-app manifest uses 192 × 192 and 512 × 512 PNG derivatives copied from the official Finalverse website production build (`finalverse-web`, `source/logo.svg` through its existing Sharp pipeline). These retain the official geometric mark and measured dimensions, without claiming a new vector master. The original 135/1080 pixel source files remain available.
