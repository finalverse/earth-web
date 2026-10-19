// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
import { Credit, CreditDisplay } from 'cesium';
// Only for the independent, ion-free Earth build. Provider credits stay intact.
// Cesium ion services must restore their required branding if enabled later.
export function installEarthIdentity(viewer) {
  CreditDisplay.cesiumCredit = new Credit('');
  viewer.creditDisplay.addStaticCredit(new Credit('<a href="https://cesium.com/platform/cesiumjs/" target="_blank" rel="noopener">CesiumJS · Apache 2.0</a>'));
  viewer.creditDisplay.addStaticCredit(new Credit('<a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Made with Natural Earth · public domain</a>'));
  viewer.creditDisplay.addStaticCredit(new Credit('<a href="https://datasets.wri.org/dataset/globalpowerplantdatabase" target="_blank" rel="noopener">WRI Global Power Plant Database v1.3.0 · CC BY 4.0</a>', true));
  const theme = document.getElementById('theme');
  let saved; try { saved = localStorage.getItem('earth-theme'); } catch { /* Optional preference. */ }
  document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
  theme?.addEventListener('click', () => {
    const value = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('earth-theme', value); } catch { /* Keep theme usable. */ }
    theme.setAttribute('aria-label', `Switch to ${value === 'light' ? 'dark' : 'light'} theme`);
  });
}
