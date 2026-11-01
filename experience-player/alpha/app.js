// The alpha home: explore places on Earth, join with an invite, describe and make a world.
import { api, assetUrl, h, me, remember, signOut, when, where } from './api.js';
import { earth } from './earth.js';

const $ = (s, root = document) => root.querySelector(s);
const views = ['explore', 'join', 'create', 'mine'];
let status = null;

function show(view) {
  if (!views.includes(view)) view = 'explore';
  for (const v of views) $(`#${v}`).hidden = v !== view;
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('active', a.dataset.nav === view);
  const load = { explore, create, mine, join: async () => {} }[view];
  load().catch((e) => console.error(e));
}

function account() {
  const a = $('#account');
  const signedIn = me.signedIn();
  a.textContent = signedIn ? me.name() || 'You' : 'Join';
  a.href = signedIn ? '/alpha#mine' : '/alpha#join';
  a.dataset.nav = signedIn ? 'mine-account' : 'join';
  $('[data-nav="mine"]').hidden = !signedIn;
}

function card(p, thumb) {
  const img = h('div', { class: 'thumb' });
  if (p.thumbnail) thumb(p.id).then((src) => img.append(h('img', { src, alt: '', loading: 'lazy' }))).catch(() => {});
  return h(
    'a',
    { class: 'tile', href: `/place/${encodeURIComponent(p.id)}` },
    img,
    h('strong', {}, p.title),
    h('span', { class: 'muted' }, [p.creator_name ? `by ${p.creator_name} · ` : '', where(p.lat, p.lon)]),
    p.state && p.state !== 'published' ? h('span', { class: 'chip' }, p.state) : null,
  );
}
const publicThumb = async (id) => `/api/v1/alpha/places/${encodeURIComponent(id)}/assets/thumbnail`;

async function explore() {
  const { places } = await api('/api/v1/alpha/places', { retry: false });
  earth($('#world'), { pins: places.map((p) => ({ ...p, href: `/place/${encodeURIComponent(p.id)}` })) });
  $('#gallery').replaceChildren(...places.slice(0, 24).map((p) => card(p, publicThumb)));
  $('#empty').hidden = places.length > 0;
}

async function create() {
  const signedIn = me.signedIn();
  $('#create-signin').hidden = signedIn;
  $('#compose').hidden = !signedIn || !$('#making').hidden;
  if (!signedIn) return;
  status ??= await api('/api/v1/alpha/status', { retry: false });
  $('#consent-text').textContent = consentText(status);
  $('#lumi').hidden = !status.lumi;
  const { mine } = await api('/api/v1/alpha/me');
  const b = mine.budget;
  $('#budget').textContent = status.generation
    ? `${b.worlds_left} ${b.worlds_left === 1 ? 'world' : 'worlds'} left in your alpha allowance`
    : 'World generation is paused right now.';
  $('#make').disabled = !status.generation || b.worlds_left < 1;
  const running = mine.generations.find((g) => g.state === 'queued' || g.state === 'running');
  if (running) follow(running.id, running.title);
}

function consentText(s) {
  return `I agree that my description is sent to World Labs${s.lumi ? ' (and to Ollama’s cloud when Lumi helps)' : ''}, who may keep it and use it to improve their models; that this uses one world from the alpha allowance; and that the result is AI-generated and labelled as made with World Labs.`;
}

async function mine() {
  if (!me.signedIn()) return show('join');
  const { mine: m } = await api('/api/v1/alpha/me');
  $('#working').replaceChildren(
    ...m.generations.map((g) =>
      h(
        'div',
        { class: `item ${g.state}` },
        h('strong', {}, g.title),
        h('span', { class: 'muted' }, g.state === 'failed' ? `Could not be made: ${g.error || 'unknown error'}` : `Being made… ${Math.round(g.percent || 0)}%`),
      ),
    ),
  );
  const thumb = (id) => assetUrl(id, 'thumbnail');
  $('#my-gallery').replaceChildren(...m.places.map((p) => card(p, thumb)));
  if (!m.places.length && !m.generations.length)
    $('#my-gallery').append(h('p', { class: 'muted' }, 'Nothing yet. ', h('a', { href: '/alpha#create' }, 'Make your first place.')));
}

function errorTo(form) {
  return (e) => {
    $('.error', form).textContent = e.message;
  };
}

