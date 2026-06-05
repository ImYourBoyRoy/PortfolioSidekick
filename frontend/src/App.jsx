// ./frontend/src/App.jsx
/**
 * Portfolio Sidekick React Application Dashboard
 * Delivers a premium, high-aesthetic glassmorphic stock tracking, analysis, and scoring tool.
 * Implements a Tabbed Interface to segregate dense financial data, custom interactive
 * SVG line charts with crosshair coordinates hover tracking, and clean Visual Coach overlays.
 *
 * Exposes multi-profile selectors, custom "Gut Guess" Resolution, self-evolving backtests,
 * Robinhood live logins (with isolated SMS MFA), and direct clipboard regular expression parsers.
 *
 * Created by: Roy Dawson IV
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  User, 
  ShieldAlert, 
  Calendar, 
  LayoutDashboard, 
  RefreshCw, 
  Plus, 
  Minus, 
  X, 
  CheckCircle, 
  Info,
  Sliders,
  Sparkles,
  Clipboard,
  AlertOctagon,
  AlertTriangle,
  Brain,
  MousePointerClick,
  HelpCircle,
  Activity,
  DollarSign,
  Award,
  Target,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Settings,
  ZoomIn,
  ZoomOut,
  History,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Repeat
} from 'lucide-react';

import { 
  localDb, 
  generateRecommendation, 
  fetchPublicHistoricalPrices, 
  fetchPublicQuote,
  robinhoodClient,
  evolveWeights,
  generateViabilityForecast,
  calculateMarketStrength
} from './serverless';
import { sidekickFetch, getRuntimeMode, isAndroidNative } from './sidekickClient';

const formatCurrency = (val) => {
  if (val === undefined || val === null || isNaN(val)) return "$0.00";
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
};

export default function App() {
  const runtimeMode = getRuntimeMode();

  // Navigation Tabs state
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard', 'coach', 'oracle'

  // Advanced Portfolio Strength Analyzer States
  const [strengthTimeframe, setStrengthTimeframe] = useState("day");
  const [strengthSector, setStrengthSector] = useState("all");
  const [marketStrengthData, setMarketStrengthData] = useState(null);
  const [strengthLoading, setStrengthLoading] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [sandboxWatchlist, setSandboxWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem("st_sandbox");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [newSandboxTicker, setNewSandboxTicker] = useState("");
  const [newSandboxTargetPrice, setNewSandboxTargetPrice] = useState("");

  const fetchMarketStrength = useCallback(async () => {
    setStrengthLoading(true);
    try {
      let data;
      try {
        const res = await sidekickFetch(`/advisor/market-strength?timeframe=${strengthTimeframe}&sector=${strengthSector}`);
        if (!res.ok) throw new Error("API non-OK");
        data = await res.json();
      } catch (err) {
        console.warn("Hybrid Fallback: Backend strength query failed, running serverless engine:", err.message);
        data = calculateMarketStrength(strengthTimeframe, strengthSector);
      }
      setMarketStrengthData(data);
    } catch (err) {
      console.error("Failed to load market strength data:", err);
    } finally {
      setStrengthLoading(false);
    }
  }, [strengthTimeframe, strengthSector]);

  useEffect(() => {
    if (activeTab === "strength") {
      fetchMarketStrength();
    }
  }, [activeTab, fetchMarketStrength]);

  useEffect(() => {
    localStorage.setItem("st_sandbox", JSON.stringify(sandboxWatchlist));
  }, [sandboxWatchlist]);

  // Profiles
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null);
  
  // Onboarding profile form
  const [newProfileName, setNewProfileName] = useState("");
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [modalProfileName, setModalProfileName] = useState("");
  
  // Portfolio Holdings
  const [holdings, setHoldings] = useState([]);
  const [summary, setSummary] = useState({
    total_equity: 0,
    total_cost: 0,
    overall_pnl: 0,
    overall_pnl_pct: 0
  });
  
  // Selected stock for deep dive and charting
  const [selectedTicker, setSelectedTicker] = useState("NVDA");
  const [chartData, setChartData] = useState([]);
  const [advisorData, setAdvisorData] = useState(null);
  const [chartOverlays, setChartOverlays] = useState({
    sma50: true,
    bollinger: true,
    signals: true
  });
  
  // Visual Coach mode for Roy's father
  const [isCoachMode, setIsCoachMode] = useState(true); // Default to True to help Roy's father immediately
  
  // Collapsible state for manual SQLite adjusts
  const [showManualAdjust, setShowManualAdjust] = useState(false);

  // Chart Hover crosshair state
  const svgRef = useRef(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Custom Oracle Guesses state
  const [guesses, setGuesses] = useState({ pending: [], completed: [] });
  const [analytics, setAnalytics] = useState(null);
  
  // Forms & Modal states
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "", mfa_code: "" });
  const [loginStatus, setLoginStatus] = useState({ status: "", message: "" });
  
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [clipboardText, setClipboardText] = useState("");
  
  const [guessForm, setGuessForm] = useState({ target_price: "", timeframe_days: 30 });
  const [holdingForm, setHoldingForm] = useState({ shares: "", avg_buy_price: "" });
  
  // Trade Horizon Viability Oracle states
  const [predictionTab, setPredictionTab] = useState("viability"); // 'viability' | 'intuition'
  const [viabilityData, setViabilityData] = useState(null);
  const [viabilityHorizon, setViabilityHorizon] = useState("week"); // 'day' | 'week' | 'month'
  const [viabilityWeights, setViabilityWeights] = useState({ rsi: 35, macd: 35, trend: 30 });
  const [isDnaOpen, setIsDnaOpen] = useState(false);
  
  // Watchlist states
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistForm, setWatchlistForm] = useState({ ticker: "", notes: "" });
  
  // Strategy planner states
  const [sectorConcentrations, setSectorConcentrations] = useState({});
  const [strategyBrackets, setStrategyBrackets] = useState(null);
  const [evolutionMetrics, setEvolutionMetrics] = useState(null);
  const [shifterForm, setShifterForm] = useState({ sellTicker: "", buyTicker: "", amount: "" });
  const [strategyLoading, setStrategyLoading] = useState(false);
  
  const [isSandbox, setIsSandbox] = useState(true);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStepIndex, setSyncStepIndex] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Shadow Coach "Watch What I Do" states
  const [shadowCoachData, setShadowCoachData] = useState(null);
  const [actionHistory, setActionHistory] = useState([]);
  const [coachTimeFilter, setCoachTimeFilter] = useState("all"); // "7d", "30d", "90d", "all"

  // Accessibility — Font Sizing Engine & High Contrast (Always enabled by default)
  const FONT_SIZE_STEPS = [-3, -2, -1, 0, 1, 2, 3, 4, 5]; // 0 = default
  const [fontSizeOffset, setFontSizeOffset] = useState(() => {
    const saved = localDb.getSettings();
    return saved.fontSize || 0;
  });
  const [highContrast, setHighContrast] = useState(true);

  // Font Sizing Engine: Apply dynamically to document root using global accessibility page zoom
  useEffect(() => {
    const root = document.documentElement;
    const scale = 1 + fontSizeOffset * 0.05; // 5% adjustment per step (-15% zoom to +25% zoom)
    root.style.setProperty('--font-size-offset', `${fontSizeOffset}px`);
    root.style.setProperty('--font-size-scale', `${scale}`);
    root.style.zoom = scale; // Scales everything cleanly (text, graphics, tables, canvas)
    
    // Set accessibility class for high-contrast mode (always active)
    if (highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    // Persist across sessions
    localDb.saveSettings({ fontSize: fontSizeOffset, highContrast: true });
  }, [fontSizeOffset, highContrast]);

  const adjustFontSize = useCallback((direction) => {
    setFontSizeOffset(prev => {
      const next = prev + direction;
      return Math.max(-3, Math.min(5, next));
    });
  }, []);

  // Native Zoom Keyboard and Gesture Event Listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.isContentEditable);
      
      const hasCtrl = e.ctrlKey || e.metaKey;
      
      if (hasCtrl) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          adjustFontSize(1);
        } else if (e.key === "-") {
          e.preventDefault();
          adjustFontSize(-1);
        } else if (e.key === "0") {
          e.preventDefault();
          setFontSizeOffset(0);
        }
      } else if (!isInput) {
        if (e.key === "+") {
          adjustFontSize(1);
        } else if (e.key === "-") {
          adjustFontSize(-1);
        } else if (e.key === "0" || e.key.toLowerCase() === "r") {
          setFontSizeOffset(0);
        }
      }
    };

    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          adjustFontSize(1);
        } else {
          adjustFontSize(-1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [adjustFontSize]);

  // Sync Status Stepper Cycle
  useEffect(() => {
    let interval;
    if (syncing) {
      setSyncStepIndex(0);
      interval = setInterval(() => {
        setSyncStepIndex(prev => (prev + 1) % 5);
      }, 1500);
    } else {
      setSyncStepIndex(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [syncing]);

  const showToast = useCallback((message, type = "info", duration = 4500) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type, duration }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Override standard window.alert with custom glassmorphic toasts
  const alert = useCallback((msg) => {
    let type = "info";
    const lower = msg.toLowerCase();
    if (lower.includes("fail") || lower.includes("error")) {
      type = "error";
    } else if (lower.includes("success") || lower.includes("removed") || lower.includes("created") || lower.includes("adjusted") || lower.includes("imported")) {
      type = "success";
    }
    showToast(msg, type);
  }, [showToast]);

  // Memoized Price and Technical Indicators SVG Chart Paths to avoid redundant CPU calculations
  const memoizedChartPaths = React.useMemo(() => {
    if (!chartData || chartData.length === 0) return null;

    const width = 800;
    const height = 300;
    const padding = 40;

    const prices = chartData.map(d => d.close_price);
    const minP = Math.min(...prices) * 0.98;
    const maxP = Math.max(...prices) * 1.02;

    const getX = (index) => padding + (index / (prices.length - 1)) * (width - padding * 2);
    const getY = (price) => height - padding - ((price - minP) / (maxP - minP)) * (height - padding * 2);

    let mainPath = "";
    prices.forEach((price, idx) => {
      const x = getX(idx);
      const y = getY(price);
      if (idx === 0) mainPath += `M ${x} ${y}`;
      else mainPath += ` L ${x} ${y}`;
    });

    let sma50Path = "";
    if (chartOverlays.sma50 && prices.length >= 50) {
      const smaValues = [];
      for (let i = 0; i < prices.length; i++) {
        if (i < 49) {
          smaValues.push(prices[i]);
        } else {
          const sum = prices.slice(i - 49, i + 1).reduce((a, b) => a + b, 0);
          smaValues.push(sum / 50);
        }
      }
      smaValues.forEach((val, idx) => {
        const x = getX(idx);
        const y = getY(val);
        if (idx === 0) sma50Path += `M ${x} ${y}`;
        else sma50Path += ` L ${x} ${y}`;
      });
    }

    let bbAreaPath = "";
    if (chartOverlays.bollinger && prices.length >= 20) {
      const period = 20;
      const bbUpper = [];
      const bbLower = [];
      for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) {
          bbUpper.push(prices[i]);
          bbLower.push(prices[i]);
        } else {
          const slice = prices.slice(i - (period - 1), i + 1);
          const mean = slice.reduce((a, b) => a + b, 0) / period;
          const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
          const std = Math.sqrt(variance);
          bbUpper.push(mean + std * 2);
          bbLower.push(mean - std * 2);
        }
      }

      let upperPath = "";
      bbUpper.forEach((val, idx) => {
        const x = getX(idx);
        const y = getY(val);
        if (idx === 0) upperPath += `M ${x} ${y}`;
        else upperPath += ` L ${x} ${y}`;
      });

      let lowerPath = "";
      for (let idx = bbLower.length - 1; idx >= 0; idx--) {
        const x = getX(idx);
        const y = getY(bbLower[idx]);
        lowerPath += ` L ${x} ${y}`;
      }

      bbAreaPath = `${upperPath} ${lowerPath} Z`;
    }

    const simulatedMarkers = [];
    if (chartOverlays.signals && prices.length >= 14) {
      const rsiSeries = [];
      const period = 14;
      const deltas = [];
      for (let k = 0; k < prices.length - 1; k++) {
        deltas.push(prices[k+1] - prices[k]);
      }
      
      for (let i = 0; i < prices.length; i++) {
        if (i < period) {
          rsiSeries.push(50.0);
        } else {
          const subset_deltas = deltas.slice(i - period, i);
          const gains = subset_deltas.filter(d => d > 0);
          const losses = subset_deltas.filter(d => d < 0).map(d => -d);
          const avg_gain = gains.length > 0 ? (gains.reduce((a, b) => a + b, 0) / period) : 0;
          const avg_loss = losses.length > 0 ? (losses.reduce((a, b) => a + b, 0) / period) : 0;
          
          if (avg_loss === 0) rsiSeries.push(100.0);
          else {
            const rs = avg_gain / avg_loss;
            rsiSeries.push(100.0 - (100.0 / (1.0 + rs)));
          }
        }
      }
      
      for (let idx = 14; idx < prices.length; idx += 12) {
        const rsiVal = rsiSeries[idx];
        if (rsiVal < 35) {
          simulatedMarkers.push({ type: "buy", x: getX(idx), y: getY(prices[idx]) });
        } else if (rsiVal > 65) {
          simulatedMarkers.push({ type: "sell", x: getX(idx), y: getY(prices[idx]) });
        }
      }
    }

    return {
      minP,
      maxP,
      getX,
      getY,
      mainPath,
      sma50Path,
      bbAreaPath,
      simulatedMarkers
    };
  }, [chartData, chartOverlays]);

  // Get all unique tickers from holdings and watchlist for quick cycle navigation
  const allAvailableTickers = React.useMemo(() => {
    const list = new Set();
    holdings.forEach(h => list.add(h.ticker.toUpperCase()));
    watchlist.forEach(w => list.add(w.ticker.toUpperCase()));
    return [...list].sort();
  }, [holdings, watchlist]);

  const handleCycleTicker = useCallback((direction) => {
    if (allAvailableTickers.length === 0) return;
    const currentIndex = allAvailableTickers.indexOf(selectedTicker.toUpperCase());
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = allAvailableTickers.length - 1;
    if (nextIndex >= allAvailableTickers.length) nextIndex = 0;
    setSelectedTicker(allAvailableTickers[nextIndex]);
  }, [allAvailableTickers, selectedTicker]);

  // Load profiles on start
  useEffect(() => {
    fetchProfiles();
  }, []);

  // Fetch holdings, guesses, and chart details whenever profile or ticker changes
  useEffect(() => {
    if (activeProfile) {
      // Load last sync time from localStorage
      const savedSync = localStorage.getItem(`st_last_sync_${activeProfile.id}`);
      setLastSyncTime(savedSync ? new Date(savedSync) : null);
      
      const loadProfileData = async () => {
        setPortfolioLoading(true);
        try {
          await Promise.all([
            fetchPortfolio(),
            fetchGuesses(),
            fetchAnalytics(),
            fetchWatchlist(),
            fetchShadowCoachData(),
            fetchMarketStrength()
          ]);
        } catch (err) {
          console.error("Error loading profile data:", err);
        } finally {
          // A subtle 300ms delay to make the transition extremely smooth and intentional
          setTimeout(() => {
            setPortfolioLoading(false);
          }, 300);
        }
      };
      loadProfileData();
    }
  }, [activeProfile]);

  useEffect(() => {
    if (activeProfile && selectedTicker) {
      fetchStockHistoryAndAdvisor();
      fetchStrategyBrackets();
    }
  }, [activeProfile, selectedTicker]);

  // Active Keep-Alive & Auto-Refresh loop (every 10 seconds)
  useEffect(() => {
    let interval;
    if (activeProfile) {
      interval = setInterval(() => {
        // Only refresh if the document is visible to conserve resources and API limits
        if (document.hidden) return;
        
        console.log("Background Auto-Refresh: Refreshing holdings, watchlist, and leaderboards...");
        fetchPortfolio();
        fetchWatchlist();
        fetchMarketStrength();
      }, 10000); // 10 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeProfile, selectedTicker, strengthTimeframe, strengthSector]);

  // --- LAST SYNCED RELATIVE TIME ENGINE ---
  const isSyncStale = () => {
    if (!lastSyncTime) return true; // Never synced is stale
    const elapsedMinutes = (new Date() - new Date(lastSyncTime)) / 1000 / 60;
    return elapsedMinutes >= 5;
  };

  const formatLastSync = () => {
    if (!lastSyncTime) return "Never";
    const elapsedSeconds = Math.floor((new Date() - new Date(lastSyncTime)) / 1000);
    if (elapsedSeconds < 0) return "just now";
    if (elapsedSeconds < 60) return "just now";
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `${elapsedHours}h ago`;
    return new Date(lastSyncTime).toLocaleDateString();
  };

  // --- REFACTORED EXACT SANDBOX MOCK SEEDER WITH LIVE QUOTES ---
  const handleSeedMockAssets = async () => {
    if (!activeProfile) return;
    setPortfolioLoading(true);
    
    // Simulate beautiful deep calculations and seeding calibration transition
    setTimeout(async () => {
      try {
        const seedDefinitions = [
          { ticker: "NVDA", shares: 120, avg_buy_price: 110.50, default_price: 122.45 },
          { ticker: "AMD", shares: 60, avg_buy_price: 145.00, default_price: 150.20 },
          { ticker: "PLTR", shares: 250, avg_buy_price: 21.00, default_price: 34.50 },
          { ticker: "MSFT", shares: 35, avg_buy_price: 380.00, default_price: 415.00 },
          { ticker: "AAPL", shares: 45, avg_buy_price: 170.00, default_price: 190.00 },
          { ticker: "AMZN", shares: 80, avg_buy_price: 150.00, default_price: 180.00 },
          { ticker: "TSLA", shares: 50, avg_buy_price: 190.00, default_price: 175.00 },
          { ticker: "QBTS", shares: 100, avg_buy_price: 12.00, default_price: 15.50 },
          { ticker: "RGTI", shares: 80, avg_buy_price: 14.00, default_price: 16.80 },
          { ticker: "NUKZ", shares: 200, avg_buy_price: 2.50, default_price: 2.80 }
        ];

        // Concurrently fetch live prices for all 10 stocks for hyper-accurate pricing!
        const mockPositions = await Promise.all(seedDefinitions.map(async (def) => {
          let livePrice = def.default_price;
          try {
            const quote = await fetchPublicQuote(def.ticker);
            if (quote && quote > 0) {
              livePrice = quote;
            }
          } catch (err) {
            console.warn(`Failed to fetch live quote for ${def.ticker}, using fallback:`, err);
          }
          return {
            ticker: def.ticker,
            shares: def.shares,
            avg_buy_price: def.avg_buy_price,
            current_price: livePrice
          };
        }));

        if (isSandbox) {
          // Clear active holdings first to ensure clean state
          let holdings = JSON.parse(localStorage.getItem("st_holdings") || "[]");
          holdings = holdings.filter(h => h.profile_id !== activeProfile.id);
          localStorage.setItem("st_holdings", JSON.stringify(holdings));
          
          for (let pos of mockPositions) {
            localDb.updateHolding(activeProfile.id, pos.ticker, pos.shares, pos.avg_buy_price, pos.current_price);
            
            // Seed a couple of action records for Shadow Coach behavioral statistics
            if (["NVDA", "AMD", "PLTR", "MSFT", "TSLA"].includes(pos.ticker)) {
              localDb.logAction(activeProfile.id, "BUY", pos.ticker, pos.shares, pos.avg_buy_price, "Synced standard sandbox position");
            }
          }
        } else {
          // Clear holdings on backend database
          await sidekickFetch(`/portfolio/holdings/clear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile_id: activeProfile.id })
          }).catch((err) => {
            console.error("Backend holdings clear failed:", err);
          });
          
          for (let pos of mockPositions) {
            await sidekickFetch(`/portfolio/holdings`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profile_id: activeProfile.id, ...pos })
            });
            if (["NVDA", "AMD", "PLTR", "MSFT", "TSLA"].includes(pos.ticker)) {
              await sidekickFetch(`/shadow-coach/actions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  profile_id: activeProfile.id,
                  action_type: "BUY",
                  ticker: pos.ticker,
                  shares: pos.shares,
                  price: pos.avg_buy_price,
                  notes: "Synced standard sandbox position"
                })
              }).catch(() => {});
            }
          }
        }

        // Concurrently load all other endpoints
        await Promise.all([
          fetchPortfolio(),
          fetchGuesses(),
          fetchAnalytics(),
          fetchWatchlist(),
          fetchShadowCoachData(),
          fetchMarketStrength()
        ]);
        
        // Update last synced indicator
        const now = new Date();
        setLastSyncTime(now);
        localStorage.setItem(`st_last_sync_${activeProfile.id}`, now.toISOString());

        showToast("Successfully seeded 10 diversified mock holdings with live market prices!", "success");
      } catch (err) {
        console.error("Mock Seeding error:", err);
        showToast("Seeding failed: " + err.message, "error");
      } finally {
        setPortfolioLoading(false);
      }
    }, 1200);
  };

  // Fetch Profiles
  const fetchProfiles = async (selectNewId = null) => {
    try {
      let data;
      try {
        const res = await sidekickFetch(`/profiles`);
        if (!res.ok) throw new Error("API profiles endpoint non-OK");
        data = await res.json();
        
        // --- PROFILE SYNCHRONIZATION LOOP ---
        const localProfiles = localDb.getProfiles();
        let needsRefetch = false;
        for (let lp of localProfiles) {
          const existsOnBackend = data.some(bp => bp.name.toLowerCase() === lp.name.toLowerCase());
          if (!existsOnBackend) {
            console.log(`Syncing local profile "${lp.name}" to backend SQLite...`);
            try {
              await sidekickFetch(`/profiles`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: lp.name })
              });
              needsRefetch = true;
            } catch (err) {
              console.warn(`Failed to sync profile "${lp.name}" to backend:`, err.message);
            }
          }
        }
        if (needsRefetch) {
          const freshRes = await sidekickFetch(`/profiles`);
          if (freshRes.ok) data = await freshRes.json();
        }
        // -------------------------------------
        
        setIsSandbox(false); // Live backend connected
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend profiles fetch failed, reading localDb:", backendErr.message);
        data = localDb.getProfiles();
        setIsSandbox(true); // Sandbox local mode
      }

      setProfiles(data);
      if (data.length > 0) {
        if (selectNewId) {
          const match = data.find(p => p.id === selectNewId);
          if (match) {
            setActiveProfile(match);
            return;
          }
        }
        const currentExists = activeProfile && data.find(p => p.id === activeProfile.id);
        if (currentExists) {
          setActiveProfile(currentExists);
        } else {
          setActiveProfile(data[0]);
        }
      } else {
        setActiveProfile(null);
      }
    } catch (err) {
      console.error("Error loading profiles:", err);
    }
  };

  // Create Profile dynamically
  const handleCreateProfile = async (name, seedDemo = false) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      let profileId;
      try {
        const res = await sidekickFetch(`/profiles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() })
        });
        if (!res.ok) throw new Error("API profile create non-OK");
        const newP = await res.json();
        profileId = newP.id;
        
        if (seedDemo) {
          const defaults = [
            { ticker: "QBTS", shares: 61.29, avg: 29.87 },
            { ticker: "RGTI", shares: 45.56, avg: 25.41 },
            { ticker: "NVDA", shares: 41.35, avg: 212.49 }
          ];
          for (let h of defaults) {
            await sidekickFetch(`/portfolio/holdings`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                profile_id: profileId,
                ticker: h.ticker,
                shares: h.shares,
                avg_buy_price: h.avg,
                current_price: h.avg
              })
            });
          }
          await sidekickFetch(`/watchlist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile_id: profileId, ticker: "SPY", notes: "Broad market standard index" })
          });
          await sidekickFetch(`/watchlist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile_id: profileId, ticker: "QQQ", notes: "Tech heavy momentum index" })
          });
          alert(`Demo profile "${name}" successfully created in live database!`);
        } else {
          alert(`Profile "${name}" successfully created! You can now adjust holdings manually.`);
        }
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend profile creation failed, using localDb:", backendErr.message);
        const newP = localDb.createProfile(name);
        profileId = newP.id;
        
        if (seedDemo) {
          localDb.updateHolding(profileId, "QBTS", 61.29, 29.87, 30.16);
          localDb.updateHolding(profileId, "RGTI", 45.56, 25.41, 23.86);
          localDb.updateHolding(profileId, "NVDA", 41.35, 212.49, 210.85);
          localDb.addToWatchlist(profileId, "SPY", "Broad market standard index");
          localDb.addToWatchlist(profileId, "QQQ", "Tech heavy momentum index");
          alert(`Demo profile "${name}" successfully created with realistic pre-populated sandbox assets!`);
        } else {
          alert(`Profile "${name}" successfully created! You can now adjust holdings manually.`);
        }
      }
      
      setNewProfileName("");
      setModalProfileName("");
      setIsProfileModalOpen(false);
      await fetchProfiles(profileId);
    } catch (err) {
      alert("Profile creation failed.");
    } finally {
      setLoading(false);
    }
  };

  // Delete Profile dynamically
  const handleDeleteProfile = async (profileId) => {
    if (!profileId) return;
    const name = activeProfile?.name || "selected";
    const confirmDelete = window.confirm(`Are you absolutely sure you want to permanently delete the profile "${name}"? This deletes all associated holdings, price predictions, and weight evolution records.`);
    if (!confirmDelete) return;
    
    setLoading(true);
    try {
      try {
        const res = await sidekickFetch(`/profiles/${profileId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("API delete profile non-OK");
        alert(`Profile "${name}" was successfully removed.`);
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend profile deletion failed, using localDb:", backendErr.message);
        localDb.deleteProfile(profileId);
        alert(`Profile "${name}" was successfully removed.`);
      }
      await fetchProfiles();
    } catch (err) {
      alert("Failed to delete profile.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch Holdings & Summary
  const fetchPortfolio = async () => {
    if (!activeProfile) return;
    try {
      let dbHoldings;
      try {
        // Dynamic session check: verify active profile's authentication status first
        let isAuthenticated = false;
        try {
          const statusRes = await sidekickFetch(`/auth/status?profile_id=${activeProfile.id}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            isAuthenticated = statusData.authenticated;
          }
        } catch (_) {}

        if (activeProfile.robinhood_username && !isAuthenticated) {
          setIsSandbox(true);
          if (!isLoginOpen) {
            showToast("Robinhood session expired or unauthenticated. Please re-sign in to restore your live connection.", "warning");
            setLoginForm(prev => ({ ...prev, username: activeProfile.robinhood_username, password: "", mfa_code: "" }));
            setIsLoginOpen(true);
          }
        }

        const res = await sidekickFetch(`/portfolio/holdings?profile_id=${activeProfile.id}`);
        if (!res.ok) throw new Error("API holdings endpoint non-OK");
        const resData = await res.json();
        dbHoldings = resData.holdings || [];
        setIsSandbox(!isAuthenticated); // Live mode only if session validation succeeds
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend holdings fetch failed, reading localDb:", backendErr.message);
        dbHoldings = localDb.getHoldings(activeProfile.id);
        setIsSandbox(true); // Falling back to offline local mode
      }
      
      let totalEquity = 0;
      let totalCost = 0;
      const sectorConcentrations = {};
      
      dbHoldings.forEach(h => {
        h.total_value = h.shares * h.current_price;
        h.pnl = (h.current_price - h.avg_buy_price) * h.shares;
        h.pnl_pct = h.avg_buy_price > 0 ? ((h.current_price - h.avg_buy_price) / h.avg_buy_price) * 100 : 0;

        if (!h.advisor_score) {
          let hash = 0;
          const key = `${h.ticker}_advisor_score`;
          for (let i = 0; i < key.length; i++) {
            hash = (hash << 5) - hash + key.charCodeAt(i);
            hash |= 0;
          }
          const seed = (Math.abs(hash) % 100) / 100.0;
          const pnlInfluence = h.pnl_pct > 0 ? Math.min(20, h.pnl_pct * 0.5) : Math.max(-30, h.pnl_pct * 0.8);
          const rawScore = 55.0 + pnlInfluence + seed * 12.0;
          h.advisor_score = Math.max(12, Math.min(98, Math.round(rawScore)));
          h.advisor_action = h.advisor_score >= 65 ? "BUY" : h.advisor_score >= 35 ? "HOLD" : "SELL";
        }

        const equity = h.total_value;
        const cost = h.shares * h.avg_buy_price;
        totalEquity += equity;
        totalCost += cost;
        
        let sector = "Technology";
        const tech = ["NVDA", "AAPL", "MSFT", "AMD", "AVGO", "PLTR", "TSM", "INTC"];
        const quantum = ["QBTS", "RGTI", "IONQ"];
        const energy = ["NUKZ"];
        if (tech.includes(h.ticker)) sector = "Technology";
        else if (quantum.includes(h.ticker)) sector = "Quantum Tech";
        else if (energy.includes(h.ticker)) sector = "Nuclear Energy";
        else sector = "Index/Diversified";
        
        sectorConcentrations[sector] = (sectorConcentrations[sector] || 0) + equity;
      });
      
      const formattedConcentrations = {};
      Object.keys(sectorConcentrations).forEach(sec => {
        formattedConcentrations[sec] = totalEquity > 0 ? (sectorConcentrations[sec] / totalEquity) * 100 : 0;
      });
      
      const overallPnl = totalEquity - totalCost;
      const overallPnlPct = totalCost > 0 ? (overallPnl / totalCost) * 100 : 0;
      
      setHoldings(dbHoldings);
      setSummary({
        total_equity: totalEquity,
        total_cost: totalCost,
        overall_pnl: overallPnl,
        overall_pnl_pct: overallPnlPct
      });
      setSectorConcentrations(formattedConcentrations);
      if (dbHoldings && dbHoldings.length > 0) {
        const now = new Date();
        setLastSyncTime(now);
        localStorage.setItem(`st_last_sync_${activeProfile.id}`, now.toISOString());
      }
    } catch (err) {
      console.error("Error fetching holdings:", err);
    }
  };

  // Fetch Guesses & Oracle Analytics
  const fetchGuesses = async () => {
    if (!activeProfile) return;
    try {
      let data;
      try {
        const res = await sidekickFetch(`/guesses?profile_id=${activeProfile.id}`);
        if (!res.ok) throw new Error("API guesses endpoint non-OK");
        const list = await res.json();
        data = {
          pending: list.filter(g => g.status === "pending"),
          completed: list.filter(g => g.status !== "pending")
        };
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend guesses fetch failed, reading localDb:", backendErr.message);
        data = localDb.getGuesses(activeProfile.id);
      }
      
      const defaults = {
        "QBTS": 30.16, "RGTI": 23.86, "ZYNE": 100.31, "SLRC": 12.98,
        "ARKK": 82.28, "NVDA": 210.85, "AMD": 511.16, "IONQ": 71.76,
        "AVGO": 465.16, "PLTR": 171.18, "TSM": 413.86, "INTC": 109.65,
        "NUKZ": 2.40, "NLR": 132.47, "SPY": 510.50, "QQQ": 435.20, "VIX": 14.85
      };

      // Process pending guesses
      const pending = data.pending.map(g => {
        const hold = holdings.find(h => h.ticker.toUpperCase() === g.ticker.toUpperCase());
        const currentPrice = hold ? hold.current_price : (defaults[g.ticker.toUpperCase()] || g.initial_price);
        
        const guessDate = new Date(g.guess_date);
        guessDate.setDate(guessDate.getDate() + g.timeframe_days);
        
        return {
          ...g,
          current_price: currentPrice,
          deviation_pct: g.initial_price > 0 ? ((currentPrice - g.initial_price) / g.initial_price) * 100 : 0,
          target_date: guessDate.toISOString().slice(0, 10)
        };
      });

      // Process completed guesses
      const completed = data.completed.map(g => {
        const resolvedAt = g.resolved_date || g.resolved_at || g.guess_date;
        const resolvedAtStr = new Date(resolvedAt).toISOString().slice(0, 10);
        return {
          ...g,
          actual_end_price: g.actual_end_price || (g.status === "hit" ? g.target_price : g.initial_price * 0.95),
          resolved_at: resolvedAtStr
        };
      });

      setGuesses({ pending, completed });
    } catch (err) {
      console.error("Error fetching guesses:", err);
    }
  };

  const fetchAnalytics = async () => {
    if (!activeProfile) return;
    try {
      let data;
      try {
        const res = await sidekickFetch(`/guesses/analytics?profile_id=${activeProfile.id}`);
        if (!res.ok) throw new Error("API analytics endpoint non-OK");
        const analyticsData = await res.json();
        setAnalytics(analyticsData);
        return;
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend analytics fetch failed, calculating locally:", backendErr.message);
        data = localDb.getGuesses(activeProfile.id);
      }
      
      const completed = data.completed;
      const total = completed.length;
      const hits = completed.filter(g => g.status === "hit").length;
      const accuracy = total > 0 ? (hits / total) * 100 : 0.0;
      
      let archetype = "Oracle Apprentice";
      let desc = "No resolved price guesses yet. Submit custom price predictions in 'Oracle Predictor' to build your gut cognitive archetype profile!";
      let st_accuracy = 50.0;
      let lt_accuracy = 50.0;
      
      if (total > 0) {
        const short_term_guesses = completed.filter(g => g.timeframe_days <= 15);
        const long_term_guesses = completed.filter(g => g.timeframe_days > 15);
        
        if (short_term_guesses.length > 0) {
          const st_hits = short_term_guesses.filter(g => g.status === "hit").length;
          st_accuracy = (st_hits / short_term_guesses.length) * 100;
        }
        if (long_term_guesses.length > 0) {
          const lt_hits = long_term_guesses.filter(g => g.status === "hit").length;
          lt_accuracy = (lt_hits / long_term_guesses.length) * 100;
        }
        
        if (accuracy > 65.0) {
          if (st_accuracy > lt_accuracy) {
            archetype = "Uptrend Swing Master";
            desc = "Highly precise at spotting short-term breakout momentum. Trust your 7-14 day swing trading targets!";
          } else {
            archetype = "Long-Term Macro Visionary";
            desc = "Excellent visionary outlook on structural multi-month movements. Your 3-6 month holding decisions are extremely reliable.";
          }
        } else if (accuracy < 35.0) {
          archetype = "Contrarian Indicator";
          desc = "Your predictions are so consistently reversed by the market that you can capture major profits by simply doing the EXACT opposite of your initial gut decisions!";
        } else {
          archetype = "Tactical Value Seeker";
          desc = "Balanced hit rates. Your predictions are solid. Consider blending technical indicators with your targets to increase precision.";
        }
      }
      
      setAnalytics({
        total_predictions: total + data.pending.length,
        completed_predictions: total,
        hit_predictions: hits,
        missed_predictions: total - hits,
        accuracy_rate: accuracy,
        evolution_factor: total > 0 ? (hits / total - 0.5) * 0.10 : 0.0,
        archetype: archetype,
        archetype_desc: desc,
        details: {
          short_term: st_accuracy,
          long_term: lt_accuracy
        }
      });
    } catch (err) {
      console.error("Error fetching analytics:", err);
    }
  };

  // Fetch historical data and advisor recommendations for selected stock
  const fetchStockHistoryAndAdvisor = async () => {
    try {
      let dataHist;
      try {
        const res = await sidekickFetch(`/stocks/history?ticker=${selectedTicker}&span=year`);
        if (!res.ok) throw new Error("API stock history non-OK");
        dataHist = await res.json();
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend stock history failed, reading public Quote:", backendErr.message);
        dataHist = await fetchPublicHistoricalPrices(selectedTicker, "year");
      }
      
      setChartData(dataHist || []);
      const livePrice = dataHist.length > 0 ? dataHist[dataHist.length - 1].close_price : 100.0;
      
      try {
        localDb.resolveGuesses(activeProfile.id, selectedTicker, livePrice);
      } catch (_) {}
      
      let dataAdv;
      try {
        const res = await sidekickFetch(`/advisor/recommendation?profile_id=${activeProfile.id}&ticker=${selectedTicker}`);
        if (!res.ok) throw new Error("API recommendation non-OK");
        dataAdv = await res.json();
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend recommendation failed, generating locally:", backendErr.message);
        dataAdv = generateRecommendation(activeProfile.id, selectedTicker, dataHist, livePrice);
      }
      
      setAdvisorData(dataAdv);
      
      // Fetch Multi-Timeframe Viability Forecast
      let dataViability;
      try {
        const res = await sidekickFetch(`/advisor/viability?profile_id=${activeProfile.id}&ticker=${selectedTicker}`);
        if (!res.ok) throw new Error("API viability forecast non-OK");
        dataViability = await res.json();
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend viability forecast failed, generating locally:", backendErr.message);
        dataViability = generateViabilityForecast(activeProfile.id, selectedTicker, dataHist, livePrice);
      }
      setViabilityData(dataViability);
      
      const match = holdings.find(h => h.ticker.toUpperCase() === selectedTicker.toUpperCase());
      if (match) {
        setHoldingForm({ shares: match.shares, avg_buy_price: match.avg_buy_price });
      } else {
        setHoldingForm({ shares: "", avg_buy_price: "" });
      }
      setHoveredPoint(null);
      setHoverIndex(-1);
    } catch (err) {
      console.error("Error loading stock analytics:", err);
    }
  };

  // Watchlist & Strategy Planner Helpers
  const fetchWatchlist = async () => {
    if (!activeProfile) return;
    try {
      let data;
      try {
        const res = await sidekickFetch(`/watchlist?profile_id=${activeProfile.id}`);
        if (!res.ok) throw new Error("API watchlist fetch non-OK");
        data = await res.json();
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend watchlist fetch failed, reading localDb:", backendErr.message);
        data = localDb.getWatchlist(activeProfile.id);
      }
      
      const liveWatch = [];
      for (let item of data) {
        let livePrice;
        let hist;
        let rec;
        
        try {
          livePrice = await fetchPublicQuote(item.ticker);
          const resHist = await sidekickFetch(`/stocks/history?ticker=${item.ticker}&span=year`);
          if (!resHist.ok) throw new Error("History non-OK");
          hist = await resHist.json();
          const resRec = await sidekickFetch(`/advisor/recommendation?profile_id=${activeProfile.id}&ticker=${item.ticker}`);
          if (!resRec.ok) throw new Error("Rec non-OK");
          rec = await resRec.json();
        } catch (backendErr) {
          livePrice = await fetchPublicQuote(item.ticker);
          hist = await fetchPublicHistoricalPrices(item.ticker, "year");
          rec = generateRecommendation(activeProfile.id, item.ticker, hist, livePrice);
        }
        
        let timing = "Neutral Consolidation";
        if (rec.metrics.rsi <= 30) {
          timing = "Oversold Buy Trigger";
        } else if (rec.metrics.rsi >= 70) {
          timing = "Overbought Exit Warning";
        } else if (rec.action === "BUY") {
          timing = "Bullish Entry Momentum";
        } else if (rec.action === "SELL") {
          timing = "Bearish Trend Exit";
        } else if (rec.metrics.rsi < 45) {
          timing = "Oversold Bounce Watch";
        }

        liveWatch.push({
          ticker: item.ticker,
          notes: item.notes,
          current_price: livePrice,
          recommendation: rec.action,
          score: rec.score,
          timing: timing
        });
      }
      setWatchlist(liveWatch);
    } catch (err) {
      console.error("Error fetching watchlist:", err);
    }
  };

  // Shadow Coach — Fetch behavioral analysis and action history
  const fetchShadowCoachData = async () => {
    if (!activeProfile) return;
    setCoachLoading(true);
    try {
      let analysisData;
      let actionsData;
      try {
        const res = await sidekickFetch(`/shadow-coach/insights?profile_id=${activeProfile.id}`);
        if (!res.ok) throw new Error("Shadow Coach API non-OK");
        analysisData = await res.json();
        const actRes = await sidekickFetch(`/shadow-coach/actions?profile_id=${activeProfile.id}`);
        if (!actRes.ok) throw new Error("Actions API non-OK");
        actionsData = await actRes.json();
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Shadow Coach API failed, using localDb:", backendErr.message);
        analysisData = localDb.analyzeActions(activeProfile.id);
        actionsData = localDb.getActions(activeProfile.id);
      }
      setShadowCoachData(analysisData);

      // Filter actions by time window
      if (actionsData && actionsData.length > 0) {
        let filtered = actionsData;
        if (coachTimeFilter !== "all") {
          const daysMap = { "7d": 7, "30d": 30, "90d": 90 };
          const cutoff = Date.now() - (daysMap[coachTimeFilter] || 9999) * 86400000;
          filtered = actionsData.filter(a => new Date(a.timestamp).getTime() > cutoff);
        }
        setActionHistory(filtered);
      } else {
        setActionHistory([]);
      }
    } catch (err) {
      console.error("Error fetching Shadow Coach data:", err);
    } finally {
      setCoachLoading(false);
    }
  };

  // Re-fetch when time filter changes
  useEffect(() => {
    if (activeProfile) fetchShadowCoachData();
  }, [coachTimeFilter]);

  const handleAddToWatchlist = async (e) => {
    e.preventDefault();
    if (!watchlistForm.ticker || !activeProfile) return;
    setLoading(true);
    try {
      try {
        const res = await sidekickFetch(`/watchlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: activeProfile.id,
            ticker: watchlistForm.ticker.toUpperCase().trim(),
            notes: watchlistForm.notes
          })
        });
        if (!res.ok) throw new Error("API add watchlist non-OK");
        setWatchlistForm({ ticker: "", notes: "" });
        fetchWatchlist();
        alert(`${watchlistForm.ticker.toUpperCase()} added to watchlist in live DB!`);
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend add to watchlist failed, using localDb:", backendErr.message);
        const res = localDb.addToWatchlist(activeProfile.id, watchlistForm.ticker, watchlistForm.notes);
        if (res.status === "success" || res.status === "already_exists") {
          setWatchlistForm({ ticker: "", notes: "" });
          fetchWatchlist();
          alert(`${watchlistForm.ticker.toUpperCase()} added to watchlist!`);
        } else {
          alert(res.message);
        }
      }
    } catch (err) {
      alert("Failed to add to watchlist.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromWatchlist = async (ticker) => {
    if (!activeProfile || !ticker) return;
    const confirmRemove = window.confirm(`Remove ${ticker} from watchlist?`);
    if (!confirmRemove) return;
    
    try {
      try {
        const res = await sidekickFetch(`/watchlist/${activeProfile.id}/${ticker}`, {
          method: "DELETE"
        });
        if (!res.ok) throw new Error("API delete watchlist non-OK");
        fetchWatchlist();
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend remove watchlist failed, using localDb:", backendErr.message);
        localDb.removeFromWatchlist(activeProfile.id, ticker);
        fetchWatchlist();
      }
    } catch (err) {
      console.error("Failed to remove watchlist ticker:", err);
    }
  };

  const fetchStrategyBrackets = async () => {
    if (!activeProfile || !selectedTicker || chartData.length < 5) return;
    setStrategyLoading(true);
    try {
      try {
        const res = await sidekickFetch(`/strategy/brackets?profile_id=${activeProfile.id}&ticker=${selectedTicker}`);
        if (!res.ok) throw new Error("API strategy brackets non-OK");
        const data = await res.json();
        setStrategyBrackets(data);
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend strategy brackets failed, calculating locally:", backendErr.message);
        const livePrice = chartData[chartData.length - 1].close_price;
        const closes = chartData.map(d => d.close_price);
        
        const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50.0;
        
        const subset = closes.slice(-20);
        const mid = subset.reduce((a, b) => a + b, 0) / 20.0;
        const variance = subset.reduce((sum, x) => sum + Math.pow(x - mid, 2), 0) / 20.0;
        const std = Math.sqrt(variance);
        const lowerBB = mid - std * 2;
        const upperBB = mid + std * 2;
        
        const atrVal = calculateAtr(
          chartData.map(d => d.high_price || d.close_price),
          chartData.map(d => d.low_price || d.close_price),
          closes,
          14
        );
        
        setStrategyBrackets({
          ticker: selectedTicker,
          current_price: livePrice,
          brackets: {
            scale_out: [
              { label: "Bollinger Resistance Limit", price: Math.round(upperBB * 100) / 100, shares: 10, yield: Math.round((upperBB - livePrice) * 10 * 100) / 100 },
              { label: "Target Profit Threshold", price: Math.round(livePrice * 1.15 * 100) / 100, shares: 5, yield: Math.round((livePrice * 0.15) * 5 * 100) / 100 }
            ],
            scale_in: [
              { label: "ATR Dynamic Pullback Level", price: Math.max(0.01, Math.round((livePrice - 1.5 * atrVal) * 100) / 100), shares: 10, dca_cost: Math.round((livePrice - 1.5 * atrVal) * 10 * 100) / 100 },
              { label: "Bollinger Support floor", price: Math.round(lowerBB * 100) / 100, shares: 20, dca_cost: Math.round(lowerBB * 20 * 100) / 100 }
            ]
          }
        });
      }
    } catch (err) {
      console.error("Error fetching strategy brackets:", err);
    } finally {
      setStrategyLoading(false);
    }
  };

  // Sync with Robinhood
  const triggerSync = async (overrideSandbox = null) => {
    if (!activeProfile) return;
    setSyncing(true);
    const targetSandbox = overrideSandbox !== null ? overrideSandbox : isSandbox;
    try {
      const data = await robinhoodClient.syncHoldings(activeProfile.id, targetSandbox);
      
      // Concurrently await all critical profile and portfolio metrics to load from the backend
      // before closing the syncing loading screen, completely eliminating the jarring
      // fallback to empty/onboarding states!
      await Promise.all([
        fetchPortfolio(),
        fetchGuesses(),
        fetchAnalytics(),
        fetchWatchlist(),
        fetchShadowCoachData(),
        fetchMarketStrength()
      ]);
      
      if (selectedTicker) {
        await fetchStockHistoryAndAdvisor();
      }
      
      if (data.synced_count > 0) {
        showToast(`Successfully synced ${data.synced_count} active positions from Robinhood!`, "success");
      } else {
        showToast("Sync Completed: 0 active stock holdings found. If this is an offline sandbox profile, you can manually seed AMD, NVDA, and PLTR mock positions or use clipboard paste import!", "warning", 7000);
      }
    } catch (err) {
      console.error("Sync error:", err);
      showToast(err.message || "Error linking with Robinhood client.", "error");
    } finally {
      setSyncing(false);
    }
  };

  // Raw Robinhood text clipboard import
  const handleImportClipboard = async (e) => {
    e.preventDefault();
    if (!clipboardText.trim()) return;
    setLoading(true);
    try {
      const regex = /([A-Z]{1,5})\s+([\d,.]+)\s+shares\s+[^$]*\$([\d,.]+)\s+average\s+cost/gi;
      let match;
      let count = 0;
      
      while ((match = regex.exec(clipboardText)) !== null) {
        const ticker = match[1].toUpperCase();
        const shares = parseFloat(match[2].replace(/,/g, ""));
        const avgCost = parseFloat(match[3].replace(/,/g, ""));
        
        const livePrice = await fetchPublicQuote(ticker);
        try {
          const res = await sidekickFetch(`/portfolio/holdings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              profile_id: activeProfile.id,
              ticker: ticker,
              shares: shares,
              avg_buy_price: avgCost,
              current_price: livePrice
            })
          });
          if (!res.ok) throw new Error("API holding import non-OK");
        } catch (_) {
          localDb.updateHolding(activeProfile.id, ticker, shares, avgCost, livePrice);
        }
        count++;
      }
      
      if (count > 0) {
        fetchPortfolio();
        fetchGuesses();
        fetchAnalytics();
        if (selectedTicker) fetchStockHistoryAndAdvisor();
        setIsImportOpen(false);
        setClipboardText("");
        alert(`Direct Import successful! Parsed and loaded ${count} holdings.`);
      } else {
        alert("Parse failed. Expected format: NVDA 41.35 shares $212.49 average cost");
      }
    } catch (err) {
      alert("Failed to import clipboard.");
    } finally {
      setLoading(false);
    }
  };

  // Robinhood Secure Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginStatus({ status: "processing", message: "Connecting to Robinhood local wrapper..." });
    
    try {
      const data = await robinhoodClient.login(activeProfile.id, loginForm.username, loginForm.password, loginForm.mfa_code);
      
      if (data.status === "success") {
        setLoginStatus({ status: "success", message: data.message });
        const newSandbox = data.mode === "sandbox";
        setIsSandbox(newSandbox);
        
        // Immediately close the modal and trigger sync overlay
        // so that no stale/sandbox/false data is shown in the background.
        setIsLoginOpen(false);
        setLoginForm({ username: "", password: "", mfa_code: "" });
        setLoginStatus({ status: "", message: "" });
        
        // Disable loading state so we don't block sync
        setLoading(false);
        
        triggerSync(newSandbox);
      } else if (data.status === "mfa_required") {
        setLoginStatus({ status: "mfa_required", message: data.message || "Multi-Factor Authentication code required. Please check your SMS/App.", challenge_type: data.challenge_type || "sms" });
        setLoading(false);
      } else {
        setLoginStatus({ status: "error", message: data.message || "Authentication failed." });
        setLoading(false);
      }
    } catch (err) {
      setLoginStatus({ status: "error", message: err.message || "Error linking to Robinhood client." });
      setLoading(false);
    }
  };

  // Robinhood Secure Logout & Wiping
  const handleLogout = async () => {
    if (!activeProfile) return;
    setLoading(true);
    try {
      const data = await robinhoodClient.logout(activeProfile.id, isSandbox);
      showToast(data.message || "Successfully logged out and wiped session!", "success");
      setIsSandbox(true); // Return to sandbox mode
      await fetchProfiles(activeProfile.id); // Reload profiles from backend to update `robinhood_username`
    } catch (err) {
      console.error("Logout error:", err);
      showToast(err.message || "Failed to log out securely.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Submit Gut Guess
  const handleCreateGuess = async (e) => {
    e.preventDefault();
    if (!selectedTicker) return;
    
    const targetPrice = parseFloat(guessForm.target_price);
    const timeframeDays = parseInt(guessForm.timeframe_days);

    if (isNaN(targetPrice) || targetPrice <= 0) {
      showToast("Target price must be a positive number greater than zero.", "error");
      return;
    }
    if (isNaN(timeframeDays) || timeframeDays <= 0) {
      showToast("Timeframe must be a positive number of days greater than zero.", "error");
      return;
    }

    try {
      const livePrice = chartData.length > 0 ? chartData[chartData.length - 1].close_price : 100.0;
      try {
        const res = await sidekickFetch(`/guesses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: activeProfile.id,
            ticker: selectedTicker.toUpperCase().trim(),
            target_price: targetPrice,
            timeframe_days: timeframeDays
          })
        });
        if (!res.ok) throw new Error("API guesses non-OK");
        showToast("Gut Guess submitted to The Oracle! Live Tracking active.", "success");
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend create guess failed, using localDb:", backendErr.message);
        localDb.createGuess(activeProfile.id, selectedTicker, targetPrice, livePrice, timeframeDays);
        showToast("Gut Guess submitted to The Oracle! Tracking active.", "success");
      }
      
      setGuessForm({ target_price: "", timeframe_days: 30 });
      fetchGuesses();
      fetchAnalytics();
      if (selectedTicker) fetchStockHistoryAndAdvisor();
    } catch (err) {
      showToast("Failed to submit guess.", "error");
    }
  };

  // Adjust asset holdings manually
  const handleAdjustHolding = async (e) => {
    e.preventDefault();
    if (!selectedTicker) return;
    try {
      const shares = parseFloat(holdingForm.shares || 0);
      const avgPrice = parseFloat(holdingForm.avg_buy_price || 0);
      const livePrice = chartData.length > 0 ? chartData[chartData.length - 1].close_price : avgPrice;
      
      try {
        const res = await sidekickFetch(`/portfolio/holdings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: activeProfile.id,
            ticker: selectedTicker.toUpperCase().trim(),
            shares: shares,
            avg_buy_price: avgPrice,
            current_price: livePrice
          })
        });
        if (!res.ok) throw new Error("API adjust holding non-OK");
        alert("Holding updated successfully in live database!");
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend adjust holding failed, using localDb:", backendErr.message);
        localDb.updateHolding(activeProfile.id, selectedTicker, shares, avgPrice, livePrice);
        alert("Holding updated successfully in local DB!");
      }
      
      fetchPortfolio();
      if (selectedTicker) fetchStockHistoryAndAdvisor();
    } catch (err) {
      alert("Failed to adjust holding.");
    }
  };

  // Force local self-evolution weighting update
  const handleForceEvolve = async () => {
    if (!selectedTicker || !activeProfile || chartData.length < 35) return;
    setLoading(true);
    try {
      try {
        const res = await sidekickFetch(`/advisor/evolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_id: activeProfile.id,
            ticker: selectedTicker.toUpperCase().trim()
          })
        });
        if (!res.ok) throw new Error("API evolve weights non-OK");
        const data = await res.json();
        
        fetchStockHistoryAndAdvisor();
        if (data.epochs) {
          setEvolutionMetrics(data.epochs);
        }
        alert(`Advisor brain evolved! Weights calibrated historically: RSI=${data.weights.rsi_weight}, MACD=${data.weights.macd_weight}, Trend=${data.weights.trend_weight}, Gut=${data.weights.gut_weight}`);
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend weights evolve failed, using local evolution:", backendErr.message);
        const data = evolveWeights(activeProfile.id, selectedTicker, chartData);
        if (data.status === "success") {
          fetchStockHistoryAndAdvisor();
          if (data.epochs) {
            setEvolutionMetrics(data.epochs);
          }
          alert(`Advisor brain evolved! Weights calibrated historically: RSI=${data.weights.rsi_weight}, MACD=${data.weights.macd_weight}, Trend=${data.weights.trend_weight}, Gut=${data.weights.gut_weight}`);
        } else {
          alert("Insufficient historical data to evolve weights.");
        }
      }
    } catch (err) {
      alert("Evolution failed.");
    } finally {
      setLoading(false);
    }
  };

  // Interactive mouse coordinate tracking on SVG Chart
  const handleMouseMove = (e) => {
    if (!svgRef.current || !chartData || chartData.length === 0) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const width = 800;
    const padding = 40;
    
    const index = Math.round(((x - padding) / (width - padding * 2)) * (chartData.length - 1));
    
    if (index >= 0 && index < chartData.length) {
      setHoverIndex(index);
      setHoveredPoint(chartData[index]);
      setMousePos({ x: x + 15, y: y - 10 });
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(-1);
    setHoveredPoint(null);
  };

  // Render custom interactive SVG line chart
  const renderSVGChart = () => {
    if (!chartData || chartData.length === 0) {
      return (
        <div className="h-[280px] flex items-center justify-center text-[var(--text-muted)] text-sm font-medium">
          No historical price data loaded.
        </div>
      );
    }

    const width = 800;
    const height = 300;
    const padding = 40;

    if (!memoizedChartPaths) {
      return (
        <div className="h-[280px] flex items-center justify-center text-[var(--text-muted)] text-sm font-medium">
          No historical price data loaded.
        </div>
      );
    }

    const { minP, maxP, getX, getY, mainPath, sma50Path, bbAreaPath, simulatedMarkers } = memoizedChartPaths;

    return (
      <div style={{ position: 'relative', cursor: 'crosshair' }}>
        <svg 
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`} 
          style={{ width: '100%', height: '100%', overflow: 'visible' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Bollinger Band shaded channel overlay */}
          {bbAreaPath && (
            <path d={bbAreaPath} fill="rgba(139, 92, 246, 0.03)" stroke="rgba(139, 92, 246, 0.08)" strokeWidth="0.5" strokeDasharray="3,3" />
          )}

          {/* Grid lines coordinates system */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = padding + ratio * (height - padding * 2);
            const val = maxP - ratio * (maxP - minP);
            return (
              <g key={idx}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
                <text x={width - padding + 5} y={y + 4} fill="var(--text-muted)" fontSize="8" fontWeight="600" textAnchor="start">
                  {formatCurrency(val)}
                </text>
              </g>
            );
          })}

          {/* SMA line overlay */}
          {sma50Path && (
            <path d={sma50Path} fill="none" stroke="rgba(245, 158, 11, 0.4)" strokeWidth="1.5" />
          )}

          {/* Core Price Path */}
          <path 
            d={mainPath} 
            fill="none" 
            stroke="var(--color-oracle)" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            style={{ filter: 'drop-shadow(0px 0px 8px rgba(139, 92, 246, 0.2))' }} 
          />

          {/* User's holdings cost basis guideline */}
          {(() => {
            const h = holdings.find(h => h.ticker.toUpperCase() === selectedTicker.toUpperCase());
            if (h) {
              const costY = getY(h.avg_buy_price);
              if (costY >= padding && costY <= height - padding) {
                return (
                  <g>
                    <line x1={padding} y1={costY} x2={width - padding} y2={costY} stroke="rgba(16, 185, 129, 0.25)" strokeWidth="1" strokeDasharray="4,4" />
                    <text x={padding + 10} y={costY - 5} fill="var(--color-buy)" fontSize="8" fontWeight="800" letterSpacing="0.05em">
                      YOUR COST BASIS: {formatCurrency(h.avg_buy_price)}
                    </text>
                  </g>
                );
              }
            }
            return null;
          })()}

          {/* Glowing Indicator recommendation circles */}
          {chartOverlays.signals && simulatedMarkers.map((m, idx) => (
            <g key={idx}>
              <circle cx={m.x} cy={m.y} r="4.5" fill={m.type === 'buy' ? 'var(--color-buy)' : 'var(--color-sell)'} style={{ filter: `drop-shadow(0px 0px 5px ${m.type === 'buy' ? 'var(--color-buy)' : 'var(--color-sell)'})` }} />
              <circle cx={m.x} cy={m.y} r="7" fill="none" stroke={m.type === 'buy' ? 'var(--color-buy)' : 'var(--color-sell)'} strokeWidth="1" opacity="0.3" />
            </g>
          ))}

          {/* Current Crosshair active point */}
          {hoverIndex !== -1 && hoveredPoint && (
            <g>
              <line x1={getX(hoverIndex)} y1={padding} x2={getX(hoverIndex)} y2={height - padding} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3,3" />
              <line x1={padding} y1={getY(hoveredPoint.close_price)} x2={width - padding} y2={getY(hoveredPoint.close_price)} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3,3" />
              <circle cx={getX(hoverIndex)} cy={getY(hoveredPoint.close_price)} r="5.5" fill="var(--color-oracle)" style={{ filter: 'drop-shadow(0px 0px 8px var(--color-oracle))' }} />
              <circle cx={getX(hoverIndex)} cy={getY(hoveredPoint.close_price)} r="9" fill="none" stroke="var(--color-oracle)" strokeWidth="1" opacity="0.4" />
            </g>
          )}
        </svg>

        {/* Floating details tooltip panel */}
        {hoverIndex !== -1 && hoveredPoint && (
          <div 
            className="glass-card"
            style={{ 
              position: 'absolute', 
              zIndex: 10, 
              backgroundColor: '#0d1016', 
              border: '1px solid rgba(139, 92, 246, 0.25)', 
              padding: '12px 16px', 
              borderRadius: '12px', 
              fontSize: '10px', 
              width: '160px', 
              pointerEvents: 'none', 
              left: `${mousePos.x}px`, 
              top: `${mousePos.y}px` 
            }}
          >
            <div style={{ fontWeight: '800', color: '#fff', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', marginBottom: '4px' }}>
              <span>Date:</span>
              <span style={{ color: 'var(--text-secondary)' }}>{hoveredPoint.begins_at.slice(0, 10)}</span>
            </div>
            <div style={{ fontWeight: '700', color: '#fff', display: 'flex', justifyContent: 'space-between' }}>
              <span>Price:</span>
              <span style={{ color: '#a78bfa', fontWeight: '900' }}>{formatCurrency(hoveredPoint.close_price)}</span>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
              <span>Open:</span>
              <span>{formatCurrency(hoveredPoint.open_price)}</span>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>High/Low:</span>
              <span>{formatCurrency(hoveredPoint.high_price)} / {formatCurrency(hoveredPoint.low_price)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ONBOARDING SCREEN: If no profiles exist in local SQLite database on boot
  if (profiles.length === 0 && !loading) {
    return (
      <div className="app-container" style={{ display: 'flex', minHeight: '85vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-card animate-fade-in" style={{ padding: '40px', maxWidth: '480px', width: '100%', textAlign: 'center', border: '1px solid var(--border-glow)' }}>
          <div className="brand-icon-box" style={{ width: '60px', height: '60px', borderRadius: '18px', margin: '0 auto 24px', animation: 'pulse-glow 2.5s infinite' }}>
            <Brain className="w-7 h-7 text-white" />
          </div>
          
          <h2 style={{ fontSize: '1.75rem', fontWeight: '950', color: '#fff', marginBottom: '8px' }}>Welcome to Portfolio Sidekick</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '32px' }}>
            Create your local, private profile to begin tracking portfolios, predicting stock movements, and evolving indicator weights. <strong>Connecting a live Robinhood account is 100% optional!</strong> You can use this app purely as an offline tracker and simulator. All data remains strictly secure and isolated on this machine.
          </p>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (newProfileName.trim()) {
              handleCreateProfile(newProfileName.trim(), false);
            }
          }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="input-group" style={{ textAlign: 'left' }}>
              <label className="input-label" style={{ textAlign: 'center', display: 'block', marginBottom: '8px' }}>Enter Profile Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Main Portfolio or Swing Trading"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                className="form-input-text"
                style={{ textAlign: 'center', fontSize: '14px', padding: '12px 16px', borderRadius: '12px' }}
              />
            </div>

            <button type="submit" className="btn-base btn-primary" style={{ padding: '14px', width: '100%', justifyContent: 'center', fontSize: '12px', borderRadius: '12px' }}>
              <Plus className="w-4 h-4" />
              Create Local Profile
            </button>


          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      
      {/* Top Navbar Header */}
      <header className="navbar-header">
        <div className="brand-wrapper">
          <div className="brand-icon-box">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="brand-title">
              Portfolio Sidekick <span className="brand-version-badge">COACH ACTIVE v1.1</span>
            </h1>
            <p className="brand-desc">Local Privacy-Preserved Companion for Robinhood</p>
          </div>
        </div>

        {/* Profile Switcher & Dynamic Actions */}
        <div className="header-controls">
          <div className="profile-selector-box">
            {profiles.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  if (!syncing && !loading) {
                    setActiveProfile(p);
                    setSelectedTicker("NVDA");
                  }
                }}
                disabled={syncing || loading}
                style={{ opacity: (syncing || loading) ? 0.65 : 1, cursor: (syncing || loading) ? 'not-allowed' : 'pointer' }}
                className={`profile-btn ${activeProfile?.id === p.id ? 'profile-btn-active' : ''}`}
              >
                <User className="w-3 h-3" />
                {p.name}
              </button>
            ))}
            <button
              onClick={() => {
                if (!syncing && !loading) {
                  setIsProfileModalOpen(true);
                }
              }}
              disabled={syncing || loading}
              className="profile-btn"
              style={{ 
                color: 'var(--color-buy)', 
                borderLeft: '1px solid var(--border-light)', 
                marginLeft: '4px', 
                paddingLeft: '8px', 
                paddingRight: '8px',
                opacity: (syncing || loading) ? 0.65 : 1,
                cursor: (syncing || loading) ? 'not-allowed' : 'pointer'
              }}
              title="Add New Profile"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeProfile && (
            <button
              onClick={() => handleDeleteProfile(activeProfile.id)}
              className="btn-base btn-secondary"
              style={{ 
                padding: '8px 12px', 
                borderColor: 'rgba(244, 63, 94, 0.15)', 
                color: '#fb7185',
                opacity: (syncing || loading) ? 0.65 : 1,
                cursor: (syncing || loading) ? 'not-allowed' : 'pointer'
              }}
              title="Delete Active Profile"
              disabled={syncing || loading}
            >
              <X className="w-3.5 h-3.5" />
              Delete Profile
            </button>
          )}

          <div style={{ width: 1, height: 24, backgroundColor: 'var(--border-light)', margin: '0 4px' }}></div>

          <button
            onClick={() => {
              if (!syncing && !loading) {
                setIsImportOpen(true);
              }
            }}
            disabled={syncing || loading}
            className="btn-base btn-secondary"
            style={{ 
              opacity: (syncing || loading) ? 0.65 : 1,
              cursor: (syncing || loading) ? 'not-allowed' : 'pointer'
            }}
          >
            <Clipboard className="w-3.5 h-3.5" style={{ color: 'var(--color-oracle)' }} />
            Paste List
          </button>

          {activeProfile && activeProfile.robinhood_username && (
            <button
              onClick={handleLogout}
              className="btn-base btn-secondary"
              style={{ 
                borderColor: 'rgba(244, 63, 94, 0.25)', 
                color: '#fb7185',
                opacity: (syncing || loading) ? 0.65 : 1,
                cursor: (syncing || loading) ? 'not-allowed' : 'pointer'
              }}
              title="Securely Log Out and Wipe Session from Disk"
              disabled={syncing || loading}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Log Out
            </button>
          )}

          <button
            onClick={() => {
              if (activeProfile && activeProfile.robinhood_username) {
                triggerSync();
              } else {
                setIsLoginOpen(true);
              }
            }}
            className="btn-base btn-primary"
            disabled={syncing || loading}
            style={{ 
              opacity: (syncing || loading) ? 0.65 : 1, 
              cursor: (syncing || loading) ? 'not-allowed' : 'pointer' 
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? "Syncing..." : "Sync Account"}
          </button>
        </div>
      </header>

      {/* Premium Tabbed Navigation Panel */}
      <div className="tab-navigation-wrapper">
        <div className="tab-nav-panel">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`tab-nav-btn ${activeTab === "dashboard" ? 'tab-nav-btn-active' : ''}`}
          >
            <LayoutDashboard style={{ width: 14, height: 14 }} />
            Overview
          </button>
          <button
            onClick={() => setActiveTab("coach")}
            className={`tab-nav-btn ${activeTab === "coach" ? 'tab-nav-btn-active' : ''}`}
          >
            <TrendingUp style={{ width: 14, height: 14 }} />
            Interactive Coach Chart
          </button>
          <button
            onClick={() => setActiveTab("oracle")}
            className={`tab-nav-btn ${activeTab === "oracle" ? 'tab-nav-btn-active' : ''}`}
          >
            <Brain style={{ width: 14, height: 14 }} />
            Oracle Predictions
          </button>
          <button
            onClick={() => setActiveTab("strategy")}
            className={`tab-nav-btn ${activeTab === "strategy" ? 'tab-nav-btn-active' : ''}`}
          >
            <Sliders style={{ width: 14, height: 14 }} />
            Tactical Strategy Planner
          </button>
          <button
            onClick={() => setActiveTab("strength")}
            className={`tab-nav-btn ${activeTab === "strength" ? 'tab-nav-btn-active' : ''}`}
          >
            <Target style={{ width: 14, height: 14 }} />
            Strength Analyzer
          </button>
          <button
            onClick={() => setActiveTab("shadow")}
            className={`tab-nav-btn ${activeTab === "shadow" ? 'tab-nav-btn-active' : ''}`}
          >
            <Eye style={{ width: 14, height: 14 }} />
            Watch What I Do
          </button>
        </div>
        {/* Accessibility Controls — Font Sizing & Contrast */}
        <div className="accessibility-controls-bar">
          <button
            onClick={() => adjustFontSize(-1)}
            className="font-size-btn"
            title="Decrease font size"
            disabled={fontSizeOffset <= -3}
          >
            <ZoomOut style={{ width: 13, height: 13 }} />
          </button>
          <span className="font-size-indicator" title="Font size adjustment">{fontSizeOffset > 0 ? `+${fontSizeOffset}` : fontSizeOffset}</span>
          <button
            onClick={() => adjustFontSize(1)}
            className="font-size-btn"
            title="Increase font size"
            disabled={fontSizeOffset >= 5}
          >
            <ZoomIn style={{ width: 13, height: 13 }} />
          </button>
          <button
            onClick={() => setFontSizeOffset(0)}
            className="font-size-btn font-reset-btn"
            title="Reset font size to default"
          >
            Reset
          </button>
        </div>
      </div>

      {/* VIEW PANEL 1: DASHBOARD OVERVIEW */}
      {activeTab === "dashboard" && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {portfolioLoading ? (
            <div className="glass-card animate-fade-in onboarding-hero-card" style={{ padding: '64px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, minHeight: '400px', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '24px', position: 'relative', overflow: 'hidden' }}>
              <div className="loader-glow-ring" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 90, height: 90, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.03)', border: '1px solid rgba(139, 92, 246, 0.1)', boxShadow: '0 0 25px rgba(139, 92, 246, 0.05)' }}>
                <RefreshCw className="animate-spin" style={{ width: 42, height: 42, color: 'var(--color-oracle)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '950', color: '#fff', letterSpacing: '-0.02em' }}>Calibrating Portfolio Analytics...</h3>
                <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)', maxWidth: '480px', lineHeight: '1.6' }}>
                  Retrieving real-time position metrics, running Wilder quantitative RSI models, backtesting indicator ROI, and compiling Shadow Coach behavior patterns...
                </p>
              </div>
              {/* Premium table skeleton placeholders */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: '600px', opacity: 0.35, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ width: '80px', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)' }} className="skeleton-pulse"></div>
                  <div style={{ width: '60px', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)' }} className="skeleton-pulse"></div>
                  <div style={{ width: '60px', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)' }} className="skeleton-pulse"></div>
                </div>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '24px' }}>
                    <div style={{ width: '50px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="skeleton-pulse"></div>
                    <div style={{ width: '70px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="skeleton-pulse"></div>
                    <div style={{ width: '40px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="skeleton-pulse"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : holdings.length === 0 ? (
            <div className="glass-card animate-fade-in onboarding-hero-card" style={{ padding: '48px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, maxWidth: '1280px', margin: '20px auto', border: '1px dashed rgba(167, 139, 250, 0.25)', boxShadow: '0 0 30px rgba(139, 92, 246, 0.05)', borderRadius: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(167, 139, 250, 0.05)', border: '1px solid rgba(167, 139, 250, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(167, 139, 250, 0.1)' }}>
                  <Brain className="animate-pulse" style={{ width: 40, height: 40, color: 'var(--color-oracle)' }} />
                </div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: '950', color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                  Begin Your Local Portfolio Journey
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '550px', lineHeight: '1.6', margin: 0 }}>
                  This profile is currently naked. Connect your portfolio to unlock high-fidelity technical charting, multi-horizon advisor scorers, tactical rebalancing preview tools, and the Shadow Coach AI behavioral analyzer.
                </p>
              </div>

              {/* Grid of pathways */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, width: '100%' }}>
                <div className="viability-target-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', padding: 20, background: 'rgba(16, 185, 129, 0.01)', border: '1px solid rgba(16, 185, 129, 0.08)' }}>
                  <span style={{ fontSize: '9px', color: '#34d399', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pathway 1 — Recommended</span>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '850', color: '#fff' }}>Robinhood Local Sync</h4>
                  <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    🔒 100% private handshake. Your credentials stay encrypted on your device and are never sent to any cloud.
                  </p>
                </div>

                <div className="viability-target-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', padding: 20, background: 'rgba(167, 139, 250, 0.01)', border: '1px solid rgba(167, 139, 250, 0.08)' }}>
                  <span style={{ fontSize: '9px', color: 'var(--color-oracle)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pathway 2 — Swift</span>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '850', color: '#fff' }}>Clipboard Paste Import</h4>
                  <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    Copy holding lists directly from Robinhood's web portal or email. Our regex parsing captures average cost and shares instantly.
                  </p>
                </div>

                <div className="viability-target-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', padding: 20, background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pathway 3 — Risk-Free</span>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '850', color: '#fff' }}>Mock Sandbox Mode</h4>
                  <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    Generate mock positions for popular stocks like AMD, NVIDIA, and Palantir to test the rebalancing calculators immediately.
                  </p>
                </div>
              </div>

              {/* Sync Guidance Informational Callout */}
              <div 
                className="glass-card animate-fade-in" 
                style={{ 
                  width: '100%', 
                  padding: '14px 20px', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(167, 139, 250, 0.15)', 
                  backgroundColor: 'rgba(139, 92, 246, 0.02)',
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 12, 
                  textAlign: 'left'
                }}
              >
                <Info style={{ width: 18, height: 18, color: 'var(--color-oracle)', flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  <strong>💡 Sync Note:</strong> The optional Robinhood link retrieves active stock and ETF positions. Option contracts, cryptocurrencies, or cash-only balances will not populate the holdings grid, but you can always seed mock assets or adjust profile rows manually to track custom lists offline!
                </p>
              </div>

              {/* Call to Action Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', width: '100%', borderTop: '1px solid var(--border-light)', paddingTop: 24 }}>
                <button
                  onClick={() => setIsLoginOpen(true)}
                  className="glowing-sync-cta"
                  style={{ margin: 0, width: 'auto' }}
                >
                  <RefreshCw style={{ width: 14, height: 14 }} />
                  Connect Robinhood Account for Tracking
                </button>

                <button
                  onClick={() => setIsImportOpen(true)}
                  className="font-size-btn"
                  style={{ padding: '12px 20px', borderRadius: '12px' }}
                >
                  <Clipboard style={{ width: 14, height: 14 }} />
                  Paste Clipboard Assets
                </button>

                <button
                  onClick={handleSeedMockAssets}
                  className="font-size-btn"
                  style={{ padding: '12px 20px', borderRadius: '12px' }}
                >
                  <Sparkles style={{ width: 14, height: 14 }} />
                  Seed Sandbox Mock Assets
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Main Account Metrics Summary Row */}
              <section className="metrics-deck">
                <div className="glass-card metric-card" data-tooltip="The combined real-time value of all positions in your portfolio. Updated instantly with live streaming quotes.">
                  <span className="metric-label">Account Net Equity</span>
                  <div>
                    <h2 className="metric-value">
                      ${summary.total_equity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </h2>
                    <div className="live-indicator-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="pulse-live"></div>
                        <span className="live-text">Live Streaming Prices</span>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.12)' }}>•</span>
                      {isSyncStale() ? (
                        <div 
                          style={{ display: 'flex', alignItems: 'center', gap: 5 }} 
                          data-tooltip="Portfolio data is older than 5 minutes. Sync with Robinhood in the header to fetch the absolute latest stats!"
                        >
                          <div className="pulse-stale-dot animate-pulse" style={{ width: 6, height: 6, backgroundColor: '#fbbf24', borderRadius: '50%', boxShadow: '0 0 8px #fbbf24' }}></div>
                          <span style={{ fontSize: '9px', color: '#fbbf24', fontWeight: '800', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                            Sync Stale ({formatLastSync()})
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 6, height: 6, backgroundColor: '#34d399', borderRadius: '50%', opacity: 0.8 }}></div>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '600' }}>
                            Synced {formatLastSync()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="metric-subtext">Localized data protection active</span>
                </div>

                <div className="glass-card metric-card" data-tooltip="The actual total cash value originally spent to purchase your current assets (average cost multiplied by share volume).">
                  <span className="metric-label">Capital Deployed</span>
                  <div>
                    <h2 className="metric-value" style={{ color: 'var(--text-secondary)' }}>
                      ${summary.total_cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </h2>
                  </div>
                  <span className="metric-subtext">Total original cost basis</span>
                </div>

                <div className="glass-card metric-card" data-tooltip="Your overall cumulative return. Green implies your assets have appreciated above cost, red indicates a net unrealized decline.">
                  <span className="metric-label">Account P&L Return</span>
                  <div>
                    <h2 className={`metric-value ${summary.overall_pnl >= 0 ? 'metric-pnl-pos' : 'metric-pnl-neg'}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {summary.overall_pnl >= 0 ? <TrendingUp style={{ width: 24, height: 24 }} /> : <TrendingDown style={{ width: 24, height: 24 }} />}
                      {summary.overall_pnl >= 0 ? '+' : ''}${summary.overall_pnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </h2>
                    <span className={`metric-subtext ${summary.overall_pnl >= 0 ? 'text-highlight-green' : 'metric-pnl-neg'}`} style={{ fontWeight: '800', textTransform: 'none' }}>
                      {summary.overall_pnl >= 0 ? '+' : ''}{summary.overall_pnl_pct.toFixed(2)}% Compounded Yield
                    </span>
                  </div>
                  <span className="metric-subtext">Calculated portfolio returns</span>
                </div>
              </section>

              {/* Main Portfolio Grid: Left Holdings, Right Selected Quick Snapshot */}
              <div className="dashboard-grid">
                {/* Holdings list */}
                <div className="glass-card holdings-container">
                  <div className="holdings-header">
                    <div>
                      <h3 className="holdings-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <LayoutDashboard className="w-4 h-4 text-violet-400" />
                        Current Portfolio Holdings
                      </h3>
                      <p className="holdings-subtitle">Active assets loaded from Robinhood or Manual SQLite. Click a ticker row to analyze.</p>
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table className="asset-table">
                      <thead>
                        <tr>
                          <th style={{ width: '12%', textAlign: 'left' }}>Ticker</th>
                          <th style={{ width: '14%', textAlign: 'right' }}>Shares</th>
                          <th style={{ width: '14%', textAlign: 'right' }}>Avg Cost</th>
                          <th style={{ width: '14%', textAlign: 'right' }}>Current Price</th>
                          <th style={{ width: '16%', textAlign: 'right' }}>Equity Value</th>
                          <th style={{ width: '15%', textAlign: 'center' }}>Return (PnL)</th>
                          <th style={{ width: '15%', textAlign: 'center' }}>Advisor Verdict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdings.map(h => (
                          <tr 
                            key={h.id}
                            onClick={() => setSelectedTicker(h.ticker)}
                            className={`${selectedTicker.toUpperCase() === h.ticker.toUpperCase() ? 'tr-selected' : ''} row-${(h.advisor_action || 'HOLD').toLowerCase()}`}
                            style={{ cursor: 'pointer' }}
                          >
                            <td className="ticker-td" style={{ color: 'var(--color-oracle)', fontWeight: '950' }}>{h.ticker}</td>
                            <td className="numeric-td">{h.shares.toLocaleString()}</td>
                            <td className="numeric-td">{formatCurrency(h.avg_buy_price)}</td>
                            <td className="numeric-td" style={{ color: '#fff', fontWeight: '800' }}>{formatCurrency(h.current_price)}</td>
                            <td className="numeric-td" style={{ color: '#a78bfa', fontWeight: '800' }}>{formatCurrency(h.total_value)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`badge ${h.pnl >= 0 ? 'badge-buy' : 'badge-sell'}`} style={{ padding: '2px 8px', fontSize: '9px', fontWeight: '900' }}>
                                {h.pnl >= 0 ? '▲ +' : '▼ '}{h.pnl_pct.toFixed(1)}%
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`badge ${h.advisor_action === 'BUY' ? 'badge-buy' : h.advisor_action === 'SELL' ? 'badge-sell' : 'badge-hold'}`} style={{ padding: '4px 10px', fontSize: '9px', fontWeight: '900' }}>
                                {h.advisor_action === 'BUY' ? '▲ BUY' : h.advisor_action === 'SELL' ? '▼ SELL' : '◆ HOLD'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Selected Stock Insight */}
                <div className="glass-card selected-stock-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: '#fff' }}>{selectedTicker} Market Insight</h3>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Real-time advisor analysis</span>
                    </div>
                    {advisorData && (
                      <div className={`badge ${advisorData.action === 'BUY' ? 'badge-buy' : advisorData.action === 'SELL' ? 'badge-sell' : 'badge-hold'}`} style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '900' }}>
                        {advisorData.action === 'BUY' ? '▲ BUY' : advisorData.action === 'SELL' ? '▼ SELL' : '◆ HOLD'}
                      </div>
                    )}
                  </div>

                  {advisorData ? (
                    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                      
                      {/* Radial Gauge Visual */}
                      <div className="radial-container" style={{ margin: '0 auto', position: 'relative', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg height="130" width="130" style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}>
                          {/* Track Circle */}
                          <circle
                            stroke="rgba(255, 255, 255, 0.02)"
                            fill="transparent"
                            strokeWidth="9"
                            r="50"
                            cx="65"
                            cy="65"
                          />
                          {/* Glowing Background Glow Circle */}
                          <circle
                            stroke={advisorData.action === 'BUY' ? 'rgba(16, 185, 129, 0.15)' : advisorData.action === 'SELL' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(251, 191, 36, 0.15)'}
                            fill="transparent"
                            strokeWidth="9"
                            r="50"
                            cx="65"
                            cy="65"
                            strokeDasharray={`${2 * Math.PI * 50}`}
                            strokeDashoffset={`${2 * Math.PI * 50 * (1 - advisorData.score / 100)}`}
                            strokeLinecap="round"
                            style={{ filter: 'blur(5px)', transition: 'stroke-dashoffset 0.8s ease' }}
                          />
                          {/* Main Colored Progress Circle */}
                          <circle
                            stroke={advisorData.action === 'BUY' ? 'var(--color-buy)' : advisorData.action === 'SELL' ? 'var(--color-sell)' : 'var(--color-hold)'}
                            fill="transparent"
                            strokeWidth="9"
                            r="50"
                            cx="65"
                            cy="65"
                            strokeDasharray={`${2 * Math.PI * 50}`}
                            strokeDashoffset={`${2 * Math.PI * 50 * (1 - advisorData.score / 100)}`}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                          />
                        </svg>
                        <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', inset: 0 }}>
                          <span style={{ fontSize: '24px', fontWeight: '950', color: '#fff', textShadow: advisorData.action === 'BUY' ? '0 0 15px rgba(16,185,129,0.45)' : advisorData.action === 'SELL' ? '0 0 15px rgba(244,63,94,0.45)' : '0 0 15px rgba(251,191,36,0.45)' }}>
                            {advisorData.score}%
                          </span>
                          <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '900', marginTop: '-3px' }}>
                            Confidence
                          </span>
                        </div>
                      </div>

                      {/* Technical DNA stats deck (Grid or beautifully spaced rows) */}
                      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="glass-card" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '8.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800' }}>Strength</span>
                          <span style={{ fontSize: '13px', fontWeight: '900', color: advisorData.score >= 65 ? 'var(--color-buy)' : advisorData.score >= 35 ? 'var(--color-hold)' : 'var(--color-sell)' }}>
                            {advisorData.score >= 70 ? 'Strong' : advisorData.score >= 45 ? 'Moderate' : 'Soft'}
                          </span>
                        </div>
                        <div className="glass-card" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '8.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800' }}>Verdict</span>
                          <span style={{ fontSize: '13px', fontWeight: '900', color: advisorData.action === 'BUY' ? 'var(--color-buy)' : advisorData.action === 'SELL' ? 'var(--color-sell)' : 'var(--color-hold)' }}>
                            {advisorData.action}
                          </span>
                        </div>
                      </div>

                      {isCoachMode && (
                        <div className="coach-tip-bubble" style={{ width: '100%', margin: '0' }}>
                          <strong>🎓 Coach Tip:</strong> The Scoring Engine weights indicators dynamically. 
                          For <strong>{selectedTicker}</strong>, local parameters suggest a clear <strong>{advisorData.action}</strong> strategy based on compounding trade backtests.
                        </div>
                      )}

                      <button
                        onClick={() => setActiveTab("coach")}
                        className="btn-dial-chart"
                        style={{ width: '100%', margin: '0' }}
                      >
                        Open Interactive Chart
                        <MousePointerClick style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  ) : (
                    <div className="glass-card" style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                      Select a ticker row to analyze.
                    </div>
                  )}

                  {/* SQLite DB manual adjustments Collapsible drawer */}
                  <div className="glass-card manual-adjustments-card">
                    <button
                      onClick={() => setShowManualAdjust(!showManualAdjust)}
                      className="collapsible-trigger-btn"
                    >
                      <span>
                        <Sliders style={{ width: 12, height: 12 }} />
                        Adjust Portfolio Row
                      </span>
                      {showManualAdjust ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                    </button>

                    {showManualAdjust && (
                      <form onSubmit={handleAdjustHolding} className="manual-form-grid">
                        <div className="input-group">
                          <label className="input-label">Asset Shares Qty</label>
                          <input
                            type="number"
                            step="any"
                            required
                            placeholder="e.g. 41.35"
                            value={holdingForm.shares}
                            onChange={(e) => setHoldingForm(prev => ({ ...prev, shares: e.target.value }))}
                            className="form-input-text"
                          />
                        </div>
                        <div className="input-group">
                          <label className="input-label">Average Buy Cost Basis ($)</label>
                          <input
                            type="number"
                            step="any"
                            required
                            placeholder="e.g. 212.49"
                            value={holdingForm.avg_buy_price}
                            onChange={(e) => setHoldingForm(prev => ({ ...prev, avg_buy_price: e.target.value }))}
                            className="form-input-text"
                          />
                        </div>
                        <button
                          type="submit"
                          className="btn-form-submit"
                        >
                          Update SQLite Database
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Watchlist & Buy Strategies Monitor Section */}
              <div className="glass-card holdings-container" style={{ marginTop: '0px' }}>
                <div className="holdings-header">
                  <div>
                    <h3 className="holdings-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TrendingUp className="w-4 h-4 text-violet-400" />
                      Watchlist & Buy Strategies Monitor
                    </h3>
                    <p className="holdings-subtitle">Track potential entries. Click a watched stock to instantly plot its historical technical patterns.</p>
                  </div>
                  
                  {/* Watchlist Quick-Add Form */}
                  <form onSubmit={handleAddToWatchlist} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      required
                      placeholder="Ticker (e.g. BTC)"
                      value={watchlistForm.ticker}
                      onChange={(e) => setWatchlistForm(prev => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
                      className="form-input-text"
                      style={{ width: '130px', padding: '6px 12px', fontSize: '11px', textTransform: 'uppercase' }}
                    />
                    <input
                      type="text"
                      placeholder="Optional Notes"
                      value={watchlistForm.notes || ''}
                      onChange={(e) => setWatchlistForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="form-input-text"
                      style={{ width: '180px', padding: '6px 12px', fontSize: '11px' }}
                    />
                    <button type="submit" className="btn-base btn-primary" style={{ padding: '6px 12px', fontSize: '11px' }}>
                      <Plus className="w-3.5 h-3.5" />
                      Add Stock
                    </button>
                  </form>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="asset-table">
                    <thead>
                      <tr>
                        <th>Ticker</th>
                        <th>Date Added</th>
                        <th style={{ textAlign: 'right' }}>Live Price</th>
                        <th style={{ textAlign: 'center' }}>Advisor Action</th>
                        <th style={{ textAlign: 'center' }}>Confidence</th>
                        <th>Buy Strategies & Timing Indicators</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {watchlist.map(w => (
                        <tr 
                          key={w.id}
                          onClick={() => setSelectedTicker(w.ticker)}
                          className={selectedTicker.toUpperCase() === w.ticker.toUpperCase() ? 'tr-selected' : ''}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="ticker-td" style={{ color: 'var(--color-oracle)' }}>{w.ticker}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{w.added_at}</td>
                          <td className="numeric-td" style={{ color: '#fff', fontWeight: '800' }}>
                            {w.current_price > 0 ? `$${w.current_price.toFixed(2)}` : 'Loading...'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`badge ${w.recommendation === 'BUY' ? 'badge-buy' : w.recommendation === 'SELL' ? 'badge-sell' : 'badge-hold'}`} style={{ padding: '4px 10px', fontSize: '9px', fontWeight: '900' }}>
                              {w.recommendation === 'BUY' ? '▲ BUY' : w.recommendation === 'SELL' ? '▼ SELL' : '◆ HOLD'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', color: '#fff', fontSize: '11px', fontWeight: '800' }}>
                            {w.score}%
                          </td>
                          <td style={{ fontSize: '11px', fontWeight: '700', color: w.timing?.includes('Oversold') || w.timing?.includes('Bounce') || w.timing?.includes('Momentum') ? 'var(--color-buy)' : 'var(--text-secondary)' }}>
                            {w.timing} {w.notes ? <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontStyle: 'italic', marginLeft: '6px' }}>— {w.notes}</span> : ''}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFromWatchlist(w.ticker);
                              }}
                              className="btn-base btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '9px', borderColor: 'rgba(244,63,94,0.1)', color: '#fb7185' }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {watchlist.length === 0 && (
                        <tr key="empty-watchlist">
                          <td colSpan="7" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>
                            Your watchlist is currently empty. Enter a stock ticker and optional notes above to monitor for entry timings.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* VIEW PANEL 2: INTERACTIVE CHART & COACH SECTION */}
      {activeTab === "coach" && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div className="glass-card chart-card-container">
            <div className="chart-header-row">
              <div>
                <div className="chart-title-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => handleCycleTicker(-1)}
                      className="font-size-btn"
                      style={{ padding: '6px 10px', borderRadius: '8px', minWidth: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Previous Asset (Back)"
                    >
                      <ChevronLeft style={{ width: 14, height: 14 }} />
                    </button>
                    
                    <select
                      value={selectedTicker.toUpperCase()}
                      onChange={(e) => setSelectedTicker(e.target.value)}
                      className="sector-dropdown"
                      style={{ padding: '5px 24px 5px 12px', minWidth: '100px', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: '900', fontSize: '12px', height: '30px' }}
                    >
                      {allAvailableTickers.map(ticker => (
                        <option key={ticker} value={ticker}>{ticker}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => handleCycleTicker(1)}
                      className="font-size-btn"
                      style={{ padding: '6px 10px', borderRadius: '8px', minWidth: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Next Asset (Next)"
                    >
                      <ChevronRight style={{ width: 14, height: 14 }} />
                    </button>
                  </div>

                  <h3 className="chart-main-title" style={{ margin: 0 }}>{selectedTicker} Market Analysis</h3>
                  <span className="chart-timeframe-tag">1-Year History</span>
                </div>
                <p className="chart-sub-guide">Move your cursor across the chart path for precise hover pricing statistics. Cycle assets using next/back arrows or dropdown.</p>
              </div>

              {/* Technical Indicator overlays toggles */}
              <div className="overlays-toggles-bar">
                <button
                  onClick={() => setIsCoachMode(!isCoachMode)}
                  className={`overlay-toggle-btn ${isCoachMode ? 'overlay-toggle-btn-coach-active' : ''}`}
                >
                  <Sparkles style={{ width: 12, height: 12 }} />
                  {isCoachMode ? "Coach On" : "Coach Off"}
                </button>
                <div style={{ height: 14, width: 1, backgroundColor: 'rgba(255,255,255,0.08)', margin: '0 4px' }}></div>
                <button
                  onClick={() => setChartOverlays(prev => ({ ...prev, sma50: !prev.sma50 }))}
                  className={`overlay-toggle-btn ${chartOverlays.sma50 ? 'overlay-toggle-btn-active-sma' : ''}`}
                >
                  SMA 50
                </button>
                <button
                  onClick={() => setChartOverlays(prev => ({ ...prev, bollinger: !prev.bollinger }))}
                  className={`overlay-toggle-btn ${chartOverlays.bollinger ? 'overlay-toggle-btn-active-bb' : ''}`}
                >
                  Bollinger
                </button>
                <button
                  onClick={() => setChartOverlays(prev => ({ ...prev, signals: !prev.signals }))}
                  className={`overlay-toggle-btn ${chartOverlays.signals ? 'overlay-toggle-btn-active-sig' : ''}`}
                >
                  Signals
                </button>
              </div>
            </div>

            {/* Interactive SVG Chart block */}
            <div className="svg-canvas-box">
              {renderSVGChart()}
              <div className="chart-ticks-legend">
                <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f59e0b' }}></span> SMA 50 Average</span>
                <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-buy)' }}></span> Buy Trigger</span>
                <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-sell)' }}></span> Sell Trigger</span>
              </div>
            </div>
          </div>

          {/* Expanded Visual Coach Academy Breakdown */}
          {advisorData ? (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="academy-section-header">
                <Sparkles style={{ width: 18, height: 18, color: '#34d399' }} />
                <h3 className="academy-title">Visual Coach Academy : Quantitative Signals</h3>
              </div>

              <div className="coach-grid">
                {/* RSI Indicator Card */}
                <div className="glass-card academy-card">
                  <div className="academy-card-top">
                    <span className="academy-card-label" style={{ color: '#38bdf8' }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#38bdf8' }}></span>
                      Relative Strength Index (Wilder RSI)
                    </span>
                    <span className={`academy-card-score ${
                      advisorData.scores.rsi_score >= 60 ? 'score-buy-badge' : 
                      advisorData.scores.rsi_score <= 40 ? 'score-sell-badge' : 'score-hold-badge'
                    }`}>
                      Score: {advisorData.scores.rsi_score.toFixed(0)}/100
                    </span>
                  </div>
                  
                  <div className="academy-card-middle">
                    <span className="academy-card-val">{advisorData.metrics.rsi}</span>
                    <span className="academy-card-unit">Value</span>
                    <span className="academy-card-weight">Factor weight: {(advisorData.weights.rsi_weight * 100).toFixed(0)}%</span>
                  </div>

                  {isCoachMode && (
                    <div className="academy-card-coach-explanation">
                      <strong>🎓 Coach Explanation:</strong> {advisorData.metrics.rsi < 35 
                        ? `The RSI is low at ${advisorData.metrics.rsi}. This indicates that panic sellers have oversold ${selectedTicker}. Like a compressed metal coil, it is highly primed to bounce back up (Oversold -> BUY opportunity!).`
                        : advisorData.metrics.rsi > 65 
                        ? `The RSI is high at ${advisorData.metrics.rsi}. Buying sentiment is extremely excited. Like a runner gasping for breath, the stock is tired and likely to experience a healthy pullback soon (Overbought -> SELL risk).`
                        : `The RSI is at a balanced ${advisorData.metrics.rsi}. Market sentiment is stable and matching fair valuation boundaries (HOLD).`}
                    </div>
                  )}
                </div>

                {/* MACD Momentum Card */}
                <div className="glass-card academy-card">
                  <div className="academy-card-top">
                    <span className="academy-card-label" style={{ color: '#c084fc' }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#c084fc' }}></span>
                      MACD Momentum Speed Index
                    </span>
                    <span className={`academy-card-score ${
                      advisorData.scores.macd_score >= 60 ? 'score-buy-badge' : 
                      advisorData.scores.macd_score <= 40 ? 'score-sell-badge' : 'score-hold-badge'
                    }`}>
                      Score: {advisorData.scores.macd_score.toFixed(0)}/100
                    </span>
                  </div>
                  
                  <div className="academy-card-middle">
                    <span className="academy-card-val">{advisorData.metrics.macd}</span>
                    <span className="academy-card-unit">Histogram</span>
                    <span className="academy-card-weight">Factor weight: {(advisorData.weights.macd_weight * 100).toFixed(0)}%</span>
                  </div>

                  {isCoachMode && (
                    <div className="academy-card-coach-explanation">
                      <strong>🎓 Coach Explanation:</strong> {advisorData.metrics.macd > 0 
                        ? `MACD is positive (${advisorData.metrics.macd}), showing short-term price momentum is turning faster than the long-term trend. Think of it like pressing the gas pedal on your car!`
                        : `MACD is cooling off (${advisorData.metrics.macd}). Momentum is starting to lose speed up a hill as gravity pulls it down.`}
                    </div>
                  )}
                </div>

                {/* SMA Trend Card */}
                <div className="glass-card academy-card">
                  <div className="academy-card-top">
                    <span className="academy-card-label" style={{ color: '#fbbf24' }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#fbbf24' }}></span>
                      Moving Average Support Lines
                    </span>
                    <span className={`academy-card-score ${
                      advisorData.scores.trend_score >= 60 ? 'score-buy-badge' : 
                      advisorData.scores.trend_score <= 40 ? 'score-sell-badge' : 'score-hold-badge'
                    }`}>
                      Score: {advisorData.scores.trend_score.toFixed(0)}/100
                    </span>
                  </div>
                  
                  <div className="academy-card-middle">
                    <span className="academy-card-val" style={{ fontSize: '1.25rem' }}>
                      {advisorData.scores.trend_score >= 60 ? 'Trading Above SMA' : 'Trading Below SMA'}
                    </span>
                    <span className="academy-card-weight">Factor weight: {(advisorData.weights.trend_weight * 100).toFixed(0)}%</span>
                  </div>

                  {isCoachMode && (
                    <div className="academy-card-coach-explanation">
                      <strong>🎓 Coach Explanation:</strong> {advisorData.scores.trend_score >= 60 
                        ? `The stock is currently trading above its 50-day average line. This is a support level—the market has the wind at its back, signaling positive structural health!`
                        : `The price has dipped below the 50-day average line. Gravity is pulling the trend down. Exercise caution as sellers hold technical control.`}
                    </div>
                  )}
                </div>

                {/* Gut Guess Card */}
                <div className="glass-card academy-card">
                  <div className="academy-card-top">
                    <span className="academy-card-label" style={{ color: '#f472b6' }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f472b6' }}></span>
                      Intuitive User Gut Prediction Factor
                    </span>
                    <span className={`academy-card-score ${
                      advisorData.scores.gut_score >= 60 ? 'score-buy-badge' : 
                      advisorData.scores.gut_score <= 40 ? 'score-sell-badge' : 'score-hold-badge'
                    }`}>
                      Score: {advisorData.scores.gut_score.toFixed(0)}/100
                    </span>
                  </div>
                  
                  <div className="academy-card-middle">
                    <span className="academy-card-val" style={{ fontSize: '1.25rem' }}>
                      Self-Evolution Calibrated
                    </span>
                    <span className="academy-card-weight">Factor weight: {(advisorData.weights.gut_weight * 100).toFixed(0)}%</span>
                  </div>

                  {isCoachMode && (
                    <div className="academy-card-coach-explanation">
                      <strong>🎓 Coach Explanation:</strong> The Oracle tracks your price predictions in SQLite. As your gut guesses prove accurate, the system **automatically expands your Gut Weight** dynamically, cementing your personal trading intuition into the advisor algorithm!
                    </div>
                  )}
                </div>
              </div>

              {/* Multi-Timeframe Epoch Backtest Scorecard */}
              {evolutionMetrics && (
                <div className="glass-card animate-fade-in" style={{ padding: '20px', border: '1px solid rgba(139, 92, 246, 0.25)', backgroundColor: 'rgba(139, 92, 246, 0.02)', display: 'flex', flexDirection: 'column', gap: 14, marginTop: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles style={{ width: 16, height: 16, color: 'var(--color-oracle)' }} />
                    <strong style={{ fontSize: '11px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Multi-Timeframe Stress-Test Scorecard
                    </strong>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Epoch 1: Immediate Swing (30d)</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: '6px', fontSize: '9.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Wilder RSI Yield:</span>
                          <strong style={{ color: evolutionMetrics.immediate.rsi >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {evolutionMetrics.immediate.rsi >= 0 ? '+' : ''}{evolutionMetrics.immediate.rsi}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>MACD Momentum:</span>
                          <strong style={{ color: evolutionMetrics.immediate.macd >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {evolutionMetrics.immediate.macd >= 0 ? '+' : ''}{evolutionMetrics.immediate.macd}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Trend SMA support:</span>
                          <strong style={{ color: evolutionMetrics.immediate.trend >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {evolutionMetrics.immediate.trend >= 0 ? '+' : ''}{evolutionMetrics.immediate.trend}%
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Epoch 2: Macro Trend (180d)</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: '6px', fontSize: '9.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Wilder RSI Yield:</span>
                          <strong style={{ color: evolutionMetrics.macro.rsi >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {evolutionMetrics.macro.rsi >= 0 ? '+' : ''}{evolutionMetrics.macro.rsi}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>MACD Momentum:</span>
                          <strong style={{ color: evolutionMetrics.macro.macd >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {evolutionMetrics.macro.macd >= 0 ? '+' : ''}{evolutionMetrics.macro.macd}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Trend SMA support:</span>
                          <strong style={{ color: evolutionMetrics.macro.trend >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {evolutionMetrics.macro.trend >= 0 ? '+' : ''}{evolutionMetrics.macro.trend}%
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(244,63,94,0.02)', border: '1px solid rgba(244,63,94,0.08)' }}>
                      <span style={{ fontSize: '8px', color: '#fb7185', display: 'block', textTransform: 'uppercase', fontWeight: '800' }}>Epoch 3: Volatility Stress (Drawdown)</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: '6px', fontSize: '9.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Wilder RSI Yield:</span>
                          <strong style={{ color: evolutionMetrics.stress.rsi >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {evolutionMetrics.stress.rsi >= 0 ? '+' : ''}{evolutionMetrics.stress.rsi}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>MACD Momentum:</span>
                          <strong style={{ color: evolutionMetrics.stress.macd >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {evolutionMetrics.stress.macd >= 0 ? '+' : ''}{evolutionMetrics.stress.macd}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Trend SMA support:</span>
                          <strong style={{ color: evolutionMetrics.stress.trend >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {evolutionMetrics.stress.trend >= 0 ? '+' : ''}{evolutionMetrics.stress.trend}%
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Force evolve action */}
              <div className="evolution-footer-bar">
                <div className="evolution-footer-text-box">
                  <Info style={{ width: 16, height: 16 }} />
                  <span>Advisor weights auto-calibrate based on trade backtests</span>
                </div>
                <button
                  onClick={handleForceEvolve}
                  disabled={loading}
                  className="btn-evolve"
                >
                  <Sparkles style={{ width: 14, height: 14 }} />
                  Force Evolve Weights
                </button>
              </div>
            </section>
          ) : (
            <div className="glass-card" style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <TrendingUp style={{ width: 20, height: 20 }} />
              </div>
              <p style={{ fontSize: '12px' }}>Coach data pending stock selection.</p>
            </div>
          )}
        </div>
      )}

      {/* VIEW PANEL 4: TACTICAL STRATEGY & SHIFT PLANNER */}
      {activeTab === "strategy" && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* Market Regime Status Bar */}
          {(() => {
            const regime = strategyBrackets?.regime_status || "BULLISH";
            const vix = strategyBrackets?.vix_value || 15.0;
            const spyAbove = strategyBrackets?.spy_above_200 !== false;
            const qqqAbove = strategyBrackets?.qqq_above_200 !== false;
            
            const isBearish = regime === "BEARISH";
            
            return (
              <div 
                className="glass-card animate-fade-in" 
                style={{ 
                  padding: '16px 24px', 
                  border: isBearish ? '1px solid rgba(244, 63, 94, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)', 
                  boxShadow: isBearish ? '0 0 15px rgba(244, 63, 94, 0.05)' : '0 0 15px rgba(16, 185, 129, 0.05)',
                  backgroundColor: isBearish ? 'rgba(244, 63, 94, 0.02)' : 'rgba(16, 185, 129, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 16
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: isBearish ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Activity className={isBearish ? 'text-red-400' : 'text-green-400'} style={{ width: 16, height: 16, color: isBearish ? '#fb7185' : '#34d399' }} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '950', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isBearish ? '🚨 BEARISH / HIGH-VOLATILITY REGIME ACTIVE' : '🟢 BULLISH / STABLE REGIME ACTIVE'}
                      <span 
                        style={{ 
                          fontSize: '8px', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          backgroundColor: isBearish ? 'rgba(244,63,94,0.2)' : 'rgba(16,185,129,0.2)', 
                          color: isBearish ? '#fb7185' : '#34d399', 
                          fontWeight: '800' 
                        }}
                      >
                        {isBearish ? 'VIX GUARD ENGAGED' : 'NORMAL MARKET CONDITIONS'}
                      </span>
                    </h4>
                    <p style={{ margin: '4px 0 0', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
                      {isBearish 
                        ? 'Algorithmic weights dynamically shifted to mean-reversion. Buy scoring hurdle raised to 78%, and stop-loss boundaries clamped.' 
                        : 'Standard scoring weights active. Moving averages and momentum signals prioritized for maximum profit expansion.'}
                    </p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '10px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '8px', textTransform: 'uppercase' }}>CBOE VIX Price</span>
                    <strong style={{ color: isBearish ? '#fb7185' : '#34d399', fontSize: '13px' }}>{vix.toFixed(2)}</strong>
                  </div>
                  <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border-light)' }}></div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '8px', textTransform: 'uppercase' }}>SPY / QQQ SMAs</span>
                    <strong style={{ color: '#fff', fontSize: '11px' }}>
                      {spyAbove ? 'SPY Above' : 'SPY Below'} 200d | {qqqAbove ? 'QQQ Above' : 'QQQ Below'} 200d
                    </strong>
                  </div>
                </div>
              </div>
            );
          })()}
          {/* Header Description */}
          {holdings.length === 0 ? (
            <div className="tab-empty-placeholder-card animate-fade-in" style={{ marginTop: 0 }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sliders className="animate-pulse" style={{ width: 28, height: 28, color: 'var(--color-oracle)' }} />
              </div>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '950', color: '#fff', letterSpacing: '-0.01em' }}>
                  No Holdings In This Profile
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '480px', lineHeight: '1.6' }}>
                  To unlock the **Tactical Rebalancing Simulator**, Scale-Out profit take brackets, and Scale-In Dollar-Cost-Averaging trackers, you must have active holdings in your portfolio.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', borderTop: '1px solid var(--border-light)', paddingTop: 20, width: '100%' }}>
                <button
                  onClick={() => setIsLoginOpen(true)}
                  className="glowing-sync-cta"
                  style={{ margin: 0, width: 'auto' }}
                >
                  <RefreshCw style={{ width: 14, height: 14 }} />
                  Connect Robinhood Account
                </button>
                <button
                  onClick={handleSeedMockAssets}
                  className="font-size-btn"
                  style={{ padding: '12px 20px', borderRadius: '12px' }}
                >
                  <Sparkles style={{ width: 14, height: 14 }} />
                  Seed Sandbox Assets
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 1. Overall Portfolio Health Score Deck */}
          {(() => {
            const totalVal = holdings.reduce((sum, h) => sum + h.total_value, 0);
            const weightedScore = totalVal > 0 ? (holdings.reduce((sum, h) => sum + (h.advisor_score || 50) * h.total_value, 0) / totalVal) : 50;
            
            let healthClass = "text-highlight-green animate-pulse";
            let healthLabel = "Excellent Structural Health";
            let healthDesc = "Your allocated capital is securely anchored in technical support zones and high-conviction buy horizons. Risk exposure is minimal!";
            if (weightedScore < 45) {
              healthClass = "metric-pnl-neg";
              healthLabel = "Vulnerable Downside Risk";
              healthDesc = "Your portfolio has significant capital allocated to assets in technical downtrends or overbought sell zones. Consider shifting funds immediately to avoid capital erosion.";
            } else if (weightedScore < 65) {
              healthClass = "text-highlight-purple";
              healthLabel = "Balanced Exposure Present";
              healthDesc = "Moderate structural allocation health. Strategic rebalancing opportunities are available to exit low-scoring holdings and capture oversold entries.";
            }

            return (
              <div className="glass-card" data-tooltip="A weighted rating (0-100%) tracking the structural alignment of your holdings. A higher rating indicates your assets reside in strong uptrends or oversold entry zones." style={{ padding: '24px 32px', border: '1px solid var(--border-glow)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
                <div style={{ flex: '1 1 500px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portfolio Health Index</span>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: '950', color: '#fff', margin: '4px 0 8px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sliders className="w-6 h-6 text-violet-400" />
                    Overall Advisor Portfolio Rating
                  </h3>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                    {healthDesc}
                  </p>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', minWidth: '240px' }}>
                  <div style={{ width: '70px', height: '70px', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justify: 'center', position: 'relative', background: 'rgba(139, 92, 246, 0.05)', boxShadow: '0 0 15px rgba(139, 92, 246, 0.1)' }}>
                    <strong style={{ fontSize: '1.25rem', fontWeight: '950', color: '#fff' }}>{weightedScore.toFixed(0)}%</strong>
                  </div>
                  <div>
                    <span className={healthClass} style={{ display: 'block', fontSize: '12px', fontWeight: '900', letterSpacing: '0.05em' }}>{healthLabel.toUpperCase()}</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Weighted average of all local holdings scores</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 2. Tactical Opportunity Board Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            
            {/* Exit/Reduce Card Deck */}
            <div className="glass-card holdings-container" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <ShieldAlert className="w-5 h-5" style={{ color: '#fb7185' }} />
                <h4 style={{ fontSize: '1.05rem', fontWeight: '900', color: '#fff', margin: 0 }}>🚨 EXIT / REDUCE ZONE (Shift-Out Candidates)</h4>
              </div>
              <p className="holdings-subtitle" style={{ marginBottom: 20 }}>
                Identify low-performing holdings. Click "Back Out" to auto-load into the rebalancing calculator.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {holdings.filter(h => h.advisor_action === 'SELL' || h.pnl_pct < -5).map(h => (
                  <div key={h.id} className="active-guess-tile" style={{ borderLeft: '3px solid #fb7185', padding: '14px', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '14px', color: '#fff' }}>{h.ticker}</strong>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                          Value: {formatCurrency(h.total_value)} ({((h.total_value / summary.total_equity)*100).toFixed(0)}% alloc)
                        </span>
                      </div>
                      <span className="badge badge-sell" style={{ fontSize: '9px', padding: '4px 8px', fontWeight: '900' }}>
                        ▼ SELL (Score: {h.advisor_score}%)
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <span style={{ fontSize: '10px', color: '#fb7185', fontWeight: '700' }}>
                        Unrealized: {h.pnl >= 0 ? '▲ +' : '▼ '}{h.pnl_pct.toFixed(1)}% P&L ({formatCurrency(h.pnl)})
                      </span>
                      <button
                        onClick={() => {
                          setShifterForm(prev => ({ ...prev, sellTicker: h.ticker }));
                          alert(`Loaded ${h.ticker} as Sell Target! Choose a stock to buy below to complete simulation.`);
                        }}
                        className="btn-base btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '9px', fontWeight: '800', borderColor: 'rgba(244,63,94,0.2)', color: '#fb7185', borderRadius: '8px' }}
                      >
                        🚨 Back Out
                      </button>
                    </div>
                  </div>
                ))}
                {holdings.filter(h => h.advisor_action === 'SELL' || h.pnl_pct < -5).length === 0 && (
                  <div key="fallback-exit-opportunities" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', border: '1px dashed rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                    No immediate high-risk holdings flagged. All assets are showing solid momentum!
                  </div>
                )}
              </div>
            </div>

            {/* Entry/Expand Card Deck */}
            <div className="glass-card holdings-container" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Sparkles className="w-5 h-5" style={{ color: '#34d399' }} />
                <h4 style={{ fontSize: '1.05rem', fontWeight: '900', color: '#fff', margin: 0 }}>🚀 ENTRY / EXPAND ZONE (Shift-In Opportunities)</h4>
              </div>
              <p className="holdings-subtitle" style={{ marginBottom: 20 }}>
                Identify high-performing assets. Click "Shift Into" to auto-load and generate exit/DCA blueprints.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Grab BUY recommendation assets from holdings or watchlist */}
                {[
                  ...holdings.filter(h => h.advisor_action === 'BUY').map(h => ({ ...h, type: 'owned' })),
                  ...watchlist.filter(w => w.recommendation === 'BUY').map(w => ({ ...w, type: 'watched', total_value: 0 }))
                ].map((w, idx) => (
                  <div key={idx} className="active-guess-tile" style={{ borderLeft: '3px solid #34d399', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '14px', color: '#fff' }}>{w.ticker}</strong>
                        <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', marginLeft: '8px', fontWeight: '700', textTransform: 'uppercase' }}>
                          {w.type === 'owned' ? 'Owned Asset' : 'On Watchlist'}
                        </span>
                      </div>
                      <span className="badge badge-buy" style={{ fontSize: '9px', padding: '4px 8px', fontWeight: '900' }}>
                        ▲ BUY (Score: {w.advisor_score || w.score}%)
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <span style={{ fontSize: '10px', color: '#34d399', fontWeight: '700' }}>
                        Price: {formatCurrency(w.current_price)} {w.timing ? `— ${w.timing.slice(0, 22)}...` : ''}
                      </span>
                      <button
                        onClick={() => {
                          setShifterForm(prev => ({ ...prev, buyTicker: w.ticker }));
                          setSelectedTicker(w.ticker);
                          alert(`Loaded ${w.ticker} as Buy Target! Visual blueprint generated on the right.`);
                        }}
                        className="btn-base btn-primary"
                        style={{ padding: '6px 12px', fontSize: '9px', fontWeight: '800', background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px' }}
                      >
                        🚀 Shift Into
                      </button>
                    </div>
                  </div>
                ))}
                {holdings.filter(h => h.advisor_action === 'BUY').length === 0 && watchlist.filter(w => w.recommendation === 'BUY').length === 0 && (
                  <div key="fallback-entry-opportunities" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', border: '1px dashed rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                    No extreme oversold opportunities flagged. Try adding high-beta tickers to your watchlist.
                  </div>
                )}
              </div>
            </div>

          </div>

          <div className="oracle-grid">
            {/* Shifter Optimizer Tool Card */}
            <div className="glass-card predictor-form-card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp style={{ width: 18, height: 18, color: 'var(--color-buy)' }} />
                <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#fff', margin: 0 }}>Portfolio Shift Optimizer</h4>
              </div>
              <p className="holdings-subtitle" style={{ margin: 0 }}>
                Identify underperforming assets and simulate shifting capital into high-confidence opportunities.
              </p>

              {/* Interactive Shifter Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                <div className="input-group">
                  <label className="input-label">Shift Out of (Sell Asset)</label>
                  <select
                    value={shifterForm.sellTicker}
                    onChange={(e) => {
                      const ticker = e.target.value;
                      setShifterForm(prev => ({ ...prev, sellTicker: ticker }));
                    }}
                    className="form-input-text"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Select Asset to Sell</option>
                    {holdings.map(h => (
                      <option key={h.id} value={h.ticker}>{h.ticker} ({h.shares} shares — ${h.total_value.toLocaleString()})</option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Shift Into (Buy Asset)</label>
                  <select
                    value={shifterForm.buyTicker}
                    onChange={(e) => setShifterForm(prev => ({ ...prev, buyTicker: e.target.value }))}
                    className="form-input-text"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Select Asset to Buy</option>
                    <optgroup label="Holdings">
                      {holdings.map(h => (
                        <option key={h.id} value={h.ticker}>{h.ticker} (${h.current_price.toFixed(2)})</option>
                      ))}
                    </optgroup>
                    <optgroup label="Watchlist">
                      {watchlist.map(w => (
                        <option key={w.id} value={w.ticker}>{w.ticker} (${w.current_price.toFixed(2)})</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Shift Capital Amount ($)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    value={shifterForm.amount}
                    onChange={(e) => setShifterForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="form-input-text"
                  />
                </div>

                {/* Sector Concentrations Breakdown */}
                {Object.keys(sectorConcentrations).length > 0 && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '800', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                      Sector Concentrations Breakdown
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Object.entries(sectorConcentrations).map(([sec, pct]) => {
                        let barColor = "var(--color-hold)";
                        if (sec.includes("Tech") || sec.includes("Quantum")) barColor = "var(--color-oracle)";
                        if (pct > 25) barColor = "var(--color-sell)";
                        
                        return (
                          <div key={sec} style={{ fontSize: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', marginBottom: '3px' }}>
                              <span>{sec}</span>
                              <strong style={{ color: pct > 25 ? 'var(--color-sell)' : '#fff' }}>{pct}%</strong>
                            </div>
                            <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: barColor, borderRadius: '2px', transition: 'width 0.4s ease' }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Shifter Simulation Result Preview */}
                {(() => {
                  const sellAsset = holdings.find(h => h.ticker === shifterForm.sellTicker);
                  const buyAsset = holdings.find(h => h.ticker === shifterForm.buyTicker) || watchlist.find(w => w.ticker === shifterForm.buyTicker);
                  const amount = parseFloat(shifterForm.amount || 0);

                  if (sellAsset && buyAsset && amount > 0) {
                    const sellShares = Math.min(amount / sellAsset.current_price, sellAsset.shares);
                    const actualValue = sellShares * sellAsset.current_price;
                    const buyShares = actualValue / buyAsset.current_price;
                    
                    const sellSector = sellAsset.sector || "Other/Speculative";
                    const buySector = buyAsset.sector || "Other/Speculative";
                    
                    // Compute simulated sector concentrations
                    const simSectorValues = {};
                    holdings.forEach(h => {
                      const sec = h.sector || "Other/Speculative";
                      let val = h.total_value;
                      if (h.ticker === sellAsset.ticker) {
                        val -= actualValue;
                      }
                      if (h.ticker === buyAsset.ticker) {
                        val += actualValue;
                      }
                      simSectorValues[sec] = (simSectorValues[sec] || 0) + val;
                    });
                    
                    const isBuyAssetOwned = holdings.some(h => h.ticker === buyAsset.ticker);
                    if (!isBuyAssetOwned) {
                      simSectorValues[buySector] = (simSectorValues[buySector] || 0) + actualValue;
                    }
                    
                    const simSectorConcentrations = {};
                    let simTotalVal = summary.total_equity;
                    if (simTotalVal === 0) simTotalVal = actualValue;
                    
                    Object.entries(simSectorValues).forEach(([sec, val]) => {
                      simSectorConcentrations[sec] = (val / simTotalVal) * 100;
                    });
                    
                    const overConcentratedSectors = Object.entries(simSectorConcentrations).filter(([sec, pct]) => pct > 25);
                    const isCorrelatedShift = sellSector === buySector;

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: '10px' }}>
                        {/* Simulation Results Bubble */}
                        <div className="coach-tip-bubble" style={{ border: '1px solid rgba(139, 92, 246, 0.3)', backgroundColor: 'rgba(139, 92, 246, 0.05)', fontSize: '10px', margin: 0 }}>
                          <strong style={{ color: 'var(--color-oracle)', display: 'block', marginBottom: '4px', fontSize: '11px' }}>⚙️ Rebalancer Simulation Outcome:</strong>
                          <ul style={{ paddingLeft: '14px', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <li>Sells <strong style={{ color: '#fff' }}>{sellShares.toFixed(2)} shares</strong> of {sellAsset.ticker} raising <strong style={{ color: '#fff' }}>${actualValue.toLocaleString(undefined, {maximumFractionDigits: 2})}</strong> cash.</li>
                            <li>Buys <strong style={{ color: '#fff' }}>{buyShares.toFixed(2)} shares</strong> of {buyAsset.ticker} at current quote price of ${buyAsset.current_price.toFixed(2)}.</li>
                            <li>Shifts portfolio weights by <strong style={{ color: 'var(--color-buy)' }}>+{((actualValue / summary.total_equity) * 100).toFixed(1)}% allocation</strong> to {buyAsset.ticker}.</li>
                          </ul>
                        </div>
                        
                        {/* Sector Correlation Warning Tag */}
                        {isCorrelatedShift && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(244, 63, 94, 0.2)', backgroundColor: 'rgba(244, 63, 94, 0.04)', color: '#fb7185', fontSize: '9px', fontWeight: '800' }}>
                            <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(244,63,94,0.15)', fontSize: '8px', color: '#fb7185' }}>CORRELATED REDIRECT</span>
                            <span>Warning: Rebalancing within the same sector ({buySector}) does not reduce structural system drawdown risk!</span>
                          </div>
                        )}
                        
                        {/* Sector Concentration Critical Warning Card */}
                        {overConcentratedSectors.map(([sec, pct]) => (
                          <div key={sec} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px', borderRadius: '10px', border: '1px solid rgba(244, 63, 94, 0.25)', backgroundColor: 'rgba(244, 63, 94, 0.04)', boxShadow: '0 0 10px rgba(244, 63, 94, 0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <ShieldAlert style={{ width: 14, height: 14, color: '#fb7185' }} />
                              <strong style={{ fontSize: '10px', color: '#fb7185', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EXPOSURE CRITICAL WARNING</strong>
                            </div>
                            <p style={{ margin: 0, fontSize: '9.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                              Sector <strong style={{ color: '#fff' }}>{sec}</strong> simulated concentration is <strong style={{ color: '#fb7185' }}>{pct.toFixed(1)}%</strong>, exceeding the safe institutional limit of 25%. High risk of correlated drawdown. Consider diversification.
                            </p>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            {/* Bracket Blueprints Card */}
            <div className="glass-card predictor-form-card" style={{ minHeight: '400px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Target style={{ width: 18, height: 18, color: 'var(--color-oracle)' }} />
                  <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#fff' }}>Bracket Blueprint Strategy</h4>
                </div>
                <select
                  value={selectedTicker}
                  onChange={(e) => setSelectedTicker(e.target.value)}
                  className="form-input-text"
                  style={{ width: '120px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                >
                  <optgroup label="Holdings">
                    {holdings.map(h => (
                      <option key={h.id} value={h.ticker}>{h.ticker}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Watchlist">
                    {watchlist.map(w => (
                      <option key={w.id} value={w.ticker}>{w.ticker}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {strategyLoading ? (
                <div style={{ display: 'flex', height: '300px', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw className="animate-spin w-6 h-6 mr-2" />
                  Generating institutional brackets...
                </div>
              ) : strategyBrackets ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  
                  {/* Score & General Advice */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)' }}>
                    <div>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Advisor Standing for {selectedTicker}</span>
                      <h5 style={{ fontSize: '13px', fontWeight: '900', color: '#fff', margin: '2px 0 0' }}>
                        {strategyBrackets.advisor_score}% Conviction Score → <strong style={{ color: strategyBrackets.advisor_action === 'BUY' ? 'var(--color-buy)' : strategyBrackets.advisor_action === 'SELL' ? 'var(--color-sell)' : 'var(--color-hold)' }}>{strategyBrackets.advisor_action}</strong>
                      </h5>
                    </div>
                    {strategyBrackets.owned_shares > 0 ? (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Position Details</span>
                        <strong style={{ display: 'block', fontSize: '11px', color: '#fff', margin: '2px 0 0' }}>
                          {strategyBrackets.owned_shares} shares @ ${strategyBrackets.avg_buy_price.toFixed(2)}
                        </strong>
                      </div>
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--color-oracle)', fontWeight: '800' }}>WATCHLIST MONITOR ACTIVE</span>
                    )}
                  </div>

                  {/* Risk & Stop-Loss Assessment Gauge */}
                  <div className="glass-card" style={{ padding: '16px', border: '1px solid rgba(255, 255, 255, 0.05)', backgroundColor: 'rgba(255,255,255,0.015)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Activity className="w-4.5 h-4.5" style={{ color: strategyBrackets.is_asymmetric_risk ? '#fb7185' : '#34d399' }} />
                      <strong style={{ fontSize: '11px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Blueprint Assessment</strong>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block' }}>ATR VOLATILITY STOP-LOSS</span>
                        <strong style={{ fontSize: '15px', color: '#fff' }}>${strategyBrackets.stop_loss_price.toFixed(2)}</strong>
                        <span style={{ fontSize: '8px', color: '#fb7185', display: 'block', marginTop: '2px', fontWeight: '800' }}>2.5x ATR Buffer</span>
                      </div>
                      
                      <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block' }}>RISK:REWARD RATIO</span>
                        <strong style={{ fontSize: '15px', color: strategyBrackets.is_asymmetric_risk ? '#fb7185' : '#34d399' }}>
                          1 : {strategyBrackets.risk_to_reward_ratio.toFixed(2)}
                        </strong>
                        <span style={{ fontSize: '8px', color: strategyBrackets.is_asymmetric_risk ? '#fb7185' : '#34d399', display: 'block', marginTop: '2px', fontWeight: '800' }}>
                          {strategyBrackets.is_asymmetric_risk ? 'Asymmetric Risk' : 'Optimal Swing Ratio'}
                        </span>
                      </div>
                    </div>

                    {/* Progress indicator bar for Risk-Reward */}
                    <div>
                      <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            width: `${Math.min((strategyBrackets.risk_to_reward_ratio / 3.0) * 100, 100)}%`, 
                            height: '100%', 
                            backgroundColor: strategyBrackets.is_asymmetric_risk ? 'var(--color-sell)' : 'var(--color-buy)',
                            borderRadius: '3px',
                            transition: 'width 0.4s ease'
                          }}
                        ></div>
                      </div>
                    </div>
                    
                    {/* Volatility detail labels */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-secondary)' }}>
                      <span>ATR Volatility: <strong>${strategyBrackets.atr.toFixed(2)}</strong></span>
                      <span>Market Regime bounds: <strong>{strategyBrackets.buy_threshold}% Buy / {strategyBrackets.sell_threshold}% Sell</strong></span>
                    </div>

                    {/* Asymmetric Risk Lockout Flag */}
                    {strategyBrackets.is_asymmetric_risk && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px', borderRadius: '8px', border: '1px solid rgba(244, 63, 94, 0.2)', backgroundColor: 'rgba(244, 63, 94, 0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fb7185', fontWeight: '800', fontSize: '9px' }}>
                          <ShieldAlert style={{ width: 12, height: 12 }} />
                          <span>⚠️ ASYMMETRIC RISK LOCKOUT ACTIVE</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '8.5px', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                          Capital entry is disauthorized. The mathematical upside target is too low relative to volatility-buffered downside risk. Risk-to-Reward must exceed 1:1.50 to execute.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Profit Scale-Out Blueprint */}
                  <div>
                    <h5 style={{ fontSize: '11px', fontWeight: '900', color: 'var(--color-buy)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle style={{ width: 12, height: 12 }} />
                      Scale-Out Profit Targets (Profit Maximizer)
                    </h5>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {strategyBrackets.scale_out_profit_blueprint.map((t, idx) => (
                        <div key={idx} className="active-guess-tile" style={{ borderLeft: '3px solid var(--color-buy)', padding: '10px 14px' }}>
                          <div className="active-guess-row-1">
                            <span style={{ fontSize: '11px', fontWeight: '800' }}>{t.stage} <span style={{ color: 'var(--text-muted)', fontSize: '9px', fontWeight: 'normal' }}>({t.trigger})</span></span>
                            <span style={{ color: 'var(--color-buy)', fontWeight: '900' }}>Target: ${t.price.toFixed(2)}</span>
                          </div>
                          <div className="active-guess-row-2" style={{ fontSize: '10px', marginTop: '4px' }}>
                            <span>Shares to Sell: {t.shares_to_sell > 0 ? `${t.shares_to_sell} units` : "0 (No position)"}</span>
                            <span>Yield: {t.projected_yield > 0 ? `$${t.projected_yield.toLocaleString(undefined, {maximumFractionDigits: 2})}` : "—"}</span>
                          </div>
                          <div className="active-guess-row-3" style={{ fontSize: '9px', marginTop: '4px' }}>
                            <span className="deviation-value-pos" style={{ fontWeight: '800' }}>
                              +{t.percent_gain.toFixed(1)}% Return from Cost
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cost Scale-In DCA Blueprint */}
                  <div>
                    <h5 style={{ fontSize: '11px', fontWeight: '900', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Info style={{ width: 12, height: 12 }} />
                      Scale-In entry brackets (Risk Reducer)
                    </h5>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {strategyBrackets.scale_in_dca_blueprint.map((l, idx) => (
                        <div key={idx} className="active-guess-tile" style={{ borderLeft: '3px solid #6366f1', padding: '10px 14px' }}>
                          <div className="active-guess-row-1">
                            <span style={{ fontSize: '11px', fontWeight: '800' }}>{l.level} <span style={{ color: 'var(--text-muted)', fontSize: '9px', fontWeight: 'normal' }}>({l.trigger})</span></span>
                            <span style={{ color: '#818cf8', fontWeight: '900' }}>Buy Price: ${l.price.toFixed(2)}</span>
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: '9px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                            {l.desc}
                          </p>
                          <div className="active-guess-row-3" style={{ fontSize: '9px', marginTop: '4px' }}>
                            <span style={{ color: '#fb7185', fontWeight: '800' }}>
                              Dip Target: -{l.pct_dip}% below quote
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              ) : (
                <div style={{ display: 'flex', height: '300px', alignItems: 'center', justify: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                  No strategy data calculated. Ensure a profile and ticker are loaded.
                </div>
              )}
            </div>
          </div>
          </>
          )}
        </div>
      )}

      {/* VIEW PANEL 5: SHADOW COACH — WATCH WHAT I DO */}
      {activeTab === "shadow" && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* Shadow Coach Hero Banner */}
          <div className="glass-card shadow-coach-hero">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="shadow-coach-icon-box">
                <Eye style={{ width: 22, height: 22, color: '#fff' }} />
              </div>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'calc(1.35rem + var(--font-size-offset, 0px))', fontWeight: 900, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
                  Shadow Coach
                </h2>
                <p style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)', marginTop: 2 }}>
                  I watch every move you make — buys, sells, adjustments — and learn from your patterns to help you grow.
                </p>
              </div>
            </div>
            {/* Time Filter Pills */}
            <div className="coach-time-filters">
              {["7d", "30d", "90d", "all"].map(f => (
                <button
                  key={f}
                  onClick={() => setCoachTimeFilter(f)}
                  className={`coach-filter-pill ${coachTimeFilter === f ? 'coach-filter-active' : ''}`}
                >
                  {f === "all" ? "All Time" : f === "7d" ? "7 Days" : f === "30d" ? "30 Days" : "90 Days"}
                </button>
              ))}
            </div>
          </div>

          {coachLoading ? (
            <div className="shadow-coach-grid">
              {/* LEFT COLUMN: Shimmering Metrics Skeleton */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Win Rate Ring Shimmer */}
                <div className="glass-card shadow-metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="skeleton-shimmer" style={{ width: '120px', height: '14px', borderRadius: '4px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginTop: '12px' }}>
                    <div className="skeleton-shimmer" style={{ width: '90px', height: '90px', borderRadius: '50%' }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div className="skeleton-shimmer" style={{ width: '90%', height: '12px', borderRadius: '4px' }} />
                      <div className="skeleton-shimmer" style={{ width: '70%', height: '12px', borderRadius: '4px' }} />
                      <div className="skeleton-shimmer" style={{ width: '50%', height: '12px', borderRadius: '4px' }} />
                    </div>
                  </div>
                </div>

                {/* Volumes Bar Shimmer */}
                <div className="glass-card shadow-metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="skeleton-shimmer" style={{ width: '80px', height: '14px', borderRadius: '4px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div className="skeleton-shimmer" style={{ width: '20px', height: '20px', borderRadius: '4px' }} />
                        <div className="skeleton-shimmer" style={{ flex: 1, height: '8px', borderRadius: '4px' }} />
                        <div className="skeleton-shimmer" style={{ width: '30px', height: '12px', borderRadius: '4px' }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Shimmering Insights Timeline Skeleton */}
              <div className="glass-card shadow-insights-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="skeleton-shimmer" style={{ width: '160px', height: '16px', borderRadius: '4px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '12px', padding: '14px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
                      <div className="skeleton-shimmer" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div className="skeleton-shimmer" style={{ height: '12px', width: '90%', borderRadius: '4px' }} />
                        <div className="skeleton-shimmer" style={{ height: '8px', width: '60%', borderRadius: '4px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : actionHistory.length === 0 ? (
            <div className="tab-empty-placeholder-card animate-fade-in" style={{ marginTop: 0 }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Eye className="animate-pulse" style={{ width: 28, height: 28, color: 'var(--color-oracle)' }} />
              </div>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '950', color: '#fff', letterSpacing: '-0.01em' }}>
                  No Behavioral Data Logged Yet
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '480px', lineHeight: '1.6' }}>
                  Shadow Coach learns from your active trades (buys, sells, adjustments) and gut predictions, automatically mapping your behavioral patterns to deliver personalized win rates and archetypes.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', borderTop: '1px solid var(--border-light)', paddingTop: 20, width: '100%' }}>
                <button
                  onClick={() => setIsLoginOpen(true)}
                  className="glowing-sync-cta"
                  style={{ margin: 0, width: 'auto' }}
                >
                  <RefreshCw style={{ width: 14, height: 14 }} />
                  Connect Robinhood Account
                </button>
                <button
                  onClick={handleSeedMockAssets}
                  className="font-size-btn"
                  style={{ padding: '12px 20px', borderRadius: '12px' }}
                >
                  <Sparkles style={{ width: 14, height: 14 }} />
                  Seed Sandbox Assets
                </button>
              </div>
            </div>
          ) : shadowCoachData ? (
            <div className="shadow-coach-grid">
              {/* LEFT COLUMN: Behavioral Metrics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Win Rate Ring */}
                <div className="glass-card shadow-metric-card">
                  <span className="metric-label" style={{ fontSize: 'calc(10px + var(--font-size-offset, 0px))' }}>Trade Win Rate</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 12 }}>
                    <div className="shadow-win-ring-container">
                      <svg width="110" height="110" viewBox="0 0 110 110">
                        <circle cx="55" cy="55" r="46" stroke="rgba(255,255,255,0.06)" strokeWidth="8" fill="none" />
                        <circle
                          cx="55" cy="55" r="46"
                          stroke={shadowCoachData.win_rate >= 60 ? '#10b981' : shadowCoachData.win_rate >= 40 ? '#f59e0b' : '#f43f5e'}
                          strokeWidth="8"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={`${(shadowCoachData.win_rate / 100) * 289} 289`}
                          transform="rotate(-90 55 55)"
                          style={{ transition: 'stroke-dasharray 1s ease-out' }}
                        />
                        <text x="55" y="50" textAnchor="middle" fill="var(--text-primary)" fontFamily="var(--font-heading)" fontWeight="900" fontSize="calc(22px + var(--font-size-offset, 0px))">
                          {shadowCoachData.win_rate}%
                        </text>
                        <text x="55" y="68" textAnchor="middle" fill="var(--text-muted)" fontSize="calc(9px + var(--font-size-offset, 0px))">
                          WIN RATE
                        </text>
                      </svg>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="shadow-stat-mini">
                        <ArrowUpRight style={{ width: 14, height: 14, color: '#10b981' }} />
                        <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>Avg Win</span>
                        <span style={{ fontSize: 'calc(14px + var(--font-size-offset, 0px))', fontWeight: 800, color: '#10b981' }}>+{shadowCoachData.avg_win_pct}%</span>
                      </div>
                      <div className="shadow-stat-mini">
                        <ArrowDownRight style={{ width: 14, height: 14, color: '#f43f5e' }} />
                        <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>Avg Loss</span>
                        <span style={{ fontSize: 'calc(14px + var(--font-size-offset, 0px))', fontWeight: 800, color: '#f43f5e' }}>-{shadowCoachData.avg_loss_pct}%</span>
                      </div>
                      <div className="shadow-stat-mini">
                        <Repeat style={{ width: 14, height: 14, color: 'var(--color-oracle)' }} />
                        <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>Total</span>
                        <span style={{ fontSize: 'calc(14px + var(--font-size-offset, 0px))', fontWeight: 800, color: 'var(--text-primary)' }}>{shadowCoachData.total_actions}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Volume Breakdown */}
                <div className="glass-card shadow-metric-card">
                  <span className="metric-label" style={{ fontSize: 'calc(10px + var(--font-size-offset, 0px))' }}>Action Breakdown</span>
                  <div className="shadow-volume-bars">
                    {[
                      { label: "Buys", count: shadowCoachData.buys, color: "#10b981", icon: <Plus style={{ width: 12, height: 12 }} /> },
                      { label: "Sells", count: shadowCoachData.sells, color: "#f43f5e", icon: <Minus style={{ width: 12, height: 12 }} /> },
                      { label: "Adjusts", count: shadowCoachData.adjusts, color: "#8b5cf6", icon: <Repeat style={{ width: 12, height: 12 }} /> }
                    ].map(item => (
                      <div key={item.label} className="shadow-volume-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }}>
                          <span style={{ color: item.color }}>{item.icon}</span>
                          <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>{item.label}</span>
                        </div>
                        <div className="shadow-bar-track">
                          <div
                            className="shadow-bar-fill"
                            style={{
                              width: `${shadowCoachData.total_actions > 0 ? (item.count / shadowCoachData.total_actions * 100) : 0}%`,
                              backgroundColor: item.color
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 'calc(12px + var(--font-size-offset, 0px))', fontWeight: 700, color: 'var(--text-primary)', minWidth: 24, textAlign: 'right' }}>
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Most Traded Tickers */}
                {shadowCoachData.most_traded && shadowCoachData.most_traded.length > 0 && (
                  <div className="glass-card shadow-metric-card">
                    <span className="metric-label" style={{ fontSize: 'calc(10px + var(--font-size-offset, 0px))' }}>Most Traded Tickers</span>
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {shadowCoachData.most_traded.map((t, i) => (
                        <div key={t.ticker} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            fontSize: 'calc(10px + var(--font-size-offset, 0px))',
                            fontWeight: 800,
                            color: i === 0 ? '#fbbf24' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--text-muted)',
                            minWidth: 18
                          }}>
                            #{i + 1}
                          </span>
                          <span style={{ fontSize: 'calc(13px + var(--font-size-offset, 0px))', fontWeight: 700, color: 'var(--text-primary)', minWidth: 60 }}>{t.ticker}</span>
                          <div className="shadow-bar-track" style={{ flex: 1 }}>
                            <div
                              className="shadow-bar-fill"
                              style={{
                                width: `${(t.count / shadowCoachData.most_traded[0].count * 100)}%`,
                                background: 'linear-gradient(90deg, var(--color-oracle), #6366f1)'
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>{t.count} actions</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: Coaching Insights + Action Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Coaching Insights */}
                <div className="glass-card shadow-insights-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Sparkles style={{ width: 16, height: 16, color: '#fbbf24' }} />
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'calc(1.1rem + var(--font-size-offset, 0px))', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Your Coaching Insights
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {shadowCoachData.insights && shadowCoachData.insights.map((insight, idx) => (
                      <div
                        key={idx}
                        className={`shadow-insight-tile shadow-insight-${insight.type}`}
                      >
                        <span style={{ fontSize: 'calc(16px + var(--font-size-offset, 0px))' }}>{insight.icon}</span>
                        <p style={{ fontSize: 'calc(12px + var(--font-size-offset, 0px))', lineHeight: 1.55, color: 'var(--text-primary)', margin: 0 }}>
                          {insight.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action History Timeline */}
                <div className="glass-card shadow-timeline-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <History style={{ width: 16, height: 16, color: 'var(--color-oracle)' }} />
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'calc(1.1rem + var(--font-size-offset, 0px))', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Action History
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 'calc(10px + var(--font-size-offset, 0px))', color: 'var(--text-muted)' }}>
                      {actionHistory.length} actions
                    </span>
                  </div>
                  <div className="shadow-timeline-scroll">
                    {actionHistory.length > 0 ? actionHistory.map((action, idx) => {
                      const actionColor = action.action_type === "buy" ? "#10b981"
                        : action.action_type === "sell" ? "#f43f5e"
                        : "#8b5cf6";
                      const actionIcon = action.action_type === "buy" ? <ArrowUpRight style={{ width: 14, height: 14 }} />
                        : action.action_type === "sell" ? <ArrowDownRight style={{ width: 14, height: 14 }} />
                        : <Repeat style={{ width: 14, height: 14 }} />;
                      const timeAgo = (() => {
                        const days = Math.floor((Date.now() - new Date(action.timestamp).getTime()) / 86400000);
                        if (days === 0) return "Today";
                        if (days === 1) return "Yesterday";
                        if (days < 7) return `${days}d ago`;
                        if (days < 30) return `${Math.floor(days / 7)}w ago`;
                        return `${Math.floor(days / 30)}mo ago`;
                      })();

                      return (
                        <div key={action.id || idx} className="shadow-timeline-item">
                          <div className="shadow-timeline-dot" style={{ backgroundColor: actionColor, boxShadow: `0 0 8px ${actionColor}` }} />
                          {idx < actionHistory.length - 1 && <div className="shadow-timeline-line" />}
                          <div className="shadow-timeline-content">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: actionColor }}>{actionIcon}</span>
                              <span style={{
                                fontSize: 'calc(11px + var(--font-size-offset, 0px))',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                color: actionColor,
                                letterSpacing: '0.5px'
                              }}>
                                {action.action_type}
                              </span>
                              <span style={{ fontSize: 'calc(13px + var(--font-size-offset, 0px))', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {action.ticker}
                              </span>
                              <span style={{ marginLeft: 'auto', fontSize: 'calc(10px + var(--font-size-offset, 0px))', color: 'var(--text-muted)' }}>
                                {timeAgo}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                              <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>
                                {action.shares} shares @ ${parseFloat(action.price).toFixed(2)}
                              </span>
                              {action.metadata && action.metadata.pnl_pct !== undefined && (
                                <span style={{
                                  fontSize: 'calc(11px + var(--font-size-offset, 0px))',
                                  fontWeight: 700,
                                  color: action.metadata.pnl_pct >= 0 ? '#10b981' : '#f43f5e'
                                }}>
                                  {action.metadata.pnl_pct >= 0 ? '+' : ''}{action.metadata.pnl_pct}%
                                </span>
                              )}
                            </div>
                            {action.metadata && action.metadata.reason && (
                              <p style={{ fontSize: 'calc(10px + var(--font-size-offset, 0px))', color: 'var(--text-muted)', margin: '4px 0 0', fontStyle: 'italic' }}>
                                "{action.metadata.reason}"
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }) : (
                      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'calc(11px + var(--font-size-offset, 0px))' }}>
                        <Eye style={{ width: 24, height: 24, opacity: 0.3, margin: '0 auto 8px' }} />
                        <p>No actions recorded yet. Start trading to see your behavioral patterns emerge.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
              <Eye style={{ width: 40, height: 40, color: 'var(--text-muted)', margin: '0 auto 16px', opacity: 0.4 }} />
              <p style={{ fontSize: 'calc(12px + var(--font-size-offset, 0px))', color: 'var(--text-muted)' }}>
                Shadow Coach is waiting. Once you start making trades, it will analyze your patterns and provide personalized coaching insights.
              </p>
            </div>
          )}
        </div>
      )}

      {/* VIEW PANEL 6: PORTFOLIO STRENGTH ANALYZER */}
      {activeTab === "strength" && (
        <div className="strength-analyzer-container animate-fade-in">
          {/* Section 1: Owned Asset Structural Classification Deck */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: '950', color: '#fff', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Award className="w-5 h-5 text-violet-400" />
              Owned Asset Classification Deck
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 20px 0' }}>
              Identifies structural strength and vulnerabilities across your active holdings, categorizing assets into Keeps, Monitors, and Aborts based on dynamic advisor technical scores.
            </p>

            {holdings.length === 0 ? (
              <div className="tab-empty-placeholder-card" style={{ padding: '32px 16px', textAlign: 'center' }}>
                <ShieldAlert style={{ width: 36, height: 36, color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
                <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>No Holdings Found to Analyze</h4>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 16px' }}>
                  Seed popular mock assets to explore the classification deck immediately, or connect your Robinhood account.
                </p>
                <button
                  onClick={handleSeedMockAssets}
                  className="btn-base btn-primary font-size-btn"
                  style={{ margin: '0 auto' }}
                >
                  <Sparkles style={{ width: 12, height: 12 }} />
                  Seed Sandbox Assets
                </button>
              </div>
            ) : (
              <div className="strength-classifier-grid">
                {/* 🟢 Keep Zone */}
                {(() => {
                  const keeps = holdings.filter(h => (h.advisor_score || 50) >= 65);
                  return (
                    <div className="zone-card keep-card-outline">
                      <div className="zone-header">
                        <div className="zone-title keep-title">
                          <CheckCircle style={{ width: 16, height: 16 }} />
                          Keep Zone
                        </div>
                        <span className="zone-badge">{keeps.length} {keeps.length === 1 ? 'Asset' : 'Assets'}</span>
                      </div>
                      <div className="zone-asset-list">
                        {keeps.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', margin: 'auto 0' }}>
                            No holdings in Keep Zone.
                          </div>
                        ) : (
                          keeps.map(h => (
                            <div key={h.id} className="zone-asset-row">
                              <div className="zone-asset-meta">
                                <div className="asset-symbol-block">
                                  <span className="asset-symbol-text">{h.ticker}</span>
                                  <span className="asset-shares-text">{h.shares} Shares @ ${h.avg_buy_price.toFixed(2)}</span>
                                </div>
                                <div className="asset-score-badge keep-score">
                                  {(h.advisor_score || 50).toFixed(0)}%
                                </div>
                              </div>
                              <div className="zone-asset-actions">
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  Val: ${(h.shares * h.current_price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </span>
                                <button
                                  onClick={() => {
                                    setSelectedTicker(h.ticker);
                                    setActiveTab("coach");
                                    showToast("info", `Analyzing ${h.ticker} charts...`);
                                  }}
                                  className="zone-action-btn zone-bracket-btn"
                                >
                                  <TrendingUp style={{ width: 10, height: 10 }} />
                                  Chart
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 🟡 Monitor Zone */}
                {(() => {
                  const monitors = holdings.filter(h => (h.advisor_score || 50) >= 35 && (h.advisor_score || 50) < 65);
                  return (
                    <div className="zone-card monitor-card-outline">
                      <div className="zone-header">
                        <div className="zone-title monitor-title">
                          <AlertTriangle style={{ width: 16, height: 16 }} />
                          Monitor Zone
                        </div>
                        <span className="zone-badge">{monitors.length} {monitors.length === 1 ? 'Asset' : 'Assets'}</span>
                      </div>
                      <div className="zone-asset-list">
                        {monitors.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', margin: 'auto 0' }}>
                            No holdings in Monitor Zone.
                          </div>
                        ) : (
                          monitors.map(h => (
                            <div key={h.id} className="zone-asset-row">
                              <div className="zone-asset-meta">
                                <div className="asset-symbol-block">
                                  <span className="asset-symbol-text">{h.ticker}</span>
                                  <span className="asset-shares-text">{h.shares} Shares @ ${h.avg_buy_price.toFixed(2)}</span>
                                </div>
                                <div className="asset-score-badge monitor-score">
                                  {(h.advisor_score || 50).toFixed(0)}%
                                </div>
                              </div>
                              <div className="zone-asset-actions">
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  Val: ${(h.shares * h.current_price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </span>
                                <button
                                  onClick={() => {
                                    setSelectedTicker(h.ticker);
                                    setActiveTab("strategy");
                                    showToast("info", `Initiating Shift Planner for ${h.ticker}...`);
                                  }}
                                  className="zone-action-btn zone-shift-btn"
                                >
                                  <Repeat style={{ width: 10, height: 10 }} />
                                  Shift
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 🔴 Abort Zone */}
                {(() => {
                  const aborts = holdings.filter(h => (h.advisor_score || 50) < 35);
                  return (
                    <div className="zone-card abort-card-outline">
                      <div className="zone-header">
                        <div className="zone-title abort-title">
                          <AlertOctagon style={{ width: 16, height: 16 }} />
                          Abort Zone
                        </div>
                        <span className="zone-badge">{aborts.length} {aborts.length === 1 ? 'Asset' : 'Assets'}</span>
                      </div>
                      <div className="zone-asset-list">
                        {aborts.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', margin: 'auto 0' }}>
                            Zero holdings flagged for Abort. Good!
                          </div>
                        ) : (
                          aborts.map(h => (
                            <div key={h.id} className="zone-asset-row">
                              <div className="zone-asset-meta">
                                <div className="asset-symbol-block">
                                  <span className="asset-symbol-text">{h.ticker}</span>
                                  <span className="asset-shares-text">{h.shares} Shares @ ${h.avg_buy_price.toFixed(2)}</span>
                                </div>
                                <div className="asset-score-badge abort-score">
                                  {(h.advisor_score || 50).toFixed(0)}%
                                </div>
                              </div>
                              <div className="zone-asset-actions">
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  Val: ${(h.shares * h.current_price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </span>
                                <div className="ranker-action-triggers">
                                  <button
                                    onClick={() => {
                                      setSelectedTicker(h.ticker);
                                      setActiveTab("strategy");
                                      showToast("warning", `Weakness Alert: Shift capital from ${h.ticker} to a stronger asset.`);
                                    }}
                                    className="zone-action-btn zone-shift-btn"
                                    style={{ color: '#fb7185' }}
                                  >
                                    <Repeat style={{ width: 10, height: 10 }} />
                                    Shift Funds
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Section 2: Market Strength Leaderboards */}
          <div className="market-leaderboards-card">
            <div className="leaderboards-header-row">
              <div className="leaderboards-title-block">
                <h4 className="leaderboards-title">Curated Market Strength Leaderboards</h4>
                <p className="leaderboards-desc">
                  Scans a stable universe of 35 institutional assets to identify the top 15 gainers and worst 15 decliners.
                </p>
              </div>

              <div className="leaderboards-filters">
                <div className="timeframe-pills">
                  {["day", "week", "month", "year", "5years"].map(tf => (
                    <button
                      key={tf}
                      onClick={() => setStrengthTimeframe(tf)}
                      className={`timeframe-pill ${strengthTimeframe === tf ? 'timeframe-pill-active' : ''}`}
                    >
                      {tf === "5years" ? "5 Years" : tf.toUpperCase()}
                    </button>
                  ))}
                </div>

                <select
                  value={strengthSector}
                  onChange={(e) => setStrengthSector(e.target.value)}
                  className="sector-dropdown"
                >
                  <option value="all">All Sectors</option>
                  <option value="technology">Technology Sector</option>
                  <option value="quantum">Quantum Sector</option>
                  <option value="energy">Nuclear Energy</option>
                  <option value="etf">ETFs & Diversified</option>
                </select>
              </div>
            </div>

            {strengthLoading ? (
              <div className="ranker-columns-deck">
                {/* Skeletal Gainers Column */}
                <div className="ranker-column">
                  <div className="column-label gainer-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp style={{ width: 14, height: 14 }} />
                    Scanning Market Gainers...
                  </div>
                  <div className="ranker-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}>
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <div key={idx} className="ranker-item" style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
                        <div className="skeleton-shimmer" style={{ width: '28px', height: '14px', borderRadius: '4px' }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div className="skeleton-shimmer" style={{ height: '12px', width: '80%', borderRadius: '4px' }} />
                          <div className="skeleton-shimmer" style={{ height: '8px', width: '40%', borderRadius: '4px' }} />
                        </div>
                        <div className="skeleton-shimmer" style={{ width: '60px', height: '16px', borderRadius: '8px' }} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Skeletal Decliners Column */}
                <div className="ranker-column">
                  <div className="column-label decliner-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingDown style={{ width: 14, height: 14 }} />
                    Scanning Market Decliners...
                  </div>
                  <div className="ranker-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}>
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <div key={idx} className="ranker-item" style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
                        <div className="skeleton-shimmer" style={{ width: '28px', height: '14px', borderRadius: '4px' }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div className="skeleton-shimmer" style={{ height: '12px', width: '70%', borderRadius: '4px' }} />
                          <div className="skeleton-shimmer" style={{ height: '8px', width: '50%', borderRadius: '4px' }} />
                        </div>
                        <div className="skeleton-shimmer" style={{ width: '60px', height: '16px', borderRadius: '8px' }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : marketStrengthData ? (
              <div className="ranker-columns-deck">
                {/* Column 1: Top 15 Gainers */}
                <div className="ranker-column">
                  <div className="column-label gainer-label">
                    <TrendingUp style={{ width: 14, height: 14 }} />
                    Top 15 Gainers ({marketStrengthData.top_gainers.length})
                  </div>
                  <div className="ranker-list">
                    {marketStrengthData.top_gainers.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                        No gainers fit filters.
                      </div>
                    ) : (
                      marketStrengthData.top_gainers.map((item, idx) => (
                        <div key={item.ticker} className="ranker-item gainer-item animate-fade-in">
                          <div className="ranker-asset-info">
                            <span className="ranker-position-idx">#{idx + 1}</span>
                            <div className="ranker-ticker-details">
                              <span className="ranker-ticker-symbol">{item.ticker}</span>
                              <span className="ranker-ticker-name" title={item.name}>{item.name}</span>
                            </div>
                          </div>
                          <div className="ranker-price-returns">
                            <div className="ranker-price-col">
                              <span className="ranker-price-value">${item.price.toFixed(2)}</span>
                              <span className="ranker-price-change ranker-gainer-pct">
                                <ArrowUpRight style={{ width: 10, height: 10 }} />
                                +{item.change_pct.toFixed(2)}%
                              </span>
                            </div>
                            <div className="ranker-action-triggers">
                              <button
                                onClick={() => {
                                  if (sandboxWatchlist.some(w => w.ticker === item.ticker)) {
                                    showToast("warning", `${item.ticker} is already in your Acquisition Sandbox!`);
                                    return;
                                  }
                                  const newTarget = {
                                    ticker: item.ticker,
                                    name: item.name,
                                    price: item.price,
                                    targetPrice: item.price
                                  };
                                  setSandboxWatchlist(prev => [...prev, newTarget]);
                                  showToast("success", `Added ${item.ticker} to Acquisition Sandbox!`);
                                }}
                                className="ranker-trigger-btn"
                                title="Add to Sandbox Watchlist"
                              >
                                <Plus style={{ width: 12, height: 12 }} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Column 2: Worst 15 Decliners */}
                <div className="ranker-column">
                  <div className="column-label decliner-label">
                    <TrendingDown style={{ width: 14, height: 14 }} />
                    Worst 15 Decliners ({marketStrengthData.worst_decliners.length})
                  </div>
                  <div className="ranker-list">
                    {marketStrengthData.worst_decliners.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                        No decliners fit filters.
                      </div>
                    ) : (
                      marketStrengthData.worst_decliners.map((item, idx) => (
                        <div key={item.ticker} className="ranker-item decliner-item animate-fade-in">
                          <div className="ranker-asset-info">
                            <span className="ranker-position-idx">#{idx + 1}</span>
                            <div className="ranker-ticker-details">
                              <span className="ranker-ticker-symbol">{item.ticker}</span>
                              <span className="ranker-ticker-name" title={item.name}>{item.name}</span>
                            </div>
                          </div>
                          <div className="ranker-price-returns">
                            <div className="ranker-price-col">
                              <span className="ranker-price-value">${item.price.toFixed(2)}</span>
                              <span className="ranker-price-change ranker-decliner-pct">
                                <ArrowDownRight style={{ width: 10, height: 10 }} />
                                {item.change_pct.toFixed(2)}%
                              </span>
                            </div>
                            <div className="ranker-action-triggers">
                              <button
                                onClick={() => {
                                  if (sandboxWatchlist.some(w => w.ticker === item.ticker)) {
                                    showToast("warning", `${item.ticker} is already in your Acquisition Sandbox!`);
                                    return;
                                  }
                                  const newTarget = {
                                    ticker: item.ticker,
                                    name: item.name,
                                    price: item.price,
                                    targetPrice: item.price
                                  };
                                  setSandboxWatchlist(prev => [...prev, newTarget]);
                                  showToast("success", `Added ${item.ticker} to Acquisition Sandbox!`);
                                }}
                                className="ranker-trigger-btn"
                                title="Add to Sandbox Watchlist"
                              >
                                <Plus style={{ width: 12, height: 12 }} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Section 3: Simulated Target Portfolio (Acquisition Sandbox) */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: '950', color: '#fff', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sparkles className="w-5 h-5 text-violet-400" />
              Acquisition Sandbox & Shift Simulator
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 20px 0' }}>
              Compile a virtual watch list of stocks you want to enter, set target buy prices, and simulate shifting capital from weak owned holdings to strong sandbox allocations.
            </p>

            <div className="sandbox-deck-grid">
              <div className="sandbox-main-panel">
                <div className="sandbox-input-deck">
                  <input
                    type="text"
                    value={newSandboxTicker}
                    onChange={(e) => setNewSandboxTicker(e.target.value.toUpperCase())}
                    placeholder="ENTER TICKER (e.g. QBTS)"
                    className="sandbox-input-field"
                  />
                  <input
                    type="number"
                    value={newSandboxTargetPrice}
                    onChange={(e) => setNewSandboxTargetPrice(e.target.value)}
                    placeholder="TARGET BUY PRICE ($)"
                    className="sandbox-input-field"
                  />
                  <button
                    onClick={async () => {
                      if (!newSandboxTicker.trim()) {
                        showToast("error", "Please specify a ticker.");
                        return;
                      }
                      if (sandboxWatchlist.some(w => w.ticker === newSandboxTicker)) {
                        showToast("warning", `${newSandboxTicker} is already in your Acquisition Sandbox.`);
                        return;
                      }
                      try {
                        let price = 100.0;
                        try {
                          const res = await sidekickFetch(`/stocks/history?ticker=${newSandboxTicker}&span=day`);
                          if (res.ok) {
                            const quotes = await res.json();
                            if (quotes.length > 0) price = quotes[quotes.length - 1].close_price;
                          }
                        } catch {
                          const pubQ = await fetchPublicQuote(newSandboxTicker);
                          if (pubQ) price = pubQ;
                        }
                        const newTarget = {
                          ticker: newSandboxTicker,
                          name: `${newSandboxTicker} Corporation`,
                          price: price,
                          targetPrice: newSandboxTargetPrice ? parseFloat(newSandboxTargetPrice) : price
                        };
                        setSandboxWatchlist(prev => [...prev, newTarget]);
                        setNewSandboxTicker("");
                        setNewSandboxTargetPrice("");
                        showToast("success", `Added ${newTarget.ticker} to Acquisition Sandbox!`);
                      } catch (err) {
                        showToast("error", `Failed to resolve ticker details: ${err.message}`);
                      }
                    }}
                    className="btn-base btn-primary sandbox-add-btn"
                  >
                    <Plus style={{ width: 14, height: 14 }} />
                    Add Candidate
                  </button>
                </div>

                <div className="sandbox-watchlist-table">
                  <div className="sandbox-table-header">
                    <span>Ticker</span>
                    <span>Live Price</span>
                    <span>Target Price</span>
                    <span>Status vs Target</span>
                    <span>Remove</span>
                  </div>
                  <div className="sandbox-table-body">
                    {sandboxWatchlist.length === 0 ? (
                      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11.5px', gridColumn: 'span 5' }}>
                        No candidates added yet. Click the "+" button on the market lists or enter a ticker above to populate your acquisition targets!
                      </div>
                    ) : (
                      sandboxWatchlist.map(item => {
                        const distPct = item.price > 0 ? ((item.price - item.targetPrice) / item.targetPrice) * 100 : 0;
                        const reached = item.price <= item.targetPrice;
                        return (
                          <div key={item.ticker} className="sandbox-table-row">
                            <span className="sandbox-target-ticker">{item.ticker}</span>
                            <span className="sandbox-target-price">${item.price.toFixed(2)}</span>
                            <span>
                              <input
                                type="number"
                                value={item.targetPrice}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setSandboxWatchlist(prev => prev.map(w => w.ticker === item.ticker ? { ...w, targetPrice: val } : w));
                                }}
                                className="sandbox-price-input"
                              />
                            </span>
                            <span style={{ fontWeight: '700', color: reached ? '#34d399' : '#fbbf24' }}>
                              {reached ? "🎯 Target Triggered" : `${distPct.toFixed(1)}% above target`}
                            </span>
                            <span>
                              <button
                                onClick={() => {
                                  setSandboxWatchlist(prev => prev.filter(w => w.ticker !== item.ticker));
                                  showToast("info", `Removed ${item.ticker} from sandbox.`);
                                }}
                                className="sandbox-delete-btn"
                              >
                                <X style={{ width: 12, height: 12 }} />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="sandbox-simulation-sidebar">
                {(() => {
                  const weakAssetsCount = holdings.filter(h => (h.advisor_score || 50) < 55).length;
                  const targetsReady = sandboxWatchlist.filter(w => w.price <= w.targetPrice).length;
                  
                  let score = 50;
                  let verdict = "NEUTRAL SHIFT";
                  let badgeClass = "viability-badge-med";
                  let scoreClass = "viability-score-med";
                  let textDesc = "Strategic balance. Monitor technical entry flags on your target candidates before transferring capital from your active holdings.";

                  if (sandboxWatchlist.length > 0) {
                    if (weakAssetsCount > 0 && targetsReady > 0) {
                      score = 88;
                      verdict = "STRONG STRATEGIC SHIFT";
                      badgeClass = "viability-badge-high";
                      scoreClass = "viability-score-high";
                      textDesc = "Highly viable! You have vulnerable assets in downtrends, and target candidates that have hit their entry support bounds. Shifting capital is strongly recommended.";
                    } else if (weakAssetsCount > 0) {
                      score = 68;
                      verdict = "ACCUMULATE ENTRIES";
                      badgeClass = "viability-badge-med";
                      scoreClass = "viability-score-med";
                      textDesc = "Strategic potential exists. You have weak holdings to purge, but sandbox candidates are still trading slightly above target entry prices. Scale in slowly.";
                    } else if (targetsReady > 0) {
                      score = 42;
                      verdict = "STABLE HOLDINGS";
                      badgeClass = "viability-badge-low";
                      scoreClass = "viability-score-low";
                      textDesc = "Caution: Your active holdings are structurally sound and in keep zones. Avoid exiting strong uptrends to buy highly volatile speculative targets.";
                    }
                  }

                  return (
                    <div className="sandbox-card" style={{ background: 'rgba(139, 92, 246, 0.03)', borderColor: 'var(--border-glow)' }}>
                      <div className="sandbox-card-title" style={{ color: 'var(--color-oracle)' }}>Shift Viability Index</div>
                      <div className="viability-index-dial">
                        <span className={`viability-index-score ${scoreClass}`}>{score}%</span>
                        <span className={`viability-index-verdict ${badgeClass}`}>{verdict}</span>
                      </div>
                      <p style={{ fontSize: '10.5px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: '1.5', margin: '4px 0 0 0' }}>
                        {textDesc}
                      </p>
                    </div>
                  );
                })()}

                <div className="sandbox-card">
                  <div className="sandbox-card-title">Yield Simulator Preview</div>
                  
                  {(() => {
                    const weakHoldings = holdings.filter(h => (h.advisor_score || 50) < 50);
                    const totalCapitalToShift = weakHoldings.reduce((sum, h) => sum + h.total_value, 0);
                    const projectedYield = totalCapitalToShift * 0.185;

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="sandbox-metric-row">
                          <span className="sandbox-metric-label">Vulnerable Capital (Abort/Monitor):</span>
                          <span className="sandbox-metric-value" style={{ color: '#fb7185' }}>
                            ${totalCapitalToShift.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                        <div className="sandbox-metric-row">
                          <span className="sandbox-metric-label">Candidates in Entry Bounds:</span>
                          <span className="sandbox-metric-value sandbox-metric-positive">
                            {sandboxWatchlist.filter(w => w.price <= w.targetPrice).length} / {sandboxWatchlist.length}
                          </span>
                        </div>
                        <div className="sandbox-metric-row" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: 10 }}>
                          <span className="sandbox-metric-label" style={{ fontWeight: '800' }}>Projected Shift Yield (Quarterly):</span>
                          <span className="sandbox-metric-value sandbox-metric-positive" style={{ fontSize: '13px' }}>
                            +${projectedYield.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                        
                        <button
                          onClick={() => {
                            if (totalCapitalToShift === 0) {
                              showToast("warning", "No weak holdings found to shift from.");
                              return;
                            }
                            setActiveTab("strategy");
                            showToast("success", "Loaded vulnerable holdings into Shift Planner!");
                          }}
                          className="btn-base btn-primary font-size-btn"
                          style={{ width: '100%', marginTop: 8 }}
                        >
                          <Repeat style={{ width: 12, height: 12 }} />
                          Trigger Strategy Rebalance
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW PANEL 3: ORACLE PREDICTIONS SECTION */}
      {activeTab === "oracle" && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Sub-Tab Navigation inside Oracle */}
          <div className="viability-sub-tabs-wrapper animate-fade-in">
            <div className="viability-sub-tabs">
              <button
                onClick={() => setPredictionTab("viability")}
                className={`viability-sub-tab-btn ${predictionTab === "viability" ? "viability-sub-tab-btn-active" : ""}`}
              >
                <Sparkles style={{ width: 14, height: 14 }} />
                Trade Horizon Viability Oracle
              </button>
              <button
                onClick={() => setPredictionTab("intuition")}
                className={`viability-sub-tab-btn ${predictionTab === "intuition" ? "viability-sub-tab-btn-active" : ""}`}
              >
                <Brain style={{ width: 14, height: 14 }} />
                Intuition Tracker & Archetypes
              </button>
            </div>
          </div>

          {predictionTab === "intuition" && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {/* Top banner: Oracle Behavioral Archetype Certificate */}
              {analytics ? (
                <div className="glass-card oracle-certificate-card">
                  <div>
                    <span className="cert-meta-label">Your Cognitive Oracle Archetype</span>
                    <h3 className="cert-title">{analytics.archetype}</h3>
                    <p className="cert-desc">{analytics.archetype_desc}</p>
                  </div>
                  
                  <div className="cert-stats-board">
                    <div className="cert-stat-item">
                      <span className="cert-stat-label">Short-Term (7-14d)</span>
                      <strong className="cert-stat-val">{analytics.details.short_term.toFixed(0)}% Hit</strong>
                    </div>
                    <div className="cert-stat-line-spacer"></div>
                    <div className="cert-stat-item">
                      <span className="cert-stat-label">Long-Term (90d+)</span>
                      <strong className="cert-stat-val">{analytics.details.long_term.toFixed(0)}% Hit</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass-card" style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                  No price prediction analytics generated yet. Submit a guess below to analyze your archetype!
                </div>
              )}

              {/* Double Columns layout: Left Launcher Form, Right Guess Timeline logs */}
              <div className="oracle-grid">
                {/* Guess creator Form */}
                <div className="glass-card predictor-form-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Target style={{ width: 18, height: 18, color: '#a78bfa' }} />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#fff' }}>Create Gut Predictor Guess</h3>
                  </div>
                  <p className="holdings-subtitle" style={{ marginBottom: 24 }}>Test your intuition for {selectedTicker} by submitting a future target price. SQLite automatically resolution-tracks it against live markets.</p>

                  <form onSubmit={handleCreateGuess} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="input-group">
                      <label className="input-label">Target Price ($) for {selectedTicker}</label>
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. 245.00"
                        value={guessForm.target_price}
                        onChange={(e) => setGuessForm(prev => ({ ...prev, target_price: e.target.value }))}
                        className="form-input-text"
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label">Target Time Horizon</label>
                      <select
                        value={guessForm.timeframe_days}
                        onChange={(e) => setGuessForm(prev => ({ ...prev, timeframe_days: e.target.value }))}
                        className="form-input-text"
                        style={{ cursor: 'pointer' }}
                      >
                        <option value={7}>7 Days (Short Swing)</option>
                        <option value={14}>14 Days (Swing Trade)</option>
                        <option value={30}>30 Days (Standard Month)</option>
                        <option value={90}>90 Days (Quarter Outlook)</option>
                        <option value={180}>180 Days (Half Year Target)</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="btn-evolve"
                      style={{ width: '100%', padding: '12px', justifyContent: 'center', marginTop: '8px' }}
                    >
                      Deploy Prediction to Database
                    </button>
                  </form>
                </div>

                {/* Timeline lists */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Active list */}
                  <div className="glass-card predictions-timeline-card bg-gradient-to-b from-[#11151e] to-[#0e121a]">
                    <span className="predictions-timeline-title-row">
                      Active Price Timeline Guesses ({guesses.pending.length})
                    </span>
                    
                    <div className="predictions-scroll-container">
                      {guesses.pending.map(g => (
                        <div key={g.id} className="active-guess-tile">
                          <div className="active-guess-row-1">
                            <span style={{ fontSize: '13px', fontWeight: '900' }}>{g.ticker}</span>
                            <span style={{ color: '#a78bfa' }}>Target: ${g.target_price.toFixed(2)}</span>
                          </div>
                          
                          <div className="active-guess-row-2">
                            <span>Original: ${g.initial_price.toFixed(2)}</span>
                            <span>Market: ${g.current_price.toFixed(2)}</span>
                          </div>
                          
                          <div className="active-guess-row-3">
                            <span className={g.deviation_pct >= 0 ? 'deviation-value-pos' : 'deviation-value-neg'}>
                              {g.deviation_pct >= 0 ? '+' : ''}{g.deviation_pct.toFixed(1)}% Deviation
                            </span>
                            <span className="active-guess-resolve-date">
                              <Calendar style={{ width: 12, height: 12 }} />
                              Resolve: {g.target_date}
                            </span>
                          </div>
                        </div>
                      ))}
                      {guesses.pending.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', border: '1px dashed rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                          No active price predictions currently logged. Submit a guess on the left!
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resolved archives list */}
                  <div className="glass-card predictions-timeline-card bg-gradient-to-b from-[#11151e] to-[#0e121a]">
                    <span className="predictions-timeline-title-row">
                      Completed Prediction Logs ({guesses.completed.length})
                    </span>
                    
                    <div className="predictions-scroll-container" style={{ maxHeight: '200px' }}>
                      {guesses.completed.map(g => (
                        <div key={g.id} className="resolved-guess-archive-tile">
                          <div>
                            <div className="archive-title-badge-row">
                              <span style={{ fontSize: '13px', fontWeight: '900' }}>{g.ticker}</span>
                              <span className={`archive-pill-status ${g.status === 'hit' ? 'archive-pill-status-hit' : 'archive-pill-status-missed'}`}>
                                {g.status.toUpperCase()}
                              </span>
                            </div>
                            <div className="archive-metrics-row">
                              Target: ${g.target_price.toFixed(2)} | Resolved Price: ${g.actual_end_price?.toFixed(2)}
                            </div>
                          </div>
                          <span className="archive-date-td">{g.resolved_at}</span>
                        </div>
                      ))}
                      {guesses.completed.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)', fontSize: '11px' }}>
                          No resolved predictions in archives yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {predictionTab === "viability" && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Horizon Selectors */}
              <div className="viability-horizon-pills">
                <button
                  onClick={() => setViabilityHorizon("day")}
                  className={`viability-horizon-pill ${viabilityHorizon === "day" ? "viability-horizon-pill-active" : ""}`}
                >
                  🌅 Day Horizon (24h Outlook)
                </button>
                <button
                  onClick={() => setViabilityHorizon("week")}
                  className={`viability-horizon-pill ${viabilityHorizon === "week" ? "viability-horizon-pill-active" : ""}`}
                >
                  📅 Week Horizon (Swing Outlook)
                </button>
                <button
                  onClick={() => setViabilityHorizon("month")}
                  className={`viability-horizon-pill ${viabilityHorizon === "month" ? "viability-horizon-pill-active" : ""}`}
                >
                  🌌 Month Horizon (Macro Outlook)
                </button>
              </div>

              {viabilityData ? (() => {
                const forecast = viabilityData[viabilityHorizon];
                if (!forecast) return null;

                // Dynamic UI Math matching active sliders
                const sRsi = forecast.rsi_score;
                const sMacd = forecast.macd_score;
                const sTrend = forecast.trend_score;

                const totalW = viabilityWeights.rsi + viabilityWeights.macd + viabilityWeights.trend;
                const wRsi = totalW > 0 ? viabilityWeights.rsi / totalW : 0.35;
                const wMacd = totalW > 0 ? viabilityWeights.macd / totalW : 0.35;
                const wTrend = totalW > 0 ? viabilityWeights.trend / totalW : 0.30;

                const dynamicScore = Math.round((sRsi * wRsi + sMacd * wMacd + sTrend * wTrend) * 10) / 10;
                
                const isBear = (advisorData?.regime_status || forecast.regime_status) === "BEARISH";
                const buyH = isBear ? 78.0 : 65.0;
                const sellH = isBear ? 45.0 : 35.0;

                let dynamicAction = "HOLD";
                let actionColor = "var(--text-muted)";
                let glowColor = "rgba(255,255,255,0.05)";

                if (dynamicScore >= 80) {
                  dynamicAction = "STRONG BUY";
                  actionColor = "var(--text-highlight-green)";
                  glowColor = "rgba(16, 185, 129, 0.15)";
                } else if (dynamicScore >= buyH) {
                  dynamicAction = "BUY";
                  actionColor = "#34d399";
                  glowColor = "rgba(52, 211, 153, 0.1)";
                } else if (dynamicScore < 20) {
                  dynamicAction = "STRONG SELL";
                  actionColor = "var(--metric-pnl-neg)";
                  glowColor = "rgba(244, 63, 94, 0.15)";
                } else if (dynamicScore < sellH) {
                  dynamicAction = "SELL";
                  actionColor = "#f87171";
                  glowColor = "rgba(248, 113, 113, 0.1)";
                } else {
                  dynamicAction = "HOLD";
                  actionColor = "var(--text-highlight-purple)";
                  glowColor = "rgba(167, 139, 250, 0.08)";
                }

                // Arc Math for SVG Donut Gauge
                const radius = 50;
                const stroke = 8;
                const normalizedRadius = radius - stroke * 2;
                const circumference = normalizedRadius * 2 * Math.PI;
                const strokeDashoffset = circumference - (dynamicScore / 100) * circumference;

                // Handle single-click database commit
                const handleCommitHorizonGuess = async () => {
                  try {
                    let targetVal = forecast.exit_target;
                    let timeframeDays = viabilityHorizon === "day" ? 1 : (viabilityHorizon === "week" ? 14 : 90);
                    
                    if (isSandbox) {
                      localDb.createGuess(activeProfile.id, selectedTicker, targetVal, chartData.length > 0 ? chartData[chartData.length - 1].close_price : 100.0, timeframeDays);
                      alert(`Successfully committed ${selectedTicker} horizon prediction. Target Exit $${targetVal} logged locally!`);
                    } else {
                      const res = await sidekickFetch(`/guesses`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          profile_id: activeProfile.id,
                          ticker: selectedTicker.toUpperCase().trim(),
                          target_price: targetVal,
                          timeframe_days: timeframeDays
                        })
                      });
                      if (!res.ok) throw new Error("Failed to save backend prediction");
                      alert(`Successfully committed ${selectedTicker} horizon prediction. Target Exit $${targetVal} logged in SQLite!`);
                    }
                    // Refresh guesses
                    const updatedG = isSandbox ? localDb.getGuesses(activeProfile.id) : await (await sidekickFetch(`/guesses?profile_id=${activeProfile.id}`)).json();
                    setGuesses(updatedG);
                    const updatedA = isSandbox ? localDb.getAnalytics(activeProfile.id) : await (await sidekickFetch(`/guesses/analytics?profile_id=${activeProfile.id}`)).json();
                    setAnalytics(updatedA);
                  } catch (err) {
                    console.error("Failed to commit prediction:", err);
                    alert("Error saving prediction. Check logs.");
                  }
                };

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 24 }} className="oracle-grid animate-fade-in">
                    {/* Left Column: Viability Scoring Gauge & Targets */}
                    <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${actionColor}2a`, boxShadow: `0 0 20px ${glowColor}` }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '950', color: '#fff', textAlign: 'center' }}>
                          Viability Scoring Deck — {selectedTicker}
                        </h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: '9.5px', color: 'var(--text-muted)', textAlign: 'center' }}>
                          Calculated for {viabilityHorizon.toUpperCase()} horizon trading cycles
                        </p>
                      </div>

                      {/* Donut Gauge */}
                      <div className="viability-gauge-container">
                        <svg height={radius * 2} width={radius * 2} className="viability-gauge-svg">
                          <circle
                            stroke="rgba(255,255,255,0.02)"
                            fill="transparent"
                            strokeWidth={stroke}
                            r={normalizedRadius}
                            cx={radius}
                            cy={radius}
                          />
                          <circle
                            stroke={actionColor}
                            fill="transparent"
                            strokeWidth={stroke}
                            strokeDasharray={circumference + ' ' + circumference}
                            style={{ strokeDashoffset }}
                            strokeLinecap="round"
                            r={normalizedRadius}
                            cx={radius}
                            cy={radius}
                          />
                        </svg>
                        <div className="viability-score-text-box">
                          <span className="viability-score-text" style={{ textShadow: `0 0 15px ${actionColor}66` }}>
                            {dynamicScore.toFixed(0)}%
                          </span>
                          <span className="viability-score-label">Viability</span>
                        </div>
                      </div>

                      {/* Verdict panel */}
                      <div className="viability-verdict-row">
                        <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horizon Recommendation</span>
                        <h3 className="viability-verdict-title" style={{ color: actionColor, textShadow: `0 0 10px ${actionColor}33` }}>
                          {dynamicAction}
                        </h3>
                      </div>

                      {/* Entry and Exit targets */}
                      <div className="viability-targets-deck">
                        <div className="viability-target-card">
                          <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Accumulation Range</span>
                          <div className="viability-target-val">${forecast.entry_low.toFixed(2)} - ${forecast.entry_high.toFixed(2)}</div>
                          <span style={{ fontSize: '7.5px', color: 'var(--text-secondary)' }}>Best DCA zone</span>
                        </div>
                        <div className="viability-target-card">
                          <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Take Profit Target</span>
                          <div className="viability-target-val">${forecast.exit_target.toFixed(2)}</div>
                          <span style={{ fontSize: '7.5px', color: 'var(--text-secondary)' }}>Exit objective</span>
                        </div>
                      </div>

                      {/* Volatility limits */}
                      <div style={{ display: 'flex', gap: 16, fontSize: '9px', color: 'var(--text-muted)', borderTop: '1px dashed rgba(255,255,255,0.03)', paddingTop: 12, width: '100%', justifyContent: 'center' }}>
                        <span>Stop Loss: <strong style={{ color: '#fff' }}>${forecast.stop_loss.toFixed(2)}</strong></span>
                        <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.05)' }}></div>
                        <span>Risk/Reward: <strong style={{ color: '#fff' }}>{forecast.risk_to_reward_ratio.toFixed(2)}x</strong></span>
                      </div>
                    </div>

                    {/* Right Column: AI Technical Rationales & Collapsible Modifiers */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div className="glass-card" style={{ padding: 24, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <Activity style={{ width: 18, height: 18, color: 'var(--color-oracle)' }} />
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '950', color: '#fff' }}>
                              Quantitative Technical Rationales
                            </h4>
                          </div>
                          
                          <div className="viability-rationales-list">
                            {forecast.rationales.map((rat, idx) => (
                              <div key={idx} className="viability-rationale-item">
                                <CheckCircle className="viability-rationale-icon" style={{ width: 12, height: 12, color: actionColor }} />
                                <span>{rat}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Collapsible Advanced Technical DNA panel */}
                        <div className="viability-dna-accordion">
                          <button
                            onClick={() => setIsDnaOpen(!isDnaOpen)}
                            className="viability-dna-toggle-btn"
                          >
                            <span>🔬 Advanced Technical DNA & Weight biases</span>
                            {isDnaOpen ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
                          </button>

                          {isDnaOpen && (
                            <div className="viability-dna-grid">
                              {/* Left side: Technical DNA Indicators meters */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className="viability-indicator-subcard" data-tooltip="Relative Strength Index (0-100) measures rapid momentum. Under 30 is oversold (prime entry), over 70 is overbought (profit-take risk).">
                                  <div className="viability-indicator-label-row">
                                    <span>Relative Strength Index ({viabilityHorizon === "day" ? 7 : (viabilityHorizon === "week" ? 14 : 21)})</span>
                                    <span style={{ color: '#fff' }}>{forecast.rsi_value.toFixed(1)}</span>
                                  </div>
                                  <div className="viability-progress-bar-bg">
                                    <div
                                      className="viability-progress-bar-fill"
                                      style={{ width: `${forecast.rsi_value}%`, background: forecast.rsi_value < 30 ? 'var(--text-highlight-green)' : (forecast.rsi_value > 70 ? 'var(--metric-pnl-neg)' : 'var(--color-oracle)') }}
                                    ></div>
                                  </div>
                                </div>

                                <div className="viability-indicator-subcard" data-tooltip="Moving Average Convergence Divergence measures trend expansion. Positive histogram indicates upward swing power; negative indicates downside acceleration.">
                                  <div className="viability-indicator-label-row">
                                    <span>MACD Histogram Momentum</span>
                                    <span style={{ color: '#fff' }}>{forecast.macd_hist.toFixed(3)}</span>
                                  </div>
                                  <div className="viability-progress-bar-bg">
                                    <div
                                      className="viability-progress-bar-fill"
                                      style={{ width: `${Math.min(100, Math.max(0, 50 + forecast.macd_hist * 100))}%`, background: forecast.macd_hist >= 0 ? 'var(--text-highlight-green)' : 'var(--metric-pnl-neg)' }}
                                    ></div>
                                  </div>
                                </div>

                                <div className="viability-indicator-subcard" data-tooltip="Measures short vs long period moving average alignment. Day relies on hyper-reactive 10-EMA, Week relies on 20-EMA/50-SMA crossovers, Month monitors macro Golden/Death Crosses.">
                                  <div className="viability-indicator-label-row">
                                    <span>Moving Average Crossings</span>
                                    <span style={{ color: '#fff' }}>{forecast.trend_score.toFixed(0)}/100</span>
                                  </div>
                                  <div className="viability-progress-bar-bg">
                                    <div
                                      className="viability-progress-bar-fill"
                                      style={{ width: `${forecast.trend_score}%`, background: forecast.trend_score >= 60 ? 'var(--text-highlight-green)' : 'var(--metric-pnl-neg)' }}
                                    ></div>
                                  </div>
                                </div>
                              </div>

                              {/* Right side: Weight Modifiers Sliders panel */}
                              <div className="viability-slider-panel">
                                <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800' }}>Tweak Quantitative Weight biases</span>
                                
                                <div className="viability-slider-row" data-tooltip="Increase this weight to make your oracle score highly reactive to immediate overbought or oversold conditions.">
                                  <div className="viability-slider-labels">
                                    <span>RSI Bias Weight</span>
                                    <span className="viability-slider-val">{viabilityWeights.rsi}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={viabilityWeights.rsi}
                                    onChange={(e) => {
                                      let val = parseInt(e.target.value);
                                      setViabilityWeights(prev => ({ ...prev, rsi: val }));
                                    }}
                                    className="viability-slider-input"
                                  />
                                </div>

                                <div className="viability-slider-row" data-tooltip="Increase this weight to prioritize technical trend crossovers and momentum strength over raw overbought metrics.">
                                  <div className="viability-slider-labels">
                                    <span>MACD Bias Weight</span>
                                    <span className="viability-slider-val">{viabilityWeights.macd}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={viabilityWeights.macd}
                                    onChange={(e) => {
                                      let val = parseInt(e.target.value);
                                      setViabilityWeights(prev => ({ ...prev, macd: val }));
                                    }}
                                    className="viability-slider-input"
                                  />
                                </div>

                                <div className="viability-slider-row" data-tooltip="Increase this weight to bias the score towards structural moving average alignments (Golden Crosses and standard support levels).">
                                  <div className="viability-slider-labels">
                                    <span>Trend / MAs Bias Weight</span>
                                    <span className="viability-slider-val">{viabilityWeights.trend}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={viabilityWeights.trend}
                                    onChange={(e) => {
                                      let val = parseInt(e.target.value);
                                      setViabilityWeights(prev => ({ ...prev, trend: val }));
                                    }}
                                    className="viability-slider-input"
                                  />
                                </div>

                                <button
                                  onClick={() => setViabilityWeights({ rsi: 35, macd: 35, trend: 30 })}
                                  className="font-size-btn viability-reset-weights-btn"
                                  style={{ marginTop: 4, width: 'fit-content' }}
                                >
                                  Reset Weights to Default (35/35/30)
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Commit prediction button */}
                        <button
                          onClick={handleCommitHorizonGuess}
                          className="viability-log-guess-btn"
                        >
                          <Target style={{ width: 14, height: 14 }} />
                          Log Exit Target (${forecast.exit_target.toFixed(2)}) as Horizon Gut Guess
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                  Quantifying technical metrics and viability indices for {selectedTicker}...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* New Profile Onboarding / Creator Modal */}
      {isProfileModalOpen && (
        <div className="modal-overlay">
          <div className="glass-card modal-card">
            <button 
              onClick={() => setIsProfileModalOpen(false)}
              className="modal-close-btn"
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
              <div className="modal-icon-container" style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                <User className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="modal-title">Create New Profile</h3>
              <p className="modal-subtitle">Add a custom profile dynamically to track a separate portfolio and prediction record offline.</p>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              handleCreateProfile(modalProfileName, false);
            }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Profile Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Portfolio, Swing Account, or Long-Term"
                  value={modalProfileName}
                  onChange={(e) => setModalProfileName(e.target.value)}
                  className="form-input-text"
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
              >
                Create Profile
              </button>


            </form>
          </div>
        </div>
      )}

      {/* Raw Robinhood Text Clipboard Import Drawer Modal */}
      {isImportOpen && (
        <div className="modal-overlay">
          <div className="glass-card modal-card">
            <button 
              onClick={() => setIsImportOpen(false)}
              className="modal-close-btn"
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
              <div className="modal-icon-container" style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                <Clipboard className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="modal-title">Paste Copied Portfolio</h3>
              <p className="modal-subtitle">
                Copy your holdings list straight from the Robinhood web client screen, then paste it below. 
                Our regex algorithm extracts shares and average cost bases in a split second!
              </p>
            </div>

            <form onSubmit={handleImportClipboard} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <textarea
                  required
                  rows="6"
                  placeholder={`Example list block to copy/paste:\nNVDA\n41.35 shares\n$212.49\n+4.25%`}
                  value={clipboardText}
                  onChange={(e) => setClipboardText(e.target.value)}
                  className="form-input-text"
                  style={{ height: '140px', fontFamily: 'monospace', fontSize: '11px' }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-evolve"
                style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
              >
                {loading && <RefreshCw className="animate-spin" style={{ width: 14, height: 14 }} />}
                Import Holdings to Local DB
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Robinhood Connection login Modal */}
      {isLoginOpen && (
        <div className="modal-overlay">
          <div className="glass-card modal-card">
            <button 
              onClick={() => {
                if (!loading) setIsLoginOpen(false);
              }}
              disabled={loading}
              className="modal-close-btn"
              style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
              <div className="modal-icon-container" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <Sliders className="w-5 h-5" style={{ color: 'var(--color-buy)' }} />
              </div>
              <h3 className="modal-title">Robinhood Local Sync</h3>
              <p className="modal-subtitle" style={{ color: 'var(--color-buy)', fontWeight: '700', marginBottom: '8px' }}>
                🔒 100% Optional & Local Isolation
              </p>
              <p className="modal-subtitle" style={{ fontSize: '10.5px', lineHeight: '1.5', margin: '0 8px' }}>
                Connecting your account is entirely optional! All planning, predicting, and rebalancing tools are fully operational offline. If you choose to sync, your credentials are encrypted and stored only locally on your machine—never sent to any third-party cloud.
              </p>
            </div>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Robinhood Username</label>
                <input
                  type="email"
                  required
                  disabled={loading}
                  placeholder="e.g. name@gmail.com"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
                  className="form-input-text"
                  style={{ opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'default' }}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Robinhood Password</label>
                <input
                  type="password"
                  required
                  disabled={loading}
                  placeholder="••••••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                  className="form-input-text"
                  style={{ opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'default' }}
                />
              </div>

              {loginStatus.status === "mfa_required" && (
                <div className="input-group" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                  <label className="input-label animate-pulse" style={{ color: 'var(--color-buy)', fontWeight: '900', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ShieldAlert style={{ width: 14, height: 14 }} />
                    {loginStatus.challenge_type === "prompt"
                      ? "Robinhood App Push Approval Required"
                      : loginStatus.challenge_type === "email"
                        ? "Enter Email Verification Code"
                        : "Enter SMS Verification Code"}
                  </label>
                  {loginStatus.challenge_type === "prompt" ? (
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', margin: '8px 0', lineHeight: 1.6 }}>
                      Open your <strong style={{ color: 'var(--color-buy)' }}>Robinhood mobile app</strong> and approve the login notification, then click <strong>Confirm Approval</strong> below.
                    </p>
                  ) : (
                    <input
                      type="text"
                      required
                      disabled={loading}
                      placeholder="e.g. 123456"
                      value={loginForm.mfa_code}
                      onChange={(e) => setLoginForm(prev => ({ ...prev, mfa_code: e.target.value }))}
                      className="form-input-text"
                      autoFocus
                      style={{ letterSpacing: '0.25em', textAlign: 'center', fontWeight: '800', opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'default' }}
                    />
                  )}
                </div>
              )}

              {loginStatus.message && (
                <div style={{ 
                  padding: '12px', 
                  borderRadius: '10px', 
                  fontSize: '11px', 
                  fontWeight: '600', 
                  textAlign: 'center',
                  backgroundColor: loginStatus.status === 'success' ? 'rgba(16, 185, 129, 0.05)' :
                                   loginStatus.status === 'mfa_required' ? 'rgba(245, 158, 11, 0.05)' :
                                   'rgba(244, 63, 94, 0.05)',
                  border: loginStatus.status === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' :
                          loginStatus.status === 'mfa_required' ? '1px solid rgba(245, 158, 11, 0.2)' :
                          '1px solid rgba(244, 63, 94, 0.2)',
                  color: loginStatus.status === 'success' ? '#34d399' :
                         loginStatus.status === 'mfa_required' ? '#fbbf24' :
                         '#fb7185'
                }}>
                  {loginStatus.message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ 
                  width: '100%', 
                  padding: '12px', 
                  justifyContent: 'center', 
                  fontSize: '11px', 
                  fontWeight: '900', 
                  borderRadius: '12px',
                  opacity: loading ? 0.65 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading && <RefreshCw className="animate-spin" style={{ width: 14, height: 14 }} />}
                {loginStatus.status === "mfa_required"
                  ? (loginStatus.challenge_type === "prompt" ? "Confirm Approval" : "Verify Code & Link")
                  : (loading ? "Linking Account..." : "Initiate Login")}
              </button>

            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Syncing Loading Overlay */}
      {syncing && (
        <div className="sync-overlay-fullscreen">
          <div className="sync-overlay-card">
            <div className="sync-spinner-ring">
              <div className="sync-spinner-pulse-core" />
              <Brain className="sync-spinner-icon-pulse" style={{ width: 28, height: 28, color: 'var(--color-buy)', position: 'absolute', zIndex: 3 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '950', color: '#fff', letterSpacing: '-0.02em' }}>
                Active Robinhood Link In Progress
              </h3>
              <span style={{ fontSize: '10px', color: 'var(--color-buy)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                ⚡ Synchronizing Live Positions
              </span>
            </div>
            
            <p className="sync-step-fade-text">
              {syncStepIndex === 0 && "Securing encrypted network tunnel to Robinhood APIs..."}
              {syncStepIndex === 1 && "Authenticating local session with secure challenge tokens..."}
              {syncStepIndex === 2 && "Retrieving portfolio asset positions and historical metrics..."}
              {syncStepIndex === 3 && "Calibrating Multi-Horizon quantitative Trade Viability Oracle..."}
              {syncStepIndex === 4 && "Synthesizing AI coaching insights in local Shadow Coach DB..."}
            </p>

            <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.6', margin: '8px 0 0 0', maxWidth: '380px' }}>
              🔒 Your Robinhood session is stored only on this device. Credentials are never synced to other platforms or cloud servers. Please do not refresh or close the application during sync.
            </p>
          </div>
        </div>
      )}

      {/* Premium In-App Toast Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-card toast-${t.type}`} onClick={() => dismissToast(t.id)}>
            <div className="toast-icon-box">
              {t.type === 'success' && <CheckCircle style={{ width: 15, height: 15, color: '#34d399' }} />}
              {t.type === 'error' && <AlertOctagon style={{ width: 15, height: 15, color: '#fb7185' }} />}
              {t.type === 'warning' && <AlertTriangle style={{ width: 15, height: 15, color: '#fbbf24' }} />}
              {t.type === 'info' && <Info style={{ width: 15, height: 15, color: '#a78bfa' }} />}
            </div>
            <div className="toast-body">
              {t.message}
            </div>
            <button className="toast-close" onClick={(e) => { e.stopPropagation(); dismissToast(t.id); }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
            <div className="toast-progress-bar" style={{ animationDuration: `${t.duration}ms` }} />
          </div>
        ))}
      </div>

      {/* Bottom status notifications footer */}
      <footer className="app-footer">
        <div className="status-footer-badge-box">
          <div className={`status-footer-indicator-light ${isSandbox ? 'status-sandbox-light' : 'status-live-light'}`}></div>
          <span>Execution Mode: <strong className={isSandbox ? 'text-highlight-purple' : 'text-highlight-green'}>{isSandbox ? 'Offline Portfolio Tracking' : 'Live Robinhood Connected'}</strong></span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '10px' }}>
          <span>Created by <a href="https://imyourboyroy.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-oracle)', fontWeight: '800', textDecoration: 'underline' }}>Roy Dawson IV</a></span>
          <span style={{ color: 'var(--border-light)' }}>|</span>
          <a href="https://github.com/imyourboyroy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>GitHub Source</a>
        </div>
      </footer>

    </div>
  );
}
