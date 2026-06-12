// ./sidekick/src/app/hooks/domains/useSidekickOracle.js
/**
 * Oracle domain — gut guesses, catalyst watches, scenario oracle, scorecards, macro brief.
 * Created by: Roy Dawson IV
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  localDb,
  createCatalystId,
  normalizeTickerList,
  computeForwardOutlook,
  findCatalystForTicker,
  isCatalystActive,
  buildInvestorBrief,
  enrichOutlookWithMacro,
  getPortfolioMacroAlerts,
  suggestCatalystFromMacro,
  buildScenarioOracle,
  fetchLiveMarketRegime,
  getCachedMarketRegime,
  regimeConfidenceAdjust,
  buildFalsifierRules,
  evaluateFalsifierRules,
  applyFalsifierOverlay,
  createOracleSnapshot,
  shouldCreateSnapshot,
  processDueScorecards,
  refreshMacroBriefCache,
} from '../../../serverless';
import { sidekickFetch } from '../../../lib/sidekickClient';
import { buildGuessAnalytics } from '../../../serverless/guessAnalytics';

export function useSidekickOracle(shell, profilesDomain, portfolioDomain, strategyDomain) {
  const { activeTab, showToast, setLoading, setCatalystModalOpen } = shell;
  const { activeProfile } = profilesDomain;
  const { holdings, lastSyncTime } = portfolioDomain;
  const {
    selectedTicker, chartData, advisorData, viabilityData, viabilityHorizon,
    fetchStockHistoryAndAdvisor,
  } = strategyDomain;

  const [guesses, setGuesses] = useState({ pending: [], completed: [] });
  const [analytics, setAnalytics] = useState(null);
  const [guessForm, setGuessForm] = useState({ target_price: '', timeframe_days: 30 });
  const [marketRegime, setMarketRegime] = useState(() => getCachedMarketRegime());
  const [oracleScorecards, setOracleScorecards] = useState([]);
  const [catalystWatches, setCatalystWatches] = useState([]);
  const [catalystForm, setCatalystForm] = useState({
    id: null,
    ticker: '',
    title: '',
    event_date: null,
    bias: 'watch',
    associated_tickers: '',
    notes: '',
    soften_abort: true,
  });

  const weakSessionDebounceRef = useRef(null);
  const lastScorecardProcessRef = useRef(0);
  const [weakSessionTick, setWeakSessionTick] = useState(0);

  const fetchMarketRegime = useCallback(async () => {
    try {
      const res = await sidekickFetch('/market/regime');
      if (res.ok) {
        setMarketRegime(await res.json());
        return;
      }
    } catch {
      // fall through
    }
    try {
      setMarketRegime(await fetchLiveMarketRegime());
    } catch {
      setMarketRegime(getCachedMarketRegime());
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchMarketRegime();
      void refreshMacroBriefCache(localDb);
    });
  }, [fetchMarketRegime]);

  useEffect(() => {
    if (!activeProfile?.id) return;
    queueMicrotask(() => {
      setOracleScorecards(localDb.getOracleScorecards(activeProfile.id));
    });
  }, [activeProfile?.id]);

  useEffect(() => {
    queueMicrotask(() => {
      if (!activeProfile) {
        setCatalystWatches([]);
        return;
      }
      setCatalystWatches(localDb.getCatalystWatches(activeProfile.id));
    });
  }, [activeProfile]);

  useEffect(() => () => {
    if (weakSessionDebounceRef.current) clearTimeout(weakSessionDebounceRef.current);
  }, []);

  const refreshCatalystWatches = useCallback(() => {
    if (!activeProfile) return;
    setCatalystWatches(localDb.getCatalystWatches(activeProfile.id));
  }, [activeProfile]);

  const investorBrief = useMemo(() => buildInvestorBrief(), []);

  const portfolioMacroAlerts = useMemo(
    () => getPortfolioMacroAlerts(holdings),
    [holdings],
  );

  const openCatalystModal = useCallback((ticker, existing = null) => {
    const t = String(ticker || '').toUpperCase();
    const seed = existing || suggestCatalystFromMacro(t);
    if (seed) {
      setCatalystForm({
        id: seed.id || null,
        ticker: t,
        title: seed.title || '',
        event_date: seed.event_date ? String(seed.event_date).slice(0, 10) : null,
        bias: seed.bias || 'watch',
        associated_tickers: Array.isArray(seed.associated_tickers)
          ? seed.associated_tickers.join(', ')
          : (seed.associated_tickers || ''),
        notes: seed.notes || '',
        soften_abort: seed.soften_abort !== false,
      });
    } else {
      setCatalystForm({
        id: null,
        ticker: t,
        title: '',
        event_date: null,
        bias: 'watch',
        associated_tickers: '',
        notes: '',
        soften_abort: true,
      });
    }
    setCatalystModalOpen(true);
  }, [setCatalystModalOpen]);

  const closeCatalystModal = useCallback(() => {
    setCatalystModalOpen(false);
  }, [setCatalystModalOpen]);

  const handleSaveCatalystWatch = useCallback(async (e) => {
    e.preventDefault();
    if (!activeProfile || !catalystForm.ticker || !catalystForm.title.trim()) return;
    setLoading(true);
    try {
      const payload = {
        id: catalystForm.id || createCatalystId(),
        profile_id: activeProfile.id,
        ticker: catalystForm.ticker.toUpperCase(),
        title: catalystForm.title.trim(),
        event_date: catalystForm.event_date || null,
        bias: catalystForm.bias,
        associated_tickers: normalizeTickerList(catalystForm.associated_tickers),
        notes: catalystForm.notes.trim(),
        soften_abort: catalystForm.soften_abort,
      };
      try {
        const res = await sidekickFetch('/catalyst-watches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, profile_id: activeProfile.id }),
        });
        if (!res.ok) throw new Error('API save failed');
      } catch {
        localDb.saveCatalystWatch(activeProfile.id, {
          ...payload,
          created_at: new Date().toISOString(),
        });
      }
      refreshCatalystWatches();
      closeCatalystModal();
      showToast(`Catalyst watch saved for ${payload.ticker}.`, 'success');
    } catch (err) {
      showToast(err.message || 'Could not save catalyst watch.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeProfile, catalystForm, refreshCatalystWatches, closeCatalystModal, showToast, setLoading]);

  const handleDeleteCatalystWatch = useCallback(async (watchId) => {
    if (!activeProfile || !watchId) return;
    setLoading(true);
    try {
      try {
        const res = await sidekickFetch('/catalyst-watches', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: activeProfile.id, id: watchId }),
        });
        if (!res.ok) throw new Error('API delete failed');
      } catch {
        localDb.deleteCatalystWatch(activeProfile.id, watchId);
      }
      refreshCatalystWatches();
      closeCatalystModal();
      showToast('Catalyst watch removed.', 'info');
    } finally {
      setLoading(false);
    }
  }, [activeProfile, refreshCatalystWatches, closeCatalystModal, showToast, setLoading]);

  const fetchGuesses = useCallback(async () => {
    if (!activeProfile) return;
    try {
      let data;
      try {
        const res = await sidekickFetch(`/guesses?profile_id=${activeProfile.id}`);
        if (!res.ok) throw new Error('API guesses endpoint non-OK');
        const list = await res.json();
        data = {
          pending: list.filter((g) => g.status === 'pending'),
          completed: list.filter((g) => g.status !== 'pending'),
        };
      } catch (apiErr) {
        console.warn('Serverless fallback: API guesses fetch failed, reading localDb:', apiErr.message);
        data = localDb.getGuesses(activeProfile.id);
      }

      const pending = data.pending.map((g) => {
        const hold = holdings.find((h) => h.ticker.toUpperCase() === g.ticker.toUpperCase());
        const currentPrice = hold && !hold.price_stale && hold.current_price != null
          ? hold.current_price
          : g.initial_price;

        const guessDate = new Date(g.guess_date);
        guessDate.setDate(guessDate.getDate() + g.timeframe_days);

        return {
          ...g,
          current_price: currentPrice,
          deviation_pct: g.initial_price > 0 ? ((currentPrice - g.initial_price) / g.initial_price) * 100 : 0,
          target_date: guessDate.toISOString().slice(0, 10),
        };
      });

      const completed = data.completed.map((g) => {
        const resolvedAt = g.resolved_date || g.resolved_at || g.guess_date;
        const resolvedAtStr = new Date(resolvedAt).toISOString().slice(0, 10);
        return {
          ...g,
          actual_end_price: g.actual_end_price ?? null,
          resolved_at: resolvedAtStr,
        };
      });

      setGuesses({ pending, completed });
    } catch (err) {
      console.error('Error fetching guesses:', err);
    }
  }, [activeProfile, holdings]);

  const fetchAnalytics = useCallback(async () => {
    if (!activeProfile) return;
    try {
      try {
        const res = await sidekickFetch(`/guesses/analytics?profile_id=${activeProfile.id}`);
        if (!res.ok) throw new Error('API analytics endpoint non-OK');
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
      } catch (apiErr) {
        console.warn('Serverless fallback: API analytics fetch failed, calculating locally:', apiErr.message);
        const data = localDb.getGuesses(activeProfile.id);
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
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  }, [activeProfile]);

  useEffect(() => {
    if (!activeProfile) return;
    queueMicrotask(() => {
      void Promise.all([fetchGuesses(), fetchAnalytics()]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profile-scoped oracle load
  }, [activeProfile]);

  const handleCreateGuess = useCallback(async (e) => {
    e.preventDefault();
    if (!selectedTicker) return;

    const targetPrice = parseFloat(guessForm.target_price);
    const timeframeDays = parseInt(guessForm.timeframe_days, 10);

    if (Number.isNaN(targetPrice) || targetPrice <= 0) {
      showToast('Target price must be a positive number greater than zero.', 'error');
      return;
    }
    if (Number.isNaN(timeframeDays) || timeframeDays <= 0) {
      showToast('Timeframe must be a positive number of days greater than zero.', 'error');
      return;
    }

    try {
      const livePrice = chartData.length > 0 ? chartData[chartData.length - 1].close_price : 100.0;
      try {
        const res = await sidekickFetch('/guesses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile_id: activeProfile.id,
            ticker: selectedTicker.toUpperCase().trim(),
            target_price: targetPrice,
            timeframe_days: timeframeDays,
          }),
        });
        if (!res.ok) throw new Error('API guesses non-OK');
        showToast('Gut Guess submitted to The Oracle! Live Tracking active.', 'success');
      } catch (apiErr) {
        console.warn('Serverless fallback: API create guess failed, using localDb:', apiErr.message);
        localDb.createGuess(activeProfile.id, selectedTicker, targetPrice, livePrice, timeframeDays);
        showToast('Gut Guess submitted to The Oracle! Tracking active.', 'success');
      }

      setGuessForm({ target_price: '', timeframe_days: 30 });
      await fetchGuesses();
      await fetchAnalytics();
      if (selectedTicker) await fetchStockHistoryAndAdvisor();
    } catch {
      showToast('Failed to submit guess.', 'error');
    }
  }, [activeProfile, guessForm, selectedTicker, chartData, showToast, fetchGuesses, fetchAnalytics, fetchStockHistoryAndAdvisor]);

  const activeCatalystWatches = useMemo(
    () => catalystWatches.filter((c) => isCatalystActive(c)),
    [catalystWatches],
  );

  const selectedHolding = useMemo(
    () => holdings.find((h) => h.ticker.toUpperCase() === String(selectedTicker).toUpperCase()) || null,
    [holdings, selectedTicker],
  );

  const selectedForwardOutlook = useMemo(() => {
    const catalyst = findCatalystForTicker(catalystWatches, selectedTicker);
    const base = computeForwardOutlook(
      selectedHolding || { advisor_score: advisorData?.score ?? null },
      catalyst,
    );
    return enrichOutlookWithMacro(base, selectedTicker);
  }, [catalystWatches, selectedTicker, selectedHolding, advisorData]);

  const weakSessionCount = useMemo(() => {
    void weakSessionTick;
    if (!activeProfile?.id) return 0;
    const map = localDb.getOracleWeakSessions(activeProfile.id);
    return map[String(selectedTicker).toUpperCase()]?.count || 0;
  }, [activeProfile?.id, selectedTicker, weakSessionTick]);

  useEffect(() => {
    if (activeTab !== 'oracle' || !activeProfile?.id) return;
    const advisor = selectedHolding?.advisor_score ?? advisorData?.score ?? null;
    if (advisor == null) return;
    if (weakSessionDebounceRef.current) clearTimeout(weakSessionDebounceRef.current);
    weakSessionDebounceRef.current = setTimeout(() => {
      localDb.touchOracleWeakSession(activeProfile.id, selectedTicker, advisor);
      queueMicrotask(() => setWeakSessionTick((n) => n + 1));
    }, 1000);
    return () => {
      if (weakSessionDebounceRef.current) clearTimeout(weakSessionDebounceRef.current);
    };
  }, [activeTab, activeProfile?.id, selectedTicker, advisorData?.score, selectedHolding?.advisor_score]);

  const scenarioOracle = useMemo(() => {
    if (activeTab !== 'oracle') return null;

    const base = buildScenarioOracle({
      ticker: selectedTicker,
      currentPrice: selectedHolding?.current_price ?? chartData?.[chartData.length - 1]?.close_price,
      advisorScore: selectedHolding?.advisor_score ?? advisorData?.score ?? null,
      viability: viabilityData,
      forwardOutlook: selectedForwardOutlook,
      guessAnalytics: analytics,
      priceStale: selectedHolding?.price_stale === true,
      horizon: viabilityHorizon,
      regime: marketRegime,
    });
    if (!base || base.oracle_stance === 'INSUFFICIENT_DATA') return base;

    const advisor = selectedHolding?.advisor_score ?? advisorData?.score ?? null;
    const rules = buildFalsifierRules({
      ...base.levels,
      advisorScore: advisor,
      weakSessionCount,
    });
    const falsifierEval = evaluateFalsifierRules({
      currentPrice: base.current_price,
      rules,
      advisorScore: advisor,
    });
    const regimeAdjust = regimeConfidenceAdjust(marketRegime);
    return applyFalsifierOverlay(base, falsifierEval, { ...regimeAdjust, regime: marketRegime });
  }, [
    activeTab, selectedForwardOutlook, analytics, marketRegime, weakSessionCount,
    selectedTicker, chartData, advisorData, viabilityData, viabilityHorizon, selectedHolding,
  ]);

  const processOracleScorecards = useCallback(async () => {
    if (!activeProfile?.id) return;
    const livePrices = {};
    for (const h of holdings) {
      if (h.current_price > 0) livePrices[h.ticker] = h.current_price;
    }
    try {
      const res = await sidekickFetch('/oracle/scorecards/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: activeProfile.id, live_prices: livePrices }),
      });
      if (res.ok) {
        const data = await res.json();
        setOracleScorecards(data.scorecards || localDb.getOracleScorecards(activeProfile.id));
        if (data.new_scorecards?.length) {
          showToast(`Oracle graded ${data.new_scorecards.length} post-event scorecard(s)`, 'info');
        }
        return;
      }
    } catch {
      // local fallback
    }
    const snapshots = localDb.getOracleSnapshots(activeProfile.id);
    const { snapshots: updated, scorecards: newCards } = processDueScorecards(snapshots, livePrices);
    localDb.saveOracleSnapshots(activeProfile.id, updated);
    if (newCards.length) {
      localDb.appendOracleScorecards(activeProfile.id, newCards);
      setOracleScorecards(localDb.getOracleScorecards(activeProfile.id));
      showToast(`Oracle graded ${newCards.length} post-event scorecard(s)`, 'info');
    }
  }, [activeProfile, holdings, showToast]);

  const oracleSnapshotEventDate = useMemo(
    () => selectedForwardOutlook?.macro_events?.[0]?.event_date
      || selectedForwardOutlook?.catalyst?.event_date,
    [selectedForwardOutlook],
  );
  const scenarioOracleStance = scenarioOracle?.oracle_stance;

  useEffect(() => {
    if (activeTab !== 'oracle' || !activeProfile?.id || !scenarioOracle?.ticker || scenarioOracleStance === 'INSUFFICIENT_DATA') return;
    const snapshots = localDb.getOracleSnapshots(activeProfile.id);
    if (!shouldCreateSnapshot(snapshots, selectedTicker, oracleSnapshotEventDate)) return;
    const snap = { ...createOracleSnapshot(scenarioOracle, selectedForwardOutlook), status: 'open' };
    localDb.saveOracleSnapshots(activeProfile.id, [...snapshots, snap].slice(-30));
  }, [
    activeProfile?.id,
    scenarioOracleStance,
    oracleSnapshotEventDate,
    scenarioOracle,
    selectedForwardOutlook,
    activeTab,
    selectedTicker,
  ]);

  useEffect(() => {
    if (activeTab !== 'oracle' || !activeProfile?.id || holdings.length === 0) return;
    if (Date.now() - lastScorecardProcessRef.current < 600_000) return;
    lastScorecardProcessRef.current = Date.now();
    queueMicrotask(() => {
      void processOracleScorecards();
    });
  }, [lastSyncTime, activeProfile, holdings.length, processOracleScorecards, activeTab]);

  return useMemo(() => ({
    guesses,
    setGuesses,
    analytics,
    setAnalytics,
    guessForm,
    setGuessForm,
    marketRegime,
    fetchMarketRegime,
    oracleScorecards,
    processOracleScorecards,
    catalystWatches,
    activeCatalystWatches,
    catalystForm,
    setCatalystForm,
    openCatalystModal,
    closeCatalystModal,
    handleSaveCatalystWatch,
    handleDeleteCatalystWatch,
    refreshCatalystWatches,
    fetchGuesses,
    fetchAnalytics,
    handleCreateGuess,
    selectedForwardOutlook,
    scenarioOracle,
    investorBrief,
    portfolioMacroAlerts,
    suggestCatalystFromMacro,
  }), [
    guesses, analytics, guessForm, marketRegime, fetchMarketRegime, oracleScorecards,
    processOracleScorecards, catalystWatches, activeCatalystWatches, catalystForm,
    openCatalystModal, closeCatalystModal, handleSaveCatalystWatch, handleDeleteCatalystWatch,
    refreshCatalystWatches, fetchGuesses, fetchAnalytics, handleCreateGuess,
    selectedForwardOutlook, scenarioOracle, investorBrief, portfolioMacroAlerts,
  ]);
}
