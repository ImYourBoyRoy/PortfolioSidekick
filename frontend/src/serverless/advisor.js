// ./frontend/src/serverless/advisor.js
/**
 * Portfolio Sidekick Serverless Advisor & Technical Scanners
 * Pure JavaScript implementations of technical indicator calculations,
 * regime filters, recommendation scorers, and multi-epoch ROI-based backtesting loops.
 * Ported directly from backend/advisor.py.
 *
 * Created by: Roy Dawson IV
 */

import { localDb } from './database';

// ─── Configurable Indicator Engine ───
// Default tuning for every technical indicator the advisor uses. Users can edit
// these in Settings, or apply a Risk Profile preset. All scoring functions read
// the live config via getIndicatorConfig() so edits take effect immediately.
export const DEFAULT_INDICATORS = {
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bbPeriod: 20,
  bbStdDev: 2,
  smaFast: 50,
  smaSlow: 200,
  atrPeriod: 14,
  atrStopMultiplier: 2.5,
  buyThreshold: 65,
  sellThreshold: 35,
};

// Risk/goal presets. Each only overrides the fields that define its posture;
// the rest fall back to DEFAULT_INDICATORS.
export const RISK_PROFILES = {
  conservative: {
    label: 'Conservative',
    tagline: 'Capital preservation • fewer, higher-conviction signals',
    description:
      'Slower, smoother indicators and wider bands. Waits for stretched, well-confirmed extremes before flagging Buy/Sell, which reduces false signals and whipsaw at the cost of acting later.',
    settings: {
      rsiPeriod: 21,
      rsiOversold: 25,
      rsiOverbought: 75,
      macdFast: 19,
      macdSlow: 39,
      macdSignal: 9,
      bbPeriod: 25,
      bbStdDev: 2.5,
      atrStopMultiplier: 3.0,
      buyThreshold: 72,
      sellThreshold: 28,
    },
  },
  balanced: {
    label: 'Balanced',
    tagline: 'Standard textbook settings • the default',
    description:
      'The classic, widely-used indicator periods (RSI 14, MACD 12/26/9, Bollinger 20/2). A neutral middle ground between responsiveness and stability suitable for most swing-trading goals.',
    settings: { ...DEFAULT_INDICATORS },
  },
  aggressive: {
    label: 'Aggressive',
    tagline: 'Momentum capture • earlier, more frequent signals',
    description:
      'Faster, more reactive indicators and tighter bands. Surfaces entries and exits sooner to chase momentum, at the cost of more noise and false positives. Best for active, higher-risk-tolerance goals.',
    settings: {
      rsiPeriod: 9,
      rsiOversold: 35,
      rsiOverbought: 65,
      macdFast: 8,
      macdSlow: 21,
      macdSignal: 5,
      bbPeriod: 14,
      bbStdDev: 1.5,
      atrStopMultiplier: 2.0,
      buyThreshold: 58,
      sellThreshold: 42,
    },
  },
};

