// Lumi is a scoped capability client. All proposals and service effects cross SIL/EK.
const $ = (id) => document.getElementById(id);
const uid = (p) => p + '-' + crypto.randomUUID();
const AGENT_CAPS = [
  'spatial.inspect',
  'spatial.navigate',
  'provenance.read',
  'experience.inspect',
  'lumi.interact',
  'experience.propose',
  'experience.preview',
];
export function mountIntelligence(host) {
  const lifetime = new AbortController();
  let token = '',
    session,
    initializing,
    agentReady = false,
    pending = null,
    disposed = false,
    epoch = 0,
    draft = null,
    previewed = false,
    applied = false,
    selected = null,
    children = [],
    providerInfo = null;
  const measurements = [],
    evidence = [];
  let worldProposal = null;
  const text = (id, s) => {
    $(id).textContent = s;
  };
  const status = (s) => {
    text('companion-status', s);
    host.diagnostics();
  };
  function record(action, start, result) {
    measurements.push({
      action,
      ms: performance.now() - start,
      state: result?.state || 'completed',
      request_id: result?.authorization?.request_id || null,
      receipt: result?.result?.receipt || null,
      intelligence: result?.result?.intelligence || null,
    });
    if (measurements.length > 64) measurements.shift();
    if (result?.evidence) {
      evidence.push(result.evidence);
      if (evidence.length > 64) evidence.shift();
    }
    host.diagnostics();
  }
  async function api(action, data = {}, options = {}) {
    const current = epoch;
    const r = await fetch('/api/v1/fabric/' + action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token || token
          ? { Authorization: 'Capability ' + (options.token || token) }
          : {}),
        ...(options.policy
          ? { 'X-Finalverse-Intelligence': JSON.stringify(options.policy) }
          : {}),
        ...(options.world
          ? { 'X-Finalverse-World-Attachment': options.world }
          : {}),
      },
      body: JSON.stringify(data),
      signal: lifetime.signal,
    });
    const value = await r.json();
    if (current !== epoch || disposed) {
      if (action === 'session' && value.token)
        void fetch('/api/v1/fabric/end', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Capability ' + value.token,
          },
          body: '{}',
          keepalive: true,
        });
      const e = new Error('Obsolete companion response');
      e.name = 'AbortError';
      throw e;
    }
    if (!r.ok) throw Error(value.message || 'This capability is unavailable');
    return value;
  }
  async function ready() {
    if (token) return session;
    if (initializing) return initializing;
    initializing = (async () => {
      const p = host.publication();
      session = await api(
        'session',
        host.source()
          ? { source: host.source() }
          : {
              reference: {
                experience: p.content.experience,
                version: p.version,
              },
            },
      );
      token = session.token;
      delete session.token;
      const r = await fetch('/api/v1/fabric/capabilities', {
        signal: lifetime.signal,
      });
      const list = await r.json();
      const box = $('capability-list');
      box.replaceChildren();
      for (const d of list) {
        const row = document.createElement('li');
        row.textContent =
          d.title +
          (d.explicit_consent
            ? ' · your approval required'
            : ' · bounded scope');
        box.append(row);
      }
      status(
        'Lumi is ready. Public source knowledge stays separate from authored atmosphere.',
      );
      return session;
    })().finally(() => {
      initializing = null;
    });
    return initializing;
  }
  async function refresh() {
    session = await api('state');
    return session;
  }
  async function enable() {
    await ready();
    if (agentReady) return;
    if (!session.agent) {
      session = await api('agent-start', {
        approve: true,
        capabilities: AGENT_CAPS,
      });
    }
    agentReady = true;
    text('companion-identity', 'Lumi · bounded companion');
  }
  async function invoke(cap, args = {}, entity = null, child = null) {
    await ready();
    const start = performance.now();
    const own = child
      ? await api('state', {}, { token: child.token })
      : await refresh();
    const binding = own.bindings.find(
      (b) =>
        b.capability.id === cap &&
        (!entity || b.target.entity?.entity_id === entity),
    );
    if (!binding)
      throw Error(
        'This place or capability is not available in the current edition.',
      );
    const request = {
      schema_version: 'finalverse.capability-invocation/v1',
      capability: binding.capability,
      operation: {
        schema_version: 'finalverse.sil/v1',
        request_id: uid('web'),
        instance_id: own.instance_id,
        session_id: own.session_id,
        interaction_id: binding.interaction_id,
        operation: binding.operation,
        target: binding.target,
        expected_context_revision: own.context_revision,
      },
      arguments: args,
    };
    const v = await api('invoke', request, child ? { token: child.token } : {});
    record(cap, start, v);
    if (v.state !== 'completed')
      throw Error(v.result?.error?.message || 'This capability was refused.');
    return v;
  }
  function on(id, fn) {
    $(id).addEventListener('click', () => void run(fn), {
      signal: lifetime.signal,
    });
  }
  async function run(fn) {
    try {
      await fn();
    } catch (e) {
      if (e.name !== 'AbortError' && !disposed) status(e.message);
    }
  }
  async function recommendations() {
    await enable();
    const start = performance.now();
    status('Lumi is inspecting the available geometry and its provenance…');
    const v = await api('agent-turn', {
      request_id: uid('nearby'),
      question: 'nearby',
      source_entity: selected,
      intention: null,
    });
    record('agent_nearby', start, v.result);
    if (v.result.state !== 'completed')
      throw Error(
        v.result.result?.error?.message ||
          'Lumi could not inspect this source.',
      );
    const result = v.result.result;
    const box = $('nearby-places');
    box.replaceChildren();
    text('companion-response', result.response);
    for (const e of result.recommendations || []) {
      const card = document.createElement('button');
      card.type = 'button';
      card.dataset.source = e.entity.entity_id;
      const title = document.createElement('strong');
      title.textContent = e.label;
      const note = document.createElement('small');
      note.textContent =
        e.source_feature_id + ' · ' + e.geometry_status + ' geometry';
      card.append(title, note);
      card.addEventListener(
        'click',
        () => void run(() => navigate(e.entity.entity_id)),
        { signal: lifetime.signal },
      );
      box.append(card);
    }
    await refresh();
    status(
      'Recommendations use actual source entities. No historical facts were invented.',
    );
  }
  async function navigate(id) {
    const v = await invoke('spatial.navigate', {}, id);
    selected = id;
    host.focus(v.result.entity_id);
    const p = await invoke('provenance.read', {}, id);
    text(
      'companion-source',
      'Source-backed · ' +
        id +
        ' · ' +
        (p.result.notes || 'Only published source metadata is available.'),
    );
    text(
      'companion-response',
      'You’re exploring a verified source identity. The full building and facade may be estimated.',
    );
    status(
      'Focused the selected source anchor. You can return to free exploration at any time.',
    );
  }
  function policy() {
    const p = $('intelligence-provider').value;
    return {
      preferred: p === 'deterministic' ? 'deterministic' : 'configured',
      privacy: 'local_only',
      max_latency_ms: 60000,
      max_context_bytes: 16384,
      max_output_tokens: 900,
      max_cost_micro_usd: 0,
      fallback: p === 'auto',
      require_real_inference: p === 'configured',
    };
  }
  function setPending(value) {
    pending = value;
    $('companion-cancel').hidden = !value;
    for (const id of [
      'companion-nearby',
      'companion-propose',
      'companion-preview',
      'companion-apply',
      'companion-share',
    ])
      $(id).disabled = !!value;
    host.diagnostics();
  }
  async function propose() {
    await enable();
    if (pending) throw Error('A bounded reasoning request is already running.');
    const intention = $('companion-intention').value.trim();
    if (!intention) throw Error('Describe a small atmosphere change first.');
    const id = uid('atmosphere'),
      start = performance.now();
    const current = epoch;
    previewed = false;
    applied = false;
    draft = null;
    $('companion-review').hidden = true;
    setPending({ id, started: start, cancelled: false });
    status(
      $('intelligence-provider').value === 'configured'
        ? 'Lumi is asking the configured local model. You can keep exploring or cancel.'
        : 'Lumi is preparing an instant private proposal…',
    );
    try {
      const v = await api(
        'agent-turn',
        {
          request_id: id,
          question: 'atmosphere',
          source_entity: selected,
          intention,
        },
        { policy: policy() },
      );
      record('agent_atmosphere', start, v.result);
      if (v.result.state === 'cancelled') {
        status('Cancelled. No atmosphere was applied, shared or published.');
        return;
      }
      if (v.result.state !== 'completed')
        throw Error(
          v.result.result?.error?.message ||
            'Intelligence is unavailable. Instant templates are still ready.',
        );
      draft = v.result.result.draft;
      const intelligence = v.result.result.intelligence;
      $('companion-review').hidden = false;
      text('companion-description', draft.candidate.description);
      text(
        'companion-provider',
        intelligence.inference.real_inference
          ? 'AI-authored suggestion · ' +
              intelligence.inference.served_model +
              ' · ' +
              (intelligence.inference.latency_ms / 1000).toFixed(1) +
              's'
          : 'Deterministic authored proposal · no model inference',
      );
      text(
        'companion-plan',
        'Private presentation only · approved assets · source geometry remains unchanged',
      );
      text('companion-hash', draft.proposal_hash);
      status(
        intelligence.fallback
          ? 'Configured inference was unavailable. This is an explicitly identified deterministic fallback.'
          : 'Proposal ready. Preview it, then approve the exact atmosphere before applying.',
      );
      await refresh();
    } finally {
      if (current === epoch) setPending(null);
    }
  }
  on('companion-nearby', recommendations);
  on('companion-propose', propose);
  on('companion-preview', async () => {
    if (!draft) throw Error('Ask for an atmosphere proposal first.');
    const v = await invoke('experience.preview', {
      proposal_hash: draft.proposal_hash,
    });
    await host.apply(v.result.draft.candidate, v.result.draft.composition);
    previewed = true;
    status('Preview only · approve to keep this exact private atmosphere.');
  });
  on('companion-apply', async () => {
    if (!draft || !previewed)
      throw Error('Preview this exact proposal before approval.');
    const v = await invoke('experience.apply', {
      proposal_hash: draft.proposal_hash,
      approve: true,
    });
    draft = v.result.draft;
    applied = true;
    status(
      'Applied privately. Choose Share when you want someone else to experience it.',
    );
  });
  on('companion-share', async () => {
    if (!draft || !applied)
      throw Error('Preview and approve the exact atmosphere first.');
    $('companion-share-review').hidden = false;
    $('companion-share-consent').checked = false;
  });
  on('companion-share-confirm', async () => {
    if (!$('companion-share-consent').checked)
      throw Error(
        'Confirm that anyone with this temporary link can view and remix the approved edition.',
      );
    if (!applied || !draft)
      throw Error('The approved private edition is no longer available.');
    const v = await invoke('experience.share', {
      proposal_hash: draft.proposal_hash,
      confirm_public: true,
    });
    $('companion-share-review').hidden = true;
    await host.share(v.result.path);
    status(
      'Temporary edition shared with source attribution. No persistent world change was published.',
    );
  });
  on('companion-share-back', async () => {
    $('companion-share-review').hidden = true;
  });
  on('companion-cancel', async () => {
    if (!pending) return;
    pending.cancelled = true;
    await api('cancel', { request_id: pending.id });
    status(
      'Cancellation requested. The runtime is releasing this reasoning request…',
    );
  });
  on('companion-revoke', async () => {
    await ready();
    await api('revoke', { capability: 'experience.propose' });
    status(
      'Lumi’s planning grant is revoked. Source inspection still works. End and restart the companion to grant a fresh scope.',
    );
  });
  on('companion-reset', async () => {
    await host.restore();
    previewed = false;
    status('Returned to the immutable published atmosphere.');
  });
  on('companion-compose', async () => {
    await ready();
    const records = await (
      await fetch('/api/v1/publications', { signal: lifetime.signal })
    ).json();
    const root = host.publication();
    const published = records.map((r) => r.publication);
    const district =
      published.find((p) => p.version === root.version) || published[0];
    const other = published.find((p) => p.version !== district?.version);
    if (!other)
      throw Error('Two public immutable editions are needed for composition.');
    const ref = (p) => ({
      experience: p.content.experience,
      version: p.version,
    });
    const graph = {
      schema_version: 'finalverse.experience-composition/v1',
      id: 'montreal-companion-layers',
      parent: ref(root),
      nodes: {
        district: {
          experience: ref(district),
          placement: null,
          capability_dependencies: ['spatial.inspect'],
          presentation: 'background',
          provenance: [ref(district)],
        },
        sources: {
          experience: ref(other),
          placement: null,
          capability_dependencies: ['provenance.read'],
          presentation: 'inspect',
          provenance: [ref(other)],
        },
      },
      dependencies: [
        {
          before: 'district',
          after: 'sources',
          trigger: 'on_activate',
          lifecycle_dependency: true,
          presentation_dependency: true,
        },
      ],
    };
    const start = performance.now();
    const v = await api('compose', graph);
    children = v.children.map((n) => ({
      node: n.node,
      token: n.attachment.token,
      reference: n.reference,
      state: n.state,
    }));
    const list = $('composition-layers');
    list.replaceChildren();
    for (const child of children) {
      const row = document.createElement('li');
      row.textContent =
        child.node +
        ' · immutable ' +
        child.reference.version.slice(0, 8) +
        ' · independent read-only scope';
      const inspect = document.createElement('button');
      inspect.type = 'button';
      inspect.textContent = 'Inspect ' + child.node;
      inspect.addEventListener(
        'click',
        () =>
          void run(async () => {
            const cap =
              child.node === 'district' ? 'spatial.inspect' : 'provenance.read';
            const v = await invoke(cap, {}, null, child);
            text(
              'composition-state',
              'Read through ' +
                child.node +
                ' · independent EK receipt · ' +
                v.state,
            );
          }),
        { signal: lifetime.signal },
      );
      row.append(' ', inspect);
      list.append(row);
    }
    text(
      'composition-state',
      'Two EK instances active · no asset copies · no transitive creator or world grants',
    );
    record('composition', start, { state: 'completed' });
  });
  on('companion-world-propose', async () => {
    if (!host.world())
      throw Error(
        'Enter Montréal Alive before requesting a shared world action.',
      );
    if (!selected) selected = host.selected()?.entity.entity_id || null;
    if (!selected) throw Error('Choose a source-backed place first.');
    worldProposal = selected;
    text('companion-world-target', 'Source anchor · ' + worldProposal);
    $('companion-world-review').hidden = false;
  });
  on('companion-world-approve', async () => {
    await ready();
    const world = host.world();
    if (!world) throw Error('The world attachment has ended.');
    session = await api(
      'link-world',
      { approve: true },
      { world: world.token },
    );
    if (!worldProposal) throw Error('Review the exact source anchor first.');
    const v = await invoke('mutsea.beacon', { approve: true }, worldProposal);
    if (v.result.receipt?.outcome.status !== 'applied')
      throw Error('No authoritative world commit was received.');
    $('companion-world-review').hidden = true;
    status(
      'The approved beacon is committed in MutSea. Its receipt is distinct from the EK authorization.',
    );
  });
  async function end() {
    epoch++;
    const credential = token;
    token = '';
    session = null;
    agentReady = false;
    draft = null;
    previewed = false;
    applied = false;
    pending = null;
    children = [];
    worldProposal = null;
    if (credential) {
      try {
        await fetch('/api/v1/fabric/end', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Capability ' + credential,
          },
          body: '{}',
          keepalive: true,
        });
      } catch {}
    }
    $('composition-layers').replaceChildren();
    text('composition-state', '');
    for (const id of [
      'companion-review',
      'companion-share-review',
      'companion-world-review',
      'companion-cancel',
    ])
      $(id).hidden = true;
    for (const id of [
      'companion-nearby',
      'companion-propose',
      'companion-preview',
      'companion-apply',
      'companion-share',
    ])
      $(id).disabled = false;
    status(
      'Companion ended · reasoning, scoped credentials and child experience leases released.',
    );
  }
  on('companion-end', end);
  void run(async () => {
    const r = await fetch('/api/v1/fabric/providers', {
      signal: lifetime.signal,
    });
    if (!r.ok) return;
    providerInfo = await r.json();
    const local = providerInfo.providers.find(
      (p) => p.id === 'configured' && p.local,
    );
    $('intelligence-provider').querySelector('[value="configured"]').disabled =
      !local;
    text(
      'intelligence-availability',
      local
        ? 'Optional local intelligence: ' + local.model
        : 'Instant intelligence is ready. No model is required.',
    );
  });
  $('companion-nearby').disabled = false;
  $('companion-propose').disabled = false;
  return {
    snapshot: () => ({
      session_active: !!token,
      instance_id: session?.instance_id || null,
      agent: session?.agent || null,
      grants: session?.grants || [],
      pending: pending
        ? { request_id: pending.id, cancelled: pending.cancelled }
        : null,
      proposal_hash: draft?.proposal_hash || null,
      previewed,
      applied,
      composition_nodes: children.map((c) => ({
        node: c.node,
        reference: c.reference,
        state: c.state,
      })),
      measurements,
      evidence,
      credential_scope: 'document memory only; never exported',
      model_prompt_exported: false,
    }),
    dispose: async () => {
      if (disposed) return;
      await end();
      disposed = true;
      lifetime.abort();
    },
  };
}
