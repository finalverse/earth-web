// Pure view-model regression: no browser, network or graphical automation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

test('export creates a separate view with selection/camera and unchanged source evidence', async () => {
  const elements = new Map();
  const element = () => ({
    children: [],
    value: '',
    setAttribute() {},
    replaceChildren() {
      this.children = [];
    },
    append(child) {
      this.children.push(child);
    },
    click() {},
  });
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element,
  };
  const fixture = {
    schema_version: 1,
    id: 'original-spatial-artifact',
    application: 'finalverse.energy-explorer',
    title: 'Synthetic contract fixture',
    selected_features: [],
    camera: { longitude: -73.5, latitude: 45.5, height: 560000 },
    receipt: { execution_id: 'synthetic-receipt' },
    application_state: {
      result: {
        receipt: { execution_id: 'synthetic-receipt' },
        data: {
          total: 1,
          features: [
            {
              id: 'synthetic-facility',
              geometry: { type: 'Point', coordinates: [-73.5, 45.5] },
              properties: { name: 'Synthetic fixture', fuel: 'Hydro' },
            },
          ],
        },
      },
    },
  };
  let captured;
  const context = vm.createContext({
    document,
    window: { addEventListener() {}, matchMedia: () => ({ matches: true }) },
    fixture,
    structuredClone,
    crypto: webcrypto,
    Blob,
    URL: {
      createObjectURL(blob) {
        captured = blob;
        return 'blob:unit-fixture';
      },
      revokeObjectURL() {},
    },
    Cesium: {
      Cartesian3: { fromDegrees: (...args) => args },
      Math: { toDegrees: (r) => (r * 180) / Math.PI },
    },
    mockViewer: {
      camera: {
        positionCartographic: {
          longitude: (-73.5 * Math.PI) / 180,
          latitude: (45.5 * Math.PI) / 180,
          height: 80000,
        },
        heading: 0,
        pitch: -Math.PI / 2,
        roll: 0,
        flyTo() {},
      },
    },
  });
  vm.runInContext(
    await readFile(new URL('./web/app.js', import.meta.url), 'utf8'),
    context,
  );
  vm.runInContext('render(fixture); viewer=mockViewer;', context);
  elements.get('facilities').children[0].onclick();
  elements.get('export').onclick();
  const copy = JSON.parse(await captured.text());
  assert.notEqual(copy.id, fixture.id);
  assert.deepEqual(copy.selected_features, ['synthetic-facility']);
  assert.equal(copy.camera.height, 80000);
  assert.ok(Math.abs(copy.camera.longitude + 73.5) < 1e-9);
  assert.deepEqual(copy.receipt, fixture.receipt);
  assert.deepEqual(
    copy.application_state.result,
    fixture.application_state.result,
  );
  assert.deepEqual(fixture.selected_features, []);
  assert.equal(fixture.camera.height, 560000);
});
