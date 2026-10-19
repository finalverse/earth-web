// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import { fileURLToPath } from 'node:url';
import { mkdir, copyFile } from 'node:fs/promises';
const globePlugin = cesium();
const globeTags = globePlugin.transformIndexHtml;
globePlugin.transformIndexHtml = (html, context) =>
  context.filename.endsWith('/examples/country-explorer.html')
    ? []
    : globeTags(html, context);
export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  publicDir: false,
  plugins: [
    globePlugin,
    {
      name: 'earth-license-notices',
      async closeBundle() {
        const directory = new URL('../dist-earth/notices/', import.meta.url);
        await mkdir(directory, { recursive: true });
        const brand = new URL('../dist-earth/brand/', import.meta.url);
        await mkdir(brand, { recursive: true });
        for (const name of [
          'finalverse-symbol.png',
          'favicon.png',
          'icon.png',
          'wordmark-dark.svg',
          'wordmark-light.svg',
          'documentation-logo.svg',
          'social-preview.svg',
          'social-preview.png',
        ])
          await copyFile(
            new URL('./web/brand/' + name, import.meta.url),
            new URL(name, brand),
          );
        await copyFile(
          new URL('./web/manifest.webmanifest', import.meta.url),
          new URL('../dist-earth/manifest.webmanifest', import.meta.url),
        );
        for (const [source, target] of [
          ['../LICENSE', 'upstream-MIT.txt'],
          ['../LICENSE.finalverse', 'Finalverse-MIT.txt'],
          ['../THIRD_PARTY_NOTICES.md', 'third-party.md'],
          ['./data/NOTICE.md', 'geographic-data.md'],
          ['../node_modules/cesium/LICENSE.md', 'Cesium.txt'],
          ['../node_modules/proj4/LICENSE.md', 'Proj4js.txt'],
          [
            '../node_modules/geographiclib-geodesic/LICENSE.txt',
            'GeographicLib.txt',
          ],
        ])
          await copyFile(
            new URL(source, import.meta.url),
            new URL(target, directory),
          );
      },
    },
  ],
  build: {
    target: 'esnext',
    outDir: '../../dist-earth',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        time: fileURLToPath(new URL('./web/time.html', import.meta.url)),
        energy: fileURLToPath(new URL('./web/energy.html', import.meta.url)),
        main: fileURLToPath(new URL('./web/index.html', import.meta.url)),
        example: fileURLToPath(
          new URL('./web/examples/country-explorer.html', import.meta.url),
        ),
      },
    },
  },
});
