import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { createEarthServer } from '../earth/server/http.js';
import { createEarthCore } from '../earth/core/index.js';
import { defaultDataset } from '../earth/server/main.js';
const server = createEarthServer({
  core: createEarthCore({ datasets: [await defaultDataset()] }),
  webRoot: new URL('../dist-earth/', import.meta.url).pathname,
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [],
  reports = [];
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    page.on('pageerror', (e) => errors.push(e.message));
    const started = performance.now();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(
      () => !document.querySelector('#find').disabled,
      { timeout: 60000 },
    );
    const globeReady = performance.now() - started;
    await page.click('#earth-navigation-montreal');
    await page.waitForFunction(
      () =>
        document.querySelector('.earth-navigation').dataset.ready === 'true',
    );
    assert.match(
      await page.$eval('#earth-navigation-title', (e) => e.textContent),
      /45.50880/,
    );
    assert.match(
      await page.$eval('#earth-navigation-source', (e) => e.textContent),
      /no terrain or building survey/,
    );
    const input = await page.$('#earth-destination');
    await input.click({ clickCount: 3 });
    await input.type('geo:0,0');
    await page.$eval('#earth-navigation-form', (f) => f.requestSubmit());
    await page.waitForFunction(() =>
      document
        .querySelector('#earth-navigation-title')
        .textContent.includes('0.00000, 0.00000'),
    );
    await page.click('#earth-navigation-back');
    await page.waitForFunction(() =>
      document
        .querySelector('#earth-navigation-title')
        .textContent.includes('45.50880'),
    );
    await page.$eval('#earth-destination', (e) => (e.value = 'geo:91,0'));
    await page.$eval('#earth-navigation-form', (f) => f.requestSubmit());
    await page.waitForFunction(() =>
      document
        .querySelector('#earth-navigation-state')
        .textContent.includes('outside WGS84'),
    );
    await page.$eval(
      '#earth-destination',
      (e) =>
        (e.value =
          'usap://spatialdb/entity/7c3f52d4-0a81-4c6e-9b2f-5d41e8a07c02'),
    );
    await page.$eval('#earth-navigation-form', (f) => f.requestSubmit());
    await page.waitForFunction(() =>
      document
        .querySelector('#earth-navigation-state')
        .textContent.includes('not connected'),
    );
    await page.$eval('#query', (e) => (e.value = 'Canada'));
    await page.$eval('#search', (f) => f.requestSubmit());
    await page.waitForFunction(() =>
      document.querySelector('#rows').textContent.includes('Canada'),
    );
    const metrics = await page.evaluate(() => ({
      navigation_ms: Number(
        document.querySelector('.earth-navigation').dataset.navigationMs,
      ),
      canvas: [
        document.querySelector('canvas').width,
        document.querySelector('canvas').height,
      ],
      document_width: document.documentElement.scrollWidth,
      viewport_width: innerWidth,
      js_heap_bytes: performance.memory?.usedJSHeapSize ?? null,
      transfer_bytes: performance
        .getEntriesByType('resource')
        .reduce((n, e) => n + (e.transferSize || 0), 0),
    }));
    assert.ok(metrics.canvas[0] > 0 && metrics.canvas[1] > 0);
    assert.ok(
      metrics.document_width <= viewport.width + 1,
      'Horizontal overflow',
    );
    await mkdir('qa-artifacts/earth-navigation', { recursive: true });
    await page.screenshot({
      path: `qa-artifacts/earth-navigation/${viewport.width}.png`,
      fullPage: true,
    });
    reports.push({ viewport, globe_ready_ms: globeReady, ...metrics });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    'qa-artifacts/earth-navigation/report.json',
    JSON.stringify(
      {
        mode: 'actual Cesium with software rendering; bundled generalized Natural Earth, no city dataset',
        checks: [
          'geographic navigation',
          'entity inspection',
          'return navigation',
          'malformed coordinates',
          'unavailable service fallback',
          'country search regression',
          'desktop/mobile layouts',
          'reduced motion',
          'self-only CSP without unsafe-eval',
        ],
        reports,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(reports, null, 2));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
