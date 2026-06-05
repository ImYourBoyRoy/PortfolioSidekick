// ./frontend/src/serverless/database.js
/**
 * Portfolio Sidekick unified SQLite database layer.
 * Single schema across Android (Capacitor DATA dir), Tauri desktop (portable data/ beside EXE),
 * and dev (IndexedDB). Replaces legacy localStorage persistence.
 *
 * Created by: Roy Dawson IV
 */

import { ensureDatabaseReady, queryAll, queryOne, run } from './db/sqliteEngine.js';

export { ensureDatabaseReady, initDatabase } from './db/sqliteEngine.js';

const seedInitialData = () => {
  const existing = queryAll('SELECT id FROM profiles LIMIT 1');
  if (existing.length > 0) return;

  run('INSERT INTO profiles (name, created_at) VALUES (?, ?)', ['Example', new Date().toISOString()]);
  const profileId = queryOne('SELECT id FROM profiles WHERE name = ?', ['Example']).id;

  const holdings = [
    ['NVDA', 120, 110.5, 122.45],
    ['AMD', 60, 145.0, 150.2],
    ['PLTR', 250, 21.0, 34.5],
    ['MSFT', 35, 380.0, 415.0],
    ['AAPL', 45, 170.0, 190.0],
    ['AMZN', 80, 150.0, 180.0],
    ['TSLA', 50, 190.0, 175.0],
    ['QBTS', 100, 12.0, 15.5],
    ['RGTI', 80, 14.0, 16.8],
    ['NUKZ', 200, 2.5, 2.8],
  ];
  for (const [ticker, shares, avg, price] of holdings) {
    run(
      'INSERT INTO holdings (profile_id, ticker, shares, avg_buy_price, current_price) VALUES (?, ?, ?, ?, ?)',
      [profileId, ticker, shares, avg, price]
    );
  }

  const watch = [
    ['SPY', 'Broad market standard index'],
    ['QQQ', 'Tech heavy momentum index'],
    ['VIX', 'Market volatility fears indicator'],
  ];
  for (const [ticker, notes] of watch) {
    run('INSERT INTO watchlist (profile_id, ticker, notes) VALUES (?, ?, ?)', [profileId, ticker, notes]);
  }

  run(
    `INSERT INTO guesses (profile_id, ticker, target_price, initial_price, timeframe_days, guess_date, status, resolved_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [profileId, 'ZYNE', 100, 10, 30, new Date(Date.now() - 15 * 86400000).toISOString(), 'hit', new Date().toISOString()]
  );
  run(
    `INSERT INTO guesses (profile_id, ticker, target_price, initial_price, timeframe_days, guess_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [profileId, 'NVDA', 230, 210.85, 30, new Date().toISOString(), 'pending']
  );

  run(
    'INSERT INTO weights (profile_id, ticker, rsi_weight, macd_weight, trend_weight, gut_weight) VALUES (?, ?, ?, ?, ?, ?)',
    [profileId, 'NVDA', 0.18, 0.22, 0.17, 0.43]
  );
};

export async function bootstrapDatabase() {
  await ensureDatabaseReady();
  if (typeof localStorage !== 'undefined' && localStorage.getItem('portfolio_sidekick_seed_visuals') === 'true') {
    seedInitialData();
  }
}

export const localDb = {
  getProfiles: () => queryAll('SELECT id, name, robinhood_username, created_at FROM profiles ORDER BY id'),

  createProfile: (name) => {
    run('INSERT INTO profiles (name, created_at) VALUES (?, ?)', [name, new Date().toISOString()]);
    return queryOne('SELECT id, name, robinhood_username, created_at FROM profiles WHERE name = ?', [name]);
  },

  setRobinhoodUsername: (profileId, username) => {
    run('UPDATE profiles SET robinhood_username = ? WHERE id = ?', [username, profileId]);
  },

  clearRobinhoodUsername: (profileId) => {
    run('UPDATE profiles SET robinhood_username = NULL WHERE id = ?', [profileId]);
  },

  deleteProfile: (id) => {
    run('DELETE FROM profiles WHERE id = ?', [id]);
  },

  getHoldings: (profileId) =>
    queryAll(
      'SELECT id, profile_id, ticker, shares, avg_buy_price, current_price, synced_at AS updated_at FROM holdings WHERE profile_id = ? AND shares > 0',
      [profileId]
    ),

  updateHolding: (profileId, ticker, shares, avgBuyPrice, currentPrice = null) => {
    const formattedTicker = ticker.toUpperCase().trim();
    const qty = parseFloat(shares);
    const existing = queryOne('SELECT id FROM holdings WHERE profile_id = ? AND ticker = ?', [profileId, formattedTicker]);

    if (existing) {
      if (qty <= 0) {
        run('DELETE FROM holdings WHERE profile_id = ? AND ticker = ?', [profileId, formattedTicker]);
      } else {
        run(
          `UPDATE holdings SET shares = ?, avg_buy_price = ?, current_price = COALESCE(?, current_price), synced_at = ?
           WHERE profile_id = ? AND ticker = ?`,
          [qty, parseFloat(avgBuyPrice), currentPrice !== null ? parseFloat(currentPrice) : null, new Date().toISOString(), profileId, formattedTicker]
        );
      }
    } else if (qty > 0) {
      run(
        'INSERT INTO holdings (profile_id, ticker, shares, avg_buy_price, current_price) VALUES (?, ?, ?, ?, ?)',
        [profileId, formattedTicker, qty, parseFloat(avgBuyPrice), currentPrice !== null ? parseFloat(currentPrice) : parseFloat(avgBuyPrice)]
      );
    }
  },

  getGuesses: (profileId) => {
    const all = queryAll('SELECT * FROM guesses WHERE profile_id = ? ORDER BY id DESC', [profileId]);
    return {
      pending: all.filter((g) => g.status === 'pending'),
      completed: all.filter((g) => g.status !== 'pending'),
    };
  },

  createGuess: (profileId, ticker, targetPrice, initialPrice, timeframeDays) => {
    run(
      `INSERT INTO guesses (profile_id, ticker, target_price, initial_price, timeframe_days, guess_date, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [profileId, ticker.toUpperCase().trim(), parseFloat(targetPrice), parseFloat(initialPrice), parseInt(timeframeDays, 10), new Date().toISOString()]
    );
    return queryOne('SELECT * FROM guesses WHERE id = last_insert_rowid()');
  },

  resolveGuesses: (profileId, ticker, currentPrice) => {
    const formattedTicker = ticker.toUpperCase().trim();
    const pending = queryAll(
      "SELECT * FROM guesses WHERE profile_id = ? AND ticker = ? AND status = 'pending'",
      [profileId, formattedTicker]
    );
    let updated = false;
    for (const g of pending) {
      const initial = g.initial_price;
      const target = g.target_price;
      const daysElapsed = (Date.now() - new Date(g.guess_date).getTime()) / 86400000;
      const bullishHit = target > initial && currentPrice >= target;
      const bearishHit = target < initial && currentPrice <= target;
      if (bullishHit || bearishHit) {
        run("UPDATE guesses SET status = 'hit', resolved_date = ? WHERE id = ?", [new Date().toISOString(), g.id]);
        updated = true;
      } else if (daysElapsed >= g.timeframe_days) {
        run("UPDATE guesses SET status = 'missed', resolved_date = ? WHERE id = ?", [new Date().toISOString(), g.id]);
        updated = true;
      }
    }
    return updated;
  },

  getWatchlist: (profileId) =>
    queryAll('SELECT id, profile_id, ticker, notes, added_at AS created_at FROM watchlist WHERE profile_id = ? ORDER BY id', [profileId]),

  addToWatchlist: (profileId, ticker, notes) => {
    const formattedTicker = ticker.toUpperCase().trim();
    const exists = queryOne('SELECT id FROM watchlist WHERE profile_id = ? AND ticker = ?', [profileId, formattedTicker]);
    if (exists) {
      run('UPDATE watchlist SET notes = ? WHERE profile_id = ? AND ticker = ?', [notes, profileId, formattedTicker]);
      return { status: 'already_exists', message: 'Ticker already tracked. Notes updated.' };
    }
    run('INSERT INTO watchlist (profile_id, ticker, notes) VALUES (?, ?, ?)', [profileId, formattedTicker, notes]);
    return { status: 'success', ticker: formattedTicker };
  },

  removeFromWatchlist: (profileId, ticker) => {
    run('DELETE FROM watchlist WHERE profile_id = ? AND ticker = ?', [profileId, ticker.toUpperCase().trim()]);
  },

  getWeights: (profileId, ticker) => {
    const row = queryOne('SELECT * FROM weights WHERE profile_id = ? AND ticker = ?', [profileId, ticker.toUpperCase().trim()]);
    if (row) {
      return {
        rsi_weight: row.rsi_weight,
        macd_weight: row.macd_weight,
        trend_weight: row.trend_weight,
        gut_weight: row.gut_weight,
      };
    }
    return { rsi_weight: 0.25, macd_weight: 0.25, trend_weight: 0.25, gut_weight: 0.25 };
  },

  saveWeights: (profileId, ticker, rsi, macd, trend, gut) => {
    const formattedTicker = ticker.toUpperCase().trim();
    run(
      `INSERT INTO weights (profile_id, ticker, rsi_weight, macd_weight, trend_weight, gut_weight, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, ticker) DO UPDATE SET
         rsi_weight = excluded.rsi_weight,
         macd_weight = excluded.macd_weight,
         trend_weight = excluded.trend_weight,
         gut_weight = excluded.gut_weight,
         updated_at = excluded.updated_at`,
      [profileId, formattedTicker, parseFloat(rsi), parseFloat(macd), parseFloat(trend), parseFloat(gut), new Date().toISOString()]
    );
  },

  getActions: (profileId) => {
    const rows = queryAll('SELECT * FROM user_actions WHERE profile_id = ? ORDER BY timestamp DESC', [profileId]);
    return rows.map((r) => ({
      ...r,
      metadata: JSON.parse(r.metadata_json || '{}'),
    }));
  },

  logAction: (profileId, actionType, ticker, shares, price, metadata = {}) => {
    run(
      `INSERT INTO user_actions (profile_id, action_type, ticker, shares, price, metadata_json, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        profileId,
        actionType,
        ticker.toUpperCase().trim(),
        parseFloat(shares),
        parseFloat(price),
        JSON.stringify({ ...metadata, source: metadata.source || 'manual' }),
        new Date().toISOString(),
      ]
    );
    return queryOne('SELECT * FROM user_actions WHERE id = last_insert_rowid()');
  },

  analyzeActions: (profileId) => {
    const profileActions = localDb.getActions(profileId);
    if (profileActions.length === 0) {
      return {
        total_actions: 0,
        buys: 0,
        sells: 0,
        adjusts: 0,
        win_rate: 0.0,
        avg_win_pct: 0.0,
        avg_loss_pct: 0.0,
        most_traded: [],
        source_breakdown: { manual: 0, robinhood_sync: 0, clipboard: 0 },
        recent_7d: 0,
        insights: [{ type: 'info', icon: '👁️', text: 'Shadow Coach is watching your moves. More data will unlock deeper behavioral insights.' }],
      };
    }

    const buys = profileActions.filter((a) => a.action_type === 'buy');
    const sells = profileActions.filter((a) => a.action_type === 'sell');
    const adjusts = profileActions.filter((a) => a.action_type === 'adjust');
    const winningSells = sells.filter((s) => s.metadata?.pnl_pct > 0);
    const losingSells = sells.filter((s) => s.metadata?.pnl_pct < 0);
    const winRate = sells.length > 0 ? (winningSells.length / sells.length * 100).toFixed(1) : 0;
    const avgWin = winningSells.length > 0
      ? (winningSells.reduce((sum, s) => sum + (s.metadata.pnl_pct || 0), 0) / winningSells.length).toFixed(2)
      : 0;
    const avgLoss = losingSells.length > 0
      ? (losingSells.reduce((sum, s) => sum + Math.abs(s.metadata.pnl_pct || 0), 0) / losingSells.length).toFixed(2)
      : 0;

    const tickerCounts = {};
    profileActions.forEach((a) => {
      tickerCounts[a.ticker] = (tickerCounts[a.ticker] || 0) + 1;
    });
    const mostTraded = Object.entries(tickerCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([ticker, count]) => ({ ticker, count }));

    const sourceCounts = { manual: 0, robinhood_sync: 0, clipboard: 0 };
    profileActions.forEach((a) => {
      const src = a.metadata?.source || 'manual';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    });

    const weekAgo = Date.now() - 7 * 86400000;
    const recentActions = profileActions.filter((a) => new Date(a.timestamp).getTime() > weekAgo);

    const insights = [];
    if (parseFloat(winRate) >= 60) {
      insights.push({ type: 'success', icon: '🏆', text: `Strong ${winRate}% win rate — your sell discipline is paying off!` });
    } else if (sells.length > 0 && parseFloat(winRate) < 40) {
      insights.push({ type: 'warning', icon: '⚠️', text: `${winRate}% win rate — consider holding winners longer or tightening stop-losses.` });
    }
    if (parseFloat(avgWin) > 0 && parseFloat(avgLoss) > 0) {
      const profitFactor = (parseFloat(avgWin) / parseFloat(avgLoss)).toFixed(2);
      if (profitFactor >= 2) {
        insights.push({ type: 'success', icon: '💎', text: `Profit factor of ${profitFactor}x — your winners significantly outpace your losses.` });
      } else if (profitFactor < 1) {
        insights.push({ type: 'danger', icon: '🔴', text: `Profit factor ${profitFactor}x — losses exceed wins. Consider sizing down losing trades.` });
      }
    }
    if (buys.length > sells.length * 3 && sells.length > 0) {
      insights.push({ type: 'info', icon: '📊', text: 'Heavy buyer pattern — ensure you have exit strategies for your positions.' });
    }
    if (adjusts.length > buys.length * 0.5) {
      insights.push({ type: 'info', icon: '🔄', text: "Frequent adjustments — you're actively managing positions, which shows good engagement." });
    }
    if (recentActions.length === 0 && profileActions.length > 3) {
      insights.push({ type: 'info', icon: '⏸️', text: 'No actions in 7 days — sometimes patience is the best strategy.' });
    }
    if (mostTraded.length > 0 && mostTraded[0].count >= 4) {
      insights.push({ type: 'info', icon: '🎯', text: `You trade ${mostTraded[0].ticker} most frequently (${mostTraded[0].count} actions). Consider if concentration is intentional.` });
    }
    if (insights.length === 0) {
      insights.push({ type: 'info', icon: '👁️', text: 'Shadow Coach is watching your moves. More data will unlock deeper behavioral insights.' });
    }

    return {
      total_actions: profileActions.length,
      buys: buys.length,
      sells: sells.length,
      adjusts: adjusts.length,
      win_rate: parseFloat(winRate),
      avg_win_pct: parseFloat(avgWin),
      avg_loss_pct: parseFloat(avgLoss),
      most_traded: mostTraded,
      source_breakdown: sourceCounts,
      recent_7d: recentActions.length,
      insights,
    };
  },

  getSettings: () => {
    const row = queryOne("SELECT value_json FROM app_settings WHERE key = 'ui'");
    if (!row) return { fontSize: 0, highContrast: false };
    try {
      return JSON.parse(row.value_json);
    } catch {
      return { fontSize: 0, highContrast: false };
    }
  },

  saveSettings: (settings) => {
    const current = localDb.getSettings();
    const merged = { ...current, ...settings };
    run("INSERT OR REPLACE INTO app_settings (key, value_json) VALUES ('ui', ?)", [JSON.stringify(merged)]);
    return merged;
  },

  getIndicatorSettings: (profileId) => {
    if (profileId == null) return null;
    const row = queryOne('SELECT settings_json FROM profile_settings WHERE profile_id = ?', [profileId]);
    if (!row) return null;
    try {
      return JSON.parse(row.settings_json);
    } catch {
      return null;
    }
  },

  saveIndicatorSettings: (profileId, payload) => {
    if (profileId == null) return null;
    const current = localDb.getIndicatorSettings(profileId) || {};
    const merged = { ...current, ...payload };
    run('INSERT OR REPLACE INTO profile_settings (profile_id, settings_json) VALUES (?, ?)', [profileId, JSON.stringify(merged)]);
    return merged;
  },

  getAnalytics: (profileId) => {
    const { completed } = localDb.getGuesses(profileId);
    if (!completed.length) {
      return {
        overall_accuracy: 50.0,
        completed_count: 0,
        archetype: 'Oracle Apprentice',
        archetype_desc: 'No resolved price guesses yet.',
        details: { short_term: 50.0, long_term: 50.0 },
      };
    }
    const hits = completed.filter((g) => g.status === 'hit').length;
    const overall = (hits / completed.length) * 100;
    return {
      overall_accuracy: Math.round(overall * 10) / 10,
      completed_count: completed.length,
      archetype: overall > 65 ? 'Tactical Value Seeker' : 'Oracle Apprentice',
      archetype_desc: 'Analytics derived from on-device guess history.',
      details: { short_term: Math.round(overall * 10) / 10, long_term: Math.round(overall * 10) / 10 },
    };
  },
};
