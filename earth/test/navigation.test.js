import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
  createNavigationController,
  resolveWebResource,
} from '../web/navigation-controller.js';
import { createResourceGateway } from '../server/resource-gateway.js';
import { createEarthServer } from '../server/http.js';
import { createEarthCore } from '../core/index.js';
import { defaultDataset } from '../server/main.js';
const address = 'usap://spatialdb/entity/7c3f52d4-0a81-4c6e-9b2f-5d41e8a07c02';
async function start(t, options = {}) {
  const server = createEarthServer({
    core: createEarthCore({ datasets: [await defaultDataset()] }),
    ...options,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  });
  return `http://127.0.0.1:${server.address().port}`;
}
test('shared navigation drives a renderer, supports return and keeps resources out of session state', async () => {
  const rendered = [];
  const c = createNavigationController({
    resolve: () => {
      throw Error('Unexpected network');
    },
    render: (r) => rendered.push(r),
  });
  await c.navigate('geo:45.5088,-73.554,28');
  await c.navigate('geo:0,0');
  const back = await c.back();
  assert.equal(back.anchor.latitude_degrees, 45.5088);
  assert.equal(rendered.length, 3);
  assert.ok(!c.serialize().includes('resource'));
  await assert.rejects(c.navigate('geo:91,0'));
});
test('latest navigation cancels a pending resolution and leaves no stale render', async () => {
  let firstSignal;
  const c = createNavigationController({
    resolve: async (_, signal) => {
      firstSignal = signal;
      await new Promise((_, reject) =>
        signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        ),
      );
    },
    render: () => {},
  });
  const first = c.navigate(address);
  const rejected = assert.rejects(first);
  await c.navigate('geo:0,0');
  await rejected;
  assert.equal(firstSignal.aborted, true);
});
test('web resource lookup uses same-origin bounded no-store transport and graceful fallback', async () => {
  let called;
  await assert.rejects(
    resolveWebResource(address, undefined, {
      fetch: async (path, options) => {
        called = { path, options };
        return new Response('{}', { status: 503 });
      },
    }),
    /not connected/,
  );
  assert.equal(
    called.path,
    '/v1/earth-core/entities/' + address.split('/').at(-1),
  );
  assert.equal(called.options.cache, 'no-store');
  await assert.rejects(
    resolveWebResource(address, undefined, {
      fetch: async () =>
        new Response('x'.repeat(1048577), {
          headers: { 'content-type': 'application/json' },
        }),
    }),
    /budget/,
  );
});
test('unconfigured optional resource gateway leaves existing query routes operational', async (t) => {
  const url = await start(t);
  const r = await fetch(
    url + '/v1/earth-core/entities/' + address.split('/').at(-1),
  );
  assert.equal(r.status, 503);
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.equal((await fetch(url + '/v1/layers')).status, 200);
});
test('resource gateway passes only caller authorization, never supplies a shared credential', async (t) => {
  const seen = [];
  const upstream = createServer((req, res) => {
    seen.push(req.headers.authorization);
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"private":"must not leak"}');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => {
    upstream.closeAllConnections();
    return new Promise((r) => upstream.close(r));
  });
  const url = await start(t, {
    resourceResolver: createResourceGateway(
      `http://127.0.0.1:${upstream.address().port}`,
    ),
  });
  for (const authorization of [undefined, 'Bearer caller-only']) {
    const r = await fetch(
      url + '/v1/earth-core/entities/' + address.split('/').at(-1),
      { headers: authorization ? { authorization } : {} },
    );
    assert.equal(r.status, 404);
    assert.ok(!(await r.text()).includes('private'));
  }
  assert.deepEqual(seen, [undefined, 'Bearer caller-only']);
});
test('resource routing rejects credential URLs and origin attacks', async (t) => {
  const url = await start(t, {
    resourceResolver: () => {
      throw Error('Must not be called');
    },
  });
  assert.equal(
    (
      await fetch(
        url +
          '/v1/earth-core/entities/' +
          address.split('/').at(-1) +
          '?token=secret',
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(
        url + '/v1/earth-core/entities/' + address.split('/').at(-1),
        { headers: { origin: 'https://evil.invalid' } },
      )
    ).status,
    403,
  );
});
