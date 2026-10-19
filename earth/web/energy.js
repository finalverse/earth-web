import { installEarthIdentity } from './identity.js';
// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import './energy.css';
import * as Cesium from 'cesium';
import {
  createApplicationViewer,
  installTrackpadPinchZoom,
} from '../../src/app/viewer.js';
import { EarthClient } from '../sdk.js';
import { RENEWABLE_FUELS } from '../core/constants.js';
import { prepareReferenceGeometry } from './geometry.js';
const $ = (id) => document.getElementById(id),
  client = new EarthClient(location.origin),
  catalog = 'wri-canada-power-plants',
  started = performance.now();
let viewer,
  facilities,
  countries,
  outline,
  active,
  lastResult,
  places = [],
  records = new Map(),
  measurement = new Map(),
  selected = new Set();
const status = (s) => {
  $('status').textContent = s;
};
const plan = (tool, args) => ({ schema_version: 1, tool, arguments: args });
const color = Cesium.Color.fromCssColorString;
const camera = (position, height) => {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(...position.slice(0, 2), height),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
  });
  viewer.scene.requestRender();
};
function highlight() {
  for (const entity of facilities.entities.values) {
    const chosen = selected.has(entity.id);
    entity.point.pixelSize = chosen ? 10 : 5;
    entity.point.color = color(chosen ? '#f5cd77' : '#8ee3d4');
  }
  viewer.scene.requestRender();
}
function inspect(id) {
  const f = records.get(id);
  if (!f) return;
  const p = f.properties,
    m = measurement.get(id);
  $('inspection').hidden = false;
  $('feature-name').textContent = p.name;
  $('feature-info').textContent = [
    p.fuel,
    `${p.capacity_mw ?? 'Unknown'} MW reported capacity${p.capacity_data_year ? ' · source year ' + p.capacity_data_year : ''}`,
    m !== undefined
      ? `${(m / 1000).toFixed(2)} km · WGS84 ellipsoid`
      : 'No query distance',
    `Source coordinates: ${f.geometry.coordinates.join(', ')}`,
    `Location source: ${p.geolocation_source || 'unspecified'}`,
    'Archival record; operating status unverified.',
  ].join('\n');
  facilities.entities.removeById('distance-line');
  const center = lastResult?.data.analysis?.center;
  if (center)
    facilities.entities.add({
      id: 'distance-line',
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([
          ...center.slice(0, 2),
          ...f.geometry.coordinates.slice(0, 2),
        ]),
        width: 2,
        material: color('#f5cd77'),
        arcType: Cesium.ArcType.GEODESIC,
      },
    });
  for (const b of $('rows').children)
    b.setAttribute('aria-pressed', String(b.dataset.id === id));
  viewer.scene.requestRender();
}
async function run(p) {
  active?.abort();
  active = new AbortController();
  const signal = active.signal;
  $('plan').value = JSON.stringify(p, null, 2);
  $('explore').disabled = true;
  $('run').disabled = true;
  status('Running validated, read-only spatial analysis…');
  try {
    const result = await client.executeSpatialPlan(p, { signal });
    if (signal.aborted) return;
    if (outline) {
      viewer.dataSources.remove(outline, true);
      outline = null;
    }
    facilities.entities.removeById('distance-line');
    $('inspection').hidden = true;
    measurement = new Map(
      (result.data.measurements || []).map((m) => [m.feature_id, m.distance_m]),
    );
    selected = new Set((result.data.features || []).map((f) => f.id));
    highlight();
    const analysis = result.data.analysis;
    let displayBuffer = null;
    if (analysis?.radius_m) {
      displayBuffer = await client.spatialQuery(
        'buffer',
        { point: analysis.center, radius_m: analysis.radius_m },
        { signal },
      );
      const data = await Cesium.GeoJsonDataSource.load(displayBuffer.data, {
        fill: color('#8ee3d4').withAlpha(0.12),
        stroke: color('#b5f4e5'),
        strokeWidth: 2,
      });
      if (signal.aborted) {
        data.destroy?.();
        return;
      }
      outline = await viewer.dataSources.add(prepareReferenceGeometry(data));
      outline.show = $('show-buffer').checked;
    }
    if (signal.aborted) return;
    lastResult = { ...result, display_buffer: displayBuffer };
    $('export').disabled = false;
    $('result-title').textContent = analysis
      ? `${result.data.total} matching facilities`
      : result.summary;
    $('result-info').textContent = result.data.explanation || result.summary;
    $('provenance').textContent = JSON.stringify(
      {
        provenance: result.provenance,
        method: analysis,
        receipt: result.receipt,
        elapsed_ms: result.elapsed_ms,
        display_buffer_receipt: displayBuffer?.receipt,
      },
      null,
      2,
    );
    $('rows').replaceChildren();
    for (const f of result.data.features || []) {
      const b = document.createElement('button');
      const m = measurement.get(f.id);
      b.textContent = `${f.properties.name} · ${f.properties.fuel}${m !== undefined ? ' · ' + (m / 1000).toFixed(1) + ' km' : ''}`;
      b.dataset.id = f.id;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        inspect(f.id);
        if (records.has(f.id))
          camera(
            f.geometry.coordinates,
            Math.max(80000, (analysis?.radius_m || 100000) * 3),
          );
      });
      $('rows').append(b);
    }
    if (analysis)
      camera(
        analysis.center,
        Math.max(60000, (analysis.radius_m || 100000) * 6),
      );
    status(
      `${result.summary} · ${result.elapsed_ms.toFixed(1)} ms core time · source snapshot, not live observations.`,
    );
  } catch (e) {
    if (!signal.aborted) status(e.message);
  } finally {
    if (active?.signal === signal) {
      $('explore').disabled = false;
      $('run').disabled = false;
    }
  }
}
$('energy-search').addEventListener('submit', (e) => {
  e.preventDefault();
  const args = {
    dataset: catalog,
    place_id: $('place').value,
    radius_m: Number($('radius').value) * 1000,
    limit: 100,
  };
  if ($('renewables').checked) args.fuels = [...RENEWABLE_FUELS];
  run(plan('within_distance', args));
});
$('run').addEventListener('click', () => {
  try {
    run(JSON.parse($('plan').value));
  } catch {
    status('Enter a valid JSON plan.');
  }
});
$('ai').addEventListener('submit', async (e) => {
  e.preventDefault();
  active?.abort();
  active = new AbortController();
  const signal = active.signal;
  $('propose').disabled = true;
  // A proposal can cancel an in-flight query; keep review controls usable.
  $('explore').disabled = false;
  $('run').disabled = false;
  status('Interpreting the question with the local model…');
  try {
    const result = await client.propose($('question').value, { signal });
    if (signal.aborted) return;
    $('plan').value = JSON.stringify(result.plan, null, 2);
    $('review').open = true;
    status(
      'Proposal ready. Review its source place ID, radius and filters, then run the plan.',
    );
  } catch (error) {
    if (!signal.aborted) status(error.message);
  } finally {
    $('propose').disabled = false;
  }
});
$('benchmark').addEventListener('click', () => {
  $('benchmark').disabled = true;
  const frames = [],
    start = performance.now();
  const remove = viewer.scene.postRender.addEventListener(() =>
    frames.push(performance.now()),
  );
  const finish = (completed) => {
    remove();
    const elapsed = performance.now() - start,
      span = frames.length > 1 ? frames.at(-1) - frames[0] : 0;
    const metrics = {
      completed,
      duration_ms: elapsed,
      frames: frames.length,
      fps: span > 0 ? ((frames.length - 1) * 1000) / span : 0,
      canvas: [viewer.canvas.width, viewer.canvas.height],
      pixel_ratio: window.devicePixelRatio,
      layers: viewer.dataSources.length,
      facilities: records.size,
      workload: '3-second Canada camera flight, request-render Cesium',
    };
    $('render-metrics').textContent = JSON.stringify(metrics);
    $('globe').dataset.benchmark = JSON.stringify(metrics);
    $('benchmark').disabled = false;
  };
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(-96, 58, 6500000),
    duration: 3,
    complete: () => finish(true),
    cancel: () => finish(false),
  });
});
$('home').addEventListener('click', () => camera([-96, 58], 6500000));
$('cancel').addEventListener('click', () => {
  active?.abort();
  status('Query cancelled.');
});
$('feature-close').addEventListener('click', () => {
  $('inspection').hidden = true;
});
$('show-facilities').addEventListener('change', () => {
  facilities.show = $('show-facilities').checked;
  viewer.scene.requestRender();
});
$('show-countries').addEventListener('change', () => {
  countries.show = $('show-countries').checked;
  viewer.scene.requestRender();
});
$('show-buffer').addEventListener('change', () => {
  if (outline) outline.show = $('show-buffer').checked;
  viewer.scene.requestRender();
});
$('export').addEventListener('click', () => {
  if (!lastResult) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(lastResult, null, 2)], {
      type: 'application/json',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'earth-energy-evidence.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('securitypolicyviolation', (e) => {
  $('globe').dataset.policyError = `${e.violatedDirective}: ${e.blockedURI}`;
});
try {
  viewer = createApplicationViewer({
    container: $('globe'),
    creditContainer: $('credits'),
  });
  installEarthIdentity(viewer);
  installTrackpadPinchZoom(viewer);
  viewer.scene.renderError.addEventListener(() => {
    status('3D rendering failed. The headless spatial API remains available.');
  });
  camera([-96, 58], 6500000);
  const [bundle, reference, cities, state] = await Promise.all([
    client.request(`/v1/datasets/${catalog}/features`),
    client.request('/v1/datasets/natural-earth-countries/features'),
    client.request('/v1/datasets/natural-earth-places/features'),
    client.request('/v1/status'),
  ]);
  countries = await viewer.dataSources.add(
    prepareReferenceGeometry(
      await Cesium.GeoJsonDataSource.load(reference.data, {
        fill: color('#315d5b').withAlpha(0.9),
        stroke: color('#83b0bb').withAlpha(0.7),
        strokeWidth: 1,
      }),
    ),
  );
  facilities = new Cesium.CustomDataSource('WRI Canada');
  for (const f of bundle.data.features) {
    records.set(f.id, f);
    facilities.entities.add({
      id: f.id,
      position: Cesium.Cartesian3.fromDegrees(...f.geometry.coordinates, 150),
      point: {
        pixelSize: 5,
        color: color('#8ee3d4'),
        outlineColor: color('#0a111b'),
        outlineWidth: 1,
      },
    });
  }
  await viewer.dataSources.add(facilities);
  places = cities.data.features
    .filter((f) => f.properties.country === 'CAN')
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'en'));
  for (const f of places) {
    const option = document.createElement('option');
    option.value = f.id;
    option.textContent = f.properties.name;
    $('place').append(option);
  }
  $('place').value = 'ne-place-1173';
  $('benchmark').disabled = false;
  $('place').disabled = false;
  $('explore').disabled = false;
  $('run').disabled = false;
  $('layer-info').textContent =
    `${records.size} source facilities · ${places.length} Canadian reference places. Mint: catalog; amber: query matches. Countries are generalized references.`;
  $('ai-state').textContent = state.ai_enabled ? 'available' : 'off';
  $('propose').disabled = !state.ai_enabled;
  const click = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  click.setInputAction((e) => {
    const id = viewer.scene.pick(e.position)?.id?.id;
    if (records.has(id)) inspect(id);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  let frames = 0;
  viewer.scene.postRender.addEventListener(() => {
    frames++;
    if (!$('globe').dataset.readyMs && viewer.scene.globe.tilesLoaded)
      $('globe').dataset.readyMs = (performance.now() - started).toFixed(1);
    $('globe').dataset.render = JSON.stringify({
      frames,
      size: [viewer.canvas.width, viewer.canvas.height],
      layers: viewer.dataSources.length,
      facilities: records.size,
    });
  });
  await run(
    plan('within_distance', {
      dataset: catalog,
      place_id: 'ne-place-1173',
      radius_m: 100000,
      fuels: [...RENEWABLE_FUELS],
      limit: 100,
    }),
  );
} catch (e) {
  status(
    `Workspace unavailable: ${e.message}. Headless tools remain available.`,
  );
}
