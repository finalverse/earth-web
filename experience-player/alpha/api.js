// Finalverse alpha client: sessions, the API and a few DOM helpers. No third-party code.
const CREDENTIAL = 'finalverse.alpha.credential';
const SESSION = 'finalverse.alpha.session';
const NAME = 'finalverse.alpha.name';
const VISITOR = 'finalverse.alpha.visitor';

function read(key, area = localStorage) {
  try {
    return area.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value, area = localStorage) {
  try {
    if (value == null) area.removeItem(key);
    else area.setItem(key, value);
  } catch {
    /* storage unavailable (private mode); the session lasts this page only */
  }
}

export const me = {
  name: () => read(NAME) || read(NAME, sessionStorage),
  signedIn: () => Boolean(read(SESSION, sessionStorage) || credential()),
};
function credential() {
  return read(CREDENTIAL) || read(CREDENTIAL, sessionStorage);
}

/** Keeps the key on this device (or only for this tab) and the short session for this tab. */
export function remember(key, session, name, persist) {
  const area = persist ? localStorage : sessionStorage;
  write(CREDENTIAL, key, area);
  write(NAME, name, area);
  write(SESSION, session, sessionStorage);
}
export async function signOut() {
  try {
    await api('/api/v1/alpha/logout', { method: 'POST', body: {}, retry: false });
  } catch {
    /* already gone */
  }
  for (const area of [localStorage, sessionStorage])
    for (const k of [CREDENTIAL, SESSION, NAME]) write(k, null, area);
}

async function renew() {
  const key = credential();
  if (!key) return false;
  const r = await fetch('/api/v1/alpha/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential: key }),
  });
  if (!r.ok) return false;
  const v = await r.json();
  write(SESSION, v.session.token, sessionStorage);
  return true;
}

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Calls the alpha API, renewing an expired session once from the remembered key. */
export async function api(path, { method = 'GET', body, raw = false, retry = true } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let token = read(SESSION, sessionStorage);
    if (!token && attempt === 0 && retry && credential() && (await renew()))
      token = read(SESSION, sessionStorage);
    const headers = {};
    // A Blob (a preview image) is sent as-is; anything else as JSON.
    const blob = body instanceof Blob;
    if (body !== undefined) headers['content-type'] = blob ? body.type : 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const r = await fetch(path, {
      method,
      headers,
      body: body === undefined || blob ? body : JSON.stringify(body),
    });
    if (r.status === 401 && token && attempt === 0 && retry) {
      write(SESSION, null, sessionStorage);
      if (await renew()) continue;
    }
    if (raw && r.ok) return r;
    const v = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(v.message || `Request failed (${r.status})`, v.code, r.status);
    return v;
  }
  throw new ApiError('Please sign in again', 'forbidden', 401);
}

/** An image URL for a place asset, fetched with the session so drafts work too. */
export async function assetUrl(place, kind) {
  const r = await api(`/api/v1/alpha/places/${encodeURIComponent(place)}/assets/${kind}`, { raw: true });
  return URL.createObjectURL(await r.blob());
}

/** A random, device-local visitor id; the server only ever stores it hashed with a daily salt. */
export function visitor() {
  let v = read(VISITOR);
  if (!v || !/^[0-9a-f]{64}$/.test(v)) {
    const b = crypto.getRandomValues(new Uint8Array(32));
    v = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    write(VISITOR, v);
  }
  return v;
}

/** h('a', {href, class}, 'text', child) — attributes and text only, never HTML. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export function where(lat, lon) {
  if (lat == null || lon == null) return 'Not on Earth yet';
  const f = (v, p, n) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? p : n}`;
  return `${f(lat, 'N', 'S')} ${f(lon, 'E', 'W')}`;
}

export function when(seconds) {
  if (!seconds) return '';
  return new Date(seconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
