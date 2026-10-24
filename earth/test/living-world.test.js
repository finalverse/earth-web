// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createLivingGateway } from '../server/living-world.js';
const bytes = Buffer.from('contract-test-asset'),
  hash = createHash('sha256').update(bytes).digest('hex');
const pin = {
  graph_id: '1c282739-92be-4568-96b0-1c13602cb506',
  version: '1'.repeat(64),
  root_sha256: hash,
  frame_id: 'fixture.eus/1',
  origin: { longitude_degrees: -73, latitude_degrees: 45, height_metres: 0 },
  axes: ['east', 'up', 'south'],
  unit: 'metre',
};
const config = {
  schema_version: 'earth.living-config/v1',
  title: 'Synthetic unit fixture',
  publication: pin,
  spatialdb_endpoint: 'http://127.0.0.1:18805',
  mutsea_endpoint: 'http://127.0.0.1:19080',
};
const credential = 'Bearer ' + 'x'.repeat(40);
async function call(handle, path, headers = {}, method = 'GET') {
  const result = {};
  const res = {
    setHeader() {},
    writeHead(status, h) {
      result.status = status;
      result.headers = h;
    },
    end(body) {
      result.body = body;
    },
  };
  const claimed = await handle(
    { headers, method },
    res,
    new URL('https://local.invalid/v1/living/' + path),
    (status, body) => {
      result.status = status;
      result.body = body;
    },
    new AbortController().signal,
  );
  assert.equal(claimed, true);
  return result;
}
test('private delivery requires the current caller; immutable Cesium version is admitted exactly', async () => {
  const calls = [];
  const handler = createLivingGateway(config, {
    request: async (url, options) => {
      calls.push({ url, options });
      return new Response(bytes, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    },
  });
  assert.equal((await call(handler, 'assets/' + hash)).status, 401);
  assert.equal(calls.length, 0);
  assert.equal(
    (
      await call(handler, 'assets/' + hash + '?v=' + pin.version, {
        authorization: credential,
      })
    ).status,
    200,
  );
  assert.equal(calls[0].options.headers.Authorization, credential);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(
    calls[0].url,
    config.spatialdb_endpoint +
      `/v1/scene-graphs/${pin.graph_id}/versions/${pin.version}/assets/${hash}`,
  );
  assert.equal(
    (
      await call(handler, 'assets/' + hash + '?v=latest', {
        authorization: credential,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(handler, 'assets/' + hash + '?token=secret', {
        authorization: credential,
      })
    ).status,
    404,
  );
  assert.equal((await call(handler, 'assets/' + hash, {}, 'POST')).status, 405);
});
test('authorization failures and corrupt assets cannot become successful cached responses', async () => {
  const refused = createLivingGateway(config, {
    request: async () => new Response('{}', { status: 403 }),
  });
  assert.equal(
    (await call(refused, 'graph.json', { authorization: credential })).status,
    403,
  );
  const corrupt = createLivingGateway(config, {
    request: async () => new Response('corrupt'),
  });
  const result = await call(corrupt, 'assets/' + hash, {
    authorization: credential,
  });
  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(result), /Bearer|corrupt/);
});
test('world discovery never forwards a publication credential and detects stale bindings', async () => {
  let forwarded;
  const handler = createLivingGateway(config, {
    request: async (_url, options) => {
      forwarded = options.headers;
      return Response.json({
        schema_version: 'mutsea.geographic-discovery/v1',
        worlds: [],
      });
    },
  });
  assert.equal(
    (await call(handler, 'worlds', { authorization: credential })).status,
    200,
  );
  assert.equal(forwarded.Authorization, undefined);
  assert.equal(
    (await call(handler, 'entry?url=https://external.invalid')).status,
    400,
  );
  assert.throws(() =>
    createLivingGateway({ ...config, mutsea_endpoint: 'http://example.com' }),
  );
});

test('scene dependencies cannot carry inherited read grants to foreign URLs', async () => {
  const { validateSceneDependencies } =
    await import('../server/living-world.js');
  const tiles = (uri) =>
    Buffer.from(
      JSON.stringify({ asset: { version: '1.1' }, root: { content: { uri } } }),
    );
  assert.doesNotThrow(() =>
    validateSceneDependencies(tiles(hash), 'application/json'),
  );
  for (const uri of [
    'https://foreign.invalid/asset',
    '//foreign.invalid/asset',
    '../config',
    'javascript:alert(1)',
    'file:///private',
  ])
    assert.throws(() =>
      validateSceneDependencies(tiles(uri), 'application/json'),
    );
});
