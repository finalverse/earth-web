// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import * as Cesium from 'cesium';
import {
  validatePublicationPin,
  validateWorldBinding,
  validateRegionMatrix,
  validateLivingWorldHandoff,
  encodeViewerHandoff,
  validateDestination,
} from '@finalverse/earth-core';
import './living-earth.css';
const hash = async (bytes) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
export function installLivingEarth({ viewer, status }) {
  const panel = document.createElement('section');
  panel.className = 'living-earth';
  panel.setAttribute('aria-label', 'Living Montréal');
  panel.innerHTML = `<div class="section-label">LIVING EARTH · RESEARCH PREVIEW</div><h2>Montréal, alive</h2><p class="hint">Explore real terrain, buildings and streets. Enter the linked persistent world with your native account.</p><label class="living-connect">Connect publication<input type="file" accept="text/plain,.txt,.token" aria-label="Publication read credential file"></label><p class="hint">Choose your local publication credential file. Access stays in this tab and is separate from native world login.</p><div class="earth-navigation-actions"><button id="living-explore" disabled>Explore Montréal</button><button id="living-disconnect" disabled>Disconnect</button></div><p id="living-state" role="status" aria-live="polite">Checking the configured geographic scene…</p><div id="living-inspection" hidden><h3 id="living-name"></h3><p id="living-description"></p><a id="living-enter" class="living-entry" aria-disabled="true">Enter world in Finalverse</a><p class="hint">Opens the native Viewer for destination review and sign-in. Discovery grants no world permission.</p><dl id="living-metadata"></dl><details><summary>Source attribution</summary><p id="living-attribution"></p></details></div>`;
  document.querySelector('aside').prepend(panel);
  const $ = (id) => panel.querySelector('#' + id);
  let config,
    token = '',
    tileset,
    geography,
    worlds,
    controller,
    pendingReturn,
    lastPoint,
    generation = 0,
    pickSequence = 0;
  const previousSources = new Map();
  let previousGlobe = true;
  const state = (text) => {
    $('living-state').textContent = text;
    status(text);
  };
  function clearSelection() {
    $('living-inspection').hidden = true;
    $('living-enter').removeAttribute('href');
    $('living-enter').setAttribute('aria-disabled', 'true');
    for (const key of ['selectedEntity', 'handoff', 'returnDestination'])
      delete panel.dataset[key];
  }
  function dispose() {
    generation++;
    pickSequence++;
    controller?.abort();
    controller = null;
    if (tileset) {
      viewer.scene.primitives.remove(tileset);
      tileset = null;
    }
    for (const [source, show] of previousSources)
      if (viewer.dataSources.contains(source)) source.show = show;
    previousSources.clear();
    viewer.scene.globe.show = previousGlobe;
    clearSelection();
    panel.dataset.sceneReady = 'false';
    panel.dataset.rendererBytes = '0';
    panel.dataset.tilesLoaded = 'false';
    viewer.scene.requestRender();
  }
  async function get(
    path,
    { authorized = false, signal = controller?.signal } = {},
  ) {
    const response = await fetch('/v1/living/' + path, {
      headers: {
        Accept: 'application/json',
        ...(authorized ? { Authorization: 'Bearer ' + token } : {}),
      },
      signal,
      redirect: 'error',
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(
        response.status === 401 ||
          response.status === 403 ||
          response.status === 404
          ? 'This place is unavailable for your session. Reconnect your publication credential.'
          : 'The geographic service is unavailable or its binding changed.',
      );
    }
    const reader = response.body.getReader();
    let length = 0;
    const parts = [];
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 4194304)
          throw Error('Spatial response exceeds its budget.');
        parts.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return { bytes, json: JSON.parse(new TextDecoder().decode(bytes)) };
  }
  const pointPosition = (p) =>
    Cesium.Cartesian3.fromDegrees(
      p.longitude_degrees,
      p.latitude_degrees,
      p.height_metres,
    );
  function fly(position, height = 700) {
    viewer.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(pointPosition(position), 60),
      {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(19.3),
          -0.9,
          height,
        ),
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 0
          : 0.9,
      },
    );
    viewer.scene.requestRender();
  }
  async function inspectFeature(feature, original, sequence = ++pickSequence) {
    const epoch = generation;
    const entry = (
      await get(
        'entry?spatialdb_entity=' + encodeURIComponent(feature.entity_id),
      )
    ).json;
    if (epoch !== generation || sequence !== pickSequence || !tileset) return;
    const world = worlds.worlds.find(
      (w) =>
        w.binding_version === entry.binding_version &&
        w.world_binding.region_id === entry.world_binding.region_id,
    );
    if (!world)
      throw Error('The world binding changed. Explore this place again.');
    validateWorldBinding(entry.world_binding);
    validateRegionMatrix(entry.world_binding, world.region_to_ecef);
    const returned = original || {
      schema_version: 'earth.navigation/v1',
      kind: 'entity',
      address: 'usap://spatialdb/entity/' + feature.entity_id,
    };
    const handoff = validateLivingWorldHandoff({
      schema_version: 'earth.world-handoff/v1',
      request_id: crypto.randomUUID(),
      world_binding: entry.world_binding,
      world_entry: entry.target.world_entry,
      publication: config.publication,
      connection: { protocol: 'opensim.login/v1', ...entry.target.login },
      return_to: { origin: location.origin, destination: returned },
    });
    $('living-inspection').hidden = false;
    $('living-name').textContent = feature.label;
    $('living-description').textContent =
      `${feature.kind} · ${feature.geometry_status}. ${feature.kind === 'building' ? 'Height is estimated from surface and terrain data.' : ''}`;
    const dl = $('living-metadata');
    dl.replaceChildren();
    for (const [name, value] of [
      ['Identity', 'usap://spatialdb/entity/' + feature.entity_id],
      ['Publication', config.publication.version],
      ['Source feature', feature.source_feature_id],
      ['World', world.region_name],
      [
        'Standing place',
        entry.target.on?.find((f) => f.kind === 'road')?.label ||
          'Native ground',
      ],
    ]) {
      const dt = document.createElement('dt'),
        dd = document.createElement('dd');
      dt.textContent = name;
      dd.textContent = value;
      dl.append(dt, dd);
    }
    $('living-attribution').textContent = geography.sources
      .map((s) => s.attribution + ' (' + s.license + ')')
      .join('\n');
    $('living-enter').href = encodeViewerHandoff(handoff);
    $('living-enter').setAttribute('aria-disabled', 'false');
    panel.dataset.selectedEntity = feature.entity_id;
    panel.dataset.handoff = JSON.stringify(handoff);
    panel.dataset.returnDestination = JSON.stringify(returned);
    state(
      'Building selected. Review its provenance, then enter the linked world.',
    );
  }
  async function inspectAt(position) {
    const epoch = generation,
      sequence = ++pickSequence;
    clearSelection();
    const q = await get(
      `entry?latitude=${position.latitude_degrees}&longitude=${position.longitude_degrees}`,
    );
    const target = q.json.target;
    if (epoch !== generation || sequence !== pickSequence || !tileset) return;
    const feature =
      (target.on || []).find((f) => f.kind === 'building') ||
      (target.feature?.kind === 'building' ? target.feature : null);
    if (!feature) {
      state(
        'Terrain or street selected. Choose a building to inspect its identity and linked world.',
      );
      return;
    }
    const source = geography.features.find(
      (f) => f.entity_id === feature.entity_id,
    );
    if (!source)
      throw Error('Geographic feature does not belong to this publication.');
    lastPoint = position;
    await inspectFeature(
      source,
      { schema_version: 'earth.navigation/v1', kind: 'geographic', position },
      sequence,
    );
  }
  async function explore() {
    if (!config || !token) {
      state(
        'Connect your publication credential file to explore the real Montréal scene.',
      );
      return;
    }
    dispose();
    delete panel.dataset.tileError;
    delete panel.dataset.tileErrorMessage;
    delete panel.dataset.firstVisibleMs;
    controller = new AbortController();
    const signal = controller.signal;
    state('Loading verified Montréal geography…');
    const started = performance.now();
    try {
      const [root, seal, geo, discovery] = await Promise.all([
        get('graph.json', { authorized: true, signal }),
        get('publication.json', { authorized: true, signal }),
        get('geography.json', { authorized: true, signal }),
        get('worlds', { signal }),
      ]);
      signal.throwIfAborted();
      if (
        (await hash(root.bytes)) !== config.publication.root_sha256 ||
        (await hash(geo.bytes)) !== seal.json.geography.sha256 ||
        root.json.version !== config.publication.version ||
        root.json.schema_version !== 'spatialdb.scene-graph/v3' ||
        JSON.stringify(root.json.placement.origin) !==
          JSON.stringify(config.publication.origin)
      )
        throw Error('Geographic publication integrity failed.');
      geography = geo.json;
      worlds = discovery.json;
      if (!worlds.worlds.length)
        throw Error('No bound world is available for this scene.');
      const resource = new Cesium.Resource({
        url: '/v1/living/assets/' + root.json.tileset.sha256,
        headers: { Authorization: 'Bearer ' + token },
      });
      const next = await Cesium.Cesium3DTileset.fromUrl(resource, {
        maximumScreenSpaceError: 4,
        cacheBytes: 32 * 1024 * 1024,
        maximumCacheOverflowBytes: 16 * 1024 * 1024,
      });
      if (signal.aborted) {
        next.destroy();
        return;
      }
      previousGlobe = viewer.scene.globe.show;
      viewer.scene.globe.show = false;
      for (let i = 0; i < viewer.dataSources.length; i++) {
        const source = viewer.dataSources.get(i);
        previousSources.set(source, source.show);
        source.show = false;
      }
      tileset = viewer.scene.primitives.add(next);
      let first = true;
      next.tileVisible.addEventListener(() => {
        if (first) {
          first = false;
          panel.dataset.firstVisibleMs = (performance.now() - started).toFixed(
            2,
          );
        }
      });
      next.tileFailed.addEventListener((error) => {
        panel.dataset.tileError = 'true';
        panel.dataset.tileErrorMessage = String(error.message).slice(0, 512);
        queueMicrotask(() => {
          if (tileset === next) {
            dispose();
            state(
              'A scene tile is unavailable. Reconnect to revalidate access.',
            );
          }
        });
      });
      panel.dataset.publicationVersion = root.json.version;
      panel.dataset.rootSha = config.publication.root_sha256;
      panel.dataset.sceneReady = 'true';
      if (pendingReturn?.kind === 'geographic')
        fly(pendingReturn.position, 500);
      else fly(config.publication.origin, 900);
      state(
        'Real Montréal terrain, buildings and roads are streaming. Click a building to inspect it.',
      );
      if (pendingReturn?.kind === 'entity') {
        const f = geography.features.find(
          (f) =>
            'usap://spatialdb/entity/' + f.entity_id === pendingReturn.address,
        );
        if (f) await inspectFeature(f, pendingReturn);
      } else if (pendingReturn?.kind === 'geographic')
        await inspectAt(pendingReturn.position);
    } catch (error) {
      if (!signal.aborted) {
        dispose();
        state(error.message);
      }
    }
  }
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(async (event) => {
    if (!tileset || !viewer.scene.pickPositionSupported) return;
    panel.dataset.lastPick = 'click';
    const picked = viewer.scene.pick(event.position);
    if (!picked) {
      panel.dataset.lastPick = 'no-rendered-hit';
      return;
    }
    const world = viewer.scene.pickPosition(event.position);
    if (!world) {
      panel.dataset.lastPick = 'no-depth-position';
      return;
    }
    panel.dataset.lastPick = 'depth-hit';
    const p = Cesium.Cartographic.fromCartesian(world);
    const position = {
      longitude_degrees: Cesium.Math.toDegrees(p.longitude),
      latitude_degrees: Cesium.Math.toDegrees(p.latitude),
      height_metres: p.height,
    };
    const bounds = geography.geographic_bounds;
    if (
      position.longitude_degrees < bounds[0] ||
      position.longitude_degrees > bounds[2] ||
      position.latitude_degrees < bounds[1] ||
      position.latitude_degrees > bounds[3]
    )
      return;
    try {
      await inspectAt(position);
    } catch (error) {
      state(error.message);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  panel.querySelector('input').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 257)
        throw Error('Select a bounded publication credential file.');
      const value = (await file.text()).trim();
      if (!/^[\x21-\x7e]{32,256}$/.test(value))
        throw Error('Invalid publication read credential.');
      token = value;
      $('living-explore').disabled = false;
      $('living-disconnect').disabled = false;
      await explore();
    } catch (error) {
      state(error.message);
    }
  });
  $('living-explore').addEventListener('click', explore);
  $('living-disconnect').addEventListener('click', () => {
    dispose();
    token = '';
    $('living-explore').disabled = true;
    $('living-disconnect').disabled = true;
    state(
      'Publication disconnected. Native world sessions are managed separately.',
    );
  });
  get('config', { signal: AbortSignal.timeout(5000) })
    .then(({ json }) => {
      config = json;
      validatePublicationPin(config.publication);
      state(
        'Montréal is ready. Connect your publication read credential to explore.',
      );
      const raw = new URLSearchParams(location.hash.slice(1)).get(
        'earth_return',
      );
      if (raw) {
        if (raw.length > 1024)
          throw Error('Return destination exceeds budget.');
        pendingReturn = validateDestination(JSON.parse(raw));
        panel.dataset.returned = 'true';
        if (pendingReturn.kind === 'geographic')
          fly(pendingReturn.position, 800);
        state(
          'Returned to your original Earth location. Connect your publication credential to restore the detailed scene.',
        );
      }
    })
    .catch(() => {
      panel.hidden = true;
    });
  viewer.scene.postRender.addEventListener(() => {
    if (tileset) {
      panel.dataset.rendererBytes = String(tileset.totalMemoryUsageInBytes);
      panel.dataset.tilesLoaded = String(tileset.tilesLoaded);
    }
    if (lastPoint) {
      const screen = Cesium.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        pointPosition(lastPoint),
      );
      if (screen)
        panel.dataset.selectedScreen = JSON.stringify({
          x: screen.x,
          y: screen.y,
        });
    }
  });
  setInterval(async () => {
    if (!tileset || !controller) return;
    const epoch = generation;
    try {
      await get('publication.json', { authorized: true });
    } catch {
      if (epoch === generation) {
        dispose();
        state(
          'Publication access could not be revalidated. Reconnect to restore the scene.',
        );
      }
    }
  }, 10000);
  return { explore };
}
