import {
  DEFAULT_VISUAL,
  QUALITY,
  paletteColor,
  intervals,
  MATERIAL_SHADER,
} from '/presentation.mjs';
import { mountCreator } from '/creator.js';
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
  metrics = new LocalMetrics(() => performance.now(), 0);
let renderCounter = 0,
  renderStarted,
  sceneInitializationMs = null,
  guideTimer,
  guideIndex = 0,
  quality = 'balanced',
  renderCpuStart,
  renderCpuSamples = [],
  rendererRemovers = [],
  creator,
  activeDocument,
  snowFrame,
  snowActive = false,
  frameProbe,
  frameSamples = [],
  authoredMarkers = [],
  publication,
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
const shaders = new Set(),
  shaderSources = new Map();
const cache = new Map(),
  urls = new Set(),
  models = new Map();
const resources = {
  active_models: 0,
  get authored_decorations() {
    return authoredMarkers.length;
  },
  get guide_timers() {
    return Number(guideTimer != null);
  },
  get render_observers() {
    return rendererRemovers.length;
  },
  get animation_frames() {
    return Number(snowFrame != null) + Number(frameProbe != null);
  },
  custom_shaders: 0,
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
    creator: creator?.snapshot() || null,
    authored: {
      lighting: activeDocument?.lighting || 'after_dark',
      visual: activeDocument?.visual || null,
      waypoints: Object.keys(activeDocument?.waypoints || {}).length,
      atmosphere: activeDocument?.atmosphere || null,
      markers: authoredMarkers.length,
      snow_active: snowActive,
    },
    frame_performance: frameSummary(),
    renderer_performance: {
      scene_initialization_ms: sceneInitializationMs,
      scene_cpu_submission_ms: intervals(renderCpuSamples),
      gpu_timings_ms: null,
      gpu_note:
        'GPU elapsed time is not available; CPU submission and rAF are measured separately',
      estimated_geometry_bytes: [...models.values()].reduce(
        (n, m) => n + (m.statistics?.geometryByteLength || 0),
        0,
      ),
      estimated_texture_bytes: [...models.values()].reduce(
        (n, m) => n + (m.statistics?.texturesByteLength || 0),
        0,
      ),
      javascript_heap_bytes: performance.memory?.usedJSHeapSize || null,
      quality,
      pixel_ratio: devicePixelRatio,
      drawing_buffer: viewer
        ? [viewer.canvas.width, viewer.canvas.height]
        : null,
      target_fps: QUALITY[quality].fps,
    },
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
function reset(view = 'district', animated = false) {
  if (!viewer || closed) return;
  const sourceEntry = publication.content.package.manifest.entry;
  const e = {
    ...sourceEntry,
    target_mm: [0, 6000, 0],
    distance_mm:
      view === 'lantern' ? 190000 : view === 'roofs' ? 360000 : 360000,
    yaw_milliradians: view === 'lantern' ? -650 : view === 'roofs' ? 1600 : 550,
    pitch_milliradians: view === 'lantern' ? 320 : view === 'roofs' ? 820 : 520,
  };
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
  const options = { destination: world, orientation: { direction, up } };
  if (animated && !matchMedia('(prefers-reduced-motion: reduce)').matches)
    viewer.camera.flyTo({ ...options, duration: 2.3 });
  else viewer.camera.setView(options);
  viewer.scene.requestRender();
}
function selectEntity(id, focus = false) {
  const next = scene.entities.find((e) => e.entity.entity_id === id);
  if (!next) return;
  if (selected && models.has(selected.entity.entity_id)) {
    const model = models.get(selected.entity.entity_id);
    model.color = baseTint(selected);
    model.customShader?.setUniform('u_selected', 0);
  }
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
  if (models.has(id)) {
    models.get(id).color = Cesium.Color.fromCssColorString('#ffd0a0');
    models.get(id).customShader?.setUniform('u_selected', 1);
  }
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
function baseTint() {
  return Cesium.Color.WHITE;
}
async function render() {
  renderStarted = performance.now();
  assert(
    window.Cesium,
    'The 3D engine is unavailable. Use the entity list below.',
  );
  Cesium.Ion.defaultAccessToken = undefined;
  viewer = new Cesium.Viewer('viewport', {
    contextOptions: { webgl: { alpha: true } },
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
  viewer.targetFrameRate = QUALITY[quality].fps;
  viewer.scene.postProcessStages.tonemapper = Cesium.Tonemapper.ACES;
  rendererRemovers.push(
    viewer.scene.preRender.addEventListener(() => {
      renderCpuStart = performance.now();
    }),
  );
  rendererRemovers.push(
    viewer.scene.postRender.addEventListener(() => {
      if (renderCpuStart !== undefined) {
        renderCpuSamples.push(performance.now() - renderCpuStart);
        if (renderCpuSamples.length > 240) renderCpuSamples.shift();
        if (++renderCounter % 30 === 0) diagnostics();
      }
    }),
  );
  const stop = () => stopGuide();
  viewer.canvas.addEventListener('pointerdown', stop, {
    signal: lifetime.signal,
  });
  viewer.canvas.addEventListener('wheel', stop, {
    signal: lifetime.signal,
    passive: true,
  });
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
          customShader: facadeShader(e),
          color: baseTint(e),
          colorBlendMode: Cesium.ColorBlendMode.MIX,
          colorBlendAmount: 0,
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
            if (readyModels === scene.entities.length) {
              allGeometryMs = Math.round(performance.now() - metrics.started);
              sceneInitializationMs = Math.round(
                performance.now() - renderStarted,
              );
            }
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
  await applyDocument(activeDocument);
  probeFrames();
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
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(
    Number($('volume').value) / 100,
    context.currentTime + 0.35,
  );
  master.connect(context.destination);
  notice('audio', '■ Stop audio');
  notice('audio-state', 'Checking approved audio…');
  await context.resume();
  try {
    for (const layer of Object.values(
      (activeDocument?.package || publication.content.package).manifest.audio
        .layers,
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
  stopGuide();
  for (const remove of rendererRemovers) remove();
  rendererRemovers = [];
  await creator?.dispose();
  lifetime.abort();
  cancelAnimationFrame(frameProbe);
  frameProbe = null;
  await stopAudio();
  if (viewer) {
    viewer._fenPickHandler?.destroy();
    viewer.destroy();
    viewer = null;
  }
  for (const shader of shaders) if (!shader.isDestroyed()) shader.destroy();
  shaders.clear();
  shaderSources.clear();
  resources.custom_shaders = 0;
  authoredMarkers = [];
  models.clear();
  resources.active_models = 0;
  resources.viewer_active = false;
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
  resources.object_urls = 0;
  cache.clear();
  for (const id of [
    'audio',
    'reset',
    'focus',
    'enter',
    'share',
    'entity',
    'view-district',
    'view-lantern',
    'view-roofs',
    'guide',
    'quality',
    'toggle-creator',
  ])
    $(id).disabled = true;
  if (show)
    notice(
      'scene-state',
      'Preview closed · audio, geometry and requests released. Reload to reopen.',
    );
  diagnostics();
}
async function share(path) {
  const result = path
    ? { path }
    : await getJson(
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
      ? 'Create your own authored version with the plan editor. Original attribution stays attached.'
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
  activeDocument = publication.content.authored?.version.document || null;
  $('experience').hidden = false;
  notice('title', publication.content.title);
  notice('description', publication.content.description);
  notice(
    'byline',
    (publication.content.authored
      ? 'A Finalverse creation'
      : 'Created by ' + publication.content.creator.creator) +
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
    'An interactive web edition. Lighting and snow are authored; city forms are source backed and may be estimated. Native world sessions and live weather are unavailable.',
  );
  creator = mountCreator({
    base: () => ({
      experience: publication.content.experience,
      version: publication.version,
    }),
    apply: applyDocument,
    share,
    diagnostics,
  });
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
// Authored material categories with bounded, inspectable PBR parameters.
function facadeShader(entity) {
  const visual = activeDocument?.visual || DEFAULT_VISUAL;
  const shader = new Cesium.CustomShader({
    uniforms: {
      u_lamp0: {
        type: Cesium.UniformType.VEC3,
        value: new Cesium.Cartesian3(),
      },
      u_lamp1: {
        type: Cesium.UniformType.VEC3,
        value: new Cesium.Cartesian3(),
      },
      u_lamp2: {
        type: Cesium.UniformType.VEC3,
        value: new Cesium.Cartesian3(),
      },
      u_lamp3: {
        type: Cesium.UniformType.VEC3,
        value: new Cesium.Cartesian3(),
      },
      u_lamps_enabled: { type: Cesium.UniformType.FLOAT, value: 0 },
      u_palette: {
        type: Cesium.UniformType.VEC3,
        value: new Cesium.Cartesian3(0.3, 0.3, 0.4),
      },
      u_kind: {
        type: Cesium.UniformType.FLOAT,
        value: entity.kind === 'building' ? 0 : entity.kind === 'road' ? 1 : 2,
      },
      u_warmth: {
        type: Cesium.UniformType.FLOAT,
        value: visual.warmth_milli / 1000,
      },
      u_snow: {
        type: Cesium.UniformType.FLOAT,
        value: visual.snow_milli / 1000,
      },
      u_haze: {
        type: Cesium.UniformType.FLOAT,
        value: visual.haze_milli / 1000,
      },
      u_glow: {
        type: Cesium.UniformType.FLOAT,
        value: visual.window_glow_milli / 1000,
      },
      u_roughness: {
        type: Cesium.UniformType.FLOAT,
        value: visual.roughness_milli / 1000,
      },
      u_metallic: {
        type: Cesium.UniformType.FLOAT,
        value: visual.metallic_milli / 1000,
      },
      u_selected: { type: Cesium.UniformType.FLOAT, value: 0 },
    },
    fragmentShaderText: MATERIAL_SHADER.replace(
      'material.emissive=glow',
      'material.emissive=vec3(.08,.28,.18)*u_selected+glow',
    ),
  });
  shaders.add(shader);
  shaderSources.set(shader, entity);
  resources.custom_shaders = shaders.size;
  return shader;
}
function stopGuide() {
  clearTimeout(guideTimer);
  guideTimer = null;
  if (viewer && !closed) viewer.camera.cancelFlight();
  notice('guide', 'Start guided views');
}
function guide() {
  if (guideTimer != null) {
    stopGuide();
    return;
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    notice('scene-state', 'Reduced motion: choose a static viewpoint.');
    return;
  }
  guideIndex = 0;
  const views = ['district', 'lantern', 'roofs'];
  const step = () => {
    if (closed || !viewer) return;
    reset(views[guideIndex++], true);
    if (guideIndex < views.length) guideTimer = setTimeout(step, 5000);
    else {
      guideTimer = null;
      notice('guide', 'Start guided views');
    }
  };
  notice('guide', 'Pause guided views');
  step();
}
function setQuality() {
  if (!viewer) return;
  const q = QUALITY[quality];
  viewer.resolutionScale = q.scale;
  viewer.targetFrameRate = q.fps;
  viewer.scene.postProcessStages.bloom.enabled = q.bloom;
  if (q.bloom) {
    const u = viewer.scene.postProcessStages.bloom.uniforms;
    u.glowOnly = false;
    u.contrast = 64;
    u.brightness = -0.35;
    u.delta = 1;
    u.sigma = 1.5;
    u.stepSize = 0.5;
  }
  viewer.scene.requestRender();
}
function frameSummary() {
  if (!frameSamples.length) return { samples: 0 };
  const sorted = [...frameSamples].sort((a, b) => a - b),
    mean = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length;
  return {
    samples: sorted.length,
    mean_interval_ms: mean,
    p50_interval_ms: sorted[Math.floor((sorted.length - 1) * 0.5)],
    p95_interval_ms: sorted[Math.floor((sorted.length - 1) * 0.95)],
    approximate_fps: 1000 / mean,
    scope:
      'requestAnimationFrame intervals during active preview; local browser, not GPU timing',
  };
}
function probeFrames() {
  cancelAnimationFrame(frameProbe);
  frameSamples = [];
  let last;
  function step(t) {
    if (closed) return;
    if (last !== undefined) frameSamples.push(t - last);
    last = t;
    if (frameSamples.length < 180) frameProbe = requestAnimationFrame(step);
    else {
      frameProbe = null;
      diagnostics();
    }
  }
  frameProbe = requestAnimationFrame(step);
}
function snow(enabled) {
  cancelAnimationFrame(snowFrame);
  snowFrame = null;
  snowActive = enabled && !closed;
  const canvas = $('snow'),
    ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!snowActive) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const particles = Array.from(
    {
      length: Math.round(
        QUALITY[quality].particles *
          ((activeDocument?.visual?.snow_milli || 500) / 1000),
      ),
    },
    (_, i) => ({
      x: (i * 0.61803398875) % 1,
      y: (i * 0.381966) % 1,
      r: 1 + (i % 3) * 0.6,
    }),
  );
  let last = performance.now(),
    lastDraw = 0;
  function step(t) {
    if (!snowActive || closed) return;
    if (t - lastDraw < 1000 / QUALITY[quality].fps - 1) {
      snowFrame = requestAnimationFrame(step);
      return;
    }
    lastDraw = t;
    const dt = Math.min(50, t - last) / 1000;
    last = t;
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(235,245,255,.67)';
    for (const p of particles) {
      if (!reduced) {
        p.y = (p.y + dt * (0.025 + p.r * 0.012)) % 1;
        p.x = (p.x + dt * 0.008) % 1;
      }
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!reduced) snowFrame = requestAnimationFrame(step);
  }
  step(performance.now());
}
async function applyDocument(document, keepAudio = false) {
  if (!keepAudio) await stopAudio();
  activeDocument =
    document || publication?.content.authored?.version.document || null;
  const isDraft =
    document && document !== publication?.content.authored?.version.document;
  notice(
    'version-badge',
    isDraft
      ? 'PRIVATE DRAFT PREVIEW'
      : publication?.content.authored
        ? 'SHARED CREATION'
        : 'VERIFIED EDITION',
  );
  notice(
    'byline',
    isDraft
      ? 'Your private draft · based on Montréal After Dark'
      : (publication.content.authored
          ? 'A Finalverse creation'
          : 'Created by ' + publication.content.creator.creator) +
          ' · edition ' +
          publication.version.slice(0, 8),
  );
  notice(
    'description',
    activeDocument?.description || publication.content.description,
  );
  const d = activeDocument,
    festival = d?.lighting === 'festival',
    daylight = d?.lighting === 'daylight';
  snow(d?.atmosphere === 'snow');
  notice(
    'title',
    d?.package.manifest.experience.presentation.title ||
      publication?.content.title ||
      'Montréal After Dark',
  );
  notice(
    'authored-label',
    d?.atmosphere === 'snow'
      ? 'Winter festival · authored snow, light & facades'
      : daylight
        ? 'Authored daylight · source-backed city'
        : 'An authored night · source-backed city',
  );
  if (!viewer || closed) {
    if (viewer) for (const e of authoredMarkers) viewer.entities.remove(e);
    authoredMarkers = [];
    $('waypoint-controls').replaceChildren();
    return;
  }
  for (const e of authoredMarkers) viewer.entities.remove(e);
  authoredMarkers = [];
  const visual = d?.visual || DEFAULT_VISUAL;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(
    daylight ? '#496276' : '#101d34',
  );
  viewer.scene.light.color = Cesium.Color.fromCssColorString(
    daylight ? '#ffead3' : '#ffe0b0',
  );
  viewer.scene.light.intensity = daylight ? 2.1 : 1.25;
  viewer.scene.light.direction = Cesium.Matrix4.multiplyByPointAsVector(
    eusMatrix(),
    new Cesium.Cartesian3(-0.5, -1, -0.4),
    new Cesium.Cartesian3(),
  );
  viewer.scene.postProcessStages.exposure = (d?.exposure_milli || 1100) / 1000;
  const canvas = $('viewport').querySelector('canvas');
  if (canvas) canvas.style.filter = 'none';
  for (const [shader, entity] of shaderSources) {
    const color = Cesium.Color.fromCssColorString(
      paletteColor(visual.palette, entity.entity.entity_id),
    );
    shader.setUniform(
      'u_palette',
      new Cesium.Cartesian3(color.red, color.green, color.blue),
    );
    for (const [key, value] of Object.entries({
      u_warmth: visual.warmth_milli,
      u_snow: visual.snow_milli,
      u_haze: visual.haze_milli,
      u_glow: visual.window_glow_milli,
      u_roughness: visual.roughness_milli,
      u_metallic: visual.metallic_milli,
    }))
      shader.setUniform(key, value / 1000);
    shader.setUniform(
      'u_selected',
      selected?.entity.entity_id === entity.entity.entity_id ? 1 : 0,
    );
  }
  for (const model of models.values()) {
    model.color = Cesium.Color.WHITE;
    model.lightColor = new Cesium.Cartesian3(
      daylight ? 1.3 : 0.9,
      daylight ? 1.2 : 0.85,
      daylight ? 1.1 : 1.0,
    );
  }
  const lampPositions = [];
  if (d?.visual) {
    const roads = scene.entities
      .filter((e) => e.kind === 'road')
      .map((e) => {
        const p = e.bounds_mm[0].map((x, i) => (x + e.bounds_mm[1][i]) / 2000);
        return { e, p, d: p[0] * p[0] + p[2] * p[2] };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, QUALITY[quality].lamps);
    for (const { p } of roads) {
      if (lampPositions.length < 4)
        lampPositions.push(new Cesium.Cartesian3(p[0], p[1] + 5.5, p[2]));
      const height = 5.5;
      const pos = Cesium.Matrix4.multiplyByPoint(
        eusMatrix(),
        new Cesium.Cartesian3(p[0], p[1] + height / 2, p[2]),
        new Cesium.Cartesian3(),
      );
      authoredMarkers.push(
        viewer.entities.add({
          position: pos,
          cylinder: {
            length: height,
            topRadius: 0.1,
            bottomRadius: 0.16,
            material: Cesium.Color.fromCssColorString('#283442'),
          },
        }),
      );
      const light = Cesium.Matrix4.multiplyByPoint(
        eusMatrix(),
        new Cesium.Cartesian3(p[0], p[1] + height, p[2]),
        new Cesium.Cartesian3(),
      );
      authoredMarkers.push(
        viewer.entities.add({
          position: light,
          ellipsoid: {
            radii: new Cesium.Cartesian3(0.65, 0.65, 0.65),
            material:
              Cesium.Color.fromCssColorString('#ffd28c').withAlpha(0.92),
          },
        }),
      );
    }
  }
  for (const shader of shaders) {
    shader.setUniform('u_lamps_enabled', d?.visual ? 1 : 0);
    for (let i = 0; i < 4; i++)
      shader.setUniform(
        'u_lamp' + i,
        lampPositions[i] || new Cesium.Cartesian3(),
      );
  }
  for (const o of Object.values(d?.objects || {})) {
    const p = o.transform.position_mm.map((x) => x / 1000),
      scale = o.transform.scale_milli / 1000;
    const position = Cesium.Matrix4.multiplyByPoint(
      eusMatrix(),
      Cesium.Cartesian3.fromArray(p),
      new Cesium.Cartesian3(),
    );
    authoredMarkers.push(
      viewer.entities.add({
        position,
        ellipsoid: {
          radii: new Cesium.Cartesian3(0.9 * scale, 0.9 * scale, 0.9 * scale),
          material: Cesium.Color.fromCssColorString('#ffd28c').withAlpha(0.9),
        },
      }),
    );
  }
  $('waypoint-controls').replaceChildren();
  for (const point of Object.values(d?.waypoints || {})) {
    assert(
      scene.entities.some((e) => e.entity.entity_id === point.entity_id),
      'Unapproved interaction anchor',
    );
    const b = el('button', point.label);
    b.addEventListener(
      'click',
      () => {
        stopGuide();
        selectEntity(point.entity_id, true);
        notice('scene-state', point.narrative);
      },
      { signal: lifetime.signal },
    );
    $('waypoint-controls').append(b);
  }
  setQuality();
  viewer.scene.requestRender();
  probeFrames();
  diagnostics();
  await new Promise((resolve) => requestAnimationFrame(resolve));
}
const on = (id, event, fn) =>
  $(id).addEventListener(event, fn, { signal: lifetime.signal });
on('enter', 'click', () => {
  metrics.event('experience_start');
  $('viewport').focus();
  $('enter').textContent = 'You’re in the experience';
  diagnostics();
});
on('entity', 'change', () => {
  stopGuide();
  selectEntity($('entity').value, true);
});
on('reset', 'click', () => {
  stopGuide();
  reset('district', true);
});
for (const [id, key] of [
  ['view-district', 'district'],
  ['view-lantern', 'lantern'],
  ['view-roofs', 'roofs'],
])
  on(id, 'click', () => {
    stopGuide();
    reset(key, true);
  });
on('guide', 'click', guide);
on('intention', 'input', stopGuide);
on('refinement', 'input', stopGuide);
on('toggle-creator', 'click', () => {
  const pane = document.querySelector('.experience-grid>aside');
  pane.hidden = !pane.hidden;
  notice('toggle-creator', pane.hidden ? 'Open creator' : 'Hide creator');
});
on('quality', 'change', () => {
  quality = $('quality').value;
  stopGuide();
  void applyDocument(activeDocument, true);
});
on(
  'focus',
  'click',
  () => selected && selectEntity(selected.entity.entity_id, true),
);
on('audio', 'click', () => void playAudio());
on('volume', 'input', () => {
  if (master && audioContext)
    master.gain.setTargetAtTime(
      Number($('volume').value) / 100,
      audioContext.currentTime,
      0.05,
    );
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
    if (document.hidden) {
      stopGuide();
      snow(false);
      if (audioContext) void stopAudio();
    } else if (!closed) snow(activeDocument?.atmosphere === 'snow');
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
