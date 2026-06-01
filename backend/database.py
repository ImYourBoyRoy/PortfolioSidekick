# ./backend/database.py
"""
Portfolio Sidekick SQLite Database Management Layer
Utilizes Python's native sqlite3 engine to avoid SQLAlchemy incompatibilities with 
Python 3.14, maintaining a highly performant, zero-dependency storage system.

Responsibilities:
- Create database schemas for Profiles, Holdings, price guesses (Oracle), and weights.
- Provide clean, direct SQL query helpers to handle CRUD operations.
- Seed sample portfolio holdings on first boot for testing purposes.

Run: Loaded import by FastAPI backend, or python -c "from database import init_db; init_db()"
Inputs: Database URL (local file)
Outputs: SQL query outputs and initialized tables
Assumptions: Built-in sqlite3 operates locally in the backend folder.
"""

import os
import sqlite3
from datetime import datetime, timedelta

import sys

# Database path
if getattr(sys, 'frozen', False):
    # Running inside PyInstaller bundled executable - use directory of the executable for true portability
    EXE_DIR = os.path.dirname(sys.executable)
    DB_PATH = os.path.join(EXE_DIR, "portfolio_sidekick.db")
    OLD_DB_PATH = os.path.join(EXE_DIR, "stock_toolkit.db")
else:
    BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
    DB_PATH = os.path.join(BACKEND_DIR, "portfolio_sidekick.db")
    OLD_DB_PATH = os.path.join(BACKEND_DIR, "stock_toolkit.db")

# Seamless migration: if old database exists and new doesn't, rename it
if os.path.exists(OLD_DB_PATH) and not os.path.exists(DB_PATH):
    try:
        os.rename(OLD_DB_PATH, DB_PATH)
    except Exception:
        pass

