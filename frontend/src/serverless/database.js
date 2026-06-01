// ./frontend/src/serverless/database.js
/**
 * Portfolio Sidekick Serverless Local Database Layer
 * Implements high-fidelity, pure JavaScript state persistence inside localStorage,
 * completely replacing local SQLite files.
 * Pre-seeds an authentic 'Example' profile with realistic mock holdings, watchlist, and resolved guesses.
 *
 * Created by: Roy Dawson IV
 */

const KEYS = {
  PROFILES: "st_profiles",
  HOLDINGS: "st_holdings",
  GUESSES: "st_guesses",
  WATCHLIST: "st_watchlist",
  WEIGHTS: "st_weights",
  ACTIONS: "st_actions",
  SETTINGS: "st_settings"
};

const safeParse = (key, fallback = []) => {
  try {
    const val = localStorage.getItem(key);
    if (!val) return fallback;
    return JSON.parse(val) || fallback;
  } catch (e) {
    console.error(`Error parsing localStorage key "${key}":`, e);
    return fallback;
  }
};

// Seed authentic 'Example' profile and realistic mock assets matching real app visuals
const seedInitialData = () => {
  if (localStorage.getItem(KEYS.PROFILES)) return; // Already seeded

  console.log("Seeding serverless database with authentic Example profile and mock portfolio...");

  // 1. Seed Profile
  const profiles = [
    { id: 1, name: "Example", created_at: new Date().toISOString() }
  ];
  localStorage.setItem(KEYS.PROFILES, JSON.stringify(profiles));

  // 2. Seed Holdings matching exact screenshot assets
  const holdings = [
    { id: 1, profile_id: 1, ticker: "NVDA", shares: 120, avg_buy_price: 110.50, current_price: 122.45, updated_at: new Date().toISOString() },
    { id: 2, profile_id: 1, ticker: "AMD", shares: 60, avg_buy_price: 145.00, current_price: 150.20, updated_at: new Date().toISOString() },
    { id: 3, profile_id: 1, ticker: "PLTR", shares: 250, avg_buy_price: 21.00, current_price: 34.50, updated_at: new Date().toISOString() },
    { id: 4, profile_id: 1, ticker: "MSFT", shares: 35, avg_buy_price: 380.00, current_price: 415.00, updated_at: new Date().toISOString() },
    { id: 5, profile_id: 1, ticker: "AAPL", shares: 45, avg_buy_price: 170.00, current_price: 190.00, updated_at: new Date().toISOString() },
    { id: 6, profile_id: 1, ticker: "AMZN", shares: 80, avg_buy_price: 150.00, current_price: 180.00, updated_at: new Date().toISOString() },
    { id: 7, profile_id: 1, ticker: "TSLA", shares: 50, avg_buy_price: 190.00, current_price: 175.00, updated_at: new Date().toISOString() },
    { id: 8, profile_id: 1, ticker: "QBTS", shares: 100, avg_buy_price: 12.00, current_price: 15.50, updated_at: new Date().toISOString() },
    { id: 9, profile_id: 1, ticker: "RGTI", shares: 80, avg_buy_price: 14.00, current_price: 16.80, updated_at: new Date().toISOString() },
    { id: 10, profile_id: 1, ticker: "NUKZ", shares: 200, avg_buy_price: 2.50, current_price: 2.80, updated_at: new Date().toISOString() }
  ];
  localStorage.setItem(KEYS.HOLDINGS, JSON.stringify(holdings));

  // 3. Seed Watchlist
  const watchlist = [
    { id: 1, profile_id: 1, ticker: "SPY", notes: "Broad market standard index", created_at: new Date().toISOString() },
    { id: 2, profile_id: 1, ticker: "QQQ", notes: "Tech heavy momentum index", created_at: new Date().toISOString() },
    { id: 3, profile_id: 1, ticker: "VIX", notes: "Market volatility fears indicator", created_at: new Date().toISOString() }
  ];
  localStorage.setItem(KEYS.WATCHLIST, JSON.stringify(watchlist));

  // 4. Seed Guesses containing a successful resolved hit to establish initial ROI profiles
  const guesses = [
    {
      id: 1,
      profile_id: 1,
      ticker: "ZYNE",
      target_price: 100.00,
      initial_price: 10.00,
      timeframe_days: 30,
      guess_date: new Date(Date.now() - 15 * 86400000).toISOString(),
      status: "hit",
      resolved_date: new Date().toISOString()
    },
    {
      id: 2,
      profile_id: 1,
      ticker: "NVDA",
      target_price: 230.00,
      initial_price: 210.85,
      timeframe_days: 30,
      guess_date: new Date().toISOString(),
      status: "pending",
      resolved_date: null
    }
  ];
  localStorage.setItem(KEYS.GUESSES, JSON.stringify(guesses));

  // 5. Seed weights
  const weights = {
    "1": {
      "NVDA": { rsi_weight: 0.18, macd_weight: 0.22, trend_weight: 0.17, gut_weight: 0.43 }
    }
  };
  localStorage.setItem(KEYS.WEIGHTS, JSON.stringify(weights));

  // 5. Seed mock user actions for Shadow Coach demonstration
  const actions = [
    { id: 1, profile_id: 1, action_type: "buy", ticker: "AAPL", shares: 15, price: 172.50, metadata: { source: "manual", reason: "Earnings beat expected" }, timestamp: new Date(Date.now() - 45 * 86400000).toISOString() },
    { id: 2, profile_id: 1, action_type: "buy", ticker: "NVDA", shares: 10, price: 875.00, metadata: { source: "robinhood_sync", reason: "AI momentum play" }, timestamp: new Date(Date.now() - 38 * 86400000).toISOString() },
    { id: 3, profile_id: 1, action_type: "sell", ticker: "TSLA", shares: 5, price: 248.30, metadata: { source: "manual", reason: "Taking profit on rally", pnl_pct: 12.4 }, timestamp: new Date(Date.now() - 30 * 86400000).toISOString() },
    { id: 4, profile_id: 1, action_type: "buy", ticker: "MSFT", shares: 8, price: 415.00, metadata: { source: "robinhood_sync", reason: "Cloud growth thesis" }, timestamp: new Date(Date.now() - 22 * 86400000).toISOString() },
    { id: 5, profile_id: 1, action_type: "sell", ticker: "AMD", shares: 12, price: 155.20, metadata: { source: "manual", reason: "Stop-loss triggered", pnl_pct: -6.2 }, timestamp: new Date(Date.now() - 15 * 86400000).toISOString() },
    { id: 6, profile_id: 1, action_type: "adjust", ticker: "AAPL", shares: 20, price: 189.50, metadata: { source: "manual", reason: "Averaging up on dip", prev_shares: 15 }, timestamp: new Date(Date.now() - 10 * 86400000).toISOString() },
    { id: 7, profile_id: 1, action_type: "buy", ticker: "GOOGL", shares: 6, price: 175.80, metadata: { source: "robinhood_sync", reason: "AI search dominance" }, timestamp: new Date(Date.now() - 5 * 86400000).toISOString() },
    { id: 8, profile_id: 1, action_type: "sell", ticker: "NVDA", shares: 3, price: 1125.00, metadata: { source: "manual", reason: "Partial profit on 28% run", pnl_pct: 28.6 }, timestamp: new Date(Date.now() - 2 * 86400000).toISOString() }
  ];
  localStorage.setItem(KEYS.ACTIONS, JSON.stringify(actions));
};

