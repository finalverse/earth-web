import { installEarthIdentity } from './identity.js';
// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import './style.css';
import * as Cesium from 'cesium';
import {
  createApplicationViewer,
  installTrackpadPinchZoom,
} from '../../src/app/viewer.js';
import { EarthClient } from '../sdk.js';
import { prepareReferenceGeometry } from './geometry.js';
const $ = (id) => document.getElementById(id),
  client = new EarthClient(location.origin);
let viewer, selection, lastResult, active;
const startupTime = performance.now();
const status = (text) => {
  $('status').textContent = text;
};
window.addEventListener('securitypolicyviolation', (event) => {
  $('globe').dataset.policyError =
    `${event.violatedDirective}: ${event.blockedURI}`;
});
const plan = (tool, args) => ({ schema_version: 1, tool, arguments: args });
const home = () => {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-40, 28, 23000000),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
  });
  viewer.scene.requestRender();
};
function inspect(feature) {
  $('inspection').hidden = false;
  $('feature-name').textContent = feature.properties.name;
  $('feature-info').textContent =
    `${feature.properties.iso || 'Map unit'} · ${feature.properties.type}. Generalized Natural Earth reference geometry, not a live observation.`;
}
async function display(result, signal) {
  $('result-title').textContent = result.summary;
  $('result-info').textContent =
    `${result.elapsed_ms.toFixed(2)} ms in the core · ${result.data.total ?? result.data.features?.length ?? 1} result(s)`;
  $('provenance').textContent = JSON.stringify(
    result.provenance || result.data.layers,
    null,
    2,
  );
  $('rows').replaceChildren();
  if (selection) {
    viewer.dataSources.remove(selection, true);
    selection = null;
  }
  if (result.data.type === 'FeatureCollection') {
    const data = await Cesium.GeoJsonDataSource.load(result.data, {
      fill: Cesium.Color.fromCssColorString('#8ee3d4').withAlpha(0.68),
      stroke: Cesium.Color.fromCssColorString('#c3fff4'),
      strokeWidth: 2,
      clampToGround: false,
    });
    if (signal.aborted) {
      data.destroy?.();
      return;
    }
    selection = await viewer.dataSources.add(prepareReferenceGeometry(data));
    for (const f of result.data.features) {
      const button = document.createElement('button');
      button.textContent = `${f.properties.name} · ${f.properties.iso || 'Map unit'}`;
      button.addEventListener('click', () => {
        inspect(f);
        const entity = data.entities.getById(String(f.id));
        if (entity) viewer.flyTo(entity, { duration: 1.1 });
      });
      $('rows').append(button);
    }
    if (result.data.features.length === 1)
      viewer.flyTo(data, { duration: 1.2 });
  } else {
    const pre = document.createElement('pre');
    pre.className = 'result-code';
    pre.textContent = JSON.stringify(result.data, null, 2);
    $('rows').append(pre);
  }
  if (signal.aborted) return;
  lastResult = result;
  $('export').disabled = false;
  status(
    `${result.summary}. Source and method are available in the evidence panel.`,
  );
}
async function run(p) {
  active?.abort();
  active = new AbortController();
  const signal = active.signal;
  $('plan').value = JSON.stringify(p, null, 2);
  status('Running validated spatial query…');
  try {
    await display(await client.query(p, { signal }), signal);
  } catch (error) {
    if (!signal.aborted) status(error.message);
  }
}
$('search').addEventListener('submit', (e) => {
  e.preventDefault();
  run(
    plan('search_features', {
      dataset: 'natural-earth-countries',
      query: $('query').value,
      limit: 20,
    }),
  );
});
$('ai').addEventListener('submit', async (e) => {
  e.preventDefault();
  active?.abort();
  active = new AbortController();
  const signal = active.signal;
  status('Asking the local model for a read-only plan…');
  try {
    const value = await client.propose($('question').value, { signal });
    $('plan').value = JSON.stringify(value.plan, null, 2);
    $('plan').closest('details').open = true;
    status(
      'AI proposal ready. Review the typed plan, then select Run reviewed plan.',
    );
  } catch (error) {
    if (!signal.aborted) status(error.message);
  }
});
$('run').addEventListener('click', () => {
  try {
    run(JSON.parse($('plan').value));
  } catch {
    status('Enter a valid JSON query plan.');
  }
});
$('point').addEventListener('click', () =>
  run(
    plan('contains_point', {
      dataset: 'natural-earth-countries',
      point: [-75.7, 45.4],
      limit: 20,
    }),
  ),
);
$('distance').addEventListener('click', () =>
  run(plan('measure_distance', { from: [0, 0], to: [90, 0] })),
);
$('ecef').addEventListener('click', () =>
  run(
    plan('transform_coordinates', {
      position: [0, 0, 0],
      from: 'EPSG:4979',
      to: 'EPSG:4978',
    }),
  ),
);
$('home').addEventListener('click', () => {
  if (viewer) home();
});
$('cancel').addEventListener('click', () => {
  active?.abort();
  status('Query cancelled.');
});
$('feature-close').addEventListener('click', () => {
  $('inspection').hidden = true;
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
  a.download = 'finalverse-earth-result.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
try {
  viewer = createApplicationViewer({
    container: $('globe'),
    creditContainer: $('credits'),
  });
  installEarthIdentity(viewer);
  installTrackpadPinchZoom(viewer);
  viewer.scene.globe.show = true;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#142f47');
  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Infinity;
  let renderedFrames = 0,
    lastMetricTime = 0;
  viewer.scene.postRender.addEventListener(() => {
    renderedFrames++;
    const ready =
      viewer.scene.globe.tilesLoaded && viewer.dataSources.length > 0;
    if (ready && !$('globe').dataset.readyMs)
      $('globe').dataset.readyMs = (performance.now() - startupTime).toFixed(1);
    if (
      performance.now() - lastMetricTime > 1000 ||
      (ready && renderedFrames < 30)
    ) {
      $('globe').dataset.render = JSON.stringify({
        frames: renderedFrames,
        tiles_loaded: viewer.scene.globe.tilesLoaded,
        size: [viewer.canvas.width, viewer.canvas.height],
        layers: viewer.dataSources.length,
      });
      lastMetricTime = performance.now();
    }
  });
  viewer.scene.globe.credit = new Cesium.Credit(
    'Made with Natural Earth · Public domain · WGS84 reference',
  );
  viewer.scene.renderError.addEventListener(() =>
    status(
      'The 3D renderer encountered an error. Headless tools remain available.',
    ),
  );
  home();
  const [metadata, bundle, state, worlds] = await Promise.all([
    client.layers(),
    client.request('/v1/datasets/natural-earth-countries/features'),
    client.request('/v1/status'),
    client.request('/v1/worlds'),
  ]);
  const layer = metadata.layers[0];
  $('layer-info').textContent =
    `${layer.feature_count} map units · version ${layer.version.slice(0, 8)}`;
  const map = await Cesium.GeoJsonDataSource.load(bundle.data, {
    fill: Cesium.Color.fromCssColorString('#3a786f').withAlpha(0.9),
    stroke: Cesium.Color.fromCssColorString('#83b0bb').withAlpha(0.65),
    strokeWidth: 1,
    clampToGround: false,
  });
  await viewer.dataSources.add(prepareReferenceGeometry(map));
  const click = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  click.setInputAction((event) => {
    const picked = viewer.scene.pick(event.position),
      id = picked?.id;
    if (id?.properties) {
      const p = id.properties.getValue(Cesium.JulianDate.now());
      inspect({ properties: p });
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  $('ai-state').textContent = state.ai_enabled ? 'available' : 'off';
  $('ai-state').dataset.enabled = String(state.ai_enabled);
  $('propose').disabled = !state.ai_enabled;
  $('plan').value = JSON.stringify(
    plan('search_features', { dataset: layer.id, query: 'Canada', limit: 20 }),
    null,
    2,
  );
  $('find').disabled = false;
  $('run').disabled = false;
  if (worlds.worlds.length) {
    $('worlds').hidden = false;
    for (const world of worlds.worlds) {
      const a = document.createElement('a');
      a.href = world.entry_url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `${world.title} ↗`;
      $('destinations').append(a);
    }
  }
  status(
    'Ready · drag to orbit, scroll to zoom, click a country to inspect. No account or cloud service required.',
  );
} catch (error) {
  status(
    `Workspace unavailable: ${error.message}. Try the headless API or check WebGL support.`,
  );
}
