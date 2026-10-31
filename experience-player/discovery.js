const $ = (id) => document.getElementById(id);
const life = new AbortController();
let filter = 'all',
  latest = [],
  attachment = null,
  searchEpoch = 0;
const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const link = (text, path, cls) => {
  const a = node('a', text, cls);
  a.href = path;
  return a;
};
async function read(path) {
  const start = performance.now();
  const r = await fetch(path, { signal: life.signal });
  if (!r.ok) throw Error('This published experience is unavailable.');
  const v = await r.json();
  window.finalverseDiscoveryMeasurements ??= [];
  window.finalverseDiscoveryMeasurements.push({
    path,
    ms: performance.now() - start,
  });
  return v;
}
function card(item) {
  const c = node('article', undefined, 'card');
  const pic = link('', item.path, 'card-picture');
  if (item.generated) {
    const img = node('img');
    img.src = '/network-assets/winter-market.jpg';
    img.alt =
      'Render of the original Winter Market template; edition variations may differ';
    img.loading = 'lazy';
    pic.append(img);
  } else {
    pic.append(node('span', 'Montréal · After dark', 'source-art'));
  }
  pic.append(
    node(
      'span',
      item.ai_generated
        ? 'AI-PLANNED · PROCEDURAL MESHES'
        : item.generated
          ? 'PROCEDURAL EXPERIENCE'
          : 'SOURCE-BACKED CITY',
      'card-tag',
    ),
  );
  c.append(pic);
  const body = node('div', undefined, 'card-body');
  body.append(node('h3', item.title), node('p', item.description));
  const meta = node('div', undefined, 'card-meta');
  if (item.imported_custody)
    body.append(node('p', 'Imported package · original credit preserved'));
  meta.append(
    link('By ' + item.creator, '/creators/' + item.creator),
    node(
      'span',
      item.generated ? item.objects + ' original objects' : 'Montréal · Earth',
    ),
  );
  body.append(meta);
  const bottom = node('div', undefined, 'card-bottom');
  bottom.append(
    link('Enter experience ↗', item.path),
    link(
      item.remixable ? 'Explore its lineage ↗' : 'View provenance ↗',
      '/lineage/' + item.reference.experience + '/' + item.reference.version,
    ),
  );
  body.append(bottom);
  c.append(body);
  return c;
}
async function search() {
  const epoch = ++searchEpoch;
  const params = new URLSearchParams();
  const profileId = location.pathname.match(/^\/creators\/([^/]+)$/)?.[1];
  if (profileId) params.set('creator', decodeURIComponent(profileId));
  const q = $('search').value.trim();
  if (q) params.set('q', q);
  if (['winter', 'city'].includes(filter)) params.set('category', filter);
  if (filter === 'generated') params.set('generated', 'true');
  if (filter === 'ai') params.set('ai_generated', 'true');
  if (filter === 'remixable') params.set('remixable', 'true');
  const v = await read('/api/v1/network/discover?' + params);
  if (epoch !== searchEpoch) return;
  latest = v.items;
  $('results').replaceChildren(...latest.map(card));
  $('result-count').textContent =
    latest.length + ' published editions · ready to enter';
  $('empty').hidden = latest.length > 0;
  const featured = latest.find(
    (x) =>
      x.reference.version ===
      '8143ae9315d57a9fa740a6322e108488815d335ddaec15054f71ae8e31dacdc5',
  );
  if (filter === 'all' && !q) {
    $('featured-enter').hidden = !featured;
    $('featured-art').hidden = !featured;
    $('hero').classList.toggle('no-feature', !featured);
  }
  if (featured) {
    $('featured-enter').href = featured.path;
    $('featured-art').href = featured.path;
  }
}
$('search-form').addEventListener(
  'submit',
  (e) => {
    e.preventDefault();
    search().catch(showError);
  },
  { signal: life.signal },
);
for (const b of document.querySelectorAll('[data-filter]'))
  b.addEventListener(
    'click',
    () => {
      filter = b.dataset.filter;
      document
        .querySelectorAll('[data-filter]')
        .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      search().catch(showError);
    },
    { signal: life.signal },
  );
