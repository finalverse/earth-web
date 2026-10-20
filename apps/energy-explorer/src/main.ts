// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import './style.css';
import {
  EarthClient,
  createApplicationRuntime,
  IntelligenceSession,
  EarthError,
} from '@finalverse/earth';
import type {
  ApplicationManifest,
  QueryResult,
  FeatureData,
  FeatureCollection,
  Workspace,
  QueryPlan,
  SessionEvent,
} from '@finalverse/earth';
import {
  APP,
  DATASET,
  RENEWABLE,
  initial,
  energyPlan,
  makeWorkspace,
  restoreWorkspace,
  selectedFeature,
  resultFeatures,
} from './model.js';
import { EnergyMap } from './map.js';
const started = performance.now(),
  $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T,
  input = (id: string) => $<HTMLInputElement>(id),
  select = (id: string) => $<HTMLSelectElement>(id),
  client = new EarthClient({
    endpoint: location.origin,
    applicationId: APP,
    timeoutMs: 60000,
  }),
  store = client.workspaces.local(APP, localStorage);
let rings: number[][][] = [];
let result: QueryResult | null = null,
  selected: string | null = null,
  proposalId: string | null = null,
  filters = structuredClone(initial),
  versions: Workspace['layers'] = [],
  currentWorkspace: string | null = null,
  busy = false;
const metrics: Record<string, number> = {};
const status = (s: string) => {
  $('status').textContent = s;
};
function article(title: string, text: string, kind = '') {
  const a = document.createElement('article');
  a.className = kind;
  const h = document.createElement('b');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = text;
  a.append(h, p);
  $('timeline').append(a);
  while ($('timeline').children.length > 20)
    $('timeline').firstElementChild?.remove();
  $('timeline').scrollTop = $('timeline').scrollHeight;
  return a;
}
function event(e: SessionEvent) {
  if (e.type === 'message.delta') article('You', e.payload.text, 'user');
  if (e.type === 'plan.proposed') {
    $('proposal').hidden = false;
    $('plan').textContent = JSON.stringify(e.payload.proposal.plan, null, 2);
    const p = e.payload.proposal;
    $('proposal-info').textContent =
      `${p.provider}${p.model ? ' · ' + p.model : ''} · proposal only${p.elapsed_ms ? ' · ' + (p.elapsed_ms / 1000).toFixed(1) + ' s' : ''}. Review the dataset, filters and units before running.`;
    if (p.elapsed_ms) metrics.ai_planning_ms = p.elapsed_ms;
  }
}
const session = new IntelligenceSession(client, event),
  map = new EnergyMap($('map'), (id) => inspect(id));
