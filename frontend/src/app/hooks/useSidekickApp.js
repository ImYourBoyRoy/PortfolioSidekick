// ./frontend/src/app/hooks/useSidekickApp.js
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  localDb, generateRecommendation, fetchPublicHistoricalPrices, fetchPublicQuote,
  robinhoodClient, evolveWeights, generateViabilityForecast, calculateMarketStrength,
  calculateAtr, DEFAULT_INDICATORS, RISK_PROFILES, INDICATOR_META, getIndicatorConfig,
  fetchMarketNews, formatNewsTime, fetchCongressTrades, formatCongressTradeDate, formatCongressSyncStatus,
  STOCK_ACT_MAX_LAG_DAYS, checkForAppUpdate, openUpdateDownload,
} from '../../serverless';
import { sidekickFetch } from '../../sidekickClient';
import { APP_VERSION } from '../../appVersion';
import { probeDesktopAuth, desktopAuthReadyMessage } from '../../serverless/desktopAuthProbe';
import { getPulseIntervalMs, PULSE_PRESETS, RH_REQUESTS_PER_MINUTE } from '../../serverless/liveQuotes';
import { waitForRobinhoodSession } from '../../serverless/robinhoodAuth';
import { DEMO_HOLDINGS_SEED, SHADOW_COACH_SEED_TICKERS } from '../../serverless/portfolioConstants';
import { buildGuessAnalytics } from '../../serverless/guessAnalytics';
import { enrichHoldingsWithAdvisor } from '../../serverless/holdingAdvisor';
import { attachHoldingIntegrity } from '../../serverless/dataIntegrity';
import { formatCurrency, getCoachActionCutoff } from '../utils/formatters';
import { normalizeAdvisorForUi } from '../utils/holdingDisplay';
import { useChartPaths } from './useChartPaths';

