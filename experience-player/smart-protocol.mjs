import { assert, hashValue, validatePublication } from './protocol.mjs';
export const TEMPLATE_IDS = [
  'winter-wonderland',
  'cyberpunk-montreal',
  'golden-hour',
  'jazz-night',
  'festival-of-lights',
  'quiet-montreal',
];
export const QUICK_ACTIONS = {
  more_magical: '✦ More magical',
  warmer: 'Warmer',
  more_cinematic: 'More cinematic',
  more_peaceful: 'More peaceful',
  more_festive: 'More festive',
  change_music: 'Change music mix',
  change_time: 'Change time of day',
  adjust_atmosphere: 'Adjust atmosphere',
};
export const defaultSelection = () => ({
  season: 'unspecified',
  time_of_day: 'evening',
});
export function deviceProfile({
  width,
  reducedMotion = false,
  webgl = true,
  audio = true,
}) {
  return {
    quality: width < 700 ? 'low' : 'balanced',
    reduced_motion: reducedMotion,
    webgl,
    audio,
  };
}
export function validateTemplate(t) {
  const fields = [
    'schema_version',
    'id',
    'version',
    'creator',
    'title',
    'description',
    'preview_style',
    'environment_categories',
    'required_capabilities',
    'optional_capabilities',
    'approved_assets',
    'composition',
    'adaptation',
    'performance',
    'parameters',
    'publication_policy',
    'editorial_rank',
  ];
  assert(
    Object.keys(t).every((k) => fields.includes(k)) &&
      fields.every((k) => Object.hasOwn(t, k)),
    'Invalid declarative template fields',
  );
  assert(
    t.schema_version === 'finalverse.smart-template/v1' &&
      TEMPLATE_IDS.includes(t.id) &&
      Number.isInteger(t.version) &&
      t.version > 0,
    'Unknown curated template',
  );
  assert(
    t.creator.license === 'CC0-1.0' &&
      t.publication_policy.guest_temporary_only &&
      t.publication_policy.remix_with_attribution &&
      !t.publication_policy.extraction_permission,
    'Invalid template rights',
  );
  assert(
    t.parameters.maximum_visual_milli === 1000 &&
      t.parameters.maximum_metallic_milli === 300 &&
      t.parameters.maximum_audio_milli === 800 &&
      t.parameters.maximum_waypoints === 3,
    'Invalid template parameter ranges',
  );
  assert(
    ['district', 'lantern', 'roofs'].includes(t.composition.camera) &&
      t.composition.guided_interval_seconds >= 8 &&
      t.composition.guided_interval_seconds <= 30,
    'Unsupported template composition',
  );
  const v = t.composition.visual;
  assert(
    [
      'winter_stone',
      'heritage_stone',
      'copper_glass',
      'midnight_neon',
    ].includes(v.palette) &&
      Object.entries(v)
        .filter(([k]) => k !== 'palette')
        .every(([, v]) => Number.isInteger(v) && v >= 0 && v <= 1000) &&
      v.metallic_milli <= 300,
    'Invalid template materials',
  );
  return t;
}
export async function validateDraft(d, spatial) {
  assert(
    d.schema_version === 'finalverse.guest-draft/v1',
    'Unsupported personal draft',
  );
  assert(
    (await hashValue(d.proposal)) === d.proposal_hash,
    'Personal plan integrity differs',
  );
  validateTemplate(d.template);
  assert(
    TEMPLATE_IDS.includes(d.template.id) &&
      d.template.schema_version === 'finalverse.smart-template/v1',
    'Unknown curated experience',
  );
  assert(
    (await hashValue(d.candidate.package.manifest.spatial)) ===
      (await hashValue(spatial)),
    'Source geometry changed',
  );
  assert(
    d.context.simulated.weather_mode === 'authored_simulation' &&
      d.context.observed.environmental_observations.length === 0,
    'Authored effects cannot become observed weather',
  );
  assert(
    d.candidate.visual &&
      Object.values(d.candidate.visual)
        .filter((v) => typeof v === 'number')
        .every((v) => Number.isInteger(v) && v >= 0 && v <= 1000),
    'Invalid personal visual settings',
  );
  return d;
}
export async function validateEdition(e, now = Math.floor(Date.now() / 1000)) {
  assert(
    e.schema_version === 'finalverse.guest-edition/v1' &&
      (await hashValue(e.content)) === e.version,
    'Temporary edition integrity differs',
  );
  const c = e.content;
  validateTemplate(c.template);
  assert(
    c.expires_at > now &&
      c.expires_at > c.created_at &&
      c.expires_at <= c.created_at + 3600,
    'Temporary link expired',
  );
  assert(
    c.template.schema_version === 'finalverse.smart-template/v1' &&
      TEMPLATE_IDS.includes(c.template.id),
    'Unsupported smart template',
  );
  assert(
    c.template_extraction_permitted === false &&
      c.template.publication_policy.guest_temporary_only,
    'Invalid guest sharing policy',
  );
  assert(
    c.lineage.length > 0 && c.lineage.length <= 8,
    'Invalid temporary lineage',
  );
  assert(
    ['district', 'lantern', 'roofs'].includes(c.composition.camera) &&
      c.composition.guided_interval_seconds >= 8 &&
      c.composition.guided_interval_seconds <= 30,
    'Unsupported camera composition',
  );
  assert(
    c.environment.schema_version === 'finalverse.environment-context/v1' &&
      c.environment.simulated.weather_mode === 'authored_simulation' &&
      c.environment.observed.environmental_observations.length === 0,
    'Invalid environment context',
  );
  const p = await validatePublication(c.publication);
  for (const [id, pin] of Object.entries(c.template.approved_assets)) {
    const inheritedLight =
      id === 'finalverse.m2-festival-light/v1' &&
      Object.values(p.content.authored.version.document.objects).some(
        (o) => o.asset === id,
      )
        ? {
            sha256:
              'd738123e3327ad434c4b14bc746015748c18949f2d8c78ac28da9e3ab9acac99',
            provenance: {
              creator: 'Finalverse M2 authored lighting',
              attribution:
                "Reusable specification of M2's original warm festival light; no surveyed geometry or third-party artwork. CC0 dedication.",
              license: 'CC0-1.0',
              modified: false,
            },
          }
        : null;
    const a =
      p.content.package.assets[id] ||
      p.content.authored.proposal.asset_references[id] ||
      inheritedLight;
    assert(
      a &&
        a.sha256 === pin.sha256 &&
        (await hashValue(a.provenance)) === (await hashValue(pin.provenance)),
      'Template asset provenance differs',
    );
  }
  assert(
    (await hashValue(p.content.package.manifest.spatial)) ===
      (await hashValue(
        p.content.authored.version.document.package.manifest.spatial,
      )),
    'Changed source publication',
  );
  assert(
    p.content.parent.version === c.lineage.at(-1).version,
    'Remix lineage differs',
  );
  return { edition: e, publication: p };
}