let aiReady = false;
function setBusy(value: boolean) {
  busy = value;
  for (const id of [
    'analyze',
    'search',
    'approve',
    'propose',
    'open',
    'import',
    'save',
    'export',
    'delete',
  ])
    $<HTMLButtonElement>(id).disabled = value || (id === 'propose' && !aiReady);
}
async function guarded(fn: () => Promise<void>) {
  if (busy) return;
  setBusy(true);
  try {
    await fn();
  } catch (e) {
    status(e instanceof Error ? e.message : 'Operation failed.');
    if (e instanceof EarthError && e.code === 'APPROVAL_REQUIRED') {
      $('proposal').hidden = true;
      proposalId = null;
    }
  } finally {
    setBusy(false);
  }
}
function updateSaved() {
  const rows = store.list();
  select('saved').replaceChildren(
    new Option('Choose a workspace', ''),
    ...rows.map((w) => new Option(w.title, w.id)),
  );
  if (currentWorkspace) select('saved').value = currentWorkspace;
}
function readFilters() {
  return {
    place_id: select('places').value,
    radius_m: Number(input('radius').value) * 1000,
    cluster_radius_m: Number(input('edge').value) * 1000,
    fuels:
      select('fuels').value === 'renewable'
        ? [...RENEWABLE]
        : select('fuels').value.split(',').filter(Boolean),
  };
}
function writeFilters() {
  input('radius').value = String(filters.radius_m / 1000);
  input('edge').value = String(filters.cluster_radius_m / 1000);
  if (![...select('places').options].some((o) => o.value === filters.place_id))
    select('places').add(
      new Option('Saved source place · ' + filters.place_id, filters.place_id),
    );
  select('places').value = filters.place_id;
  const fuel =
    filters.fuels.join(',') === RENEWABLE.join(',')
      ? 'renewable'
      : filters.fuels.join(',');
  if (![...select('fuels').options].some((o) => o.value === fuel))
    select('fuels').add(new Option(filters.fuels.join(' + '), fuel));
  select('fuels').value = fuel;
}
function inspect(id: string) {
  const feature = selectedFeature(result, id);
  if (!feature) return;
  selected = id;
  map.select(id);
  const d = result!.data as FeatureData,
    p = feature.properties,
    m = d.measurements?.find((x) => x.feature_id === id)?.distance_m;
  $('inspection').hidden = false;
  $('feature-name').textContent = p.name as string;
  $('feature-info').textContent = [
    p.fuel,
    `${p.capacity_mw ?? 'Unknown'} MW reported capacity${p.capacity_data_year ? ' · source year ' + p.capacity_data_year : ''}`,
    m !== undefined
      ? `${(m / 1000).toFixed(2)} km from query origin · WGS84`
      : 'No distance in this result',
    `Source coordinates: ${feature.geometry.coordinates.join(', ')}`,
    'Archival record; present operating status unverified.',
  ].join('\n');
  for (const b of $('timeline').querySelectorAll<HTMLButtonElement>(
    'button[data-feature]',
  ))
    b.setAttribute('aria-pressed', String(b.dataset.feature === id));
  status('Selected ' + p.name + ' · conversation context updated.');
}
function recordFacts() {
  const f = selected ? selectedFeature(result, selected) : null;
  if (!f) return;
  const a = article(
    'Source facts · ' + f.properties.name,
    `${f.properties.fuel}; ${f.properties.capacity_mw ?? 'unknown'} MW reported capacity. ${f.properties.capacity_data_year ? 'Reporting year ' + f.properties.capacity_data_year + '. ' : ''}Source coordinates ${f.geometry.coordinates.join(', ')}. Archival record, not current generation. Selection is now included in any proposed follow-up.`,
  );
  const b = document.createElement('button');
  b.textContent = 'Highlight ' + f.properties.name;
  b.onclick = () => inspect(f.id);
  a.append(b);
  $('question').focus();
}
async function display(
  next: QueryResult,
  restored = false,
  fit = true,
  savedRings: number[][][] = [],
) {
  const features = resultFeatures(next);
  result = next;
  selected = null;
  $('inspection').hidden = true;
  const a = next.plan.arguments;
  if ('place_id' in a && a.place_id) {
    filters = {
      ...filters,
      place_id: a.place_id,
      ...('radius_m' in a && a.radius_m ? { radius_m: a.radius_m } : {}),
      ...('cluster_radius_m' in a
        ? { cluster_radius_m: a.cluster_radius_m }
        : {}),
      ...('fuels' in a ? { fuels: a.fuels ?? [] } : {}),
    };
    writeFilters();
  }
  const data = next.data as FeatureData,
    center = data.analysis?.center,
    radius = data.analysis?.radius_m;
  let buffer: FeatureCollection | null = null;
  rings = structuredClone(savedRings);
  if (!restored && center && typeof radius === 'number') {
    const response = await client.spatial.query('buffer', {
      point: center,
      radius_m: radius,
    });
    buffer = response.data;
    rings = buffer.features.flatMap((f) =>
      f.geometry.type === 'MultiPolygon'
        ? (f.geometry.coordinates as number[][][][]).map((p) => p[0])
        : [],
    );
  } else if (rings.length) {
    buffer = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: 'saved-display-filter',
          properties: { name: 'Saved sampled radius; local display only' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: rings.map((r) => [r]),
          },
        },
      ],
    };
  }
  await map.show(next, buffer, fit);
  map.setLayerVisible(input('layer').checked);
  const count = data.total ?? features.length,
    groups = data.clusters ?? [],
    fuelGroups = data.fuel_groups ?? [];
  const card = article(
    restored ? 'Reopened local evidence' : next.summary,
    `${features.length} shown of ${count} source records${data.truncated ? ' · TRUNCATED' : ' · complete selection'}. ${groups.length ? `Groups use WGS84 edges ≤ ${(Number((data.analysis?.clustering as { edge_threshold_m?: number })?.edge_threshold_m) / 1000).toFixed(0)} km; connected chains can span farther. ` : ''}MW is archival reported capacity, not live generation.`,
  );
  for (const g of fuelGroups) {
    const row = document.createElement('div');
    row.className = 'fuel-row';
    const name = document.createElement('span');
    name.className = 'fuel-label';
    name.textContent = g.fuel;
    const bar = document.createElement('span');
    bar.className = 'bar';
    bar.style.width =
      (Math.max(1, g.count) / Math.max(1, features.length)) * 85 + 'px';
    const label = document.createElement('span');
    label.textContent = `${g.count} · ${g.reported_capacity_mw.toFixed(1)} MW${g.missing_capacity ? ' · ' + g.missing_capacity + ' missing' : ''}`;
    row.append(name, bar, label);
    card.append(row);
  }
  for (const g of groups) {
    const row = document.createElement('p');
    row.textContent = `Group ${groups.indexOf(g) + 1}: ${g.count} ${g.count === 1 ? 'facility' : 'facilities'}`;
    card.append(row);
    for (const id of g.feature_ids) {
      const f = features.find((f) => f.id === id);
      if (!f) continue;
      const b = document.createElement('button');
      b.textContent = String(f.properties.name);
      b.dataset.feature = id;
      b.setAttribute('aria-pressed', 'false');
      b.onclick = () => inspect(id);
      card.append(b);
    }
  }
  if (!groups.length)
    for (const f of features) {
      const b = document.createElement('button');
      b.textContent = String(f.properties.name);
      b.dataset.feature = f.id;
      b.onclick = () => inspect(f.id);
      card.append(b);
    }
  $('evidence-summary').textContent =
    `${restored ? 'Saved local snapshot · ' : 'Server execution · '}${next.receipt.executed_at} · ${features.length} shown / ${count} matches · ${next.provenance?.dataset_id ?? 'source'}`;
  $('evidence').textContent = JSON.stringify(
    {
      plan: next.plan,
      receipt: next.receipt,
      provenance: next.provenance,
      analysis: data.analysis,
      result_count: features.length,
      elapsed_ms: next.elapsed_ms,
    },
    null,
    2,
  );
  $('map-caption').textContent =
    `${data.analysis?.place && typeof data.analysis.place === 'object' ? ('name' in data.analysis.place ? String(data.analysis.place.name) : 'Source area') : 'Source area'} / ${features.length} facilities`;
  metrics.spatial_query_ms = next.elapsed_ms;
  status(
    restored
      ? 'Workspace restored without executing a query. Analyze explicitly to refresh.'
      : `${features.length} facilities mapped with query receipt · ${next.elapsed_ms.toFixed(2)} ms engine time.`,
  );
  performanceText();
}
function performanceText() {
  $('performance').textContent =
    `Start ${(metrics.startup_ms ?? performance.now() - started).toFixed(0)} ms · query ${(metrics.spatial_query_ms ?? 0).toFixed(1)} ms`;
}
function workspace() {
  return makeWorkspace({
    title: input('workspace-title').value,
    filters: readFilters(),
    result,
    camera: map.camera(),
    selected,
    rings,
    layers: versions.map((v) => ({
      ...v,
      visible: v.id !== DATASET || input('layer').checked,
    })),
  });
}
async function openWorkspace(w: Workspace) {
  const state = restoreWorkspace(w);
  filters = state.filters;
  writeFilters();
  input('workspace-title').value = w.title;
  currentWorkspace = w.id;
  input('layer').checked =
    w.layers.find((l) => l.id === DATASET)?.visible ?? true;
  if (state.result) await display(state.result, true, false, state.rings);
  else {
    result = null;
    selected = null;
    rings = [];
    map.clear();
    $('inspection').hidden = true;
    $('evidence-summary').textContent =
      'Saved query references only. Analyze explicitly for fresh evidence.';
    $('evidence').textContent = JSON.stringify(
      { plan: w.plan, receipt: w.receipt, provenance: w.provenance },
      null,
      2,
    );
    $('map-caption').textContent = 'Saved query / no result snapshot';
    status(
      'Legacy query restored. Analyze explicitly to produce fresh evidence.',
    );
  }
  map.setCamera(w.camera);
  if (state.selected) inspect(state.selected);
  updateSaved();
  status(
    'Workspace reopened. Saved evidence is unverified local content; no query ran.',
  );
}
$('discovery').onsubmit = (e) => {
  e.preventDefault();
  void guarded(async () => {
    filters = readFilters();
    const t = performance.now();
    await display(await session.run(energyPlan(filters)));
    metrics.analysis_roundtrip_ms = performance.now() - t;
  });
};
$('search').onclick = () =>
  void guarded(async () => {
    const found = await client.places.search(input('place-search').value);
    const places = found.data.features.filter(
      (f) => f.properties.country === 'CAN',
    );
    select('places').replaceChildren(
      ...places.map(
        (f) => new Option(String(f.properties.name) + ' · Canada', f.id),
      ),
    );
    status(
      places.length
        ? `${places.length} matching Canadian source locations. Choose one, then Analyze.`
        : 'No Canadian reference place matches; try Montréal, Toronto or Vancouver.',
    );
  });
