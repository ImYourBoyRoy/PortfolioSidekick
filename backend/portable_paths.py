# ./backend/portable_paths.py
"""
Resolve portable data directories for Portfolio Sidekick.

Development (scripts under backend/): backend/sessions and backend/data markers.
Portable desktop (scripts beside portfolio-sidekick.exe): <exe>/data/ for all files.
"""

from __future__ import annotations

import os
import sys


def script_root() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def is_portable_desktop_layout() -> bool:
    root = script_root()
    return os.path.basename(root) != "backend"


def portable_data_dir() -> str:
    root = script_root()
    if is_portable_desktop_layout():
        path = os.path.join(root, "data")
    else:
        path = os.path.join(root, "data")
    os.makedirs(path, mode=0o700, exist_ok=True)
    return path


def portable_sessions_dir() -> str:
    path = os.path.join(portable_data_dir(), "sessions")
    os.makedirs(path, mode=0o700, exist_ok=True)
    return path
