// Only typed data from the same-origin registry is interpreted.
export const PUBLICATION_SCHEMA = 'finalverse.network-publication/v1';
export const MAX_DOCUMENT = 1048576;
export const MAX_ASSET = 8388608;
const licenses = new Set(['CC0-1.0', 'CC-BY-4.0', 'OGL-Canada-2.0', 'MIT']);
export function assert(ok, message) {
  if (!ok) throw new Error(message);
}
export function digest(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
export function identity(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
}
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    assert(
      Number.isSafeInteger(value),
      'Canonical contracts require safe integers',
    );
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  assert(
    typeof value === 'object' &&
      Object.getPrototypeOf(value) === Object.prototype,
    'Data-only object required',
  );
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
      .join(',') +
    '}'
  );
}
export async function hash(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export async function hashValue(v) {
  return hash(new TextEncoder().encode(canonical(v)));
}
function keys(v, expected) {
  assert(
    v && Object.keys(v).sort().join('|') === [...expected].sort().join('|'),
    'Unsupported contract fields',
  );
}
export function licensed(p) {
  return (
    p &&
    licenses.has(p.license) &&
    typeof p.creator === 'string' &&
    p.creator.length > 0 &&
    typeof p.attribution === 'string' &&
    p.attribution.length > 0
  );
}
export function parseEntry(url) {
  const u = new URL(url);
  assert(
    [...u.searchParams.keys()].every((k) =>
      ['entity', 'destination', 'placement'].includes(k),
    ) &&
      ['destination', 'placement'].every(
        (k) => u.searchParams.getAll(k).length <= 1,
      ) &&
      u.searchParams.getAll('entity').length <= 1 &&
      (!u.hash || /^#live=instance-[a-f0-9]{32}:[a-f0-9]{64}$/.test(u.hash)),
    'Unsupported entry context',
  );
  const destination = u.searchParams.get('destination'),
    placement = u.searchParams.get('placement');
  assert(
    (!destination && !placement) ||
      (['standalone', 'earth', 'mutsea'].includes(destination) &&
        new RegExp('^' + destination + '-[a-f0-9]{24}$').test(placement || '')),
    'Invalid typed destination context',
  );
  const parts = u.pathname.split('/');
  assert(
    parts.length === 4 &&
      parts[1] === 'x' &&
      identity(parts[2]) &&
      digest(parts[3]),
    'Expected a versioned experience link',
  );
  const entity = u.searchParams.get('entity');
  assert(
    !entity || /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(entity),
    'Invalid entry entity',
  );
  return { id: parts[2], version: parts[3], entity };
}
export async function validatePublication(record, entry) {
  keys(record, ['publication', 'status']);
  assert(record.status === 'published', 'This edition is unavailable');
  const p = record.publication;
  keys(p, ['schema_version', 'version', 'content']);
  assert(
    p.schema_version === PUBLICATION_SCHEMA && digest(p.version),
    'Unsupported publication version',
  );
  const c = p.content;
  keys(c, [
    'schema_version',
    'experience',
    'title',
    'description',
    'creator',
    'parent',
    'remix_permission',
    'visibility',
    'package',
    'assets',
    'fallback',
    ...(c.authored ? ['authored'] : []),
    ...(c.generated ? ['generated'] : []),
  ]);
  assert(
    c.schema_version === 'finalverse.publication-content/v1' &&
      c.visibility === 'public' &&
      identity(c.experience) &&
      c.title.length > 0 &&
      c.title.length <= 256 &&
      c.description.length <= 2048 &&
      licensed(c.creator),
    'Invalid publication metadata',
  );
  assert(
    !entry || (c.experience === entry.id && p.version === entry.version),
    'The publication does not match this share link',
  );
  assert(
    (await hashValue(c)) === p.version,
    'Publication integrity check failed',
  );
  assert(
    c.package.schema_version === 'finalverse.experience-package/v1' &&
      c.package.manifest.schema_version === 'finalverse.el-composition/v1' &&
      c.package.manifest.experience.schema_version === 'finalverse.el/v1',
    'Unsupported EL package',
  );
  assert(
    c.package.manifest.experience.id === c.experience &&
      c.package.manifest.experience.presentation.title === c.title,
    'Package identity differs',
  );
  assert(
    (await hashValue(c.package.manifest)) === c.package.manifest_sha256,
    'Manifest integrity check failed',
  );
  assert(
    (await hashValue([
      c.package.schema_version,
      c.package.manifest,
      c.package.assets,
    ])) === c.package.package_sha256,
    'Package integrity check failed',
  );
  assert(
    c.fallback.schema_version === 'finalverse.web-fallback/v1' &&
      c.fallback.renderer === 'cesium-district-v1' &&
      c.fallback.accessible_alternative === 'entity-list-v1',
    'Unsupported preview; use a compatible client',
  );
  assert(
    Object.keys(c.assets).length <= (c.generated ? 200 : 150),
    'Asset budget exceeded',
  );
  let total = 0;
  for (const [id, a] of Object.entries(c.assets)) {
    keys(a, ['sha256', 'byte_length', 'media_type', 'provenance']);
    assert(
      id === a.sha256 &&
        digest(id) &&
        a.byte_length > 0 &&
        a.byte_length <= MAX_ASSET &&
        a.provenance.length > 0 &&
        a.provenance.every(licensed) &&
        [
          'audio/wav',
          'model/gltf-binary',
          'application/vnd.finalverse.web-scene+json',
        ].includes(a.media_type),
      'Unapproved asset reference',
    );
    total += a.byte_length;
  }
  assert(
    total <= 33554432 &&
      canonical(c.assets[c.fallback.scene.sha256]) ===
        canonical(c.fallback.scene),
    'Invalid scene reference',
  );
  for (const a of Object.values(c.package.assets))
    assert(
      c.assets[a.sha256]?.media_type === a.media_type &&
        c.assets[a.sha256]?.byte_length === a.byte_length &&
        canonical(c.assets[a.sha256].provenance) == canonical([a.provenance]),
      'Audio provenance differs',
    );
  if (c.authored) {
    const a = c.authored,
      v = a.version;
    keys(a, ['proposal', 'version']);
    assert(
      c.parent &&
        v.schema_version === 'finalverse.experience-version/v1' &&
        v.document.schema_version === 'finalverse.authored-experience/v1',
      'Unsupported authored edition',
    );
    assert(
      (await hashValue(a.proposal)) === v.proposal_hash &&
        (await hashValue([
          v.schema_version,
          v.parent,
          v.proposal_hash,
          v.creation_provenance,
          v.document,
        ])) === v.version_hash,
      'Authored proposal or version changed',
    );
    assert(
      canonical(v.document.package) === canonical(c.package) &&
        v.document.description === c.description,
      'Authored package differs',
    );
    assert(
      ['after_dark', 'festival', 'daylight'].includes(v.document.lighting) &&
        v.document.exposure_milli >= 500 &&
        v.document.exposure_milli <= 2400 &&
        (!v.document.atmosphere ||
          ['snow', 'mist', 'haze'].includes(v.document.atmosphere)),
      'Unsupported authored presentation',
    );
    if (v.document.visual) {
      const t = v.document.visual;
      keys(t, [
        'palette',
        'warmth_milli',
        'snow_milli',
        'haze_milli',
        'window_glow_milli',
        'roughness_milli',
        'metallic_milli',
      ]);
      assert(
        [
          'winter_stone',
          'heritage_stone',
          'copper_glass',
          'midnight_neon',
        ].includes(t.palette) &&
          Object.entries(t)
            .filter(([k]) => k !== 'palette')
            .every(([, n]) => Number.isSafeInteger(n) && n >= 0 && n <= 1000) &&
          t.metallic_milli <= 300,
        'Invalid authored material settings',
      );
    }
    if (v.document.waypoints)
      assert(
        Object.keys(v.document.waypoints).length <= 4 &&
          Object.values(v.document.waypoints).every(
            (p) =>
              /^[0-9a-f-]{36}$/.test(p.entity_id) &&
              typeof p.label === 'string' &&
              p.label.length <= 128 &&
              typeof p.narrative === 'string' &&
              p.narrative.length <= 512,
          ),
        'Invalid authored interaction points',
      );
    if (a.proposal.steps?.length) {
      assert(
        a.proposal.steps.length === a.proposal.modifications.length,
        'Incomplete creative plan',
      );
      for (let i = 0; i < a.proposal.steps.length; i++) {
        const step = a.proposal.steps[i],
          m = a.proposal.modifications[i];
        assert(
          step.id === 'step-' + String(i + 1).padStart(2, '0') &&
            step.operation === m.operation &&
            canonical(step.parameters) === canonical(m) &&
            step.inputs_sha256 === (await hashValue(m)) &&
            step.reversible === true &&
            canonical(step.dependencies) ===
              canonical(i ? ['step-' + String(i).padStart(2, '0')] : []),
          'Creative step integrity failed',
        );
      }
    }
    assert(
      Object.keys(v.document.objects).length <= 2 &&
        Object.values(v.document.objects).every(
          (o) =>
            o.asset === 'finalverse.m2-festival-light/v1' &&
            o.anchor === c.package.manifest.spatial.root_sha256 &&
            o.transform.position_mm.length === 3 &&
            o.transform.position_mm.every(Number.isSafeInteger),
        ),
      'Unapproved visual object',
    );
  }
  return p;
}
export async function readBounded(response, max) {
  assert(
    response.ok,
    'This publication is private, unavailable, or could not be loaded',
  );
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assert(size <= max, 'Response exceeds the preview size limit');
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return bytes;
}
export async function verifyAsset(asset, bytes, mime) {
  assert(
    bytes.byteLength === asset.byte_length &&
      mime.split(';')[0] === asset.media_type,
    'Asset type or length differs',
  );
  assert((await hash(bytes)) === asset.sha256, 'Asset integrity check failed');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (asset.media_type === 'audio/wav')
    assert(
      bytes.byteLength >= 44 &&
        new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
        new TextDecoder().decode(bytes.subarray(8, 12)) === 'WAVE',
      'Invalid audio container',
    );
  if (asset.media_type === 'model/gltf-binary')
    assert(
      bytes.byteLength >= 28 &&
        view.getUint32(0, true) === 0x46546c67 &&
        view.getUint32(4, true) === 2 &&
        view.getUint32(8, true) === bytes.byteLength,
      'Invalid geometry container',
    );
  return bytes;
}
export class LocalMetrics {
  constructor(clock = () => performance.now(), started = clock()) {
    this.clock = clock;
    this.started = started;
    this.counts = {
      preview_load_success: 0,
      experience_start: 0,
      audio_activation: 0,
      share_action: 0,
      open_from_share: 0,
      return_visit: 0,
    };
    this.firstMeaningfulMs = null;
    this.returnVisitMeasured = false;
  }
  event(name) {
    assert(Object.hasOwn(this.counts, name), 'Unsupported metric');
    this.counts[name]++;
  }
  meaningful() {
    if (this.firstMeaningfulMs === null)
      this.firstMeaningfulMs = Math.round(this.clock() - this.started);
  }
  snapshot() {
    return {
      scope: 'this tab only; no analytics transmission',
      counts: { ...this.counts },
      first_meaningful_interaction_ms: this.firstMeaningfulMs,
      return_visit_measured: this.returnVisitMeasured,
    };
  }
}