$('conversation').onsubmit = (e) => {
  e.preventDefault();
  void guarded(async () => {
    const question = $<HTMLTextAreaElement>('question').value.trim();
    if (!question) throw new Error('Enter a question.');
    status('Local model is proposing a plan; no query is executing.');
    proposalId = await session.propose(question, {
      ...(result ? { plan: result.plan } : {}),
      ...(selected
        ? { selected: { dataset: DATASET, feature_id: selected } }
        : {}),
    });
    status('Plan ready for review.');
  });
};
$('approve').onclick = () =>
  void guarded(async () => {
    if (!proposalId) throw new Error('Propose a plan first.');
    const id = proposalId;
    proposalId = null;
    $('proposal').hidden = true;
    await display(await session.approve(id));
  });
$('cancel').onclick = () => {
  session.cancel();
  proposalId = null;
  $('proposal').hidden = true;
  status('Cancelled pending planning/approval.');
};
$('ask-selected').onclick = recordFacts;
$('close-inspection').onclick = () => {
  $('inspection').hidden = true;
};
$('layer').onchange = () => map.setLayerVisible(input('layer').checked);
$('save').onclick = () =>
  void guarded(async () => {
    const t = performance.now();
    const w = workspace();
    if (currentWorkspace) {
      w.id = currentWorkspace;
      const old = store.open(w.id);
      w.created_at = old.created_at;
    }
    store.save(w);
    currentWorkspace = w.id;
    updateSaved();
    metrics.workspace_save_ms = performance.now() - t;
    status('Workspace saved in this browser for this application.');
  });
