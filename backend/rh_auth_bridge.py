# ./backend/rh_auth_bridge.py
"""
JSON CLI for Robinhood auth using backend/robinhood_client.py (robin_stocks internals).
Use to verify MFA works on your machine independent of the JS/Tauri layer.

Run:
  python backend/rh_auth_bridge.py login <username> <password> [mfa_code] [--profile NAME]
  python backend/rh_auth_bridge.py logout [--profile NAME]

Outputs one JSON object on stdout.
"""

from __future__ import annotations

import argparse
import json
import sys

from robinhood_client import robinhood_client


def main() -> int:
    parser = argparse.ArgumentParser(description="Robinhood auth bridge (robin_stocks)")
    sub = parser.add_subparsers(dest="command", required=True)

    login_p = sub.add_parser("login", help="Phase 1 or Phase 2 login")
    login_p.add_argument("username")
    login_p.add_argument("password")
    login_p.add_argument("mfa_code", nargs="?", default=None)
    login_p.add_argument("--profile", default="cli_test")

    logout_p = sub.add_parser("logout")
    logout_p.add_argument("--profile", default="cli_test")

    args = parser.parse_args()

    if args.command == "login":
        result = robinhood_client.login(
            args.username,
            args.password,
            mfa_code=args.mfa_code,
            profile_name=args.profile,
        )
        if result.get("status") == "success" and result.get("mode") == "live":
            try:
                from session_vault import load_session
                session = load_session(args.profile)
                if session:
                    result["session"] = session
            except Exception:
                pass
    else:
        robinhood_client.logout(args.profile)
        result = {"status": "success", "message": f"Logged out profile {args.profile}"}

    print(json.dumps(result))
    return 0 if result.get("status") in ("success", "mfa_required") else 1


if __name__ == "__main__":
    sys.exit(main())