def get_db_connection():
    """Returns a row-factory enabled SQLite connection with foreign keys enabled."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    """Creates the SQLite tables if they do not exist and seeds initial data."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Create Profiles table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        robinhood_username TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 2. Create Holdings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS holdings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER,
        ticker TEXT,
        shares REAL DEFAULT 0.0,
        avg_buy_price REAL DEFAULT 0.0,
        current_price REAL DEFAULT 0.0,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
    """)
    
    # 3. Create Guesses table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS guesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER,
        ticker TEXT,
        target_price REAL,
        initial_price REAL,
        guess_date TEXT DEFAULT CURRENT_TIMESTAMP,
        target_date TEXT,
        status TEXT DEFAULT 'pending',
        actual_end_price REAL,
        resolved_at TEXT,
        FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
    """)
    
    # 4. Create Weights table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS weights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER,
        ticker TEXT,
        rsi_weight REAL DEFAULT 0.25,
        macd_weight REAL DEFAULT 0.25,
        ema_weight REAL DEFAULT 0.25,
        gut_weight REAL DEFAULT 0.25,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
    """)
    
    # 5. Create Watchlist table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER,
        ticker TEXT,
        added_at TEXT DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE(profile_id, ticker)
    )
    """)
    
    # 6. Create User Actions / Audits table (Shadow Coach)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER,
        action_type TEXT,        -- 'BUY', 'SELL', 'GUESS', 'WATCHLIST_ADD', 'WATCHLIST_REMOVE'
        ticker TEXT,
        shares REAL DEFAULT 0.0,
        price REAL DEFAULT 0.0,
        rsi REAL DEFAULT 50.0,
        macd_line REAL DEFAULT 0.0,
        macd_signal REAL DEFAULT 0.0,
        macd_hist REAL DEFAULT 0.0,
        bollinger_upper REAL DEFAULT 0.0,
        bollinger_mid REAL DEFAULT 0.0,
        bollinger_lower REAL DEFAULT 0.0,
        advisor_rec TEXT DEFAULT 'HOLD',
        advisor_score REAL DEFAULT 50.0,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
    """)
    
    conn.commit()
    conn.close()

def seed_sandbox_data(conn, profile_id):
    """Seeds a profile with sample portfolio holdings and default weights for testing."""
    cursor = conn.cursor()
    
    # Sample portfolio holdings for testing
    initial_holdings = [
        ("QBTS", 61.29, 29.87, 29.87),
        ("RGTI", 45.56, 25.41, 25.41),
        ("ZYNE", 1.0, 10.0, 10.0),
        ("SLRC", 50.84, 13.08, 13.08),
        ("ARKK", 19.0, 81.83, 81.83),
        ("NVDA", 41.35, 212.49, 212.49),
        ("AMD", 15.97, 515.13, 515.13),
        ("IONQ", 55.83, 71.05, 71.05),
        ("AVGO", 4.64, 446.07, 446.07),
        ("PLTR", 8.13, 156.38, 156.38),
        ("TSM", 4.62, 419.23, 419.23),
        ("INTC", 112.91, 115.33, 115.33),
        ("NUKZ", 7.98, 2.39, 2.39),
        ("NLR", 3.46, 133.18, 133.18)
    ]
    
    for ticker, shares, avg_buy, current in initial_holdings:
        cursor.execute("""
        INSERT INTO holdings (profile_id, ticker, shares, avg_buy_price, current_price)
        VALUES (?, ?, ?, ?, ?)
        """, (profile_id, ticker, shares, avg_buy, current))
        
        cursor.execute("""
        INSERT INTO weights (profile_id, ticker, rsi_weight, macd_weight, ema_weight, gut_weight)
        VALUES (?, ?, 0.25, 0.25, 0.25, 0.25)
        """, (profile_id, ticker))
        
    conn.commit()

def seed_sandbox_actions(conn, profile_id):
    """Seeds a profile with detailed sample actions to demonstrate Shadow Coach AI behavior on first boot."""
    cursor = conn.cursor()
    
    # 1. Oversold Sniper Buy (ZYNE)
    cursor.execute("""
    INSERT INTO user_actions (profile_id, action_type, ticker, shares, price, rsi, macd_line, macd_signal, macd_hist, bollinger_upper, bollinger_mid, bollinger_lower, advisor_rec, advisor_score, timestamp)
    VALUES (?, 'BUY', 'ZYNE', 1.0, 10.0, 24.5, -1.2, -0.9, -0.3, 15.4, 12.8, 10.2, 'BUY', 86.4, ?)
    """, (profile_id, (datetime.now() - timedelta(days=15)).strftime("%Y-%m-%d %H:%M:%S")))
    
    # 2. FOMO Chase Buy (NVDA)
    cursor.execute("""
    INSERT INTO user_actions (profile_id, action_type, ticker, shares, price, rsi, macd_line, macd_signal, macd_hist, bollinger_upper, bollinger_mid, bollinger_lower, advisor_rec, advisor_score, timestamp)
    VALUES (?, 'BUY', 'NVDA', 10.0, 235.00, 79.2, 8.4, 6.2, 2.2, 220.0, 205.0, 190.0, 'HOLD', 35.8, ?)
    """, (profile_id, (datetime.now() - timedelta(days=12)).strftime("%Y-%m-%d %H:%M:%S")))
    
    # 3. Panic Capitulation Sell (SLRC)
    cursor.execute("""
    INSERT INTO user_actions (profile_id, action_type, ticker, shares, price, rsi, macd_line, macd_signal, macd_hist, bollinger_upper, bollinger_mid, bollinger_lower, advisor_rec, advisor_score, timestamp)
    VALUES (?, 'SELL', 'SLRC', 15.0, 11.20, 22.8, -0.6, -0.4, -0.2, 13.8, 12.5, 11.3, 'HOLD', 42.1, ?)
    """, (profile_id, (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")))
    
    # 4. Watchlist addition (SPY)
    cursor.execute("""
    INSERT INTO user_actions (profile_id, action_type, ticker, shares, price, rsi, macd_line, macd_signal, macd_hist, bollinger_upper, bollinger_mid, bollinger_lower, advisor_rec, advisor_score, timestamp)
    VALUES (?, 'WATCHLIST_ADD', 'SPY', 0.0, 510.50, 52.5, 1.4, 1.2, 0.2, 515.0, 508.0, 501.0, 'HOLD', 51.2, ?)
    """, (profile_id, (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")))

    conn.commit()

if __name__ == "__main__":
    init_db()
