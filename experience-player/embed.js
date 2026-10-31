import { validatePublication, hash, assert } from '/protocol.mjs';
const path = location.pathname.replace('/embed/', '/x/');
const parts = path.split('/');
const id = parts[2],
  version = parts[3];
const base = '/api/v1/experiences/' + id + '/versions/' + version;
const life = new AbortController();
let viewer,
  closed = false,
  count = 0;
const urls = new Set(),
  cache = new Map();
const diag = () => {
  window.finalverseEmbedReview = {
    read_only: true,
    capability_attachment: false,
    models: count,
    object_urls: urls.size,
    viewer: !!viewer && !viewer.isDestroyed(),
    api_scope: 'this exact edition and its assets',
  };
  document.body.setAttribute(
    'data-fv-resources',
    JSON.stringify(window.finalverseEmbedReview),
  );
};
async function get(h) {
  if (cache.has(h)) return cache.get(h);
  const a = publication.content.assets[h];
  assert(a, 'Unknown asset');
  const r = await fetch(base + '/assets/' + h, { signal: life.signal });
  assert(r.ok, 'Asset unavailable');
  const b = await r.arrayBuffer();
  assert(
    b.byteLength === a.byte_length && (await hash(b)) === h,
    'Asset integrity failure',
  );
  if (closed) throw new DOMException('Preview closed', 'AbortError');
  cache.set(h, b);
  return b;
}
let publication;
async function start() {
  const r = await fetch(base, { signal: life.signal });
  assert(r.ok, 'Edition unavailable');
  const verified = await validatePublication(await r.json());
  if (closed) return;
  publication = verified;
  document.getElementById('embed-title').textContent =
    publication.content.title;
  document.title = publication.content.title + ' · Finalverse preview';
  document.getElementById('embed-open').href = path;
  const scene = JSON.parse(
    new TextDecoder().decode(
      await get(publication.content.fallback.scene.sha256),
    ),
  );
  if (closed) return;
  const C = Cesium;
  viewer = new C.Viewer('embed-viewport', {
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    globe: false,
    skyBox: false,
    skyAtmosphere: false,
    baseLayer: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    contextOptions: { webgl: { alpha: false, antialias: true } },
  });
  viewer.scene.backgroundColor = C.Color.fromCssColorString('#1d303d');
  viewer.scene.light = new C.DirectionalLight({
    direction: new C.Cartesian3(0.2, -1, -0.5),
    intensity: 2.1,
  });
  viewer.resolutionScale = Math.min(devicePixelRatio, 1.5);
  const o = scene.origin_microdegrees;
  const frame = C.Transforms.localFrameToFixedFrameGenerator(
    'east',
    'up',
  )(
    C.Cartesian3.fromDegrees(
      o[1] / 1e6,
      o[0] / 1e6,
      scene.origin_height_mm / 1000,
    ),
  );
  const generated = publication.content.generated;
  const objects = generated
    ? generated.objects.map((o) => ({ hash: o.model.sha256, id: o.id, tr: o }))
    : scene.entities.map((e) => ({ hash: e.model, id: e.entity.entity_id }));
  let cursor = 0;
  async function worker() {
    while (cursor < objects.length && !closed) {
      const o = objects[cursor++],
        b = await get(o.hash);
      if (closed) return;
      const u = URL.createObjectURL(
        new Blob([b], { type: 'model/gltf-binary' }),
      );
      urls.add(u);
      let matrix = frame;
      if (o.tr) {
        const t = C.Matrix4.fromRotationTranslation(
          C.Matrix3.fromRotationY((o.tr.yaw_mdeg * Math.PI) / 180000),
          new C.Cartesian3(...o.tr.translation_mm.map((v) => v / 1000)),
        );
        matrix = C.Matrix4.multiply(frame, t, new C.Matrix4());
      }
      const m = await C.Model.fromGltfAsync({
        url: u,
        modelMatrix: matrix,
        scale: o.tr ? o.tr.scale_milli / 1000 : 1,
        upAxis: C.Axis.Z,
        forwardAxis: C.Axis.X,
        allowPicking: false,
        imageBasedLighting: new C.ImageBasedLighting({
          imageBasedLightingFactor: new C.Cartesian2(0.8, 0),
        }),
      });
      if (closed) {
        m.destroy();
        return;
      }
      viewer.scene.primitives.add(m);
      count++;
      viewer.scene.requestRender();
      diag();
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (closed) return;
  const p = generated?.graph.nodes.placement.parameters.pivot_mm || [
    0, 6000, 0,
  ];
  const target = C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(p[0] / 1000, p[1] / 1000 + 2, p[2] / 1000),
    new C.Cartesian3(),
  );
  viewer.camera.lookAt(
    target,
    new C.HeadingPitchRange(0.55, -0.65, generated ? 70 : 360),
  );
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  viewer.scene.requestRender();
  document.getElementById('embed-status').textContent =
    count +
    ' verified ' +
    (generated ? 'generated objects' : 'source entities') +
    ' · no creator credentials, authoring, audio or world operations';
  diag();
}
function close() {
  if (closed) return;
  closed = true;
  life.abort();
  if (viewer && !viewer.isDestroyed()) viewer.destroy();
  viewer = null;
  publication = null;
  count = 0;
  for (const u of urls) URL.revokeObjectURL(u);
  urls.clear();
  cache.clear();
  diag();
}
document.getElementById('embed-close').addEventListener('click', () => {
  close();
  document.getElementById('embed-status').textContent =
    'Preview closed · geometry and object URLs released';
});
window.addEventListener('pagehide', close, { once: true });
window.finalverseCloseEmbed = close;
start().catch((e) => {
  if (!closed) {
    close();
    document.getElementById('embed-status').textContent = e.message;
  }
});