export function useSidekickApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pulsePreset, setPulsePreset] = useState(() => {
    const settings = localDb.getSettings();
    return settings.pulsePreset && PULSE_PRESETS[settings.pulsePreset] ? settings.pulsePreset : 'balanced';
  });
  const pulseIntervalMs = getPulseIntervalMs({ pulsePreset });
  const persistPulsePreset = useCallback((preset) => {
    if (!PULSE_PRESETS[preset]) return;
    setPulsePreset(preset);
    localDb.saveSettings({ pulsePreset: preset });
  }, []);

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
      queueMicrotask(() => {
        void fetchMarketStrength();
      });
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

  // Advanced Settings: configurable indicator engine + risk/goal profile
  const [indicatorSettings, setIndicatorSettings] = useState(() => getIndicatorConfig());
  const [riskProfile, setRiskProfile] = useState(() => localDb.getSettings().riskProfile || "balanced");

  // Market News state
  const [newsData, setNewsData] = useState(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [congressData, setCongressData] = useState(null);
  const [congressLoading, setCongressLoading] = useState(false);
  const [relativeTimeNow, setRelativeTimeNow] = useState(() => Date.now());
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  
  // Visual Coach mode for Roy's father
  const [isCoachMode, setIsCoachMode] = useState(true); // Default to True to help Roy's father immediately
  
  // Collapsible state for manual SQLite adjusts
  const [showManualAdjust, setShowManualAdjust] = useState(false);

  // Chart Hover crosshair state

  // Custom Oracle Guesses state
  const [guesses, setGuesses] = useState({ pending: [], completed: [] });
  const [analytics, setAnalytics] = useState(null);
  
  // Forms & Modal states
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "", mfa_code: "" });
  const [loginStatus, setLoginStatus] = useState({ status: "", message: "" });
  const [desktopAuthProbe, setDesktopAuthProbe] = useState(null);
  const loginSucceededRef = useRef(false);
  const loginGraceUntilRef = useRef(0);
  const mfaPollInFlightRef = useRef(false);
  const portfolioRestoreRef = useRef({ profileId: null, attempted: false });
  const quoteFallbackRef = useRef({ active: false, lastToastAt: 0 });
  const portfolioBootstrappingRef = useRef(false);
  const [portfolioBootstrapping, setPortfolioBootstrapping] = useState(false);
  const [hasCachedRobinhoodSession, setHasCachedRobinhoodSession] = useState(false);
  const [autoRestoreNonce, setAutoRestoreNonce] = useState(0);
  const [equityDiagnostic, setEquityDiagnostic] = useState(null);
  const [equityDiagnosticLoading, setEquityDiagnosticLoading] = useState(false);
  const [hiddenHoldingsNonce, setHiddenHoldingsNonce] = useState(0);
  const [autoHideWarrants, setAutoHideWarrantsState] = useState(
    () => localDb.getSettings().autoHideWarrants !== false,
  );

  const hiddenHoldings = useMemo(() => {
    void hiddenHoldingsNonce;
    if (!activeProfile) return [];
    return localDb.getHiddenTickers(activeProfile.id);
  }, [activeProfile, hiddenHoldingsNonce]);

  const refreshHiddenHoldings = useCallback(() => {
    setHiddenHoldingsNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void probeDesktopAuth().then((probe) => {
      if (!cancelled) setDesktopAuthProbe(probe);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  
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
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Shadow Coach "Watch What I Do" states
  const [shadowCoachData, setShadowCoachData] = useState(null);
  const [actionHistory, setActionHistory] = useState([]);
  const [coachTimeFilter, setCoachTimeFilter] = useState("all"); // "7d", "30d", "90d", "all"

  // Accessibility — Font Sizing Engine & High Contrast (Always enabled by default)
  const [fontSizeOffset, setFontSizeOffset] = useState(() => {
    const saved = localDb.getSettings();
    return saved.fontSize || 0;
  });
  const highContrast = true;

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
    if (!syncing) return undefined;
    const interval = setInterval(() => {
      setSyncStepIndex(prev => (prev + 1) % 5);
    }, 1500);
    return () => clearInterval(interval);
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

  // ΓöÇΓöÇ Advanced Settings handlers (per-profile) ΓöÇΓöÇ
  const persistIndicatorSettings = useCallback((nextIndicators, nextProfile) => {
    setIndicatorSettings(nextIndicators);
    setRiskProfile(nextProfile);
    if (activeProfile) {
      localDb.saveIndicatorSettings(activeProfile.id, { indicators: nextIndicators, riskProfile: nextProfile });
    }
  }, [activeProfile]);

  const applyRiskProfile = useCallback((profileKey) => {
    const preset = RISK_PROFILES[profileKey];
    if (!preset) return;
    const next = { ...DEFAULT_INDICATORS, ...preset.settings };
    persistIndicatorSettings(next, profileKey);
    showToast(`Applied "${preset.label}" risk profile to ${activeProfile?.name || "this profile"}. Analysis recalculated.`, "success");
  }, [persistIndicatorSettings, showToast, activeProfile]);

  const updateIndicatorField = useCallback((key, rawValue) => {
    const meta = INDICATOR_META[key];
    let value = parseFloat(rawValue);
    if (isNaN(value)) return;
    if (meta) value = Math.max(meta.min, Math.min(meta.max, value));
    setIndicatorSettings(prev => {
      const next = { ...prev, [key]: value };
      // Editing any value switches the profile to "custom" so it's clear it's hand-tuned.
      if (activeProfile) localDb.saveIndicatorSettings(activeProfile.id, { indicators: next, riskProfile: "custom" });
      return next;
    });
    setRiskProfile("custom");
  }, [activeProfile]);

  const resetIndicatorDefaults = useCallback(() => {
    persistIndicatorSettings({ ...DEFAULT_INDICATORS }, "balanced");
    showToast("Indicators reset to Balanced defaults.", "info");
  }, [persistIndicatorSettings, showToast]);

  // ΓöÇΓöÇ Market News loader ΓöÇΓöÇ
  const loadMarketNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const extra = [
        ...holdings.map(h => h.ticker),
        ...watchlist.map(w => w.ticker),
      ];
      const result = await fetchMarketNews(extra);
      setNewsData(result);
    } catch {
      setNewsData({
        buckets: { today: [], week: [], month: [], year: [] },
        total: 0,
        fetchedAt: Date.now(),
        error: "Unable to load market news right now.",
      });
    } finally {
      setNewsLoading(false);
    }
  }, [holdings, watchlist]);

  const openNewsLink = useCallback((url) => {
    if (!url) return;
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // no-op if the platform blocks external windows
    }
  }, []);

  const openRobinhoodLogin = useCallback(() => {
    if (!activeProfile) {
      showToast('Create a profile first.', 'warning');
      return;
    }
    setLoginForm((prev) => ({
      ...prev,
      username: activeProfile.robinhood_username || prev.username,
      password: '',
      mfa_code: '',
    }));
    setLoginStatus({ status: '', message: '' });
    setLoading(false);
    setIsLoginOpen(true);
  }, [activeProfile, showToast]);

  const checkForUpdates = useCallback(async (force = false) => {
    setUpdateChecking(true);
    try {
      const result = await checkForAppUpdate(APP_VERSION, { force });
      setUpdateInfo(result);
      if (result.updateAvailable) {
        showToast(`Update v${result.latestVersion} is available on GitHub.`, 'info', 9000);
      } else if (force && !result.error) {
        showToast(`You are on the latest release (v${result.latestVersion || APP_VERSION}).`, 'success');
      }
    } catch (err) {
      const message = err?.message || 'Could not reach GitHub releases.';
      setUpdateInfo({ error: message, currentVersion: APP_VERSION, updateAvailable: false });
      if (force) showToast(message, 'warning');
    } finally {
      setUpdateChecking(false);
    }
  }, [showToast]);

  const downloadLatestUpdate = useCallback(() => {
    if (updateInfo?.downloadUrl) {
      openUpdateDownload(updateInfo.downloadUrl);
      return;
    }
    if (updateInfo?.releaseUrl) {
      openUpdateDownload(updateInfo.releaseUrl);
    }
  }, [updateInfo]);

  const loadCongressTrades = useCallback(async (force = false) => {
    setCongressLoading(true);
    try {
      const result = await fetchCongressTrades({ force });
      setCongressData(result);
    } catch {
      setCongressData({
        trades: [],
        total: 0,
        fetchedAt: Date.now(),
        error: 'Unable to load congressional trade disclosures.',
        disclaimer: '',
      });
    } finally {
      setCongressLoading(false);
    }
  }, []);

  const formatRelativeTime = useCallback(
    (timestamp) => formatNewsTime(timestamp, relativeTimeNow),
    [relativeTimeNow]
  );

  const congressSyncStatus = useMemo(
    () => formatCongressSyncStatus(congressData, relativeTimeNow),
    [congressData, relativeTimeNow]
  );

  // Tick relative timestamps while the News tab is visible.
  useEffect(() => {
    if (activeTab !== 'news') return undefined;
    const id = setInterval(() => setRelativeTimeNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [activeTab]);

  // Auto-refresh congressional disclosures when the local cache window expires.
  useEffect(() => {
    if (activeTab !== 'news' || congressLoading || !congressData?.nextRefreshAt) return undefined;
    const delay = Math.max(0, congressData.nextRefreshAt - Date.now());
    const timer = setTimeout(() => void loadCongressTrades(true), delay);
    return () => clearTimeout(timer);
  }, [activeTab, congressData?.nextRefreshAt, congressLoading, loadCongressTrades]);

  // Poll GitHub Releases for a newer build (cached ~4h).
  useEffect(() => {
    const timer = setTimeout(() => void checkForUpdates(false), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot startup update check
  }, []);

  // Load market news the first time the News tab is opened.
  useEffect(() => {
    if (activeTab === "news" && !newsData && !newsLoading) {
      queueMicrotask(() => {
        void loadMarketNews();
      });
    }
    if (activeTab === "news" && !congressData && !congressLoading) {
      queueMicrotask(() => {
        void loadCongressTrades();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot load on tab open
  }, [activeTab]);

  // Load the active profile's saved indicator/risk settings whenever it changes.
  useEffect(() => {
    if (!activeProfile) return;
    const saved = localDb.getIndicatorSettings(activeProfile.id);
    const cfg = getIndicatorConfig(activeProfile.id);
    queueMicrotask(() => {
      setIndicatorSettings(cfg);
      setRiskProfile(saved?.riskProfile || "balanced");
    });
  }, [activeProfile]);

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
  const memoizedChartPaths = useChartPaths(chartData, chartOverlays, indicatorSettings);

  // Get all unique tickers from holdings and watchlist for quick cycle navigation
  const allAvailableTickers = useMemo(() => {
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

  // Sandbox-only demo seeder — never inject demo holdings into a linked Robinhood profile.
  const handleSeedMockAssets = async () => {
    if (!activeProfile) return;
    if (activeProfile.robinhood_username) {
      showToast('Demo seed blocked: this profile is linked to Robinhood. Sync real holdings or create a separate offline profile.', 'warning', 8000);
      return;
    }
    if (!isSandbox && !window.confirm('Seed sandbox demo assets? This replaces holdings with labeled demo data for offline exploration only.')) {
      return;
    }
    setTimeout(async () => {
      try {
        const mockPositions = await Promise.all(DEMO_HOLDINGS_SEED.map(async (def) => {
          let livePrice = null;
          try {
            livePrice = await fetchPublicQuote(def.ticker);
          } catch (err) {
            console.warn(`Failed to fetch live quote for ${def.ticker}:`, err);
          }
          if (!(livePrice > 0)) {
            return null;
          }
          return {
            ticker: def.ticker,
            shares: def.shares,
            avg_buy_price: def.avg_buy_price,
            current_price: livePrice,
          };
        }));
        const seeded = mockPositions.filter(Boolean);
        if (seeded.length === 0) {
          showToast('Demo seed failed: could not fetch live quotes. Check your connection.', 'error');
          return;
        }

        await sidekickFetch('/portfolio/holdings/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: activeProfile.id }),
        }).catch((err) => console.error('Holdings clear failed:', err));

        for (const pos of seeded) {
          localDb.updateHolding(activeProfile.id, pos.ticker, pos.shares, pos.avg_buy_price, pos.current_price);
          if (SHADOW_COACH_SEED_TICKERS.includes(pos.ticker)) {
            localDb.logAction(activeProfile.id, 'BUY', pos.ticker, pos.shares, pos.avg_buy_price, 'Sandbox demo position (not Robinhood data)');
          }
        }
        setIsSandbox(true);

        // Concurrently load all other endpoints
        await Promise.all([
          fetchPortfolio(),
          fetchGuesses(),
          fetchAnalytics(),
          fetchWatchlist(),
          fetchShadowCoachData(Date.now()),
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
      }
    }, 1200);
  };

  const refreshConnectionMode = async (profile) => {
    if (!profile) {
      setIsSandbox(true);
      setHasCachedRobinhoodSession(false);
      return;
    }
    try {
      const statusRes = await sidekickFetch(`/auth/status?profile_id=${profile.id}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.authenticated) {
          setIsSandbox(false);
          setHasCachedRobinhoodSession(true);
          if (statusData.username && !profile.robinhood_username) {
            const linked = { ...profile, robinhood_username: statusData.username };
            setActiveProfile(linked);
            setProfiles((prev) => prev.map((p) => (
              p.id === profile.id ? { ...p, robinhood_username: statusData.username } : p
            )));
          }
          return;
        }
      }
    } catch {
      // Best-effort auth probe.
    }
    setHasCachedRobinhoodSession(!!profile.robinhood_username);
    setIsSandbox(!profile.robinhood_username);
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
        
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend profiles fetch failed, reading localDb:", backendErr.message);
        data = localDb.getProfiles();
      }

      setProfiles(data);
      if (data.length > 0) {
        let nextProfile = null;
        if (selectNewId) {
          nextProfile = data.find(p => p.id === selectNewId) || null;
        }
        if (!nextProfile) {
          const currentExists = activeProfile && data.find(p => p.id === activeProfile.id);
          nextProfile = currentExists || data[0];
        }
        setActiveProfile(nextProfile);
        await refreshConnectionMode(nextProfile);
      } else {
        setActiveProfile(null);
        setIsSandbox(true);
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
    } catch {
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
    } catch {
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
        } catch {
          // Auth status probe is best-effort before holdings fetch.
        }

        if (isAuthenticated) {
          setHasCachedRobinhoodSession(true);
        }

        if (activeProfile.robinhood_username && !isAuthenticated) {
          setIsSandbox(true);
          const inLoginGrace = Date.now() < loginGraceUntilRef.current;
          const bootstrapping = portfolioBootstrappingRef.current;
          if (!isLoginOpen && !loginSucceededRef.current && !inLoginGrace && !bootstrapping) {
            showToast("Robinhood session expired. Tap Sync Account to reconnect, or stay offline.", "warning");
            setLoginForm((prev) => ({
              ...prev,
              username: activeProfile.robinhood_username,
              password: "",
              mfa_code: "",
            }));
          }
        } else if (isAuthenticated) {
          setIsSandbox(false);
        }

        const res = await sidekickFetch(`/portfolio/holdings?profile_id=${activeProfile.id}`);
        if (!res.ok) throw new Error("API holdings endpoint non-OK");
        const resData = await res.json();
        dbHoldings = resData.holdings || [];
        const liveMode = resData.mode === 'live' || isAuthenticated;
        setIsSandbox(!liveMode);

        dbHoldings.forEach(h => {
          if (h.total_value == null) h.total_value = h.shares * h.current_price;
          if (h.pnl == null) h.pnl = (h.current_price - h.avg_buy_price) * h.shares;
          if (h.pnl_pct == null) {
            h.pnl_pct = h.avg_buy_price > 0 ? ((h.current_price - h.avg_buy_price) / h.avg_buy_price) * 100 : 0;
          }
        });

        setHoldings(dbHoldings);
        const preferredTicker = dbHoldings.find((h) => h.quote_status === 'live')?.ticker
          || dbHoldings.find((h) => !h.non_quotable)?.ticker
          || dbHoldings[0]?.ticker;
        if (preferredTicker) {
          setSelectedTicker((current) => {
            const match = dbHoldings.find((h) => h.ticker.toUpperCase() === String(current || '').toUpperCase());
            if (!match || match.non_quotable || match.quote_status === 'non_quotable') {
              return preferredTicker;
            }
            return current;
          });
        }
        setSummary({
          total_equity: resData.total_equity ?? 0,
          total_cost: resData.total_cost ?? 0,
          overall_pnl: resData.overall_pnl ?? 0,
          overall_pnl_pct: resData.overall_pnl_pct ?? 0,
          positions_equity: resData.positions_equity,
          cash_balance: resData.cash_balance,
          rh_reported_equity: resData.rh_reported_equity,
          computed_equity: resData.computed_equity,
          quote_marks_equity: resData.quote_marks_equity,
          quote_marks_delta: resData.quote_marks_delta,
          rh_portfolio_market_value: resData.rh_portfolio_market_value,
          equity_source: resData.equity_source,
          equity_delta: resData.equity_delta,
          quote_source: resData.quote_source,
          quote_mark_label: resData.quote_mark_label ?? null,
          rh_quote_count: resData.rh_quote_count ?? 0,
          yahoo_quote_count: resData.yahoo_quote_count ?? 0,
          yahoo_fallback_tickers: resData.yahoo_fallback_tickers ?? [],
          using_yahoo_fallback: resData.using_yahoo_fallback === true,
          rh_cash_breakdown: resData.rh_cash_breakdown ?? null,
          stale_price_count: resData.stale_price_count ?? 0,
          has_verified_live_prices: resData.has_verified_live_prices === true,
        });

        if (liveMode && resData.using_yahoo_fallback) {
          const tickers = (resData.yahoo_fallback_tickers || []).slice(0, 4).join(', ');
          const suffix = (resData.yahoo_fallback_tickers || []).length > 4 ? '…' : '';
          const shouldToast = !quoteFallbackRef.current.active
            || Date.now() - quoteFallbackRef.current.lastToastAt > 120_000;
          if (shouldToast) {
            showToast(
              `Yahoo fallback for ${resData.yahoo_quote_count} symbol(s)${tickers ? ` (${tickers}${suffix})` : ''}. Tap Sync Account to refresh Robinhood marks.`,
              'warning',
              9000,
            );
            quoteFallbackRef.current.lastToastAt = Date.now();
          }
          quoteFallbackRef.current.active = true;
        } else {
          quoteFallbackRef.current.active = false;
        }
        if (resData.sector_concentrations) {
          setSectorConcentrations(resData.sector_concentrations);
        }
        if (dbHoldings && dbHoldings.length > 0) {
          const now = new Date();
          setLastSyncTime(now);
          localStorage.setItem(`st_last_sync_${activeProfile.id}`, now.toISOString());
        }
        return;
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend holdings fetch failed, reading localDb:", backendErr.message);
        const rawHoldings = localDb.getHoldings(activeProfile.id).map((h) => {
          const integrity = attachHoldingIntegrity(h, 'stored');
          const price = integrity.price_stale ? 0 : (integrity.current_price || 0);
          const value = integrity.price_stale ? 0 : h.shares * price;
          const cost = h.shares * h.avg_buy_price;
          return {
            ...h,
            current_price: integrity.price_stale ? null : price,
            price_stale: integrity.price_stale,
            price_source: integrity.price_source,
            total_value: value,
            total_cost: cost,
            pnl: integrity.price_stale ? null : value - cost,
            pnl_pct: integrity.price_stale || cost <= 0 ? null : ((value - cost) / cost) * 100,
          };
        });
        dbHoldings = await enrichHoldingsWithAdvisor(activeProfile.id, rawHoldings);
        setIsSandbox(true);
      }

      let totalEquity = 0;
      let totalCost = 0;
      const sectorConcentrations = {};

      dbHoldings.forEach(h => {
        if (h.total_value == null) h.total_value = h.shares * (h.current_price || 0);
        if (h.pnl == null && h.current_price != null) h.pnl = (h.current_price - h.avg_buy_price) * h.shares;
        if (h.pnl_pct == null && h.avg_buy_price > 0 && h.current_price != null) {
          h.pnl_pct = ((h.current_price - h.avg_buy_price) / h.avg_buy_price) * 100;
        }

        const equity = h.total_value;
        const cost = h.shares * h.avg_buy_price;
        totalEquity += equity;
        totalCost += cost;

        const tech = ["NVDA", "AAPL", "MSFT", "AMD", "AVGO", "PLTR", "TSM", "INTC"];
        const quantum = ["QBTS", "RGTI", "IONQ"];
        const energy = ["NUKZ"];
        let sector;
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

  const runEquityDiagnostic = async (saveToDisk = true) => {
    if (!activeProfile) return null;
    setEquityDiagnosticLoading(true);
    try {
      const path = `/portfolio/diagnostics?profile_id=${activeProfile.id}${saveToDisk ? '&save=1' : ''}`;
      const res = await sidekickFetch(path);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Diagnostic request failed');
      setEquityDiagnostic(data);
      if (saveToDisk && data.saved_to) {
        showToast(`Equity diagnostic saved to ${data.saved_to}`, 'success', 9000);
      } else {
        showToast('Equity diagnostic complete — see Advanced Settings for details.', 'success');
      }
      return data;
    } catch (err) {
      console.error('Equity diagnostic failed:', err);
      showToast(err.message || 'Equity diagnostic failed.', 'error');
      return null;
    } finally {
      setEquityDiagnosticLoading(false);
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
      
      // Process pending guesses
      const pending = data.pending.map(g => {
        const hold = holdings.find(h => h.ticker.toUpperCase() === g.ticker.toUpperCase());
        const currentPrice = hold && !hold.price_stale && hold.current_price != null
          ? hold.current_price
          : g.initial_price;
        
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
          actual_end_price: g.actual_end_price ?? null,
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
        setAnalytics({
          ...analyticsData,
          total_predictions: (analyticsData.completed_count || 0) + (analyticsData.pending_count || 0),
          completed_predictions: analyticsData.completed_count || 0,
          hit_predictions: analyticsData.hit_predictions ?? 0,
          missed_predictions: analyticsData.missed_predictions ?? 0,
          accuracy_rate: analyticsData.overall_accuracy ?? null,
          evolution_factor: analyticsData.has_data
            ? ((analyticsData.hit_predictions / analyticsData.completed_count) - 0.5) * 0.10
            : 0.0,
        });
        return;
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend analytics fetch failed, calculating locally:", backendErr.message);
        data = localDb.getGuesses(activeProfile.id);
      }
      
      const built = buildGuessAnalytics(data);
      setAnalytics({
        ...built,
        total_predictions: built.completed_count + built.pending_count,
        completed_predictions: built.completed_count,
        hit_predictions: built.hit_predictions ?? 0,
        missed_predictions: built.missed_predictions ?? 0,
        accuracy_rate: built.overall_accuracy,
        evolution_factor: built.has_data
          ? ((built.hit_predictions / built.completed_count) - 0.5) * 0.10
          : 0.0,
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
      const holdingMatch = holdings.find((h) => h.ticker.toUpperCase() === selectedTicker.toUpperCase());
      const livePrice = holdingMatch && !holdingMatch.price_stale && holdingMatch.current_price > 0
        ? holdingMatch.current_price
        : (dataHist.length > 0 ? dataHist[dataHist.length - 1].close_price : null);
      
      if (livePrice != null) {
        try {
          localDb.resolveGuesses(activeProfile.id, selectedTicker, livePrice);
        } catch {
          // Guess resolution is best-effort during chart refresh.
        }
      }
      
      let dataAdv;
      try {
        const res = await sidekickFetch(`/advisor/recommendation?profile_id=${activeProfile.id}&ticker=${selectedTicker}`);
        if (!res.ok) throw new Error("API recommendation non-OK");
        dataAdv = await res.json();
      } catch (backendErr) {
        console.warn("Hybrid Fallback: Backend recommendation failed, generating locally:", backendErr.message);
        dataAdv = generateRecommendation(activeProfile.id, selectedTicker, dataHist, livePrice);
      }
      
      setAdvisorData(normalizeAdvisorForUi(dataAdv));
      
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
        } catch {
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
  const fetchShadowCoachData = async (referenceTimeMs) => {
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
          const cutoff = getCoachActionCutoff(coachTimeFilter, referenceTimeMs);
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
    if (activeProfile) {
      queueMicrotask(() => {
        void fetchShadowCoachData(Date.now());
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchShadowCoachData omitted to avoid refetch loops
  }, [coachTimeFilter, activeProfile]);

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
    } catch {
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

  // Load profiles on start
  useEffect(() => {
    queueMicrotask(() => {
      void fetchProfiles();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);

  useEffect(() => {
    portfolioBootstrappingRef.current = portfolioBootstrapping;
  }, [portfolioBootstrapping]);

  // Fetch holdings, guesses, and chart details whenever profile changes
  useEffect(() => {
    if (!activeProfile) return;

    if (portfolioRestoreRef.current.profileId !== activeProfile.id) {
      portfolioRestoreRef.current = { profileId: activeProfile.id, attempted: false };
    }

    const savedSync = localStorage.getItem(`st_last_sync_${activeProfile.id}`);
    queueMicrotask(() => {
      setLastSyncTime(savedSync ? new Date(savedSync) : null);
    });

    const loadProfileData = async () => {
      try {
        let authenticated = false;
        try {
          const statusRes = await sidekickFetch(`/auth/status?profile_id=${activeProfile.id}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            authenticated = !!statusData.authenticated;
            setHasCachedRobinhoodSession(authenticated || !!activeProfile.robinhood_username);
            if (authenticated) setIsSandbox(false);
          }
        } catch {
          setHasCachedRobinhoodSession(!!activeProfile.robinhood_username);
        }

        const shouldAutoRestore = authenticated && !portfolioRestoreRef.current.attempted;

        if (shouldAutoRestore) {
          portfolioRestoreRef.current.attempted = true;
          setPortfolioBootstrapping(true);
          setAutoRestoreNonce((n) => n + 1);
          return;
        }

        await fetchPortfolio();

        await Promise.all([
          fetchGuesses(),
          fetchAnalytics(),
          fetchWatchlist(),
          fetchShadowCoachData(Date.now()),
          fetchMarketStrength(),
        ]);
      } catch (err) {
        console.error("Error loading profile data:", err);
      }
    };
    void loadProfileData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profile-scoped reload; fetch helpers omitted to avoid render loops
  }, [activeProfile]);

  useEffect(() => {
    if (activeProfile && selectedTicker) {
      queueMicrotask(() => {
        void fetchStockHistoryAndAdvisor();
        void fetchStrategyBrackets();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ticker/profile scoped chart reload
  }, [activeProfile, selectedTicker]);

  // Live quote pulse — refresh holdings on cadence when Robinhood session is active.
  useEffect(() => {
    if (!activeProfile || isSandbox) return undefined;
    const interval = setInterval(() => {
      if (document.hidden) return;
      void fetchPortfolio();
    }, pulseIntervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pulse keyed on profile + cadence
  }, [activeProfile, isSandbox, pulseIntervalMs]);

  // Background refresh for watchlist and strength (lower frequency).
  useEffect(() => {
    let interval;
    if (activeProfile) {
      interval = setInterval(() => {
        if (document.hidden) return;
        void fetchWatchlist();
        void fetchMarketStrength();
      }, 60000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interval refresh uses latest fetch closures by design
  }, [activeProfile, strengthTimeframe, strengthSector]);

  // Sync with Robinhood
  const triggerSync = async (overrideSandbox = null, options = {}) => {
    if (!activeProfile) return;

    let canSyncLive = false;
    if (options.afterLogin) {
      canSyncLive = await waitForRobinhoodSession(activeProfile.id, 24, 250);
    } else {
      try {
        const statusRes = await sidekickFetch(`/auth/status?profile_id=${activeProfile.id}`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.authenticated) {
            canSyncLive = true;
            setIsSandbox(false);
            if (statusData.username && !activeProfile.robinhood_username) {
              setActiveProfile((prev) => (prev ? { ...prev, robinhood_username: statusData.username } : prev));
              setProfiles((prev) => prev.map((p) => (
                p.id === activeProfile.id ? { ...p, robinhood_username: statusData.username } : p
              )));
            }
          }
        }
      } catch {
        // Fall through to login prompt when no live session.
      }
    }

    if (!canSyncLive) {
      if (!options.silent && !options.bootstrap) {
        if (!options.afterLogin) {
          openRobinhoodLogin();
          const hadSession = Boolean(activeProfile.robinhood_username);
          showToast(
            hadSession
              ? 'Robinhood session expired. Sign in again to sync live holdings.'
              : 'Sign in with Robinhood to sync your stock and ETF positions.',
            'info'
          );
        } else {
          showToast("Connected, but the encrypted vault is still saving. Tap Sync Account once more.", "warning", 8000);
        }
      }
      return;
    }

    setSyncStepIndex(0);
    setSyncing(true);
    const targetSandbox = overrideSandbox !== null ? overrideSandbox : false;
    try {
      const data = await robinhoodClient.syncHoldings(activeProfile.id, targetSandbox);

      if (!options.silent) {
        if (data.synced_count > 0) {
          showToast(`Successfully synced ${data.synced_count} active positions from Robinhood!`, "success");
        } else {
          showToast("Sync completed: 0 active stock holdings found. Options and crypto are not imported — add stocks manually or paste a holdings list.", "warning", 7000);
        }
      }

      // Close the fullscreen overlay as soon as Robinhood holdings are fetched.
      setSyncing(false);
      setSyncStepIndex(0);

      loginGraceUntilRef.current = Date.now() + 30_000;

      refreshHiddenHoldings();

      await Promise.all([
        fetchPortfolio(),
        fetchGuesses(),
        fetchAnalytics(),
        fetchWatchlist(),
        fetchShadowCoachData(Date.now()),
        fetchMarketStrength(),
        selectedTicker ? fetchStockHistoryAndAdvisor() : Promise.resolve(),
      ]);
      void runEquityDiagnostic(true);
    } catch (err) {
      console.error("Sync error:", err);
      showToast(err.message || "Error linking with Robinhood client.", "error");
      setSyncing(false);
      setSyncStepIndex(0);
    }
  };

  useEffect(() => {
    if (autoRestoreNonce === 0 || !activeProfile) return undefined;
    let cancelled = false;
    const runRestore = async () => {
      try {
        await triggerSync(null, { afterLogin: true, silent: true, bootstrap: true });
      } catch (err) {
        if (!cancelled) console.warn('Portfolio auto-restore failed:', err);
      } finally {
        if (!cancelled) setPortfolioBootstrapping(false);
      }
    };
    void runRestore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot restore keyed on nonce
  }, [autoRestoreNonce, activeProfile]);

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
        } catch {
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
    } catch {
      alert("Failed to import clipboard.");
    } finally {
      setLoading(false);
    }
  };

  const handleStayOffline = () => {
    setIsLoginOpen(false);
    setLoginForm({ username: "", password: "", mfa_code: "" });
    setLoginStatus({ status: "", message: "" });
    setLoading(false);
    setIsSandbox(true);
    showToast("Staying offline. Add holdings manually, paste a list, or seed sandbox assets.", "info");
  };

  const applyLoginResult = async (data) => {
    if (loginSucceededRef.current) {
      return;
    }
    if (data.status === "success") {
      loginSucceededRef.current = true;
      loginGraceUntilRef.current = Date.now() + 45_000;
      mfaPollInFlightRef.current = false;
      const newSandbox = data.mode === "sandbox";
      setIsSandbox(newSandbox);
      setIsLoginOpen(false);
      setLoginForm({ username: "", password: "", mfa_code: "" });
      setLoginStatus({ status: "", message: "" });
      setLoading(false);
      showToast(data.message || "Connected to Robinhood! Syncing holdings…", "success");
      if (activeProfile?.id) {
        await fetchProfiles(activeProfile.id);
      }
      await triggerSync(newSandbox, { afterLogin: true });
      return;
    }
    if (data.status === "mfa_required") {
      setLoginStatus({
        status: "mfa_required",
        message: data.message || "Complete Robinhood verification below.",
        challenge_type: data.challenge_type || "prompt",
        challenge_issued: data.challenge_issued ?? false,
      });
      setLoading(false);
      return;
    }
    setLoginStatus({ status: "error", message: data.message || "Authentication failed." });
    setLoading(false);
  };

  // Robinhood Secure Login — Phase 1 only; MFA completion is handled by the poll loop below.
  const handleLogin = async (e) => {
    e.preventDefault();
    if (
      loginStatus.status !== "mfa_required" &&
      desktopAuthProbe?.isTauri &&
      !(desktopAuthProbe.rustAuth && desktopAuthProbe.authLogExists)
    ) {
      setLoginStatus({
        status: "error",
        message: desktopAuthReadyMessage(desktopAuthProbe),
      });
      return;
    }
    if (loginStatus.status === "mfa_required") {
      const needsCode = ["sms", "email"].includes(loginStatus.challenge_type);
      if (needsCode && loginStatus.challenge_issued) {
        if (!loginForm.mfa_code?.trim()) {
          setLoginStatus((prev) => ({
            ...prev,
            message: `Enter the ${loginStatus.challenge_type} verification code below.`,
          }));
          return;
        }
        setLoading(true);
        try {
          const data = await robinhoodClient.login(
            activeProfile.id,
            loginForm.username,
            loginForm.password,
            loginForm.mfa_code.trim(),
            { continueMfa: true }
          );
          await applyLoginResult(data);
        } catch (err) {
          setLoginStatus({ status: "error", message: err.message || "Verification failed. Please restart login." });
          setLoading(false);
        }
      }
      return;
    }

    loginSucceededRef.current = false;
    loginGraceUntilRef.current = 0;
    mfaPollInFlightRef.current = false;
    setLoading(true);
    setLoginStatus({ status: "processing", message: "Contacting Robinhood API (native Rust)..." });
    const slowTimer = setTimeout(() => {
      setLoginStatus((prev) => (
        prev.status === "processing"
          ? { ...prev, message: "Still contacting Robinhood (native Rust HTTP, up to 45s). Check auth.log for the latest step." }
          : prev
      ));
    }, 4000);

    try {
      const data = await robinhoodClient.login(
        activeProfile.id,
        loginForm.username,
        loginForm.password,
        null
      );
      await applyLoginResult(data);
    } catch (err) {
      const hint = err.message?.includes("timed out") || err.message?.includes("auth.log")
        ? " Open <exe>/data/auth.log and share the last 5 lines."
        : "";
      setLoginStatus({
        status: "error",
        message: (err.message || "Robinhood sign-in failed. Check credentials or stay offline.") + hint,
      });
      setLoading(false);
    } finally {
      clearTimeout(slowTimer);
    }
  };

  // Dynamic MFA polling — mirrors robin_stocks push loop + SMS issued detection.
  useEffect(() => {
    if (loginStatus.status !== "mfa_required" || !activeProfile) return undefined;

    let cancelled = false;

    const pollMfa = async () => {
      if (cancelled || loginSucceededRef.current || mfaPollInFlightRef.current) return;
      mfaPollInFlightRef.current = true;
      try {
        const needsCode = ["sms", "email"].includes(loginStatus.challenge_type);
        const code = needsCode && loginStatus.challenge_issued
          ? (loginForm.mfa_code?.trim() || null)
          : null;
        const data = await robinhoodClient.login(
          activeProfile.id,
          loginForm.username,
          loginForm.password,
          code,
          { continueMfa: true }
        );
        if (cancelled || loginSucceededRef.current) return;
        await applyLoginResult(data);
      } catch {
        // Transient network blip during polling; keep waiting.
      } finally {
        mfaPollInFlightRef.current = false;
      }
    };

    void pollMfa();
    const interval = setInterval(() => {
      void pollMfa();
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll keyed on MFA state
  }, [loginStatus.status, loginStatus.challenge_type, loginStatus.challenge_issued, loginForm.mfa_code, activeProfile]);

  // Robinhood Secure Logout & Wiping
  const handleLogout = async () => {
    if (!activeProfile) return;
    setLoading(true);
    try {
      const data = await robinhoodClient.logout(activeProfile.id, isSandbox);
      showToast(data.message || "Successfully logged out and wiped session!", "success");
      loginSucceededRef.current = false;
      loginGraceUntilRef.current = 0;
      setIsSandbox(true);
      await fetchProfiles(activeProfile.id);
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
    } catch {
      showToast("Failed to submit guess.", "error");
    }
  };

  const handleHideHolding = async (ticker) => {
    if (!activeProfile || !ticker) return;
    const symbol = ticker.toUpperCase().trim();
    try {
      const res = await sidekickFetch('/portfolio/holdings/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: activeProfile.id, ticker: symbol }),
      });
      if (!res.ok) throw new Error('API hide holding non-OK');
    } catch (backendErr) {
      console.warn('Hybrid Fallback: hide holding via localDb:', backendErr.message);
      localDb.hideTicker(activeProfile.id, symbol);
    }
    refreshHiddenHoldings();
    showToast(`${symbol} hidden from dashboard. Re-sync will not re-import it until you unhide in settings.`, 'success', 6000);
    await fetchPortfolio();
  };

  const handleUnhideHolding = async (ticker) => {
    if (!activeProfile || !ticker) return;
    const symbol = ticker.toUpperCase().trim();
    try {
      const res = await sidekickFetch('/portfolio/holdings/unhide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: activeProfile.id, ticker: symbol }),
      });
      if (!res.ok) throw new Error('API unhide holding non-OK');
    } catch (backendErr) {
      console.warn('Hybrid Fallback: unhide holding via localDb:', backendErr.message);
      localDb.unhideTicker(activeProfile.id, symbol);
    }
    refreshHiddenHoldings();
    showToast(`${symbol} restored — tap Sync Account to re-import from Robinhood.`, 'success', 5000);
    await fetchPortfolio();
  };

  const setAutoHideWarrants = (enabled) => {
    setAutoHideWarrantsState(enabled);
    localDb.saveSettings({ autoHideWarrants: enabled });
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
    } catch {
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
    } catch {
      alert("Evolution failed.");
    } finally {
      setLoading(false);
    }
  };

  return {
    activeTab, setActiveTab, strengthTimeframe, setStrengthTimeframe, strengthSector, setStrengthSector,
    marketStrengthData, strengthLoading, coachLoading, sandboxWatchlist, setSandboxWatchlist,
    newSandboxTicker, setNewSandboxTicker, newSandboxTargetPrice, setNewSandboxTargetPrice,
    fetchMarketStrength, profiles, setProfiles, activeProfile, setActiveProfile,
    newProfileName, setNewProfileName, isProfileModalOpen, setIsProfileModalOpen,
    modalProfileName, setModalProfileName, holdings, setHoldings, summary, setSummary,
    pulsePreset, persistPulsePreset, pulseIntervalMs, PULSE_PRESETS, RH_REQUESTS_PER_MINUTE,
    selectedTicker, setSelectedTicker, chartData, setChartData, advisorData, setAdvisorData,
    chartOverlays, setChartOverlays, indicatorSettings, riskProfile, newsData, newsLoading,
    loadMarketNews, congressData, congressLoading, loadCongressTrades, formatCongressTradeDate,
    congressSyncStatus, STOCK_ACT_MAX_LAG_DAYS, formatRelativeTime,
    openRobinhoodLogin, updateInfo, updateChecking, checkForUpdates, downloadLatestUpdate,
    openNewsLink, isCoachMode, setIsCoachMode, showManualAdjust, setShowManualAdjust,
        guesses, setGuesses, analytics, setAnalytics, isLoginOpen, setIsLoginOpen, loginForm, setLoginForm,
    loginStatus, setLoginStatus, desktopAuthProbe, desktopAuthReadyMessage, isImportOpen, setIsImportOpen,
    clipboardText, setClipboardText, guessForm, setGuessForm, holdingForm, setHoldingForm,
    predictionTab, setPredictionTab, viabilityData, setViabilityData, viabilityHorizon, setViabilityHorizon,
    viabilityWeights, setViabilityWeights, isDnaOpen, setIsDnaOpen, watchlist, setWatchlist,
    watchlistForm, setWatchlistForm, sectorConcentrations, setSectorConcentrations,
    strategyBrackets, setStrategyBrackets, evolutionMetrics, setEvolutionMetrics,
    shifterForm, setShifterForm, strategyLoading, isSandbox, setIsSandbox, loading, setLoading,
    syncing, setSyncing, syncStepIndex, portfolioBootstrapping, hasCachedRobinhoodSession,
    toasts, showToast, dismissToast, lastSyncTime, setLastSyncTime,
    shadowCoachData, setShadowCoachData, actionHistory, setActionHistory, coachTimeFilter, setCoachTimeFilter,
    fontSizeOffset, setFontSizeOffset, adjustFontSize, highContrast: true,
    persistIndicatorSettings, applyRiskProfile, updateIndicatorField, resetIndicatorDefaults,
    memoizedChartPaths, allAvailableTickers, handleCycleTicker, isSyncStale, formatLastSync,
    handleSeedMockAssets, fetchProfiles, handleCreateProfile, handleDeleteProfile,
    fetchPortfolio, fetchGuesses, fetchAnalytics, fetchStockHistoryAndAdvisor, fetchWatchlist,
    fetchShadowCoachData, handleAddToWatchlist, handleRemoveFromWatchlist, fetchStrategyBrackets, triggerSync,
    handleImportClipboard, handleStayOffline, handleLogin, handleLogout, handleCreateGuess,
    equityDiagnostic, equityDiagnosticLoading, runEquityDiagnostic,
    hiddenHoldings, autoHideWarrants, setAutoHideWarrants,
    handleHideHolding, handleUnhideHolding, handleAdjustHolding, handleForceEvolve,
    alert, formatCurrency, formatNewsTime, getCoachActionCutoff, APP_VERSION,
    RISK_PROFILES, INDICATOR_META, DEFAULT_INDICATORS, calculateAtr, calculateMarketStrength,
    localDb, sidekickFetch, fetchPublicQuote, generateViabilityForecast, evolveWeights, generateRecommendation,
  };
}
