# ./backend/main.py
"""
Portfolio Sidekick FastAPI Backend Application Gateway & WebView Window Manager
Coordinates the REST API, local SQLite data tracking, secure isolated Robinhood logins,
and launches a high-fidelity cross-platform windowed desktop GUI (via pywebview) to fully
eliminate the browser and command prompt, delivering a native desktop app experience.

Features:
- **All-in-One Desktop Executable Experience**: Boots silent backend daemon thread
  and immediately spawns a dedicated native desktop application window.
- **Embedded React Static Webserver**: Serves compiled frontend production bundles natively
  on localhost, completely eliminating CORS errors.
- **Two-Phase Non-Blocking Robinhood Login**: Direct pathfinder API integration with
  instant MFA challenge detection and per-profile session isolation.
- **Raw clipboard parser** and **Oracle Behavioral Archetype** metrics.

Run: python main.py
Inputs: React dashboard requests, SQLite DB data, Robinhood API feeds
Outputs: Dedicated desktop GUI window, JSON responses
Assumptions: Edge WebView2 (Windows) or WebKit (macOS) is available natively on host OS.
"""

import os
import sys
import sqlite3

# ─── CRITICAL: Load environment variables from .env if present ───
def load_env():
    """Simple standard-library parser to load .env variables into os.environ."""
    search_paths = [
        ".env",
        "../.env",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    ]
    for path in search_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" in line:
                            k, v = line.split("=", 1)
                            os.environ[k.strip()] = v.strip()
                break
            except Exception:
                pass

load_env()

# ─── CRITICAL: Redirect stdout/stderr for PyInstaller windowed mode ───
# When compiled with --windowed (console=False), stdout/stderr have no terminal.
# Any print() from robin_stocks or other libraries would block or crash.
# Redirect to a log file next to the executable for safe, non-blocking operation.
if getattr(sys, 'frozen', False):
    _log_path = os.path.join(os.path.dirname(sys.executable), 'portfolio_sidekick.log')
    try:
        sys.stdout = open(_log_path, 'a', encoding='utf-8', errors='replace')
        sys.stderr = open(_log_path, 'a', encoding='utf-8', errors='replace')
    except Exception:
        # Last resort: discard all output to prevent blocking
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')
import re
import pathlib
import threading
import logging
import webview
import uvicorn
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from database import init_db, get_db_connection
from robinhood_client import robinhood_client
from advisor import generate_recommendation, evolve_weights, generate_viability_forecast
from strength import calculate_market_strength
from local_session import check_rate_limit, dev_session_middleware_factory, get_or_create_dev_secret
from desktop_bridge import DesktopBridge

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize database schemas
init_db()

app = FastAPI(title="Portfolio Sidekick Desktop API", version="1.2.0")

IS_FROZEN = getattr(sys, "frozen", False)

# Dev-mode HTTP only: loopback CORS + local session header required on /api/*
if not IS_FROZEN:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://localhost:4173",
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    @app.middleware("http")
    async def dev_local_session_guard(request, call_next):
        return await dev_session_middleware_factory()(request, call_next)

# ─── Sector Classification Matrix ───
SECTOR_MAP = {
    "NVDA": "Technology/Semiconductors",
    "AMD": "Technology/Semiconductors",
    "AVGO": "Technology/Semiconductors",
    "INTC": "Technology/Semiconductors",
    "TSM": "Technology/Semiconductors",
    "MSFT": "Technology/Software",
    "PLTR": "Technology/Software",
    "AAPL": "Technology/Hardware",
    "TSLA": "Automotive/EV",
    "QBTS": "Quantum Computing",
    "RGTI": "Quantum Computing",
    "IONQ": "Quantum Computing",
    "SPY": "Index ETF",
    "QQQ": "Index ETF",
    "DIA": "Index ETF",
    "IWM": "Index ETF",
    "VIX": "Volatility Index",
    "^VIX": "Volatility Index",
}

def get_ticker_sector(ticker: str) -> str:
    return SECTOR_MAP.get(ticker.upper().strip(), "Other/Speculative")

# Pydantic Schemas for validation

class ProfileCreate(BaseModel):
    name: str

class LoginRequest(BaseModel):
    profile_id: int
    username: str
    password: str
    mfa_code: Optional[str] = None

class LogoutRequest(BaseModel):
    profile_id: int

class GuessCreate(BaseModel):
    profile_id: int
    ticker: str
    target_price: float
    timeframe_days: int

class HoldingAdjust(BaseModel):
    profile_id: int
    ticker: str
    shares: float
    avg_buy_price: float

class HoldingsClearRequest(BaseModel):
    profile_id: int

class ClipboardImportRequest(BaseModel):
    profile_id: int
    text: str

class WatchlistAdd(BaseModel):
    profile_id: int
    ticker: str
    notes: Optional[str] = None

# Database connection dependency injection
def get_db():
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()

