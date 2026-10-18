"""Earth API example. Python 3 standard library; no model or world account."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))
from finalverse_earth import EarthClient

plan = {"schema_version": 1, "tool": "search_features", "arguments": {
    "dataset": "natural-earth-countries", "query": sys.argv[1] if len(sys.argv) > 1 else "Canada", "limit": 5}}
result = EarthClient().query(plan)
print(json.dumps({"summary": result["summary"], "names": [f["properties"]["name"] for f in result["data"]["features"]], "provenance": result["provenance"]}, indent=2))
