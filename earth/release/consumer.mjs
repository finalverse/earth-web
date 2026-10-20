// Independent SDK consumer: npm install <SDK.tgz>; node consumer.mjs <origin>
import { EarthClient } from '@finalverse/earth';
const client = new EarthClient({
  endpoint: process.argv[2],
  applicationId: 'finalverse.energy-explorer',
});
const result = await client.spatial.withinRadius({
  dataset: 'wri-canada-power-plants',
  place_id: 'ne-place-1173',
  radius_m: 100000,
  fuels: ['Hydro', 'Solar'],
  limit: 100,
});
if (result.data.total !== 18) throw new Error('Unexpected source snapshot.');
console.log(
  JSON.stringify({
    total: result.data.total,
    receipt: result.receipt,
    provenance: result.provenance,
  }),
);
