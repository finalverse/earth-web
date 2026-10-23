# Third-party software notices

The project depends on third-party npm packages whose own licenses apply. This
file records the packages added for the browser-local SDR feature and the
Street Level viewer; the complete resolved dependency inventory remains in
file records the packages added for the browser-local SDR and on-device voice
features; the complete resolved dependency inventory remains in
`package-lock.json`.

## Web RTL-SDR

- Package: `@jtarrio/webrtlsdr` 3.0.6
- Author: Jacobo Tarrio Barreiro; portions copyright Google Inc.
- Source: <https://github.com/jtarrio/webrtlsdr>
- License: Apache License 2.0
- License text: <https://www.apache.org/licenses/LICENSE-2.0>

## Signals

- Package: `@jtarrio/signals` 0.10.1
- Author: Jacobo Tarrio Barreiro
- Source: <https://github.com/jtarrio/signals>
- License: Apache License 2.0
- License text: <https://www.apache.org/licenses/LICENSE-2.0>

## MapillaryJS

- Package: `mapillary-js` 4.1.2 (loaded on demand by the Street Level viewer,
  with its stylesheet `dist/mapillary.css`)
- Author: Copyright (c) Facebook, Inc. and its affiliates
- Source: <https://github.com/mapillary/mapillary-js>
- License: MIT
- License text: <https://github.com/mapillary/mapillary-js/blob/main/LICENSE>

## RxJS (MapillaryJS dependency)

- Package: `rxjs` 7.8.2
- Author: Google, Inc., Netflix, Inc., Microsoft Corp. and contributors
- Source: <https://github.com/ReactiveX/rxjs>
- License: Apache License 2.0
- License text: <https://www.apache.org/licenses/LICENSE-2.0>

## three.js (MapillaryJS dependency)

- Package: `three` 0.134.0
- Author: Copyright © 2010-2021 three.js authors
- Source: <https://github.com/mrdoob/three.js>
- License: MIT
- License text: <https://github.com/mrdoob/three.js/blob/dev/LICENSE>

## Finalverse Earth additions

- Proj4js 2.22.0 — MIT, https://github.com/proj4js/proj4js
- geographiclib-geodesic 2.2.0 — MIT, Copyright Charles Karney, https://github.com/geographiclib/geographiclib-js

New code under `earth/` is Copyright 2026 Finalverse contributors, MIT.
Inherited code retains the upstream notices. Data rights are separate; see
`docs/earth/licensing.md`.

## Finalverse Earth v0.2 additions

The independent Earth core adds MIT-licensed Turf 7.4.0 geometry modules (`@turf/bbox`, `boolean-contains`, `boolean-intersects`, `boolean-valid`), RBush 4.0.1, polygon-clipping 0.15.7 and node-postgres (`pg`) 8.23.1. Their copyright/license files remain included with the installed npm packages; resolved dependency versions are recorded in `package-lock.json`. These additions do not change inherited component licensing.

The WRI Global Power Plant Database **data** is separately licensed CC BY 4.0. Natural Earth references are public domain. See [bundled geographic data attribution and modifications](earth/data/NOTICE.md). Dataset metadata and query exports carry source, license, attribution, source hashes and quality limitations. PostgreSQL/PostGIS is an optional external service, not part of the browser bundle. The development helper uses the official PostGIS image; PostgreSQL and PostGIS retain their own licenses (including PostGIS GPL terms).
## On-device voice

Loaded only when voice runs on this device.

| Package | Version | Source | License |
| --- | --- | --- | --- |
| `@litert-lm/core` (runtime and wasm served from the build) | 0.17.1 | <https://github.com/google-ai-edge/LiteRT-LM> | Apache-2.0 |
| `@huggingface/transformers` (speech recognition) | 4.3.0 | <https://github.com/huggingface/transformers.js> | Apache-2.0 |
| `onnxruntime-web` (with transformers.js 4.3.0) | 1.31.0-dev.20260914 | <https://github.com/microsoft/onnxruntime> | MIT |
| `kokoro-js` (natural voice) | 1.2.1 | <https://github.com/hexgrad/kokoro> | Apache-2.0 |
| `@huggingface/transformers` (used by kokoro-js) | 3.8.1 | <https://github.com/huggingface/transformers.js> | Apache-2.0 |
| `onnxruntime-web` (used by kokoro-js) | 1.22.0-dev.20250409 | <https://github.com/microsoft/onnxruntime> | MIT |

Natural voice also uses `phonemizer` 1.2.1 (<https://github.com/xenova/phonemizer.js>),
which embeds eSpeak NG (<https://github.com/espeak-ng/espeak-ng>, GPL-3.0-or-later).
It is not part of this repository or its build: when natural voice first
starts, the user's browser downloads the pinned file from
`cdn.jsdelivr.net/npm/phonemizer@1.2.1` and checks its SHA-256 before use.
`GEV_NATURAL_VOICE=off` turns natural voice off.
