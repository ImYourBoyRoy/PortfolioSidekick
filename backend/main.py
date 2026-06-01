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
from advisor import generate_recommendation, evolve_weights

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize database schemas
init_db()

app = FastAPI(title="Portfolio Sidekick Desktop API", version="1.1.0")

# Setup CORS to allow secure connection with our local React Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    cursor.execute("SELECT id FROM profiles WHERE id = ?", (profile_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Profile not found.")
        
    # Delete profile and all CASCADE dependent data (holdings, guesses, weights)
    cursor.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
    conn.commit()
    return {"status": "success", "message": "Profile deleted successfully."}



@app.post("/api/auth/login")
def login_robinhood(payload: LoginRequest, conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT id, name FROM profiles WHERE id = ?", (payload.profile_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile_name = row["name"]
        
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

@app.post("/api/portfolio/sync")
def sync_portfolio(profile_id: int = Body(..., embed=True), conn = Depends(get_db)):
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM profiles WHERE id = ?", (profile_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found.")
    profile_name = row["name"]
    
    try:
        holdings = robinhood_client.get_holdings(profile_name)
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
    
    cursor.execute("SELECT id, ticker, shares, avg_buy_price, current_price FROM holdings WHERE profile_id = ?", (profile_id,))
    holdings = cursor.fetchall()
    
    portfolio_list = []
    total_equity = 0.0
    total_cost = 0.0
    
    for h in holdings:
        ticker = h["ticker"]
        try:
            curr_price = robinhood_client.get_latest_quote(ticker, profile_name)
            cursor.execute("UPDATE holdings SET current_price = ? WHERE id = ?", (curr_price, h["id"]))
        except Exception:
            curr_price = h["current_price"]
            
        value = h["shares"] * curr_price
        cost = h["shares"] * h["avg_buy_price"]
        pnl = value - cost
        pnl_pct = (pnl / cost * 100) if cost > 0 else 0
        
        total_equity += value
        total_cost += cost
        
        # Calculate dynamic advisor score and recommendation for portfolio tracking
        try:
            history = robinhood_client.fetch_historical_prices(ticker, span="year", profile_name=profile_name)
            rec = generate_recommendation(conn, profile_id, ticker, history, curr_price)
            adv_score = rec["score"]
            adv_action = rec["action"]
        except Exception:
            adv_score = 50.0
            adv_action = "HOLD"
            
        portfolio_list.append({
            "id": h["id"],
            "ticker": ticker,
            "shares": h["shares"],
            "avg_buy_price": h["avg_buy_price"],
            "current_price": curr_price,
            "total_value": round(value, 2),
            "total_cost": round(cost, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
            "advisor_score": adv_score,
            "advisor_action": adv_action,
            "sector": get_ticker_sector(ticker)
        })
        
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
    ticker = payload.ticker.upper()
    
    cursor.execute("""
    SELECT id, shares FROM holdings WHERE profile_id = ? AND ticker = ?
    """, (payload.profile_id, ticker))
    holding = cursor.fetchone()
    
    if payload.shares <= 0:
        if holding:
            cursor.execute("DELETE FROM holdings WHERE id = ?", (holding["id"],))
            conn.commit()
            return {"status": "success", "message": f"Removed {ticker} holding."}
        raise HTTPException(status_code=400, detail="Cannot adjust non-existent holding to 0.")
        
    try:
        cursor.execute("SELECT name FROM profiles WHERE id = ?", (payload.profile_id,))
        p_row = cursor.fetchone()
        profile_name = p_row["name"] if p_row else "default"
        curr_price = robinhood_client.get_latest_quote(ticker, profile_name)
    except Exception:
        curr_price = payload.avg_buy_price
        
    if holding:
        cursor.execute("""
        UPDATE holdings SET shares = ?, avg_buy_price = ?, current_price = ?
        WHERE id = ?
        """, (payload.shares, payload.avg_buy_price, curr_price, holding["id"]))
    else:
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

# Watchlist Endpoints

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
    for r in rows:
        ticker = r["ticker"]
        try:
            curr_price = robinhood_client.get_latest_quote(ticker, profile_name)
            history = robinhood_client.fetch_historical_prices(ticker, span="year", profile_name=profile_name)
            rec = generate_recommendation(conn, profile_id, ticker, history, curr_price)
            
            # Calculate timing trigger advice
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
                
            watchlist_items.append({
                "id": r["id"],
                "ticker": ticker,
                "added_at": r["added_at"][:10] if r["added_at"] else None,
                "notes": r["notes"],
                "current_price": curr_price,
                "recommendation": rec["action"],
                "score": rec["score"],
                "timing": timing
            })
        except Exception as e:
            logger.error(f"Error fetching quote/recommendation for watchlist stock {ticker}: {e}")
            watchlist_items.append({
                "id": r["id"],
                "ticker": ticker,
                "added_at": r["added_at"][:10] if r["added_at"] else None,
                "notes": r["notes"],
                "current_price": 0.0,
                "recommendation": "HOLD",
                "score": 50.0,
                "timing": "Error loading live quotes"
            })
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
    """Boots Uvicorn in a daemon worker thread."""
    logger.info("FastAPI Uvicorn worker thread starting...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

if __name__ == "__main__":
    # 1. Start FastAPI server silently in background thread
    server_thread = threading.Thread(target=run_fastapi_server, daemon=True)
    server_thread.start()
    
    # 2. Open standard windowed GUI natively using Edge WebView2 (Windows) / WebKit (Mac/Linux)
    logger.info("Launching standalone windowed desktop GUI panel...")
    webview.create_window(
        title="Portfolio Sidekick (for Robinhood)",
        url="http://127.0.0.1:8000/",
        width=1280,
        height=820,
        min_size=(1024, 768),
        resizable=True
    )
    # Start native operating system thread blocking loop (exits cleanly when window closes)
    webview.start()
    logger.info("WebView desktop GUI window closed. Exiting process...")
