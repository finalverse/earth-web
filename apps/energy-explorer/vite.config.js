import { defineConfig } from 'vite';
import { copyFile } from 'node:fs/promises';
import cesium from 'vite-plugin-cesium';
export default defineConfig({
  plugins: [
    cesium(),
    {
      name: 'application-manifest',
      async closeBundle() {
        await copyFile('earth-app.json', 'dist/earth-app.json');
      },
    },
  ],
  build: { target: 'es2022', sourcemap: false },
});