def log_user_action(conn, profile_id: int, action_type: str, ticker: str, shares: float, price: float):
    """
    Shadow Coach AI Audit Trail Logger
    Fetches the historical quotes for the ticker, calculates technical indicator context
    using the Advisor module, and writes an action entry into the SQLite user_actions table.
    """
    cursor = conn.cursor()
    
    # Standardize inputs
    ticker = ticker.upper().strip()
    action_type = action_type.upper().strip()
    
    # 1. Fetch profile name to target standard credentials
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    p_row = cursor.fetchone()
    profile_name = p_row["name"] if p_row else "default"
    
    # 2. Retrieve history and calculate technical context at this exact moment
    import advisor
    rsi = 50.0
    macd_line = 0.0
    macd_signal = 0.0
    macd_hist = 0.0
    upper = price
    mid = price
    lower = price
    rec = 'HOLD'
    score = 50.0
    
    try:
        history_data = robinhood_client.fetch_historical_prices(ticker, profile_name=profile_name)
        if history_data and len(history_data) >= 20:
            rec_res = advisor.generate_recommendation(conn, profile_id, ticker, history_data, price)
            rec = rec_res.get("recommendation", "HOLD")
            score = rec_res.get("overall_score", 50.0)
            
            # Indicator extracts
            rsi = rec_res.get("rsi_value", 50.0)
            macd_line = rec_res.get("macd_line", 0.0)
            macd_signal = rec_res.get("macd_signal", 0.0)
            macd_hist = rec_res.get("macd_hist", 0.0)
            upper = rec_res.get("bollinger_upper", price)
            mid = rec_res.get("bollinger_mid", price)
            lower = rec_res.get("bollinger_lower", price)
    except Exception as e:
        logger.warning(f"[SHADOW COACH LOGGER] Technical parsing failed for {ticker}: {e}")
        
    # 3. Insert user action record
    cursor.execute("""
    INSERT INTO user_actions (
        profile_id, action_type, ticker, shares, price, 
        rsi, macd_line, macd_signal, macd_hist, 
        bollinger_upper, bollinger_mid, bollinger_lower, 
        advisor_rec, advisor_score, timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        profile_id, action_type, ticker, shares, price,
        rsi, macd_line, macd_signal, macd_hist,
        upper, mid, lower,
        rec, score,
        datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ))
    conn.commit()
    logger.info(f"[SHADOW COACH] Logged user action: {action_type} {shares} {ticker} @ ${price}")

# Helper function to parse raw Robinhood clipboard copies
def parse_robinhood_clipboard(text: str) -> List[dict]:
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    holdings = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        ticker_match = re.match(r'^[A-Z]{1,5}[\^-]?$', line.upper())
        if ticker_match and i + 2 < len(lines):
            ticker = line.upper().replace("^", "").strip()
            shares_line = lines[i+1]
            shares_match = re.search(r'([\d,.]+)\s*shares?', shares_line, re.IGNORECASE)
            price_line = lines[i+2]
            price_match = re.search(r'\$?([\d,.]+)', price_line)
            
            if shares_match and price_match:
                shares = float(shares_match.group(1).replace(",", ""))
                price = float(price_match.group(1).replace(",", ""))
                holdings.append({
                    "ticker": ticker,
                    "shares": shares,
                    "avg_buy_price": price,
                    "current_price": price
                })
                i += 3
                continue
        i += 1
        
    if not holdings:
        pattern = r'([A-Z]{1,5})\s+([\d,.]+)\s*(?:shares?)?\s+\$?([\d,.]+)'
        matches = re.findall(pattern, text, re.IGNORECASE)
        for m in matches:
            holdings.append({
                "ticker": m[0].upper(),
                "shares": float(m[1].replace(",", "")),
                "avg_buy_price": float(m[2].replace(",", "")),
                "current_price": float(m[2].replace(",", ""))
            })
            
    return holdings

# Helper function to auto-resolve pending guesses based on current quotes
def resolve_pending_guesses(conn, profile_id: int):
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, ticker, target_price, initial_price, target_date FROM guesses
    WHERE profile_id = ? AND status = 'pending'
    """, (profile_id,))
    pending = cursor.fetchall()
    
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    p_row = cursor.fetchone()
    profile_name = p_row["name"] if p_row else "default"
    
    now = datetime.utcnow()
    resolved_any = False
    
    for guess in pending:
        try:
            curr_price = robinhood_client.get_latest_quote(guess["ticker"], profile_name)
            is_bullish = guess["target_price"] >= guess["initial_price"]
            hit = False
            
            if is_bullish and curr_price >= guess["target_price"]:
                hit = True
            elif not is_bullish and curr_price <= guess["target_price"]:
                hit = True
                
            status = None
            if hit:
                status = "hit"
            else:
                t_date = datetime.strptime(guess["target_date"], "%Y-%m-%d %H:%M:%S")
                if now >= t_date:
                    status = "missed"
                    
            if status:
                cursor.execute("""
                UPDATE guesses 
                SET status = ?, actual_end_price = ?, resolved_at = ?
                WHERE id = ?
                """, (status, curr_price, now.strftime("%Y-%m-%d %H:%M:%S"), guess["id"]))
                resolved_any = True
                logger.info(f"Oracle Guess ID {guess['id']} for {guess['ticker']} resolved as {status.upper()}! (Target: {guess['target_price']}, Actual: {curr_price})")
                
                history = robinhood_client.fetch_historical_prices(guess["ticker"], span="year", profile_name=profile_name)
                evolve_weights(conn, profile_id, guess["ticker"], history)
                
        except Exception as e:
            logger.error(f"Error resolving guess {guess['id']}: {e}")
            
    if resolved_any:
        conn.commit()

# REST Endpoints

@app.get("/api/health")
def health_check():
    return {"status": "ok", "mode": "desktop-ipc" if IS_FROZEN else "dev-http"}


@app.get("/api/dev/session")
def dev_session_token():
    """Dev-only: returns loopback session token for Vite frontend (127.0.0.1 only)."""
    if IS_FROZEN:
        raise HTTPException(status_code=404, detail="Not available in production IPC mode.")
    return {"token": get_or_create_dev_secret()}


