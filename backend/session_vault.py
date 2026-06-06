# ./backend/session_vault.py
"""
Encrypted at-rest storage for Robinhood OAuth session tokens.
Uses OS-backed protection where available (Windows DPAPI) with Fernet fallback.
Profile-isolated vault files; never stores Robinhood passwords.
"""

import base64
import json
import logging
import os
import sys
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

from portable_paths import portable_sessions_dir

_BASE_DIR = portable_sessions_dir()

_VAULT_SUFFIX = ".vault"


def _vault_path(profile_name: str) -> str:
    safe = profile_name.lower().strip().replace(os.sep, "_")
    profile_dir = os.path.join(_BASE_DIR, safe)
    os.makedirs(profile_dir, mode=0o700, exist_ok=True)
    return os.path.join(profile_dir, f"robinhood{_VAULT_SUFFIX}")


def _dpapi_encrypt(data: bytes) -> Optional[bytes]:
    if sys.platform != "win32":
        return None
    try:
        import ctypes
        import ctypes.wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [
                ("cbData", ctypes.wintypes.DWORD),
                ("pbData", ctypes.POINTER(ctypes.c_byte)),
            ]

        def _blob_from_bytes(buf: bytes) -> DATA_BLOB:
            arr = (ctypes.c_byte * len(buf))(*buf)
            return DATA_BLOB(len(buf), arr)

        in_blob = _blob_from_bytes(data)
        out_blob = DATA_BLOB()
        if not ctypes.windll.crypt32.CryptProtectData(
            ctypes.byref(in_blob),
            None,
            None,
            None,
            None,
            0,
            ctypes.byref(out_blob),
        ):
            return None
        raw = ctypes.string_at(out_blob.pbData, out_blob.cbData)
        ctypes.windll.kernel32.LocalFree(out_blob.pbData)
        return raw
    except Exception as exc:
        logger.warning("DPAPI encrypt unavailable: %s", exc)
        return None


def _dpapi_decrypt(data: bytes) -> Optional[bytes]:
    if sys.platform != "win32":
        return None
    try:
        import ctypes
        import ctypes.wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [
                ("cbData", ctypes.wintypes.DWORD),
                ("pbData", ctypes.POINTER(ctypes.c_byte)),
            ]

        def _blob_from_bytes(buf: bytes) -> DATA_BLOB:
            arr = (ctypes.c_byte * len(buf))(*buf)
            return DATA_BLOB(len(buf), arr)

        in_blob = _blob_from_bytes(data)
        out_blob = DATA_BLOB()
        if not ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(in_blob),
            None,
            None,
            None,
            None,
            0,
            ctypes.byref(out_blob),
        ):
            return None
        raw = ctypes.string_at(out_blob.pbData, out_blob.cbData)
        ctypes.windll.kernel32.LocalFree(out_blob.pbData)
        return raw
    except Exception as exc:
        logger.warning("DPAPI decrypt unavailable: %s", exc)
        return None


def _fernet_key_path() -> str:
    path = os.path.join(_BASE_DIR, ".fernet_key")
    os.makedirs(_BASE_DIR, mode=0o700, exist_ok=True)
    return path


def _get_fernet():
    from cryptography.fernet import Fernet

    key_path = _fernet_key_path()
    if os.path.isfile(key_path):
        with open(key_path, "rb") as f:
            key = f.read()
    else:
        key = Fernet.generate_key()
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(key)
    return Fernet(key)


def encrypt_payload(payload: Dict[str, Any]) -> bytes:
    plaintext = json.dumps(payload).encode("utf-8")
    sealed = _dpapi_encrypt(plaintext)
    if sealed is not None:
        return b"DPAPI:" + base64.b64encode(sealed)
    token = _get_fernet().encrypt(plaintext)
    return b"FERNET:" + token


def decrypt_payload(blob: bytes) -> Optional[Dict[str, Any]]:
    try:
        if blob.startswith(b"DPAPI:"):
            raw = base64.b64decode(blob[6:])
            plain = _dpapi_decrypt(raw)
            if plain is None:
                return None
            return json.loads(plain.decode("utf-8"))
        if blob.startswith(b"FERNET:"):
            plain = _get_fernet().decrypt(blob[7:])
            return json.loads(plain.decode("utf-8"))
        # Legacy plaintext JSON fallback for migration window
        return json.loads(blob.decode("utf-8"))
    except Exception as exc:
        logger.warning("Vault decrypt failed: %s", exc)
        return None


def save_session(profile_name: str, payload: Dict[str, Any]) -> None:
    path = _vault_path(profile_name)
    blob = encrypt_payload(payload)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(blob)
    logger.info("Encrypted session vault saved for profile '%s'.", profile_name)


def load_session(profile_name: str) -> Optional[Dict[str, Any]]:
    path = _vault_path(profile_name)
    if not os.path.isfile(path):
        return None
    with open(path, "rb") as f:
        blob = f.read()
    return decrypt_payload(blob)


def wipe_session(profile_name: str) -> None:
    path = _vault_path(profile_name)
    if os.path.isfile(path):
        try:
            size = os.path.getsize(path)
            with open(path, "wb") as f:
                f.write(b"\x00" * size)
                f.flush()
                os.fsync(f.fileno())
            os.remove(path)
        except OSError as exc:
            logger.error("Failed to wipe vault for '%s': %s", profile_name, exc)
    legacy_pickle = path.replace(_VAULT_SUFFIX, ".pickle")
    if os.path.isfile(legacy_pickle):
        try:
            os.remove(legacy_pickle)
        except OSError:
            pass
