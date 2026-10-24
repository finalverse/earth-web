// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import {
  validatePublicationPin,
  validateServiceOrigin,
  validateWorldBinding,
  validateRegionMatrix,
} from '@finalverse/earth-core';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Cesium inherits resource headers. Admit only CAS-relative dependencies so a
// publication cannot redirect a caller's read grant to another origin.
export function validateSceneDependencies(bytes, type) {
  const relative = (uri) => {
    if (
      typeof uri !== 'string' ||
      !(
        /^[0-9a-f]{64}$/.test(uri) ||
        /^data:(?:application\/octet-stream|image\/(?:png|jpeg|ktx2));base64,[A-Za-z0-9+/=]+$/.test(
          uri,
        )
      )
    )
      throw Error('Unsafe scene dependency.');
  };
  if (type.includes('json')) {
    const value = JSON.parse(bytes);
    if (value.asset?.version && value.root) {
      if (value.schemaUri || value.implicitTiling)
        throw Error('Unsupported external tileset schema.');
      const stack = [value.root];
      let count = 0;
      while (stack.length) {
        const node = stack.pop();
        if (++count > 8192 || node.implicitTiling)
          throw Error('Unsupported tileset hierarchy.');
        for (const c of [
          ...(node.contents || []),
          ...(node.content ? [node.content] : []),
        ])
          relative(c.uri ?? c.url);
        stack.push(...(node.children || []));
      }
    }
  } else if (type.includes('gltf-binary')) {
    if (
      bytes.length < 20 ||
      bytes.toString('ascii', 0, 4) !== 'glTF' ||
      bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length ||
      bytes.readUInt32LE(16) !== 0x4e4f534a
    )
      throw Error('Invalid geographic GLB.');
    const length = bytes.readUInt32LE(12);
    if (length > bytes.length - 20) throw Error('Invalid geographic GLB.');
    const json = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
    for (const item of [...(json.buffers || []), ...(json.images || [])])
      if (item.uri !== undefined) relative(item.uri);
  }
}
/** Fixed configured authorities only. Private assets always use the current caller's grant. */
export function createLivingGateway(config, { request = fetch } = {}) {
  if (config.schema_version !== 'earth.living-config/v1')
    throw Error('Unsupported Living Earth configuration.');
  const pin = validatePublicationPin(config.publication);
  const spatialdb = validateServiceOrigin(config.spatialdb_endpoint),
    mutsea = validateServiceOrigin(config.mutsea_endpoint);
  const base = `/v1/scene-graphs/${pin.graph_id}/versions/${pin.version}/`;
  let active = 0;
  async function read(origin, path, authorization, signal) {
    const headers = {
      Accept: 'application/json',
      ...(origin === mutsea ? { Connection: 'close' } : {}),
    };
    if (authorization) {
      if (!/^Bearer [\x21-\x7e]{32,256}$/.test(authorization))
        throw Object.assign(Error('Invalid publication credential.'), {
          status: 401,
        });
      headers.Authorization = authorization;
    }
    const response = await request(origin + path, {
      headers,
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      cache: 'no-store',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(
        Error(
          response.status === 401 ||
            response.status === 403 ||
            response.status === 404
            ? 'This resource is unavailable for your session.'
            : 'The spatial service is unavailable.',
        ),
        { status: response.status >= 500 ? 503 : response.status },
      );
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > 4194304)
        throw Object.assign(Error('Spatial response exceeds its budget.'), {
          status: 502,
        });
      chunks.push(chunk);
    }
    return {
      bytes: Buffer.concat(chunks),
      type: response.headers.get('content-type') || 'application/octet-stream',
    };
  }
  async function discovery(signal) {
    const { bytes } = await read(
      mutsea,
      '/finalverse/geo/v1/worlds',
      null,
      signal,
    );
    const value = JSON.parse(bytes);
    if (
      value.schema_version !== 'mutsea.geographic-discovery/v1' ||
      !Array.isArray(value.worlds) ||
      value.worlds.length > 64
    )
      throw Error('Invalid world discovery.');
    for (const world of value.worlds) {
      validateWorldBinding(world.world_binding);
      validateRegionMatrix(world.world_binding, world.region_to_ecef);
      if (
        world.publication.graph_id !== pin.graph_id ||
        world.publication.version !== pin.version ||
        world.publication.frame_id !== pin.frame_id ||
        world.binding_version !== world.world_binding.version ||
        !world.terrain_matches_issued
      )
        throw Object.assign(
          Error(
            'The geographic publication or world binding changed. Rediscover before entering.',
          ),
          { status: 409 },
        );
    }
    return value;
  }
  return async function handle(req, res, url, send, signal) {
    if (!url.pathname.startsWith('/v1/living/')) return false;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!['GET', 'HEAD'].includes(req.method)) {
      send(405, {
        error: 'Living Earth discovery and delivery are read-only.',
      });
      return true;
    }
    if (active >= 12) {
      send(429, { error: 'Spatial delivery is busy; retry shortly.' });
      return true;
    }
    active++;
    try {
      const path = url.pathname.slice('/v1/living/'.length);
      if (path === 'config' && !url.search) {
        send(200, {
          schema_version: config.schema_version,
          title: config.title,
          publication: pin,
        });
        return true;
      }
      if (path === 'worlds' && !url.search) {
        send(200, await discovery(signal));
        return true;
      }
      if (path === 'entry') {
        const keys = [...url.searchParams.keys()];
        if (!(
          (keys.length === 1 &&
            keys[0] === 'spatialdb_entity' &&
            /^[0-9a-f-]{36}$/.test(url.searchParams.get(keys[0]))) ||
          (keys.length === 2 &&
            keys.includes('latitude') &&
            keys.includes('longitude') &&
            keys.every((k) => Number.isFinite(Number(url.searchParams.get(k)))))
        ))
          throw Object.assign(
            Error('A geographic point or canonical entity is required.'),
            { status: 400 },
          );
        const worlds = await discovery(signal);
        const { bytes } = await read(
          mutsea,
          '/finalverse/geo/v1/entry' + url.search,
          null,
          signal,
        );
        const value = JSON.parse(bytes);
        if (
          value.schema_version !== 'mutsea.geographic-entry/v1' ||
          !worlds.worlds.some(
            (w) =>
              w.binding_version === value.binding_version &&
              w.world_binding.region_id === value.world_binding.region_id,
          )
        )
          throw Object.assign(Error('World binding changed.'), { status: 409 });
        send(200, value);
        return true;
      }
      const asset = /^assets\/([0-9a-f]{64})$/.exec(path);
      const validQuery =
        !url.search ||
        (asset &&
          url.searchParams.size === 1 &&
          url.searchParams.get('v') === pin.version);
      if (
        !validQuery ||
        (!asset &&
          !['graph.json', 'publication.json', 'geography.json'].includes(path))
      ) {
        send(404, { error: 'Unknown spatial resource.' });
        return true;
      }
      if (!req.headers.authorization) {
        send(401, { error: 'Connect your publication read credential first.' });
        return true;
      }
      const { bytes, type } = await read(
        spatialdb,
        base + path,
        req.headers.authorization,
        signal,
      );
      if (asset && digest(bytes) !== asset[1])
        throw Error('Asset integrity failure.');
      if (asset) validateSceneDependencies(bytes, type);
      if (path === 'graph.json' && digest(bytes) !== pin.root_sha256)
        throw Error('Publication integrity failure.');
      if (path === 'publication.json') {
        const seal = JSON.parse(bytes);
        if (
          seal.graph_id !== pin.graph_id ||
          seal.version !== pin.version ||
          seal.root_sha256 !== pin.root_sha256 ||
          seal.schema_version !== 'spatialdb.geo-seal/v1'
        )
          throw Error('Publication seal mismatch.');
      }
      res.writeHead(200, { 'Content-Type': type });
      res.end(req.method === 'HEAD' ? undefined : bytes);
      return true;
    } catch (error) {
      send(error.status || 503, {
        error: error.status
          ? error.message
          : 'Spatial data is unavailable or failed integrity validation.',
      });
      return true;
    } finally {
      active--;
    }
  };
}
