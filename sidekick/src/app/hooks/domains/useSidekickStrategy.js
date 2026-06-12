// ./sidekick/src/app/hooks/domains/useSidekickStrategy.js
/**
 * Strategy domain — chart/advisor, viability, strategy brackets, indicators, import/adjust.
 * Created by: Roy Dawson IV
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  localDb,
  generateRecommendation,
  fetchPublicHistoricalPrices,
  fetchPublicQuote,
  evolveWeights,
  generateViabilityForecast,
  calculateAtr,
  DEFAULT_INDICATORS,
  RISK_PROFILES,
  INDICATOR_META,
  getIndicatorConfig,
} from '../../../serverless';
import { sidekickFetch } from '../../../lib/sidekickClient';
import { formatCurrency } from '../../utils/formatters';
import { classifyHoldingZone } from '../../utils/holdingDisplay';
import { useChartPaths } from '../useChartPaths';

export function useSidekickStrategy(shell, profilesDomain, portfolioDomain, bridgeApi) {
  const { showToast, setLoading, setIsImportOpen } = shell;
  const { activeProfile } = profilesDomain;
  const { holdings, watchlist, fetchPortfolio } = portfolioDomain;

  const [selectedTicker, setSelectedTicker] = useState('NVDA');
  const [chartData, setChartData] = useState([]);
  const [advisorData, setAdvisorData] = useState(null);
  const [chartOverlays, setChartOverlays] = useState({
    sma50: true,
    bollinger: true,
    signals: true,
  });

  const [indicatorSettings, setIndicatorSettings] = useState(() => getIndicatorConfig());
  const [riskProfile, setRiskProfile] = useState(() => localDb.getSettings().riskProfile || 'balanced');

  const [debugMode, setDebugModeState] = useState(
    () => localDb.getSettings().debugMode === true,
  );
  const persistDebugMode = useCallback((enabled) => {
    setDebugModeState(enabled);
    localDb.saveSettings({ debugMode: enabled });
  }, []);

  const [clipboardText, setClipboardText] = useState('');
  const [holdingForm, setHoldingForm] = useState({ shares: '', avg_buy_price: '' });

  const [viabilityData, setViabilityData] = useState(null);
  const [viabilityHorizon, setViabilityHorizon] = useState('week');
  const [viabilityWeights, setViabilityWeights] = useState({ rsi: 35, macd: 35, trend: 30 });
  const [strategyBrackets, setStrategyBrackets] = useState(null);
  const [evolutionMetrics, setEvolutionMetrics] = useState(null);
  const [shifterForm, setShifterForm] = useState({ sellTicker: '', buyTicker: '', amount: '' });
  const [strategyLoading, setStrategyLoading] = useState(false);

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
    showToast(`Applied "${preset.label}" risk profile to ${activeProfile?.name || 'this profile'}. Analysis recalculated.`, 'success');
  }, [persistIndicatorSettings, showToast, activeProfile]);

  const updateIndicatorField = useCallback((key, rawValue) => {
    const meta = INDICATOR_META[key];
    let value = parseFloat(rawValue);
    if (Number.isNaN(value)) return;
    if (meta) value = Math.max(meta.min, Math.min(meta.max, value));
    setIndicatorSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (activeProfile) localDb.saveIndicatorSettings(activeProfile.id, { indicators: next, riskProfile: 'custom' });
      return next;
    });
    setRiskProfile('custom');
  }, [activeProfile]);

  const resetIndicatorDefaults = useCallback(() => {
    persistIndicatorSettings({ ...DEFAULT_INDICATORS }, 'balanced');
    showToast('Indicators reset to Balanced defaults.', 'info');
  }, [persistIndicatorSettings, showToast]);

  useEffect(() => {
    if (!activeProfile) return;
    const saved = localDb.getIndicatorSettings(activeProfile.id);
    const cfg = getIndicatorConfig(activeProfile.id);
    queueMicrotask(() => {
      setIndicatorSettings(cfg);
      setRiskProfile(saved?.riskProfile || 'balanced');
    });
  }, [activeProfile]);

  const alert = useCallback((msg) => {
    let type = 'info';
    const lower = msg.toLowerCase();
    if (lower.includes('fail') || lower.includes('error')) {
      type = 'error';
    } else if (lower.includes('success') || lower.includes('removed') || lower.includes('created') || lower.includes('adjusted') || lower.includes('imported')) {
      type = 'success';
    }
    showToast(msg, type);
  }, [showToast]);

  const memoizedChartPaths = useChartPaths(chartData, chartOverlays, indicatorSettings);

  const allAvailableTickers = useMemo(() => {
    const list = new Set();
    holdings.forEach((h) => list.add(h.ticker.toUpperCase()));
    watchlist.forEach((w) => list.add(w.ticker.toUpperCase()));
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

  const fetchStockHistoryAndAdvisor = useCallback(async () => {
    try {
      let dataHist;
      try {
        const res = await sidekickFetch(`/stocks/history?ticker=${selectedTicker}&span=year`);
        if (!res.ok) throw new Error('API stock history non-OK');
        dataHist = await res.json();
      } catch (apiErr) {
        console.warn('Serverless fallback: API stock history failed, reading public Quote:', apiErr.message);
        dataHist = await fetchPublicHistoricalPrices(selectedTicker, 'year');
      }

      setChartData(dataHist || []);
      const holdingMatch = holdings.find((h) => h.ticker.toUpperCase() === selectedTicker.toUpperCase());
      const livePrice = holdingMatch && !holdingMatch.price_stale && holdingMatch.current_price > 0
        ? holdingMatch.current_price
        : (dataHist.length > 0 ? dataHist[dataHist.length - 1].close_price : null);

      if (livePrice != null && activeProfile) {
        try {
          localDb.resolveGuesses(activeProfile.id, selectedTicker, livePrice);
          bridgeApi.current.fetchGuesses?.();
          bridgeApi.current.fetchAnalytics?.();
        } catch {
          // Guess resolution is best-effort during chart refresh.
        }
      }

      let dataAdv;
      try {
        const res = await sidekickFetch(`/advisor/recommendation?profile_id=${activeProfile.id}&ticker=${selectedTicker}`);
        if (!res.ok) throw new Error('API recommendation non-OK');
        dataAdv = await res.json();
      } catch (apiErr) {
        console.warn('Serverless fallback: API recommendation failed, generating locally:', apiErr.message);
        dataAdv = generateRecommendation(activeProfile.id, selectedTicker, dataHist, livePrice);
      }

      setAdvisorData(dataAdv?.insufficient_data ? null : dataAdv);

      let dataViability;
      try {
        const res = await sidekickFetch(`/advisor/viability?profile_id=${activeProfile.id}&ticker=${selectedTicker}`);
        if (!res.ok) throw new Error('API viability forecast non-OK');
        dataViability = await res.json();
      } catch (apiErr) {
        console.warn('Serverless fallback: API viability forecast failed, generating locally:', apiErr.message);
        dataViability = generateViabilityForecast(activeProfile.id, selectedTicker, dataHist, livePrice);
      }
      setViabilityData(dataViability);

      const match = holdings.find((h) => h.ticker.toUpperCase() === selectedTicker.toUpperCase());
      if (match) {
        setHoldingForm({ shares: match.shares, avg_buy_price: match.avg_buy_price });
      } else {
        setHoldingForm({ shares: '', avg_buy_price: '' });
      }
    } catch (err) {
      console.error('Error loading stock analytics:', err);
    }
  }, [activeProfile, selectedTicker, holdings, bridgeApi]);

  const fetchStrategyBrackets = useCallback(async () => {
    if (!activeProfile || !selectedTicker || chartData.length < 5) return;
    setStrategyLoading(true);
    try {
      try {
        const res = await sidekickFetch(`/strategy/brackets?profile_id=${activeProfile.id}&ticker=${selectedTicker}`);
        if (!res.ok) throw new Error('API strategy brackets non-OK');
        const data = await res.json();
        setStrategyBrackets(data);
      } catch (apiErr) {
        console.warn('Serverless fallback: API strategy brackets failed, calculating locally:', apiErr.message);
        const livePrice = chartData[chartData.length - 1].close_price;
        const closes = chartData.map((d) => d.close_price);

        const subset = closes.slice(-20);
        const mid = subset.reduce((a, b) => a + b, 0) / 20.0;
        const variance = subset.reduce((sum, x) => sum + (x - mid) ** 2, 0) / 20.0;
        const std = Math.sqrt(variance);
        const lowerBB = mid - std * 2;
        const upperBB = mid + std * 2;

        const atrVal = calculateAtr(
          chartData.map((d) => d.high_price || d.close_price),
          chartData.map((d) => d.low_price || d.close_price),
          closes,
          14,
        );

        setStrategyBrackets({
          ticker: selectedTicker,
          current_price: livePrice,
          brackets: {
            scale_out: [
              { label: 'Bollinger Resistance Limit', price: Math.round(upperBB * 100) / 100, shares: 10, yield: Math.round((upperBB - livePrice) * 10 * 100) / 100 },
              { label: 'Target Profit Threshold', price: Math.round(livePrice * 1.15 * 100) / 100, shares: 5, yield: Math.round((livePrice * 0.15) * 5 * 100) / 100 },
            ],
            scale_in: [
              { label: 'ATR Dynamic Pullback Level', price: Math.max(0.01, Math.round((livePrice - 1.5 * atrVal) * 100) / 100), shares: 10, dca_cost: Math.round((livePrice - 1.5 * atrVal) * 10 * 100) / 100 },
              { label: 'Bollinger Support floor', price: Math.round(lowerBB * 100) / 100, shares: 20, dca_cost: Math.round(lowerBB * 20 * 100) / 100 },
            ],
          },
        });
      }
    } catch (err) {
      console.error('Error fetching strategy brackets:', err);
    } finally {
      setStrategyLoading(false);
    }
  }, [activeProfile, selectedTicker, chartData]);

  useEffect(() => {
    if (!activeProfile) return;
    queueMicrotask(() => {
      bridgeApi.current.fetchGuesses?.();
      bridgeApi.current.fetchAnalytics?.();
      bridgeApi.current.fetchShadowCoachData?.(Date.now());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- profile-scoped cross-domain refresh
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

  const handleImportClipboard = useCallback(async (e) => {
    e.preventDefault();
    if (!clipboardText.trim()) return;
    setLoading(true);
    try {
      const regex = /([A-Z]{1,5})\s+([\d,.]+)\s+shares\s+[^$]*\$([\d,.]+)\s+average\s+cost/gi;
      let match;
      let count = 0;

      while ((match = regex.exec(clipboardText)) !== null) {
        const ticker = match[1].toUpperCase();
        const shares = parseFloat(match[2].replace(/,/g, ''));
        const avgCost = parseFloat(match[3].replace(/,/g, ''));

        const livePrice = await fetchPublicQuote(ticker);
        try {
          const res = await sidekickFetch('/portfolio/holdings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profile_id: activeProfile.id,
              ticker,
              shares,
              avg_buy_price: avgCost,
              current_price: livePrice,
            }),
          });
          if (!res.ok) throw new Error('API holding import non-OK');
        } catch {
          localDb.updateHolding(activeProfile.id, ticker, shares, avgCost, livePrice);
        }
        count++;
      }

      if (count > 0) {
        fetchPortfolio();
        bridgeApi.current.fetchGuesses?.();
        bridgeApi.current.fetchAnalytics?.();
        if (selectedTicker) void fetchStockHistoryAndAdvisor();
        setIsImportOpen(false);
        setClipboardText('');
        alert(`Direct Import successful! Parsed and loaded ${count} holdings.`);
      } else {
        alert('Parse failed. Expected format: NVDA 41.35 shares $212.49 average cost');
      }
    } catch {
      alert('Failed to import clipboard.');
    } finally {
      setLoading(false);
    }
  }, [clipboardText, activeProfile, selectedTicker, fetchPortfolio, fetchStockHistoryAndAdvisor, bridgeApi, setLoading, setIsImportOpen, alert]);

  const handleAdjustHolding = useCallback(async (e) => {
    e.preventDefault();
    if (!selectedTicker) return;
    try {
      const shares = parseFloat(holdingForm.shares || 0);
      const avgPrice = parseFloat(holdingForm.avg_buy_price || 0);
      const ticker = selectedTicker.toUpperCase().trim();
      let livePrice = await fetchPublicQuote(ticker);
      if (!(livePrice > 0) && chartData.length > 0) {
        livePrice = chartData[chartData.length - 1].close_price;
      }
      if (!(livePrice > 0)) {
        livePrice = avgPrice;
      }

      try {
        const res = await sidekickFetch('/portfolio/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile_id: activeProfile.id,
            ticker,
            shares,
            avg_buy_price: avgPrice,
            current_price: livePrice,
          }),
        });
        if (!res.ok) throw new Error('API adjust holding non-OK');
        showToast('Holding updated.', 'success');
      } catch (apiErr) {
        console.warn('Serverless fallback: API adjust holding failed, using localDb:', apiErr.message);
        localDb.updateHolding(activeProfile.id, ticker, shares, avgPrice, livePrice);
        showToast('Holding updated locally.', 'success');
      }

      await fetchPortfolio();
      if (ticker) {
        await fetchStockHistoryAndAdvisor();
      }
    } catch {
      showToast('Failed to adjust holding.', 'error');
    }
  }, [selectedTicker, holdingForm, chartData, activeProfile, fetchPortfolio, fetchStockHistoryAndAdvisor, showToast]);

  const handleForceEvolve = useCallback(async () => {
    if (!selectedTicker || !activeProfile || chartData.length < 35) return;
    setLoading(true);
    try {
      try {
        const res = await sidekickFetch('/advisor/evolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile_id: activeProfile.id,
            ticker: selectedTicker.toUpperCase().trim(),
          }),
        });
        if (!res.ok) throw new Error('API evolve weights non-OK');
        const data = await res.json();

        void fetchStockHistoryAndAdvisor();
        if (data.epochs) {
          setEvolutionMetrics(data.epochs);
        }
        alert(`Advisor brain evolved! Weights calibrated historically: RSI=${data.weights.rsi_weight}, MACD=${data.weights.macd_weight}, Trend=${data.weights.trend_weight}, Gut=${data.weights.gut_weight}`);
      } catch (apiErr) {
        console.warn('Serverless fallback: API weights evolve failed, using local evolution:', apiErr.message);
        const data = evolveWeights(activeProfile.id, selectedTicker, chartData);
        if (data.status === 'success') {
          void fetchStockHistoryAndAdvisor();
          if (data.epochs) {
            setEvolutionMetrics(data.epochs);
          }
          alert(`Advisor brain evolved! Weights calibrated historically: RSI=${data.weights.rsi_weight}, MACD=${data.weights.macd_weight}, Trend=${data.weights.trend_weight}, Gut=${data.weights.gut_weight}`);
        } else {
          alert('Insufficient historical data to evolve weights.');
        }
      }
    } catch {
      alert('Evolution failed.');
    } finally {
      setLoading(false);
    }
  }, [selectedTicker, activeProfile, chartData, fetchStockHistoryAndAdvisor, setLoading, alert]);

  return useMemo(() => ({
    selectedTicker,
    setSelectedTicker,
    chartData,
    setChartData,
    advisorData,
    setAdvisorData,
    chartOverlays,
    setChartOverlays,
    indicatorSettings,
    riskProfile,
    clipboardText,
    setClipboardText,
    holdingForm,
    setHoldingForm,
    viabilityData,
    setViabilityData,
    viabilityHorizon,
    setViabilityHorizon,
    viabilityWeights,
    setViabilityWeights,
    strategyBrackets,
    setStrategyBrackets,
    evolutionMetrics,
    setEvolutionMetrics,
    shifterForm,
    setShifterForm,
    strategyLoading,
    persistIndicatorSettings,
    applyRiskProfile,
    updateIndicatorField,
    resetIndicatorDefaults,
    memoizedChartPaths,
    allAvailableTickers,
    handleCycleTicker,
    fetchStockHistoryAndAdvisor,
    fetchStrategyBrackets,
    handleImportClipboard,
    handleAdjustHolding,
    handleForceEvolve,
    alert,
    formatCurrency,
    classifyHoldingZone,
    debugMode,
    persistDebugMode,
    RISK_PROFILES,
    INDICATOR_META,
    DEFAULT_INDICATORS,
    calculateAtr,
    localDb,
    sidekickFetch,
    fetchPublicQuote,
    generateViabilityForecast,
    evolveWeights,
    generateRecommendation,
  }), [
    selectedTicker, chartData, advisorData, chartOverlays, indicatorSettings, riskProfile,
    clipboardText, holdingForm, viabilityData, viabilityHorizon, viabilityWeights,
    strategyBrackets, evolutionMetrics, shifterForm, strategyLoading,
    persistIndicatorSettings, applyRiskProfile, updateIndicatorField, resetIndicatorDefaults,
    memoizedChartPaths, allAvailableTickers, handleCycleTicker,
    fetchStockHistoryAndAdvisor, fetchStrategyBrackets, handleImportClipboard,
    handleAdjustHolding, handleForceEvolve, alert, debugMode, persistDebugMode,
  ]);
}
