import {
  assert,
  parseEntry,
  validatePublication,
  verifyAsset,
  readBounded,
  MAX_DOCUMENT,
  LocalMetrics,
  hashValue,
} from '/protocol.mjs';
const $ = (id) => document.getElementById(id);
const lifetime = new AbortController(),
  metrics = new LocalMetrics();
let publication,
  scene,
  viewer,
  selected,
  closed = false,
  modelCount = 0,
  readyModels = 0,
  firstGeometryMs = null,
  allGeometryMs = null,
  verifiedBytes = 0,
  audioContext,
  master,
  sources = [],
  audioGeneration = 0;
const cache = new Map(),
  urls = new Set(),
  models = new Map();
const resources = {
  active_models: 0,
  object_urls: 0,
  audio_contexts: 0,
  audio_sources: 0,
  viewer_active: false,
  inflight_assets: 0,
};
function notice(id, text) {
  $(id).textContent = text;
}
function diagnostics() {
  const value = {
    schema: 'finalverse.web-player-review/v1',
    environment: {
      user_agent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight },
    },
    status: closed ? 'closed' : readyModels > 0 ? 'ready' : 'loading',
    geometry_ready: readyModels,
    first_geometry_ms: firstGeometryMs,
    all_geometry_ms: allGeometryMs,
    experience: publication?.content.experience,
    version: publication?.version,
    manifest_schema:
      publication?.content.package.manifest.experience.schema_version,
    renderer: viewer ? 'Cesium ' + Cesium.VERSION : 'accessible entity list',
    source_entities: scene?.entities.length || 0,
    selected_entity: selected?.entity || null,
    verified_assets: cache.size,
    verified_asset_bytes: verifiedBytes,
    resources: { ...resources },
    metrics: metrics.snapshot(),
    unsupported_capabilities:
      publication?.content.fallback.unsupported_capabilities || [],
  };
  notice('diagnostics', JSON.stringify(value, null, 2));
  return value;
}
async function getJson(url) {
  const r = await fetch(url, {
    signal: lifetime.signal,
    credentials: 'omit',
    cache: 'no-cache',
  });
  assert(
    (r.headers.get('content-type') || '').startsWith('application/json'),
    'Expected registry JSON',
  );
  return JSON.parse(
    new TextDecoder().decode(await readBounded(r, MAX_DOCUMENT)),
  );
}
function api(suffix = '') {
  return (
    '/api/v1/experiences/' +
    encodeURIComponent(publication.content.experience) +
    '/versions/' +
    publication.version +
    suffix
  );
}
function asset(sha) {
  if (cache.has(sha)) return cache.get(sha);
  const ref = publication.content.assets[sha];
  assert(ref, 'Asset is not part of this publication');
  const task = (async () => {
    resources.inflight_assets++;
    try {
      const r = await fetch(api('/assets/' + sha), {
        signal: lifetime.signal,
        credentials: 'omit',
        cache: 'no-cache',
      });
      const bytes = await readBounded(r, ref.byte_length);
      await verifyAsset(ref, bytes, r.headers.get('content-type') || '');
      assert(!closed, 'Preview closed');
      verifiedBytes += bytes.byteLength;
      return bytes;
    } finally {
      resources.inflight_assets--;
      diagnostics();
    }
  })();
  cache.set(sha, task);
  return task;
}
function el(tag, text, className) {
  const n = document.createElement(tag);
  n.textContent = text;
  if (className) n.className = className;
  return n;
}
function showError(error) {
  if (closed) return;
  notice('error-message', error.message || 'This edition could not be opened.');
  $('error').hidden = false;
  $('experience').hidden = true;
  $('landing').hidden = true;
  void dispose(false);
}
function eusMatrix() {
  const o = scene.origin_microdegrees;
  const origin = Cesium.Cartesian3.fromDegrees(
    o[1] / 1e6,
    o[0] / 1e6,
    scene.origin_height_mm / 1000,
  );
  return Cesium.Transforms.localFrameToFixedFrameGenerator(
    'east',
    'up',
  )(origin);
}
function reset() {
  if (!viewer || closed) return;
  const e = publication.content.package.manifest.entry;
  const target = Cesium.Matrix4.multiplyByPoint(
    eusMatrix(),
    Cesium.Cartesian3.fromArray(e.target_mm.map((v) => v / 1000)),
    new Cesium.Cartesian3(),
  );
  const yaw = e.yaw_milliradians / 1000,
    pitch = e.pitch_milliradians / 1000,
    d = e.distance_mm / 1000;
  const local = new Cesium.Cartesian3(
    d * Math.sin(yaw) * Math.cos(pitch),
    d * Math.sin(pitch),
    d * Math.cos(yaw) * Math.cos(pitch),
  );
  const world = Cesium.Matrix4.multiplyByPoint(
    eusMatrix(),
    Cesium.Cartesian3.add(
      Cesium.Cartesian3.fromArray(e.target_mm.map((v) => v / 1000)),
      local,
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  );
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(target, world, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const up = Cesium.Matrix4.multiplyByPointAsVector(
    eusMatrix(),
    Cesium.Cartesian3.UNIT_Y,
    new Cesium.Cartesian3(),
  );
  viewer.camera.setView({ destination: world, orientation: { direction, up } });
  viewer.scene.requestRender();
}
function selectEntity(id, focus = false) {
  const next = scene.entities.find((e) => e.entity.entity_id === id);
  if (!next) return;
  if (selected && models.has(selected.entity.entity_id))
    models.get(selected.entity.entity_id).color = baseTint(selected);
  selected = next;
  $('entity').value = id;
  const box = $('selection');
  box.replaceChildren(el('h2', next.label), el('code', next.entity.address));
  const dl = document.createElement('dl');
  for (const [label, value] of [
    ['Source identity', next.source_feature_id],
    ['Geometry quality', next.geometry_status],
    ['Source dataset', next.source_id],
    ['Provenance', next.source_notes || 'No additional source notes supplied.'],
  ]) {
    dl.append(el('dt', label), el('dd', value));
  }
  box.append(dl);
  if (models.has(id))
    models.get(id).color = Cesium.Color.fromCssColorString('#ffd0a0');
  $('focus').disabled = !viewer;
  metrics.meaningful();
  if (focus && viewer) {
    const b = next.bounds_mm,
      center = b[0].map((v, i) => (v + b[1][i]) / 2000);
    const target = Cesium.Matrix4.multiplyByPoint(
      eusMatrix(),
      Cesium.Cartesian3.fromArray(center),
      new Cesium.Cartesian3(),
    );
    viewer.camera.lookAt(
      target,
      new Cesium.HeadingPitchRange(
        0.5,
        -0.55,
        Math.max(
          45,
          Math.hypot(...b[1].map((v, i) => (v - b[0][i]) / 1000)) * 2.5,
        ),
      ),
    );
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }
  diagnostics();
}
function baseTint(entity) {
  return Cesium.Color.fromCssColorString(
    entity.kind === 'building'
      ? '#8d9bbd'
      : entity.kind === 'road'
        ? '#6d809c'
        : '#678b90',
  );
}
async function render() {
  assert(
    window.Cesium,
    'The 3D engine is unavailable. Use the entity list below.',
  );
  Cesium.Ion.defaultAccessToken = undefined;
  viewer = new Cesium.Viewer('viewport', {
    baseLayer: false,
    globe: false,
    skyBox: false,
    skyAtmosphere: false,
    sun: false,
    moon: false,
    geocoder: false,
    baseLayerPicker: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    vrButton: false,
    homeButton: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    infoBox: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
  });
  resources.viewer_active = true;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#152230');
  viewer.scene.highDynamicRange = true;
  viewer.scene.light = new Cesium.DirectionalLight({
    direction: new Cesium.Cartesian3(-0.4, -0.3, -1),
    color: Cesium.Color.fromCssColorString('#f9d0ae'),
    intensity: 1.0,
  });
  reset();
  const matrix = eusMatrix();
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((pos) => {
    const picked = viewer.scene.pick(pos.position);
    const id = picked?.id;
    if (typeof id === 'string') selectEntity(id);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  viewer._fenPickHandler = handler;
  let cursor = 0;
  const failures = [];
  async function worker() {
    while (cursor < scene.entities.length && !closed) {
      const e = scene.entities[cursor++];
      try {
        const b = await asset(e.model);
        if (closed) return;
        const url = URL.createObjectURL(
          new Blob([b], { type: 'model/gltf-binary' }),
        );
        urls.add(url);
        resources.object_urls = urls.size;
        const model = await Cesium.Model.fromGltfAsync({
          url,
          modelMatrix: matrix,
          id: e.entity.entity_id,
          upAxis: Cesium.Axis.Z,
          forwardAxis: Cesium.Axis.X,
          allowPicking: true,
          lightColor: new Cesium.Cartesian3(0.7, 0.85, 1.2),
          color: baseTint(e),
          colorBlendMode: Cesium.ColorBlendMode.MIX,
          colorBlendAmount: 0.35,
          imageBasedLighting: new Cesium.ImageBasedLighting({
            imageBasedLightingFactor: new Cesium.Cartesian2(0.45, 0),
          }),
        });
        if (closed) {
          model.destroy();
          return;
        }
        viewer.scene.primitives.add(model);
        models.set(e.entity.entity_id, model);
        modelCount++;
        resources.active_models = models.size;
        notice(
          'scene-state',
          modelCount +
            ' / ' +
            scene.entities.length +
            ' source entities · integrity checked',
        );
        model.readyEvent.addEventListener(() => {
          if (!closed) {
            readyModels++;
            if (firstGeometryMs === null)
              firstGeometryMs = Math.round(performance.now() - metrics.started);
            if (readyModels === scene.entities.length)
              allGeometryMs = Math.round(performance.now() - metrics.started);
            metrics.meaningful();
            diagnostics();
          }
        });
        if (selected?.entity.entity_id === e.entity.entity_id)
          model.color = Cesium.Color.fromCssColorString('#ffd0a0');
        viewer.scene.requestRender();
      } catch (error) {
        if (!closed) failures.push(error.message);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  if (closed) return;
  assert(
    modelCount > 0,
    '3D is unavailable; the accessible entity list remains usable.',
  );
  notice(
    'scene-state',
    failures.length
      ? modelCount +
          ' entities loaded · ' +
          failures.length +
          ' could not be rendered'
      : scene.entities.length + ' source identities · verified geometry',
  );
  if (failures.length)
    notice(
      'capability-status',
      'Some geometry is unavailable. Source metadata and selection remain available.',
    );
  $('reset').disabled = false;
  $('focus').disabled = !selected;
  diagnostics();
}
async function stopAudio() {
  audioGeneration++;
  for (const s of sources) {
    try {
      s.stop();
    } catch {}
    s.disconnect();
  }
  sources = [];
  resources.audio_sources = 0;
  if (master) {
    master.disconnect();
    master = null;
  }
  const old = audioContext;
  audioContext = null;
  resources.audio_contexts = 0;
  if (old) await old.close().catch(() => {});
  notice('audio', '▶ Play original score');
  notice(
    'audio-state',
    'Playback stopped. Press play to authorize audio again.',
  );
  diagnostics();
}
async function playAudio() {
  if (audioContext) {
    await stopAudio();
    return;
  }
  if (closed) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    notice('audio-state', 'This browser does not support the audio preview.');
    return;
  }
  const generation = ++audioGeneration;
  audioContext = new Ctx();
  const context = audioContext;
  resources.audio_contexts = 1;
  master = context.createGain();
  master.gain.value = Number($('volume').value) / 100;
  master.connect(context.destination);
  notice('audio', '■ Stop audio');
  notice('audio-state', 'Checking approved audio…');
  await context.resume();
  try {
    for (const layer of Object.values(
      publication.content.package.manifest.audio.layers,
    ).filter((l) => l.contexts.includes('earth'))) {
      const ref = publication.content.package.assets[layer.asset];
      const bytes = await asset(ref.sha256);
      const decoded = await context.decodeAudioData(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      );
      if (closed || generation !== audioGeneration) return;
      const node = context.createBufferSource(),
        gain = context.createGain();
      node.buffer = decoded;
      node.loop = layer.looping;
      gain.gain.value = layer.gain_milli / 1000;
      node.connect(gain);
      gain.connect(master);
      sources.push(node, gain);
    }
    if (closed || generation !== audioGeneration) return;
    for (const s of sources) if (s instanceof AudioBufferSourceNode) s.start();
    resources.audio_sources = sources.filter(
      (s) => s instanceof AudioBufferSourceNode,
    ).length;
    metrics.event('audio_activation');
    notice(
      'audio-state',
      'Playing approved original audio · stereo preview mix. Native spatial acoustics are unavailable.',
    );
    diagnostics();
  } catch (e) {
    await stopAudio();
    notice('audio-state', 'Audio unavailable: ' + e.message);
  }
}
async function dispose(show = true) {
  if (closed) return;
  closed = true;
  lifetime.abort();
  await stopAudio();
  if (viewer) {
    viewer._fenPickHandler?.destroy();
    viewer.destroy();
    viewer = null;
  }
  models.clear();
  resources.active_models = 0;
  resources.viewer_active = false;
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
  resources.object_urls = 0;
  cache.clear();
  for (const id of ['audio', 'reset', 'focus', 'enter', 'share', 'entity'])
    $(id).disabled = true;
  if (show)
    notice(
      'scene-state',
      'Preview closed · audio, geometry and requests released. Reload to reopen.',
    );
  diagnostics();
}
async function share() {
  const result = await getJson(
    api('/link') + (selected ? '?entity=' + selected.entity.entity_id : ''),
  );
  assert(result.path.startsWith('/x/'), 'Invalid share path');
  $('share-link').value = new URL(result.path, location.origin).href;
  $('share-panel').hidden = false;
  $('share-link').focus();
  $('share-link').select();
  metrics.event('share_action');
  diagnostics();
}
function attribution() {
  const box = $('attribution'),
    items = [
      publication.content.creator,
      ...publication.content.package.manifest.spatial.provenance,
      ...Object.values(publication.content.package.assets).map(
        (a) => a.provenance,
      ),
    ];
  for (const item of items) {
    const div = el('div', '', 'rights');
    div.append(
      el('strong', item.creator),
      el('p', item.attribution),
      el('small', item.license),
    );
    box.append(div);
  }
  notice(
    'remix',
    publication.content.remix_permission === 'with_attribution'
      ? 'Remix permitted with attribution. This milestone preserves derivative metadata; a web remix editor is not included.'
      : 'The publisher has not granted remix permission.',
  );
  const parent = publication.content.parent;
  if (parent) {
    const a = el('a', 'View parent edition');
    a.href =
      '/x/' + encodeURIComponent(parent.experience) + '/' + parent.version;
    $('parent').append(a);
  } else
    notice('parent', 'Original reference edition · no parent publication.');
}
async function openExperience() {
  const entry = parseEntry(location.href);
  metrics.event('open_from_share');
  const record = await getJson(
    '/api/v1/experiences/' +
      encodeURIComponent(entry.id) +
      '/versions/' +
      entry.version,
  );
  publication = await validatePublication(record, entry);
  $('experience').hidden = false;
  notice('title', publication.content.title);
  notice('description', publication.content.description);
  notice(
    'byline',
    'Created by ' +
      publication.content.creator.creator +
      ' · immutable edition ' +
      publication.version.slice(0, 8),
  );
  document.title = publication.content.title + ' · Finalverse';
  attribution();
  const bytes = await asset(publication.content.fallback.scene.sha256);
  scene = JSON.parse(new TextDecoder().decode(bytes));
  assert(
    scene.schema_version === 'finalverse.web-scene/v1' &&
      scene.source_root_sha256 ===
        publication.content.package.manifest.spatial.root_sha256 &&
      scene.entities.length <= 139,
    'Unsupported or mismatched source preview',
  );
  assert(
    (await hashValue(scene.publication)) ===
      (await hashValue(publication.content.package.manifest.spatial)),
    'Source publication differs',
  );
  for (const e of scene.entities) {
    assert(
      publication.content.assets[e.model]?.media_type === 'model/gltf-binary' &&
        e.entity.authority === 'spatialdb',
      'Unsupported entity resource',
    );
    const option = el('option', e.kind + ' · ' + e.source_feature_id);
    option.value = e.entity.entity_id;
    $('entity').append(option);
  }
  $('entity').disabled = false;
  $('audio').disabled = false;
  $('share').disabled = false;
  $('enter').disabled = false;
  if (entry.entity) {
    assert(
      scene.entities.some((e) => e.entity.entity_id === entry.entity),
      'Shared entity is not in the preview',
    );
    selectEntity(entry.entity);
  }
  notice(
    'capability-status',
    'Web edition: explore, select, provenance and consented audio. World sessions, live Terra queries and native renderer/spatial audio capabilities are unavailable here.',
  );
  metrics.event('preview_load_success');
  metrics.meaningful();
  diagnostics();
  try {
    await render();
  } catch (e) {
    notice('scene-state', e.message + ' Use the accessible entity list.');
    diagnostics();
  }
}
async function landing() {
  $('landing').hidden = false;
  const records = await getJson('/api/v1/publications');
  for (const r of records) {
    const p = await validatePublication(r);
    const a = el('a', '', 'publication-card');
    a.href = '/x/' + encodeURIComponent(p.content.experience) + '/' + p.version;
    a.append(
      el('p', 'MONTRÉAL · OLD PORT', 'eyebrow'),
      el('h2', p.content.title),
      el('p', p.content.description),
      el('span', 'Open experience ↗'),
    );
    $('publications').append(a);
  }
  notice(
    'landing-status',
    records.length
      ? 'Public editions · original attribution included'
      : 'No public experiences are available yet.',
  );
}
const on = (id, event, fn) =>
  $(id).addEventListener(event, fn, { signal: lifetime.signal });
on('enter', 'click', () => {
  metrics.event('experience_start');
  $('viewport').focus();
  $('enter').textContent = 'You’re in the experience';
  diagnostics();
});
on('entity', 'change', () => selectEntity($('entity').value, true));
on('reset', 'click', reset);
on(
  'focus',
  'click',
  () => selected && selectEntity(selected.entity.entity_id, true),
);
on('audio', 'click', () => void playAudio());
on('volume', 'input', () => {
  if (master) master.gain.value = Number($('volume').value) / 100;
});
on('close', 'click', () => void dispose());
on('share', 'click', () =>
  share().catch((e) => notice('scene-state', e.message)),
);
on('share-close', 'click', () => {
  $('share-panel').hidden = true;
  $('share').focus();
});
on('copy', 'click', async () => {
  try {
    await navigator.clipboard.writeText($('share-link').value);
    notice('share-status', 'Link copied. Share this exact edition.');
  } catch {
    notice('share-status', 'Select and copy the link above.');
  }
});
on('metrics-consent', 'change', () => {
  try {
    if ($('metrics-consent').checked) {
      metrics.returnVisitMeasured = true;
      if (localStorage.getItem('fen:visited') === '1')
        metrics.event('return_visit');
      localStorage.setItem('fen:visited', '1');
    } else {
      localStorage.removeItem('fen:visited');
      metrics.returnVisitMeasured = false;
    }
    diagnostics();
  } catch {
    notice(
      'capability-status',
      'Local visit storage is unavailable; no visit bit was saved.',
    );
  }
});
on('export', 'click', () => {
  const data = new Blob([JSON.stringify(diagnostics(), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'finalverse-preview-review.json';
  a.click();
  URL.revokeObjectURL(url);
});
document.addEventListener(
  'visibilitychange',
  () => {
    if (document.hidden && audioContext) void stopAudio();
  },
  { signal: lifetime.signal },
);
window.addEventListener('pagehide', () => void dispose(false), { once: true });
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape' && !$('share-panel').hidden) {
      $('share-panel').hidden = true;
      $('share').focus();
    }
    if (e.key === 'Tab' && !$('share-panel').hidden) {
      const focusable = [$('share-link'), $('copy'), $('share-close')];
      const first = focusable[0],
        last = focusable[2];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    }
  },
  { signal: lifetime.signal },
);
if (location.pathname === '/') landing().catch(showError);
else openExperience().catch(showError);
