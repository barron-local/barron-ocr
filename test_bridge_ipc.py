import unittest
import json
import urllib.request
import urllib.error

BRIDGE_URL = "http://127.0.0.1:6767"

class TestBridgeIPCSeam(unittest.TestCase):
    def test_health_endpoint_response_format(self):
        """Verifies GET /health returns 200 with required IPC metadata keys."""
        req = urllib.request.Request(f"{BRIDGE_URL}/health", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data.get("status"), "online")
            self.assertIn("provider", data)
            self.assertIn("threads", data)
            self.assertIn("engine", data)

    def test_cors_options_handshake(self):
        """Verifies preflight OPTIONS request returns 204 with CORS allow headers."""
        req = urllib.request.Request(f"{BRIDGE_URL}/health", method="OPTIONS")
        with urllib.request.urlopen(req, timeout=3) as resp:
            self.assertEqual(resp.status, 204)
            headers = dict(resp.headers)
            self.assertIn("Access-Control-Allow-Origin", headers)
            self.assertEqual(headers["Access-Control-Allow-Origin"], "*")

    def test_not_found_endpoint(self):
        """Verifies querying an invalid route returns HTTP 404."""
        req = urllib.request.Request(f"{BRIDGE_URL}/non_existent_route", method="GET")
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req, timeout=3)
        self.assertEqual(ctx.exception.code, 404)

if __name__ == "__main__":
    unittest.main()
