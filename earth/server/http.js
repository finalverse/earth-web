// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import http from 'node:http';
import { isIP } from 'node:net';
import { createHash, timingSafeEqual } from 'node:crypto';
import { VERSION } from '../core/index.js';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.gif': 'image/gif',
};
const CSP =
  "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
async function body(req, maxBytes = 16384) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))
    throw Object.assign(new Error('JSON required.'), { status: 415 });
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes)
      throw Object.assign(new Error('Request too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createEarthServer({
  core,
  planner = null,
  webRoot = null,
  worlds = [],
  operatorCore = null,
  operatorToken = null,
  publicOrigin = null,
  readyCheck = async () => true,
  logger = null,
}) {
  if (
    !!operatorCore !== !!operatorToken ||
    (operatorToken && !/^[A-Za-z0-9_-]{32,128}$/.test(operatorToken))
  )
    throw new Error(
      'Operator core and a strong token must be configured together.',
    );
  let publicURL = null;
  if (publicOrigin) {
    const u = new URL(publicOrigin);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.pathname !== '/' ||
      u.search ||
      u.hash ||
      u.port
    )
      throw new Error('An exact HTTPS public origin is required.');
    if (operatorCore)
      throw new Error('Public preview cannot expose operator registration.');
    publicURL = u;
  }
  const metrics = { requests: 0, errors: 0, queries: 0, plans: 0 };
  const rates = new Map();
  let planning = 0;
  const server = http.createServer(async (req, res) => {
    const started = performance.now(),
      requestId = crypto.randomUUID();
    metrics.requests++;
    res.setHeader('X-Request-ID', requestId);
    res.on('finish', () => {
      if (res.statusCode >= 400) metrics.errors++;
      logger?.({
        event: 'http',
        request_id: requestId,
        method: req.method,
        status: res.statusCode,
        elapsed_ms: Math.round(performance.now() - started),
      });
    });
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const send = (status, value) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify(value));
    };
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    try {
      const port = server.address().port;
      const allowed = new Set([
        `127.0.0.1:${port}`,
        `localhost:${port}`,
        `[::1]:${port}`,
      ]);
      if (publicURL) allowed.add(publicURL.host);
      if (!allowed.has(req.headers.host))
        return send(403, { error: 'Untrusted host.' });
      const origins = new Set([
        `http://127.0.0.1:${port}`,
        `http://localhost:${port}`,
        `http://[::1]:${port}`,
        ...(publicURL ? [publicURL.origin] : []),
      ]);
      if (req.headers.origin && !origins.has(req.headers.origin))
        return send(403, { error: 'Untrusted origin.' });
      const url = new URL(req.url, `http://${req.headers.host}`),
        path = url.pathname;
      if (['GET', 'HEAD'].includes(req.method) && path === '/healthz')
        return send(200, { status: 'ok', version: VERSION });
      if (['GET', 'HEAD'].includes(req.method) && path === '/readyz') {
        try {
          const ready = await readyCheck();
          return send(ready ? 200 : 503, {
            status: ready ? 'ready' : 'unavailable',
            version: VERSION,
          });
        } catch {
          return send(503, { status: 'unavailable', version: VERSION });
        }
      }
      if (['GET', 'HEAD'].includes(req.method) && path === '/metrics') {
        if (publicURL && req.headers.host === publicURL.host)
          return send(404, { error: 'Not found.' });
        return send(200, {
          ...metrics,
          uptime_s: Math.floor(process.uptime()),
        });
      }
      if (path.startsWith('/v1/')) {
        let activeCore = core;
        if (req.headers.authorization) {
          const received = Buffer.from(req.headers.authorization);
          const expected = Buffer.from(`Bearer ${operatorToken || ''}`);
          if (
            !operatorCore ||
            received.length !== expected.length ||
            !timingSafeEqual(received, expected)
          )
            return send(403, { error: 'Authorization unavailable.' });
          activeCore = operatorCore;
        }
        const now = Date.now(),
          ip =
            publicURL &&
            ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
              req.socket.remoteAddress,
            ) &&
            isIP(req.headers['x-earth-client-ip'])
              ? req.headers['x-earth-client-ip']
              : req.socket.remoteAddress;
        for (const [key, r] of rates) if (r.until < now) rates.delete(key);
        const rate = rates.get(ip) || { until: now + 60000, count: 0 };
        if (rates.size >= 256 && !rates.has(ip))
          return send(429, { error: 'Try again later.' });
        rates.set(ip, rate);
        if (++rate.count > 120) return send(429, { error: 'Try again later.' });
        if (['GET', 'HEAD'].includes(req.method) && path === '/v1/status')
          return send(200, {
            version: VERSION,
            ai_enabled: !!planner,
            worlds_enabled: worlds.length > 0,
            mutsea_required: false,
          });
        if (['GET', 'HEAD'].includes(req.method) && path === '/v1/providers')
          return send(200, { providers: activeCore.providers() });
        if (['GET', 'HEAD'].includes(req.method) && path === '/v1/layers')
          return send(200, { layers: activeCore.layers() });
        if (['GET', 'HEAD'].includes(req.method) && path === '/v1/tools')
          return send(200, { tools: activeCore.definitions() });
        if (['GET', 'HEAD'].includes(req.method) && path === '/v1/worlds')
          return send(200, { worlds });
        const match = /^\/v1\/datasets\/([a-z0-9-]+)\/features$/.exec(path);
        if (['GET', 'HEAD'].includes(req.method) && match)
          return send(200, activeCore.features(match[1]));
        if (req.method === 'POST' && path === '/v1/datasets') {
          if (activeCore !== operatorCore)
            return send(403, {
              error: 'Dataset registration capability required.',
            });
          return send(
            201,
            await activeCore.registerDataset(await body(req, 2 * 1024 * 1024)),
          );
        }
        if (req.method === 'POST' && path === '/v1/query') {
          metrics.queries++;
          return send(
            200,
            await activeCore.execute(await body(req), {
              signal: controller.signal,
            }),
          );
        }
        if (req.method === 'POST' && path === '/v1/ai/plan') {
          metrics.plans++;
          if (!planner)
            return send(503, {
              error:
                'Local AI is disabled. Deterministic tools remain available.',
            });
          if (planning >= 2) return send(429, { error: 'Local planner busy.' });
          const input = await body(req);
          if (
            !input ||
            Object.keys(input).length !== 1 ||
            typeof input.question !== 'string'
          )
            throw new Error('Question required.');
          planning++;
          try {
            const plan = await planner.propose(input.question, {
              signal: controller.signal,
            });
            // Validate proposals against the same deterministic core before returning them for review.
            await activeCore.execute(plan, { signal: controller.signal });
            return send(200, {
              plan,
              requires_review: true,
              provider: 'local-model',
            });
          } finally {
            planning--;
          }
        }
        return send(404, { error: 'Endpoint unavailable.' });
      }
      if (!['GET', 'HEAD'].includes(req.method) || !webRoot)
        return send(404, { error: 'Not found.' });
      const root = await realpath(webRoot),
        file = await realpath(
          resolve(
            root,
            `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`,
          ),
        );
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile())
        return send(404, { error: 'Not found.' });
      const content = await readFile(file);
      const etag =
        '"' + createHash('sha256').update(content).digest('hex') + '"';
      res.setHeader('ETag', etag);
      res.setHeader(
        'Cache-Control',
        path.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : path.endsWith('.html') || path === '/'
            ? 'no-cache'
            : 'public, max-age=3600',
      );
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304);
        return res.end();
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      });
      res.end(content);
    } catch (error) {
      if (controller.signal.aborted) return;
      // Dataset existence, local paths and model internals are never exposed through errors.
      send(error.status || 400, {
        error:
          error.status === 413
            ? 'Request too large.'
            : 'Request unavailable or invalid. Check the tool schema.',
      });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 40;
  server.maxConnections = 64;
  return server;
}
