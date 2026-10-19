"""Finalverse Earth v0.2 HTTP SDK. Copyright 2026 Finalverse contributors, MIT."""
import json
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class EarthClient:
    def __init__(self, base="http://127.0.0.1:18640", timeout=30, token=None):
        url = urlparse(base)
        if (url.scheme not in ("http", "https") or not url.hostname or
                url.username or url.password or url.query or url.fragment):
            raise ValueError("Expected an explicit HTTP(S) Earth URL without credentials")
        self.base, self.timeout, self.token = base.rstrip("/"), timeout, token

    def _request(self, path, body=None):
        data = None if body is None else json.dumps(body, allow_nan=False).encode()
        if data is not None and len(data) > (2097152 if path == "/v1/datasets" else 16384):
            raise ValueError("Earth request exceeds endpoint size limit")
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        request = Request(self.base + path, data=data, headers=headers)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return json.load(response)
        except HTTPError as error:
            raise ValueError(json.load(error).get("error", "Earth request failed")) from None

    def layers(self):
        return self._request("/v1/layers")

    def query(self, plan):
        return self._request("/v1/query", plan)

    def propose(self, question):
        return self._request("/v1/ai/plan", {"question": question})

    def list_layers(self):
        return self.layers()

    def register_dataset(self, dataset):
        return self._request("/v1/datasets", dataset)

    def execute_spatial_plan(self, plan):
        return self.query(plan)

    def spatial_query(self, tool, arguments):
        return self.query({"schema_version": 1, "tool": tool, "arguments": arguments})

    def query_features(self, dataset, **filters):
        return self.spatial_query("query_features", {**filters, "dataset": dataset})

    def inspect_feature(self, dataset, feature_id):
        return self.spatial_query("inspect_feature", {"dataset": dataset, "feature_id": feature_id})

    def get_provenance(self, dataset):
        return self.spatial_query("get_provenance", {"dataset": dataset})
