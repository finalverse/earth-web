// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.gif': 'image/gif',
};
const CSP =
  "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))
    throw Object.assign(new Error('JSON required.'), { status: 415 });
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16384)
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
}) {
  const rates = new Map();
  let planning = 0;
  const server = http.createServer(async (req, res) => {
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
      if (!allowed.has(req.headers.host))
        return send(403, { error: 'Untrusted host.' });
      if (req.headers.origin && !allowed.has(new URL(req.headers.origin).host))
        return send(403, { error: 'Untrusted origin.' });
      if (
        req.headers.origin &&
        new URL(req.headers.origin).protocol !== 'http:'
      )
        return send(403, { error: 'Untrusted origin.' });
      const url = new URL(req.url, `http://${req.headers.host}`),
        path = url.pathname;
      if (path.startsWith('/v1/')) {
        const now = Date.now(),
          ip = req.socket.remoteAddress;
        for (const [key, r] of rates) if (r.until < now) rates.delete(key);
        const rate = rates.get(ip) || { until: now + 60000, count: 0 };
        if (rates.size >= 256 && !rates.has(ip))
          return send(429, { error: 'Try again later.' });
        rates.set(ip, rate);
        if (++rate.count > 120) return send(429, { error: 'Try again later.' });
        if (req.method === 'GET' && path === '/v1/status')
          return send(200, {
            version: '0.1.0',
            ai_enabled: !!planner,
            worlds_enabled: worlds.length > 0,
            mutsea_required: false,
          });
        if (req.method === 'GET' && path === '/v1/layers')
          return send(200, { layers: core.layers() });
        if (req.method === 'GET' && path === '/v1/tools')
          return send(200, { tools: core.definitions() });
        if (req.method === 'GET' && path === '/v1/worlds')
          return send(200, { worlds });
        const match = /^\/v1\/datasets\/([a-z0-9-]+)\/features$/.exec(path);
        if (req.method === 'GET' && match)
          return send(200, core.features(match[1]));
        if (req.method === 'POST' && path === '/v1/query')
          return send(
            200,
            await core.execute(await body(req), { signal: controller.signal }),
          );
        if (req.method === 'POST' && path === '/v1/ai/plan') {
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
            await core.execute(plan, { signal: controller.signal });
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
      if (req.method !== 'GET' || !webRoot)
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
