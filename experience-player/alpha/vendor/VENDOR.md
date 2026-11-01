# Vendored renderer

The alpha's place view renders World Labs Gaussian-splat worlds with Spark. It is served from
this origin because the CSP allows no third-party scripts. Only the bare `import` specifiers were
changed, to relative paths; no other bytes were modified.

| File | Source | Licence |
|---|---|---|
| `spark.module.min.js` | `@sparkjsdev/spark@2.3.1` `dist/spark.module.min.js` | MIT (`LICENSE-spark.txt`) |
| `three.module.min.js`, `three.core.min.js` | `three@0.180.0` `build/` | MIT (`LICENSE-three.txt`) |
| `Pass.js` | `three@0.180.0` `examples/jsm/postprocessing/Pass.js` | MIT |

The npm tarball integrity matches the registry:
- `@sparkjsdev/spark@2.3.1`: `sha512-K+SyIbkO/dx1TLLudK8Jp3/noS13z/kdNPo6OK2waxQaGy81HBmKGnNBT/t/K9Ew3dsIXmWqsJXxGfmAu1T5Jg==`
- `three@0.180.0`: `sha512-o+qycAMZrh+TsE01GqWUxUIKR1AL0S8pq7zDkYOQw8GqfX8b8VoCKYUoHbhiX5j+7hr8XsuHDVU6+gkQJQKg9w==`

The rewrites:

```sh
sed -e 's#from "three/addons/postprocessing/Pass.js"#from "./Pass.js"#' \
    -e 's#from "three"#from "./three.module.min.js"#g' spark.module.min.js
sed "s#from 'three'#from './three.module.min.js'#" Pass.js
```

Spark 2.3.1 documents three 0.180.0, so upgrade the two together.
