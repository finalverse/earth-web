// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import * as Cesium from 'cesium';

// Natural Earth's polar closure vertices reach ±90°. Cesium's rhumb-line
// subdivision is singular at a pole. Use its geodesic tessellator for display;
// never alter the authoritative source/query coordinates to hide the issue.
export function prepareReferenceGeometry(dataSource) {
  for (const entity of dataSource.entities.values) {
    if (entity.polygon) entity.polygon.arcType = Cesium.ArcType.GEODESIC;
    if (entity.polyline) entity.polyline.arcType = Cesium.ArcType.GEODESIC;
  }
  return dataSource;
}
