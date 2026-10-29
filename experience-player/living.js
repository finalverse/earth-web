// Presentation of MutSea replicas. No client or FEN-owned world simulation.
const $ = (id) => document.getElementById(id);
export function mountLiving(host) {
  const lifetime = new AbortController();
  let attachment,
    invite,
    placement,
    projection,
    timer,
    polling = false,
    disposed = false,
    generation = 0,
    connected = false,
    earth = false,
    countries = [],
    countryCount = 0,
    earthBody,
    globeMarker,
    lastRevision = 0;
  const markers = new Map(),
    samples = [],
    events = [];
  const say = (s) => {
    $('live-status').textContent = s;
    host.diagnostics();
  };
  const note = (s) => {
    $('lumi-response').textContent = s;
  };
  function record(action, start, result) {
    const e = { action, ms: performance.now() - start, result };
    samples.push(e);
    if (samples.length > 120) samples.shift();
    host.diagnostics();
  }
  async function api(action, body = {}, auth = true) {
    const epoch = generation;
    const r = await fetch('/api/v1/living/' + action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth && attachment
          ? { Authorization: 'Bearer ' + attachment.token }
          : {}),
      },
      body: JSON.stringify(body),
      signal: lifetime.signal,
    });
    const v = await r.json();
    if (auth && epoch !== generation) {
      const e = new Error('Obsolete live request');
      e.name = 'AbortError';
      throw e;
    }
    if (!r.ok) throw Error(v.message || 'Live world unavailable');
    return v;
  }
  function on(id, fn) {
    $(id).addEventListener('click', () => void run(fn), {
      signal: lifetime.signal,
    });
  }
  async function run(fn) {
    try {
      await fn();
    } catch (e) {
      if (!disposed && e.name !== 'AbortError') say(e.message);
    }
  }
  function viewPosition(p) {
    return new Cesium.Cartesian3(p[0] - 4096, p[2], p[1] - 4096);
  }
  function placeMarker(key, entity, color, label) {
    if (!entity || !host.viewer()) return;
    const v = host.viewer();
    const pos = Cesium.Matrix4.multiplyByPoint(
      host.frame(),
      viewPosition(entity.transform.position),
      new Cesium.Cartesian3(),
    );
    let marker = markers.get(key);
    if (!marker) {
      const previous = { value: pos, target: pos, started: performance.now() };
      marker = v.entities.add({
        id: 'living-' + key,
        position: new Cesium.CallbackPositionProperty(() => {
          const t = Math.min(1, (performance.now() - previous.started) / 120);
          if (t < 1) v.scene.requestRender();
          return Cesium.Cartesian3.lerp(
            previous.value,
            previous.target,
            t,
            new Cesium.Cartesian3(),
          );
        }, false),
        point: {
          pixelSize: label === 'Lumi' ? 15 : 11,
          color: Cesium.Color.fromCssColorString(color),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Infinity,
        },
        label: {
          text: label,
          font: '13px sans-serif',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#13232edc'),
          pixelOffset: new Cesium.Cartesian2(
            0,
            label.startsWith('Festival beacon') ? 25 : -25,
          ),
          disableDepthTestDistance: Infinity,
        },
      });
      marker._interpolation = previous;
      markers.set(key, marker);
    } else {
      const p = marker._interpolation;
      p.value = marker.position.getValue(Cesium.JulianDate.now());
      p.target = pos;
      p.started = performance.now();
    }
    marker.show = !earth;
  }
  function present(v) {
    projection = v;
    lastRevision = v.revision;
    const expected = new Set();
    for (const p of v.participants) {
      const key = p.actor_id;
      expected.add(key);
      placeMarker(
        key,
        p.entity,
        p.actor_id === attachment.actor_id ? '#8fe3d1' : '#b6b9ff',
        p.actor_id === attachment.actor_id ? 'You' : 'Visitor',
      );
    }
    expected.add(v.lumi.id);
    placeMarker(v.lumi.id, v.lumi_entity, '#ffce8c', 'Lumi');
    const beaconGroups = new Map();
    for (const b of v.beacons) {
      const key = b.transform.position.join(',');
      const group = beaconGroups.get(key) || { entity: b, count: 0 };
      group.count++;
      beaconGroups.set(key, group);
    }
    for (const [position, { entity, count }] of beaconGroups) {
      const key = 'beacons-' + position;
      expected.add(key);
      placeMarker(
        key,
        entity,
        '#ffd578',
        count === 1 ? 'Festival beacon' : `Festival beacons · ${count}`,
      );
    }
    for (const [key, m] of markers)
      if (!expected.has(key)) {
        host.viewer()?.entities.remove(m);
        markers.delete(key);
      }
    $('live-people').textContent =
      v.participants.length +
      ' exploring · ' +
      v.beacons.length +
      ' shared beacons';
    const remote = v.participants.find(
      (p) => p.actor_id !== attachment.actor_id && p.selected,
    );
    $('live-selection').textContent = remote
      ? 'Visitor is exploring ' +
        (host
          .scene()
          .entities.find((e) => e.entity.entity_id === remote.selected)
          ?.label || 'a place')
      : '';
    host.viewer()?.scene.requestRender();
    host.diagnostics();
  }
  async function poll() {
    if (!attachment || !connected || polling || disposed) return;
    polling = true;
    const epoch = generation;
    try {
      const v = await api('snapshot');
      if (epoch === generation && connected && !disposed) present(v);
    } catch (e) {
      if (epoch !== generation || disposed) return;
      connected = false;
      clearInterval(timer);
      timer = null;
      for (const m of markers.values()) host.viewer()?.entities.remove(m);
      markers.clear();
      projection = null;
      say(e.message + ' · Reconnect when ready.');
    } finally {
      if (epoch === generation) polling = false;
    }
  }
  async function join(instance, invitation, owner_claim) {
    const start = performance.now();
    attachment = await api(
      'join',
      { instance, invitation, owner_claim },
      false,
    );
    generation++;
    polling = false;
    connected = true;
    invite = { instance, invitation };
    $('live-start').hidden = true;
    $('live-join').hidden = true;
    $('live-actions').hidden = false;
    $('live-end').hidden = !attachment.owner;
    const url = new URL(location.href);
    url.hash = 'live=' + instance + ':' + invitation;
    $('live-invite').value = url.href;
    // Invitation is an unlisted access capability. Remove it from the address bar after resolving.
    if (location.hash)
      history.replaceState(null, '', location.pathname + location.search);
    say(
      'Connected to Montréal Alive · your conversation with Lumi stays private.',
    );
    note(
      'I’m Lumi. Choose a building, then ask me about its source or let’s explore together.',
    );
    await poll();
    timer = setInterval(() => void poll(), 100);
    record('join', start, {
      session_id: attachment.session_id,
      world_session_id: attachment.world_session_id,
    });
  }
  async function start() {
    if (!placement)
      throw Error('A world owner must install this immutable edition first.');
    if (!$('live-consent').checked)
      throw Error('Confirm entry to the published live edition.');
    const r = await api(
      'create',
      { placement: placement.placement.placement_id },
      false,
    );
    await join(r.instance_id, r.invitation, r.owner_claim);
  }
  async function ask(action) {
    if (!connected) throw Error('Enter the live experience to meet Lumi.');
    const t = performance.now();
    const v = await api('lumi', {
      interaction: action,
      selected: host.selected()?.entity.entity_id || null,
    });
    note(v.response);
    $('lumi-approve').hidden = v.proposal !== 'festival_beacon';
    record('lumi_' + action, t, {
      provider: v.provider,
      source: v.source?.entity.entity_id || null,
    });
    if (action === 'tour') {
      if (host.selected()) host.focus(host.selected().entity.entity_id);
      else host.district();
    }
  }
  async function update(focus = false) {
    if (!connected) return;
    const s = host.selected();
    if (!s) return;
    const t = performance.now();
    const r = await api('update', {
      selected: s.entity.entity_id,
      interaction: focus ? 'focus' : 'select',
    });
    record('selection', t, r);
    await poll();
  }
  function leaveEarth() {
    if (!earth) return;
    earth = false;
    const v = host.viewer();
    if (v) {
      v.scene.requestRenderMode = true;
      v.scene.globe.show = false;
    }
    host.showDistrict(true);
    if (earthBody) earthBody.show = false;
    for (const c of countries) c.show = false;
    if (globeMarker) globeMarker.show = false;
    for (const m of markers.values()) m.show = true;
    $('snow').style.visibility = '';
    $('scale-status').textContent = 'Old Port · source-aligned district';
  }
  async function navigate(mode) {
    const v = host.viewer();
    if (!v) return;
    if (mode === 'district') leaveEarth();
    earth = mode !== 'district';
    v.scene.requestRenderMode = !earth;
    host.stopGuide();
    host.showDistrict(!earth);
    v.scene.globe.show = false;
    if (earth && !earthBody)
      earthBody = v.scene.primitives.add(
        new Cesium.Primitive({
          geometryInstances: new Cesium.GeometryInstance({
            geometry: new Cesium.EllipsoidGeometry({
              radii: new Cesium.Cartesian3(6378137, 6378137, 6356752.314245),
              vertexFormat:
                Cesium.PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
            }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                Cesium.Color.fromCssColorString('#22556a'),
              ),
            },
          }),
          appearance: new Cesium.PerInstanceColorAppearance({
            flat: true,
            translucent: false,
          }),
          asynchronous: false,
        }),
      );
    if (earthBody) earthBody.show = earth;
    for (const m of markers.values()) m.show = !earth;
    if (earth && !countries.length) {
      const r = await fetch('/countries.json', { signal: lifetime.signal });
      const j = await r.json();
      const outlines = [];
      for (const f of j.features)
        for (const poly of f.polygons) {
          const ring = poly[0];
          let x = 0,
            y = 0;
          const degrees = [];
          for (let i = 0; i + 1 < ring.length; i += 2) {
            x += ring[i];
            y += ring[i + 1];
            degrees.push(x / 1000, y / 1000, 15000);
          }
          if (degrees.length >= 9) {
            countryCount++;
            outlines.push(
              new Cesium.GeometryInstance({
                geometry: new Cesium.PolylineGeometry({
                  positions: Cesium.Cartesian3.fromDegreesArrayHeights(degrees),
                  width: 1,
                  vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT,
                  arcType: Cesium.ArcType.GEODESIC,
                }),
                attributes: {
                  color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                    Cesium.Color.fromCssColorString('#90c9ce'),
                  ),
                },
              }),
            );
          }
        }
      countries.push(
        v.scene.primitives.add(
          new Cesium.Primitive({
            geometryInstances: outlines,
            appearance: new Cesium.PolylineColorAppearance({
              translucent: false,
            }),
            asynchronous: false,
          }),
        ),
      );
      const o = host.scene().origin_microdegrees;
      globeMarker = v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(o[1] / 1e6, o[0] / 1e6, 25000),
        point: {
          pixelSize: 11,
          color: Cesium.Color.fromCssColorString('#ffd09a'),
          disableDepthTestDistance: Infinity,
        },
        label: {
          text: 'MONTRÉAL · ENTER THE EXPERIENCE',
          font: '13px sans-serif',
          pixelOffset: new Cesium.Cartesian2(0, -22),
          fillColor: Cesium.Color.WHITE,
        },
      });
    }
    for (const c of countries) c.show = earth;
    if (globeMarker) globeMarker.show = earth;
    $('scale-status').textContent = earth
      ? mode === 'earth'
        ? 'Earth · offline ellipsoid with Natural Earth boundaries'
        : 'Montréal · regional overview; district geometry loads at destination'
      : 'Old Port · source-aligned district';
    $('snow').style.visibility = earth ? 'hidden' : '';
    if (earth)
      v.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          -73.56,
          45.5,
          mode === 'earth' ? 19000000 : 100000,
        ),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
        duration: host.reducedMotion() ? 0 : 1.7,
      });
    else host.district();
    v.scene.requestRender();
    host.diagnostics();
  }
  on('scale-earth', () => navigate('earth'));
  on('scale-city', () => navigate('city'));
  on('scale-district', () => navigate('district'));
  on('live-start', start);
  on('live-join', async () => {
    const match = location.hash.match(/^#live=([a-z0-9-]+):([a-f0-9]{64})$/);
    if (!match) throw Error('Open a valid invitation link.');
    await join(match[1], match[2]);
  });
  on('lumi-talk', () => ask('welcome'));
  on('lumi-place', () => ask('place'));
  on('lumi-tour', () => ask('tour'));
  on('lumi-magic', () => ask('magical'));
  on('lumi-focus', async () => {
    if (host.selected()) {
      host.focus(host.selected().entity.entity_id);
    }
  });
  on('lumi-approve', async () => {
    const e = host.selected();
    if (!e) throw Error('Choose a source-backed place first.');
    const t = performance.now();
    const r = await api('beacon', {
      selected: e.entity.entity_id,
      approve: true,
    });
    record('authoritative_beacon', t, r);
    if (r.receipt?.outcome.status !== 'applied')
      throw Error('This world action was refused.');
    note(
      'Your festival beacon is committed in MutSea. Everyone in this world placement can see it.',
    );
    $('lumi-approve').hidden = true;
    await poll();
  });
  on('lumi-ai', async () => {
    const start = performance.now();
    $('lumi-ai').disabled = true;
    note(
      'Lumi is asking the configured local model for a private artistic suggestion…',
    );
    try {
      const v = await api('lumi-ai', {
        selected: host.selected()?.entity.entity_id || null,
      });
      note(
        'AI presentation suggestion · ' +
          v.response +
          ' Nothing has been applied.',
      );
      record('local_ai', start, { receipt: v.receipt, applied: v.applied });
    } finally {
      $('lumi-ai').disabled = false;
    }
  });
  on('live-copy', async () => {
    try {
      await navigator.clipboard.writeText($('live-invite').value);
      say('Invitation copied · anyone with this link can join until expiry.');
    } catch {
      $('live-invite').select();
      say('Copy the selected invitation.');
    }
  });
  on('live-disconnect', async () => {
    generation++;
    connected = false;
    polling = false;
    await api('disconnect');
    connected = false;
    clearInterval(timer);
    timer = null;
    say('Disconnected. Your bounded attachment can reconnect for 90 seconds.');
    $('live-people').textContent = 'Disconnected';
    $('live-selection').textContent = '';
    for (const m of markers.values()) host.viewer()?.entities.remove(m);
    markers.clear();
  });
  on('live-reconnect', async () => {
    const t = performance.now();
    const r = await api('reconnect');
    generation++;
    polling = false;
    connected = true;
    await poll();
    timer = setInterval(() => void poll(), 100);
    say('Reconnected · shared world state restored.');
    record('reconnect', t, r);
  });
  on('live-revoke', async () => {
    await api('revoke-beacon');
    say(
      'Shared action permission revoked for your attachment. Try a beacon to verify refusal.',
    );
  });
  on('live-end', async () => {
    generation++;
    connected = false;
    polling = false;
    await api('end');
    clearInterval(timer);
    timer = null;
    connected = false;
    attachment = null;
    projection = null;
    for (const m of markers.values()) host.viewer()?.entities.remove(m);
    markers.clear();
    $('live-actions').hidden = true;
    $('live-start').hidden = false;
    say(
      'Live instance ended · owned world connections and EK resources released.',
    );
  });
  void run(async () => {
    const r = await fetch('/api/v1/living', { signal: lifetime.signal });
    if (!r.ok) {
      say('Standalone edition · a live host is not configured.');
      return;
    }
    const v = await r.json();
    placement = v.installations.find(
      (i) => i.placement.experience.version === host.publication().version,
    );
    $('live-start').disabled = !placement;
    const invited = location.hash.startsWith('#live=');
    $('live-join').hidden = !invited;
    $('live-start').hidden = invited;
    say(
      placement
        ? 'One published experience · standalone here, installed in a persistent MutSea world.'
        : 'Standalone experience · no matching world installation.',
    );
  });
  return {
    selected: (focus = false) => void run(() => update(focus)),
    leaveEarth,
    snapshot: () => ({
      connected,
      earth,
      camera_height_metres: host.viewer()?.camera.positionCartographic.height,
      camera_frustum: host.viewer()
        ? {
            near: host.viewer().camera.frustum.near,
            far: host.viewer().camera.frustum.far,
            position: [
              host.viewer().camera.positionWC.x,
              host.viewer().camera.positionWC.y,
              host.viewer().camera.positionWC.z,
            ],
            direction: [
              host.viewer().camera.directionWC.x,
              host.viewer().camera.directionWC.y,
              host.viewer().camera.directionWC.z,
            ],
          }
        : null,
      geographic_boundaries: countryCount,
      instance_id: attachment?.instance_id || null,
      session_id: attachment?.session_id || null,
      world_session_id: attachment?.world_session_id || null,
      placement: placement?.placement || null,
      revision: lastRevision,
      participants:
        projection?.participants.map((p) => ({
          actor: p.actor_id,
          entity: p.entity.id,
          selected: p.selected,
          position: p.entity.transform.position,
        })) || [],
      beacons: projection?.beacons || [],
      character: projection?.lumi || null,
      markers: markers.size,
      timer_active: !!timer,
      measurements: samples,
      events,
      private_conversations_recorded: false,
      world_authority: 'MutSea',
    }),
    dispose: async () => {
      disposed = true;
      generation++;
      clearInterval(timer);
      timer = null;
      if (attachment && connected) {
        try {
          await fetch('/api/v1/living/disconnect', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + attachment.token,
            },
            body: '{}',
            keepalive: true,
          });
        } catch {}
      }
      lifetime.abort();
      attachment = null;
      connected = false;
      for (const m of [...markers.values(), globeMarker].filter(Boolean))
        host.viewer()?.entities.remove(m);
      for (const c of countries) host.viewer()?.scene.primitives.remove(c);
      if (earthBody) host.viewer()?.scene.primitives.remove(earthBody);
      markers.clear();
      countries = [];
    },
  };
}
