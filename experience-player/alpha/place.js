// A world on Finalverse. Native worlds render with Finalverse's own renderer (native.js) and can be
// made yours: move and restyle objects, switch lights, change the time of day, ask Lumi, then save
// and share. Legacy Gaussian-splat places still open in their own viewer (splat.js).
import { api, h, me, visitor, when, where } from './api.js';
import { earth } from './earth.js';

const $ = (s) => document.querySelector(s);
const id = decodeURIComponent(location.pathname.split('/').pop());
const base = `/api/v1/alpha/places/${encodeURIComponent(id)}`;
let place = null;
let mine = false;
let creatorName = null;
let status = {};

function loading(message, pct) {
  $('#loading').hidden = false;
  $('[data-message]').textContent = message;
  if (pct != null) $('#loading .progress span').style.width = `${pct}%`;
}

function describe(v) {
  place = v.place;
  mine = v.mine;
  creatorName = v.creator_name ?? creatorName;
  const native = place.representation === 'native/finalverse-world-v1';
  document.title = `${place.title} · Finalverse`;
  $('#title').textContent = place.title;
  $('#byline').textContent = [creatorName ? `by ${creatorName}` : null, place.published_at ? when(place.published_at) : null, v.visitors_7d ? `${v.visitors_7d} ${v.visitors_7d === 1 ? 'visit' : 'visits'} this week` : null]
    .filter(Boolean)
    .join(' · ');
  $('#story').textContent = place.story;
  $('#where').textContent = place.lat == null && native ? '' : where(place.lat, place.lon);
  $('#mini').hidden = place.lat == null;
  if (place.lat != null) earth($('#mini'), { pins: [{ lat: place.lat, lon: place.lon, title: place.title }] });
  $('#draft-chip').hidden = place.state !== 'draft';
  const p = place.provenance;
  const attribution = $('#attribution');
  if (native) {
    attribution.replaceChildren('A Finalverse world · editable 3D, rendered live by Finalverse');
    const from = p.remixed_from;
    const rows = [
      ['Layout', p.world?.planner ? `Planned by ${p.world.planner} from one sentence, fitted by the engine` : 'Arranged by Finalverse'],
      ['Geometry and materials', p.world?.license ? `Original, ${p.world.license}` : null],
      ['Made from', from ? h('a', { href: `/place/${encodeURIComponent(from.place)}` }, 'the original world') : null],
      ['Version', place.edition ? place.edition.slice(0, 12) : null],
    ];
    $('#provenance').replaceChildren(...rows.filter(([, d]) => d).flatMap(([t, d]) => [h('dt', {}, t), h('dd', {}, d)]));
  } else {
    attribution.replaceChildren('Made with ', h('a', { href: 'https://www.worldlabs.ai', rel: 'noopener' }, 'World Labs'), ' Marble · AI-generated');
    const rows = [
      ['Generator', `${p.generator} (${p.model})`],
      ['Description', p.prompt],
      ['Generated', when(p.generated_at)],
      ['World Labs world', p.world?.world_id],
    ];
    $('#provenance').replaceChildren(...rows.filter(([, d]) => d).flatMap(([t, d]) => [h('dt', {}, t), h('dd', {}, d)]));
  }
  if (mine) details(native);
}

/** Title, story, optional Earth location and publishing. */
function details(native) {
  const f = $('#editor');
  f.hidden = false;
  f.title.value = place.title;
  f.story.value = place.story;
  $('#details-publish').hidden = place.state === 'published';
  $('#picker-note').textContent = native ? 'Put it on Earth (optional): click the map where it belongs.' : 'Click the map where this place belongs. Others will find it there.';
  let pick = place.lat != null ? { lat: place.lat, lon: place.lon } : null;
  earth($('#picker'), { pins: [], pick, onPick: (lat, lon) => ((pick = { lat, lon }), ($('.error', f).textContent = '')) });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const publish = e.submitter?.name === 'publish';
    if (publish && !native && !pick) return ($('.error', f).textContent = 'Click the map to choose where it is first.');
    try {
      if (publish && native) await saveWorld();
      const v = await api(base, { method: 'POST', body: { title: f.title.value.trim(), story: f.story.value.trim(), ...(pick || {}), publish } });
      describe(v);
      $('.error', f).textContent = publish ? 'Published. Anyone with the link can visit now.' : 'Saved.';
    } catch (err) {
      $('.error', f).textContent = err.message;
    }
  };
}

// ---------------------------------------------------------------- native worlds and the studio
let viewer = null;
let saved = null; // the last saved edition
let draft = null; // the creator's working copy
let proposal = null; // Lumi's previewed idea
const clone = (v) => JSON.parse(JSON.stringify(v));
const dirty = () => JSON.stringify(draft) !== JSON.stringify(saved);

function objectOf(doc, oid) {
  return doc.objects.find((o) => o.id === oid);
}
function lightOf(doc, oid) {
  return doc.lights.find((l) => l.object === oid);
}
function timeLabel(e) {
  if (e < -4) return 'night';
  if (e < 3) return 'dusk';
  if (e < 12) return 'golden hour';
  if (e < 30) return 'afternoon';
  return 'midday';
}

