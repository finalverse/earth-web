import { assert, hash, hashValue } from '/protocol.mjs';
const $ = (id) => document.getElementById(id);
export async function validateGenerated(e, sourceIds = []) {
  assert(
    e?.schema_version === 'finalverse.generated-edition/v1' &&
      (await hashValue(e.graph)) === e.graph_hash,
    'Generated graph integrity failed',
  );
  assert(
    e.objects.length > 0 && e.objects.length <= 48,
    'Generated object budget exceeded',
  );
  const ids = new Set(sourceIds);
  for (const o of e.objects) {
    assert(
      /^[a-f0-9-]{36}$/.test(o.id) && !ids.has(o.id),
      'Generated identity collision',
    );
    ids.add(o.id);
    assert(
      e.graph.nodes[o.node] &&
        o.provenance.classification !== 'source_backed' &&
        o.model.media_type === 'model/gltf-binary',
      'Invalid generated provenance',
    );
    assert(
      o.translation_mm.every(Number.isSafeInteger) &&
        o.translation_mm.every((v) => Math.abs(v) <= 500000) &&
        o.bounds_mm.flat().every(Number.isSafeInteger),
      'Invalid generated bounds or transform',
    );
  }
  return e;
}
export function mountWorldCreator(host) {
  const life = new AbortController();
  let token = '',
    session = null,
    epoch = 0,
    disposed = false,
    pending = '',
    edition = null,
    selected = null,
    saved = false,
    published = null;
  let opening = null,
    generating = false;
  const shaders = new Map();
  const models = new Map(),
    urls = new Set(),
    measurements = [],
    receipts = [];
  let generationStart = 0,
    firstVisible = null;
  const text = (id, s) => {
    $(id).textContent = s;
  };
  const status = (s) => {
    text('world-creator-status', s);
    host.diagnostics();
  };
  const record = (cap, start, v) => {
    measurements.push({
      capability: cap,
      ms: performance.now() - start,
      state: v.state,
      timings: v.result?.timings || null,
      inference: v.result?.inference || null,
    });
    if (v.evidence) receipts.push(v.evidence);
    host.diagnostics();
  };
  async function api(action, body = {}) {
    const e = epoch;
    const r = await fetch('/api/v1/fabric/' + action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Capability ' + token } : {}),
      },
      body: JSON.stringify(body),
      signal: life.signal,
    });
    const v = await r.json();
    if (e !== epoch || disposed)
      throw new DOMException('Obsolete creation', 'AbortError');
    if (!r.ok) throw Error(v.message || 'Creative capability unavailable');
    return v;
  }
  async function ready() {
    if (token) return;
    if (opening) return opening;
    const startingEpoch = epoch;
    opening = (async () => {
      const p = host.publication();
      const credential = $('world-publisher').value.trim();
      const r = await fetch('/api/v1/fabric/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(credential ? { Authorization: 'Bearer ' + credential } : {}),
        },
        body: JSON.stringify({
          reference: { experience: p.content.experience, version: p.version },
        }),
        signal: life.signal,
      });
      const v = await r.json();
      $('world-publisher').value = '';
      if (!r.ok) throw Error(v.message);
      if (disposed || startingEpoch !== epoch) {
        void fetch('/api/v1/fabric/end', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Capability ' + v.token,
          },
          body: '{}',
          keepalive: true,
        });
        throw new DOMException('Obsolete creation', 'AbortError');
      }
      token = v.token;
      session = v;
      delete session.token;
    })().finally(() => {
      opening = null;
    });
    return opening;
  }
  async function invoke(cap, args) {
    await ready();
    session = await api('state');
    const b = session.bindings.find((b) => b.capability.id === cap);
    assert(b, 'Creative capability not offered');
    const id = 'creative-' + crypto.randomUUID();
    const start = performance.now();
    pending = id;
    const v = await api('invoke', {
      schema_version: 'finalverse.capability-invocation/v1',
      capability: b.capability,
      operation: {
        schema_version: 'finalverse.sil/v1',
        request_id: id,
        instance_id: session.instance_id,
        session_id: session.session_id,
        interaction_id: b.interaction_id,
        operation: b.operation,
        target: b.target,
        expected_context_revision: session.context_revision,
      },
      arguments: args,
    });
    pending = '';
    record(cap, start, v);
    if (v.state !== 'completed')
      throw Error(v.result?.error?.message || 'Creative operation refused');
    return v.result;
  }
  function clear() {
    for (const m of models.values())
      if (!host.viewer().isDestroyed())
        host.viewer().scene.primitives.remove(m);
    models.clear();
    host.audioEmitter(null);
    for (const s of shaders.values()) s.destroy();
    shaders.clear();
    for (const u of urls) URL.revokeObjectURL(u);
    urls.clear();
  }
  async function render(e, privateAssets = true) {
    await validateGenerated(e, host.sourceIds());
    clear();
    edition = e;
    host.audioEmitter(e.graph.nodes.score?.parameters || null);
    $('version-badge').textContent = privateAssets
      ? 'PRIVATE GENERATED PREVIEW'
      : 'VERIFIED GENERATED EDITION';
    const current = epoch;
    const C = host.Cesium;
    const matrix = host.frame();
    const box = $('generated-objects');
    box.replaceChildren();
    let cursor = 0;
    async function worker() {
      while (cursor < e.objects.length) {
        const o = e.objects[cursor++];
        let bytes;
        if (privateAssets) {
          const response = await fetch(
            '/api/v1/creative/assets/' + o.model.sha256,
            {
              headers: { Authorization: 'Capability ' + token },
              signal: life.signal,
            },
          );
          assert(response.ok, 'Private generated asset unavailable');
          bytes = await response.arrayBuffer();
        } else bytes = await host.asset(o.model.sha256);
        assert(
          bytes.byteLength === o.model.byte_length &&
            (await hash(bytes)) === o.model.sha256,
          'Generated asset integrity failed',
        );
        if (current !== epoch || disposed) return;
        const url = URL.createObjectURL(
          new Blob([bytes], { type: 'model/gltf-binary' }),
        );
        urls.add(url);
        const yaw = C.Matrix3.fromRotationY((o.yaw_mdeg * Math.PI) / 180000);
        const tr = C.Matrix4.fromRotationTranslation(
          yaw,
          new C.Cartesian3(...o.translation_mm.map((v) => v / 1000)),
        );
        const modelMatrix = C.Matrix4.multiply(matrix, tr, new C.Matrix4());
        const shader = o.interactive
          ? new C.CustomShader({
              uniforms: {
                u_lanternOn: { type: C.UniformType.FLOAT, value: 1 },
              },
              fragmentShaderText:
                'void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.emissive *= u_lanternOn; }',
            })
          : undefined;
        const model = await C.Model.fromGltfAsync({
          url,
          id: 'generated:' + o.id,
          modelMatrix,
          scale: o.scale_milli / 1000,
          upAxis: C.Axis.Z,
          forwardAxis: C.Axis.X,
          allowPicking: true,
          customShader: shader,
          imageBasedLighting: new C.ImageBasedLighting({
            imageBasedLightingFactor: new C.Cartesian2(0.8, 0),
          }),
          color: C.Color.WHITE,
          colorBlendMode: C.ColorBlendMode.MIX,
          colorBlendAmount: 0,
        });
        if (current !== epoch || disposed) {
          model.destroy();
          shader?.destroy();
          return;
        }
        host.viewer().scene.primitives.add(model);
        models.set(o.id, model);
        if (shader) shaders.set(o.id, shader);
        model.readyEvent.addEventListener(() => {
          if (!disposed && current === epoch && firstVisible === null) {
            firstVisible = performance.now() - generationStart;
            host.diagnostics();
          }
        });
        host.viewer().scene.requestRender();
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    if (disposed || current !== epoch) return;
    for (const o of e.objects) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o.kind.replaceAll('_', ' ') + ' · ' + o.node;
      b.dataset.object = o.id;
      b.addEventListener('click', () => void run(() => inspect(o.id)), {
        signal: life.signal,
      });
      box.append(b);
    }
    $('generated-controls').hidden = false;
    $('world-generated-count').textContent =
      e.objects.length +
      ' new authored objects · ' +
      new Set(e.objects.map((o) => o.model.sha256)).size +
      ' GLB assets · source scene unchanged';
    focus();
    host.probeFrames();
    host.diagnostics();
  }
  function focus() {
    if (!edition) return;
    const C = host.Cesium;
    const p = edition.graph.nodes.placement.parameters.pivot_mm;
    const target = C.Matrix4.multiplyByPoint(
      host.frame(),
      new C.Cartesian3(p[0] / 1000, p[1] / 1000 + 2, p[2] / 1000),
      new C.Cartesian3(),
    );
    host
      .viewer()
      .camera.lookAt(target, new C.HeadingPitchRange(0.55, -0.65, 70));
    host.viewer().camera.lookAtTransform(C.Matrix4.IDENTITY);
    host.viewer().scene.requestRender();
  }
  async function inspect(id) {
    $('world-creator').hidden = false;
    selected = edition.objects.find((o) => o.id === id);
    if (token) {
      const r = await invoke('creative.inspect', { object_id: id });
      selected = r.object;
    }
    text(
      'world-object-info',
      selected.node +
        ' · ' +
        selected.provenance.classification.replaceAll('_', ' ') +
        ' · ' +
        selected.vertices +
        ' vertices · ' +
        selected.triangles +
        ' triangles · ' +
        selected.id,
    );
    $('world-toggle').disabled = !selected.interactive;
    $('world-modify').disabled = !token;
    text(
      'world-object-help',
      token
        ? 'Material edits and lantern toggles are private typed SIL/EK actions.'
        : 'Published immutable object. Choose Remix to edit it in your own private scope.',
    );
  }
  async function generate() {
    if (generating)
      throw Error('A creation is already running; cancel or wait.');
    generating = true;
    $('world-generate').disabled = true;
    try {
      generationStart = performance.now();
      firstVisible = null;
      saved = false;
      $('world-publish-consent').checked = false;
      published = null;
      status('Planning an original winter market…');
      const p = await invoke('creative.plan', {
        intention: $('world-intention').value.trim(),
        provider: $('world-provider').value,
      });
      status('Generating validated geometry and portable materials…');
      const g = await invoke('creative.generate', { graph_hash: p.graph_hash });
      await invoke('creative.preview', { graph_hash: g.edition.graph_hash });
      await render(g.edition);
      status(
        p.inference
          ? 'Real local AI planned these new objects. Preview is private; approve before save or publication.'
          : 'Procedural market ready. No model inference used. Preview is private.',
      );
    } finally {
      generating = false;
      $('world-generate').disabled = false;
    }
  }
  async function run(fn) {
    try {
      await fn();
    } catch (e) {
      pending = '';
      if (e.name !== 'AbortError' && !disposed) status(e.message);
    }
  }
  function on(id, fn) {
    $(id).addEventListener('click', () => void run(fn), {
      signal: life.signal,
    });
  }
  on('create-something', async () => {
    $('world-creator').hidden = false;
    $('world-creator').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  on('world-generate', generate);
  on('world-template', async () => {
    $('world-intention').value =
      'Create a beautiful winter market with eight wooden stalls, glowing lanterns, decorated trees, a stage, benches and original music.';
    $('world-provider').value = 'deterministic';
  });
  on('world-cancel', async () => {
    if (pending) await api('cancel', { request_id: pending });
  });
  on('world-modify', async () => {
    assert(selected && token, 'Select an object in your private draft');
    const r = await invoke('creative.modify', {
      object_id: selected.id,
      palette: $('world-palette').value,
    });
    saved = false;
    $('world-publish-consent').checked = false;
    await invoke('creative.preview', { graph_hash: r.edition.graph_hash });
    await render(r.edition);
    status(
      'Updated the selected object’s material. Review and save this exact new graph.',
    );
  });
  on('world-toggle', async () => {
    assert(selected && token, 'Remix this publication to interact privately');
    const r = await invoke('creative.toggle', {
      object_id: selected.id,
      approve: true,
    });
    const C = host.Cesium;
    const m = models.get(r.object_id);
    shaders.get(r.object_id)?.setUniform('u_lanternOn', r.light_on ? 1 : 0);
    m.color = r.light_on
      ? C.Color.WHITE
      : C.Color.fromCssColorString('#152033');
    m.colorBlendAmount = r.light_on ? 0 : 1;
    host.viewer().scene.requestRender();
    status(
      r.light_on
        ? 'Lantern on · authorized private presentation'
        : 'Lantern off · authorized private presentation',
    );
  });
  on('world-save', async () => {
    assert(edition, 'Generate a market first');
    await invoke('creative.save', {
      graph_hash: edition.graph_hash,
      approve: true,
    });
    saved = true;
    status(
      'Exact generated graph approved and saved privately. Publication requires a separate consent.',
    );
  });
  on('world-publish', async () => {
    assert(saved, 'Approve and save this exact graph first');
    assert(
      $('world-publish-consent').checked,
      'Confirm publication of this exact saved market',
    );
    const r = await invoke('creative.publish', {
      graph_hash: edition.graph_hash,
      confirm_public: true,
    });
    published = r.path;
    status(
      'Immutable market published. The original source edition remains unchanged.',
    );
    await host.share(r.path);
  });
  on('world-share', async () => {
    assert(published, 'Publish a saved immutable edition before sharing');
    await host.share(published);
  });
  on('world-remix', async () => {
    await end();
    $('world-provider').value = 'remix';
    $('world-creator').hidden = false;
    await generate();
  });
  on('world-focus', async () => focus());
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  on('world-export', async () => {
    assert(selected, 'Select a generated object first');
    if (token)
      await invoke('creative.export', { graph_hash: edition.graph_hash });
    const bytes = token
      ? await (
          await fetch('/api/v1/creative/assets/' + selected.model.sha256, {
            headers: { Authorization: 'Capability ' + token },
          })
        ).arrayBuffer()
      : await host.asset(selected.model.sha256);
    assert(
      (await hash(bytes)) === selected.model.sha256,
      'Export integrity failed',
    );
    download(
      selected.node + '.glb',
      new Blob([bytes], { type: 'model/gltf-binary' }),
    );
    status(
      'Exported selected GLB. Export the interchange manifest separately to retain object identity, materials, transforms and provenance.',
    );
  });
  on('world-export-manifest', async () => {
    assert(edition, 'Generate or open a market first');
    const meta = token
      ? await invoke('creative.export', { graph_hash: edition.graph_hash })
      : { schema_version: 'finalverse.studio-interchange/v1', edition };
    download(
      'finalverse-interchange.json',
      new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }),
    );
    status(
      'Exported typed interchange metadata. Full Studio UI integration is separate from this portable interchange.',
    );
  });
  async function end() {
    epoch++;
    const credential = token;
    token = '';
    session = null;
    pending = '';
    saved = false;
    selected = null;
    clear();
    if (credential)
      await fetch('/api/v1/fabric/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Capability ' + credential,
        },
        body: '{}',
        keepalive: true,
      }).catch(() => {});
    host.diagnostics();
  }
  on('world-end', async () => {
    await end();
    edition = null;
    $('generated-controls').hidden = true;
    $('generated-objects').replaceChildren();
    status(
      'Private creation ended; generated models, URLs and scoped jobs released.',
    );
  });
  const initial = host.publication().content.generated;
  if (initial) {
    generationStart = performance.now();
    void run(async () => {
      await render(initial, false);
      published = host.path();
      status(
        'Immutable generated edition · original source and generated identities stay distinct. Remix to edit privately.',
      );
    });
  }
  $('create-something').disabled = false;
  return {
    pick: (id) => void run(() => inspect(id)),
    snapshot: () => ({
      models: models.size,
      object_urls: urls.size,
      owned_shaders: shaders.size,
      attachment_active: !!token,
      pending: !!pending,
      graph_hash: edition?.graph_hash || null,
      objects: edition?.objects.length || 0,
      selected_object: selected?.id || null,
      saved,
      first_visible_ms: firstVisible,
      measurements,
      evidence: receipts,
      world_mutations: 0,
    }),
    dispose: async () => {
      if (disposed) return;
      await end();
      disposed = true;
      life.abort();
    },
  };
}
