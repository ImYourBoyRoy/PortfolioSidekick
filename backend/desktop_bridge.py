# ./backend/desktop_bridge.py
"""
PyWebView js_api bridge for production desktop builds.
Dispatches in-process API calls via Starlette TestClient — no TCP listener.
"""

import json
import logging
import re
from typing import Any, Dict, Optional
from urllib.parse import parse_qs, urlparse

from starlette.testclient import TestClient

logger = logging.getLogger(__name__)

_ALLOWED: Dict[tuple, re.Pattern] = {
    ("GET", "/api/profiles"): re.compile(r"^/api/profiles/?$"),
    ("POST", "/api/profiles"): re.compile(r"^/api/profiles/?$"),
    ("DELETE", "/api/profiles"): re.compile(r"^/api/profiles/\d+/?$"),
    ("POST", "/api/auth/login"): re.compile(r"^/api/auth/login/?$"),
    ("POST", "/api/auth/logout"): re.compile(r"^/api/auth/logout/?$"),
    ("GET", "/api/auth/status"): re.compile(r"^/api/auth/status/?$"),
    ("POST", "/api/portfolio/sync"): re.compile(r"^/api/portfolio/sync/?$"),
    ("POST", "/api/portfolio/import-text"): re.compile(r"^/api/portfolio/import-text/?$"),
    ("GET", "/api/portfolio/holdings"): re.compile(r"^/api/portfolio/holdings/?$"),
    ("POST", "/api/portfolio/holdings"): re.compile(r"^/api/portfolio/holdings/?$"),
    ("POST", "/api/portfolio/holdings/clear"): re.compile(r"^/api/portfolio/holdings/clear/?$"),
    ("GET", "/api/watchlist"): re.compile(r"^/api/watchlist/?$"),
    ("POST", "/api/watchlist"): re.compile(r"^/api/watchlist/?$"),
    ("DELETE", "/api/watchlist"): re.compile(r"^/api/watchlist/"),
    ("GET", "/api/guesses"): re.compile(r"^/api/guesses/?$"),
    ("POST", "/api/guesses"): re.compile(r"^/api/guesses/?$"),
    ("POST", "/api/guesses/cancel"): re.compile(r"^/api/guesses/\d+/cancel/?$"),
    ("GET", "/api/guesses/analytics"): re.compile(r"^/api/guesses/analytics/?$"),
    ("GET", "/api/shadow-coach/insights"): re.compile(r"^/api/shadow-coach/insights/?$"),
    ("GET", "/api/shadow-coach/actions"): re.compile(r"^/api/shadow-coach/actions/?$"),
    ("GET", "/api/advisor/recommendation"): re.compile(r"^/api/advisor/recommendation/?$"),
    ("GET", "/api/advisor/viability"): re.compile(r"^/api/advisor/viability/?$"),
    ("GET", "/api/advisor/market-strength"): re.compile(r"^/api/advisor/market-strength/?$"),
    ("POST", "/api/advisor/evolve"): re.compile(r"^/api/advisor/evolve/?$"),
    ("GET", "/api/strategy/brackets"): re.compile(r"^/api/strategy/brackets/?$"),
    ("GET", "/api/stocks/history"): re.compile(r"^/api/stocks/history/?$"),
}


def _is_allowed(method: str, path: str) -> bool:
    base = path.split("?")[0]
    method = method.upper()
    for (m, _), pattern in _ALLOWED.items():
        if m == method and pattern.match(base):
            return True
    return False


class DesktopBridge:
    """Exposed to JavaScript as window.pywebview.api."""

    def __init__(self, app):
        self._client = TestClient(app, raise_server_exceptions=False)

    def api_call(
        self,
        method: str,
        path: str,
        body: Optional[str] = None,
    ) -> str:
        """
        Allowlisted in-process API dispatch. Returns JSON string:
        {"ok": true, "status": 200, "data": ...} or {"ok": false, "status": N, "error": "..."}
        """
        method = (method or "GET").upper()
        if not path.startswith("/api/"):
            path = "/api/" + path.lstrip("/")
        if not _is_allowed(method, path):
            logger.warning("Blocked IPC call: %s %s", method, path)
            return json.dumps({"ok": False, "status": 403, "error": "Forbidden API path."})

        parsed = urlparse(path)
        route = parsed.path
        query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        payload: Optional[Dict[str, Any]] = None
        if body:
            try:
                payload = json.loads(body) if isinstance(body, str) else body
            except json.JSONDecodeError:
                return json.dumps({"ok": False, "status": 400, "error": "Invalid JSON body."})

        try:
            if method == "GET":
                resp = self._client.get(route, params=query)
            elif method == "POST":
                resp = self._client.post(route, params=query, json=payload)
            elif method == "DELETE":
                resp = self._client.delete(route, params=query)
            elif method == "PUT":
                resp = self._client.put(route, params=query, json=payload)
            else:
                return json.dumps({"ok": False, "status": 405, "error": f"Unsupported method {method}."})

            try:
                data = resp.json()
            except Exception:
                data = resp.text

            if resp.status_code >= 400:
                err = data.get("detail", data) if isinstance(data, dict) else data
                return json.dumps({"ok": False, "status": resp.status_code, "error": err})
            return json.dumps({"ok": True, "status": resp.status_code, "data": data})
        except Exception as exc:
            logger.error("IPC dispatch error: %s", exc, exc_info=True)
            return json.dumps({"ok": False, "status": 500, "error": str(exc)})

    def platform_info(self) -> str:
        return json.dumps({"platform": "desktop-ipc", "http_server": False})
