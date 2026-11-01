import { assert, hash, validatePublication, canonical } from './protocol.mjs';
export async function validateRuntimeEntry(entry, expected) {
  assert(
    entry &&
      Object.keys(entry).sort().join('|') ===
        'publication|scene|schema_version',
    'Unsupported entry fields',
  );
  assert(
    entry.schema_version === 'finalverse.experience-entry/v1',
    'Unsupported entry schema',
  );
  const publication = await validatePublication(
    { publication: entry.publication, status: 'published' },
    { id: expected.experience, version: expected.version, entity: null },
  );
  const bytes = new TextEncoder().encode(entry.scene);
  assert(
    bytes.byteLength === publication.content.fallback.scene.byte_length &&
      (await hash(bytes)) === publication.content.fallback.scene.sha256,
    'Entry scene integrity failed',
  );
  const scene = JSON.parse(entry.scene);
  assert(
    canonical(scene.publication) ===
      canonical(publication.content.package.manifest.spatial),
    'Source publication substitution',
  );
  const objects = [
    ...scene.entities.map((e) => ({ id: e.entity.entity_id, model: e.model })),
    ...(publication.content.generated?.objects || []).map((o) => ({
      id: o.id,
      model: o.model.sha256,
    })),
  ];
  assert(
    objects.length <= 219 &&
      new Set(objects.map((o) => o.id)).size === objects.length &&
      objects.every(
        (o) =>
          publication.content.assets[o.model]?.media_type ===
          'model/gltf-binary',
      ),
    'Invalid object bindings',
  );
  return {
    reference: {
      experience: publication.content.experience,
      version: publication.version,
    },
    object_ids: objects.map((o) => o.id),
    scene_sha256: publication.content.fallback.scene.sha256,
  };
}