// User-facing metadata for the Settings editor: label, plain-English help,
// safe bounds, and which logical group each field belongs to.
export const INDICATOR_META = {
  rsiPeriod: { label: 'RSI Period', group: 'Momentum (RSI)', min: 2, max: 50, step: 1,
    help: 'Look-back days for Relative Strength Index. Lower = more reactive/noisier; higher = smoother/slower.' },
  rsiOversold: { label: 'RSI Oversold', group: 'Momentum (RSI)', min: 5, max: 45, step: 1,
    help: 'Below this RSI level a stock is considered oversold (a potential buy signal).' },
  rsiOverbought: { label: 'RSI Overbought', group: 'Momentum (RSI)', min: 55, max: 95, step: 1,
    help: 'Above this RSI level a stock is considered overbought (a potential sell/exit signal).' },
  macdFast: { label: 'MACD Fast EMA', group: 'Trend (MACD)', min: 2, max: 30, step: 1,
    help: 'Fast moving-average span. Smaller reacts quicker to recent price changes.' },
  macdSlow: { label: 'MACD Slow EMA', group: 'Trend (MACD)', min: 10, max: 60, step: 1,
    help: 'Slow moving-average span. The MACD line is Fast EMA minus Slow EMA.' },
  macdSignal: { label: 'MACD Signal', group: 'Trend (MACD)', min: 2, max: 20, step: 1,
    help: 'Smoothing of the MACD line. Crosses of MACD vs Signal generate momentum cues.' },
  bbPeriod: { label: 'Bollinger Period', group: 'Volatility (Bollinger Bands)', min: 5, max: 60, step: 1,
    help: 'Days used for the Bollinger moving average and standard deviation.' },
  bbStdDev: { label: 'Bollinger Std-Dev', group: 'Volatility (Bollinger Bands)', min: 1, max: 4, step: 0.1,
    help: 'How wide the bands sit from the average. 2 is standard; wider = fewer band touches.' },
  smaFast: { label: 'Fast SMA', group: 'Trend (Moving Averages)', min: 5, max: 100, step: 1,
    help: 'Short-term trend average (e.g. 50-day). Price above it is short-term bullish.' },
  smaSlow: { label: 'Slow SMA', group: 'Trend (Moving Averages)', min: 50, max: 300, step: 5,
    help: 'Long-term trend average (e.g. 200-day). Fast-above-slow is a Golden Cross.' },
  atrPeriod: { label: 'ATR Period', group: 'Risk (ATR Stops)', min: 2, max: 50, step: 1,
    help: 'Average True Range look-back. Measures recent volatility for stop placement.' },
  atrStopMultiplier: { label: 'ATR Stop Multiple', group: 'Risk (ATR Stops)', min: 0.5, max: 6, step: 0.1,
    help: 'Stop-loss distance = this many ATRs below price. Larger = looser stops.' },
  buyThreshold: { label: 'Buy Score Threshold', group: 'Decision Thresholds', min: 50, max: 95, step: 1,
    help: 'Overall blended score above which the advisor recommends BUY.' },
  sellThreshold: { label: 'Sell Score Threshold', group: 'Decision Thresholds', min: 5, max: 50, step: 1,
    help: 'Overall blended score below which the advisor recommends SELL.' },
};

export const getIndicatorConfig = () => {
  const saved = localDb.getSettings();
  return { ...DEFAULT_INDICATORS, ...(saved.indicators || {}) };
};

// ─── Mathematical Core Indicators ───

export const calculateRsi = (prices, period = 14) => {
  if (prices.length < period + 1) return 50.0;

  const deltas = [];
  for (let i = 0; i < prices.length - 1; i++) {
    deltas.push(prices[i + 1] - prices[i]);
  }

  const gains = deltas.map(d => (d > 0 ? d : 0.0));
  const losses = deltas.map(d => (d < 0 ? -d : 0.0));

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < deltas.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100.0;
  const rs = avgGain / avgLoss;
  return 100.0 - 100.0 / (1.0 + rs);
};

export const calculateEma = (prices, span) => {
  if (!prices || prices.length === 0) return [];
  const ema = [prices[0]];
  const multiplier = 2.0 / (span + 1.0);
  for (let i = 1; i < prices.length; i++) {
    const val = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
    ema.push(val);
  }
  return ema;
};

export const calculateMacd = (prices) => {
  if (prices.length < 26) return { macd: 0.0, signal: 0.0, hist: 0.0 };

  const ema12 = calculateEma(prices, 12);
  const ema26 = calculateEma(prices, 26);

  const macdLine = ema12.map((e12, idx) => e12 - ema26[idx]);
  const signalLine = calculateEma(macdLine, 9);
  
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const hist = macd - signal;

  return { macd, signal, hist };
};

export const calculateMacdCustom = (prices, fast, slow, signal) => {
  if (prices.length < slow) return { macd: 0.0, signal: 0.0, hist: 0.0 };

  const emaFast = calculateEma(prices, fast);
  const emaSlow = calculateEma(prices, slow);

  const macdLine = emaFast.map((ef, idx) => ef - emaSlow[idx]);
  const signalLine = calculateEma(macdLine, signal);
  
  const macd = macdLine[macdLine.length - 1];
  const signalVal = signalLine[signalLine.length - 1];
  const hist = macd - signalVal;

  return { macd, signal: signalVal, hist };
};

export const calculateBollingerBands = (prices, period = 20, numStd = 2) => {
  if (prices.length < period) {
    const curr = prices.length > 0 ? prices[prices.length - 1] : 100.0;
    return { upper: curr, mid: curr, lower: curr };
  }

  const subset = prices.slice(-period);
  const mid = subset.reduce((a, b) => a + b, 0) / period;
  const variance = subset.reduce((sum, x) => sum + Math.pow(x - mid, 2), 0) / period;
  const std = Math.sqrt(variance);

  return {
    upper: mid + std * numStd,
    mid: mid,
    lower: mid - std * numStd
  };
};

