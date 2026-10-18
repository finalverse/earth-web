"""Finalverse Earth v0.1 HTTP SDK. Copyright 2026 Finalverse contributors, MIT."""
import json
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class EarthClient:
    def __init__(self, base="http://127.0.0.1:18640", timeout=30):
        url = urlparse(base)
        if (url.scheme not in ("http", "https") or not url.hostname or
                url.username or url.password or url.query or url.fragment):
            raise ValueError("Expected an explicit HTTP(S) Earth URL without credentials")
        self.base, self.timeout = base.rstrip("/"), timeout

    def _request(self, path, body=None):
        data = None if body is None else json.dumps(body, allow_nan=False).encode()
        if data is not None and len(data) > 16384:
            raise ValueError("Earth request exceeds 16 KiB")
        request = Request(self.base + path, data=data, headers={"Content-Type": "application/json"})
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
