// Legacy viewer for imported Gaussian-splat places (World Labs SPZ). Native worlds use native.js;
// this module is only loaded for places whose representation is splat/world-labs-v1.
import * as THREE from './vendor/three.module.min.js';
import { SparkControls, SparkRenderer, SplatMesh } from './vendor/spark.module.min.js';
import { api } from './api.js';

async function download(url, onProgress) {
  const r = await api(url, { raw: true });
  const total = Number(r.headers.get('content-length')) || 0;
  const reader = r.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) onProgress(got / total);
  }
  const bytes = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return bytes;
}

export async function openSplats({ canvas, base, place, onProgress = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 500);
  scene.add(new SparkRenderer({ renderer }));
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();
  const bytes = await download(`${base}/assets/splats`, onProgress);
  const world = new SplatMesh({ fileBytes: bytes, fileType: 'spz' });
  // World Labs worlds are OpenCV-oriented (+y down, +z forward); three.js is +y up, -z forward.
  world.quaternion.set(1, 0, 0, 0);
  const scale = place.provenance.world?.metric_scale;
  if (scale > 0) world.scale.setScalar(scale);
  scene.add(world);
  await world.initialized;
  const controls = new SparkControls({ canvas });
  controls.fpsMovement.moveSpeed = 1.6;
  renderer.setAnimationLoop(() => {
    controls.update(camera);
    renderer.render(scene, camera);
  });
}
