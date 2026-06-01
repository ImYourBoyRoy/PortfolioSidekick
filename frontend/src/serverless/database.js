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
  WEIGHTS: "st_weights"
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
    { id: 1, profile_id: 1, ticker: "QBTS", shares: 61.29, avg_buy_price: 29.87, current_price: 30.16, updated_at: new Date().toISOString() },
    { id: 2, profile_id: 1, ticker: "RGTI", shares: 45.56, avg_buy_price: 25.41, current_price: 23.86, updated_at: new Date().toISOString() },
    { id: 3, profile_id: 1, ticker: "ZYNE", shares: 1.00, avg_buy_price: 10.00, current_price: 100.31, updated_at: new Date().toISOString() },
    { id: 4, profile_id: 1, ticker: "SLRC", shares: 50.84, avg_buy_price: 13.08, current_price: 12.98, updated_at: new Date().toISOString() },
    { id: 5, profile_id: 1, ticker: "ARKK", shares: 19.00, avg_buy_price: 81.83, current_price: 82.28, updated_at: new Date().toISOString() },
    { id: 6, profile_id: 1, ticker: "NVDA", shares: 41.35, avg_buy_price: 212.49, current_price: 210.85, updated_at: new Date().toISOString() },
    { id: 7, profile_id: 1, ticker: "AMD", shares: 15.97, avg_buy_price: 515.13, current_price: 511.16, updated_at: new Date().toISOString() },
    { id: 8, profile_id: 1, ticker: "IONQ", shares: 55.83, avg_buy_price: 71.05, current_price: 71.76, updated_at: new Date().toISOString() },
    { id: 9, profile_id: 1, ticker: "AVGO", shares: 4.64, avg_buy_price: 446.07, current_price: 465.16, updated_at: new Date().toISOString() },
    { id: 10, profile_id: 1, ticker: "PLTR", shares: 8.13, avg_buy_price: 156.38, current_price: 171.18, updated_at: new Date().toISOString() },
    { id: 11, profile_id: 1, ticker: "TSM", shares: 4.62, avg_buy_price: 419.23, current_price: 413.86, updated_at: new Date().toISOString() },
    { id: 12, profile_id: 1, ticker: "INTC", shares: 112.91, avg_buy_price: 115.33, current_price: 109.65, updated_at: new Date().toISOString() },
    { id: 13, profile_id: 1, ticker: "NUKZ", shares: 7.98, avg_buy_price: 2.39, current_price: 2.40, updated_at: new Date().toISOString() },
    { id: 14, profile_id: 1, ticker: "NLR", shares: 3.46, avg_buy_price: 133.18, current_price: 132.47, updated_at: new Date().toISOString() }
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
};

// Initialize seed only if the screenshot/seed_visuals flag is set in localStorage
if (typeof localStorage !== "undefined" && localStorage.getItem("portfolio_sidekick_seed_visuals") === "true") {
  seedInitialData();
}

export const localDb = {
  // Profiles
  getProfiles: () => {
    return JSON.parse(localStorage.getItem(KEYS.PROFILES) || "[]");
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
    let holdings = JSON.parse(localStorage.getItem(KEYS.HOLDINGS) || "[]");
    holdings = holdings.filter(h => h.profile_id !== id);
    localStorage.setItem(KEYS.HOLDINGS, JSON.stringify(holdings));

    let guesses = JSON.parse(localStorage.getItem(KEYS.GUESSES) || "[]");
    guesses = guesses.filter(g => g.profile_id !== id);
    localStorage.setItem(KEYS.GUESSES, JSON.stringify(guesses));

    let watchlist = JSON.parse(localStorage.getItem(KEYS.WATCHLIST) || "[]");
    watchlist = watchlist.filter(w => w.profile_id !== id);
    localStorage.setItem(KEYS.WATCHLIST, JSON.stringify(watchlist));
  },

  // Holdings
  getHoldings: (profileId) => {
    const holdings = JSON.parse(localStorage.getItem(KEYS.HOLDINGS) || "[]");
    return holdings.filter(h => h.profile_id === profileId);
  },

  updateHolding: (profileId, ticker, shares, avgBuyPrice, currentPrice = null) => {
    const holdings = JSON.parse(localStorage.getItem(KEYS.HOLDINGS) || "[]");
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
    const guesses = JSON.parse(localStorage.getItem(KEYS.GUESSES) || "[]");
    const profileGuesses = guesses.filter(g => g.profile_id === profileId);
    return {
      pending: profileGuesses.filter(g => g.status === "pending"),
      completed: profileGuesses.filter(g => g.status !== "pending")
    };
  },

  createGuess: (profileId, ticker, targetPrice, initialPrice, timeframeDays) => {
    const guesses = JSON.parse(localStorage.getItem(KEYS.GUESSES) || "[]");
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
    const guesses = JSON.parse(localStorage.getItem(KEYS.GUESSES) || "[]");
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
    const watchlist = JSON.parse(localStorage.getItem(KEYS.WATCHLIST) || "[]");
    return watchlist.filter(w => w.profile_id === profileId);
  },

  addToWatchlist: (profileId, ticker, notes) => {
    const watchlist = JSON.parse(localStorage.getItem(KEYS.WATCHLIST) || "[]");
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
    const watchlist = JSON.parse(localStorage.getItem(KEYS.WATCHLIST) || "[]");
    const formattedTicker = ticker.toUpperCase().trim();
    const filtered = watchlist.filter(w => !(w.profile_id === profileId && w.ticker === formattedTicker));
    localStorage.setItem(KEYS.WATCHLIST, JSON.stringify(filtered));
  },

  // Weights
  getWeights: (profileId, ticker) => {
    const allWeights = JSON.parse(localStorage.getItem(KEYS.WEIGHTS) || "{}");
    const formattedTicker = ticker.toUpperCase().trim();
    
    if (allWeights[profileId] && allWeights[profileId][formattedTicker]) {
      return allWeights[profileId][formattedTicker];
    }
    
    // Default weights
    return { rsi_weight: 0.25, macd_weight: 0.25, trend_weight: 0.25, gut_weight: 0.25 };
  },

  saveWeights: (profileId, ticker, rsi, macd, trend, gut) => {
    const allWeights = JSON.parse(localStorage.getItem(KEYS.WEIGHTS) || "{}");
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
  }
};