// Initialize seed only if the screenshot/seed_visuals flag is set in localStorage
if (typeof localStorage !== "undefined" && localStorage.getItem("portfolio_sidekick_seed_visuals") === "true") {
  seedInitialData();
}

export const localDb = {
  // Profiles
  getProfiles: () => {
    return safeParse(KEYS.PROFILES, []);
  },

  createProfile: (name) => {
    const profiles = localDb.getProfiles();
    const newId = profiles.length > 0 ? Math.max(...profiles.map(p => p.id)) + 1 : 1;
    const newProfile = { id: newId, name, created_at: new Date().toISOString() };
    profiles.push(newProfile);
    localStorage.setItem(KEYS.PROFILES, JSON.stringify(profiles));
    return newProfile;
  },

  deleteProfile: (id) => {
    let profiles = localDb.getProfiles();
    profiles = profiles.filter(p => p.id !== id);
    localStorage.setItem(KEYS.PROFILES, JSON.stringify(profiles));

    // Clear cascaded dependencies
    let holdings = safeParse(KEYS.HOLDINGS, []);
    holdings = holdings.filter(h => h.profile_id !== id);
    localStorage.setItem(KEYS.HOLDINGS, JSON.stringify(holdings));

    let guesses = safeParse(KEYS.GUESSES, []);
    guesses = guesses.filter(g => g.profile_id !== id);
    localStorage.setItem(KEYS.GUESSES, JSON.stringify(guesses));

    let watchlist = safeParse(KEYS.WATCHLIST, []);
    watchlist = watchlist.filter(w => w.profile_id !== id);
    localStorage.setItem(KEYS.WATCHLIST, JSON.stringify(watchlist));
  },

  // Holdings
  getHoldings: (profileId) => {
    const holdings = safeParse(KEYS.HOLDINGS, []);
    return holdings.filter(h => h.profile_id === profileId);
  },

  updateHolding: (profileId, ticker, shares, avgBuyPrice, currentPrice = null) => {
    const holdings = safeParse(KEYS.HOLDINGS, []);
    const formattedTicker = ticker.toUpperCase().trim();
    const existing = holdings.find(h => h.profile_id === profileId && h.ticker === formattedTicker);

    if (existing) {
      if (shares <= 0) {
        // Delete position
        const filtered = holdings.filter(h => !(h.profile_id === profileId && h.ticker === formattedTicker));
        localStorage.setItem(KEYS.HOLDINGS, JSON.stringify(filtered));
      } else {
        existing.shares = parseFloat(shares);
        existing.avg_buy_price = parseFloat(avgBuyPrice);
        if (currentPrice !== null) existing.current_price = parseFloat(currentPrice);
        existing.updated_at = new Date().toISOString();
        localStorage.setItem(KEYS.HOLDINGS, JSON.stringify(holdings));
      }
    } else if (shares > 0) {
      const newId = holdings.length > 0 ? Math.max(...holdings.map(h => h.id)) + 1 : 1;
      const newHolding = {
        id: newId,
        profile_id: profileId,
        ticker: formattedTicker,
        shares: parseFloat(shares),
        avg_buy_price: parseFloat(avgBuyPrice),
        current_price: currentPrice !== null ? parseFloat(currentPrice) : parseFloat(avgBuyPrice),
        updated_at: new Date().toISOString()
      };
      holdings.push(newHolding);
      localStorage.setItem(KEYS.HOLDINGS, JSON.stringify(holdings));
    }
  },

  // Guesses
  getGuesses: (profileId) => {
    const guesses = safeParse(KEYS.GUESSES, []);
    const profileGuesses = guesses.filter(g => g.profile_id === profileId);
    return {
      pending: profileGuesses.filter(g => g.status === "pending"),
      completed: profileGuesses.filter(g => g.status !== "pending")
    };
  },

  createGuess: (profileId, ticker, targetPrice, initialPrice, timeframeDays) => {
    const guesses = safeParse(KEYS.GUESSES, []);
    const newId = guesses.length > 0 ? Math.max(...guesses.map(g => g.id)) + 1 : 1;
    const newGuess = {
      id: newId,
      profile_id: profileId,
      ticker: ticker.toUpperCase().trim(),
      target_price: parseFloat(targetPrice),
      initial_price: parseFloat(initialPrice),
      timeframe_days: parseInt(timeframeDays),
      guess_date: new Date().toISOString(),
      status: "pending",
      resolved_date: null
    };
    guesses.push(newGuess);
    localStorage.setItem(KEYS.GUESSES, JSON.stringify(guesses));
    return newGuess;
  },

  resolveGuesses: (profileId, ticker, currentPrice) => {
    const guesses = safeParse(KEYS.GUESSES, []);
    const formattedTicker = ticker.toUpperCase().trim();
    let updated = false;

    guesses.forEach(g => {
      if (g.profile_id === profileId && g.ticker === formattedTicker && g.status === "pending") {
        const initial = g.initial_price;
        const target = g.target_price;
        
        // Resolution: check if it achieved direction or resolved days expired
        const daysElapsed = (Date.now() - new Date(g.guess_date).getTime()) / 86400000;
        
        const bullishHit = target > initial && currentPrice >= target;
        const bearishHit = target < initial && currentPrice <= target;
        
        if (bullishHit || bearishHit) {
          g.status = "hit";
          g.resolved_date = new Date().toISOString();
          updated = true;
        } else if (daysElapsed >= g.timeframe_days) {
          g.status = "missed";
          g.resolved_date = new Date().toISOString();
          updated = true;
        }
      }
    });

    if (updated) {
      localStorage.setItem(KEYS.GUESSES, JSON.stringify(guesses));
    }
  },

  // Watchlist
  getWatchlist: (profileId) => {
    const watchlist = safeParse(KEYS.WATCHLIST, []);
    return watchlist.filter(w => w.profile_id === profileId);
  },

  addToWatchlist: (profileId, ticker, notes) => {
    const watchlist = safeParse(KEYS.WATCHLIST, []);
    const formattedTicker = ticker.toUpperCase().trim();
    const exists = watchlist.find(w => w.profile_id === profileId && w.ticker === formattedTicker);

    if (exists) {
      exists.notes = notes;
      localStorage.setItem(KEYS.WATCHLIST, JSON.stringify(watchlist));
      return { status: "already_exists", message: "Ticker already tracked. Notes updated." };
    }

    const newId = watchlist.length > 0 ? Math.max(...watchlist.map(w => w.id)) + 1 : 1;
    const newItem = {
      id: newId,
      profile_id: profileId,
      ticker: formattedTicker,
      notes,
      created_at: new Date().toISOString()
    };
    watchlist.push(newItem);
    localStorage.setItem(KEYS.WATCHLIST, JSON.stringify(watchlist));
    return { status: "success", ticker: formattedTicker };
  },

  removeFromWatchlist: (profileId, ticker) => {
    const watchlist = safeParse(KEYS.WATCHLIST, []);
    const formattedTicker = ticker.toUpperCase().trim();
    const filtered = watchlist.filter(w => !(w.profile_id === profileId && w.ticker === formattedTicker));
    localStorage.setItem(KEYS.WATCHLIST, JSON.stringify(filtered));
  },

  // Weights
  getWeights: (profileId, ticker) => {
    const allWeights = safeParse(KEYS.WEIGHTS, {});
    const formattedTicker = ticker.toUpperCase().trim();
    
    if (allWeights[profileId] && allWeights[profileId][formattedTicker]) {
      return allWeights[profileId][formattedTicker];
    }
    
    // Default weights
    return { rsi_weight: 0.25, macd_weight: 0.25, trend_weight: 0.25, gut_weight: 0.25 };
  },

  saveWeights: (profileId, ticker, rsi, macd, trend, gut) => {
    const allWeights = safeParse(KEYS.WEIGHTS, {});
    const formattedTicker = ticker.toUpperCase().trim();

    if (!allWeights[profileId]) allWeights[profileId] = {};
    allWeights[profileId][formattedTicker] = {
      rsi_weight: parseFloat(rsi),
      macd_weight: parseFloat(macd),
      trend_weight: parseFloat(trend),
      gut_weight: parseFloat(gut),
      updated_at: new Date().toISOString()
    };
    
    localStorage.setItem(KEYS.WEIGHTS, JSON.stringify(allWeights));
  },

  // Shadow Coach — Action Logging & Behavioral Analysis
  getActions: (profileId) => {
    const actions = safeParse(KEYS.ACTIONS, []);
    return actions
      .filter(a => a.profile_id === profileId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  logAction: (profileId, actionType, ticker, shares, price, metadata = {}) => {
    const actions = safeParse(KEYS.ACTIONS, []);
    const newId = actions.length > 0 ? Math.max(...actions.map(a => a.id)) + 1 : 1;
    const newAction = {
      id: newId,
      profile_id: profileId,
      action_type: actionType,
      ticker: ticker.toUpperCase().trim(),
      shares: parseFloat(shares),
      price: parseFloat(price),
      metadata: { ...metadata, source: metadata.source || "manual" },
      timestamp: new Date().toISOString()
    };
    actions.push(newAction);
    localStorage.setItem(KEYS.ACTIONS, JSON.stringify(actions));
    return newAction;
  },

  analyzeActions: (profileId) => {
    const actions = safeParse(KEYS.ACTIONS, []);
    const profileActions = actions.filter(a => a.profile_id === profileId);
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
        insights: [{ type: "info", icon: "👁️", text: "Shadow Coach is watching your moves. More data will unlock deeper behavioral insights." }]
      };
    }

    const buys = profileActions.filter(a => a.action_type === "buy");
    const sells = profileActions.filter(a => a.action_type === "sell");
    const adjusts = profileActions.filter(a => a.action_type === "adjust");

    const winningSells = sells.filter(s => s.metadata && s.metadata.pnl_pct > 0);
    const losingSells = sells.filter(s => s.metadata && s.metadata.pnl_pct < 0);
    const winRate = sells.length > 0 ? (winningSells.length / sells.length * 100).toFixed(1) : 0;

    const avgWin = winningSells.length > 0
      ? (winningSells.reduce((sum, s) => sum + (s.metadata.pnl_pct || 0), 0) / winningSells.length).toFixed(2)
      : 0;
    const avgLoss = losingSells.length > 0
      ? (losingSells.reduce((sum, s) => sum + Math.abs(s.metadata.pnl_pct || 0), 0) / losingSells.length).toFixed(2)
      : 0;

    // Ticker frequency analysis
    const tickerCounts = {};
    profileActions.forEach(a => {
      tickerCounts[a.ticker] = (tickerCounts[a.ticker] || 0) + 1;
    });
    const mostTraded = Object.entries(tickerCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([ticker, count]) => ({ ticker, count }));

    // Source breakdown
    const sourceCounts = { manual: 0, robinhood_sync: 0, clipboard: 0 };
    profileActions.forEach(a => {
      const src = a.metadata?.source || "manual";
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    });

    // Recent trend (last 7 days)
    const weekAgo = Date.now() - 7 * 86400000;
    const recentActions = profileActions.filter(a => new Date(a.timestamp).getTime() > weekAgo);

    // Generate coaching insights
    const insights = [];
    if (parseFloat(winRate) >= 60) {
      insights.push({ type: "success", icon: "🏆", text: `Strong ${winRate}% win rate — your sell discipline is paying off!` });
    } else if (sells.length > 0 && parseFloat(winRate) < 40) {
      insights.push({ type: "warning", icon: "⚠️", text: `${winRate}% win rate — consider holding winners longer or tightening stop-losses.` });
    }
    if (parseFloat(avgWin) > 0 && parseFloat(avgLoss) > 0) {
      const profitFactor = (parseFloat(avgWin) / parseFloat(avgLoss)).toFixed(2);
      if (profitFactor >= 2) {
        insights.push({ type: "success", icon: "💎", text: `Profit factor of ${profitFactor}x — your winners significantly outpace your losses.` });
      } else if (profitFactor < 1) {
        insights.push({ type: "danger", icon: "🔴", text: `Profit factor ${profitFactor}x — losses exceed wins. Consider sizing down losing trades.` });
      }
    }
    if (buys.length > sells.length * 3 && sells.length > 0) {
      insights.push({ type: "info", icon: "📊", text: "Heavy buyer pattern — ensure you have exit strategies for your positions." });
    }
    if (adjusts.length > buys.length * 0.5) {
      insights.push({ type: "info", icon: "🔄", text: "Frequent adjustments — you're actively managing positions, which shows good engagement." });
    }
    if (recentActions.length === 0 && profileActions.length > 3) {
      insights.push({ type: "info", icon: "⏸️", text: "No actions in 7 days — sometimes patience is the best strategy." });
    }
    if (mostTraded.length > 0 && mostTraded[0].count >= 4) {
      insights.push({ type: "info", icon: "🎯", text: `You trade ${mostTraded[0].ticker} most frequently (${mostTraded[0].count} actions). Consider if concentration is intentional.` });
    }
    // Fallback insight
    if (insights.length === 0) {
      insights.push({ type: "info", icon: "👁️", text: "Shadow Coach is watching your moves. More data will unlock deeper behavioral insights." });
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
      insights
    };
  },

  // User Settings (font size, accessibility)
  getSettings: () => {
    return safeParse(KEYS.SETTINGS, { fontSize: 0, highContrast: false });
  },

  saveSettings: (settings) => {
    const current = safeParse(KEYS.SETTINGS, {});
    const merged = { ...current, ...settings };
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(merged));
    return merged;
  }
};