function showError(e) {
  if (e.name !== 'AbortError') $('error').textContent = e.message;
}
async function invoke(cap, args) {
  if (!attachment) {
    const item = latest.find((x) => x.generated) || latest[0];
    if (!item) throw Error('Discover an experience first.');
    const r = await fetch('/api/v1/fabric/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: item.reference, read_only: true }),
      signal: life.signal,
    });
    attachment = await r.json();
    if (!r.ok) throw Error(attachment.message);
  }
  const post = async (action, body) => {
    const r = await fetch('/api/v1/fabric/' + action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Capability ' + attachment.token,
      },
      body: JSON.stringify(body),
      signal: life.signal,
    });
    const v = await r.json();
    if (!r.ok) throw Error(v.message);
    return v;
  };
  const state = await post('state', {});
  const b = state.bindings.find((x) => x.capability.id === cap);
  const v = await post('invoke', {
    schema_version: 'finalverse.capability-invocation/v1',
    capability: b.capability,
    operation: {
      schema_version: 'finalverse.sil/v1',
      request_id: 'network-' + crypto.randomUUID(),
      instance_id: state.instance_id,
      session_id: state.session_id,
      interaction_id: b.interaction_id,
      operation: b.operation,
      target: b.target,
      expected_context_revision: state.context_revision,
    },
    arguments: args,
  });
  if (v.state !== 'completed')
    throw Error(
      v.result?.error?.message || 'Lumi could not complete this request.',
    );
  window.finalverseDiscoveryEvidence ??= [];
  window.finalverseDiscoveryEvidence.push(v.evidence);
  return v.result;
}
$('lumi-form').addEventListener(
  'submit',
  async (e) => {
    e.preventDefault();
    $('lumi-status').textContent =
      'Lumi is looking through published experiences…';
    try {
      await invoke('registry.inspect', {});
      const post = async (action, body) => {
        const r = await fetch('/api/v1/fabric/' + action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Capability ' + attachment.token,
          },
          body: JSON.stringify(body),
          signal: life.signal,
        });
        const v = await r.json();
        if (!r.ok) throw Error(v.message);
        return v;
      };
      const current = await post('state', {});
      if (!current.agent)
        await post('agent-start', {
          approve: true,
          capabilities: [
            'registry.inspect',
            'registry.lineage',
            'registry.search',
          ],
        });
      const turn = await post('agent-turn', {
        request_id: 'lumi-network-' + crypto.randomUUID(),
        question: 'discovery',
        intention: $('lumi-query').value,
      });
      const v = turn.result.result;
      window.finalverseDiscoveryEvidence.push(
        ...turn.trace.map((t) => t.evidence),
      );
      $('lumi-status').textContent = v.explanation;
      const links = v.results.items.slice(0, 3).map((item) => {
        const b = node('button', 'Enter ' + item.title + ' ↗', 'button');
        b.addEventListener(
          'click',
          async () => {
            try {
              const d = item.destinations.find(
                (d) => d.destination.kind === 'standalone',
              );
              const result = await invoke('destination.open', {
                placement_id: d.id,
                approve: true,
              });
              location.assign(result.path);
            } catch (e) {
              showError(e);
            }
          },
          { signal: life.signal },
        );
        return b;
      });
      $('lumi-results').replaceChildren(...links);
    } catch (e) {
      showError(e);
      $('lumi-status').textContent = 'Try a shorter description.';
    }
  },
  { signal: life.signal },
);
async function detail() {
  const p = location.pathname.split('/').filter(Boolean);
  if (p[0] === 'creators') {
    const profile = await read(
      '/api/v1/network/creators/' + encodeURIComponent(p[1]),
    );
    $('hero').hidden = true;
    $('lumi').hidden = true;
    $('creators').hidden = true;
    $('detail').hidden = false;
    $('detail').append(
      node('span', 'CREATOR PROFILE', 'eyebrow'),
      node('h1', profile.name),
      node(
        'p',
        'Published creations, immutable editions, and attributed remixes.',
      ),
    );
    $('results').replaceChildren(...profile.experiences.items.map(card));
    $('result-count').textContent =
      profile.experiences.items.length + ' published editions';
    $('detail').after($('explore'));
    document.title = profile.name + ' · Finalverse';
  } else if (p[0] === 'lineage') {
    const v = await read(
      '/api/v1/network/editions/' + p[1] + '/' + p[2] + '/lineage',
    );
    for (const id of ['hero', 'explore', 'lumi', 'creators'])
      $(id).hidden = true;
    $('detail').hidden = false;
    $('detail').append(
      node('span', 'EVERY IDEA HAS A STORY', 'eyebrow'),
      node('h1', 'Follow the creative thread'),
    );
    for (const item of v.ancestors) {
      const div = node('article', undefined, 'lineage-item');
      div.append(
        node('h2', item.title),
        node('p', item.attribution.attribution),
        link(
          'Enter edition ↗',
          '/x/' + item.reference.experience + '/' + item.reference.version,
        ),
        link('Visit ' + item.creator + ' ↗', '/creators/' + item.creator),
      );
      $('detail').append(div);
    }
    if (v.children.length) {
      $('detail').append(node('h2', 'What grew from here'));
      for (const item of v.children)
        $('detail').append(
          link(
            item.title + ' ↗',
            '/x/' + item.reference.experience + '/' + item.reference.version,
          ),
        );
    }
    document.title = 'Creative lineage · Finalverse';
  }
}
window.addEventListener(
  'pagehide',
  () => {
    life.abort();
    if (attachment)
      void fetch('/api/v1/fabric/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Capability ' + attachment.token,
        },
        body: '{}',
        keepalive: true,
      });
  },
  { once: true },
);
search().then(detail).catch(showError);
