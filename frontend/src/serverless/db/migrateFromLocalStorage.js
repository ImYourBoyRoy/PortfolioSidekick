// ./frontend/src/serverless/db/migrateFromLocalStorage.js
/**
 * One-time import from legacy localStorage keys into SQLite, then scrubs secrets
 * from localStorage. Robinhood session vault keys are handled separately by the
 * RobinhoodSession plugin — never imported into SQLite.
 */

const LEGACY_KEYS = [
  'st_profiles',
  'st_holdings',
  'st_guesses',
  'st_watchlist',
  'st_weights',
  'st_actions',
  'st_settings',
  'st_indicators',
];

function safeParse(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    if (!val) return fallback;
    return JSON.parse(val) || fallback;
  } catch {
    return fallback;
  }
}

function getMeta(db, key) {
  const stmt = db.prepare('SELECT value FROM app_meta WHERE key = ?');
  stmt.bind([key]);
  let value = null;
  if (stmt.step()) value = stmt.get()[0];
  stmt.free();
  return value;
}

function setMeta(db, key, value) {
  db.run('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [key, value]);
}

export function migrateFromLocalStorage(db) {
  if (getMeta(db, 'migrated_from_localstorage') === '1') return false;
  if (typeof localStorage === 'undefined') {
    setMeta(db, 'migrated_from_localstorage', '1');
    return false;
  }

  const hasLegacy = LEGACY_KEYS.some((k) => localStorage.getItem(k));
  if (!hasLegacy) {
    setMeta(db, 'migrated_from_localstorage', '1');
    return false;
  }

  const profiles = safeParse('st_profiles', []);
  for (const p of profiles) {
    db.run(
      'INSERT OR IGNORE INTO profiles (id, name, robinhood_username, created_at) VALUES (?, ?, ?, ?)',
      [p.id, p.name, p.robinhood_username || null, p.created_at || new Date().toISOString()]
    );
  }

  const holdings = safeParse('st_holdings', []);
  for (const h of holdings) {
    db.run(
      `INSERT OR REPLACE INTO holdings (id, profile_id, ticker, shares, avg_buy_price, current_price, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        h.id,
        h.profile_id,
        (h.ticker || '').toUpperCase(),
        h.shares ?? 0,
        h.avg_buy_price ?? 0,
        h.current_price ?? h.avg_buy_price ?? 0,
        h.updated_at || h.synced_at || new Date().toISOString(),
      ]
    );
  }

  const guesses = safeParse('st_guesses', []);
  for (const g of guesses) {
    db.run(
      `INSERT OR REPLACE INTO guesses
       (id, profile_id, ticker, target_price, initial_price, timeframe_days, guess_date, status, resolved_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        g.id,
        g.profile_id,
        (g.ticker || '').toUpperCase(),
        g.target_price,
        g.initial_price,
        g.timeframe_days ?? 30,
        g.guess_date || new Date().toISOString(),
        g.status || 'pending',
        g.resolved_date || null,
      ]
    );
  }

  const watchlist = safeParse('st_watchlist', []);
  for (const w of watchlist) {
    db.run(
      'INSERT OR IGNORE INTO watchlist (id, profile_id, ticker, notes, added_at) VALUES (?, ?, ?, ?, ?)',
      [w.id, w.profile_id, (w.ticker || '').toUpperCase(), w.notes || '', w.created_at || w.added_at || new Date().toISOString()]
    );
  }

  const allWeights = safeParse('st_weights', {});
  for (const [profileId, tickers] of Object.entries(allWeights)) {
    for (const [ticker, w] of Object.entries(tickers || {})) {
      db.run(
        `INSERT OR REPLACE INTO weights (profile_id, ticker, rsi_weight, macd_weight, trend_weight, gut_weight, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          parseInt(profileId, 10),
          ticker.toUpperCase(),
          w.rsi_weight ?? 0.25,
          w.macd_weight ?? 0.25,
          w.trend_weight ?? w.ema_weight ?? 0.25,
          w.gut_weight ?? 0.25,
          w.updated_at || new Date().toISOString(),
        ]
      );
    }
  }

  const actions = safeParse('st_actions', []);
  for (const a of actions) {
    db.run(
      `INSERT OR REPLACE INTO user_actions (id, profile_id, action_type, ticker, shares, price, metadata_json, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        a.profile_id,
        a.action_type,
        (a.ticker || '').toUpperCase(),
        a.shares ?? 0,
        a.price ?? 0,
        JSON.stringify(a.metadata || {}),
        a.timestamp || new Date().toISOString(),
      ]
    );
  }

  const settings = safeParse('st_settings', null);
  if (settings) {
    db.run('INSERT OR REPLACE INTO app_settings (key, value_json) VALUES (?, ?)', ['ui', JSON.stringify(settings)]);
  }

  const indicators = safeParse('st_indicators', {});
  for (const [profileId, payload] of Object.entries(indicators)) {
    db.run('INSERT OR REPLACE INTO profile_settings (profile_id, settings_json) VALUES (?, ?)', [
      parseInt(profileId, 10),
      JSON.stringify(payload),
    ]);
  }

  for (const key of LEGACY_KEYS) {
    localStorage.removeItem(key);
  }

  setMeta(db, 'migrated_from_localstorage', '1');
  return true;
}