$('export').onclick = () =>
  void guarded(async () => {
    if (!currentWorkspace) throw new Error('Save locally before exporting.');
    const text = store.export(currentWorkspace),
      url = URL.createObjectURL(new Blob([text], { type: 'application/json' })),
      a = document.createElement('a');
    a.href = url;
    a.download = 'energy-workspace-' + currentWorkspace + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('Workspace JSON exported. Review its contents before sharing.');
  });
$('open').onclick = () =>
  void guarded(async () => {
    const t = performance.now();
    await openWorkspace(store.open(select('saved').value));
    metrics.workspace_open_ms = performance.now() - t;
  });
$('import').onchange = () =>
  void guarded(async () => {
    const file = $<HTMLInputElement>('import').files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024)
      throw new Error('Workspace import exceeds 1 MiB.');
    const text = await file.text();
    if (!input('legacy').checked) restoreWorkspace(JSON.parse(text));
    const w = input('legacy').checked
      ? store.importLegacy(text, 'energy')
      : store.import(text);
    await openWorkspace(w);
    $<HTMLInputElement>('import').value = '';
  });
$('delete').onclick = () =>
  void guarded(async () => {
    const id = select('saved').value;
    if (!id) throw new Error('Select a saved workspace.');
    store.delete(id);
    if (currentWorkspace === id) currentWorkspace = null;
    updateSaved();
    status('Selected local copy removed. Exported files are unaffected.');
  });
