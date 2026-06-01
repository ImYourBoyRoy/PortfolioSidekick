# ./backend/robinhood_client.py
"""
Portfolio Sidekick Robinhood Integration Client
Implements a two-phase, non-blocking Robinhood authentication flow by directly
interfacing with robin_stocks' internal HTTP helpers, fully bypassing the library's
blocking _validate_sherrif_id polling loops and infinite push-notification checkers.

Phase 1: POST credentials → detect verification_workflow → initiate pathfinder →
          store challenge state → return "mfa_required" instantly.
Phase 2: POST user's MFA code to challenge endpoint → advance workflow →
          re-attempt login → finalize session with pickle persistence.

Also provides public Yahoo Finance API fallback for quotes and historical prices
when unauthenticated (sandbox/offline portfolio tracking mode).

Run: Imported by FastAPI application router
Inputs: Credentials, MFA codes, or Ticker symbols
Outputs: Sync statuses, positions, real-time quotes
Assumptions: Session is isolated using per-profile directories under backend/sessions/.
"""

import os
import sys
import time
import pickle
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

# Determine backend directory path for portable data storage
if getattr(sys, 'frozen', False):
    # Running inside PyInstaller bundled executable - use directory of the executable
    BACKEND_DIR = os.path.dirname(sys.executable)
else:
    # Running locally in development
    BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Attempt to import robin_stocks internal helpers for direct API control
ROBIN_STOCKS_AVAILABLE = False
_rs_request_post = None
_rs_request_get = None
_rs_set_login_state = None
_rs_update_session = None
_rs_login_url = None
_rs_positions_url = None
_rs_generate_device_token = None

try:
    import robin_stocks.robinhood as r
    from robin_stocks.robinhood.helper import (
        request_post as _rs_request_post,
        request_get as _rs_request_get,
        set_login_state as _rs_set_login_state,
        update_session as _rs_update_session,
    )
    from robin_stocks.robinhood.urls import (
        login_url as _rs_login_url_fn,
        positions_url as _rs_positions_url_fn,
    )
    from robin_stocks.robinhood.authentication import (
        generate_device_token as _rs_generate_device_token,
    )
    # Resolve URL functions to their string values
    _rs_login_url = _rs_login_url_fn
    _rs_positions_url = _rs_positions_url_fn
    ROBIN_STOCKS_AVAILABLE = True
    logger.info("robin_stocks loaded successfully. Live Robinhood authentication available.")
except ImportError:
    logger.warning("robin_stocks package not available. Defaulting to public API fallback (Yahoo Finance).")


# ─────────────────────────────────────────────────────────────
# Robinhood API Endpoints (hardcoded as stable backup)
# ─────────────────────────────────────────────────────────────
RH_LOGIN_URL = "https://api.robinhood.com/oauth2/token/"
RH_PATHFINDER_URL = "https://api.robinhood.com/pathfinder/user_machine/"
RH_CHALLENGE_RESPOND_URL = "https://api.robinhood.com/challenge/{challenge_id}/respond/"
RH_INQUIRIES_URL = "https://api.robinhood.com/pathfinder/inquiries/{machine_id}/user_view/"
RH_PUSH_STATUS_URL = "https://api.robinhood.com/push/{challenge_id}/get_prompts_status/"
RH_CLIENT_ID = "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS"


