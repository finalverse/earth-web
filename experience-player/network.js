// Creator identity remains in this document. Public navigation never carries it.
const $ = (id) => document.getElementById(id);
export function mountNetwork(host) {
  const life = new AbortController();
  let token = '',
    creator = null,
    urls = new Set();
  const revokeTimers = new Set();
  const publication = host.publication();
  const id = publication.content.experience,
    v = publication.version;
  const base = '/api/v1/network/editions/' + id + '/' + v;
  const status = (s) => {
    $('network-status').textContent = s;
  };
  const api = async (path, body) => {
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: life.signal,
    });
    const value = await r.json();
    if (!r.ok) throw Error(value.message || 'Network operation refused');
    return value;
  };
  const run = async (f) => {
    try {
      await f();
    } catch (e) {
      if (e.name !== 'AbortError') status(e.message);
    }
  };
  const on = (id, f) =>
    $(id).addEventListener('click', () => void run(f), { signal: life.signal });
  $('network-lineage').href = '/lineage/' + id + '/' + v;
  $('network-embed').href = '/embed-demo/' + id + '/' + v;
  api(base)
    .then((meta) => {
      $('network-creator').textContent = 'By ' + meta.owner;
      $('network-creator').href = '/creators/' + meta.owner;
      $('network-provenance').textContent =
        publication.content.creator.attribution;
      for (const d of meta.destinations) {
        const a = document.createElement('a');
        a.href = '/p/' + d.id;
        a.textContent =
          d.destination.kind === 'earth'
            ? 'Open on Earth ↗'
            : d.destination.kind === 'mutsea'
              ? 'Open world placement ↗'
              : 'Standalone scene ↗';
        $('network-destinations').append(a);
      }
      status('Immutable edition · permanent link · attribution preserved');
    })
    .catch((e) => status(e.message));
  on('network-login', async () => {
    const key = $('network-key').value.trim();
    $('network-key').value = '';
    const r = await fetch('/api/v1/network/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: '{}',
      signal: life.signal,
    });
    const s = await r.json();
    if (!r.ok) throw Error(s.message);
    await host.identityChanged();
    token = s.token;
    creator = s.creator;
    $('network-identity').textContent = 'Signed in as ' + creator;
    $('network-logout').hidden = false;
    status(
      'Creator identity ready. Create or remix a private preview, then approve publication separately.',
    );
  });
  on('network-logout', async () => {
    await api('/api/v1/network/logout', {});
    token = '';
    creator = null;
    await host.identityChanged();
    $('network-identity').textContent = 'Guest · private creation is open';
    $('network-logout').hidden = true;
    status(
      'Creator session revoked. Owned creation scopes have been released.',
    );
  });
  on('network-remix', async () => {
    if (publication.content.remix_permission !== 'with_attribution')
      throw Error('This edition does not allow remixes.');
    await host.remix($('network-remix-intent').value);
    status(
      'Lumi prepared a validated private remix through the capability fabric. Inspect it, approve/save, then publish only if you choose.',
    );
  });
  on('network-export', async () => {
    status(
      'Validating and exporting this edition and its immutable ancestors…',
    );
    const r = await fetch(base + '/export', { signal: life.signal });
    if (!r.ok) throw Error('Package export unavailable');
    const blob = await r.blob();
    const u = URL.createObjectURL(blob);
    urls.add(u);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'finalverse-' + id + '.json';
    a.click();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(u);
      urls.delete(u);
      revokeTimers.delete(timer);
    }, 1000);
    revokeTimers.add(timer);
    status(
      'Portable experience package exported with Creative Graph, assets, hashes, licensing and immutable ancestry.',
    );
  });
  on('network-import', async () => {
    if (!token) throw Error('Sign in to take custody of an imported package.');
    const file = $('network-package').files[0];
    if (!file || file.size > 48 * 1024 * 1024)
      throw Error('Choose a Finalverse JSON package up to 48 MiB.');
    if (!$('network-import-consent').checked)
      throw Error('Approve validated package import first.');
    const body = await file.text();
    const r = await fetch('/api/v1/network/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        'x-finalverse-approve': 'true',
      },
      body,
      signal: life.signal,
    });
    const value = await r.json();
    if (!r.ok) throw Error(value.message);
    status(
      'Package validated and imported. Original attribution is preserved; local custody does not verify an external identity.',
    );
  });
  on('network-report', async () => {
    const result = await api('/api/v1/network/report', {
      reference: { experience: id, version: v },
      reason: $('network-reason').value,
    });
    $('network-reason').value = '';
    status('Report received: ' + result.id + '. A moderator will review it.');
  });
  on('network-policy', async () => {
    if (!token) throw Error('Sign in as the owner to change visibility.');
    const visibility = $('network-visibility').value;
    await api('/api/v1/network/policy', {
      reference: { experience: id, version: v },
      visibility,
      revoked: false,
    });
    status(
      'Visibility changed to ' +
        visibility +
        '. Immutable content and its hash are unchanged.',
    );
  });
  return {
    credential: () => token,
    snapshot: () => ({
      creator,
      session_active: !!token,
      object_urls: urls.size,
      timers: revokeTimers.size,
    }),
    dispose: () => {
      life.abort();
      token = '';
      creator = null;
      for (const u of urls) URL.revokeObjectURL(u);
      urls.clear();
      for (const timer of revokeTimers) clearTimeout(timer);
      revokeTimers.clear();
    },
  };
}