export const calculateAtr = (highs, lows, closes, period = 14) => {
  if (closes.length < 2) return 0.0;

  const trSeries = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      trSeries.push(highs[0] - lows[0]);
    } else {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trSeries.push(tr);
    }
  }

  if (trSeries.length < period) {
    return trSeries.reduce((a, b) => a + b, 0) / trSeries.length;
  }

  // Wilder's smoothing
  let atr = trSeries.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trSeries.length; i++) {
    atr = (atr * (period - 1) + trSeries[i]) / period;
  }

  return atr;
};

// ─── Score Translators ───

export const getRsiScore = (rsi, oversold = 30, overbought = 70) => {
  if (rsi <= oversold) return 90.0;
  if (rsi >= overbought) return 10.0;
  const span = overbought - oversold || 40.0;
  return 90.0 - ((rsi - oversold) / span) * 80.0;
};

export const getMacdScore = (macd, signal, hist) => {
  if (hist > 0) {
    return Math.min(85.0, 50.0 + (hist / (Math.abs(macd) + 1e-5)) * 100);
  } else {
    return Math.max(15.0, 50.0 + (hist / (Math.abs(macd) + 1e-5)) * 100);
  }
};

export const getTrendScore = (prices, fastSpan = 50, slowSpan = 200) => {
  if (prices.length < fastSpan) return 50.0;

  const smaFast = prices.slice(-fastSpan).reduce((a, b) => a + b, 0) / fastSpan;
  const currPrice = prices[prices.length - 1];

  if (prices.length >= slowSpan) {
    const smaSlow = prices.slice(-slowSpan).reduce((a, b) => a + b, 0) / slowSpan;
    if (currPrice > smaFast && smaFast > smaSlow) return 85.0;
    if (currPrice < smaFast && smaFast < smaSlow) return 15.0;
  }

  if (currPrice > smaFast) return 70.0;
  return 30.0;
};

export const getBbScore = (price, upper, lower) => {
  const range = upper - lower;
  if (range === 0) return 50.0;
  const relPos = (price - lower) / range;
  const score = 90.0 - relPos * 80.0;
  return Math.min(Math.max(score, 5.0), 95.0);
};

export const getGutScore = (profileId, ticker, currentPrice) => {
  const guesses = localDb.getGuesses(profileId);
  const active = guesses.pending.find(g => g.ticker === ticker.toUpperCase());

  if (!active) return 50.0;

  const target = active.target_price;
  if (target > currentPrice) {
    const expected = (target - currentPrice) / currentPrice;
    return Math.min(95.0, 60.0 + expected * 100);
  } else if (target < currentPrice) {
    const expected = (currentPrice - target) / currentPrice;
    return Math.max(5.0, 40.0 - expected * 100);
  }
  return 50.0;
};

// ─── Market Regime Filter (Fast, Safe Fallback Mock for Offline Client) ───

export const detectMarketRegime = () => {
  // Offline mock client default
  return {
    regime: "BULLISH",
    vix: 14.85,
    spy_above_200: true,
    qqq_above_200: true
  };
};

// ─── Unified Recommender Scorer ───