function show(doc) {
  viewer.apply(doc);
  const oid = $('#object').value;
  const o = objectOf(doc, oid);
  $('#object-controls').hidden = !o;
  $('#object-hint').hidden = Boolean(o);
  if (o) {
    $('#x').value = o.translation[0];
    $('#z').value = o.translation[2];
    $('#yaw').value = o.yaw_degrees;
    $('#rough').value = o.roughness_milli;
    const l = lightOf(doc, oid);
    $('#light-controls').hidden = !l;
    if (l) {
      $('#light-on').checked = l.enabled;
      $('#bright').value = l.brightness_milli;
    }
  }
  const e = doc.environment;
  $('#sun').value = e.sun_elevation_degrees;
  $('#sun-label').textContent = timeLabel(e.sun_elevation_degrees);
  $('#azimuth').value = e.sun_azimuth_degrees;
  $('#snow').value = e.snowfall;
  $('#exposure').value = e.exposure;
  studioStatus();
}

function studioStatus(message) {
  const text = message ?? (proposal ? 'Previewing Lumi’s idea.' : dirty() ? (mine ? 'Unsaved changes.' : 'Your changes are only on this screen.') : mine ? (place.state === 'published' ? 'Saved and published.' : 'Saved · only you can see it.') : '');
  $('#studio-status').textContent = text;
}

function edit(fn) {
  if (proposal) dropProposal();
  fn(draft);
  show(draft);
}

function wireStudio() {
  const select = $('#object');
  select.replaceChildren(h('option', { value: '' }, 'Choose an object…'), ...draft.objects.filter((o) => o.editable).map((o) => h('option', { value: o.id }, o.name)));
  select.addEventListener('change', () => (viewer.select(select.value || null), show(proposal ?? draft)));
  const obj = () => objectOf(draft, select.value);
  $('#x').addEventListener('input', (e) => edit(() => (obj().translation[0] = Number(e.target.value))));
  $('#z').addEventListener('input', (e) => edit(() => (obj().translation[2] = Number(e.target.value))));
  $('#yaw').addEventListener('input', (e) => edit(() => (obj().yaw_degrees = Number(e.target.value))));
  $('#rough').addEventListener('input', (e) => edit(() => (obj().roughness_milli = Number(e.target.value))));
  $('#light-on').addEventListener('change', (e) => edit((d) => (lightOf(d, select.value).enabled = e.target.checked)));
  $('#bright').addEventListener('input', (e) => edit((d) => {
    const l = lightOf(d, select.value);
    l.brightness_milli = Number(e.target.value);
    l.enabled = l.brightness_milli > 0;
  }));
  $('#sun').addEventListener('input', (e) => edit((d) => (d.environment.sun_elevation_degrees = Number(e.target.value))));
  $('#azimuth').addEventListener('input', (e) => edit((d) => (d.environment.sun_azimuth_degrees = Number(e.target.value))));
  $('#snow').addEventListener('input', (e) => edit((d) => (d.environment.snowfall = Number(e.target.value))));
  $('#exposure').addEventListener('input', (e) => edit((d) => (d.environment.exposure = Number(e.target.value))));
  for (const b of ['#revert', '#revert-guest'])
    $(b).addEventListener('click', () => {
      dropProposal();
      draft = clone(saved);
      show(draft);
    });
  $('#save').addEventListener('click', () => saveWorld().then(() => studioStatus(), (e) => studioStatus(e.message)));
  $('#publish').addEventListener('click', publish);
  $('#lumi-go').addEventListener('click', askLumi);
  $('#lumi-keep').addEventListener('click', () => {
    draft = proposal;
    proposal = null;
    $('#lumi-proposal').hidden = true;
    show(draft);
  });
  $('#lumi-drop').addEventListener('click', () => (dropProposal(), show(draft)));
}

function openStudio(note) {
  const s = $('#studio');
  s.classList.remove('closed');
  $('#studio-toggle').hidden = false;
  $('#studio-toggle').setAttribute('aria-expanded', 'true');
  $('#studio-note').textContent = note;
  $('#owner-actions').hidden = !mine;
  $('#guest-actions').hidden = mine;
  $('#lumi-section').hidden = !status.lumi || !mine;
  $('#publish').hidden = place.state === 'published';
  show(draft);
}

async function saveWorld() {
  if (!mine) throw new Error('Join to save your version.');
  if (proposal) throw new Error('Keep or discard Lumi’s idea first.');
  studioStatus('Saving…');
  if (dirty() || !place.assets?.thumbnail) {
    const r = await api(`${base}/editions`, { method: 'POST', body: draft });
    saved = clone(draft);
    place.edition = r.edition;
    const preview = await viewer.snapshot();
    if (preview && preview.size <= 1 << 20) await api(`${base}/thumbnail`, { method: 'POST', body: preview }).catch(() => {});
    place.assets = { ...(place.assets || {}), thumbnail: true };
  }
  studioStatus();
}

