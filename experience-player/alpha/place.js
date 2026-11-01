// A place: walk through its generated world, see where it is on Earth and how it was made.
import * as THREE from './vendor/three.module.min.js';
import { SparkControls, SparkRenderer, SplatMesh } from './vendor/spark.module.min.js';
import { api, h, visitor, when, where } from './api.js';
import { earth } from './earth.js';

const $ = (s) => document.querySelector(s);
const id = decodeURIComponent(location.pathname.split('/').pop());
const base = `/api/v1/alpha/places/${encodeURIComponent(id)}`;
let place = null;
let mine = false;
let creatorName = null;

function loading(message, pct) {
  $('[data-message]').textContent = message;
  if (pct != null) $('#loading .progress span').style.width = `${pct}%`;
}

function describe(v) {
  place = v.place;
  mine = v.mine;
  creatorName = v.creator_name ?? creatorName;
  document.title = `${place.title} · Finalverse`;
  $('#title').textContent = place.title;
  $('#byline').textContent = [creatorName ? `by ${creatorName}` : null, place.published_at ? when(place.published_at) : null, v.visitors_7d ? `${v.visitors_7d} visits this week` : null]
    .filter(Boolean)
    .join(' · ');
  $('#story').textContent = place.story;
  $('#where').textContent = where(place.lat, place.lon);
  $('#mini').hidden = place.lat == null;
  if (place.lat != null) earth($('#mini'), { pins: [{ lat: place.lat, lon: place.lon, title: place.title }] });
  $('#draft-chip').hidden = place.state !== 'draft';
  const p = place.provenance;
  const rows = [
    ['Generator', `${p.generator} (${p.model})`],
    ['Description', p.prompt],
    ['Generated', when(p.generated_at)],
    ['World Labs world', p.world?.world_id],
    ['Caption', p.world?.caption],
  ];
  $('#provenance').replaceChildren(...rows.filter(([, d]) => d).flatMap(([t, d]) => [h('dt', {}, t), h('dd', {}, d)]));
  if (mine) editor();
}

function editor() {
  const f = $('#editor');
  f.hidden = false;
  f.title.value = place.title;
  f.story.value = place.story;
  f.querySelector('h2').textContent = place.state === 'published' ? 'Edit your place' : 'Put it on Earth';
  let pick = place.lat != null ? { lat: place.lat, lon: place.lon } : null;
  earth($('#picker'), {
    pins: [],
    pick,
    onPick: (lat, lon) => {
      pick = { lat, lon };
      $('.error', f).textContent = '';
    },
  });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const publish = e.submitter?.name === 'publish';
    if (publish && !pick) return ($('.error', f).textContent = 'Click the map to choose where it is first.');
    try {
      const v = await api(base, { method: 'POST', body: { title: f.title.value.trim(), story: f.story.value.trim(), ...(pick || {}), publish } });
      describe(v);
      $('.error', f).textContent = publish ? 'Published. Anyone with the link — or the map — can visit now.' : 'Saved.';
    } catch (err) {
      $('.error', f).textContent = err.message;
    }
  };
  if (new URLSearchParams(location.search).has('new')) $('#picker').scrollIntoView({ block: 'center' });
}

async function splats() {
  const r = await api(`${base}/assets/splats`, { raw: true });
  const total = Number(r.headers.get('content-length')) || 0;
  const reader = r.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) loading(`Opening the place… ${Math.round((got / total) * 100)}%`, (got / total) * 90);
  }
  const bytes = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return bytes;
}

async function enter() {
  const canvas = $('#view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 500);
  const spark = new SparkRenderer({ renderer });
  scene.add(spark);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  const bytes = await splats();
  loading('Unpacking the world…', 95);
  const world = new SplatMesh({ fileBytes: bytes, fileType: 'spz' });
  // World Labs worlds are OpenCV-oriented (+y down, +z forward); three.js is +y up, -z forward.
  world.quaternion.set(1, 0, 0, 0);
  const scale = place.provenance.world?.metric_scale;
  if (scale > 0) world.scale.setScalar(scale);
  scene.add(world);
  await world.initialized;

  const controls = new SparkControls({ canvas });
  controls.fpsMovement.moveSpeed = 1.6;
  $('#loading').hidden = true;
  canvas.focus();
  setTimeout(() => $('#hint').classList.add('faded'), 6000);
  renderer.setAnimationLoop(() => {
    controls.update(camera);
    renderer.render(scene, camera);
  });
  if (!mine && place.state === 'published')
    api(`${base}/visit`, { method: 'POST', body: { visitor: visitor() } }).catch(() => {});
}

$('#info-toggle').addEventListener('click', (e) => {
  const open = $('#info').classList.toggle('closed');
  e.target.setAttribute('aria-expanded', String(!open));
});
$('#share').addEventListener('click', async (e) => {
  const url = `${location.origin}/place/${encodeURIComponent(id)}`;
  if (navigator.share) return navigator.share({ title: place?.title, url }).catch(() => {});
  await navigator.clipboard?.writeText(url);
  e.target.textContent = 'Link copied';
});
$('#report-open').addEventListener('click', () => $('#report').showModal());
$('#report-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dialog = $('#report');
  if (e.submitter?.value !== 'send') return dialog.close();
  try {
    await api(`${base}/report`, { method: 'POST', body: { reason: e.target.reason.value.trim() } });
    e.target.replaceChildren(h('h2', {}, 'Thank you'), h('p', {}, 'A person will look at it.'), h('button', { class: 'button', type: 'button', onclick: () => dialog.close() }, 'Close'));
  } catch (err) {
    e.target.append(h('p', { class: 'error' }, err.message));
  }
});

try {
  describe(await api(base));
} catch (e) {
  loading(e.status === 404 ? 'This place does not exist, or is not public.' : e.message);
  throw e;
}
enter().catch((e) => {
  console.error(e);
  loading(`This place could not be opened here: ${e.message}`);
});
