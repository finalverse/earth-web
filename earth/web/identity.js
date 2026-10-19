// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import {
  Credit,
  CreditDisplay,
  Color,
  Cartographic,
  Math as CesiumMath,
} from 'cesium';
import markURL from './brand/finalverse-symbol.png';
// Only for the independent, ion-free Earth build. Provider credits stay intact.
// Cesium ion services must restore their required branding if enabled later.
export function installEarthIdentity(viewer, { energy = false } = {}) {
  CreditDisplay.cesiumCredit = new Credit('');
  // An opaque local ellipsoid prevents seeing far-side geometry through oceans.
  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Infinity;
  viewer.scene.globe.show = true;
  viewer.scene.globe.baseColor = Color.fromCssColorString('#13263c');
  viewer.scene.globe.enableLighting = false;
  viewer.camera.changed.addEventListener(() => {
    const c = Cartographic.fromCartesian(viewer.camera.positionWC);
    document.getElementById('globe').dataset.camera = JSON.stringify({
      longitude: CesiumMath.toDegrees(c.longitude),
      latitude: CesiumMath.toDegrees(c.latitude),
      height: c.height,
    });
  });
  const loading = document.createElement('div');
  loading.className = 'earth-loading';
  const mark = document.createElement('img');
  mark.src = markURL;
  mark.alt = 'Preparing Finalverse Earth';
  loading.append(mark);
  document.getElementById('workspace').append(loading);
  const firstFrame = viewer.scene.postRender.addEventListener(() => {
    loading.remove();
    firstFrame();
  });
  viewer.creditDisplay.addStaticCredit(
    new Credit(
      '<a href="https://cesium.com/platform/cesiumjs/" target="_blank" rel="noopener">CesiumJS · Apache 2.0</a>',
    ),
  );
  viewer.creditDisplay.addStaticCredit(
    new Credit(
      '<a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Made with Natural Earth · public domain</a>',
    ),
  );
  if (energy)
    viewer.creditDisplay.addStaticCredit(
      new Credit(
        '<a href="https://datasets.wri.org/dataset/globalpowerplantdatabase" target="_blank" rel="noopener">WRI Global Power Plant Database v1.3.0 · CC BY 4.0</a>',
        true,
      ),
    );
  const theme = document.getElementById('theme');
  let saved;
  try {
    saved = localStorage.getItem('earth-theme');
  } catch {
    /* Optional preference. */
  }
  document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
  theme?.addEventListener('click', () => {
    const value =
      document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem('earth-theme', value);
    } catch {
      /* Keep theme usable. */
    }
    theme.setAttribute(
      'aria-label',
      `Switch to ${value === 'light' ? 'dark' : 'light'} theme`,
    );
  });
}
