# Bundled geographic data

## Canadian power facilities

World Resources Institute, **Global Power Plant Database v1.3.0 (2021)**, and its data contributors. Database license: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). The source repository's software license is MIT; it is not the database license.

Source: [pinned CSV at 7a91cfbb2a4e272597acbc00506d61fc1ec73b3d](https://github.com/wri/global-power-plant-database/blob/7a91cfbb2a4e272597acbc00506d61fc1ec73b3d/output_database/global_power_plant_database.csv).

Source CSV SHA-256: `9f8f909169a35926383daf007705f799050f76ae607e1b2d47dd4fb91782e01f`.

Changes by Finalverse: select 1,159 Canadian records and fields, convert to GeoJSON, retain source IDs, coordinates, reported capacity and source years, and add explicit provenance. No facilities or generation values are invented. Attribution and license links accompany every query result and exported dataset. This use does not imply endorsement by WRI or the source contributors.

The catalog stopped receiving maintenance in early 2022. Coordinates may be estimated and reporting years vary. This is not current operational status, a complete facility census, live power output or site-selection guidance.

## Place references

[Made with Natural Earth](https://www.naturalearthdata.com/), [public domain](https://www.naturalearthdata.com/about/terms-of-use/). Source: [50m populated places at ca96624a56bd078437bca8184e78163e5039ad19](https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_50m_populated_places_simple.geojson).

Source SHA-256: `8e70756b39fae9bcdc1e332bfc510c024c5edd3a13203ffd20092ee37b61d978`.

Changes: select 1,251 original point coordinates and reference names/aliases/country codes; derive stable IDs from feature indices in this pinned source. These are cartographic references, not surveyed addresses or user locations.

## Rebuild the curated catalogs

Download the two pinned source files above into a scratch directory as `wri.csv` and `places50.geojson`. Run `python3 earth/data/build_catalogs.py /path/to/scratch`. The generator verifies source hashes before writing curated files. `catalog.lock.json` pins whole-file hashes; the runtime loader verifies them offline. Review data, source terms, notices and tests before accepting a changed pin.

Country/map-unit attribution and its original curation remain recorded in the existing country dataset and `docs/earth/licensing.md`. The optional database preserves all original country coordinates; any repaired query geometry is separately declared in dataset provenance.