async function start() {
  setBusy(true);
  const t = performance.now(),
    manifest = (await fetch('/earth-app.json').then((r) => {
      if (!r.ok) throw new Error('Application manifest unavailable.');
      return r.json();
    })) as ApplicationManifest;
  const runtime = createApplicationRuntime(manifest, {
    client,
    storage: localStorage,
  });
  await runtime.start();
  metrics.sdk_initialization_ms = performance.now() - t;
  const discovery = await client.datasets.list();
  versions = discovery.items.map((d) => ({
    id: d.id,
    version: d.version,
    visible: true,
  }));
  const countries = await client.spatial.query('query_features', {
    dataset: 'natural-earth-countries',
    query: 'Canada',
    limit: 1,
  });
  await map.references(countries.data);
  const capabilities = await client.capabilities.get();
  $('ai-status').textContent = capabilities.ai_enabled
    ? 'Optional local model · reviewed plans · no cloud fallback'
    : 'AI is disabled. Discovery, analysis, selection and workspaces work independently.';
  if (capabilities.ai_enabled) {
    try {
      const info = await client.ai.providers();
      aiReady = info.providers.some((p) => p.available);
      $('ai-status').textContent = info.providers.some((p) => p.available)
        ? info.providers
            .filter((p) => p.available)
            .map((p) => p.model + ' · local')
            .join(', ') + ' · reviewed plans'
        : 'Configured local model unavailable; deterministic analysis is ready.';
    } catch {
      $('ai-status').textContent =
        'Provider discovery unavailable; deterministic analysis is ready.';
    }
  }
  updateSaved();
  metrics.startup_ms = performance.now() - started;
  performanceText();
  setBusy(false);
  status('Ready. Find a place, then Analyze. No LLM is needed.');
  const details = document.createElement('details'),
    summary = document.createElement('summary'),
    pre = document.createElement('pre');
  summary.textContent = 'Local session & performance';
  details.append(summary, pre);
  details.ontoggle = () => {
    if (details.open) {
      const memory = (
        performance as Performance & {
          memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
        }
      ).memory;
      if (memory) {
        metrics.browser_js_heap_used_mib = memory.usedJSHeapSize / 1024 / 1024;
        metrics.browser_js_heap_total_mib =
          memory.totalJSHeapSize / 1024 / 1024;
      }
      pre.textContent = JSON.stringify(
        {
          metrics,
          render_request_to_frame_ms: map.lastRenderMs,
          session: session.replay().session_id,
          events: session.replay().events.map((e) => ({
            sequence: e.sequence,
            type: e.type,
            request_id: e.request_id,
          })),
          memory_api_supported: 'memory' in performance,
        },
        null,
        2,
      );
    }
  };
  $('evidence').parentElement?.after(details);
  window.addEventListener(
    'pagehide',
    () => {
      session.close();
      runtime.stop();
      map.destroy();
    },
    { once: true },
  );
}
void start().catch((e) =>
  status(e instanceof Error ? e.message : 'Application startup failed.'),
);
