"""Real source-data example. Copyright 2026 Finalverse contributors, MIT."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from finalverse_earth import EarthClient
result = EarthClient().spatial_query("within_distance", {
    "dataset": "wri-canada-power-plants", "place_id": "ne-place-1173",
    "radius_m": 100000, "limit": 100,
    "fuels": ["Biomass", "Geothermal", "Hydro", "Solar", "Wave and Tidal", "Wind"],
})
print(json.dumps({"total": result["data"]["total"], "provenance": result["provenance"],
                  "receipt": result["receipt"]}, indent=2))