class RobinhoodClient:
    """
    Two-phase, non-blocking Robinhood authentication client.

    Phase 1 (no mfa_code): Sends credentials → if verification_workflow returned,
    initiates the pathfinder challenge, stores state, returns "mfa_required" instantly.

    Phase 2 (with mfa_code): Responds to the stored challenge, advances the workflow,
    re-attempts login, and finalizes the session.
    """

    def __init__(self):
        self.is_authenticated: bool = False
        self.sandbox_mode: bool = True
        self.username: Optional[str] = None
        self._pending_challenge: Optional[Dict[str, Any]] = None

    # ─────────────────────────────────────────────────────────
    # Session Directory Helpers
    # ─────────────────────────────────────────────────────────

    def _get_session_dir(self, profile_name: str) -> str:
        """Returns (and creates) the isolated session directory for a profile."""
        session_dir = os.path.join(BACKEND_DIR, "sessions", profile_name.lower())
        os.makedirs(session_dir, exist_ok=True)
        return session_dir

    def _get_pickle_path(self, session_dir: str) -> str:
        """Returns the path to the session pickle file."""
        return os.path.join(session_dir, "robinhood.pickle")

    # ─────────────────────────────────────────────────────────
    # Token Isolation & Cached Session Restoration
    # ─────────────────────────────────────────────────────────

    def set_token_isolation(self, profile_name: str) -> None:
        """
        Switches to a profile's session directory and attempts to restore
        a cached Robinhood session from a pickle file. If the cached session
        is valid, switches to live mode. Otherwise, stays in sandbox mode.

        This method directly loads the pickle and validates the session
        WITHOUT calling r.login(), preventing any blocking behavior.
        """
        session_dir = self._get_session_dir(profile_name)
        os.environ["ROBINHOOD_TOKEN_PATH"] = session_dir
        pickle_path = self._get_pickle_path(session_dir)

        if ROBIN_STOCKS_AVAILABLE and os.path.isfile(pickle_path):
            try:
                logger.info(f"Found cached session pickle for '{profile_name}'. Validating...")
                with open(pickle_path, 'rb') as f:
                    pickle_data = pickle.load(f)

                access_token = pickle_data['access_token']
                token_type = pickle_data['token_type']

                # Set the session authorization header directly
                _rs_set_login_state(True)
                _rs_update_session('Authorization', f'{token_type} {access_token}')

                # Validate the session is still alive by hitting the positions endpoint
                res = _rs_request_get(
                    _rs_positions_url(),
                    'pagination',
                    {'nonzero': 'true'},
                    jsonify_data=False
                )
                res.raise_for_status()

                self.sandbox_mode = False
                self.is_authenticated = True
                logger.info(f"Successfully restored live Robinhood session for '{profile_name}'.")
            except Exception as e:
                logger.warning(f"Could not restore cached session for '{profile_name}': {e}. Using sandbox mode.")
                _rs_set_login_state(False)
                _rs_update_session('Authorization', None)
                self.sandbox_mode = True
                self.is_authenticated = False
        else:
            if ROBIN_STOCKS_AVAILABLE:
                logger.info(f"No cached session for '{profile_name}'. Operating in sandbox mode.")
            self.sandbox_mode = True

    # ─────────────────────────────────────────────────────────
    # Two-Phase Login
    # ─────────────────────────────────────────────────────────

    def login(self, username: str, password: str, mfa_code: Optional[str] = None, profile_name: str = "default") -> Dict[str, Any]:
        """
        Two-phase non-blocking Robinhood login.

        Phase 1 (no mfa_code): POST credentials. If a verification_workflow
        challenge is returned, initiate the pathfinder flow, store state,
        and return {"status": "mfa_required"} instantly.

        Phase 2 (mfa_code provided): Respond to the stored challenge,
        advance the workflow, re-attempt login, and finalize the session.
        """
        self.username = username
        session_dir = self._get_session_dir(profile_name)
        os.environ["ROBINHOOD_TOKEN_PATH"] = session_dir

        # ── Sandbox escape hatch ──
        if username.lower() == "sandbox" or not ROBIN_STOCKS_AVAILABLE:
            self.sandbox_mode = True
            self.is_authenticated = True
            logger.info(f"Robinhood client authenticated in SANDBOX mode for profile: '{profile_name}'.")
            return {
                "status": "success",
                "mode": "sandbox",
                "message": f"Connected to Sandbox ({profile_name}). Using Yahoo Finance for live prices."
            }

        # ── Phase 2: Complete a pending MFA challenge ──
        if mfa_code and self._pending_challenge:
            logger.info(f"Phase 2: Completing MFA challenge for '{profile_name}' with code '{mfa_code[:2]}...'")
            return self._complete_challenge(mfa_code, profile_name, session_dir)

        # ── Phase 1: Initial login attempt ──
        try:
            pickle_path = self._get_pickle_path(session_dir)

            # Try cached session first
            cached_result = self._try_cached_session(pickle_path, profile_name)
            if cached_result:
                return cached_result

            # Fresh login
            device_token = _rs_generate_device_token()
            login_payload = self._build_login_payload(username, password, device_token)

            logger.info(f"Phase 1: Sending credentials to Robinhood for '{profile_name}'...")
            data = _rs_request_post(RH_LOGIN_URL, login_payload)

            if not data:
                logger.error("No response from Robinhood login endpoint.")
                return {
                    "status": "error",
                    "mode": "live",
                    "message": "No response from Robinhood servers. Check your internet connection."
                }

            # ── Handle verification workflow (MFA/device challenge) ──
            if 'verification_workflow' in data:
                return self._initiate_challenge(data, device_token, login_payload, session_dir, profile_name)

            # ── Direct success (no verification needed, rare) ──
            if 'access_token' in data:
                self._finalize_login(data, login_payload, session_dir, profile_name)
                return {
                    "status": "success",
                    "mode": "live",
                    "message": f"Connected to {profile_name}'s Robinhood account!"
                }

            # ── Credential error or unexpected response ──
            error_detail = data.get('detail', 'Unknown error. Check credentials.')
            logger.error(f"Login failed for '{profile_name}': {error_detail}")
            return {
                "status": "error",
                "mode": "live",
                "message": f"Login failed: {error_detail}"
            }

        except Exception as e:
            self.sandbox_mode = True
            self.is_authenticated = False
            err_msg = str(e)
            logger.error(f"Unexpected login error for '{profile_name}': {err_msg}")
            return {
                "status": "error",
                "mode": "live",
                "message": f"Login error: {err_msg}"
            }

    # ─────────────────────────────────────────────────────────
    # Private: Login Sub-Routines
    # ─────────────────────────────────────────────────────────

    def _build_login_payload(self, username: str, password: str, device_token: str) -> Dict[str, Any]:
        """Constructs the Robinhood OAuth2 login payload."""
        return {
            'client_id': RH_CLIENT_ID,
            'expires_in': 86400,
            'grant_type': 'password',
            'password': password,
            'scope': 'internal',
            'username': username,
            'device_token': device_token,
            'try_passkeys': False,
            'token_request_path': '/login',
            'create_read_only_secondary_token': True,
        }

    def _try_cached_session(self, pickle_path: str, profile_name: str) -> Optional[Dict[str, Any]]:
        """Attempts to restore a cached session. Returns a result dict if successful, None otherwise."""
        if not os.path.isfile(pickle_path):
            return None

        try:
            with open(pickle_path, 'rb') as f:
                pickle_data = pickle.load(f)

            access_token = pickle_data['access_token']
            token_type = pickle_data['token_type']

            _rs_set_login_state(True)
            _rs_update_session('Authorization', f'{token_type} {access_token}')

            # Validate the token is still alive
            res = _rs_request_get(
                _rs_positions_url(),
                'pagination',
                {'nonzero': 'true'},
                jsonify_data=False
            )
            res.raise_for_status()

            self.sandbox_mode = False
            self.is_authenticated = True
            logger.info(f"Restored cached Robinhood session for '{profile_name}'.")
            return {
                "status": "success",
                "mode": "live",
                "message": f"Connected using cached session for {profile_name}."
            }
        except Exception as e:
            logger.warning(f"Cached session expired for '{profile_name}': {e}. Starting fresh login...")
            _rs_set_login_state(False)
            _rs_update_session('Authorization', None)
            # Delete the stale pickle
            try:
                os.remove(pickle_path)
            except OSError:
                pass
            return None

    def _initiate_challenge(self, login_response: dict, device_token: str, login_payload: dict, session_dir: str, profile_name: str) -> Dict[str, Any]:
        """
        Initiates the Robinhood pathfinder verification workflow.
        Polls for the challenge type (SMS/email/push) and stores state for Phase 2.
        Returns "mfa_required" instantly without entering any blocking loops.
        """
        workflow_id = login_response['verification_workflow']['id']
        logger.info(f"Verification workflow triggered (ID: {workflow_id}). Initiating pathfinder...")

        # Start the pathfinder user_machine flow
        machine_payload = {
            'device_id': device_token,
            'flow': 'suv',
            'input': {'workflow_id': workflow_id}
        }
        machine_data = _rs_request_post(url=RH_PATHFINDER_URL, payload=machine_payload, json=True)

        if not machine_data or 'id' not in machine_data:
            logger.error(f"Failed to initiate pathfinder. Response: {machine_data}")
            return {
                "status": "error",
                "mode": "live",
                "message": "Failed to initiate Robinhood verification flow. Please try again."
            }

        machine_id = machine_data['id']
        inquiries_url = RH_INQUIRIES_URL.format(machine_id=machine_id)

        # Brief wait then poll for the challenge to appear (max 3 attempts, 2s apart)
        challenge_type = None
        challenge_id = None
        challenge_status = None

        for attempt in range(3):
            time.sleep(2)
            inquiries_response = _rs_request_get(inquiries_url)

            if inquiries_response and "context" in inquiries_response:
                ctx = inquiries_response["context"]
                if "sheriff_challenge" in ctx:
                    challenge = ctx["sheriff_challenge"]
                    challenge_type = challenge.get("type", "sms")
                    challenge_id = challenge.get("id")
                    challenge_status = challenge.get("status")
                    logger.info(f"Challenge detected: type={challenge_type}, status={challenge_status}, id={challenge_id}")
                    break

            logger.info(f"Waiting for challenge to be issued... (attempt {attempt + 1}/3)")

        if not challenge_type:
            logger.warning("No challenge detected after polling. Defaulting to SMS type.")
            challenge_type = "sms"

        # Store state for Phase 2
        self._pending_challenge = {
            'device_token': device_token,
            'login_payload': login_payload,
            'workflow_id': workflow_id,
            'machine_id': machine_id,
            'challenge_type': challenge_type,
            'challenge_id': challenge_id,
            'challenge_status': challenge_status,
            'session_dir': session_dir,
            'inquiries_url': inquiries_url,
        }

        # Build user-facing message based on challenge type
        if challenge_type == "prompt":
            msg = "Approve this login request in your Robinhood mobile app, then click 'Confirm Approval'."
        elif challenge_type == "email":
            msg = "A verification code has been sent to your email. Enter it below."
        else:
            msg = "A verification code has been sent via SMS. Enter it below."

        logger.info(f"Phase 1 complete. Returning 'mfa_required' ({challenge_type}) to frontend.")
        return {
            "status": "mfa_required",
            "mode": "live",
            "challenge_type": challenge_type,
            "message": msg
        }

    def _complete_challenge(self, mfa_code: str, profile_name: str, session_dir: str) -> Dict[str, Any]:
        """
        Phase 2: Completes a pending MFA challenge.
        For SMS/email: POSTs the code to the challenge respond endpoint.
        For push: Checks if the push was approved.
        Then advances the workflow and re-attempts login.
        """
        challenge = self._pending_challenge

        try:
            # Step 1: Respond to the challenge
            if challenge['challenge_type'] == "prompt":
                # App push: check if user approved in the mobile app
                if challenge.get('challenge_id'):
                    push_url = RH_PUSH_STATUS_URL.format(challenge_id=challenge['challenge_id'])
                    push_status = _rs_request_get(url=push_url)
                    if not push_status or push_status.get("challenge_status") != "validated":
                        logger.info("Push not yet approved. Keeping challenge pending.")
                        return {
                            "status": "mfa_required",
                            "mode": "live",
                            "challenge_type": "prompt",
                            "message": "Push not yet approved. Open your Robinhood app and approve the login, then try again."
                        }
                    logger.info("Push challenge approved!")
                else:
                    logger.warning("No challenge_id for push type. Attempting to continue workflow anyway.")
            else:
                # SMS or email: submit the verification code
                if not challenge.get('challenge_id'):
                    self._pending_challenge = None
                    return {
                        "status": "error",
                        "mode": "live",
                        "message": "No challenge ID found. Please restart login."
                    }

                challenge_url = RH_CHALLENGE_RESPOND_URL.format(challenge_id=challenge['challenge_id'])
                challenge_payload = {"response": mfa_code}
                logger.info(f"Submitting {challenge['challenge_type']} verification code to Robinhood...")
                challenge_response = _rs_request_post(url=challenge_url, payload=challenge_payload)

                if not challenge_response:
                    self._pending_challenge = None
                    return {
                        "status": "error",
                        "mode": "live",
                        "message": "No response from Robinhood challenge endpoint. Please restart login."
                    }

                resp_status = challenge_response.get("status", "")
                if resp_status != "validated":
                    logger.warning(f"Challenge response status: {resp_status}. Full response: {challenge_response}")
                    # Don't clear pending challenge - let user retry with correct code
                    return {
                        "status": "mfa_required",
                        "mode": "live",
                        "challenge_type": challenge['challenge_type'],
                        "message": f"Invalid verification code (status: {resp_status}). Please check and re-enter."
                    }

                logger.info("Verification code accepted!")

            # Step 2: Advance the workflow to approved status
            inquiries_url = challenge['inquiries_url']
            workflow_approved = False

            for attempt in range(5):
                try:
                    inquiries_payload = {"sequence": 0, "user_input": {"status": "continue"}}
                    inq_resp = _rs_request_post(url=inquiries_url, payload=inquiries_payload, json=True)

                    if inq_resp:
                        # Check for workflow_status_approved in type_context
                        type_ctx = inq_resp.get("type_context", {})
                        if type_ctx.get("result") == "workflow_status_approved":
                            workflow_approved = True
                            logger.info("Workflow status: APPROVED!")
                            break

                        # Also check in verification_workflow
                        vw = inq_resp.get("verification_workflow", {})
                        if vw.get("workflow_status") == "workflow_status_approved":
                            workflow_approved = True
                            logger.info("Workflow status (via verification_workflow): APPROVED!")
                            break

                    logger.info(f"Waiting for workflow approval... (attempt {attempt + 1}/5)")
                    time.sleep(2)
                except Exception as e:
                    logger.warning(f"Workflow poll error (attempt {attempt + 1}): {e}")
                    time.sleep(2)

            if not workflow_approved:
                logger.warning("Workflow not explicitly approved after polling, but proceeding with login re-attempt...")

            # Step 3: Re-attempt login with original credentials
            logger.info("Re-attempting login after verification...")
            data = _rs_request_post(RH_LOGIN_URL, challenge['login_payload'])

            if data and 'access_token' in data:
                self._finalize_login(data, challenge['login_payload'], session_dir, profile_name)
                self._pending_challenge = None
                return {
                    "status": "success",
                    "mode": "live",
                    "message": f"Successfully connected to {profile_name}'s Robinhood account!"
                }

            # If we still get a verification_workflow, the challenge wasn't fully completed
            if data and 'verification_workflow' in data:
                self._pending_challenge = None
                logger.error(f"Still getting verification_workflow after challenge. Response: {data}")
                return {
                    "status": "error",
                    "mode": "live",
                    "message": "Verification not fully completed. Please restart login and try again."
                }

            # Other failure
            self._pending_challenge = None
            error_detail = data.get('detail', 'Unknown error') if data else 'No response from Robinhood'
            logger.error(f"Login failed after verification: {error_detail}")
            return {
                "status": "error",
                "mode": "live",
                "message": f"Login failed after verification: {error_detail}"
            }

        except Exception as e:
            self._pending_challenge = None
            logger.error(f"Error completing MFA challenge: {e}", exc_info=True)
            return {
                "status": "error",
                "mode": "live",
                "message": f"Error during verification: {str(e)}"
            }

    def _finalize_login(self, data: dict, login_payload: dict, session_dir: str, profile_name: str) -> None:
        """
        Sets the robin_stocks session state and persists credentials to a pickle file
        after a successful login.
        """
        token = f"{data['token_type']} {data['access_token']}"
        _rs_update_session('Authorization', token)
        _rs_set_login_state(True)

        # Persist session to pickle
        pickle_path = self._get_pickle_path(session_dir)
        try:
            with open(pickle_path, 'wb') as f:
                pickle.dump({
                    'token_type': data['token_type'],
                    'access_token': data['access_token'],
                    'refresh_token': data['refresh_token'],
                    'device_token': login_payload['device_token'],
                }, f)
            logger.info(f"Session persisted to {pickle_path}")
        except Exception as e:
            logger.error(f"Failed to persist session pickle: {e}")

        self.sandbox_mode = False
        self.is_authenticated = True
        logger.info(f"Login finalized for '{profile_name}'. Mode: LIVE.")

    # ─────────────────────────────────────────────────────────
    # Logout
    # ─────────────────────────────────────────────────────────

    def logout(self, profile_name: str = "default") -> None:
        """Logs out and destroys the local session for the profile."""
        self.is_authenticated = False
        self.sandbox_mode = True
        self._pending_challenge = None

        session_dir = self._get_session_dir(profile_name)
        pickle_path = self._get_pickle_path(session_dir)

        # Clear robin_stocks session state
        if ROBIN_STOCKS_AVAILABLE:
            try:
                _rs_set_login_state(False)
                _rs_update_session('Authorization', None)
            except Exception as e:
                logger.error(f"Error clearing robin_stocks session: {e}")

        # Delete the pickle file
        if os.path.isfile(pickle_path):
            try:
                os.remove(pickle_path)
            except OSError as e:
                logger.error(f"Error deleting session pickle: {e}")

        logger.info(f"Robinhood client logged out for '{profile_name}'.")

    # ─────────────────────────────────────────────────────────
    # Public Yahoo Finance API Fallback (Zero Dependencies)
    # ─────────────────────────────────────────────────────────

    def fetch_public_quote(self, ticker: str) -> float:
        """Fetches the latest quote for a ticker from public Yahoo Finance API without authentication."""
        try:
            import urllib.request
            import json
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker.upper()}?range=1d&interval=1m"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=5) as res:
                data = json.loads(res.read())
                result = data['chart']['result'][0]
                price = result['meta']['regularMarketPrice']
                return float(price)
        except Exception as e:
            logger.warning(f"Failed to fetch public quote for {ticker} from Yahoo Finance: {e}")
            return 100.0

    def fetch_public_historical_prices(self, ticker: str, span: str = "year") -> List[Dict[str, Any]]:
        """Retrieves historical prices from public Yahoo Finance API without authentication."""
        try:
            import urllib.request
            import json
            import datetime

            range_str = "1y" if span == "year" else ("1mo" if span == "month" else "5d")
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker.upper()}?range={range_str}&interval=1d"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})

            with urllib.request.urlopen(req, timeout=5) as res:
                data = json.loads(res.read())
                result = data['chart']['result'][0]

                formatted = []
                timestamps = result.get('timestamp', [])
                quote = result.get('indicators', {}).get('quote', [{}])[0]
                opens = quote.get('open', [])
                highs = quote.get('high', [])
                lows = quote.get('low', [])
                closes = quote.get('close', [])
                volumes = quote.get('volume', [])

                for i in range(len(timestamps)):
                    close_p = closes[i] if (i < len(closes) and closes[i] is not None) else None
                    if close_p is None:
                        continue
                    open_p = opens[i] if (i < len(opens) and opens[i] is not None) else close_p
                    high_p = highs[i] if (i < len(highs) and highs[i] is not None) else close_p
                    low_p = lows[i] if (i < len(lows) and lows[i] is not None) else close_p
                    vol = volumes[i] if (i < len(volumes) and volumes[i] is not None) else 0

                    d = datetime.datetime.fromtimestamp(timestamps[i])
                    formatted.append({
                        "begins_at": d.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "open_price": round(open_p, 2),
                        "close_price": round(close_p, 2),
                        "high_price": round(high_p, 2),
                        "low_price": round(low_p, 2),
                        "volume": int(vol)
                    })
                return formatted
        except Exception as e:
            logger.error(f"Failed to fetch public historicals for {ticker}: {e}")
            raise Exception(f"Failed to fetch historicals from public API: {e}")

    # ─────────────────────────────────────────────────────────
    # Holdings & Quote Methods
    # ─────────────────────────────────────────────────────────

    def get_holdings(self, profile_name: str) -> List[Dict[str, Any]]:
        """Retrieves active stock positions with isolated session pathing."""
        self.set_token_isolation(profile_name)

        if self.sandbox_mode:
            # Pull existing holdings from SQLite to preserve custom setups
            try:
                from database import get_db_connection
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT id FROM profiles WHERE name = ?", (profile_name,))
                    p_row = cursor.fetchone()
                    if p_row:
                        cursor.execute(
                            "SELECT ticker, shares, avg_buy_price, current_price FROM holdings WHERE profile_id = ?",
                            (p_row["id"],)
                        )
                        db_holdings = cursor.fetchall()
                        if db_holdings:
                            return [{
                                "ticker": h["ticker"],
                                "shares": h["shares"],
                                "avg_buy_price": h["avg_buy_price"],
                                "current_price": h["current_price"]
                            } for h in db_holdings]
            except Exception as e:
                logger.warning(f"Could not load custom holdings from SQLite: {e}")

            return []

        if not self.is_authenticated or not ROBIN_STOCKS_AVAILABLE:
            raise Exception("Client is not authenticated. Please log in first.")

        try:
            my_positions = r.build_holdings()
            holdings = []

            for ticker, details in my_positions.items():
                holdings.append({
                    "ticker": ticker,
                    "shares": float(details.get("quantity", 0.0)),
                    "avg_buy_price": float(details.get("average_buy_price", 0.0)),
                    "current_price": float(details.get("price", 0.0))
                })

            return holdings
        except Exception as e:
            logger.error(f"Error fetching live holdings for {profile_name}: {e}")
            raise Exception(f"Failed to fetch holdings: {e}")

    def get_latest_quote(self, ticker: str, profile_name: str = "default") -> float:
        """Fetches the latest real-time stock price with isolated token setup."""
        if self.sandbox_mode:
            return self.fetch_public_quote(ticker)

        self.set_token_isolation(profile_name)
        if not self.is_authenticated or not ROBIN_STOCKS_AVAILABLE:
            raise Exception("Client not authenticated.")

        try:
            price_list = r.stocks.get_latest_price(ticker)
            if price_list and len(price_list) > 0:
                return float(price_list[0])
            raise Exception("No quote returned.")
        except Exception as e:
            logger.error(f"Error pulling quote for {ticker}: {e}")
            raise Exception(f"Failed to get quote: {e}")

    def fetch_historical_prices(self, ticker: str, span: str = "year", profile_name: str = "default") -> List[Dict[str, Any]]:
        """Retrieves historical prices with isolated token setup."""
        if self.sandbox_mode:
            return self.fetch_public_historical_prices(ticker, span)

        self.set_token_isolation(profile_name)
        if not self.is_authenticated or not ROBIN_STOCKS_AVAILABLE:
            raise Exception("Client not authenticated.")

        try:
            historicals = r.stocks.get_stock_historicals(
                ticker,
                interval="day",
                span=span
            )

            formatted = []
            for h in historicals:
                formatted.append({
                    "begins_at": h.get("begins_at"),
                    "open_price": float(h.get("open_price", 0)),
                    "close_price": float(h.get("close_price", 0)),
                    "high_price": float(h.get("high_price", 0)),
                    "low_price": float(h.get("low_price", 0)),
                    "volume": int(h.get("volume", 0))
                })
            return formatted
        except Exception as e:
            logger.error(f"Error fetching historicals for {ticker}: {e}")
            raise Exception(f"Failed to fetch historicals: {e}")


# ─────────────────────────────────────────────────────────────
# Global singleton client instance
# ─────────────────────────────────────────────────────────────
robinhood_client = RobinhoodClient()
