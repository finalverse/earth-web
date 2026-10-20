// Only explicitly shared spatial artifacts enter this view. No private session API.
'use strict';
const $ = (id) => document.getElementById(id);
let viewer = null,
  workspace = null,
  selected = null;
if (window.Cesium) {
  window.CESIUM_BASE_URL = '/cesium/';
  viewer = new Cesium.Viewer('globe', {
    baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  });
  // This view uses no ion assets or services; retain the engine/data attribution below.
  Cesium.CreditDisplay.cesiumCredit = new Cesium.Credit(
    'Finalverse Earth',
    true,
  );
  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#17364a');
  viewer.scene.requestRenderMode = true;
  viewer.scene.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-73.56, 45.5, 2000000),
  });
}
function status(text) {
  $('status').textContent = text;
}
async function request(path, key) {
  const response = await fetch(path, {
    headers: { Authorization: 'Bearer ' + key },
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      'Share unavailable, expired or revoked. Create a new explicit spatial grant in Earth CLI.',
    );
  const raw = await response.text();
  if (raw.length > 2 * 1024 * 1024)
    throw new Error('Spatial artifact exceeds the view budget.');
  return JSON.parse(raw);
}
function render(value) {
  if (
    value?.schema_version !== 1 ||
    value.application !== 'finalverse.energy-explorer'
  )
    throw new Error('Incompatible spatial workspace.');
  const result = value.application_state?.result;
  const features = result?.data?.features;
  if (
    !Array.isArray(features) ||
    features.length > 100 ||
    result.receipt?.execution_id !== value.receipt?.execution_id
  )
    throw new Error('Invalid source snapshot or receipt.');
  for (const feature of features) {
    const point = feature.geometry?.coordinates;
    if (
      feature.geometry?.type !== 'Point' ||
      !Array.isArray(point) ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1]) ||
      Math.abs(point[0]) > 180 ||
      Math.abs(point[1]) > 90
    )
      throw new Error('Invalid source position.');
  }
  workspace = value;
  selected = value.selected_features?.[0] ?? null;
  $('title').textContent = value.title;
  $('summary').textContent =
    `${features.length} shown / ${result.data.total} matches. Archival reported capacity; current operation and live output are unverified.`;
  $('evidence').textContent = JSON.stringify(
    { plan: value.plan, receipt: value.receipt, provenance: value.provenance },
    null,
    2,
  );
  $('facilities').replaceChildren();
  if (viewer) viewer.entities.removeAll();
  for (const feature of features) {
    const name = String(feature.properties?.name ?? feature.id),
      point = feature.geometry.coordinates;
    if (viewer)
      viewer.entities.add({
        id: String(feature.id),
        position: Cesium.Cartesian3.fromDegrees(point[0], point[1]),
        point: {
          pixelSize: 9,
          color: Cesium.Color.fromCssColorString('#cbb0ff'),
          outlineColor: Cesium.Color.fromCssColorString('#f2efff'),
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    const button = document.createElement('button');
    button.textContent = `${name} · ${feature.properties?.fuel ?? 'source category'}`;
    button.setAttribute(
      'aria-pressed',
      String(selected === String(feature.id)),
    );
    button.onclick = () => {
      selected = String(feature.id);
      for (const other of $('facilities').children)
        other.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      $('caption').textContent = name + ' · original source position';
      if (viewer)
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(point[0], point[1], 80000),
          duration: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 0
            : 0.6,
        });
    };
    $('facilities').append(button);
  }
  if (viewer) {
    const c = value.camera;
    if (
      ![c?.longitude, c?.latitude, c?.height].every(Number.isFinite) ||
      Math.abs(c.longitude) > 180 ||
      Math.abs(c.latitude) > 90 ||
      c.height < 0 ||
      c.height > 1e9
    )
      throw new Error('Invalid saved camera.');
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        c.longitude,
        c.latitude,
        c.height,
      ),
      orientation: { heading: c.heading, pitch: c.pitch, roll: c.roll },
    });
    viewer.scene.requestRender();
  }
  $('caption').textContent = 'Restored CLI analysis · no query re-executed';
  $('export').disabled = false;
}
$('connect').onsubmit = async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  const key = $('key').value.trim();
  try {
    if (!/^[a-f0-9]{64}$/i.test(key))
      throw new Error(
        'Enter the spatial share key from the private CLI share file.',
      );
    status('Opening the explicitly shared snapshot…');
    const value = await request('/v1/browser/workspace', key);
    render(value);
    if (viewer) {
      try {
        const reference = await request('/v1/browser/reference', key);
        const source = await Cesium.GeoJsonDataSource.load(reference.data, {
          stroke: Cesium.Color.fromCssColorString('#648792'),
          fill: Cesium.Color.fromCssColorString('#254c50'),
          strokeWidth: 1,
        });
        for (const entity of source.entities.values) {
          if (entity.polygon)
            entity.polygon.arcType = new Cesium.ConstantProperty(
              Cesium.ArcType.GEODESIC,
            );
          if (entity.polyline)
            entity.polyline.arcType = new Cesium.ConstantProperty(
              Cesium.ArcType.GEODESIC,
            );
        }
        viewer.dataSources.removeAll();
        await viewer.dataSources.add(source);
        viewer.scene.requestRender();
        $('reference').textContent = JSON.stringify(
          { receipt: reference.receipt, provenance: reference.provenance },
          null,
          2,
        );
      } catch {
        $('reference').textContent =
          'Public reference context unavailable. Original facilities and analysis evidence remain visible.';
      }
    }
    const replay = await request('/v1/browser/events', key);
    if (
      !Array.isArray(replay.events) ||
      replay.events.some(
        (event) =>
          event.protocol_version !== '1.0' ||
          event.type !== 'workspace.updated',
      )
    )
      throw new Error('Incompatible shared event protocol.');
    $('event').textContent = JSON.stringify(replay, null, 2);
    $('key').value = '';
    status(
      viewer
        ? 'Shared workspace opened with its original protocol event, layer and provenance.'
        : 'Evidence opened. Configure bundled Cesium assets to enable the globe.',
    );
  } catch (error) {
    status(error.message);
  } finally {
    $('key').value = '';
    button.disabled = false;
  }
};
$('export').onclick = () => {
  if (!workspace) return;
  const copy = structuredClone(workspace);
  copy.id = crypto.randomUUID();
  copy.updated_at = new Date().toISOString();
  copy.selected_features = selected ? [selected] : [];
  if (viewer) {
    const c = viewer.camera,
      p = c.positionCartographic;
    copy.camera = {
      longitude: Cesium.Math.toDegrees(p.longitude),
      latitude: Cesium.Math.toDegrees(p.latitude),
      height: p.height,
      heading: c.heading,
      pitch: c.pitch,
      roll: c.roll,
    };
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(copy, null, 2)], {
      type: 'application/json',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'earth-intelligence-workspace.json';
  link.click();
  URL.revokeObjectURL(url);
  status(
    'Spatial JSON exported. Import it in Energy Explorer to keep a local copy.',
  );
};
window.addEventListener('pagehide', () => {
  $('key').value = '';
});
