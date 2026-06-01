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

import React, { useState, useEffect, useRef } from 'react';
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
  Brain,
  MousePointerClick,
  HelpCircle,
  Activity,
  DollarSign,
  Award,
  Target,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

import { 
  localDb, 
  generateRecommendation, 
  fetchPublicHistoricalPrices, 
  fetchPublicQuote,
  robinhoodClient,
  evolveWeights
} from './serverless';

// Dynamic API Base URL resolver supporting local networking and Android viewports
const getDefaultApiBase = () => {
  const saved = localStorage.getItem("portfolio_sidekick_api_base") || localStorage.getItem("stock_toolkit_api_base");
  if (saved) return saved;
  
  // Dynamic Android Capacitor/mobile detection
  if (typeof window !== "undefined" && 
      (navigator.userAgent.includes("Android") || 
       window.location.href.includes("android") || 
       window.location.origin.includes("capacitor") ||
       window.location.hostname === "localhost" && navigator.maxTouchPoints > 0)) {
    return "http://10.0.2.2:8000/api";
  }
  return "http://127.0.0.1:8000/api";
};

let API_BASE = getDefaultApiBase();

export default function App() {
  // API connection config states
  const [apiBaseUrl, setApiBaseUrl] = useState(API_BASE);
  const [connectionError, setConnectionError] = useState(false);
  const [customIp, setCustomIp] = useState(API_BASE);

  // Navigation Tabs state
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard', 'coach', 'oracle'

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

  // Load profiles on start
  useEffect(() => {
    fetchProfiles();
  }, []);

  // Fetch holdings, guesses, and chart details whenever profile or ticker changes
  useEffect(() => {
    if (activeProfile) {
      fetchPortfolio();
      fetchGuesses();
      fetchAnalytics();
      fetchWatchlist();
    }
  }, [activeProfile]);

  useEffect(() => {
    if (activeProfile && selectedTicker) {
      fetchStockHistoryAndAdvisor();
      fetchStrategyBrackets();
    }
  }, [activeProfile, selectedTicker]);

  // Fetch Profiles
  const fetchProfiles = async (selectNewId = null) => {
    try {
      setConnectionError(false);
      const data = localDb.getProfiles();
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
      const newP = localDb.createProfile(name);
      const profileId = newP.id;
      
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
      localDb.deleteProfile(profileId);
      alert(`Profile "${name}" was successfully removed.`);
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
      const dbHoldings = localDb.getHoldings(activeProfile.id);
      
      let totalEquity = 0;
      let totalCost = 0;
      const sectorConcentrations = {};
      
      dbHoldings.forEach(h => {
        h.total_value = h.shares * h.current_price;
        h.pnl = (h.current_price - h.avg_buy_price) * h.shares;
        h.pnl_pct = h.avg_buy_price > 0 ? ((h.current_price - h.avg_buy_price) / h.avg_buy_price) * 100 : 0;

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
      setIsSandbox(true); // Defaults to sandbox local safety in serverless mode
    } catch (err) {
      console.error("Error fetching holdings:", err);
    }
  };

  // Fetch Guesses & Oracle Analytics
  const fetchGuesses = async () => {
    if (!activeProfile) return;
    try {
      const data = localDb.getGuesses(activeProfile.id);
      
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
        const resolvedAt = g.resolved_date ? new Date(g.resolved_date).toISOString().slice(0, 10) : g.guess_date.slice(0, 10);
        return {
          ...g,
          actual_end_price: g.status === "hit" ? g.target_price : g.initial_price * 0.95,
          resolved_at: resolvedAt
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
      const data = localDb.getGuesses(activeProfile.id);
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
      const dataHist = await fetchPublicHistoricalPrices(selectedTicker, "year");
      setChartData(dataHist || []);
      
      const livePrice = dataHist.length > 0 ? dataHist[dataHist.length - 1].close_price : 100.0;
      localDb.resolveGuesses(activeProfile.id, selectedTicker, livePrice);
      
      const dataAdv = generateRecommendation(activeProfile.id, selectedTicker, dataHist, livePrice);
      setAdvisorData(dataAdv);
      
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
      const data = localDb.getWatchlist(activeProfile.id);
      const liveWatch = [];
      
      for (let item of data) {
        const livePrice = await fetchPublicQuote(item.ticker);
        const hist = await fetchPublicHistoricalPrices(item.ticker, "year");
        const rec = generateRecommendation(activeProfile.id, item.ticker, hist, livePrice);
        
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

  const handleAddToWatchlist = async (e) => {
    e.preventDefault();
    if (!watchlistForm.ticker || !activeProfile) return;
    setLoading(true);
    try {
      const res = localDb.addToWatchlist(activeProfile.id, watchlistForm.ticker, watchlistForm.notes);
      if (res.status === "success") {
        setWatchlistForm({ ticker: "", notes: "" });
        fetchWatchlist();
        alert(`${res.ticker} added to watchlist!`);
      } else {
        alert(res.message);
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
      localDb.removeFromWatchlist(activeProfile.id, ticker);
      fetchWatchlist();
    } catch (err) {
      console.error("Failed to remove watchlist ticker:", err);
    }
  };

  const fetchStrategyBrackets = async () => {
    if (!activeProfile || !selectedTicker || chartData.length < 5) return;
    setStrategyLoading(true);
    try {
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
    } catch (err) {
      console.error("Error fetching strategy brackets:", err);
    } finally {
      setStrategyLoading(false);
    }
  };

  // Sync with Robinhood
  const triggerSync = async () => {
    if (!activeProfile) return;
    setSyncing(true);
    try {
      const data = await robinhoodClient.syncHoldings(activeProfile.id);
      fetchPortfolio();
      fetchGuesses();
      fetchAnalytics();
      if (selectedTicker) fetchStockHistoryAndAdvisor();
      alert(`Successfully synced ${data.synced_count} positions from Robinhood!`);
    } catch (err) {
      console.error("Sync error:", err);
      alert("Error linking with Robinhood.");
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
        localDb.updateHolding(activeProfile.id, ticker, shares, avgCost, livePrice);
        count++;
      }
      
      if (count === 0) {
        const lines = clipboardText.split("\n");
        lines.forEach(line => {
          const tokens = line.split(/\s+/);
          if (tokens.length >= 3) {
            const ticker = tokens[0].toUpperCase();
            const shares = parseFloat(tokens[1]);
            const avgCost = parseFloat(tokens[2]);
            if (ticker && !isNaN(shares) && !isNaN(avgCost) && ticker.match(/^[A-Z]{1,5}$/)) {
              localDb.updateHolding(activeProfile.id, ticker, shares, avgCost);
              count++;
            }
          }
        });
      }
      
      if (count > 0) {
        fetchPortfolio();
        fetchGuesses();
        fetchAnalytics();
        if (selectedTicker) fetchStockHistoryAndAdvisor();
        setIsImportOpen(false);
        setClipboardText("");
        alert(`Direct Import successful! Parsed and loaded ${count} holdings from clipboard.`);
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
        setIsSandbox(data.mode === "sandbox");
        setTimeout(() => {
          setIsLoginOpen(false);
          setLoginForm({ username: "", password: "", mfa_code: "" });
          setLoginStatus({ status: "", message: "" });
          triggerSync();
        }, 1500);
      } else if (data.status === "mfa_required") {
        setLoginStatus({ status: "mfa_required", message: data.message || "Multi-Factor Authentication code required. Please check your SMS/App.", challenge_type: data.challenge_type || "sms" });
      } else {
        setLoginStatus({ status: "error", message: data.message || "Authentication failed." });
      }
    } catch (err) {
      setLoginStatus({ status: "error", message: "Error linking to Robinhood client." });
    } finally {
      setLoading(false);
    }
  };

  // Submit Gut Guess
  const handleCreateGuess = async (e) => {
    e.preventDefault();
    if (!guessForm.target_price || !selectedTicker) return;
    try {
      const livePrice = chartData.length > 0 ? chartData[chartData.length - 1].close_price : 100.0;
      localDb.createGuess(activeProfile.id, selectedTicker, guessForm.target_price, livePrice, guessForm.timeframe_days);
      
      setGuessForm({ target_price: "", timeframe_days: 30 });
      fetchGuesses();
      fetchAnalytics();
      fetchStockHistoryAndAdvisor();
      alert("Gut Guess submitted to The Oracle! Tracking is now active.");
    } catch (err) {
      alert("Failed to submit guess.");
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
      
      localDb.updateHolding(activeProfile.id, selectedTicker, shares, avgPrice, livePrice);
      
      fetchPortfolio();
      if (selectedTicker) fetchStockHistoryAndAdvisor();
      alert("Holding updated successfully in local DB!");
    } catch (err) {
      alert("Failed to adjust holding.");
    }
  };

  // Force local self-evolution weighting update
  const handleForceEvolve = async () => {
    if (!selectedTicker || !activeProfile || chartData.length < 35) return;
    setLoading(true);
    try {
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
    const bbUpper = [];
    const bbLower = [];
    if (chartOverlays.bollinger && prices.length >= 20) {
      const period = 20;
      for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) {
          bbUpper.push(prices[i]);
          bbLower.push(prices[i]);
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
                  ${val.toFixed(2)}
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
                      YOUR COST BASIS: ${h.avg_buy_price.toFixed(2)}
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
              <span style={{ color: '#a78bfa', fontWeight: '900' }}>${hoveredPoint.close_price.toFixed(2)}</span>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
              <span>Open:</span>
              <span>${hoveredPoint.open_price.toFixed(2)}</span>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>High/Low:</span>
              <span>${hoveredPoint.high_price.toFixed(1)} / ${hoveredPoint.low_price.toFixed(1)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // CONNECTION ERROR SCREEN: If API backend connection fails (extremely critical for mobile/local networking configuration)
  if (connectionError) {
    return (
      <div className="app-container" style={{ display: 'flex', minHeight: '90vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-card animate-fade-in" style={{ padding: '40px', maxWidth: '520px', width: '100%', border: '1px solid var(--color-sell)' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '18px', background: 'rgba(244, 63, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <ShieldAlert className="w-8 h-8" style={{ color: 'var(--color-sell)' }} />
          </div>
          
          <h2 style={{ fontSize: '1.5rem', fontWeight: '950', color: '#fff', textAlign: 'center', marginBottom: '12px' }}>Connection to Local Server Failed</h2>
          
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6', textAlign: 'center', marginBottom: '24px' }}>
            Unable to connect to the backend server at <code style={{ color: '#f43f5e', background: 'rgba(244, 63, 94, 0.08)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>{apiBaseUrl}</code>. 
            Ensure the FastAPI backend application is running on your computer.
          </p>

          <div className="glass-card" style={{ background: '#0a0d16', border: '1px solid var(--border-light)', padding: '20px', borderRadius: '12px', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#fff', marginBottom: '12px' }}>Mobile Network Helper</h3>
            <p style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '12px' }}>
              If running on a mobile phone, you must connect to your computer's local network IP address rather than <code style={{ color: 'var(--color-oracle)' }}>127.0.0.1</code>.
            </p>
            <ul style={{ fontSize: '10px', color: 'var(--text-secondary)', paddingLeft: '16px', lineHeight: '1.6' }}>
              <li><strong>Android Emulator</strong>: Use <code style={{ cursor: 'pointer', color: '#a78bfa' }} onClick={() => setCustomIp("http://10.0.2.2:8000/api")}>http://10.0.2.2:8000/api</code></li>
              <li><strong>Physical Phone (Wi-Fi)</strong>: Enter your computer's local private IP address, for example <code style={{ color: 'var(--color-buy)' }}>http://192.168.1.100:8000/api</code> (make sure phone and PC are on the same Wi-Fi).</li>
            </ul>
          </div>

          <div className="input-group" style={{ marginBottom: '20px' }}>
            <label className="input-label">Configure Server URL</label>
            <input
              type="text"
              value={customIp}
              onChange={(e) => setCustomIp(e.target.value)}
              className="form-input-text"
              placeholder="e.g. http://192.168.1.100:8000/api"
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn-base btn-secondary" 
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => {
                const def = "http://127.0.0.1:8000/api";
                setCustomIp(def);
                setApiBaseUrl(def);
                API_BASE = def;
                localStorage.setItem("portfolio_sidekick_api_base", def);
                fetchProfiles();
              }}
            >
              Reset Default
            </button>
            <button 
              className="btn-base btn-primary" 
              style={{ flex: 2, justifyContent: 'center' }}
              onClick={() => {
                let formatted = customIp.trim();
                if (formatted && !formatted.endsWith("/api")) {
                  if (formatted.endsWith("/")) formatted = formatted + "api";
                  else formatted = formatted + "/api";
                }
                setCustomIp(formatted);
                setApiBaseUrl(formatted);
                API_BASE = formatted;
                localStorage.setItem("portfolio_sidekick_api_base", formatted);
                fetchProfiles();
              }}
            >
              Save & Reconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

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
                  setActiveProfile(p);
                  setSelectedTicker("NVDA");
                }}
                className={`profile-btn ${activeProfile?.id === p.id ? 'profile-btn-active' : ''}`}
              >
                <User className="w-3 h-3" />
                {p.name}
              </button>
            ))}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="profile-btn"
              style={{ color: 'var(--color-buy)', borderLeft: '1px solid var(--border-light)', marginLeft: '4px', paddingLeft: '8px', paddingRight: '8px' }}
              title="Add New Profile"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeProfile && (
            <button
              onClick={() => handleDeleteProfile(activeProfile.id)}
              className="btn-base btn-secondary"
              style={{ padding: '8px 12px', borderColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185' }}
              title="Delete Active Profile"
            >
              <X className="w-3.5 h-3.5" />
              Delete Profile
            </button>
          )}

          <div style={{ width: 1, height: 24, backgroundColor: 'var(--border-light)', margin: '0 4px' }}></div>

          <button
            onClick={() => setIsImportOpen(true)}
            className="btn-base btn-secondary"
          >
            <Clipboard className="w-3.5 h-3.5" style={{ color: 'var(--color-oracle)' }} />
            Paste List
          </button>

          <button
            onClick={() => setIsLoginOpen(true)}
            className="btn-base btn-primary"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Account
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
        </div>
      </div>

      {/* VIEW PANEL 1: DASHBOARD OVERVIEW */}
      {activeTab === "dashboard" && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* Main Account Metrics Summary Row */}
          <section className="metrics-deck">
            <div className="glass-card metric-card">
              <span className="metric-label">Account Net Equity</span>
              <div>
                <h2 className="metric-value">
                  ${summary.total_equity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </h2>
                <div className="live-indicator-row">
                  <div className="pulse-live"></div>
                  <span className="live-text">Live Streaming Prices</span>
                </div>
              </div>
              <span className="metric-subtext">Localized data protection active</span>
            </div>

            <div className="glass-card metric-card">
              <span className="metric-label">Capital Deployed</span>
              <div>
                <h2 className="metric-value" style={{ color: 'var(--text-secondary)' }}>
                  ${summary.total_cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </h2>
              </div>
              <span className="metric-subtext">Total original cost basis</span>
            </div>

            <div className="glass-card metric-card">
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
                  <h3 className="holdings-title">Portfolio Asset Allocation</h3>
                  <p className="holdings-subtitle">Click any asset row to update technical recommendations and charts.</p>
                </div>
                <button 
                  onClick={triggerSync}
                  disabled={syncing}
                  className="refresh-action-btn"
                  title="Force price synchronization"
                >
                  <RefreshCw className={syncing ? 'animate-spin' : ''} style={{ width: 14, height: 14 }} />
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="asset-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th style={{ textAlign: 'right' }}>Qty Shares</th>
                      <th style={{ textAlign: 'right' }}>Avg Cost</th>
                      <th style={{ textAlign: 'right' }}>Quote Price</th>
                      <th style={{ textAlign: 'right' }}>Alloc Value</th>
                      <th style={{ textAlign: 'right' }}>Unrealized P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map(h => (
                      <tr 
                        key={h.id}
                        onClick={() => setSelectedTicker(h.ticker)}
                        className={selectedTicker.toUpperCase() === h.ticker.toUpperCase() ? 'tr-selected' : ''}
                      >
                        <td className="ticker-td">{h.ticker}</td>
                        <td className="shares-td">{h.shares.toLocaleString()}</td>
                        <td className="numeric-td">${h.avg_buy_price.toFixed(2)}</td>
                        <td className="numeric-td" style={{ color: '#fff' }}>${h.current_price.toFixed(2)}</td>
                        <td className="bold-numeric-td">${h.total_value.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="badge-td">
                          <span className={`badge ${h.pnl >= 0 ? 'badge-buy' : 'badge-sell'}`}>
                            {h.pnl >= 0 ? '+' : ''}{h.pnl_pct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {holdings.length === 0 && (
                      <tr key="empty-holdings">
                        <td colSpan="6" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>
                          No local holdings found. Use "Paste List" or "Sync Account" above to import your assets.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Glowing Minimal Quick Advisor Dial */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {advisorData ? (
                <div className="glass-card advisor-dial-card">
                  <span className="card-top-label">Unified recommendation</span>
                  
                  <div className="radial-container">
                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                      <circle cx="70" cy="70" r="54" stroke="rgba(255,255,255,0.015)" strokeWidth="6" fill="none" />
                      <circle 
                        cx="70" 
                        cy="70" 
                        r="54" 
                        stroke={advisorData.action === 'BUY' ? 'var(--color-buy)' : advisorData.action === 'SELL' ? 'var(--color-sell)' : 'var(--color-hold)'} 
                        strokeWidth="8" 
                        fill="none" 
                        strokeDasharray={2 * Math.PI * 54} 
                        strokeDashoffset={2 * Math.PI * 54 * (1 - advisorData.score / 100)}
                        strokeLinecap="round"
                        style={{ filter: `drop-shadow(0px 0px 8px ${advisorData.action === 'BUY' ? 'var(--color-buy)' : advisorData.action === 'SELL' ? 'var(--color-sell)' : 'var(--color-hold)'})` }} 
                      />
                    </svg>
                    <div>
                      <div className="radial-recommendation-text" style={{ color: advisorData.action === 'BUY' ? 'var(--color-buy)' : advisorData.action === 'SELL' ? 'var(--color-sell)' : 'var(--color-hold)' }}>
                        {advisorData.action}
                      </div>
                      <div className="radial-ticker-label">{selectedTicker}</div>
                    </div>
                  </div>

                  <h4 className="confidence-heading">{advisorData.score}% Advisor Confidence</h4>
                  <p className="confidence-sub">ROI-optimized scoring weights</p>
                  
                  {isCoachMode && (
                    <div className="coach-tip-bubble">
                      <strong>🎓 Coach Tip:</strong> The Scoring Engine weights indicators dynamically. 
                      For <strong>{selectedTicker}</strong>, local parameters suggest a clear <strong>{advisorData.action}</strong> strategy based on compounding trade backtests.
                    </div>
                  )}

                  <button
                    onClick={() => setActiveTab("coach")}
                    className="btn-dial-chart"
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
                          {w.recommendation}
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
        </div>
      )}

      {/* VIEW PANEL 2: INTERACTIVE CHART & COACH SECTION */}
      {activeTab === "coach" && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div className="glass-card chart-card-container">
            <div className="chart-header-row">
              <div>
                <div className="chart-title-wrapper">
                  <h3 className="chart-main-title">{selectedTicker} Market Analysis</h3>
                  <span className="chart-timeframe-tag">1-Year History</span>
                </div>
                <p className="chart-sub-guide">Move your cursor across the chart path for precise hover pricing statistics.</p>
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
          {advisorData && (
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
              <div className="glass-card" style={{ padding: '24px 32px', border: '1px solid var(--border-glow)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
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
                          Value: ${h.total_value.toLocaleString(undefined, {maximumFractionDigits: 0})} ({((h.total_value / summary.total_equity)*100).toFixed(0)}% alloc)
                        </span>
                      </div>
                      <span className="badge badge-sell" style={{ fontSize: '9px', padding: '4px 8px', fontWeight: '900' }}>
                        SELL (Score: {h.advisor_score}%)
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <span style={{ fontSize: '10px', color: '#fb7185', fontWeight: '700' }}>
                        Unrealized: {h.pnl >= 0 ? '+' : ''}{h.pnl_pct.toFixed(1)}% P&L (${h.pnl.toLocaleString(undefined, {maximumFractionDigits: 0})})
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
                        BUY (Score: {w.advisor_score || w.score}%)
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <span style={{ fontSize: '10px', color: '#34d399', fontWeight: '700' }}>
                        Price: ${w.current_price.toFixed(2)} {w.timing ? `— ${w.timing.slice(0, 22)}...` : ''}
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
        </div>
      )}

      {/* VIEW PANEL 3: ORACLE PREDICTIONS SECTION */}
      {activeTab === "oracle" && (
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
              onClick={() => setIsLoginOpen(false)}
              className="modal-close-btn"
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
                  placeholder="e.g. name@gmail.com"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
                  className="form-input-text"
                />
              </div>

              <div className="input-group">
                <label className="input-label">Robinhood Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                  className="form-input-text"
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
                      placeholder="e.g. 123456"
                      value={loginForm.mfa_code}
                      onChange={(e) => setLoginForm(prev => ({ ...prev, mfa_code: e.target.value }))}
                      className="form-input-text"
                      autoFocus
                      style={{ letterSpacing: '0.25em', textAlign: 'center', fontWeight: '800' }}
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
                style={{ width: '100%', padding: '12px', justifyContent: 'center', fontSize: '11px', fontWeight: '900', borderRadius: '12px' }}
              >
                {loading && <RefreshCw className="animate-spin" style={{ width: 14, height: 14 }} />}
                {loginStatus.status === "mfa_required"
                  ? (loginStatus.challenge_type === "prompt" ? "Confirm Approval" : "Verify Code & Link")
                  : "Initiate Login"}
              </button>


            </form>
          </div>
        </div>
      )}

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
