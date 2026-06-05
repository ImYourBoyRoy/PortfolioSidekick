# ./backend/local_session.py
"""
Dev-mode local API session secret for loopback FastAPI only.
Production frozen desktop builds use pywebview IPC and do not expose HTTP.
"""

import os
import secrets
import sys
import time
from collections import defaultdict
from typing import Callable, Optional

if getattr(sys, "frozen", False):
    _SECRET_DIR = os.path.dirname(sys.executable)
else:
    _SECRET_DIR = os.path.dirname(os.path.abspath(__file__))

_SECRET_FILE = os.path.join(_SECRET_DIR, ".sidekick_local_session")
_PUBLIC_PATHS = {"/api/health", "/api/dev/session"}

_login_attempts: dict = defaultdict(list)
_MAX_ATTEMPTS = 5
_WINDOW_SEC = 900


def get_or_create_dev_secret() -> str:
    if os.path.isfile(_SECRET_FILE):
        with open(_SECRET_FILE, "r", encoding="utf-8") as f:
            existing = f.read().strip()
            if existing:
                return existing
    token = secrets.token_urlsafe(32)
    fd = os.open(_SECRET_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(token)
    return token


def validate_dev_secret(provided: Optional[str]) -> bool:
    if not provided:
        return False
    expected = get_or_create_dev_secret()
    return secrets.compare_digest(provided, expected)


def is_public_path(path: str) -> bool:
    base = path.split("?")[0]
    return base in _PUBLIC_PATHS


def check_rate_limit(profile_id: int) -> bool:
    now = time.time()
    key = f"login:{profile_id}"
    _login_attempts[key] = [t for t in _login_attempts[key] if now - t < _WINDOW_SEC]
    if len(_login_attempts[key]) >= _MAX_ATTEMPTS:
        return False
    _login_attempts[key].append(now)
    return True


def dev_session_middleware_factory():
    """Returns Starlette middleware callable for dev HTTP mode."""

    async def middleware(request, call_next: Callable):
        path = request.url.path
        if is_public_path(path) or request.method == "OPTIONS":
            return await call_next(request)
        header = request.headers.get("x-sidekick-local-session", "")
        if not validate_dev_secret(header):
            from fastapi.responses import JSONResponse

            return JSONResponse({"detail": "Unauthorized local session."}, status_code=401)
        return await call_next(request)

    return middleware
