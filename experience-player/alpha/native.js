// Finalverse native world renderer for browsers: editable mesh geometry with physically based
// materials, a physical sky that also lights the scene, sun shadows, object lights that move with
// their objects, contact ambient occlusion, bloom, AgX tone mapping and snowfall.
// It renders a finalverse.native-world/v1 document; FinalStorm renders the same document natively.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/addons/postprocessing/RenderPass.js';
import { GTAOPass } from './vendor/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from './vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/addons/postprocessing/OutputPass.js';

const RAD = Math.PI / 180;
const asset = (sha) => `/api/v1/alpha/assets/${sha}`;
// Calibration against FinalStorm captures of the same documents and cameras. Documents keep
// FinalStorm's values (exposure, environment intensity); these map them onto this renderer.
// Sky light here has no room occlusion, so it is kept low indoors and the sun and lamps carry the
// scene, as in FinalStorm's output.
const SKY_SCALE = 0.55;
const SUN_LUX = 3.4;
const EXPOSURE_SCALE = 0.62;

/** East-up-south direction towards the sun (azimuth clockwise from north). */
function sunDirection(azimuth, elevation) {
  const a = azimuth * RAD;
  const e = elevation * RAD;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

/** Sky colours through the day, keyed by sun elevation in degrees (linear RGB). */
const SKY_KEYS = [
  [-10, [0.008, 0.012, 0.035], [0.03, 0.045, 0.09]],
  [-2, [0.05, 0.07, 0.16], [0.42, 0.24, 0.22]],
  [6, [0.12, 0.2, 0.42], [0.9, 0.58, 0.38]],
  [20, [0.16, 0.28, 0.56], [0.58, 0.66, 0.78]],
  [60, [0.14, 0.3, 0.64], [0.55, 0.68, 0.84]],
];
function skyColours(elevation) {
  const k = SKY_KEYS;
  if (elevation <= k[0][0]) return [k[0][1], k[0][2]];
  for (let i = 1; i < k.length; i++)
    if (elevation <= k[i][0]) {
      const t = (elevation - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      const mix = (a, b) => a.map((v, j) => v + (b[j] - v) * t);
      return [mix(k[i - 1][1], k[i][1]), mix(k[i - 1][2], k[i][2])];
    }
  return [k[k.length - 1][1], k[k.length - 1][2]];
}
/** Warm near the horizon, whiter overhead. */
function sunColour(elevation) {
  const t = THREE.MathUtils.smoothstep(elevation, 0, 40);
  return new THREE.Color(1, 0.62 + 0.26 * t, 0.38 + 0.36 * t);
}

/** An analytic sky dome; the same dome lights the scene through the PMREM environment. */
function skyDome() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1000, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color() },
        sunGlow: { value: 1 },
      },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: `
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 c = y > 0.0 ? mix(horizon, zenith, pow(y, 0.42)) : mix(horizon, horizon * 0.35, pow(min(-y * 4.0, 1.0), 0.6));
          float s = max(dot(d, sunDir), 0.0);
          c += sunColor * sunGlow * (pow(s, 900.0) * 30.0 + pow(s, 14.0) * 0.45);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
}

function flakeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export async function openWorld({ canvas, world, onProgress = () => {}, onSelect = () => {} }) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('This browser does not support WebGL 2');
  // 1.5x with MSAA is sharp on desktop and keeps the frame rate; touch devices start lower.
  let pixelRatio = Math.min(devicePixelRatio, coarse ? 1.25 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 3000);
  camera.rotation.order = 'YXZ';

  // Sky: visible through the windows and the source of image-based light.
  const sky = skyDome();
  sky.frustumCulled = false;
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const envSky = skyDome();
  envSky.material.uniforms.sunGlow.value = 0.25; // keep the sun disc out of the ambient light
  skyScene.add(envSky);
  let envTarget = null;

  const sun = new THREE.DirectionalLight(0xfff1dc, SUN_LUX);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 80 });
  scene.add(sun, sun.target);
  const moon = new THREE.HemisphereLight(0x5d7ab8, 0x10131c, 0);
  scene.add(moon);

  // Geometry and materials.
  const loader = new GLTFLoader();
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const textures = new Map();
  const texture = (sha, color) => {
    if (!textures.has(sha))
      textures.set(
        sha,
        new THREE.TextureLoader().loadAsync(asset(sha)).then((t) => {
          t.flipY = false; // glTF texture convention
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.anisotropy = Math.min(8, maxAnisotropy);
          return t;
        }),
      );
    return textures.get(sha);
  };
  const models = new Map();
  const model = (sha) => {
    if (!models.has(sha)) models.set(sha, loader.loadAsync(asset(sha)).then((g) => g.scene));
    return models.get(sha);
  };

  const total = world.objects.length;
  let done = 0;
  const groups = new Map();
  const pickable = [];
  let room = null;
  await Promise.all(
    world.objects.map(async (o) => {
      const source = await model(o.model);
      const instance = source.clone(true);
      const group = new THREE.Group();
      group.userData.objectId = o.id;
      group.add(instance);
      const work = [];
      instance.traverse((m) => {
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        m.material = m.material.clone();
        m.material.userData.baseRoughness = m.material.roughness;
        m.userData.objectId = o.id;
        pickable.push(m);
        const maps = world.materials[m.material.name];
        if (maps?.base_color)
          work.push(texture(maps.base_color, true).then((t) => ((m.material.map = t), (m.material.needsUpdate = true))));
        if (maps?.normal)
          work.push(
            texture(maps.normal, false).then((t) => {
              m.material.normalMap = t;
              // No tangents in these GLBs: derivative tangents need glTF's flipped green channel.
              m.material.normalScale.set(1, -1);
              m.material.needsUpdate = true;
            }),
          );
        if (/flame|fire|ember/i.test(m.material.name)) {
          m.material.emissive = new THREE.Color(1, 0.45, 0.15);
          m.material.emissiveIntensity = 2.2;
          m.castShadow = false;
        }
      });
      await Promise.all(work);
      if (o.kind === 'room-shell') room = group;
      groups.set(o.id, group);
      scene.add(group);
      onProgress(++done / total);
    }),
  );

  // Lights belong to their objects, so they move and turn with them.
  const lights = new Map();
  for (const l of world.lights) {
    const light = new THREE.PointLight(new THREE.Color(...l.color), 0, l.range_metres, 2);
    light.position.set(...l.position);
    light.castShadow = !coarse && l.object != null;
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.002;
    light.shadow.camera.near = 0.1;
    (l.object ? groups.get(l.object) : scene).add(light);
    const kind = l.object ? world.objects.find((o) => o.id === l.object)?.kind : null;
    lights.set(l.id, { light, base: l.intensity_candela, fire: kind === 'fireplace' });
  }

  // Snow falls outside the room only.
  const roomBox = room ? new THREE.Box3().setFromObject(room).expandByScalar(0.25) : new THREE.Box3();
  const flakeMax = 4096;
  const flakes = new Float32Array(flakeMax * 3);
  const speeds = new Float32Array(flakeMax);
  const spawn = (i, top) => {
    let x;
    let y;
    let z;
    do {
      x = (Math.random() - 0.5) * 40;
      z = (Math.random() - 0.5) * 40;
      y = top ? 9 + Math.random() * 3 : Math.random() * 12;
    } while (roomBox.containsPoint(new THREE.Vector3(x, Math.min(y, roomBox.max.y - 0.01), z)));
    flakes.set([x, y, z], i * 3);
    speeds[i] = 0.5 + Math.random() * 0.7;
  };
  for (let i = 0; i < flakeMax; i++) spawn(i, false);
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(flakes, 3));
  const snow = new THREE.Points(
    snowGeometry,
    new THREE.PointsMaterial({ size: 0.06, map: flakeTexture(), transparent: true, depthWrite: false, color: 0xffffff }),
  );
  snow.frustumCulled = false;
  scene.add(snow);

  // Post-processing: MSAA scene target, contact AO, a little bloom for fire and lamps, AgX output.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: coarse ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 1, 1);
  ao.updateGtaoMaterial({ radius: 0.75, distanceExponent: 1.6, thickness: 1.4, scale: 1.15, samples: 12 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  ao.blendIntensity = 1;
  ao.enabled = !coarse;
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    camera.aspect = w / h;
    // Keep a room-sized view on portrait phones rather than a narrow close-up.
    camera.fov = camera.aspect < 1 ? Math.min(92, 62 / Math.sqrt(camera.aspect)) : 62;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  // ---- applying a document: everything a creator can edit, without reloading geometry ----
  let current = world;
  let lastSky = '';
  function apply(doc) {
    current = doc;
    for (const o of doc.objects) {
      const g = groups.get(o.id);
      if (!g) continue;
      g.position.set(...o.translation);
      g.rotation.set(0, o.yaw_degrees * RAD, 0);
      g.scale.setScalar(o.scale);
      const k = o.roughness_milli / 1000;
      g.traverse((m) => {
        if (m.isMesh) m.material.roughness = Math.min(1, Math.max(0.04, m.material.userData.baseRoughness * k));
      });
    }
    for (const l of doc.lights) {
      const entry = lights.get(l.id);
      if (entry) entry.target = l.enabled ? (l.intensity_candela * l.brightness_milli) / 1000 : 0;
    }
    const e = doc.environment;
    renderer.toneMappingExposure = e.exposure * EXPOSURE_SCALE;
    const dir = sunDirection(e.sun_azimuth_degrees, e.sun_elevation_degrees);
    sun.position.copy(dir).multiplyScalar(40);
    const day = THREE.MathUtils.smoothstep(e.sun_elevation_degrees, -4, 8);
    sun.intensity = SUN_LUX * day;
    sun.color.copy(sunColour(e.sun_elevation_degrees));
    moon.intensity = 0.35 * (1 - day);
    const [zenith, horizon] = skyColours(e.sun_elevation_degrees);
    for (const s of [sky, envSky]) {
      const u = s.material.uniforms;
      u.zenith.value.setRGB(...zenith);
      u.horizon.value.setRGB(...horizon);
      u.sunDir.value.copy(dir);
      u.sunColor.value.copy(sun.color).multiplyScalar(day);
    }
    snow.visible = e.snowfall > 0;
    snowGeometry.setDrawRange(0, Math.min(flakeMax, e.snowfall * 8));
    // Re-light from the sky only when the sky actually changed.
    const key = `${e.sun_azimuth_degrees}|${e.sun_elevation_degrees}`;
    if (key !== lastSky) {
      lastSky = key;
      envTarget?.dispose();
      envTarget = pmrem.fromScene(skyScene, 0, 0.1, 3000);
      scene.environment = envTarget.texture;
    }
    scene.environmentIntensity = e.environment_intensity * SKY_SCALE;
    selection?.update();
  }

  // ---- selection ----
  let selection = null;
  let selectedId = null;
  function select(id) {
    selectedId = id;
    if (selection) scene.remove(selection);
    selection = null;
    const g = groups.get(id);
    if (g) {
      selection = new THREE.BoxHelper(g, 0xf5b14c);
      selection.material.depthTest = false;
      selection.renderOrder = 10;
      scene.add(selection);
    }
    onSelect(id);
  }
  const ray = new THREE.Raycaster();
  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickable, false).find((h) => current.objects.find((o) => o.id === h.object.userData.objectId)?.editable);
    select(hit ? hit.object.userData.objectId : null);
  }

  // ---- first-person navigation: drag to look, WASD / arrows to walk, wheel or pinch to move ----
  const keys = new Set();
  let yaw = 0;
  let pitch = 0;
  function view(i) {
    const c = current.camera[i % current.camera.length];
    camera.position.set(...c.eye);
    const d = new THREE.Vector3(...c.target).sub(camera.position).normalize();
    yaw = Math.atan2(-d.x, -d.z);
    pitch = Math.asin(d.y);
  }
  view(0);
  const pointers = new Map();
  let dragged = 0;
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = 0;
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    dragged += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      yaw -= dx * 0.004;
      pitch = Math.max(-1.4, Math.min(1.4, pitch - dy * 0.004));
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) walk(0, (d - pinch) * 0.01);
      pinch = d;
    }
  });
  const release = (e) => {
    const was = pointers.size;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (e.type === 'pointerup' && was === 1 && dragged < 6) pick(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => (e.preventDefault(), walk(0, -e.deltaY * 0.003)), { passive: false });
  const editable = (t) => t.closest?.('input,textarea,select,[contenteditable]');
  addEventListener('keydown', (e) => !editable(e.target) && keys.add(e.code));
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  function walk(right, forward, up = 0) {
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    camera.position.addScaledVector(f, forward).addScaledVector(r, right);
    camera.position.y = Math.max(0.3, Math.min(8, camera.position.y + up));
  }

  // ---- loop, with an automatic step down in quality on slow devices ----
  const clock = new THREE.Clock();
  let frames = 0;
  let slow = 0;
  let quality = coarse ? 'balanced' : 'high';
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3.2 : 1.6) * dt;
    const k = (a, b) => (keys.has(a) || keys.has(b) ? 1 : 0);
    walk((k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft')) * speed, (k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown')) * speed, (k('KeyE', 'PageUp') - k('KeyQ', 'PageDown')) * speed);
    camera.rotation.set(pitch, yaw, 0);
    const t = clock.elapsedTime;
    for (const entry of lights.values()) {
      const target = entry.target ?? 0;
      const flicker = entry.fire && target > 0 ? 0.86 + 0.09 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 13.1 + 1.7) : 1;
      entry.light.intensity = target * flicker;
    }
    if (snow.visible) {
      const n = snowGeometry.drawRange.count;
      for (let i = 0; i < n; i++) {
        flakes[i * 3 + 1] -= speeds[i] * dt;
        flakes[i * 3] += Math.sin(t * 0.7 + i) * 0.12 * dt;
        if (flakes[i * 3 + 1] < 0) spawn(i, true);
      }
      snowGeometry.attributes.position.needsUpdate = true;
    }
    composer.render(dt);
    frames++;
    if (dt > 0.045 && frames > 90) slow++;
    if (slow > 60 && quality !== 'low') {
      // Keep it interactive: drop AO first, then resolution.
      quality = quality === 'high' ? 'balanced' : 'low';
      if (quality === 'balanced') ao.enabled = false;
      else pixelRatio = 1;
      slow = 0;
      resize();
    }
  }
  apply(world);
  renderer.setAnimationLoop(frame);

  return {
    apply,
    select,
    view,
    get selected() {
      return selectedId;
    },
    get quality() {
      return quality;
    },
    /** A JPEG preview of the current view, at most 1280 px wide. */
    async snapshot() {
      composer.render(0);
      const scale = Math.min(1, 1280 / canvas.width);
      const c = document.createElement('canvas');
      c.width = Math.round(canvas.width * scale);
      c.height = Math.round(canvas.height * scale);
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      return new Promise((done) => c.toBlob(done, 'image/jpeg', 0.86));
    },
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
    },
  };
}