async function publish() {
  try {
    await saveWorld();
    studioStatus('Publishing…');
    const v = await api(base, { method: 'POST', body: { publish: true } });
    describe(v);
    $('#publish').hidden = true;
    const url = `${location.origin}/place/${encodeURIComponent(id)}`;
    await navigator.clipboard?.writeText(url).catch(() => {});
    studioStatus('Published — the link is copied. Send it to someone.');
  } catch (e) {
    studioStatus(e.message);
  }
}

function dropProposal() {
  proposal = null;
  $('#lumi-proposal').hidden = true;
}

async function askLumi() {
  const oid = $('#object').value;
  const request = $('#lumi-ask').value.trim();
  if (!oid) return studioStatus('Select an object first, then ask Lumi.');
  if (!request) return studioStatus('Tell Lumi what you would like.');
  $('#lumi-go').disabled = true;
  $('#lumi-wait').textContent = 'Lumi is thinking…';
  try {
    const p = await api(`${base}/suggest`, { method: 'POST', body: { object: oid, request } });
    const next = clone(draft);
    const o = objectOf(next, p.object);
    const l = lightOf(next, p.object);
    if (p.change === 'roughness') o.roughness_milli = Math.round(p.amount);
    if (p.change === 'brightness' && l) {
      l.brightness_milli = Math.round(p.amount);
      l.enabled = l.brightness_milli > 0;
    }
    if (p.change === 'move_x') o.translation[0] = Math.max(-12, Math.min(12, o.translation[0] + p.amount));
    if (p.change === 'move_z') o.translation[2] = Math.max(-12, Math.min(12, o.translation[2] + p.amount));
    if (p.change === 'turn') o.yaw_degrees = ((((o.yaw_degrees + p.amount + 180) % 360) + 360) % 360) - 180;
    proposal = next;
    $('#lumi-text').textContent = p.explanation;
    $('#lumi-proposal').hidden = false;
    show(proposal);
  } catch (e) {
    studioStatus(e.message);
  } finally {
    $('#lumi-go').disabled = false;
    $('#lumi-wait').textContent = '';
  }
}

async function makeItMine() {
  if (!me.signedIn()) {
    // A private try-out right here; saving needs an invite.
    openStudio('Try it: change anything. Join with an invite to save and share your version.');
    return;
  }
  $('#remix').disabled = true;
  try {
    const r = await api(`${base}/remix`, { method: 'POST', body: {} });
    location.assign(`/place/${encodeURIComponent(r.place)}?studio=1`);
  } catch (e) {
    $('#remix').disabled = false;
    openStudio(e.message);
  }
}

async function openNative() {
  const { world } = await api(`${base}/world`);
  saved = clone(world);
  draft = clone(world);
  loading('Building the world…', 5);
  const { openWorld } = await import('./native.js');
  viewer = await openWorld({
    canvas: $('#view'),
    world,
    onProgress: (p) => loading('Building the world…', 5 + p * 90),
    onSelect: (oid) => {
      $('#object').value = oid ?? '';
      if (oid && $('#studio').classList.contains('closed') && !mine) $('#remix').classList.add('pulse');
      show(proposal ?? draft);
    },
  });
  $('#loading').hidden = true;
  wireStudio();
  $('#remix').hidden = mine || !place.remixable;
  $('#remix').addEventListener('click', makeItMine);
  $('#studio-toggle').addEventListener('click', (e) => {
    const closed = $('#studio').classList.toggle('closed');
    e.target.setAttribute('aria-expanded', String(!closed));
  });
  if (mine) {
    $('#studio-toggle').hidden = false;
    if (new URLSearchParams(location.search).has('studio') || place.state === 'draft') openStudio(place.state === 'draft' ? 'This is your copy. Change anything, then save and publish.' : '');
  }
  addEventListener('beforeunload', (e) => {
    if (mine && dirty()) e.preventDefault();
  });
}

async function openLegacy() {
  const { openSplats } = await import('./splat.js');
  await openSplats({ canvas: $('#view'), base, place, onProgress: (p) => loading(`Opening the place… ${Math.round(p * 100)}%`, p * 90) });
  $('#loading').hidden = true;
}

// On a phone the world comes first; the details are one tap away.
if (matchMedia('(max-width: 720px)').matches) {
  $('#info').classList.add('closed');
  $('#info-toggle').setAttribute('aria-expanded', 'false');
}
$('#info-toggle').addEventListener('click', (e) => {
  const closed = $('#info').classList.toggle('closed');
  e.target.setAttribute('aria-expanded', String(!closed));
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
  [status] = await Promise.all([api('/api/v1/alpha/status', { retry: false }).catch(() => ({})), api(base).then(describe)]);
} catch (e) {
  loading(e.status === 404 ? 'This world does not exist, or is not public.' : e.message);
  throw e;
}
const native = place.representation === 'native/finalverse-world-v1';
(native ? openNative() : openLegacy())
  .then(() => {
    setTimeout(() => $('#hint').classList.add('faded'), 7000);
    if (!mine && place.state === 'published') api(`${base}/visit`, { method: 'POST', body: { visitor: visitor() } }).catch(() => {});
  })
  .catch((e) => {
    console.error(e);
    loading(`This world could not be opened here: ${e.message}`);
  });
