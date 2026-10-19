"""Reproduce licensed point catalogs from pinned source files. No network access."""
import csv
import hashlib
import json
import sys
from pathlib import Path

WRI_COMMIT = "7a91cfbb2a4e272597acbc00506d61fc1ec73b3d"
NE_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19"
EXPECTED = {"wri.csv": "9f8f909169a35926383daf007705f799050f76ae607e1b2d47dd4fb91782e01f", "places50.geojson": "8e70756b39fae9bcdc1e332bfc510c024c5edd3a13203ffd20092ee37b61d978"}
source = Path(sys.argv[1])
output = Path(__file__).resolve().parent
for filename, digest in EXPECTED.items():
    if hashlib.sha256((source / filename).read_bytes()).hexdigest() != digest:
        raise ValueError("Source checksum changed: " + filename)

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()

def number(value):
    return float(value) if value else None

features = []
with (source / "wri.csv").open() as file:
    for row in csv.DictReader(file):
        if row["country"] != "CAN":
            continue
        features.append({"type": "Feature", "id": row["gppd_idnr"], "properties": {
            "name": row["name"], "country": "CAN", "fuel": row["primary_fuel"],
            "capacity_mw": number(row["capacity_mw"]), "capacity_data_year": number(row["year_of_capacity_data"]),
            "commissioning_year": number(row["commissioning_year"]), "source": row["source"],
            "source_url": row["url"], "geolocation_source": row["geolocation_source"]},
            "geometry": {"type": "Point", "coordinates": [float(row["longitude"]), float(row["latitude"])]}})
energy = {"id": "wri-canada-power-plants", "title": "Canada power plants — WRI archival catalog", "version": "gppd-1.3.0-" + WRI_COMMIT[:8], "visibility": "public", "coverage_country": "CAN", "features": features,
    "provenance": {"source": f"https://github.com/wri/global-power-plant-database/blob/{WRI_COMMIT}/output_database/global_power_plant_database.csv", "source_commit": WRI_COMMIT, "source_sha256": EXPECTED["wri.csv"], "content_sha256": digest(features), "content_hash_scope": "Selected GeoJSON features, compact UTF-8 JSON", "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/", "attribution": "World Resources Institute, Global Power Plant Database v1.3.0 (2021), and its data contributors", "modifications": "Canada subset; selected fields converted to GeoJSON. Coordinates and reported capacity preserved; no imputed facilities or generation.", "crs": "OGC:CRS84", "units": "degrees; reported capacity in MW", "time": {"kind": "archival_snapshot", "observed_at": None, "release_year": 2021}, "quality": "WRI ceased maintenance in early 2022. Source reporting years vary; locations can be estimated. Not current operations, complete coverage, live generation or engineering/site-selection advice."}}
raw = json.loads((source / "places50.geojson").read_text())
features = []
for i, feature in enumerate(raw["features"]):
    p = feature["properties"]
    aliases = sorted({str(p[k]) for k in ["name", "nameascii", "namealt", "namepar", "ls_name"] if p.get(k)})
    features.append({"type": "Feature", "id": "ne-place-" + str(i), "properties": {"name": p["name"], "aliases": aliases, "country": p.get("adm0_a3"), "country_name": p.get("adm0name")}, "geometry": feature["geometry"]})
places = {"id": "natural-earth-places", "title": "Natural Earth populated places — reference points", "version": NE_COMMIT, "visibility": "public", "features": features,
    "provenance": {"source": f"https://github.com/nvkelso/natural-earth-vector/blob/{NE_COMMIT}/geojson/ne_50m_populated_places_simple.geojson", "source_commit": NE_COMMIT, "source_sha256": EXPECTED["places50.geojson"], "content_sha256": digest(features), "content_hash_scope": "Selected GeoJSON features, compact UTF-8 JSON", "license": "Public domain", "license_url": "https://www.naturalearthdata.com/about/terms-of-use/", "attribution": "Made with Natural Earth", "modifications": "Selected reference names/aliases, country codes and original point coordinates; IDs are indices in the pinned source.", "crs": "OGC:CRS84", "units": "degrees", "time": {"kind": "static_reference", "observed_at": None}, "quality": "Generalized cartographic place references, not addresses, surveyed centers or user locations."}}
lock = {"schema_version": 1, "files": {}}
for filename, dataset in [("wri-canada.json", energy), ("places.json", places)]:
    data = (json.dumps(dataset, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    (output / filename).write_bytes(data)
    lock["files"][filename] = hashlib.sha256(data).hexdigest()
(output / "catalog.lock.json").write_text(json.dumps(lock, indent=2) + "\n")
print(json.dumps({"energy_features": len(energy["features"]), "place_features": len(places["features"]), "files": lock["files"]}))
