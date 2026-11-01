// A flat Earth (Natural Earth II, equirectangular) with place pins and an optional picker.
import { h } from './api.js';

const COLUMNS = 8;
const ROWS = 4;

/** The 32 tiles drawn once onto one canvas, so the map has no seams between tiles. */
let composed = null;
function image() {
  composed ??= (async () => {
    const canvas = h('canvas', { width: COLUMNS * 256, height: ROWS * 256 });
    const g = canvas.getContext('2d');
    const draws = [];
    // TMS tiles count rows from the south.
    for (let row = 0; row < ROWS; row++)
      for (let x = 0; x < COLUMNS; x++) {
        const img = new Image();
        img.src = `/alpha/earth/${x}-${ROWS - 1 - row}.jpg`;
        draws.push(img.decode().then(() => g.drawImage(img, x * 256, row * 256)));
      }
    await Promise.all(draws);
    return URL.createObjectURL(await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.9)));
  })();
  return composed;
}

export function earth(container, { pins = [], onPick = null, pick = null } = {}) {
  const tiles = h('img', { class: 'earth-image', alt: '', draggable: 'false', 'aria-hidden': 'true' });
  image().then((src) => (tiles.src = src));
  const layer = h('div', { class: 'earth-pins' });
  const map = h('div', { class: `earth${onPick ? ' picking' : ''}` }, tiles, layer);
  container.replaceChildren(map);
  let marker = null;

  const place = (el, lat, lon) => {
    el.style.left = `${((lon + 180) / 360) * 100}%`;
    el.style.top = `${((90 - lat) / 180) * 100}%`;
    return el;
  };
  const setPins = (list) => {
    for (const p of layer.querySelectorAll('.pin')) p.remove();
    for (const p of list) {
      if (p.lat == null || p.lon == null) continue;
      const pin = h(
        p.href ? 'a' : 'span',
        { class: 'pin', href: p.href, title: p.title },
        h('span', { class: 'pin-label' }, p.title),
      );
      layer.append(place(pin, p.lat, p.lon));
    }
  };
  const setPick = (lat, lon) => {
    marker ??= layer.appendChild(h('span', { class: 'pin pick', 'aria-hidden': 'true' }));
    place(marker, lat, lon);
  };
  if (onPick)
    map.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const r = map.getBoundingClientRect();
      const lon = Math.max(-180, Math.min(180, ((e.clientX - r.left) / r.width) * 360 - 180));
      const lat = Math.max(-85, Math.min(85, 90 - ((e.clientY - r.top) / r.height) * 180));
      setPick(lat, lon);
      onPick(Number(lat.toFixed(5)), Number(lon.toFixed(5)));
    });
  setPins(pins);
  if (pick) setPick(pick.lat, pick.lon);
  return { setPins, setPick };
}
