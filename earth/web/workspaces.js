// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { WorkspaceStore } from '../core/workspace.js';
import * as Cesium from 'cesium';
export function installWorkspaces({
  viewer,
  client,
  application,
  status,
  capture,
  restore,
}) {
  const panel = document.createElement('details');
  panel.id = 'saved-workspaces';
  panel.innerHTML =
    '<summary>Spatial workspaces · saved on this device</summary><label>Workspace title<input id="ws-title" maxlength="120" value="My Earth workspace" /></label><label>Notes<textarea id="ws-notes" maxlength="10000" rows="2"></textarea></label><label>Saved workspaces<select id="ws-list" aria-label="Saved workspaces"></select></label><div class="workspace-actions"><button id="ws-new">New</button><button id="ws-save">Save</button><button id="ws-open">Open</button><button id="ws-copy">Duplicate</button><button id="ws-export">Export</button><button id="ws-delete">Delete</button></div><label class="hint">Import workspace JSON<input id="ws-import" type="file" accept="application/json,.json" /></label><p class="hint">Up to five documents. No account required. Export a backup; browser storage can be cleared. Imported plans require review and never run automatically.</p>';
  document.querySelector('main > aside').append(panel);
  const $ = (id) => panel.querySelector('#' + id),
    store = new WorkspaceStore(localStorage);
  let current = null;
  const refresh = () => {
    const selected = $('ws-list').value;
    $('ws-list').replaceChildren();
    for (const w of store.list().filter((w) => w.application === application)) {
      const option = document.createElement('option');
      option.value = w.id;
      option.textContent = w.title;
      $('ws-list').append(option);
    }
    $('ws-list').value =
      current || selected || $('ws-list').options[0]?.value || '';
  };
  const camera = () => {
    const c = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
    return {
      longitude: Cesium.Math.toDegrees(c.longitude),
      latitude: Cesium.Math.toDegrees(c.latitude),
      height: Math.max(0, c.height),
      heading: viewer.camera.heading,
      pitch: viewer.camera.pitch,
      roll: viewer.camera.roll,
    };
  };
  const action = (fn) => async () => {
    try {
      await fn();
      refresh();
    } catch (e) {
      status(`Workspace: ${e.message}`);
    }
  };
  $('ws-new').onclick = action(() => {
    current = null;
    $('ws-title').value = 'New Earth workspace';
    $('ws-notes').value = '';
    status('New local document. Save the current view when ready.');
  });
  $('ws-save').onclick = action(async () => {
    const { layers } = await client.layers();
    const state = capture();
    const now = new Date().toISOString(),
      old = current ? store.open(current) : null;
    const w = store.save({
      schema_version: 1,
      id: current || crypto.randomUUID(),
      title: $('ws-title').value,
      notes: $('ws-notes').value,
      application,
      created_at: old?.created_at || now,
      updated_at: now,
      camera: camera(),
      layers: layers.map((l) => ({
        id: l.id,
        version: l.version,
        visible: state.visibleLayers?.includes(l.id) ?? true,
      })),
      selected_features: state.selected ?? old?.selected_features ?? [],
      temporal_range: state.interval ?? old?.temporal_range ?? null,
      plan: state.plan ?? old?.plan ?? null,
      receipt: state.receipt ?? old?.receipt ?? null,
      provenance: state.provenance
        ? [state.provenance]
        : (old?.provenance ?? []),
      saved_views: old?.saved_views ?? [],
    });
    current = w.id;
    status('Workspace saved on this device. Export to keep a portable backup.');
  });
  $('ws-open').onclick = action(async () => {
    const w = store.open($('ws-list').value),
      { layers } = await client.layers();
    if (
      w.layers.some(
        (l) => !layers.some((d) => d.id === l.id && d.version === l.version),
      )
    )
      throw new Error('Saved dataset versions are unavailable.');
    await restore(w);
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        w.camera.longitude,
        w.camera.latitude,
        w.camera.height,
      ),
      orientation: {
        heading: w.camera.heading,
        pitch: w.camera.pitch,
        roll: w.camera.roll,
      },
    });
    viewer.scene.requestRender();
    current = w.id;
    $('ws-title').value = w.title;
    $('ws-notes').value = w.notes;
    status('Workspace opened. Review the saved plan before running it.');
  });
  $('ws-copy').onclick = action(() => {
    const w = store.duplicate(
      $('ws-list').value,
      $('ws-title').value + ' copy',
    );
    current = w.id;
    $('ws-title').value = w.title;
    status('Workspace duplicated.');
  });
  $('ws-delete').onclick = action(() => {
    store.delete($('ws-list').value);
    current = null;
    status('Local workspace deleted. Exported files are unaffected.');
  });
  $('ws-export').onclick = action(() => {
    const url = URL.createObjectURL(
      new Blob([store.export($('ws-list').value)], {
        type: 'application/json',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finalverse-earth-workspace.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('ws-import').onchange = action(async () => {
    const f = $('ws-import').files[0];
    if (!f) return;
    if (f.size > 1024 * 1024) throw new Error('Import exceeds 1 MiB.');
    const w = store.import(await f.text());
    if (w.application !== application) {
      status(
        `Imported for the ${w.application} workspace. Open that application to review it.`,
      );
      return;
    }
    current = w.id;
    status('Workspace imported. Open it to review; no query has executed.');
  });
  try {
    refresh();
  } catch (e) {
    status('Local workspace storage unavailable: ' + e.message);
  }
}
