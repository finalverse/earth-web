// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
// Application-specific adapter; the Earth SDK has no Cesium dependency.
import * as C from 'cesium';
import type { Camera, QueryResult, FeatureCollection } from '@finalverse/earth';
export class EnergyMap {
  readonly viewer: C.Viewer;
  private facilities = new C.CustomDataSource('Source facilities');
  private area = new C.CustomDataSource('Derived display filters');
  private selection: C.ScreenSpaceEventHandler;
  private outline: C.GeoJsonDataSource | null = null;
  lastRenderMs = 0;
  constructor(container: HTMLElement, onSelect: (id: string) => void) {
    this.viewer = new C.Viewer(container, {
      baseLayer: false,
      terrainProvider: new C.EllipsoidTerrainProvider(),
      geocoder: false,
      homeButton: false,
      baseLayerPicker: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      contextOptions: { webgl: { preserveDrawingBuffer: false } },
    });
    this.viewer.scene.globe.baseColor = C.Color.fromCssColorString('#132b3c');
    this.viewer.scene.backgroundColor = C.Color.fromCssColorString('#08101d');
    this.viewer.scene.globe.enableLighting = false;
    this.viewer.cesiumWidget.creditDisplay.addStaticCredit(
      new C.Credit(
        'CesiumJS (Apache 2.0) · Natural Earth (public domain) · WRI GPPD (CC BY 4.0)',
        true,
      ),
    );
    // No ion account, ion asset or ion service is used by this adapter.
    C.CreditDisplay.cesiumCredit = new C.Credit('Finalverse Earth', true);
    this.viewer.dataSources.add(this.facilities);
    this.viewer.dataSources.add(this.area);
    this.selection = new C.ScreenSpaceEventHandler(this.viewer.canvas);
    this.selection.setInputAction((e: { position: C.Cartesian2 }) => {
      const picked = this.viewer.scene.pick(e.position);
      if (picked?.id?.id && this.facilities.entities.contains(picked.id))
        onSelect(picked.id.id);
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    this.setCamera({
      longitude: -73.56,
      latitude: 45.5,
      height: 560000,
      heading: 0,
      pitch: -Math.PI / 2,
      roll: 0,
    });
  }
  async references(collection: FeatureCollection) {
    const source = await C.GeoJsonDataSource.load(collection, {
      stroke: C.Color.fromCssColorString('#526a78'),
      fill: C.Color.fromCssColorString('#213d43'),
      strokeWidth: 1,
    });
    // Geodesic display tessellation avoids rhumb singularities at source poles.
    for (const e of source.entities.values) {
      if (e.polygon)
        e.polygon.arcType = new C.ConstantProperty(C.ArcType.GEODESIC);
      if (e.polyline)
        e.polyline.arcType = new C.ConstantProperty(C.ArcType.GEODESIC);
    }
    await this.viewer.dataSources.add(source);
    this.render();
  }
  async show(
    result: QueryResult,
    buffer: FeatureCollection | null,
    fit = true,
  ) {
    this.facilities.entities.removeAll();
    this.area.entities.removeAll();
    if (this.outline) {
      this.viewer.dataSources.remove(this.outline, true);
      this.outline = null;
    }
    const data = result.data as {
      features: FeatureCollection['features'];
      clusters?: { feature_ids: string[] }[];
      analysis?: { center?: number[]; radius_m?: number };
    };
    const palette = [
      '#8ee3d4',
      '#c6a7ff',
      '#ffca86',
      '#85c9ff',
      '#e3b9cd',
      '#bee57c',
    ];
    data.features.forEach((f) => {
      const xy = f.geometry.coordinates as number[],
        index = Math.max(
          0,
          data.clusters?.findIndex((g) => g.feature_ids.includes(f.id)) ?? 0,
        );
      this.facilities.entities.add({
        id: f.id,
        name: String(f.properties.name),
        position: C.Cartesian3.fromDegrees(xy[0], xy[1], 100),
        point: {
          pixelSize: 9,
          color: C.Color.fromCssColorString(palette[index % palette.length]),
          outlineColor: C.Color.fromCssColorString('#08101d'),
          outlineWidth: 1,
          disableDepthTestDistance: Infinity,
        },
      });
    });
    if (buffer) {
      this.outline = await C.GeoJsonDataSource.load(buffer, {
        stroke: C.Color.fromCssColorString('#bda4ff'),
        strokeWidth: 2,
        fill: C.Color.fromCssColorString('#9a7bd4').withAlpha(0.1),
      });
      for (const e of this.outline.entities.values)
        if (e.polygon)
          e.polygon.arcType = new C.ConstantProperty(C.ArcType.GEODESIC);
      await this.viewer.dataSources.add(this.outline);
    }
    const center = data.analysis?.center;
    if (center) {
      this.area.entities.add({
        id: 'query-origin',
        position: C.Cartesian3.fromDegrees(center[0], center[1], 150),
        point: {
          pixelSize: 12,
          color: C.Color.WHITE,
          outlineColor: C.Color.fromCssColorString('#8ee3d4'),
          outlineWidth: 3,
        },
      });
      if (fit)
        this.setCamera({
          longitude: center[0],
          latitude: center[1],
          height: Math.max(70000, (data.analysis?.radius_m ?? 100000) * 5.6),
          heading: 0,
          pitch: -Math.PI / 2,
          roll: 0,
        });
    }
    if (data.features.length > 1) {
      const xy = data.features.map((f) => f.geometry.coordinates as number[]),
        w = Math.min(...xy.map((p) => p[0])),
        e = Math.max(...xy.map((p) => p[0])),
        s = Math.min(...xy.map((p) => p[1])),
        n = Math.max(...xy.map((p) => p[1]));
      this.area.entities.add({
        id: 'result-bounds',
        polyline: {
          positions: C.Cartesian3.fromDegreesArray([
            w,
            s,
            e,
            s,
            e,
            n,
            w,
            n,
            w,
            s,
          ]),
          width: 1,
          material: C.Color.WHITE.withAlpha(0.4),
          arcType: C.ArcType.GEODESIC,
        },
      });
    }
    this.render();
  }
  select(id: string) {
    for (const e of this.facilities.entities.values) {
      e.point!.pixelSize = new C.ConstantProperty(e.id === id ? 17 : 9);
      e.point!.outlineWidth = new C.ConstantProperty(e.id === id ? 3 : 1);
      e.point!.outlineColor = new C.ConstantProperty(
        e.id === id ? C.Color.WHITE : C.Color.fromCssColorString('#08101d'),
      );
    }
    this.render();
  }
  setLayerVisible(visible: boolean) {
    this.facilities.show = visible;
    this.area.show = visible;
    if (this.outline) this.outline.show = visible;
    this.render();
  }
  camera(): Camera {
    const c = this.viewer.camera;
    return {
      longitude: C.Math.toDegrees(c.positionCartographic.longitude),
      latitude: C.Math.toDegrees(c.positionCartographic.latitude),
      height: c.positionCartographic.height,
      heading: c.heading,
      pitch: c.pitch,
      roll: c.roll,
    };
  }
  setCamera(c: Camera) {
    this.viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(c.longitude, c.latitude, c.height),
      orientation: { heading: c.heading, pitch: c.pitch, roll: c.roll },
    });
    this.render();
  }
  private render() {
    const start = performance.now();
    const remove = this.viewer.scene.postRender.addEventListener(() => {
      this.lastRenderMs = performance.now() - start;
      remove();
    });
    this.viewer.scene.requestRender();
  }
  clear() {
    this.facilities.entities.removeAll();
    this.area.entities.removeAll();
    if (this.outline) {
      this.viewer.dataSources.remove(this.outline, true);
      this.outline = null;
    }
    this.render();
  }
  destroy() {
    this.selection.destroy();
    this.viewer.destroy();
  }
}
