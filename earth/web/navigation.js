import * as Cesium from 'cesium';
import {
  createNavigationController,
  resolveWebResource,
  destinationLabel,
  serializeDestination,
} from './navigation-controller.js';
import './navigation.css';
export function installCoreNavigation({ viewer, status }) {
  const panel = document.createElement('section');
  panel.className = 'earth-navigation';
  panel.setAttribute('aria-label', 'Explore a place');
  panel.innerHTML = `<h2>Go to a place</h2><form id="earth-navigation-form"><label for="earth-destination">Coordinates or entity address</label><input id="earth-destination" maxlength="512" value="geo:45.5088,-73.554,28" aria-describedby="earth-navigation-help" required><p id="earth-navigation-help" class="hint">Use geo:latitude,longitude or a USAP entity address.</p><div class="earth-navigation-actions"><button type="submit">Go</button><button type="button" id="earth-navigation-back">Back</button><button type="button" id="earth-navigation-share" disabled>Copy destination</button></div></form><button type="button" id="earth-navigation-montreal">Explore Montréal</button><p id="earth-navigation-state" role="status" aria-live="polite">Globe context is available. Detailed city terrain is not connected.</p><div id="earth-navigation-details" hidden><h3 id="earth-navigation-title"></h3><p id="earth-navigation-source"></p><dl id="earth-navigation-metadata"></dl><p id="earth-navigation-worlds"></p></div>`;
  document.querySelector('aside').append(panel);
  const $ = (id) => panel.querySelector(`#${id}`);
  let marker, current;
  const state = (text) => {
    $('earth-navigation-state').textContent = text;
  };
  function inspect(result) {
    current = result;
    $('earth-navigation-details').hidden = false;
    $('earth-navigation-title').textContent = destinationLabel(result);
    $('earth-navigation-source').textContent =
      result.resource?.provenance ??
      'Geographic anchor only. The surrounding Natural Earth map is generalized public-domain context; no terrain or building survey is loaded.';
    const metadata = $('earth-navigation-metadata');
    metadata.replaceChildren();
    const r = result.resource;
    for (const [name, value] of [
      [
        'Location',
        `${result.anchor.latitude_degrees}, ${result.anchor.longitude_degrees}`,
      ],
      [
        'Elevation',
        `${result.anchor.height_metres} m above the WGS84 ellipsoid`,
      ],
      ...(r
        ? [
            ['Identity', r.address],
            [
              'Version',
              r.representations[0]?.publication.version ?? 'No publication',
            ],
            ['Access', r.access.visibility],
          ]
        : []),
    ]) {
      const term = document.createElement('dt'),
        description = document.createElement('dd');
      term.textContent = name;
      description.textContent = value;
      metadata.append(term, description);
    }
    $('earth-navigation-worlds').textContent = r?.external_bindings.length
      ? 'World references are available. Entry requires an authenticated Finalverse client; this browser does not grant admission.'
      : 'No persistent world entry is available for this destination.';
    $('earth-navigation-share').disabled = false;
  }
  const controller = createNavigationController({
    resolve: resolveWebResource,
    render: async (result, signal) => {
      if (signal.aborted) return;
      if (marker) viewer.entities.remove(marker);
      marker = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          result.anchor.longitude_degrees,
          result.anchor.latitude_degrees,
          result.anchor.height_metres,
        ),
        point: {
          pixelSize: 12,
          color: Cesium.Color.AQUAMARINE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: destinationLabel(result),
          font: '14px sans-serif',
          pixelOffset: new Cesium.Cartesian2(0, -24),
          showBackground: true,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      marker.addProperty('earthCoreResult');
      marker.earthCoreResult = result;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const view = {
        destination: Cesium.Cartesian3.fromDegrees(
          result.anchor.longitude_degrees,
          result.anchor.latitude_degrees,
          Math.max(result.anchor.height_metres + 3000, 3000),
        ),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      };
      if (reduced) viewer.camera.setView(view);
      else viewer.camera.flyTo({ ...view, duration: 1.2 });
      viewer.scene.requestRender();
      inspect(result);
    },
  });
  async function go(input) {
    const started = performance.now();
    state('Finding your destination…');
    try {
      const result = await controller.navigate(input);
      $('earth-destination').value = serializeDestination(result.destination);
      state(
        result.resource
          ? 'Place details loaded. Geographic context is available; this publication is not rendered.'
          : 'Arrived at the geographic anchor. Detailed city terrain is not connected.',
      );
      panel.dataset.navigationMs = (performance.now() - started).toFixed(1);
      panel.dataset.ready = 'true';
    } catch (error) {
      if (error.name !== 'AbortError') {
        state(error.message);
        status(error.message);
      }
    }
  }
  $('earth-navigation-form').addEventListener('submit', (event) => {
    event.preventDefault();
    go($('earth-destination').value);
  });
  $('earth-navigation-montreal').addEventListener('click', () =>
    go('geo:45.5088,-73.554,28'),
  );
  $('earth-navigation-back').addEventListener('click', async () => {
    try {
      const r = await controller.back();
      if (r) {
        $('earth-destination').value = serializeDestination(r.destination);
        state('Returned to your previous destination.');
      } else state('No previous destination.');
    } catch (error) {
      state(error.message);
    }
  });
  $('earth-navigation-share').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(
        serializeDestination(current.destination),
      );
      state('Destination copied. Sharing it does not grant access.');
    } catch {
      state('Select and copy the destination field to share this place.');
      $('earth-destination').select();
    }
  });
  return { inspect };
}
