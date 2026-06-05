// ./frontend/src/serverless/db/schema.js
/**
 * Canonical SQLite schema shared across Android, Tauri desktop, and dev.
 * Mirrors backend/database.py with JS-specific extensions (metadata JSON, indicators).
 */

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA secure_delete = ON;

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  robinhood_username TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  shares REAL DEFAULT 0.0,
  avg_buy_price REAL DEFAULT 0.0,
  current_price REAL DEFAULT 0.0,
  synced_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(profile_id, ticker)
);

CREATE TABLE IF NOT EXISTS guesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  target_price REAL NOT NULL,
  initial_price REAL NOT NULL,
  timeframe_days INTEGER DEFAULT 30,
  guess_date TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'pending',
  resolved_date TEXT,
  FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  rsi_weight REAL DEFAULT 0.25,
  macd_weight REAL DEFAULT 0.25,
  trend_weight REAL DEFAULT 0.25,
  gut_weight REAL DEFAULT 0.25,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(profile_id, ticker)
);

CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  added_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(profile_id, ticker)
);

CREATE TABLE IF NOT EXISTS user_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  ticker TEXT NOT NULL,
  shares REAL DEFAULT 0.0,
  price REAL DEFAULT 0.0,
  metadata_json TEXT DEFAULT '{}',
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_settings (
  profile_id INTEGER PRIMARY KEY,
  settings_json TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
`;
