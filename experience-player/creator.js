import { assert, hashValue, readBounded, MAX_DOCUMENT } from '/protocol.mjs';
const $ = (id) => document.getElementById(id);
export function mountCreator(host) {
  let draft,
    token = '',
    busy = false,
    comparison = false,
    disposed = false,
    currentRequest = null,
    providerStatus;
  const timing = {},
    events = [],
    controller = new AbortController();
  const snapshot = () => ({
    state: draft?.state || 'idle',
    draft_active: !!draft,
    proposal_hash: draft?.proposal_hash || null,
    saved_version: draft?.saved_version || null,
    revision_index: draft?.revision_index || 0,
    revision_count: draft?.draft_revisions?.length || 0,
    steps: draft?.proposal.steps?.length || 0,
    provider: draft?.provider || null,
    pending_request: currentRequest !== null,
    timing_ms: { ...timing },
    events: [...events],
  });
  const state = (text) => {
    $('creator-status').textContent = text;
    host.diagnostics();
  };
  async function request(path, data, method = 'POST', keepalive = false) {
    const r = await fetch('/api/v1/creator/' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      credentials: 'omit',
      cache: 'no-store',
      ...(keepalive ? { keepalive: true } : { signal: controller.signal }),
    });
    const value = JSON.parse(
      new TextDecoder().decode(
        await readBounded({ ok: true, body: r.body }, MAX_DOCUMENT),
      ),
    );
    assert(
      r.ok && !value.code,
      (value.code ? value.code.replaceAll('_', ' ') + ': ' : '') +
        (value.message || 'Creation request failed'),
    );
    return value;
  }
  const action = (name, extra = {}) => {
    assert(draft, 'Create a plan first');
    return request(draft.draft_id + '/' + name, {
      proposal_hash: draft.proposal_hash,
      ...extra,
    });
  };
  function controls() {
    for (const id of [
      'generate',
      'intention',
      'provider',
      'winter-idea',
      'quiet-idea',
      'daylight-idea',
      'check-provider',
    ])
      $(id).disabled = busy || disposed;
    $('cancel-generation').hidden = !currentRequest || disposed;
    $('proposal-panel').hidden = !draft;
    const saved = !!draft?.saved_version,
      active = !!draft;
    $('preview-draft').hidden = saved || draft?.state === 'approved';
    $('preview-draft').disabled = busy || !active;
    $('approve-draft').hidden = draft?.state !== 'preview';
    $('approve-draft').disabled = busy || comparison;
    $('save-draft').hidden = draft?.state !== 'approved';
    $('save-draft').disabled = busy;
    $('publish-draft').hidden = !saved;
    $('publish-draft').disabled = busy || draft?.state === 'reverted';
    $('compare-draft').hidden = !active;
    $('compare-draft').disabled = busy;
    $('reject-draft').disabled = busy || !active;
    $('revert-draft').hidden = !saved;
    $('revert-draft').disabled = busy || draft?.state === 'reverted';
    $('refine-draft').disabled = busy || !active || saved;
    $('refinement').disabled = busy || saved;
    $('undo-draft').hidden = !active || !draft?.revision_index;
    $('undo-draft').disabled = busy || saved;
    $('restore-draft').hidden =
      !active ||
      draft?.revision_index === (draft?.draft_revisions?.length || 1) - 1;
    $('restore-draft').disabled = busy || saved;
  }
  async function run(fn) {
    if (busy || disposed) return;
    busy = true;
    controls();
    try {
      await fn();
    } catch (e) {
      if (!disposed) state(e.message);
    } finally {
      currentRequest = null;
      busy = false;
      controls();
      host.diagnostics();
    }
  }
  function credential() {
    token = $('creator-token').value.trim();
    assert(
      token.length >= 32,
      'Open Local creator access and enter your publisher credential. It stays in this tab.',
    );
  }
  async function inspect(probe = false) {
    credential();
    const v = await request(
      'providers' + (probe ? '?probe=1' : ''),
      undefined,
      'GET',
    );
    providerStatus = v.status || v;
    $('provider-status').textContent = providerStatus.configured
      ? `${providerStatus.provider} · ${providerStatus.model} · ${providerStatus.destination}\n${providerStatus.context}${v.models ? '\nAvailable: ' + v.models.join(', ') : ''}`
      : 'No model configured. Offline ideas remain available; no model fallback is implied.';
    $('remote-confirm-label').hidden =
      !providerStatus.configured || providerStatus.local;
    return providerStatus;
  }
  async function planning(path, data) {
    credential();
    if ($('provider').value === 'model') {
      const p = await inspect();
      assert(
        p.configured,
        'No model configured. Choose offline ideas explicitly or configure a model.',
      );
      assert(
        p.local || $('remote-confirm').checked,
        'Review and confirm the displayed remote destination and context.',
      );
    }
    const id = crypto.randomUUID();
    currentRequest = id;
    controls();
    state('Understanding your idea · planning permitted changes…');
    const v = await request(path, {
      ...data,
      provider: $('provider').value,
      request_id: id,
      allow_remote: $('remote-confirm').checked,
    });
    if (disposed || currentRequest !== id) {
      if (v.draft_id)
        await request(
          v.draft_id + '/cancel',
          { proposal_hash: v.proposal_hash },
          'POST',
          true,
        ).catch(() => {});
      throw new Error('Planning cancelled.');
    }
    assert(
      (await hashValue(v.proposal)) === v.proposal_hash,
      'Proposal integrity check failed',
    );
    return v;
  }
  function display() {
    $('proposal-title').textContent =
      draft.candidate.package.manifest.experience.presentation.title;
    $('proposal-provider').textContent = draft.provider?.real_inference
      ? `${draft.provider.served_model} · model generated`
      : 'Offline creative ideas · deterministic';
    $('change-list').replaceChildren(
      ...draft.proposal.modifications
        .filter((m) =>
          [
            'lighting',
            'visual',
            'atmosphere',
            'audio_parameters',
            'waypoint',
          ].includes(m.operation),
        )
        .map((m) => {
          const li = document.createElement('li');
          li.textContent = describe(m);
          return li;
        }),
    );
    $('ordered-plan').replaceChildren(
      ...(draft.proposal.steps || []).map((step) => {
        const p = document.createElement('p');
        p.textContent =
          step.id +
          ' · ' +
          step.operation +
          ' · ' +
          step.required_permission +
          ' · reversible';
        return p;
      }),
    );
    $('affected-resources').textContent = draft.affected_resources.join(' · ');
    $('creator-limits').textContent =
      'Original city forms and attribution stay fixed. Materials, seasonal effects and points of interest are authored. World commands, live weather and new recordings are unavailable.';
    $('proposal-hash').textContent = draft.proposal_hash;
  }
  async function preview() {
    const start = performance.now();
    draft = await action('preview');
    comparison = false;
    await host.apply(draft.candidate);
    timing.preview_activation = performance.now() - start;
    $('compare-draft').textContent = 'Compare original';
    display();
    events.push('preview');
    state(
      'Ready for review · preview only. Approve this exact plan to keep it.',
    );
  }
  const on = (id, event, fn) =>
    $(id).addEventListener(event, fn, { signal: controller.signal });
  for (const [id, prompt] of Object.entries({
    'winter-idea':
      'Make this district feel like a magical winter evening with warm architectural highlights, gentle snow and a quiet original score.',
    'quiet-idea':
      'Create a quiet, warm, historical-inspired walking experience with softer music and gentle haze.',
    'daylight-idea':
      'Create a cinematic sunrise with warm architectural highlights and no snow.',
  }))
    on(id, 'click', () => {
      $('intention').value = prompt;
      $('intention').focus();
    });
  on(
    'check-provider',
    'click',
    () =>
      void run(async () => {
        await inspect(true);
        state('Model availability checked. No creative inference was sent.');
      }),
  );
  on('provider', 'change', () => {
    if ($('provider').value === 'model') void run(() => inspect());
    else
      state('Offline creative ideas selected. No model request will be sent.');
  });
  on(
    'generate',
    'click',
    () =>
      void run(async () => {
        const start = performance.now();
        const next = await planning('generate', {
          base: host.base(),
          intention: $('intention').value,
        });
        if (draft) await action('cancel');
        await host.apply(null);
        draft = next;
        timing.proposal_generation = performance.now() - start;
        events.push('generated_validated');
        display();
        state('Plan validated · preview your new atmosphere.');
      }),
  );
  on('preview-draft', 'click', () => void run(preview));
  on(
    'refine-draft',
    'click',
    () =>
      void run(async () => {
        assert(draft, 'Create a plan first');
        const start = performance.now();
        draft = await planning(draft.draft_id + '/refine', {
          proposal_hash: draft.proposal_hash,
          intention: $('refinement').value,
        });
        timing.refinement = performance.now() - start;
        events.push('refined_hash_changed_approval_cleared');
        await preview();
        state('Refined preview ready · previous approval cleared.');
      }),
  );
  on(
    'cancel-generation',
    'click',
    () =>
      void (async () => {
        const id = currentRequest;
        currentRequest = null;
        if (id)
          await request('cancel-request', { request_id: id }).catch(() => {});
        state('Planning cancelled. No model fallback was substituted.');
        controls();
      })(),
  );
  for (const name of ['undo', 'restore'])
    on(
      name + '-draft',
      'click',
      () =>
        void run(async () => {
          draft = await action(
            name,
            name === 'restore'
              ? { version_hash: draft.draft_revisions.at(-1).proposal_hash }
              : {},
          );
          events.push(name + '_approval_cleared');
          await preview();
        }),
    );
  on(
    'compare-draft',
    'click',
    () =>
      void run(async () => {
        comparison = !comparison;
        await host.apply(comparison ? null : draft.candidate);
        $('compare-draft').textContent = comparison
          ? 'Back to my preview'
          : 'Compare original';
        events.push(comparison ? 'before' : 'after');
        state(
          comparison
            ? 'Original edition. Your draft is waiting.'
            : 'Your authored preview.',
        );
      }),
  );
  on(
    'approve-draft',
    'click',
    () =>
      void run(async () => {
        draft = await action('approve');
        events.push('approved_exact_hash');
        state('Approved · save this exact version when you’re ready.');
      }),
  );
  on(
    'save-draft',
    'click',
    () =>
      void run(async () => {
        const start = performance.now();
        draft = await action('save');
        timing.save = performance.now() - start;
        events.push('saved_private');
        state(
          'Saved privately with its refinement journal. Publish & share makes this edition available on this local service.',
        );
      }),
  );
  on(
    'publish-draft',
    'click',
    () =>
      void run(async () => {
        const start = performance.now();
        const v = await action('publish', {
          version_hash: draft.saved_version,
          confirm_public: true,
        });
        timing.publication = performance.now() - start;
        events.push('published');
        await host.share(v.path);
        state('Published · a new world to share.');
      }),
  );
  on(
    'reject-draft',
    'click',
    () =>
      void run(async () => {
        await action('reject');
        draft = null;
        await host.apply(null);
        events.push('reject');
        state('Draft rejected. Original edition restored.');
      }),
  );
  on(
    'revert-draft',
    'click',
    () =>
      void run(async () => {
        draft = await action('revert', {
          version_hash: draft.original_version,
        });
        await host.apply(null);
        events.push('reverted_original_version');
        state('Original version restored. Saved editions remain immutable.');
      }),
  );
  controls();
  return {
    snapshot,
    async dispose() {
      if (disposed) return;
      disposed = true;
      const job = currentRequest;
      currentRequest = null;
      if (job)
        await request(
          'cancel-request',
          { request_id: job },
          'POST',
          true,
        ).catch(() => {});
      if (draft) {
        const d = draft;
        draft = null;
        await request(
          d.draft_id + '/cancel',
          { proposal_hash: d.proposal_hash },
          'POST',
          true,
        ).catch(() => {});
        events.push('cancel_on_close');
      }
      controller.abort();
      token = '';
      $('creator-token').value = '';
      await host.apply(null);
      controls();
    },
  };
}
function describe(m) {
  switch (m.operation) {
    case 'lighting':
      return 'Light · ' + m.preset.replaceAll('_', ' ');
    case 'visual':
      return (
        m.treatment.palette.replaceAll('_', ' ') +
        ' · warm materials and emissive windows'
      );
    case 'atmosphere':
      return m.effect
        ? 'Authored ' + m.effect + ' · simulated'
        : 'Clear atmosphere';
    case 'audio_parameters':
      return (
        m.layer +
        ' · ' +
        Math.round(m.gain_milli / 10) +
        '% · press Play to listen'
      );
    case 'waypoint':
      return 'Explore · ' + m.point.label;
    default:
      return m.operation.replaceAll('_', ' ');
  }
}
