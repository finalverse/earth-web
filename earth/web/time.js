// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import './time.css';
import * as Cesium from 'cesium';
import {
  createApplicationViewer,
  installTrackpadPinchZoom,
} from '../../src/app/viewer.js';
import { installEarthIdentity } from './identity.js';
import { installWorkspaces } from './workspaces.js';
import { prepareReferenceGeometry } from './geometry.js';
import { EarthClient } from '../sdk.js';
const $ = (id) => document.getElementById(id),
  client = new EarthClient(location.origin),
  archive = 'usgs-ridgecrest-2019';
const origin = Date.parse('2019-07-04T00:00:00Z'),
  hour = 3600000;
let viewer,
  source,
  context,
  records = new Map(),
  layers = [],
  lastResult,
  active,
  playing = false,
  timer,
  busy = false,
  lastIds = new Set();
const status = (text) => {
  $('status').textContent = text;
};
const plan = (tool, args) => ({ schema_version: 1, tool, arguments: args });
const utc = (id) => new Date($(id).value + 'Z').toISOString();
const camera = () => {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-117.5, 35.8, 220000),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
  });
  viewer.scene.requestRender();
};
function stop() {
  playing = false;
  clearTimeout(timer);
  $('play').textContent = 'Play';
}
function inspect(id) {
  const f = records.get(id);
  if (!f) return;
  $('inspection').hidden = false;
  $('feature-name').textContent = f.properties.name;
  $('feature-info').textContent =
    `Event time: ${f.properties.event_at}\nCatalog updated: ${f.properties.catalog_updated_at}\nMagnitude: ${f.properties.magnitude} (${f.properties.magnitude_type})\nDepth: ${f.properties.depth_km} km\nObservation time unavailable. Source: ${f.properties.source_url}`;
}
function show(result) {
  lastResult = result;
  const ids = new Set(result.data.features?.map((f) => f.id) || []);
  for (const e of source.entities.values) {
    const visible = ids.has(e.id);
    e.show = visible;
    e.point.color = Cesium.Color.fromCssColorString(
      lastIds.has(e.id) ? '#b9a1fa' : '#95f0d9',
    );
  }
  lastIds = ids;
  viewer.scene.requestRender();
  $('result-title').textContent = result.summary;
  $('result-info').textContent =
    result.data.explanation || 'Source observations, no interpolation.';
  $('coverage').textContent =
    `${result.data.total ?? 0} features · ${result.data.observations?.length ?? 0} reports`;
  $('provenance').textContent = JSON.stringify(
    {
      provenance: result.provenance,
      receipt: result.receipt,
      temporal: result.data.temporal,
      elapsed_ms: result.elapsed_ms,
      changes: result.data.changes,
      change_counts: result.data.change_counts,
      missing_observations: result.data.missing_observations,
    },
    null,
    2,
  );
  $('export').disabled = false;
  $('rows').replaceChildren();
  for (const f of result.data.features || []) {
    const b = document.createElement('button');
    b.textContent = f.properties.name;
    b.onclick = () => inspect(f.id);
    $('rows').append(b);
  }
  if (result.data.change_counts) {
    const p = document.createElement('p');
    p.textContent = `${result.data.change_counts.newly_observed} newly observed; ${result.data.change_counts.changed} changed measurements; ${result.data.change_counts.unchanged} unchanged. Missing reports do not imply creation/deletion.`;
    $('rows').prepend(p);
  }
}
async function run(p, { playback = false } = {}) {
  if (!playback) stop();
  active?.abort();
  active = new AbortController();
  const signal = active.signal;
  busy = true;
  $('plan').value = JSON.stringify(p, null, 2);
  try {
    const t = performance.now();
    const result = await client.query(p, { signal });
    if (signal.aborted) return;
    show(result);
    const queryEnd = p.arguments.end || p.arguments.after || p.arguments.at;
    if (p.arguments.dataset === archive && queryEnd) {
      $('cursor').value = String(
        Math.max(0, Math.min(96, (Date.parse(queryEnd) - origin) / hour)),
      );
      $('cursor-label').textContent = queryEnd
        .replace('T', ' ')
        .replace('.000Z', ' UTC');
      if (p.arguments.start || p.arguments.before)
        $('start').value = (p.arguments.start || p.arguments.before).slice(
          0,
          19,
        );
      $('end').value = queryEnd.slice(0, 19);
    }
    $('globe').dataset.temporalLatency = (performance.now() - t).toFixed(1);
    status(
      `${result.summary} · ${result.elapsed_ms.toFixed(1)} ms core · historical archive.`,
    );
  } catch (e) {
    if (!signal.aborted) {
      stop();
      status(e.message);
    }
  } finally {
    if (active?.signal === signal) busy = false;
  }
}
function rangePlan() {
  return plan('features_during_interval', {
    dataset: $('dataset').value,
    start: utc('start'),
    end: utc('end'),
    limit: 100,
  });
}
async function tick() {
  if (!playing) return;
  if (busy) {
    timer = setTimeout(tick, 100);
    return;
  }
  let value = Number($('cursor').value);
  if (value >= 96) {
    stop();
    return;
  }
  $('cursor').value = String(Math.min(96, value + Number($('speed').value)));
  await cursor({ playback: true });
  if (playing) timer = setTimeout(tick, 1000);
}
async function cursor(options = {}) {
  const end = new Date(origin + Number($('cursor').value) * hour).toISOString();
  $('cursor-label').textContent = end
    .replace('T', ' ')
    .replace('.000Z', ' UTC');
  $('start').value = new Date(origin).toISOString().slice(0, 19);
  $('end').value = end.slice(0, 19);
  if (Number($('cursor').value) === 0) {
    await run(
      plan('features_at_time', { dataset: archive, at: end, limit: 100 }),
      options,
    );
    return;
  }
  await run(
    plan('features_during_interval', {
      dataset: archive,
      start: new Date(origin).toISOString(),
      end,
      limit: 100,
    }),
    options,
  );
}
function availability() {
  const l = layers.find((l) => l.id === $('dataset').value),
    available = l?.temporal.observation_count > 0;
  $('availability').textContent = available
    ? `${l.temporal.observation_count} source observations · ${l.temporal.extent.start} to ${l.temporal.extent.end}. ${l.temporal.explanation}`
    : 'No reported annual generation observations in the Canadian source. Capacity reporting year is not generation. Compare available periods to inspect the explicit coverage gap.';
  $('kind').textContent = available
    ? 'Historical event archive'
    : 'Static reference · no observation history';
  for (const id of ['cursor', 'play', 'reset']) $(id).disabled = !available;
}
$('range-form').onsubmit = (e) => {
  e.preventDefault();
  try {
    run(rangePlan());
  } catch (e) {
    status(e.message);
  }
};
$('cursor').oninput = () => {
  stop();
  clearTimeout(timer);
  timer = setTimeout(() => cursor(), 140);
};
$('play').onclick = () => {
  if (playing) {
    stop();
    return;
  }
  if (Number($('cursor').value) >= 96) $('cursor').value = '0';
  playing = true;
  $('play').textContent = 'Pause';
  tick();
};
$('reset').onclick = () => {
  stop();
  $('cursor').value = '96';
  cursor();
};
$('dataset').onchange = () => {
  stop();
  active?.abort();
  availability();
  $('rows').replaceChildren();
  lastResult = null;
  lastIds = new Set();
  $('export').disabled = true;
  $('coverage').textContent = 'No query';
  $('cursor-label').textContent =
    $('dataset').value === archive
      ? 'Choose an archive interval'
      : 'No observation history';
  $('result-title').textContent = 'Choose a source-supported interval';
  $('result-info').textContent = $('availability').textContent;
  $('provenance').textContent = 'No query on this layer.';
  if (context) context.show = $('dataset').value === archive;
  if ($('dataset').value === archive) camera();
  else
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-96, 58, 6500000),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
  $('inspection').hidden = true;
  for (const e of source.entities.values) e.show = false;
  viewer.scene.requestRender();
  status('Layer changed. Choose an interval and run its deterministic query.');
};
$('compare').onclick = () => {
  try {
    const p = rangePlan();
    run(
      plan('compare_snapshots', {
        dataset: p.arguments.dataset,
        before: p.arguments.start,
        after: p.arguments.end,
        window_start: new Date(origin).toISOString(),
        limit: 100,
      }),
    );
  } catch (e) {
    status(e.message);
  }
};
$('run').onclick = () => {
  try {
    run(JSON.parse($('plan').value));
  } catch (e) {
    status(e.message);
  }
};
$('ai').onsubmit = async (e) => {
  e.preventDefault();
  stop();
  active?.abort();
  active = new AbortController();
  const signal = active.signal;
  $('propose').disabled = true;
  try {
    const proposal = await client.propose($('question').value, { signal });
    if (signal.aborted) return;
    $('plan').value = JSON.stringify(proposal.plan, null, 2);
    $('review').open = true;
    status('Review the source, time interval and tool before running.');
  } catch (e) {
    if (!signal.aborted) status(e.message);
  } finally {
    $('propose').disabled = false;
  }
};
$('home').onclick = camera;
$('cancel').onclick = () => {
  stop();
  active?.abort();
  status('Cancelled.');
};
$('feature-close').onclick = () => {
  $('inspection').hidden = true;
};
$('export').onclick = () => {
  if (!lastResult) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(lastResult, null, 2)], {
      type: 'application/json',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'earth-space-time-evidence.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
try {
  viewer = createApplicationViewer({
    container: $('globe'),
    creditContainer: $('credits'),
  });
  installEarthIdentity(viewer);
  installTrackpadPinchZoom(viewer);
  viewer.creditDisplay.addStaticCredit(
    new Cesium.Credit(
      'USGS ComCat · Earthquake Hazards Program & contributing seismic networks',
      true,
    ),
  );
  camera();
  const [data, reference, meta, state, places] = await Promise.all([
    client.request(`/v1/datasets/${archive}/features`),
    client.request('/v1/datasets/natural-earth-countries/features'),
    client.layers(),
    client.request('/v1/status'),
    client.request('/v1/datasets/natural-earth-places/features'),
  ]);
  layers = meta.layers;
  await viewer.dataSources.add(
    prepareReferenceGeometry(
      await Cesium.GeoJsonDataSource.load(reference.data, {
        fill: Cesium.Color.fromCssColorString('#30475d').withAlpha(0.9),
        stroke: Cesium.Color.fromCssColorString('#94adc7'),
        strokeWidth: 1,
      }),
    ),
  );
  context = new Cesium.CustomDataSource(
    'Derived coordinate grid and Natural Earth places',
  );
  for (let lon = -119; lon <= -116; lon += 0.5)
    context.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([lon, 35, lon, 37]),
        width: 1,
        material: Cesium.Color.fromCssColorString('#a6b8d0').withAlpha(0.18),
      },
    });
  for (let lat = 35; lat <= 37; lat += 0.5)
    context.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([-119, lat, -116, lat]),
        width: 1,
        material: Cesium.Color.fromCssColorString('#a6b8d0').withAlpha(0.18),
      },
    });
  context.entities.add({
    position: Cesium.Cartesian3.fromDegrees(-118.4, 36.3, 500),
    label: {
      text: 'RIDGECREST SEQUENCE\n35–37° N · 119–116° W',
      font: '12px sans-serif',
      fillColor: Cesium.Color.fromCssColorString('#c6d2e5'),
      showBackground: true,
      backgroundColor:
        Cesium.Color.fromCssColorString('#142338').withAlpha(0.9),
      pixelOffset: new Cesium.Cartesian2(0, -20),
    },
  });
  for (const f of places.data.features) {
    const [lon, lat] = f.geometry.coordinates;
    if (lon < -123 || lon > -114 || lat < 32 || lat > 39) continue;
    context.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 500),
      label: {
        text: f.properties.name,
        font: '11px sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#b9cbe1'),
        showBackground: true,
        backgroundColor:
          Cesium.Color.fromCssColorString('#142338').withAlpha(0.8),
        pixelOffset: new Cesium.Cartesian2(0, -12),
      },
      point: {
        pixelSize: 3,
        color: Cesium.Color.fromCssColorString('#b9cbe1'),
      },
    });
  }
  await viewer.dataSources.add(context);
  source = new Cesium.CustomDataSource('USGS temporal archive');
  for (const f of data.data.features) {
    records.set(f.id, f);
    source.entities.add({
      id: f.id,
      position: Cesium.Cartesian3.fromDegrees(...f.geometry.coordinates, 500),
      point: {
        pixelSize: Math.max(5, (f.properties.magnitude - 3) * 3),
        color: Cesium.Color.fromCssColorString('#b9a1fa'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
      },
    });
  }
  await viewer.dataSources.add(source);
  const click = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  click.setInputAction((e) => {
    const id = viewer.scene.pick(e.position)?.id?.id;
    if (records.has(id)) inspect(id);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  for (const id of ['analyze', 'compare', 'run']) $(id).disabled = false;
  $('ai-state').textContent = state.ai_enabled ? 'available' : 'off';
  $('propose').disabled = !state.ai_enabled;
  availability();
  installWorkspaces({
    viewer,
    client,
    application: 'time',
    status,
    capture: () => ({
      plan: lastResult?.plan,
      receipt: lastResult?.receipt,
      provenance: lastResult?.provenance,
      selected: lastResult?.data.features?.map((f) => f.id),
      interval: lastResult?.data.interval,
    }),
    restore: async (w) => {
      active?.abort();
      $('inspection').hidden = true;
      lastResult = null;
      $('export').disabled = true;
      $('rows').replaceChildren();
      $('result-title').textContent = 'Saved view · review its query';
      $('result-info').textContent =
        'Run the saved plan to refresh analysis. Opening a workspace does not execute it.';
      $('provenance').textContent = JSON.stringify(
        { saved_receipt: w.receipt, provenance: w.provenance },
        null,
        2,
      );

      stop();
      if (w.plan) {
        $('plan').value = JSON.stringify(w.plan, null, 2);
        if (layers.some((l) => l.id === w.plan.arguments.dataset))
          $('dataset').value = w.plan.arguments.dataset;
      }
      const end =
        w.temporal_range?.end ||
        w.plan?.arguments?.at ||
        w.plan?.arguments?.after ||
        w.plan?.arguments?.end;
      if (end) {
        $('cursor').value = String(
          Math.max(0, Math.min(96, (Date.parse(end) - origin) / hour)),
        );
        $('cursor-label').textContent = end
          .replace('T', ' ')
          .replace('.000Z', ' UTC');
        $('end').value = end.slice(0, 19);
      }
      if (w.temporal_range) {
        $('start').value = w.temporal_range.start.slice(0, 19);
        $('end').value = w.temporal_range.end.slice(0, 19);
        $('cursor').value = String(
          Math.max(
            0,
            Math.min(96, (Date.parse(w.temporal_range.end) - origin) / hour),
          ),
        );
        $('cursor-label').textContent = w.temporal_range.end
          .replace('T', ' ')
          .replace('.000Z', ' UTC');
      }
      availability();
      for (const e of source.entities.values)
        e.show = w.selected_features.includes(e.id);
      viewer.scene.requestRender();
    },
  });
  camera();
  await cursor();
  $('globe').dataset.ready = 'true';
} catch (e) {
  status('Temporal workspace unavailable: ' + e.message);
}
