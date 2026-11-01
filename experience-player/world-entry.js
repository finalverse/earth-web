import { assert, readBounded, canonical } from './protocol.mjs';
import { validateRuntimeEntry } from './runtime-protocol.mjs';
export function mountWorldEntry(host) {
  const $ = (id) => document.getElementById(id);
  const panel = $('persistent-world');
  const publication = host.publication(),
    generated = publication.content.generated;
  if (!generated) {
    panel.hidden = true;
    return { dispose: async () => {}, snapshot: () => ({ active: false }) };
  }
  const reference = {
    experience: publication.content.experience,
    version: publication.version,
  };
  const life = new AbortController();
  let token = '',
    timer,
    disposed = false,
    epoch = 0,
    joining,
    projection,
    connected = false,
    proposal,
    polls = 0;
  const status = (text) => {
    if (!disposed) $('persistent-status').textContent = text;
  };
  async function api(action, body = {}, identity = false, auth = token) {
    const headers = {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: 'Bearer ' + auth } : {}),
    };
    if (identity && host.credential())
      headers['X-Finalverse-Creator-Session'] = host.credential();
    const response = await fetch('/api/v1/living/' + action, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(action === 'lumi-ai' ? 100000 : 10000),
    });
    const result = JSON.parse(
      new TextDecoder().decode(await readBounded(response, 1048576)),
    );
    if (!response.ok)
      throw Error(result.message || 'World operation unavailable');
    return result;
  }
  function controls() {
    $('persistent-join').hidden = !!token || !!joining;
    $('persistent-disconnect').hidden = !token || !connected;
    $('persistent-reconnect').hidden = !token || connected;
    $('persistent-leave').hidden = !token;
    for (const id of ['object', 'guide', 'ai'])
      $('persistent-' + id).disabled = !token || !connected;
    $('persistent-review').hidden = !proposal;
    $('persistent-signin').hidden = !proposal || !!host.credential();
    $('persistent-approve').disabled = !(
      proposal &&
      connected &&
      host.credential() &&
      $('persistent-consent').checked
    );
  }
  async function run(f) {
    try {
      await f();
    } catch (e) {
      if (!disposed && e.name !== 'AbortError') status(e.message);
    } finally {
      if (!disposed) controls();
    }
  }
  function on(id, f) {
    $(id).disabled = false;
    $(id).addEventListener('click', () => void run(f), { signal: life.signal });
  }
  for (const o of generated.objects.filter((o) => o.interactive)) {
    const option = document.createElement('option');
    option.value = o.id;
    option.textContent = o.node;
    $('persistent-object').append(option);
  }
  function forgetProposal() {
    proposal = null;
    $('persistent-approve').disabled = true;
    $('persistent-proposal').textContent = '';
    $('persistent-consent').checked = false;
    controls();
  }
  $('persistent-object').addEventListener('change', forgetProposal, {
    signal: life.signal,
  });
  async function leave() {
    epoch++;
    clearTimeout(timer);
    timer = undefined;
    const old = token;
    token = '';
    connected = false;
    projection = null;
    forgetProposal();
    host.applyObjects(null);
    if (old) await api('leave', {}, false, old);
    status('You left the world. Your shared changes are saved.');
    host.diagnostics();
  }
  async function poll(current) {
    if (disposed || !token || current !== epoch) return;
    try {
      const view = await api('snapshot');
      if (disposed || !token || current !== epoch) return;
      assert(
        view.definition === reference.version,
        'World edition substitution refused',
      );
      const objects = view.objects;
      assert(
        Array.isArray(objects) &&
          objects.length === generated.objects.length &&
          objects.every(
            (o) =>
              generated.objects.some((x) => x.id === o.object_id) &&
              Number.isSafeInteger(o.revision) &&
              Array.isArray(o.translation_mm) &&
              o.translation_mm.length === 3 &&
              o.translation_mm.every(
                (v) => Number.isSafeInteger(v) && Math.abs(v) <= 2000000,
              ),
          ),
        'Invalid authoritative object projection',
      );
      projection = view;
      connected = true;
      controls();
      polls++;
      if (host.applyObjects(objects) === false) {
        await leave();
        status('Your private remix stays separate from the shared world.');
        return;
      }
      $('persistent-participants').textContent =
        view.participants.length + ' participants · changes saved by the world';
      host.diagnostics();
      timer = setTimeout(() => void poll(current), 300);
    } catch (e) {
      if (current === epoch) {
        connected = false;
        controls();
        status('Connection interrupted. Reconnect to restore the saved world.');
      }
    }
  }
  on('persistent-join', async () => {
    assert(!token && !joining, 'Already joining or connected');
    const current = ++epoch;
    status('Entering the same published world…');
    joining = (async () => {
      const response = await fetch(
        '/api/v1/network/editions/' +
          reference.experience +
          '/' +
          reference.version +
          '/entry',
        { signal: life.signal },
      );
      assert(response.ok, 'Entry unavailable');
      await validateRuntimeEntry(
        JSON.parse(
          new TextDecoder().decode(await readBounded(response, 1048576)),
        ),
        reference,
      );
      const joined = await api('open', { reference }, false, '');
      if (disposed || current !== epoch) {
        await api('leave', {}, false, joined.token);
        return;
      }
      token = joined.token;
      connected = true;
      controls();
      status('Together in one persistent world.');
      await poll(current);
    })();
    try {
      await joining;
    } finally {
      joining = null;
      controls();
    }
  });
  on('persistent-leave', leave);
  on('persistent-disconnect', async () => {
    assert(token, 'Join first');
    epoch++;
    clearTimeout(timer);
    timer = undefined;
    await api('disconnect');
    connected = false;
    forgetProposal();
    status('Disconnected · your shared changes remain saved');
  });
  on('persistent-reconnect', async () => {
    assert(token, 'Join first');
    const current = ++epoch;
    await api('reconnect');
    if (!disposed && current === epoch) {
      status('Reconnected to the same world.');
      await poll(current);
    }
  });
  on('persistent-guide', async () => {
    assert(token, 'Join first');
    const current = epoch;
    const selected = $('persistent-object').value;
    const result = await api('lumi', { interaction: 'object', selected });
    if (
      disposed ||
      current !== epoch ||
      selected !== $('persistent-object').value
    )
      return;
    $('persistent-lumi').textContent = result.response;
    const p = result.proposal;
    assert(
      p &&
        p.schema_version === 'finalverse.world-object-proposal/v1' &&
        canonical(p.reference) === canonical(reference) &&
        p.object_id === selected &&
        p.raised === true &&
        p.applied === false &&
        Number.isSafeInteger(p.expected_revision),
      'Unsupported proposal',
    );
    proposal = p;
    $('persistent-consent').checked = false;
    $('persistent-proposal').textContent =
      'Raise ' +
      generated.objects.find((o) => o.id === selected).node +
      ' one metre. The published asset stays unchanged; this move is shared and persistent.';
    controls();
  });
  on('persistent-ai', async () => {
    assert(token, 'Join first');
    const current = epoch;
    status('Lumi is thinking with the configured local model…');
    const r = await api('lumi-ai', { selected: $('persistent-object').value });
    if (!disposed && current === epoch) {
      assert(
        r.real_inference === true && r.applied === false,
        'No unverified model result',
      );
      $('persistent-lumi').textContent =
        r.response + ' · Local model idea; no change applied.';
      status('AI suggestion ready. Shared changes still require your review.');
    }
  });
  on('persistent-approve', async () => {
    assert(token && proposal, 'Review a proposal first');
    assert($('persistent-consent').checked, 'Explicit approval required');
    const current = epoch;
    const p = proposal;
    forgetProposal();
    $('persistent-consent').checked = false;
    const r = await api(
      'move-object',
      {
        selected: p.object_id,
        raised: p.raised,
        approve: true,
        expected_revision: p.expected_revision,
      },
      true,
    );
    if (disposed || current !== epoch) return;
    status(
      r.receipt?.outcome?.status === 'applied'
        ? 'Your approved move is saved for everyone.'
        : 'The object changed or permission was refused. Review a fresh proposal.',
    );
  });
  $('persistent-consent').addEventListener('change', controls, {
    signal: life.signal,
  });
  on('persistent-signin', async () => {
    const key = $('network-key');
    key.closest('details').open = true;
    key.focus();
  });
  controls();
  return {
    snapshot: () => ({
      active: !!token,
      connected,
      objects: projection?.objects || [],
      pending: !!joining,
      interval: timer !== undefined,
      participants: projection?.participants?.length || 0,
      revision: projection?.revision || null,
      polls,
      source: 'MutSea replica',
      proposal_pending: !!proposal,
    }),
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      life.abort();
      epoch++;
      clearTimeout(timer);
      timer = undefined;
      await joining?.catch(() => {});
      await leave().catch(() => {});
      for (const id of [
        'join',
        'leave',
        'disconnect',
        'reconnect',
        'guide',
        'ai',
        'approve',
      ])
        $('persistent-' + id).disabled = true;
    },
  };
}