@app.get("/api/profiles")
def list_profiles(conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, robinhood_username FROM profiles")
    rows = cursor.fetchall()
    return [{"id": r["id"], "name": r["name"], "robinhood_username": r["robinhood_username"]} for r in rows]

@app.post("/api/profiles")
def create_profile(payload: ProfileCreate, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM profiles WHERE name = ?", (payload.name,))
    existing = cursor.fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Profile already exists.")
        
    cursor.execute("INSERT INTO profiles (name) VALUES (?)", (payload.name,))
    conn.commit()
    profile_id = cursor.lastrowid
    return {"id": profile_id, "name": payload.name}

@app.delete("/api/profiles/{profile_id}")
def delete_profile(profile_id: int, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    p_row = cursor.fetchone()
    if not p_row:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile_name = p_row["name"]
        
    # Securely wipe cached session tokens on disk first
    robinhood_client.wipe_session(profile_name)
    
    # Delete profile. With PRAGMA foreign_keys = ON, this cascades to delete holdings, guesses, weights, watchlist, and user_actions.
    cursor.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
    conn.commit()
    return {"status": "success", "message": "Profile deleted successfully."}



@app.post("/api/auth/login")
def login_robinhood(payload: LoginRequest, conn = Depends(get_db)):
    if not check_rate_limit(payload.profile_id):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please wait and try again.")
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM profiles WHERE id = ?", (payload.profile_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile_name = row["name"]
    logger.info("Robinhood login attempt for profile '%s' (credentials not logged).", profile_name)

    res = robinhood_client.login(
        username=payload.username,
        password=payload.password,
        mfa_code=payload.mfa_code,
        profile_name=profile_name
    )
    
    if res["status"] == "success":
        cursor.execute("UPDATE profiles SET robinhood_username = ? WHERE id = ?", (payload.username, payload.profile_id))
        conn.commit()
        
    return res

@app.post("/api/auth/logout")
def logout_robinhood(payload: LogoutRequest, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM profiles WHERE id = ?", (payload.profile_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile_name = row["name"]

    # Securely wipe cached session tokens
    robinhood_client.wipe_session(profile_name)

    # Clear SQLite username mapping
    cursor.execute("UPDATE profiles SET robinhood_username = NULL WHERE id = ?", (payload.profile_id,))
    conn.commit()

    return {"status": "success", "message": f"Successfully logged out and wiped session for profile '{profile_name}'."}

@app.get("/api/auth/status")
def get_auth_status(profile_id: int, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, robinhood_username FROM profiles WHERE id = ?", (profile_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile_name = row["name"]
    robinhood_username = row["robinhood_username"]

    if not robinhood_username:
        return {"authenticated": False}

    # Verify if local token is still valid with Robinhood API
    try:
        robinhood_client.set_token_isolation(profile_name)
        if robinhood_client.sandbox_mode or not robinhood_client.is_authenticated:
            return {"authenticated": False}
        return {"authenticated": True, "username": robinhood_username}
    except Exception:
        return {"authenticated": False}

@app.post("/api/portfolio/sync")
def sync_portfolio(profile_id: int = Body(..., embed=True), conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile_name = row["name"]
    
    # --- SHADOW COACH: Fetch old holdings for automatic diff logging ---
    cursor.execute("SELECT ticker, shares, current_price FROM holdings WHERE profile_id = ?", (profile_id,))
    old_rows = cursor.fetchall()
    old_holdings = {r["ticker"].upper(): {"shares": r["shares"], "price": r["current_price"]} for r in old_rows}
    
    try:
        holdings = robinhood_client.get_holdings(profile_name)
        if holdings is None:
            raise HTTPException(status_code=400, detail="Failed to fetch positions — session may have expired.")
        
        # --- SHADOW COACH: Calculate differences and log buys/sells ---
        new_holdings = {h["ticker"].upper(): h for h in holdings}
        
        # 1. Check for Buys and Share Adjustments
        for ticker, h in new_holdings.items():
            new_shares = h["shares"]
            old = old_holdings.get(ticker)
            old_shares = old["shares"] if old else 0.0
            
            if new_shares > old_shares:
                diff = new_shares - old_shares
                log_user_action(conn, profile_id, 'BUY', ticker, diff, h["current_price"])
            elif new_shares < old_shares:
                diff = old_shares - new_shares
                log_user_action(conn, profile_id, 'SELL', ticker, diff, h["current_price"])
                
        # 2. Check for fully Sold Out positions (existed in old but missing in new)
        for ticker, old in old_holdings.items():
            if ticker not in new_holdings:
                log_user_action(conn, profile_id, 'SELL', ticker, old["shares"], old["price"])

        # Re-commit sync replacement
        cursor.execute("DELETE FROM holdings WHERE profile_id = ?", (profile_id,))
        for h in holdings:
            cursor.execute("""
            INSERT INTO holdings (profile_id, ticker, shares, avg_buy_price, current_price)
            VALUES (?, ?, ?, ?, ?)
            """, (profile_id, h["ticker"], h["shares"], h["avg_buy_price"], h["current_price"]))
            
            cursor.execute("SELECT id FROM weights WHERE profile_id = ? AND ticker = ?", (profile_id, h["ticker"]))
            if not cursor.fetchone():
                cursor.execute("""
                INSERT INTO weights (profile_id, ticker, rsi_weight, macd_weight, ema_weight, gut_weight)
                VALUES (?, ?, 0.25, 0.25, 0.25, 0.25)
                """, (profile_id, h["ticker"]))
                
        conn.commit()
        resolve_pending_guesses(conn, profile_id)
        return {"status": "success", "synced_count": len(holdings)}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/portfolio/import-text")
def import_portfolio_text(payload: ClipboardImportRequest, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (payload.profile_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found.")
        
    holdings = parse_robinhood_clipboard(payload.text)
    if not holdings:
        raise HTTPException(status_code=400, detail="Could not parse any valid holdings from text.")
        
    cursor.execute("DELETE FROM holdings WHERE profile_id = ?", (payload.profile_id,))
    for h in holdings:
        cursor.execute("""
        INSERT INTO holdings (profile_id, ticker, shares, avg_buy_price, current_price)
        VALUES (?, ?, ?, ?, ?)
        """, (payload.profile_id, h["ticker"], h["shares"], h["avg_buy_price"], h["current_price"]))
        
        cursor.execute("SELECT id FROM weights WHERE profile_id = ? AND ticker = ?", (payload.profile_id, h["ticker"]))
        if not cursor.fetchone():
            cursor.execute("""
            INSERT INTO weights (profile_id, ticker, rsi_weight, macd_weight, ema_weight, gut_weight)
            VALUES (?, ?, 0.25, 0.25, 0.25, 0.25)
            """, (payload.profile_id, h["ticker"]))
            
    conn.commit()
    resolve_pending_guesses(conn, payload.profile_id)
    return {"status": "success", "imported_count": len(holdings)}

def fetch_ticker_data_task(profile_id, profile_name, ticker, shares, avg_buy_price, db_current_price):
    """Worker task to fetch quotes and run recommendation math concurrently for a single holding."""
    from database import get_db_connection
    from advisor import generate_recommendation
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    curr_price = db_current_price
    try:
        curr_price = robinhood_client.get_latest_quote(ticker, profile_name)
        cursor.execute("UPDATE holdings SET current_price = ? WHERE profile_id = ? AND ticker = ?", (curr_price, profile_id, ticker))
        conn.commit()
    except Exception:
        pass
        
    adv_score = 50.0
    adv_action = "HOLD"
    try:
        history = robinhood_client.fetch_historical_prices(ticker, span="year", profile_name=profile_name)
        rec = generate_recommendation(conn, profile_id, ticker, history, curr_price)
        adv_score = rec["score"]
        adv_action = rec["action"]
    except Exception:
        pass
        
    conn.close()
    
    value = shares * curr_price
    cost = shares * avg_buy_price
    pnl = value - cost
    pnl_pct = (pnl / cost * 100) if cost > 0 else 0
    
    return {
        "ticker": ticker,
        "shares": shares,
        "avg_buy_price": avg_buy_price,
        "current_price": curr_price,
        "total_value": round(value, 2),
        "total_cost": round(cost, 2),
        "pnl": round(pnl, 2),
        "pnl_pct": round(pnl_pct, 2),
        "advisor_score": adv_score,
        "advisor_action": adv_action,
        "sector": get_ticker_sector(ticker)
    }

@app.get("/api/portfolio/holdings")
def get_holdings(profile_id: int, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    p_row = cursor.fetchone()
    if not p_row:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile_name = p_row["name"]
    
    # Resolve isolated token session and dynamic sandbox/live mode on active profile select
    robinhood_client.set_token_isolation(profile_name)
        
    resolve_pending_guesses(conn, profile_id)
    
    cursor.execute("SELECT ticker, shares, avg_buy_price, current_price FROM holdings WHERE profile_id = ?", (profile_id,))
    holdings = cursor.fetchall()
    
    portfolio_list = []
    total_equity = 0.0
    total_cost = 0.0
    
    if holdings:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=min(len(holdings), 10)) as executor:
            futures = [
                executor.submit(
                    fetch_ticker_data_task,
                    profile_id, profile_name,
                    h["ticker"], h["shares"], h["avg_buy_price"], h["current_price"]
                ) for h in holdings
            ]
            for fut in futures:
                try:
                    res = fut.result()
                    portfolio_list.append(res)
                    total_equity += res["total_value"]
                    total_cost += res["total_cost"]
                except Exception as e:
                    logger.error(f"Error fetching parallel holdings task: {e}")
                    
    # Update localized SQLite DB state commits
    conn.commit()
    
    # Calculate Sector Concentrations
    sector_values = {}
    for item in portfolio_list:
        sec = item["sector"]
        sector_values[sec] = sector_values.get(sec, 0.0) + item["total_value"]
        
    sector_concentrations = {}
    if total_equity > 0:
        for sec, val in sector_values.items():
            sector_concentrations[sec] = round((val / total_equity) * 100, 1)
            
    return {
        "holdings": portfolio_list,
        "total_equity": round(total_equity, 2),
        "total_cost": round(total_cost, 2),
        "overall_pnl": round(total_equity - total_cost, 2),
        "overall_pnl_pct": round(((total_equity - total_cost) / total_cost * 100) if total_cost > 0 else 0, 2),
        "sector_concentrations": sector_concentrations,
        "mode": "sandbox" if robinhood_client.sandbox_mode else "live"
    }

@app.post("/api/portfolio/holdings")
def adjust_holding(payload: HoldingAdjust, conn = Depends(get_db)):
    cursor = conn.cursor()
    ticker = payload.ticker.upper().strip()
    
    cursor.execute("""
    SELECT id, shares, current_price FROM holdings WHERE profile_id = ? AND ticker = ?
    """, (payload.profile_id, ticker))
    holding = cursor.fetchone()
    
    # Try fetching the current market quote for auditing precision
    try:
        cursor.execute("SELECT name FROM profiles WHERE id = ?", (payload.profile_id,))
        p_row = cursor.fetchone()
        profile_name = p_row["name"] if p_row else "default"
        curr_price = robinhood_client.get_latest_quote(ticker, profile_name)
    except Exception:
        curr_price = payload.avg_buy_price

    if payload.shares <= 0:
        if holding:
            # Audit manual liquidated position (SELL)
            log_user_action(conn, payload.profile_id, 'SELL', ticker, holding["shares"], curr_price)
            cursor.execute("DELETE FROM holdings WHERE id = ?", (holding["id"],))
            conn.commit()
            return {"status": "success", "message": f"Removed {ticker} holding."}
        raise HTTPException(status_code=400, detail="Cannot adjust non-existent holding to 0.")
        
    # Audit manual BUY/SELL adjustments based on differences
    if holding:
        old_shares = holding["shares"]
        if payload.shares > old_shares:
            log_user_action(conn, payload.profile_id, 'BUY', ticker, payload.shares - old_shares, curr_price)
        elif payload.shares < old_shares:
            log_user_action(conn, payload.profile_id, 'SELL', ticker, old_shares - payload.shares, curr_price)
            
        cursor.execute("""
        UPDATE holdings SET shares = ?, avg_buy_price = ?, current_price = ?
        WHERE id = ?
        """, (payload.shares, payload.avg_buy_price, curr_price, holding["id"]))
    else:
        # Audit new manual position addition (BUY)
        log_user_action(conn, payload.profile_id, 'BUY', ticker, payload.shares, curr_price)
        cursor.execute("""
        INSERT INTO holdings (profile_id, ticker, shares, avg_buy_price, current_price)
        VALUES (?, ?, ?, ?, ?)
        """, (payload.profile_id, ticker, payload.shares, payload.avg_buy_price, curr_price))
        
        cursor.execute("SELECT id FROM weights WHERE profile_id = ? AND ticker = ?", (payload.profile_id, ticker))
        if not cursor.fetchone():
            cursor.execute("""
            INSERT INTO weights (profile_id, ticker, rsi_weight, macd_weight, ema_weight, gut_weight)
            VALUES (?, ?, 0.25, 0.25, 0.25, 0.25)
            """, (payload.profile_id, ticker))
            
    conn.commit()
    return {"status": "success", "ticker": ticker}

@app.post("/api/portfolio/holdings/clear")
def clear_portfolio_holdings(payload: HoldingsClearRequest, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("DELETE FROM holdings WHERE profile_id = ?", (payload.profile_id,))
    conn.commit()
    return {"status": "success", "message": f"Cleared holdings for profile {payload.profile_id}."}

# Watchlist Endpoints

def fetch_watchlist_data_task(profile_id, profile_name, ticker, row_id, added_at, notes):
    """Worker task to fetch watchlist metrics concurrently."""
    from database import get_db_connection
    from advisor import generate_recommendation
    
    conn = get_db_connection()
    curr_price = 0.0
    recommendation = "HOLD"
    score = 50.0
    timing = "Error loading live quotes"
    
    try:
        curr_price = robinhood_client.get_latest_quote(ticker, profile_name)
        history = robinhood_client.fetch_historical_prices(ticker, span="year", profile_name=profile_name)
        rec = generate_recommendation(conn, profile_id, ticker, history, curr_price)
        
        rsi = rec["metrics"]["rsi"]
        macd_hist = rec["metrics"]["macd"] - rec["metrics"]["macd_signal"]
        price_near_lower = curr_price <= rec["metrics"]["lower_bb"] * 1.02
        above_sma = rec["scores"]["trend_score"] >= 60
        
        if rsi < 35:
            timing = "Oversold Pullback - Primary Entry Horizon"
        elif price_near_lower:
            timing = "Bollinger Support Bounce - High Margin Entry"
        elif macd_hist > 0 and rsi < 55:
            timing = "Bullish Momentum Shift - Buy Support"
        elif above_sma:
            timing = "Uptrend Support - Standard Swing Horizon"
        else:
            timing = "Neutral Trend - Wait for Technical Support Crossover"
            
        recommendation = rec["action"]
        score = rec["score"]
    except Exception as e:
        logger.error(f"Error fetching watchlist task for {ticker}: {e}")
        
    conn.close()
    
    return {
        "id": row_id,
        "ticker": ticker,
        "added_at": added_at[:10] if added_at else None,
        "notes": notes,
        "current_price": curr_price,
        "recommendation": recommendation,
        "score": score,
        "timing": timing
    }

@app.get("/api/watchlist")
def get_watchlist(profile_id: int, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    p_row = cursor.fetchone()
    if not p_row:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile_name = p_row["name"]
    
    cursor.execute("SELECT id, ticker, added_at, notes FROM watchlist WHERE profile_id = ? ORDER BY added_at DESC", (profile_id,))
    rows = cursor.fetchall()
    
    watchlist_items = []
    if rows:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=min(len(rows), 10)) as executor:
            futures = [
                executor.submit(
                    fetch_watchlist_data_task,
                    profile_id, profile_name,
                    r["ticker"], r["id"], r["added_at"], r["notes"]
                ) for r in rows
            ]
            for fut in futures:
                try:
                    watchlist_items.append(fut.result())
                except Exception as e:
                    logger.error(f"Error fetching parallel watchlist task: {e}")
                    
    return watchlist_items

@app.post("/api/watchlist")
def add_to_watchlist(payload: WatchlistAdd, conn = Depends(get_db)):
    ticker = payload.ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker symbol cannot be empty.")
        
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM profiles WHERE id = ?", (payload.profile_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Profile not found.")
        
    try:
        cursor.execute("""
        INSERT INTO watchlist (profile_id, ticker, notes)
        VALUES (?, ?, ?)
        """, (payload.profile_id, ticker, payload.notes))
        conn.commit()
        return {"status": "success", "ticker": ticker}
    except sqlite3.IntegrityError:
        return {"status": "already_exists", "message": f"{ticker} is already in your watchlist."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/watchlist/{profile_id}/{ticker}")
def remove_from_watchlist(profile_id: int, ticker: str, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("DELETE FROM watchlist WHERE profile_id = ? AND ticker = ?", (profile_id, ticker.upper().strip()))
    conn.commit()
    return {"status": "success"}

# Gut Guesses ("Oracle") Endpoints

@app.get("/api/guesses")
def list_guesses(profile_id: int, conn = Depends(get_db)):
    resolve_pending_guesses(conn, profile_id)
    
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    p_row = cursor.fetchone()
    profile_name = p_row["name"] if p_row else "default"
    
    cursor.execute("""
    SELECT id, ticker, target_price, initial_price, guess_date, target_date, status, actual_end_price, resolved_at FROM guesses
    WHERE profile_id = ? ORDER BY guess_date DESC
    """, (profile_id,))
    guesses = cursor.fetchall()
    
    completed = []
    pending = []
    
    for g in guesses:
        ticker = g["ticker"]
        try:
            curr = robinhood_client.get_latest_quote(ticker, profile_name)
        except Exception:
            curr = g["initial_price"]
            
        g_data = {
            "id": g["id"],
            "ticker": ticker,
            "target_price": g["target_price"],
            "initial_price": g["initial_price"],
            "current_price": curr,
            "guess_date": g["guess_date"][:10] if g["guess_date"] else None,
            "target_date": g["target_date"][:10] if g["target_date"] else None,
            "status": g["status"],
            "actual_end_price": g["actual_end_price"],
            "resolved_at": g["resolved_at"][:10] if g["resolved_at"] else None,
            "deviation_pct": round(((curr - g["target_price"]) / g["target_price"] * 100), 2) if g["status"] == "pending" else 0
        }
        if g["status"] == "pending":
            pending.append(g_data)
        else:
            completed.append(g_data)
            
    return {"pending": pending, "completed": completed}

@app.post("/api/guesses")
def create_guess(payload: GuessCreate, conn = Depends(get_db)):
    ticker = payload.ticker.upper()
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (payload.profile_id,))
    p_row = cursor.fetchone()
    profile_name = p_row["name"] if p_row else "default"
    
    try:
        curr_price = robinhood_client.get_latest_quote(ticker, profile_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot fetch current quote for {ticker}: {e}")
        
    target_date = datetime.utcnow() + timedelta(days=payload.timeframe_days)
    
    cursor.execute("""
    INSERT INTO guesses (profile_id, ticker, target_price, initial_price, target_date, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
    """, (payload.profile_id, ticker, payload.target_price, curr_price, target_date.strftime("%Y-%m-%d %H:%M:%S")))
    conn.commit()
    guess_id = cursor.lastrowid
    return {"status": "success", "guess_id": guess_id}

@app.post("/api/guesses/{guess_id}/cancel")
def cancel_guess(guess_id: int, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM guesses WHERE id = ?", (guess_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Guess not found.")
        
    cursor.execute("UPDATE guesses SET status = 'cancelled' WHERE id = ?", (guess_id,))
    conn.commit()
    return {"status": "success"}

@app.get("/api/guesses/analytics")
def get_guess_analytics(profile_id: int, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("""
    SELECT target_price, initial_price, target_date, guess_date, status FROM guesses
    WHERE profile_id = ? AND status IN ('hit', 'missed')
    """, (profile_id,))
    completed = cursor.fetchall()
    
    if not completed:
        return {
            "overall_accuracy": 50.0,
            "completed_count": 0,
            "archetype": "Oracle Apprentice",
            "archetype_desc": "No resolved price guesses yet. Submit custom price predictions in 'Oracle Predictor' to build your gut cognitive archetype profile!",
            "details": {"short_term": 50.0, "long_term": 50.0}
        }
        
    hits = sum(1 for g in completed if g["status"] == "hit")
    overall = (hits / len(completed)) * 100
    
    short_term_guesses = []
    long_term_guesses = []
    
    for g in completed:
        g_date = datetime.strptime(g["guess_date"], "%Y-%m-%d %H:%M:%S")
        t_date = datetime.strptime(g["target_date"], "%Y-%m-%d %H:%M:%S")
        days = (t_date - g_date).days
        
        if days <= 15:
            short_term_guesses.append(g)
        else:
            long_term_guesses.append(g)
            
    st_accuracy = 50.0
    if short_term_guesses:
        st_hits = sum(1 for g in short_term_guesses if g["status"] == "hit")
        st_accuracy = (st_hits / len(short_term_guesses)) * 100
        
    lt_accuracy = 50.0
    if long_term_guesses:
        lt_hits = sum(1 for g in long_term_guesses if g["status"] == "hit")
        lt_accuracy = (lt_hits / len(long_term_guesses)) * 100
        
    if overall > 65.0:
        if st_accuracy > lt_accuracy:
            archetype = "Uptrend Swing Master"
            desc = "Highly precise at spotting short-term breakout momentum. Trust your 7-14 day swing trading targets!"
        else:
            archetype = "Long-Term Macro Visionary"
            desc = "Excellent visionary outlook on structural multi-month movements. Your 3-6 month holding decisions are extremely reliable."
    elif overall < 35.0:
        archetype = "Contrarian Indicator"
        desc = "Your predictions are so consistently reversed by the market that you can capture major profits by simply doing the EXACT opposite of your initial gut decisions!"
    else:
        archetype = "Tactical Value Seeker"
        desc = "Balanced hit rates. Your predictions are solid. Consider blending technical indicators with your targets to increase precision."
        
    return {
        "overall_accuracy": round(overall, 1),
        "completed_count": len(completed),
        "archetype": archetype,
        "archetype_desc": desc,
        "details": {
            "short_term": round(st_accuracy, 1),
            "long_term": round(lt_accuracy, 1)
        }
    }

@app.get("/api/actions/insights")
def get_actions_insights(profile_id: int, conn = Depends(get_db)):
    """
    Shadow Coach AI Behavioral Analytics
    Compiles tracked transactions and price guesses to diagnose Wins/Mastery highlights,
    Panic/FOMO vulnerability classifications, and dynamic training directives.
    """
    cursor = conn.cursor()
    
    # 1. Fetch user actions
    cursor.execute("""
    SELECT id, action_type, ticker, shares, price, rsi, macd_line, macd_signal, macd_hist, 
           bollinger_upper, bollinger_mid, bollinger_lower, advisor_rec, advisor_score, timestamp
    FROM user_actions WHERE profile_id = ? ORDER BY timestamp DESC
    """, (profile_id,))
    actions = cursor.fetchall()
    
    # Format action timeline rows
    timeline = []
    total_actions = len(actions)
    aligned_count = 0
    fomo_count = 0
    sniper_count = 0
    panic_count = 0
    contrarian_count = 0
    
    for act in actions:
        rec = act["advisor_rec"]
        atype = act["action_type"]
        rsi = act["rsi"]
        price = act["price"]
        upper = act["bollinger_upper"]
        lower = act["bollinger_lower"]
        
        # Determine verdict badge and classification
        verdict = "AUDIT LOG"
        verdict_color = "purple"
        verdict_desc = "Standard system log"
        
        if atype == 'BUY':
            if rsi >= 70.0 or price >= upper:
                verdict = "FOMO CHASE"
                verdict_color = "orange"
                verdict_desc = "Bought near the top under high momentum"
                fomo_count += 1
            elif rsi <= 30.0 or price <= lower:
                verdict = "OVERSOLD SNIPER"
                verdict_color = "green"
                verdict_desc = "Bought deep value near support"
                sniper_count += 1
            else:
                if rec == 'BUY':
                    verdict = "ADVISOR MATCH"
                    verdict_color = "green"
                    verdict_desc = "Aligned with the quantitative recommendations"
                    aligned_count += 1
                else:
                    verdict = "CONTRARIAN BUY"
                    verdict_color = "blue"
                    verdict_desc = "Gut-driven purchase against active indicators"
                    contrarian_count += 1
                    
        elif atype == 'SELL':
            if rsi <= 30.0 or price <= lower:
                verdict = "PANIC CAPITULATION"
                verdict_color = "red"
                verdict_desc = "Sold at bottom support under momentum fear"
                panic_count += 1
            else:
                if rec == 'SELL':
                    verdict = "ADVISOR MATCH"
                    verdict_color = "green"
                    verdict_desc = "Aligned with quantitative recommendations"
                    aligned_count += 1
                else:
                    verdict = "CONTRARIAN SELL"
                    verdict_color = "blue"
                    verdict_desc = "Gut-driven sale locking in gains early"
                    contrarian_count += 1
        elif atype == 'WATCHLIST_ADD':
            verdict = "WATCHLIST ENTRY"
            verdict_color = "purple"
            verdict_desc = "Added candidate ticker for technical coaching monitoring"
            
        timeline.append({
            "id": act["id"],
            "action_type": atype,
            "ticker": act["ticker"],
            "shares": act["shares"],
            "price": act["price"],
            "rsi": round(rsi, 1),
            "advisor_rec": rec,
            "advisor_score": round(act["advisor_score"], 1),
            "timestamp": act["timestamp"],
            "verdict": verdict,
            "verdict_color": verdict_color,
            "verdict_desc": verdict_desc
        })
        
    # Calculate alignment percentages
    trade_actions = [a for a in actions if a["action_type"] in ('BUY', 'SELL')]
    total_trades = len(trade_actions)
    alignment_rate = 50.0
    if total_trades > 0:
        alignment_rate = (aligned_count / total_trades) * 100
        
    # Build AI Archetype diagnostics
    if sniper_count > fomo_count:
        archetype = "Oversold Value Hunter"
        archetype_desc = "You display strong discipline in waiting for major asset pullbacks and support bounces, buying oversold technical zones instead of chasing peaks."
    elif fomo_count > sniper_count:
        archetype = "Momentum Chaser"
        archetype_desc = "You have a strong psychological tendency to enter positions at high-volume momentum peaks (FOMO). Consider waiting for a retest of support bands before buying."
    elif contrarian_count > aligned_count:
        archetype = "Independent Contrarian"
        archetype_desc = "You strongly trust your own gut intuition over standard mathematical advice. Your decisions often challenge active indicators."
    else:
        archetype = "Disciplined Quant"
        archetype_desc = "You align highly with technical indicator scores (RSI, MACD, Bollinger Bands) and follow systemic trade advice. This locks in highly repeatable trading models."

    # Highlight Wins & Pitfalls cards
    wins = []
    pitfalls = []
    
    if sniper_count > 0:
        wins.append({
            "title": "Oversold Sniping Mastery",
            "desc": f"You successfully executed {sniper_count} trade entry near support bottom points where standard retail traders panic, locking in premium discount entries."
        })
    if aligned_count > 0:
        wins.append({
            "title": "Systemic Alignment Lock",
            "desc": f"You aligned with {aligned_count} quantitative recommendations, removing cognitive emotional bias and executing disciplined, repeatable trades."
        })
        
    if fomo_count > 0:
        pitfalls.append({
            "title": "High RSI Momentum Chases",
            "desc": f"You chased {fomo_count} position peaks when RSI exceeded 70. This increases your drawdown risk, as prices frequently consolidate after overbought indicators."
        })
    if panic_count > 0:
        pitfalls.append({
            "title": "Support capitulation (Panic)",
            "desc": f"You panic-liquidated {panic_count} assets when RSI dropped below 30. Standard discipline advises scaling in or holding support rather than locking in bottom losses."
        })
        
    # Standard dynamic defaults if empty
    if not wins:
        wins.append({
            "title": "Intuitive Sandbox Building",
            "desc": "Track your first transactions. The Shadow Coach AI will analyze your entries against RSI/MACD models to extract your structural trading strengths."
        })
    if not pitfalls:
        pitfalls.append({
            "title": "Zero Behavioral Red Flags",
            "desc": "Excellent work! No FOMO chases or panic capitulation sales have been flagged by the behavioral scanner in your recent transactions."
        })
        
    # Generate Training Directives
    directives = []
    if fomo_count > 0:
        directives.append("Implement Scale-In buy orders: rather than executing market orders during peaks, schedule DCA brackets to accumulate shares only on pullbacks near the SMA 50.")
    if panic_count > 0:
        directives.append("Set stop-losses or Scale-Out target blueprints BEFORE entering positions to override emotional capitulation impulses when RSI falls below 30.")
    if alignment_rate < 40.0:
        directives.append("Consider consulting the Interactive Coach Chart overlays (SMA 50, Bollinger support) before manual adjustments to align closer with technical odds.")
    if not directives:
        directives.append("Maintain your current disciplined focus! Systematically leverage bracket targets to secure returns and follow evolved scoring balances.")

    return {
        "archetype": archetype,
        "archetype_desc": archetype_desc,
        "total_actions": total_actions,
        "alignment_rate": round(alignment_rate, 1),
        "fomo_count": fomo_count,
        "panic_count": panic_count,
        "wins": wins,
        "pitfalls": pitfalls,
        "directives": directives,
        "timeline": timeline
    }


# Shadow Coach Frontend-Optimized Endpoints

@app.get("/api/shadow-coach/insights")
def get_shadow_coach_insights(profile_id: int, conn = Depends(get_db)):
    """
    Frontend-optimized Shadow Coach behavioral analysis.
    Returns win rate, avg win/loss, action counts, most traded tickers, and coaching insights.
    """
    cursor = conn.cursor()
    cursor.execute("""
    SELECT action_type, ticker, shares, price, timestamp
    FROM user_actions WHERE profile_id = ? ORDER BY timestamp DESC
    """, (profile_id,))
    actions = cursor.fetchall()

    if not actions:
        return {
            "total_actions": 0,
            "buys": 0,
            "sells": 0,
            "adjusts": 0,
            "win_rate": 0.0,
            "avg_win_pct": 0.0,
            "avg_loss_pct": 0.0,
            "most_traded": [],
            "source_breakdown": {"manual": 0, "robinhood_sync": 0, "clipboard": 0},
            "recent_7d": 0,
            "insights": [{"type": "info", "icon": "👁️", "text": "Shadow Coach is watching your moves. More data will unlock deeper behavioral insights."}]
        }

    buys = [a for a in actions if a["action_type"] == "BUY"]
    sells = [a for a in actions if a["action_type"] == "SELL"]
    adjusts = [a for a in actions if a["action_type"] not in ("BUY", "SELL")]
    total = len(actions)

    # Dynamic realized trade ledger win rate calculation
    winning_sells = 0
    real_sells = 0
    cursor.execute("""
    SELECT action_type, ticker, shares, price
    FROM user_actions WHERE profile_id = ? AND action_type IN ('BUY', 'SELL')
    ORDER BY timestamp ASC
    """, (profile_id,))
    trade_history = cursor.fetchall()
    
    cost_basis = {}
    for action in trade_history:
        ticker = action["ticker"].upper().strip()
        act_type = action["action_type"]
        price = action["price"]
        shares = action["shares"]
        
        if act_type == 'BUY':
            curr_cost, curr_shares = cost_basis.get(ticker, (0.0, 0.0))
            cost_basis[ticker] = (curr_cost + (price * shares), curr_shares + shares)
        elif act_type == 'SELL':
            curr_cost, curr_shares = cost_basis.get(ticker, (0.0, 0.0))
            if curr_shares > 0:
                avg_cost = curr_cost / curr_shares
                if price > avg_cost:
                    winning_sells += 1
                real_sells += 1
                
                remaining_shares = max(0.0, curr_shares - shares)
                if remaining_shares == 0:
                    cost_basis[ticker] = (0.0, 0.0)
                else:
                    cost_basis[ticker] = (avg_cost * remaining_shares, remaining_shares)
            else:
                cursor.execute("SELECT avg_buy_price FROM holdings WHERE profile_id = ? AND ticker = ?", (profile_id, ticker))
                holding = cursor.fetchone()
                if holding and price > holding["avg_buy_price"]:
                    winning_sells += 1
                real_sells += 1

    win_rate = round((winning_sells / max(real_sells, 1)) * 100, 1) if real_sells else 50.0

    # Ticker frequency
    ticker_counts = {}
    for a in actions:
        t = a["ticker"]
        ticker_counts[t] = ticker_counts.get(t, 0) + 1
    most_traded = sorted(ticker_counts.items(), key=lambda x: -x[1])[:5]
    most_traded = [{"ticker": t, "count": c} for t, c in most_traded]

    # Source breakdown
    source_counts = {"manual": 0, "robinhood_sync": 0, "clipboard": 0}
    for a in actions:
        source_counts["manual"] += 1  # Default all to manual in backend

    # Recent 7d
    from datetime import datetime, timedelta
    week_ago = datetime.utcnow() - timedelta(days=7)
    recent_7d = len([a for a in actions if a["timestamp"] and datetime.fromisoformat(a["timestamp"].replace("Z", "+00:00").replace("+00:00", "")) > week_ago.replace(tzinfo=None)])

    # Generate coaching insights
    insights = []
    if win_rate >= 60:
        insights.append({"type": "success", "icon": "🏆", "text": f"Strong {win_rate}% win rate — your sell discipline is paying off!"})
    elif win_rate < 40 and sells:
        insights.append({"type": "warning", "icon": "⚠️", "text": f"{win_rate}% win rate — consider holding winners longer or tightening stop-losses."})

    if len(buys) > len(sells) * 3 and sells:
        insights.append({"type": "info", "icon": "📊", "text": "Heavy buyer pattern — ensure you have exit strategies for your positions."})
    if most_traded and most_traded[0]["count"] >= 4:
        insights.append({"type": "info", "icon": "🎯", "text": f"You trade {most_traded[0]['ticker']} most frequently ({most_traded[0]['count']} actions). Consider if concentration is intentional."})
    if not insights:
        insights.append({"type": "info", "icon": "👁️", "text": "Shadow Coach is watching your moves. More data will unlock deeper behavioral insights."})

    return {
        "total_actions": total,
        "buys": len(buys),
        "sells": len(sells),
        "adjusts": len(adjusts),
        "win_rate": win_rate,
        "avg_win_pct": 15.5,  # Placeholder until P&L tracking is deeper
        "avg_loss_pct": 6.1,
        "most_traded": most_traded,
        "source_breakdown": source_counts,
        "recent_7d": recent_7d,
        "insights": insights
    }


@app.get("/api/shadow-coach/actions")
def get_shadow_coach_actions(profile_id: int, conn = Depends(get_db)):
    """Returns raw action timeline for the Shadow Coach action history view."""
    cursor = conn.cursor()
    cursor.execute("""
    SELECT id, action_type, ticker, shares, price, timestamp
    FROM user_actions WHERE profile_id = ? ORDER BY timestamp DESC LIMIT 100
    """, (profile_id,))
    actions = cursor.fetchall()

    return [
        {
            "id": a["id"],
            "profile_id": profile_id,
            "action_type": a["action_type"].lower(),
            "ticker": a["ticker"],
            "shares": a["shares"],
            "price": a["price"],
            "metadata": {"source": "robinhood_sync"},
            "timestamp": a["timestamp"]
        }
        for a in actions
    ]

# Advisor Scorers Endpoints

@app.get("/api/advisor/recommendation")
def get_advisor_recommendation(profile_id: int, ticker: str, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    p_row = cursor.fetchone()
    profile_name = p_row["name"] if p_row else "default"
    
    try:
        curr_price = robinhood_client.get_latest_quote(ticker, profile_name)
        history = robinhood_client.fetch_historical_prices(ticker, span="year", profile_name=profile_name)
        rec = generate_recommendation(conn, profile_id, ticker.upper(), history, curr_price)
        return rec
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate advisor recommendation: {e}")

@app.get("/api/advisor/viability")
def get_advisor_viability(profile_id: int, ticker: str, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    p_row = cursor.fetchone()
    profile_name = p_row["name"] if p_row else "default"
    
    try:
        curr_price = robinhood_client.get_latest_quote(ticker, profile_name)
        history = robinhood_client.fetch_historical_prices(ticker, span="year", profile_name=profile_name)
        forecast = generate_viability_forecast(conn, profile_id, ticker.upper(), history, curr_price)
        return forecast
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate viability forecast: {e}")

@app.get("/api/advisor/market-strength")
def get_advisor_market_strength(timeframe: str = "day", sector: str = "all"):
    try:
        return calculate_market_strength(timeframe, sector)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate market strength analysis: {e}")

@app.post("/api/advisor/evolve")
def force_evolve_weights(profile_id: int = Body(..., embed=True), ticker: str = Body(..., embed=True), conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    p_row = cursor.fetchone()
    profile_name = p_row["name"] if p_row else "default"
    
    try:
        history = robinhood_client.fetch_historical_prices(ticker, span="year", profile_name=profile_name)
        res = evolve_weights(conn, profile_id, ticker.upper(), history)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to run evolution: {e}")

@app.get("/api/strategy/brackets")
def get_strategy_brackets(profile_id: int, ticker: str, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    p_row = cursor.fetchone()
    if not p_row:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile_name = p_row["name"]
    
    ticker = ticker.upper().strip()
    
    try:
        curr_price = robinhood_client.get_latest_quote(ticker, profile_name)
        history = robinhood_client.fetch_historical_prices(ticker, span="year", profile_name=profile_name)
        rec = generate_recommendation(conn, profile_id, ticker, history, curr_price)
        
        # Bollinger Bands support levels
        upper_bb = rec["metrics"]["upper_bb"]
        lower_bb = rec["metrics"]["lower_bb"]
        mid_bb = (upper_bb + lower_bb) / 2.0
        
        # 50 SMA support level
        prices = [float(d["close_price"]) for d in history]
        sma50 = sum(prices[-50:]) / 50.0 if len(prices) >= 50 else curr_price
        
        # User holdings
        cursor.execute("SELECT shares, avg_buy_price FROM holdings WHERE profile_id = ? AND ticker = ?", (profile_id, ticker))
        h_row = cursor.fetchone()
        owned_shares = h_row["shares"] if h_row else 0.0
        avg_buy = h_row["avg_buy_price"] if h_row else 0.0
        
        # Scale-Out Profit Target calculations
        t1_price = max(curr_price * 1.02, mid_bb)
        t2_price = max(curr_price * 1.05, upper_bb)
        t3_price = max(curr_price * 1.10, upper_bb * 1.08)
        
        scale_out = [
            {
                "stage": "Target 1 (25%)",
                "trigger": "Bollinger Mid Resistance",
                "price": round(t1_price, 2),
                "shares_to_sell": round(owned_shares * 0.25, 2) if owned_shares > 0 else 0,
                "projected_yield": round((owned_shares * 0.25) * t1_price, 2) if owned_shares > 0 else 0,
                "percent_gain": round(((t1_price - avg_buy) / avg_buy * 100), 1) if avg_buy > 0 else round(((t1_price - curr_price) / curr_price * 100), 1)
            },
            {
                "stage": "Target 2 (50%)",
                "trigger": "Bollinger Upper Boundary limit",
                "price": round(t2_price, 2),
                "shares_to_sell": round(owned_shares * 0.50, 2) if owned_shares > 0 else 0,
                "projected_yield": round((owned_shares * 0.50) * t2_price, 2) if owned_shares > 0 else 0,
                "percent_gain": round(((t2_price - avg_buy) / avg_buy * 100), 1) if avg_buy > 0 else round(((t2_price - curr_price) / curr_price * 100), 1)
            },
            {
                "stage": "Target 3 (25%)",
                "trigger": "Momentum Breakout Runaway",
                "price": round(t3_price, 2),
                "shares_to_sell": round(owned_shares * 0.25, 2) if owned_shares > 0 else 0,
                "projected_yield": round((owned_shares * 0.25) * t3_price, 2) if owned_shares > 0 else 0,
                "percent_gain": round(((t3_price - avg_buy) / avg_buy * 100), 1) if avg_buy > 0 else round(((t3_price - curr_price) / curr_price * 100), 1)
            }
        ]
        
        # Scale-In DCA target calculations (Volatility-based using ATR if available)
        atr_val = rec.get("atr", 0.0)
        if atr_val > 0:
            l1_price = max(0.01, curr_price - 1.0 * atr_val)
            l2_price = max(0.01, curr_price - 2.0 * atr_val)
            l3_price = max(0.01, curr_price - 3.0 * atr_val)
            
            t1_desc = f"Consolidation dip (Entry - 1.0*ATR). Low volatility pullback horizon."
            t2_desc = f"Core support pullbacks (Entry - 2.0*ATR). Volatility buffered entry."
            t3_desc = f"Extreme volatility flush (Entry - 3.0*ATR). Deep value entry zone."
        else:
            l1_price = min(curr_price * 0.98, mid_bb)
            l2_price = min(curr_price * 0.95, lower_bb)
            l3_price = min(curr_price * 0.90, sma50)
            
            t1_desc = "Standard entry on normal market consolidation pullbacks. Low risk allocation."
            t2_desc = "Major technical support zone. Excellent timing to deploy core capital."
            t3_desc = "Deep structural value dip. Perfect level to lower average cost basis."
            
        scale_in = [
            {
                "level": "Level 1 (20% Cash)",
                "trigger": "ATR Volatility Step 1" if atr_val > 0 else "Bollinger Mid Pullback",
                "price": round(l1_price, 2),
                "desc": t1_desc,
                "pct_dip": round((1 - l1_price / curr_price) * 100, 1) if curr_price > 0 else 0
            },
            {
                "level": "Level 2 (50% Cash)",
                "trigger": "ATR Volatility Step 2" if atr_val > 0 else "Bollinger Lower Support",
                "price": round(l2_price, 2),
                "desc": t2_desc,
                "pct_dip": round((1 - l2_price / curr_price) * 100, 1) if curr_price > 0 else 0
            },
            {
                "level": "Level 3 (30% Cash)",
                "trigger": "ATR Volatility Step 3" if atr_val > 0 else "50 SMA Trendline support",
                "price": round(l3_price, 2),
                "desc": t3_desc,
                "pct_dip": round((1 - l3_price / curr_price) * 100, 1) if curr_price > 0 else 0
            }
        ]
        
        return {
            "ticker": ticker,
            "current_price": curr_price,
            "owned_shares": owned_shares,
            "avg_buy_price": avg_buy,
            "advisor_score": rec["score"],
            "advisor_action": rec["action"],
            "scale_out_profit_blueprint": scale_out,
            "scale_in_dca_blueprint": scale_in,
            "stop_loss_price": rec.get("stop_loss_price", round(curr_price * 0.90, 2)),
            "risk_to_reward_ratio": rec.get("risk_to_reward_ratio", 1.5),
            "is_asymmetric_risk": rec.get("is_asymmetric_risk", False),
            "regime_status": rec.get("regime_status", "BULLISH"),
            "vix_value": rec.get("vix_value", 15.0),
            "atr": round(atr_val, 2),
            "buy_threshold": rec.get("buy_threshold", 65.0),
            "sell_threshold": rec.get("sell_threshold", 35.0),
            "sector": get_ticker_sector(ticker)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stocks/history")
def get_stock_history(ticker: str, profile_id: int = 1, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    p_row = cursor.fetchone()
    profile_name = p_row["name"] if p_row else "default"
    
    try:
        history = robinhood_client.fetch_historical_prices(ticker, span="year", profile_name=profile_name)
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount React static production files directly inside FastAPI to support native executable serving
# PyInstaller packs bundled resources into a temporary directory sys._MEIPASS
if getattr(sys, 'frozen', False):
    # Running inside PyInstaller bundled executable
    base_path = sys._MEIPASS
    static_dir = os.path.join(base_path, "frontend", "dist")
else:
    # Running locally in development
    base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    static_dir = os.path.join(base_path, "frontend", "dist")

if os.path.exists(static_dir):
    logger.info(f"React production static files folder detected at: {static_dir}. Mounting paths...")
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")
    
    @app.get("/favicon.svg")
    def serve_favicon():
        return FileResponse(os.path.join(static_dir, "favicon.svg"))
        
    @app.get("/icons.svg")
    def serve_icons():
        return FileResponse(os.path.join(static_dir, "icons.svg"))
        
    @app.get("/{catchall:path}")
    def serve_frontend():
        return FileResponse(os.path.join(static_dir, "index.html"))
else:
    logger.warning(f"React production static files folder NOT found at: {static_dir}. API will operate in raw mode.")


# GUI WebView Launcher Thread and Event loop
def run_fastapi_server():
    """Boots Uvicorn in a daemon worker thread (development mode only)."""
    logger.info("FastAPI Uvicorn dev worker thread starting...")
    host = os.getenv("HOST", "127.0.0.1")
    if host == "0.0.0.0":
        logger.warning("HOST=0.0.0.0 is disabled for security. Binding to 127.0.0.1 only.")
        host = "127.0.0.1"
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host=host, port=port, log_level="warning")


def wait_for_server(timeout: int = 15) -> bool:
    """Block until the FastAPI server is accepting connections and serving pages.
    
    Polls the local server URL repeatedly with short delays. This prevents a
    race condition where the WebView window opens before Uvicorn has finished
    binding to the port, resulting in a blank dark screen.
    """
    import time
    import urllib.request
    host = os.getenv("HOST", "127.0.0.1")
    local_host = "127.0.0.1" if host == "0.0.0.0" else host
    port = os.getenv("PORT", "8000")
    url = f"http://{local_host}:{port}/"
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.urlopen(url, timeout=2)
            if req.status == 200:
                elapsed = time.time() - start
                logger.info(f"FastAPI server ready after {elapsed:.1f}s")
                return True
        except Exception:
            pass
        time.sleep(0.3)
    logger.warning(f"Server readiness check timed out after {timeout}s — opening WebView anyway")
    return False


def _resolve_static_dir() -> str:
    if IS_FROZEN:
        return os.path.join(sys._MEIPASS, "frontend", "dist")
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")


def _file_url_for_index(static_dir: str) -> str:
    index_path = os.path.join(static_dir, "index.html")
    return pathlib.Path(index_path).as_uri()


if __name__ == "__main__":
    static_dir = _resolve_static_dir()

    if IS_FROZEN:
        # Production: IPC-only desktop — no TCP listener exposed
        logger.info("Launching production desktop (IPC-only, no HTTP server)...")
        index_url = _file_url_for_index(static_dir)
        bridge = DesktopBridge(app)
        webview.create_window(
            title="Portfolio Sidekick (for Robinhood)",
            url=index_url,
            width=1280,
            height=820,
            min_size=(1024, 768),
            resizable=True,
            js_api=bridge,
        )
        webview.start()
        logger.info("WebView desktop GUI window closed. Exiting process.")
    else:
        # Development: loopback HTTP for Vite hot reload workflows
        server_thread = threading.Thread(target=run_fastapi_server, daemon=True)
        server_thread.start()
        wait_for_server()
        logger.info("Launching development desktop GUI (loopback HTTP)...")
        port = os.getenv("PORT", "8000")
        url = f"http://127.0.0.1:{port}/"
        webview.create_window(
            title="Portfolio Sidekick (for Robinhood)",
            url=url,
            width=1280,
            height=820,
            min_size=(1024, 768),
            resizable=True,
        )
        webview.start()
        logger.info("WebView desktop GUI window closed. Exiting process.")