$('#redeem').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('.error', f).textContent = '';
  try {
    const v = await api('/api/v1/alpha/redeem', {
      method: 'POST',
      body: { code: f.code.value.trim(), name: f.name.value.trim() },
      retry: false,
    });
    remember(v.credential, v.session.token, v.name, f.persist.checked);
    $('[data-name]').textContent = v.name;
    $('[data-key]').textContent = v.credential;
    $('#key-once').hidden = false;
    $('.cards').hidden = true;
    account();
  } catch (err) {
    errorTo(f)(err);
  }
});
$('[data-copy]').addEventListener('click', async (e) => {
  await navigator.clipboard?.writeText($('[data-key]').textContent);
  e.target.textContent = 'Copied';
});
$('#signin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('.error', f).textContent = '';
  try {
    const v = await api('/api/v1/alpha/login', { method: 'POST', body: { credential: f.key.value.trim() }, retry: false });
    remember(f.key.value.trim(), v.session.token, v.name, f.persist.checked);
    account();
    location.hash = '#create';
  } catch (err) {
    errorTo(f)(err.status === 401 ? new Error('That key was not recognised.') : err);
  }
});

$('#lumi').addEventListener('click', async () => {
  const f = $('#compose');
  const idea = f.idea.value.trim();
  $('.error', f).textContent = '';
  if (!idea) return ($('.error', f).textContent = 'Write a few words about your place first.');
  if (!f.consent.checked) return ($('.error', f).textContent = 'Lumi runs in Ollama’s cloud; tick the agreement first.');
  $('#lumi').disabled = true;
  $('#lumi-note').textContent = 'Lumi is imagining it…';
  try {
    const v = await api('/api/v1/alpha/draft', { method: 'POST', body: { idea, consent: true } });
    f.title.value = v.title;
    f.prompt.value = v.prompt;
    $('#lumi-note').textContent = 'Edit anything you like.';
  } catch (e) {
    $('#lumi-note').textContent = '';
    errorTo(f)(e);
  } finally {
    $('#lumi').disabled = false;
  }
});
$('#compose').idea.addEventListener('input', (e) => {
  const f = $('#compose');
  if (!f.prompt.dataset.touched) f.prompt.value = e.target.value;
});
$('#compose').prompt.addEventListener('input', (e) => (e.target.dataset.touched = '1'));

$('#compose').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('.error', f).textContent = '';
  $('#make').disabled = true;
  try {
    const v = await api('/api/v1/alpha/worlds', {
      method: 'POST',
      body: { title: f.title.value.trim(), prompt: f.prompt.value.trim(), consent: f.consent.checked },
    });
    follow(v.generation, f.title.value.trim());
  } catch (err) {
    errorTo(f)(err);
    $('#make').disabled = false;
  }
});

const phases = [
  [0, 'World Labs is reading your description…'],
  [15, 'Laying out the ground and the walls…'],
  [40, 'Painting light, material and depth…'],
  [70, 'Filling in the far corners…'],
  [92, 'Bringing it home to Finalverse…'],
];
let following = null;
function follow(id, title) {
  if (following === id) return;
  following = id;
  $('#compose').hidden = true;
  const box = $('#making');
  box.hidden = false;
  $('[data-title]', box).textContent = title;
  const bar = $('.progress span', box);
  const tick = async () => {
    if (following !== id) return;
    try {
      const g = await api(`/api/v1/alpha/worlds/${encodeURIComponent(id)}`);
      const pct = g.state === 'ready' ? 100 : Math.max(3, Math.min(97, g.percent || 0));
      bar.style.width = `${pct}%`;
      $('[data-status]', box).textContent = phases.filter(([p]) => pct >= p).pop()[1];
      if (g.state === 'ready' && g.place) return location.assign(`/place/${encodeURIComponent(g.place)}?new=1`);
      if (g.state === 'failed') {
        $('.error', box).textContent = `It could not be made: ${g.error || "unknown error"}. Try describing it differently.`;
        following = null;
        $('#compose').hidden = false;
        return;
      }
    } catch (e) {
      $('.error', box).textContent = e.message;
    }
    setTimeout(tick, 4000);
  };
  tick();
}

$('#signout').addEventListener('click', async () => {
  await signOut();
  account();
  location.hash = '#explore';
});

addEventListener('hashchange', () => show(location.hash.slice(1)));
account();
show(location.hash.slice(1) || 'explore');
