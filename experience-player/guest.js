import { assert, readBounded, MAX_DOCUMENT, hashValue } from '/protocol.mjs';
import {
  deviceProfile,
  defaultSelection,
  validateDraft,
  QUICK_ACTIONS,
} from '/smart-protocol.mjs';
const $ = (id) => document.getElementById(id);
export function mountGuest(host) {
  let selectedPin = host.templatePin(),
    token = '',
    sessionPromise,
    draft,
    selected = host.edition?.content.template || null,
    epoch = 0,
    generation = 0,
    pending,
    busy = false,
    disposed = false,
    modelStatus;
  const lifetime = new AbortController(),
    operations = [],
    events = [];
  const on = (id, event, fn) =>
    $(id).addEventListener(event, fn, { signal: lifetime.signal });
  const profile = () =>
    deviceProfile({
      width: innerWidth,
      reducedMotion:
        matchMedia('(prefers-reduced-motion: reduce)').matches ||
        $('still-views').checked,
      webgl: !!window.WebGLRenderingContext,
      audio: !!(window.AudioContext || window.webkitAudioContext),
    });
  const status = (text) => {
    $('guest-status').textContent = text;
    host.diagnostics();
  };
  const snapshot = () => ({
    selected_template: selected?.id || null,
    template_pin: selectedPin || null,
    draft_active: !!draft,
    session_active: !!token,
    proposal_hash: draft?.proposal_hash || null,
    saved_version: draft?.saved_version || null,
    pending: !!pending,
    provider: draft?.provider || null,
    operations: [...operations],
    events: [...events],
    credentials_scope:
      'temporary guest token in this document memory only; no cookies or localStorage',
    retention: '30-minute draft; share at most one hour or service restart',
  });
  async function api(
    path,
    data,
    { auth = true, signal = lifetime.signal, keepalive = false } = {},
  ) {
    const r = await fetch(path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth && token ? { Authorization: 'Guest ' + token } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      credentials: 'omit',
      cache: 'no-store',
      ...(keepalive ? { keepalive: true } : { signal }),
    });
    const v = JSON.parse(
      new TextDecoder().decode(
        await readBounded({ ok: true, body: r.body }, MAX_DOCUMENT),
      ),
    );
    assert(
      r.ok && !v.code,
      (v.code ? v.code.replaceAll('_', ' ') + ': ' : '') +
        (v.message || 'This personal change could not be completed.'),
    );
    return v;
  }
  async function session() {
    if (token) return;
    sessionPromise ??= api('/api/v1/guest/session', {}, { auth: false }).then(
      (s) => {
        if (disposed) {
          void fetch('/api/v1/guest/close', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Guest ' + s.token,
            },
            body: '{}',
            credentials: 'omit',
            keepalive: true,
          });
          return;
        }
        token = s.token;
        events.push('temporary_guest_started');
      },
    );
    await sessionPromise;
    assert(token && !disposed, 'Personal session closed');
  }
  function controls() {
    $('make-mine').disabled = disposed || !selected;
    $('guest-save').disabled =
      disposed || busy || !draft || !!draft?.saved_version;
    $('guest-share').disabled = disposed || busy || !draft;
    $('guest-share-submit').disabled =
      disposed || busy || !$('guest-confirm').checked;
    $('guest-ai').disabled =
      disposed || busy || !draft || !modelStatus?.available;
    $('guest-cancel').hidden = !pending;
    for (const b of $('quick-actions').querySelectorAll('button'))
      b.disabled = disposed || busy || !draft;
    for (const b of $('templates').querySelectorAll('button')) {
      b.disabled = disposed || b.dataset.compatible !== 'true';
      b.setAttribute(
        'aria-pressed',
        String(b.dataset.template === selected?.id),
      );
    }
  }
  async function run(name, fn, { supersede = false } = {}) {
    if (disposed || (busy && !supersede)) return;
    if (supersede) pending?.abort();
    const ticket = ++generation,
      controller = new AbortController(),
      start = performance.now();
    pending = controller;
    busy = true;
    controls();
    host.diagnostics();
    try {
      await fn(controller.signal);
      if (ticket === generation && !disposed) {
        operations.push({
          operation: name,
          duration_ms: performance.now() - start,
          status: 'complete',
        });
        if (operations.length > 120) operations.shift();
      }
    } catch (e) {
      operations.push({
        operation: name,
        duration_ms: performance.now() - start,
        status: e.name === 'AbortError' ? 'cancelled' : 'failed',
        reason: e.name === 'AbortError' ? 'superseded' : e.message,
      });
      if (ticket === generation && !disposed && e.name !== 'AbortError')
        status(e.message + ' No unsupported changes were applied.');
    } finally {
      if (ticket === generation) {
        pending = null;
        busy = false;
        controls();
        host.diagnostics();
      }
    }
  }
  async function accept(value, { frame = false } = {}) {
    draft = await validateDraft(value, host.spatial());
    selected = draft.template;
    selectedPin = {
      id: selected.id,
      version: selected.version,
      digest: await hashValue(selected),
    };
    await host.apply(
      draft.candidate,
      {
        ...draft.composition,
        template_id: selected.id,
        quality: draft.context.device.quality,
        reduced_motion: draft.context.device.reduced_motion,
      },
      frame,
    );
    $('moment-name').textContent =
      draft.candidate.package.manifest.experience.presentation.title;
    $('moment-note').textContent = draft.composition.audio_description;
    $('guest-saved').textContent = draft.saved_version
      ? 'Personal version saved temporarily.'
      : 'Your preview stays personal until you choose to share.';
    $('make-mine').textContent = 'Make It Mine';
    status(
      'Ready to explore · ' +
        (draft.adaptations.join(' · ') ||
          'Source geometry preserved. Effects are authored.'),
    );
    controls();
  }
  async function choose(t, inherit = false) {
    await run(
      'template_activation',
      async (signal) => {
        status('Preparing your experience…');
        await session();
        const ticket = generation;
        const v = await api(
          '/api/v1/guest/apply',
          {
            base: host.source(),
            template: t.pin || {
              id: t.id,
              version: t.version,
              digest: t.digest,
            },
            device: profile(),
            selection: defaultSelection(),
            epoch: ++epoch,
            inherit,
          },
          { signal },
        );
        if (ticket !== generation || disposed) return;
        await accept(v, { frame: true });
        events.push(inherit ? 'make_your_own' : 'template_selected');
      },
      { supersede: true },
    );
  }
  const openMine = () => {
    const start = performance.now();
    $('personalize').hidden = !$('personalize').hidden;
    if (!$('personalize').hidden) {
      $('personalize').scrollIntoView({
        block: 'nearest',
        behavior: profile().reduced_motion ? 'instant' : 'smooth',
      });
      $('quick-actions').querySelector('button')?.focus();
    }
    operations.push({
      operation: 'open_personalization',
      duration_ms: performance.now() - start,
      status: 'complete',
    });
    host.diagnostics();
  };
  on('make-mine', 'click', () => {
    if (!draft && host.edition) {
      const t = selected;
      void choose(
        { id: t.id, version: t.version, digest: null, pin: host.templatePin() },
        true,
      ).then(() => {
        if (draft) openMine();
      });
    } else openMine();
  });
  on('guest-explore', 'click', () => {
    host.explore();
    events.push('explore');
    host.diagnostics();
  });
  for (const [operation, label] of Object.entries(QUICK_ACTIONS)) {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.quick = operation;
    b.addEventListener(
      'click',
      () =>
        void run('personalization', async (signal) => {
          const ticket = generation,
            v = await api(
              '/api/v1/guest/quick',
              { proposal_hash: draft.proposal_hash, operation, epoch: ++epoch },
              { signal },
            );
          if (ticket !== generation || disposed) return;
          await accept(v);
          events.push(operation);
        }),
      { signal: lifetime.signal },
    );
    $('quick-actions').append(b);
  }
  on(
    'guest-save',
    'click',
    () =>
      void run('save_personal_version', async (signal) => {
        const v = await api(
          '/api/v1/guest/save',
          { proposal_hash: draft.proposal_hash, approve: true, epoch: ++epoch },
          { signal },
        );
        draft = v;
        $('guest-saved').textContent =
          'Personal version saved temporarily. Ready to share.';
        events.push('approved_exact_preview_and_saved');
        status('Saved for this guest session · no public link created.');
      }),
  );
  function requestShare() {
    assert(draft, 'Choose an experience before sharing your own edition.');
    $('guest-share-review').hidden = false;
    $('guest-confirm').checked = false;
    controls();
    $('guest-confirm').focus();
  }
  on('guest-share', 'click', () => requestShare());
  on('guest-share-close', 'click', () => {
    $('guest-share-review').hidden = true;
  });
  on('guest-confirm', 'change', controls);
  on(
    'guest-share-submit',
    'click',
    () =>
      void run('guest_share_creation', async (signal) => {
        assert(
          $('guest-confirm').checked,
          'Approve this preview and temporary sharing first.',
        );
        if (!draft.saved_version)
          draft = await api(
            '/api/v1/guest/save',
            {
              proposal_hash: draft.proposal_hash,
              approve: true,
              epoch: ++epoch,
            },
            { signal },
          );
        const v = await api(
          '/api/v1/guest/share',
          {
            proposal_hash: draft.proposal_hash,
            confirm_public: true,
            epoch: ++epoch,
          },
          { signal },
        );
        $('guest-share-review').hidden = true;
        await host.share(v.path);
        $('share-status').textContent = v.retention;
        events.push('temporary_share_created');
        status(
          'Your temporary link is ready. Attribution travels with your experience.',
        );
      }),
  );
  on(
    'guest-ai',
    'click',
    () =>
      void run('model_personalization', async (signal) => {
        assert(
          $('guest-ai-consent').checked,
          'Confirm local AI context transmission first.',
        );
        status('Local AI is personalizing this template…');
        const ticket = generation;
        const v = await api(
          '/api/v1/guest-ai',
          {
            proposal_hash: draft.proposal_hash,
            intention: $('guest-intention').value,
            epoch: ++epoch,
          },
          { signal },
        );
        if (ticket !== generation || disposed) return;
        await accept(v);
        events.push('actual_model_personalization');
        status(
          'AI changes are previewed. Review, save and explicitly share when ready.',
        );
      }),
  );
  on('guest-cancel', 'click', () => {
    const old = pending;
    ++generation;
    pending = null;
    busy = false;
    old?.abort();
    if (token)
      void api('/api/v1/guest/cancel', { epoch: ++epoch }).catch(() => {});
    draft = null;
    selected = null;
    selectedPin = null;
    void host.applySource();
    events.push('cancelled');
    controls();
    status('Personal planning cancelled. Choose a template to begin again.');
  });
  on('guest-share-review', 'keydown', (e) => {
    if (e.key === 'Escape') {
      $('guest-share-review').hidden = true;
      $('guest-share').focus();
    }
    if (e.key === 'Tab') {
      const list = [
        $('guest-confirm'),
        ...(!$('guest-share-submit').disabled ? [$('guest-share-submit')] : []),
        $('guest-share-close'),
      ];
      if (e.shiftKey && document.activeElement === list[0]) {
        e.preventDefault();
        list.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
        e.preventDefault();
        list[0].focus();
      }
    }
  });
  on('guest-intention', 'input', () => host.stopGuide());
  async function discover() {
    const v = await api(
      '/api/v1/see/discover',
      {
        base: host.source(),
        device: profile(),
        selection: defaultSelection(),
        interests: [],
      },
      { auth: false },
    );
    if (disposed) return;
    $('templates').replaceChildren();
    for (const item of v.templates) {
      const t = item.template,
        card = document.createElement('article');
      card.className = 'smart-card ' + t.preview_style;
      const poster = document.createElement('div');
      poster.className = 'template-art';
      poster.setAttribute('aria-hidden', 'true');
      poster.innerHTML =
        '<span></span><span></span><span></span><span></span><span></span><span></span>';
      const name = document.createElement('h3');
      name.textContent = t.title;
      const description = document.createElement('p');
      description.textContent = t.description;
      const button = document.createElement('button');
      button.textContent = 'Experience Now ↗';
      button.dataset.template = t.id;
      button.dataset.compatible = String(item.compatible);
      button.title = item.reasons.join(' · ');
      button.addEventListener('click', () => void choose(item), {
        signal: lifetime.signal,
      });
      card.append(poster, name, description, button);
      $('templates').append(card);
    }
    $('recommendation-note').textContent =
      'Recommended for this urban environment · approved resources · no model needed';
    if (selected) {
      $('moment-name').textContent = selected.title;
      $('moment-note').textContent =
        host.edition.content.composition.audio_description;
      $('make-mine').textContent = 'Make Your Own';
    }
    status(
      host.edition
        ? 'A shared moment. Explore, then Make Your Own.'
        : 'Choose a moment. No prompt, account or AI setup needed.',
    );
    controls();
  }
  void discover().catch((e) => status(e.message));
  void api('/api/v1/see/status', undefined, { auth: false })
    .then((v) => {
      if (disposed) return;
      modelStatus = v;
      $('guest-model-status').textContent = v.available
        ? `${v.model} · local AI · ${v.destination}. Context: ${v.context}. ${v.limit}.`
        : v.reason;
      $('guest-ai-consent-label').hidden = !v.available;
      controls();
    })
    .catch(() => {
      if (!disposed)
        $('guest-model-status').textContent =
          'Local AI unavailable. Instant controls remain available.';
    });
  return {
    snapshot,
    requestShare,
    hasDraft: () => !!draft,
    dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      pending?.abort();
      pending = null;
      busy = false;
      lifetime.abort();
      if (token)
        void api('/api/v1/guest/close', {}, { keepalive: true }).catch(
          () => {},
        );
      token = '';
      draft = null;
      controls();
    },
  };
}
