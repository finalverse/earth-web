// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { defaultDataset } from '../server/main.js';
import { prepareReferenceGeometry } from '../web/geometry.js';
test('polar source geometry tessellates with Cesium geodesics without changing dataset vertices', async () => {
  const dataset = await defaultDataset(),
    feature = dataset.features.find((f) => f.properties.name === 'Antarctica');
  assert.ok(feature);
  const before = JSON.stringify(feature.geometry);
  const entities = {
    values: [
      new Cesium.Entity({
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray([0, 0, 1, 0, 0, 1]),
          arcType: Cesium.ArcType.RHUMB,
        },
      }),
    ],
  };
  prepareReferenceGeometry({ entities });
  assert.equal(
    entities.values[0].polygon.arcType.getValue(),
    Cesium.ArcType.GEODESIC,
  );
  const [outer, ...holes] = feature.geometry.coordinates[0];
  const hierarchy = new Cesium.PolygonHierarchy(
    outer.map((p) => Cesium.Cartesian3.fromDegrees(...p)),
    holes.map(
      (r) =>
        new Cesium.PolygonHierarchy(
          r.map((p) => Cesium.Cartesian3.fromDegrees(...p)),
        ),
    ),
  );
  const geometry = Cesium.PolygonGeometry.createGeometry(
    new Cesium.PolygonGeometry({
      polygonHierarchy: hierarchy,
      arcType: Cesium.ArcType.GEODESIC,
      vertexFormat: Cesium.VertexFormat.POSITION_ONLY,
    }),
  );
  assert.ok(geometry?.attributes.position.values.length > 0);
  assert.equal(JSON.stringify(feature.geometry), before);
});
