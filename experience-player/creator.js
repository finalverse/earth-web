import { assert, hashValue, readBounded, MAX_DOCUMENT } from '/protocol.mjs';
const $ = (id) => document.getElementById(id);
export function mountCreator(host) {
  let draft,
    token = '',
    busy = false,
    comparison = false,
    disposed = false,
    generation = 0;
  const timing = {},
    events = [],
    controller = new AbortController();
  const snapshot = () => ({
    state: draft?.state || 'idle',
    proposal_hash: draft?.proposal_hash || null,
    draft_active: Boolean(draft),
    saved_version: draft?.saved_version || null,
    timing_ms: { ...timing },
    events: [...events],
  });
  const state = (text) => {
    $('creator-status').textContent = text;
    host.diagnostics();
  };
  async function post(path, data, keepalive = false) {
    const response = await fetch('/api/v1/creator/' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(data),
      credentials: 'omit',
      cache: 'no-store',
      ...(keepalive ? { keepalive: true } : { signal: controller.signal }),
    });
    const value = JSON.parse(
      new TextDecoder().decode(
        await readBounded(response, MAX_DOCUMENT).catch(async (e) => {
          if (!response.ok)
            throw new Error(
              'Creation was refused. Check local access and the proposal.',
            );
          throw e;
        }),
      ),
    );
    assert(!value.code, value.message || 'Creation refused');
    return value;
  }
  function controls() {
    const saved = Boolean(draft?.saved_version),
      active = Boolean(draft);
    for (const id of [
      'generate',
      'provider',
      'intention',
      'winter-idea',
      'quiet-idea',
      'daylight-idea',
    ])
      $(id).disabled = busy || disposed;
    $('proposal-panel').hidden = !active;
    $('preview-draft').hidden = saved || draft?.state === 'approved';
    $('approve-draft').hidden = draft?.state !== 'preview';
    $('save-draft').hidden = draft?.state !== 'approved';
    $('publish-draft').hidden = !saved;
    $('compare-draft').hidden = draft?.state === 'ready';
    $('preview-draft').disabled = busy || !active || saved;
    $('approve-draft').disabled =
      busy || draft?.state !== 'preview' || comparison;
    $('save-draft').disabled = busy || draft?.state !== 'approved';
    $('publish-draft').disabled = busy || !saved || draft?.state === 'reverted';
    $('compare-draft').disabled = busy || !active;
    $('reject-draft').disabled = busy || !active;
    $('revert-draft').hidden = !saved;
    $('revert-draft').disabled = busy || draft?.state === 'reverted';
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
      busy = false;
      controls();
      host.diagnostics();
    }
  }
  async function action(name, extra = {}) {
    assert(draft, 'Generate a proposal first');
    return post(draft.draft_id + '/' + name, {
      proposal_hash: draft.proposal_hash,
      ...extra,
    });
  }
  async function closeDraft(name = 'cancel') {
    if (draft) {
      await action(name);
      events.push(name);
    }
    draft = null;
    comparison = false;
    await host.apply(null);
    controls();
  }
  const on = (id, event, fn) =>
    $(id).addEventListener(event, fn, { signal: controller.signal });
  const ideas = {
    'winter-idea':
      'Turn this neighborhood into a beautiful winter festival with warm street lighting, falling snow and atmospheric music.',
    'quiet-idea':
      'Make a quiet, warm evening with softer music and gentle lighting.',
    'daylight-idea': 'Show this neighborhood in daylight with quiet music.',
  };
  for (const [id, prompt] of Object.entries(ideas))
    on(id, 'click', () => {
      $('intention').value = prompt;
      $('intention').focus();
    });
  on(
    'generate',
    'click',
    () =>
      void run(async () => {
        token = $('creator-token').value.trim();
        assert(
          token.length >= 32,
          'Open Local creator access and enter your publisher credential. It stays in this tab.',
        );
        if (draft) await closeDraft();
        const start = performance.now(),
          current = ++generation;
        state('Turning your idea into a validated plan…');
        const next = await post('generate', {
          base: host.base(),
          intention: $('intention').value,
          provider: $('provider').value,
        });
        if (disposed || current !== generation) return;
        assert(
          (await hashValue(next.proposal)) === next.proposal_hash,
          'Proposal integrity check failed',
        );
        draft = next;
        timing.proposal_generation = performance.now() - start;
        events.push('generated_validated');
        $('proposal-title').textContent =
          next.candidate.package.manifest.experience.presentation.title;
        $('change-list').replaceChildren(
          ...next.proposal.modifications
            .filter(
              (m) =>
                !['title', 'description', 'exposure'].includes(m.operation),
            )
            .map((m) => {
              const li = document.createElement('li');
              li.textContent = describe(m);
              return li;
            }),
        );
        $('affected-resources').textContent =
          next.affected_resources.join(' · ');
        $('creator-limits').textContent =
          'Authored snow and light markers. City geometry stays fixed. Outdoor stage assets, live weather and world commands are unavailable.';
        $('proposal-hash').textContent = next.proposal_hash;
        state('Your plan is ready. Preview it before you approve.');
      }),
  );
  on(
    'preview-draft',
    'click',
    () =>
      void run(async () => {
        const start = performance.now();
        draft = await action('preview');
        comparison = false;
        await host.apply(draft.candidate);
        timing.preview_activation = performance.now() - start;
        events.push('preview');
        $('compare-draft').textContent = 'Compare original';
        state('Preview only · your published experience is unchanged.');
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
        state(
          comparison
            ? 'Original edition · your draft is waiting.'
            : 'Your authored preview.',
        );
        events.push(comparison ? 'before' : 'after');
      }),
  );
  on(
    'approve-draft',
    'click',
    () =>
      void run(async () => {
        draft = await action('approve');
        events.push('approved_exact_hash');
        state('Approved. Save this exact version when you’re ready.');
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
          'Saved privately. Publish & share makes this version available to visitors of this local service.',
        );
      }),
  );
  on(
    'publish-draft',
    'click',
    () =>
      void run(async () => {
        const start = performance.now();
        const result = await action('publish', {
          version_hash: draft.saved_version,
          confirm_public: true,
        });
        timing.publication = performance.now() - start;
        events.push('published');
        state('Your experience is ready to share.');
        await host.share(result.path);
      }),
  );
  on(
    'reject-draft',
    'click',
    () =>
      void run(async () => {
        await closeDraft('reject');
        state('Draft rejected. Back to the original experience.');
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
        state(
          'Restored the original version. Saved and published editions keep their history.',
        );
      }),
  );
  on('provider', 'change', () =>
    state(
      $('provider').value === 'configured'
        ? 'Configured model: your prompt and approved plan context are sent to the host-selected endpoint.'
        : 'Offline ideas use deterministic templates. No model request is sent.',
    ),
  );
  controls();
  return {
    snapshot,
    async dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      if (draft) {
        const old = draft;
        draft = null;
        try {
          await post(
            old.draft_id + '/cancel',
            { proposal_hash: old.proposal_hash },
            true,
          );
          events.push('cancel_on_close');
        } catch {}
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
      return 'Lighting · ' + m.preset.replaceAll('_', ' ');
    case 'atmosphere':
      return m.effect === 'snow'
        ? 'Gently falling snow · simulated'
        : 'Clear atmosphere';
    case 'exposure':
      return 'Balanced authored exposure';
    case 'title':
      return 'Your title · ' + m.text;
    case 'description':
      return 'A description with your creative intention';
    case 'audio_parameters':
      return 'Approved ambient mix · ' + Math.round(m.gain_milli / 10) + '%';
    case 'add_audio':
      return 'Add approved chime ambience · press Play to listen';
    case 'replace_audio':
      return 'Replace layer with approved audio';
    case 'place':
      return 'Place an authored warm light marker';
    default:
      return 'Approved ' + m.operation.replaceAll('_', ' ');
  }
}
