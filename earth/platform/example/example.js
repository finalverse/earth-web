import { EarthClient, createApplicationRuntime } from './sdk/index.js';
const $ = (id) => document.getElementById(id);
$('run').onclick = async () => {
  $('run').disabled = true;
  $('status').textContent = 'Checking real API, package and local persistence…';
  try {
    const manifest = await (await fetch('/manifest.json')).json(),
      client = new EarthClient({
        endpoint: location.origin,
        applicationId: manifest.id,
      }),
      runtime = createApplicationRuntime(manifest, {
        client,
        storage: localStorage,
      });
    const granted = await runtime.start(),
      places = await client.places.search('Montréal'),
      place = places.data.features.find(
        (f) => f.properties.name === 'Montréal',
      );
    if (!place) throw new Error('Montréal source record unavailable.');
    const result = await client.spatial.withinRadius({
        dataset: 'wri-canada-power-plants',
        place_id: place.id,
        radius_m: 100000,
        fuels: [
          'Biomass',
          'Geothermal',
          'Hydro',
          'Solar',
          'Wave and Tidal',
          'Wind',
        ],
        limit: 100,
      }),
      time = await client.temporal.query('features_during_interval', {
        dataset: 'usgs-ridgecrest-2019',
        start: '2019-07-04T00:00:00Z',
        end: '2019-07-08T00:00:00Z',
      });
    if (result.data.total !== 24 || time.data.total !== 90)
      throw new Error('Pinned source result changed.');
    const store = runtime.workspaces(),
      now = new Date().toISOString();
    store.save({
      schema_version: 1,
      id: 'sdk-browser-gate',
      title: 'SDK browser acceptance',
      notes: 'SDK package smoke',
      application: manifest.id,
      created_at: now,
      updated_at: now,
      camera: {
        longitude: -73.57,
        latitude: 45.5,
        height: 100000,
        heading: 0,
        pitch: -1,
        roll: 0,
      },
      layers: granted.datasets.map((id) => ({
        id,
        version: 'source references in receipt',
        visible: true,
      })),
      selected_features: result.data.features.map((f) => f.id),
      temporal_range: null,
      plan: result.plan,
      receipt: result.receipt,
      provenance: [result.provenance],
      saved_views: [],
    });
    const exported = store.export('sdk-browser-gate'),
      imported = store.import(exported),
      reopened = client.workspaces
        .local(manifest.id, localStorage)
        .open(imported.id);
    if (
      reopened.receipt.plan_sha256 !== result.receipt.plan_sha256 ||
      reopened.notes !== 'SDK package smoke'
    )
      throw new Error('Workspace evidence mismatch.');
    $('status').textContent =
      'PASS · 24 facilities · 90 events · workspace reopened';
    $('evidence').textContent = JSON.stringify(
      {
        package: '@finalverse/earth',
        application: manifest.id,
        capabilities: granted.capabilities,
        source_place: place.id,
        facility_count: result.data.total,
        archive_count: time.data.total,
        receipt: result.receipt,
        request_id: result.request_id,
        workspace_receipt: reopened.receipt.plan_sha256,
        notes: reopened.notes,
      },
      null,
      2,
    );
    document.body.dataset.acceptance = 'passed';
  } catch (e) {
    $('status').textContent = 'FAIL · ' + e.message;
    $('evidence').textContent = JSON.stringify(
      { code: e.code, cause: e.cause?.message },
      null,
      2,
    );
    document.body.dataset.acceptance = 'failed';
  } finally {
    $('run').disabled = false;
  }
};