export const generateRecommendation = (profileId, ticker, historyData, currentPrice) => {
  const formattedTicker = ticker.toUpperCase().trim();

  if (!historyData || historyData.length < 5) {
    return {
      ticker: formattedTicker,
      action: "HOLD",
      score: 50.0,
      metrics: { rsi: 50.0, macd: 0.0, macd_signal: 0.0, upper_bb: currentPrice, lower_bb: currentPrice },
      scores: { rsi_score: 50.0, macd_score: 50.0, trend_score: 50.0, bb_score: 50.0, gut_score: 50.0 },
      weights: { rsi_weight: 0.25, macd_weight: 0.25, trend_weight: 0.25, gut_weight: 0.25 },
      regime_status: "BULLISH",
      vix_value: 15.0,
      spy_above_200: true,
      qqq_above_200: true,
      atr: 0.0,
      stop_loss_price: Math.round(currentPrice * 0.90 * 100) / 100,
      target_price: Math.round(currentPrice * 1.15 * 100) / 100,
      risk_to_reward_ratio: 1.5,
      is_asymmetric_risk: false,
      buy_threshold: 65.0,
      sell_threshold: 35.0
    };
  }

  const prices = historyData.map(d => parseFloat(d.close_price));
  const highs = historyData.map(d => parseFloat(d.high_price || d.close_price));
  const lows = historyData.map(d => parseFloat(d.low_price || d.close_price));

  // Live, user-tunable indicator configuration (Settings → Risk Profiles)
  const cfg = getIndicatorConfig();

  // Compute Core Metrics
  const rsi = calculateRsi(prices, cfg.rsiPeriod);
  const macdData = calculateMacdCustom(prices, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
  const bbData = calculateBollingerBands(prices, cfg.bbPeriod, cfg.bbStdDev);
  const atr = calculateAtr(highs, lows, prices, cfg.atrPeriod);

  // Individual Scores
  const sRsi = getRsiScore(rsi, cfg.rsiOversold, cfg.rsiOverbought);
  const sMacd = getMacdScore(macdData.macd, macdData.signal, macdData.hist);
  const sTrend = getTrendScore(prices, cfg.smaFast, cfg.smaSlow);
  const sBb = getBbScore(currentPrice, bbData.upper, bbData.lower);
  const sGut = getGutScore(profileId, formattedTicker, currentPrice);

  // Fetch db weights
  const w = localDb.getWeights(profileId, formattedTicker);
  let wRsi = w.rsi_weight;
  let wMacd = w.macd_weight;
  let wTrend = w.trend_weight;
  let wGut = w.gut_weight;

  // Normalize
  const totalWeight = wRsi + wMacd + wTrend + wGut;
  if (totalWeight === 0) {
    wRsi = 0.25; wMacd = 0.25; wTrend = 0.25; wGut = 0.25;
  } else {
    wRsi /= totalWeight;
    wMacd /= totalWeight;
    wTrend /= totalWeight;
    wGut /= totalWeight;
  }

  // Market Regime Guardrails
  const regime = detectMarketRegime();
  const isBearish = regime.regime === "BEARISH";

  let finalRsi = wRsi;
  let finalTrend = wTrend;
  let buyThreshold = cfg.buyThreshold;
  let sellThreshold = cfg.sellThreshold;

  if (isBearish) {
    const shift = wTrend * 0.40;
    finalTrend = wTrend - shift;
    finalRsi = wRsi + shift;
    buyThreshold = 78.0;
    sellThreshold = 45.0;
  }

  const score = Math.max(0.0, Math.min(100.0, sRsi * finalRsi + sMacd * wMacd + sTrend * finalTrend + sGut * wGut));

  let action = "HOLD";
  if (score > buyThreshold) action = "BUY";
  else if (score < sellThreshold) action = "SELL";

  // Volatility stop-loss
  const risk = atr > 0 ? cfg.atrStopMultiplier * atr : currentPrice * 0.10;
  const stopLoss = Math.max(0.01, Math.round((currentPrice - risk) * 100) / 100);

  // Profit target
  let target = bbData.upper > currentPrice ? bbData.upper : currentPrice * 1.15;
  const guesses = localDb.getGuesses(profileId);
  const activeGuess = guesses.pending.find(g => g.ticker === formattedTicker);
  if (activeGuess && activeGuess.target_price > currentPrice) {
    target = activeGuess.target_price;
  }
  target = Math.round(target * 100) / 100;

  const reward = Math.max(0.01, target - currentPrice);
  const riskReward = Math.round((reward / risk) * 100) / 100;

  return {
    ticker: formattedTicker,
    action,
    score: Math.round(score * 10) / 10,
    metrics: {
      rsi: Math.round(rsi * 10) / 10,
      macd: Math.round(macdData.macd * 1000) / 1000,
      macd_signal: Math.round(macdData.signal * 1000) / 1000,
      upper_bb: Math.round(bbData.upper * 100) / 100,
      lower_bb: Math.round(bbData.lower * 100) / 100
    },
    scores: {
      rsi_score: Math.round(sRsi * 10) / 10,
      macd_score: Math.round(sMacd * 10) / 10,
      trend_score: Math.round(sTrend * 10) / 10,
      bb_score: Math.round(sBb * 10) / 10,
      gut_score: Math.round(sGut * 10) / 10
    },
    weights: {
      rsi_weight: Math.round(finalRsi * 100) / 100,
      macd_weight: Math.round(wMacd * 100) / 100,
      trend_weight: Math.round(finalTrend * 100) / 100,
      gut_weight: Math.round(wGut * 100) / 100
    },
    regime_status: regime.regime,
    vix_value: regime.vix,
    spy_above_200: regime.spy_above_200,
    qqq_above_200: regime.qqq_above_200,
    atr: Math.round(atr * 100) / 100,
    stop_loss_price: stopLoss,
    target_price: target,
    risk_to_reward_ratio: riskReward,
    is_asymmetric_risk: riskReward < 1.5,
    buy_threshold: buyThreshold,
    sell_threshold: sellThreshold
  };
};

// ─── 10/10 Quant Simulated ROI Backtester ───

const simulateEpochRoi = (prices, start, end, hold = 14) => {
  let rsiRoi = 0.0;
  let macdRoi = 0.0;
  let trendRoi = 0.0;

  const startIdx = Math.max(35, start);
  const endIdx = Math.min(prices.length - hold, end);

  if (startIdx >= endIdx) return { rsi: 0.0, macd: 0.0, trend: 0.0 };

  let samples = 0;
  for (let i = startIdx; i < endIdx; i++) {
    const subset = prices.slice(0, i);
    const buyPrice = prices[i];
    const sellPrice = prices[i + hold];

    if (buyPrice <= 0) continue;

    const tradeRoi = (sellPrice - buyPrice) / buyPrice;

    const rsi = calculateRsi(subset);
    const macd = calculateMacd(subset);
    const trend = getTrendScore(subset);

    if (rsi < 30) rsiRoi += tradeRoi;
    else if (rsi > 70) rsiRoi += -tradeRoi;

    if (macd.hist > 0) macdRoi += tradeRoi;
    else macdRoi += -tradeRoi;

    if (trend > 50) trendRoi += tradeRoi;
    else trendRoi += -tradeRoi;

    samples++;
  }

  if (samples > 0) {
    rsiRoi /= samples;
    macdRoi /= samples;
    trendRoi /= samples;
  }

  return { rsi: rsiRoi, macd: macdRoi, trend: trendRoi };
};

const findWorstDrawdownEpoch = (prices, windowSize = 30) => {
  if (prices.length < windowSize + 35 + 14) {
    return {
      start: Math.max(35, prices.length - windowSize - 14),
      end: Math.max(35, prices.length - 14)
    };
  }

  let worstDrawdown = 0.0;
  let worstStart = 35;
  let worstEnd = 35 + windowSize;

  for (let i = 35; i < prices.length - windowSize - 14; i++) {
    const subset = prices.slice(i, i + windowSize);
    if (subset.length === 0) continue;
    
    const peak = Math.max(...subset);
    const peakIdx = subset.indexOf(peak);
    const trough = Math.min(...subset.slice(peakIdx));

    if (peak > 0) {
      const drawdown = (peak - trough) / peak;
      if (drawdown > worstDrawdown) {
        worstDrawdown = drawdown;
        worstStart = i;
        worstEnd = i + windowSize;
      }
    }
  }

  return { start: worstStart, end: worstEnd };
};

export const evolveWeights = (profileId, ticker, historyData) => {
  const formattedTicker = ticker.toUpperCase().trim();

  if (!historyData || historyData.length < 35) {
    return { status: "skipped", reason: "Insufficient history" };
  }

  const prices = historyData.map(d => parseFloat(d.close_price));

  // Epoch 1: Immediate Swing (Past 30 Days)
  const end1 = prices.length - 14;
  const start1 = Math.max(35, end1 - 30);
  const ep1 = simulateEpochRoi(prices, start1, end1);

  // Epoch 2: Macro Trend (Past 180 Days)
  const end2 = Math.max(35, prices.length - 90 - 14);
  const start2 = Math.max(35, prices.length - 180 - 14);
  const ep2 = simulateEpochRoi(prices, start2, end2);

  // Epoch 3: Crisis Stress Epoch (Steepest Drawdown)
  const stress = findWorstDrawdownEpoch(prices, 30);
  const ep3 = simulateEpochRoi(prices, stress.start, stress.end);

  // Blend (40% swing, 30% macro, 30% stress)
  const rsiRoi = 0.40 * ep1.rsi + 0.30 * ep2.rsi + 0.30 * ep3.rsi;
  const macdRoi = 0.40 * ep1.macd + 0.30 * ep2.macd + 0.30 * ep3.macd;
  const trendRoi = 0.40 * ep1.trend + 0.30 * ep2.trend + 0.30 * ep3.trend;

  // Gut predictions accuracy yield mapping
  const guesses = localDb.getGuesses(profileId);
  const history = guesses.completed.filter(g => g.ticker === formattedTicker);
  let gutRoi = 0.0;
  if (history.length > 0) {
    const hits = history.filter(g => g.status === "hit").length;
    const accuracy = hits / history.length;
    gutRoi = (accuracy - 0.5) * 0.10;
  }

  // Calculate exponential coefficients
  const wRsiRaw = Math.max(0.1, Math.exp(rsiRoi * 40.0));
  const wMacdRaw = Math.max(0.1, Math.exp(macdRoi * 40.0));
  const wTrendRaw = Math.max(0.1, Math.exp(trendRoi * 40.0));
  const wGutRaw = Math.max(0.1, Math.exp(gutRoi * 40.0));

  const totalRaw = wRsiRaw + wMacdRaw + wTrendRaw + wGutRaw;
  const alpha = 0.40; // Softening smooth rate

  let newRsi = (1 - alpha) * 0.25 + alpha * (wRsiRaw / totalRaw);
  let newMacd = (1 - alpha) * 0.25 + alpha * (wMacdRaw / totalRaw);
  let newTrend = (1 - alpha) * 0.25 + alpha * (wTrendRaw / totalRaw);
  let newGut = (1 - alpha) * 0.25 + alpha * (wGutRaw / totalRaw);

  // Re-normalize
  const totalFinal = newRsi + newMacd + newTrend + newGut;
  newRsi /= totalFinal;
  newMacd /= totalFinal;
  newTrend /= totalFinal;
  newGut /= totalFinal;

  // Persist weights
  localDb.saveWeights(
    profileId,
    formattedTicker,
    newRsi.toFixed(3),
    newMacd.toFixed(3),
    newTrend.toFixed(3),
    newGut.toFixed(3)
  );

  return {
    status: "success",
    ticker: formattedTicker,
    weights: {
      rsi_weight: parseFloat(newRsi.toFixed(3)),
      macd_weight: parseFloat(newMacd.toFixed(3)),
      trend_weight: parseFloat(newTrend.toFixed(3)),
      gut_weight: parseFloat(newGut.toFixed(3))
    },
    epochs: {
      immediate: {
        rsi: Math.round(ep1.rsi * 100 * 100) / 100,
        macd: Math.round(ep1.macd * 100 * 100) / 100,
        trend: Math.round(ep1.trend * 100 * 100) / 100
      },
      macro: {
        rsi: Math.round(ep2.rsi * 100 * 100) / 100,
        macd: Math.round(ep2.macd * 100 * 100) / 100,
        trend: Math.round(ep2.trend * 100 * 100) / 100
      },
      stress: {
        rsi: Math.round(ep3.rsi * 100 * 100) / 100,
        macd: Math.round(ep3.macd * 100 * 100) / 100,
        trend: Math.round(ep3.trend * 100 * 100) / 100
      }
    }
  };
};

export const generateViabilityForecast = (profileId, ticker, historyData, currentPrice) => {
  const tickerUpper = ticker.toUpperCase().trim();
  if (!historyData || historyData.length < 5) {
    const emptyRes = {
      score: 50.0,
      action: "HOLD",
      rsi_value: 50.0,
      rsi_score: 50.0,
      macd_value: 0.0,
      macd_signal: 0.0,
      macd_hist: 0.0,
      macd_score: 50.0,
      trend_score: 50.0,
      bb_upper: currentPrice,
      bb_mid: currentPrice,
      bb_lower: currentPrice,
      bb_score: 50.0,
      atr: 0.0,
      support: currentPrice,
      resistance: currentPrice,
      entry_low: Math.round(currentPrice * 0.98 * 100) / 100,
      entry_high: Math.round(currentPrice * 1.01 * 100) / 100,
      exit_target: Math.round(currentPrice * 1.10 * 100) / 100,
      stop_loss: Math.round(currentPrice * 0.95 * 100) / 100,
      risk_to_reward_ratio: 1.5,
      rationales: ["Insufficient price history to calculate metrics."]
    };
    return {
      ticker: tickerUpper,
      day: emptyRes,
      week: emptyRes,
      month: emptyRes
    };
  }

  const prices = historyData.map(d => parseFloat(d.close_price));
  const highs = historyData.map(d => parseFloat(d.high_price || d.close_price));
  const lows = historyData.map(d => parseFloat(d.low_price || d.close_price));

  // User RSI thresholds apply across every horizon so risk posture is consistent.
  const cfg = getIndicatorConfig();

  const analyzeHorizon = (horizonName, rsiPeriod, macdParams, bbPeriod, bbStd, atrPeriod, lookbackPeriod, maFast, maSlow) => {
    // Indicators
    const rsiVal = calculateRsi(prices, rsiPeriod);
    const macdData = calculateMacdCustom(prices, macdParams[0], macdParams[1], macdParams[2]);
    const bbData = calculateBollingerBands(prices, bbPeriod, bbStd);
    const atrVal = calculateAtr(highs, lows, prices, atrPeriod);

    // Individual Scores
    const sRsi = getRsiScore(rsiVal, cfg.rsiOversold, cfg.rsiOverbought);
    const sMacd = getMacdScore(macdData.macd, macdData.signal, macdData.hist);
    const sBb = getBbScore(currentPrice, bbData.upper, bbData.lower);

    // MA Trend Score
    let sTrend;
    let fastMaVal = 0.0;
    let slowMaVal = 0.0;
    if (prices.length >= maSlow) {
      fastMaVal = prices.slice(-maFast).reduce((a, b) => a + b, 0) / maFast;
      slowMaVal = prices.slice(-maSlow).reduce((a, b) => a + b, 0) / maSlow;
      if (currentPrice > fastMaVal && fastMaVal > slowMaVal) {
        sTrend = 90.0;
      } else if (currentPrice < fastMaVal && fastMaVal < slowMaVal) {
        sTrend = 10.0;
      } else if (currentPrice > fastMaVal && fastMaVal < slowMaVal) {
        sTrend = 60.0;
      } else {
        sTrend = 40.0;
      }
    } else {
      sTrend = getTrendScore(prices);
    }

    // Blended Base Score
    let score;
    if (horizonName === "Day") {
      score = sRsi * 0.40 + sMacd * 0.40 + sTrend * 0.20;
    } else if (horizonName === "Week") {
      score = sRsi * 0.35 + sMacd * 0.35 + sTrend * 0.30;
    } else {
      score = sRsi * 0.25 + sMacd * 0.25 + sTrend * 0.50;
    }

    // Verdict
    let action;
    if (score >= 80) action = "STRONG BUY";
    else if (score >= 65) action = "BUY";
    else if (score >= 35) action = "HOLD";
    else if (score >= 20) action = "SELL";
    else action = "STRONG SELL";

    // Support / Resistance
    const lookback = Math.min(prices.length, lookbackPeriod);
    const supVal = Math.min(...lows.slice(-lookback));
    const resVal = Math.max(...highs.slice(-lookback));

    // Targets
    const riskCoef = horizonName === "Day" ? 2.0 : (horizonName === "Week" ? 2.5 : 3.0);
    const riskBuffer = atrVal > 0 ? riskCoef * atrVal : currentPrice * 0.05;
    const stopLoss = Math.max(0.01, Math.round((currentPrice - riskBuffer) * 100) / 100);

    // Entry Zone
    let entryLow = Math.max(0.01, Math.round(Math.min(bbData.lower, supVal) * 100) / 100);
    let entryHigh = Math.max(0.01, Math.round(((bbData.mid + bbData.lower) / 2) * 100) / 100);
    if (entryHigh < entryLow) {
      const temp = entryLow;
      entryLow = entryHigh;
      entryHigh = temp;
    }

    // Exit Target
    let exitTarget = Math.round(Math.max(bbData.upper, resVal) * 100) / 100;
    const multiplier = horizonName === "Day" ? 1.05 : (horizonName === "Week" ? 1.15 : 1.30);
    if (exitTarget <= currentPrice) {
      exitTarget = Math.round(currentPrice * multiplier * 100) / 100;
    }

    const riskAmt = Math.max(0.01, currentPrice - stopLoss);
    const rewardAmt = Math.max(0.01, exitTarget - currentPrice);
    const riskReward = Math.round((rewardAmt / riskAmt) * 100) / 100;

    // Rationales
    const rationales = [];
    if (rsiVal < 30) {
      rationales.push(`RSI is highly oversold at ${rsiVal.toFixed(1)}, flagging an imminent short-term reversal bounce.`);
    } else if (rsiVal > 70) {
      rationales.push(`RSI is overbought at ${rsiVal.toFixed(1)}, indicating heavy distribution and exhaustion risk.`);
    } else if (rsiVal < 50) {
      rationales.push(`RSI rests at ${rsiVal.toFixed(1)} in bearish-neutral territory, indicating mild sell-side momentum.`);
    } else {
      rationales.push(`RSI shows constructive buying momentum at ${rsiVal.toFixed(1)} with ample room before exhaustion.`);
    }

    if (macdData.hist > 0) {
      rationales.push(`MACD has crossed bullishly above signal with positive histogram momentum (${macdData.hist.toFixed(3)}).`);
    } else if (macdData.hist < 0) {
      rationales.push(`MACD is bearishly aligned below signal with negative momentum (${macdData.hist.toFixed(3)}), suggesting downside expansion.`);
    } else {
      rationales.push(`MACD is flat, reflecting narrow price compression before an imminent breakout.`);
    }

    if (horizonName === "Day") {
      const maPrice = prices.length >= maFast ? prices.slice(-maFast).reduce((a, b) => a + b, 0) / maFast : currentPrice;
      if (currentPrice > maPrice) {
        rationales.push(`Price resides above 5 SMA fast-momentum threshold, supporting micro day-trading breakouts.`);
      } else {
        rationales.push(`Price trades below 5 SMA momentum line, cautioning day traders on fast micro-selling pressure.`);
      }
    } else if (horizonName === "Week") {
      if (prices.length >= maSlow) {
        if (fastMaVal > slowMaVal) {
          rationales.push(`Fast 20 EMA is bullishly positioned above 50 SMA, sustaining active intermediate swing channels.`);
        } else {
          rationales.push(`Fast 20 EMA is depressed below 50 SMA, warning swing traders that medium-term support is absent.`);
        }
      } else {
        rationales.push(`Insufficient history (${prices.length} days) to establish intermediate SMA swing channels.`);
      }
    } else {
      if (prices.length >= maSlow) {
        if (fastMaVal > slowMaVal) {
          rationales.push(`Golden Cross active: 50 SMA leads 200 SMA, indicating highly viable primary macro uptrend dynamics.`);
        } else {
          rationales.push(`Death Cross active: 50 SMA resides below 200 SMA, signaling a structural macro bear cycle.`);
        }
      } else {
        rationales.push(`Insufficient history (${prices.length}/200 days) to calculate Golden/Death Cross status.`);
      }
    }

    const volPct = (atrVal / currentPrice) * 100;
    if (volPct > 6) {
      rationales.push(`Extreme volatility detected: ATR is ${atrVal.toFixed(2)} (${volPct.toFixed(1)}% of price). Strict risk brackets recommended.`);
    } else if (volPct > 3) {
      rationales.push(`Moderate volatility: ATR is ${atrVal.toFixed(2)} (${volPct.toFixed(1)}% of price), supporting standard swing DCA zones.`);
    } else {
      rationales.push(`Low volatility environment: ATR is ${atrVal.toFixed(2)} (${volPct.toFixed(1)}% of price), ideal for tight-spread accumulating.`);
    }

    return {
      score: Math.round(score * 10) / 10,
      action,
      rsi_value: Math.round(rsiVal * 10) / 10,
      rsi_score: Math.round(sRsi * 10) / 10,
      macd_value: Math.round(macdData.macd * 1000) / 1000,
      macd_signal: Math.round(macdData.signal * 1000) / 1000,
      macd_hist: Math.round(macdData.hist * 1000) / 1000,
      macd_score: Math.round(sMacd * 10) / 10,
      trend_score: Math.round(sTrend * 10) / 10,
      bb_upper: Math.round(bbData.upper * 100) / 100,
      bb_mid: Math.round(bbData.mid * 100) / 100,
      bb_lower: Math.round(bbData.lower * 100) / 100,
      bb_score: Math.round(sBb * 10) / 10,
      atr: Math.round(atrVal * 100) / 100,
      support: Math.round(supVal * 100) / 100,
      resistance: Math.round(resVal * 100) / 100,
      entry_low: entryLow,
      entry_high: entryHigh,
      exit_target: exitTarget,
      stop_loss: stopLoss,
      risk_to_reward_ratio: riskReward,
      rationales
    };
  };

  return {
    ticker: tickerUpper,
    day: analyzeHorizon("Day", 7, [5, 13, 4], 10, 1.5, 5, 10, 5, 15),
    week: analyzeHorizon("Week", 14, [12, 26, 9], 20, 2.0, 14, 30, 20, 50),
    month: analyzeHorizon("Month", 21, [24, 52, 18], 50, 2.0, 21, 120, 50, 200)
  };
};
