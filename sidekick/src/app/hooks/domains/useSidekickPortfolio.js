// ./sidekick/src/app/hooks/domains/useSidekickPortfolio.js
/**
 * Portfolio domain — holdings, watchlist, sync overlay state, quote pulse, connection mode.
 * Created by: Roy Dawson IV
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  localDb, generateRecommendation, fetchPublicQuote,
} from '../../../serverless';
import { sidekickFetch } from '../../../lib/sidekickClient';
import { getPulseIntervalMs, PULSE_PRESETS, RH_REQUESTS_PER_MINUTE } from '../../../serverless/liveQuotes';
import { DEMO_HOLDINGS_SEED, SHADOW_COACH_SEED_TICKERS } from '../../../serverless/portfolioConstants';
import { enrichHoldingsWithAdvisor, getCachedTickerHistory } from '../../../serverless/holdingAdvisor';
import { attachHoldingIntegrity } from '../../../serverless/dataIntegrity';

export function useSidekickPortfolio(shell, profilesDomain, bridgeApi) {
  const { activeTab, showToast, setLoading } = shell;
  const {
    activeProfile, setActiveProfile, setProfiles,
  } = profilesDomain;

  const [pulsePreset, setPulsePreset] = useState(() => {
    const settings = localDb.getSettings();
    return settings.pulsePreset && PULSE_PRESETS[settings.pulsePreset] ? settings.pulsePreset : 'live';
  });
  const pulseIntervalMs = getPulseIntervalMs({ pulsePreset });
  const persistPulsePreset = useCallback((preset) => {
    if (!PULSE_PRESETS[preset]) return;
    setPulsePreset(preset);
    localDb.saveSettings({ pulsePreset: preset });
  }, []);

  const [holdings, setHoldings] = useState([]);
  const [summary, setSummary] = useState({
    total_equity: 0,
    total_cost: 0,
    overall_pnl: 0,
    overall_pnl_pct: 0,
  });
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistForm, setWatchlistForm] = useState({ ticker: '', notes: '' });
  const [sectorConcentrations, setSectorConcentrations] = useState({});
  const [isSandbox, setIsSandbox] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStepIndex, setSyncStepIndex] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [portfolioBootstrapping, setPortfolioBootstrapping] = useState(false);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [holdingsHydrated, setHoldingsHydrated] = useState(false);
  const [hasCachedRobinhoodSession, setHasCachedRobinhoodSession] = useState(false);
  const [autoRestoreNonce, setAutoRestoreNonce] = useState(0);
  const [equityDiagnostic, setEquityDiagnostic] = useState(null);
  const [equityDiagnosticLoading, setEquityDiagnosticLoading] = useState(false);
  const [hiddenHoldingsNonce, setHiddenHoldingsNonce] = useState(0);
  const [autoHideWarrants, setAutoHideWarrantsState] = useState(
    () => localDb.getSettings().autoHideWarrants !== false,
  );

  const portfolioRestoreRef = useRef({ profileId: null, attempted: false });
  const portfolioFetchGenRef = useRef(0);
  const watchlistFetchRef = useRef(null);
  const quoteFallbackRef = useRef({ active: false, lastToastAt: 0 });
  const portfolioBootstrappingRef = useRef(false);
  const syncCancelRef = useRef(false);

  const hiddenHoldings = useMemo(() => {
    void hiddenHoldingsNonce;
    if (!activeProfile) return [];
    return localDb.getHiddenTickers(activeProfile.id);
  }, [activeProfile, hiddenHoldingsNonce]);

  const refreshHiddenHoldings = useCallback(() => {
    setHiddenHoldingsNonce((n) => n + 1);
  }, []);

  const setAutoHideWarrants = useCallback((enabled) => {
    setAutoHideWarrantsState(enabled);
    localDb.saveSettings({ autoHideWarrants: enabled });
  }, []);

  useEffect(() => {
    if (!syncing) return undefined;
    const interval = setInterval(() => {
      setSyncStepIndex((prev) => (prev + 1) % 5);
    }, 1500);
    return () => clearInterval(interval);
  }, [syncing]);

  useEffect(() => {
    portfolioBootstrappingRef.current = portfolioBootstrapping;
  }, [portfolioBootstrapping]);

  const isSyncStale = useCallback(() => {
    if (!lastSyncTime) return true;
    const elapsedMinutes = (new Date() - new Date(lastSyncTime)) / 1000 / 60;
    return elapsedMinutes >= 5;
  }, [lastSyncTime]);

  const formatLastSync = useCallback(() => {
    if (!lastSyncTime) return 'Never';
    const elapsedSeconds = Math.floor((new Date() - new Date(lastSyncTime)) / 1000);
    if (elapsedSeconds < 60) return 'just now';
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `${elapsedHours}h ago`;
    return new Date(lastSyncTime).toLocaleDateString();
  }, [lastSyncTime]);

  const refreshConnectionMode = useCallback(async (profile) => {
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
  }, [setActiveProfile, setProfiles]);

  const fetchPortfolio = useCallback(async ({ pulse = false } = {}) => {
    if (!activeProfile) return;
    const bridge = bridgeApi.current;
    const fetchGen = ++portfolioFetchGenRef.current;
    const stale = () => fetchGen !== portfolioFetchGenRef.current;

    if (!pulse) setHoldingsLoading(true);
    try {
      let dbHoldings;
      try {
        let isAuthenticated = false;
        const authProbe = bridge.getAuthProbe?.() ?? { at: 0, authenticated: false };
        const authFresh = Date.now() - authProbe.at < 120_000;
        if (pulse && authFresh) {
          isAuthenticated = authProbe.authenticated;
        } else {
          try {
            const statusRes = await sidekickFetch(`/auth/status?profile_id=${activeProfile.id}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              isAuthenticated = statusData.authenticated;
              bridge.setAuthProbe?.(isAuthenticated);
            }
          } catch {
            // Auth status probe is best-effort before holdings fetch.
          }
        }

        if (isAuthenticated) setHasCachedRobinhoodSession(true);

        const loginGraceUntilRef = bridge.loginGraceUntilRef || { current: 0 };
        const loginSucceededRef = bridge.loginSucceededRef || { current: false };

        if (activeProfile.robinhood_username && !isAuthenticated) {
          const inLoginGrace = Date.now() < loginGraceUntilRef.current;
          const bootstrapping = portfolioBootstrappingRef.current;
          if (inLoginGrace || loginSucceededRef.current || bootstrapping) {
            setHasCachedRobinhoodSession(true);
            setIsSandbox(false);
          } else {
            setIsSandbox(true);
            if (!bridge.getIsLoginOpen?.()) {
              showToast('Robinhood session expired. Tap Sync Account to reconnect, or stay offline.', 'warning');
              bridge.setLoginForm?.((prev) => ({
                ...prev,
                username: activeProfile.robinhood_username,
                password: '',
                mfa_code: '',
              }));
            }
          }
        } else if (isAuthenticated) {
          setIsSandbox(false);
        }

        const holdingsQuery = pulse
          ? `/portfolio/holdings?profile_id=${activeProfile.id}&pulse=1`
          : `/portfolio/holdings?profile_id=${activeProfile.id}`;
        const res = await sidekickFetch(holdingsQuery);
        if (!res.ok) throw new Error('API holdings endpoint non-OK');
        const resData = await res.json();
        dbHoldings = resData.holdings || [];
        const liveMode = resData.mode === 'live' || isAuthenticated;
        setIsSandbox(!liveMode);

        dbHoldings.forEach((h) => {
          if (h.total_value == null) h.total_value = h.shares * h.current_price;
          if (h.pnl == null) h.pnl = (h.current_price - h.avg_buy_price) * h.shares;
          if (h.pnl_pct == null) {
            h.pnl_pct = h.avg_buy_price > 0
              ? ((h.current_price - h.avg_buy_price) / h.avg_buy_price) * 100
              : 0;
          }
        });

        if (stale()) return;
        setHoldings(dbHoldings);

        const preferredTicker = dbHoldings.find((h) => h.quote_status === 'live')?.ticker
          || dbHoldings.find((h) => !h.non_quotable)?.ticker
          || dbHoldings[0]?.ticker;
        if (preferredTicker && bridge.setSelectedTicker) {
          bridge.setSelectedTicker((current) => {
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
          header_equity_source: resData.header_equity_source ?? null,
          header_equity_field: resData.header_equity_field ?? null,
          header_equity_session: resData.header_equity_session ?? null,
          stock_market_value: resData.stock_market_value ?? resData.positions_equity ?? 0,
          crypto_market_value: resData.crypto_market_value ?? null,
          crypto_holdings: resData.crypto_holdings ?? [],
          crypto_load_warning: resData.crypto_load_warning ?? null,
          options_warning: resData.options_warning ?? null,
          options_position_count: resData.options_position_count ?? 0,
          pending_dividends: resData.pending_dividends ?? 0,
          regular_hours_equity: resData.regular_hours_equity ?? null,
          extended_hours_equity: resData.extended_hours_equity ?? null,
          equity_reconciliation: resData.equity_reconciliation ?? null,
          equity_warnings: resData.equity_warnings ?? [],
          prefer_extended_hours_quotes: resData.prefer_extended_hours_quotes === true,
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

        if (stale()) return;
        if (resData.sector_concentrations) {
          setSectorConcentrations(resData.sector_concentrations);
        }
        if (dbHoldings.length > 0) {
          const now = new Date();
          setLastSyncTime(now);
          localStorage.setItem(`st_last_sync_${activeProfile.id}`, now.toISOString());
        }
        return;
      } catch (apiErr) {
        console.warn('Serverless fallback: API holdings fetch failed, reading localDb:', apiErr.message);
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
      const sectorTotals = {};

      dbHoldings.forEach((h) => {
        if (h.total_value == null) h.total_value = h.shares * (h.current_price || 0);
        if (h.pnl == null && h.current_price != null) h.pnl = (h.current_price - h.avg_buy_price) * h.shares;
        if (h.pnl_pct == null && h.avg_buy_price > 0 && h.current_price != null) {
          h.pnl_pct = ((h.current_price - h.avg_buy_price) / h.avg_buy_price) * 100;
        }

        const equity = h.total_value;
        const cost = h.shares * h.avg_buy_price;
        totalEquity += equity;
        totalCost += cost;

        const tech = ['NVDA', 'AAPL', 'MSFT', 'AMD', 'AVGO', 'PLTR', 'TSM', 'INTC'];
        const quantum = ['QBTS', 'RGTI', 'IONQ'];
        const energy = ['NUKZ'];
        let sector;
        if (tech.includes(h.ticker)) sector = 'Technology';
        else if (quantum.includes(h.ticker)) sector = 'Quantum Tech';
        else if (energy.includes(h.ticker)) sector = 'Nuclear Energy';
        else sector = 'Index/Diversified';

        sectorTotals[sector] = (sectorTotals[sector] || 0) + equity;
      });

      const formattedConcentrations = {};
      Object.keys(sectorTotals).forEach((sec) => {
        formattedConcentrations[sec] = totalEquity > 0 ? (sectorTotals[sec] / totalEquity) * 100 : 0;
      });

      const overallPnl = totalEquity - totalCost;
      const overallPnlPct = totalCost > 0 ? (overallPnl / totalCost) * 100 : 0;

      if (stale()) return;
      setHoldings(dbHoldings);
      setSummary({
        total_equity: totalEquity,
        total_cost: totalCost,
        overall_pnl: overallPnl,
        overall_pnl_pct: overallPnlPct,
      });
      setSectorConcentrations(formattedConcentrations);
      if (dbHoldings.length > 0) {
        const now = new Date();
        setLastSyncTime(now);
        localStorage.setItem(`st_last_sync_${activeProfile.id}`, now.toISOString());
      }
    } catch (err) {
      console.error('Error fetching holdings:', err);
    } finally {
      if (!pulse && fetchGen === portfolioFetchGenRef.current) {
        setHoldingsLoading(false);
        setHoldingsHydrated(true);
      }
    }
  }, [activeProfile, bridgeApi, showToast]);

  const fetchWatchlist = useCallback(async ({ priceOnly = false } = {}) => {
    if (!activeProfile) return;
    if (watchlistFetchRef.current) return watchlistFetchRef.current;

    const task = (async () => {
      try {
        let data;
        try {
          const res = await sidekickFetch(`/watchlist?profile_id=${activeProfile.id}`);
          if (!res.ok) throw new Error('API watchlist fetch non-OK');
          data = await res.json();
        } catch (apiErr) {
          console.warn('Serverless fallback: API watchlist fetch failed, reading localDb:', apiErr.message);
          data = localDb.getWatchlist(activeProfile.id);
        }

        const enrichWatchItem = async (item) => {
          let livePrice;
          let hist;
          let rec;
          try {
            livePrice = await fetchPublicQuote(item.ticker);
            hist = await getCachedTickerHistory(item.ticker);
            const resRec = await sidekickFetch(`/advisor/recommendation?profile_id=${activeProfile.id}&ticker=${item.ticker}`);
            if (!resRec.ok) throw new Error('Rec non-OK');
            rec = await resRec.json();
          } catch {
            livePrice = await fetchPublicQuote(item.ticker);
            hist = await getCachedTickerHistory(item.ticker);
            rec = generateRecommendation(activeProfile.id, item.ticker, hist, livePrice);
          }

          let timing = 'Neutral Consolidation';
          if (rec.insufficient_data) {
            timing = rec.message || 'Insufficient history for advisor scoring';
          } else if (rec.metrics?.rsi <= 30) timing = 'Oversold Buy Trigger';
          else if (rec.metrics?.rsi >= 70) timing = 'Overbought Exit Warning';
          else if (rec.action === 'BUY') timing = 'Bullish Entry Momentum';
          else if (rec.action === 'SELL') timing = 'Bearish Trend Exit';
          else if (rec.metrics?.rsi < 45) timing = 'Oversold Bounce Watch';

          return {
            id: item.id,
            ticker: item.ticker,
            added_at: item.added_at,
            notes: item.notes,
            current_price: livePrice,
            recommendation: rec.insufficient_data ? 'HOLD' : rec.action,
            score: rec.insufficient_data ? null : rec.score,
            advisor_message: rec.insufficient_data ? (rec.message || 'Insufficient price history') : null,
            timing,
          };
        };

        if (priceOnly && watchlist.length > 0) {
          const prevByTicker = new Map(watchlist.map((w) => [w.ticker.toUpperCase(), w]));
          const batchSize = 6;
          const liveWatch = [];
          for (let i = 0; i < data.length; i += batchSize) {
            const chunk = data.slice(i, i + batchSize);
            const rows = await Promise.all(chunk.map(async (item) => {
              const prev = prevByTicker.get(item.ticker.toUpperCase());
              if (!prev) return enrichWatchItem(item);
              const livePrice = await fetchPublicQuote(item.ticker);
              return { ...prev, current_price: livePrice };
            }));
            liveWatch.push(...rows);
          }
          setWatchlist(liveWatch);
          return;
        }

        const batchSize = 3;
        const liveWatch = [];
        for (let i = 0; i < data.length; i += batchSize) {
          const chunk = data.slice(i, i + batchSize);
          const rows = await Promise.all(chunk.map((item) => enrichWatchItem(item)));
          liveWatch.push(...rows);
        }
        setWatchlist(liveWatch);
      } catch (err) {
        console.error('Error fetching watchlist:', err);
      } finally {
        if (watchlistFetchRef.current === task) watchlistFetchRef.current = null;
      }
    })();
    watchlistFetchRef.current = task;
    return task;
  }, [activeProfile, watchlist]);

  const runEquityDiagnostic = useCallback(async (saveToDisk = true) => {
    if (!activeProfile) return null;
    const debugMode = bridgeApi.current.getDebugMode?.() === true;
    setEquityDiagnosticLoading(true);
    try {
      const path = `/portfolio/diagnostics?profile_id=${activeProfile.id}${saveToDisk ? '&save=1' : ''}`;
      const res = await sidekickFetch(path);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Diagnostic request failed');
      setEquityDiagnostic(data);
      if (debugMode) {
        if (saveToDisk && data.saved_to) {
          showToast(`Equity diagnostic saved to ${data.saved_to}`, 'success', 9000);
        } else {
          showToast('Equity diagnostic complete — see Settings (debug mode) for details.', 'success');
        }
      }
      return data;
    } catch (err) {
      console.error('Equity diagnostic failed:', err);
      showToast(err.message || 'Equity diagnostic failed.', 'error');
      return null;
    } finally {
      setEquityDiagnosticLoading(false);
    }
  }, [activeProfile, bridgeApi, showToast]);

  const handleAddToWatchlist = useCallback(async (e) => {
    e.preventDefault();
    if (!watchlistForm.ticker || !activeProfile) return;
    setLoading(true);
    try {
      const ticker = watchlistForm.ticker.toUpperCase().trim();
      try {
        const res = await sidekickFetch('/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile_id: activeProfile.id,
            ticker,
            notes: watchlistForm.notes,
          }),
        });
        if (!res.ok) throw new Error('API add watchlist non-OK');
        setWatchlistForm({ ticker: '', notes: '' });
        await fetchWatchlist();
        showToast(`${ticker} added to watchlist.`, 'success');
      } catch (apiErr) {
        console.warn('Serverless fallback: API add to watchlist failed, using localDb:', apiErr.message);
        const res = localDb.addToWatchlist(activeProfile.id, watchlistForm.ticker, watchlistForm.notes);
        if (res.status === 'success' || res.status === 'already_exists') {
          setWatchlistForm({ ticker: '', notes: '' });
          await fetchWatchlist();
          showToast(
            res.status === 'already_exists' ? `${ticker} is already on your watchlist.` : `${ticker} added to watchlist.`,
            res.status === 'already_exists' ? 'info' : 'success',
          );
        } else {
          showToast(res.message || 'Could not add to watchlist.', 'warning');
        }
      }
    } catch {
      showToast('Failed to add to watchlist.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeProfile, watchlistForm, fetchWatchlist, setLoading, showToast]);

  const handleRemoveFromWatchlist = useCallback(async (ticker) => {
    if (!activeProfile || !ticker) return;
    if (!window.confirm(`Remove ${ticker} from watchlist?`)) return;
    try {
      try {
        const res = await sidekickFetch(`/watchlist/${activeProfile.id}/${ticker}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('API delete watchlist non-OK');
        await fetchWatchlist();
      } catch (apiErr) {
        console.warn('Serverless fallback: API remove watchlist failed, using localDb:', apiErr.message);
        localDb.removeFromWatchlist(activeProfile.id, ticker);
        await fetchWatchlist();
      }
    } catch (err) {
      console.error('Failed to remove watchlist ticker:', err);
    }
  }, [activeProfile, fetchWatchlist]);

  const handleHideHolding = useCallback(async (ticker) => {
    if (!activeProfile || !ticker) return;
    const symbol = ticker.toUpperCase().trim();
    try {
      const res = await sidekickFetch('/portfolio/holdings/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: activeProfile.id, ticker: symbol }),
      });
      if (!res.ok) throw new Error('API hide holding non-OK');
    } catch (apiErr) {
      console.warn('Serverless fallback: hide holding via localDb:', apiErr.message);
      localDb.hideTicker(activeProfile.id, symbol);
    }
    refreshHiddenHoldings();
    showToast(`${symbol} hidden from dashboard. Re-sync will not re-import it until you unhide in settings.`, 'success', 6000);
    await fetchPortfolio();
  }, [activeProfile, refreshHiddenHoldings, showToast, fetchPortfolio]);

  const handleUnhideHolding = useCallback(async (ticker) => {
    if (!activeProfile || !ticker) return;
    const symbol = ticker.toUpperCase().trim();
    try {
      const res = await sidekickFetch('/portfolio/holdings/unhide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: activeProfile.id, ticker: symbol }),
      });
      if (!res.ok) throw new Error('API unhide holding non-OK');
    } catch (apiErr) {
      console.warn('Serverless fallback: unhide holding via localDb:', apiErr.message);
      localDb.unhideTicker(activeProfile.id, symbol);
    }
    refreshHiddenHoldings();
    showToast(`${symbol} restored — tap Sync Account to re-import from Robinhood.`, 'success', 5000);
    await fetchPortfolio();
  }, [activeProfile, refreshHiddenHoldings, showToast, fetchPortfolio]);

  const handleSeedMockAssets = useCallback(async () => {
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
          if (!(livePrice > 0)) return null;
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

        const bridge = bridgeApi.current;
        await Promise.all([
          fetchPortfolio(),
          bridge.fetchGuesses?.(),
          bridge.fetchAnalytics?.(),
          fetchWatchlist(),
          bridge.fetchShadowCoachData?.(Date.now()),
          bridge.fetchMarketStrength?.(),
        ]);

        const now = new Date();
        setLastSyncTime(now);
        localStorage.setItem(`st_last_sync_${activeProfile.id}`, now.toISOString());
        showToast('Successfully seeded 10 diversified mock holdings with live market prices!', 'success');
      } catch (err) {
        console.error('Mock Seeding error:', err);
        showToast(`Seeding failed: ${err.message}`, 'error');
      }
    }, 1200);
  }, [activeProfile, isSandbox, showToast, fetchPortfolio, fetchWatchlist, bridgeApi]);

  const cancelSync = useCallback(() => {
    syncCancelRef.current = true;
    setSyncing(false);
    setSyncStepIndex(0);
    setPortfolioBootstrapping(false);
    showToast('Sync cancelled. Tap Sync Account to try again.', 'info');
  }, [showToast]);

  const loadPortfolioForProfile = useCallback(async () => {
    if (!activeProfile) return { autoRestoreTriggered: false };

    if (portfolioRestoreRef.current.profileId !== activeProfile.id) {
      portfolioRestoreRef.current = { profileId: activeProfile.id, attempted: false };
      setHoldings([]);
      setHoldingsHydrated(false);
      setHoldingsLoading(false);
    }

    const savedSync = localStorage.getItem(`st_last_sync_${activeProfile.id}`);
    setLastSyncTime(savedSync ? new Date(savedSync) : null);

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

    const shouldAutoRestore = authenticated
      && !portfolioRestoreRef.current.attempted
      && !savedSync;
    if (shouldAutoRestore) {
      portfolioRestoreRef.current.attempted = true;
      setPortfolioBootstrapping(true);
      setAutoRestoreNonce((n) => n + 1);
      return { autoRestoreTriggered: true };
    }

    await fetchPortfolio();
    await fetchWatchlist();
    return { autoRestoreTriggered: false };
  }, [activeProfile, fetchPortfolio, fetchWatchlist]);

  useEffect(() => {
    if (!activeProfile) return;
    queueMicrotask(() => {
      void loadPortfolioForProfile();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profile-scoped portfolio load
  }, [activeProfile]);

  useEffect(() => {
    if (!activeProfile || isSandbox) return undefined;
    const interval = setInterval(() => {
      if (document.hidden) return;
      void fetchPortfolio({ pulse: true });
    }, pulseIntervalMs);
    return () => clearInterval(interval);
  }, [activeProfile, isSandbox, pulseIntervalMs, fetchPortfolio]);

  useEffect(() => {
    if (!activeProfile || isSandbox) return undefined;
    const onVisible = () => {
      if (!document.hidden) void fetchPortfolio({ pulse: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [activeProfile, isSandbox, fetchPortfolio]);

  useEffect(() => {
    if (!activeProfile) return undefined;
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (activeTab === 'dashboard' || activeTab === 'strategy') {
        void fetchWatchlist({ priceOnly: true });
      }
    }, 120_000);
    return () => clearInterval(interval);
  }, [activeProfile, activeTab, fetchWatchlist]);

  return useMemo(() => ({
    holdings,
    setHoldings,
    summary,
    setSummary,
    watchlist,
    setWatchlist,
    watchlistForm,
    setWatchlistForm,
    sectorConcentrations,
    setSectorConcentrations,
    pulsePreset,
    persistPulsePreset,
    pulseIntervalMs,
    PULSE_PRESETS,
    RH_REQUESTS_PER_MINUTE,
    isSandbox,
    setIsSandbox,
    syncing,
    setSyncing,
    syncStepIndex,
    setSyncStepIndex,
    lastSyncTime,
    setLastSyncTime,
    portfolioBootstrapping,
    setPortfolioBootstrapping,
    holdingsLoading,
    holdingsHydrated,
    hasCachedRobinhoodSession,
    setHasCachedRobinhoodSession,
    autoRestoreNonce,
    setAutoRestoreNonce,
    equityDiagnostic,
    equityDiagnosticLoading,
    runEquityDiagnostic,
    hiddenHoldings,
    autoHideWarrants,
    setAutoHideWarrants,
    refreshHiddenHoldings,
    refreshConnectionMode,
    fetchPortfolio,
    fetchWatchlist,
    handleAddToWatchlist,
    handleRemoveFromWatchlist,
    handleHideHolding,
    handleUnhideHolding,
    handleSeedMockAssets,
    cancelSync,
    isSyncStale,
    formatLastSync,
    loadPortfolioForProfile,
    syncCancelRef,
    portfolioBootstrappingRef,
  }), [
    holdings, summary, watchlist, watchlistForm, sectorConcentrations,
    pulsePreset, persistPulsePreset, pulseIntervalMs,
    isSandbox, syncing, syncStepIndex, lastSyncTime,
    portfolioBootstrapping, holdingsLoading, holdingsHydrated, hasCachedRobinhoodSession, autoRestoreNonce,
    equityDiagnostic, equityDiagnosticLoading, hiddenHoldings, autoHideWarrants,
    refreshHiddenHoldings, refreshConnectionMode,
    fetchPortfolio, fetchWatchlist, handleAddToWatchlist, handleRemoveFromWatchlist,
    handleHideHolding, handleUnhideHolding, handleSeedMockAssets,
    cancelSync, isSyncStale, formatLastSync, loadPortfolioForProfile, runEquityDiagnostic,
    setAutoHideWarrants,
  ]);
}
