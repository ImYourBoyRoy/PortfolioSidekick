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

export const getRsiScore = (rsi) => {
  if (rsi <= 30) return 90.0;
  if (rsi >= 70) return 10.0;
  return 90.0 - ((rsi - 30) / 40.0) * 80.0;
};

export const getMacdScore = (macd, signal, hist) => {
  if (hist > 0) {
    return Math.min(85.0, 50.0 + (hist / (Math.abs(macd) + 1e-5)) * 100);
  } else {
    return Math.max(15.0, 50.0 + (hist / (Math.abs(macd) + 1e-5)) * 100);
  }
};

export const getTrendScore = (prices) => {
  if (prices.length < 50) return 50.0;

  const sma50 = prices.slice(-50).reduce((a, b) => a + b, 0) / 50.0;
  const currPrice = prices[prices.length - 1];

  if (prices.length >= 200) {
    const sma200 = prices.slice(-200).reduce((a, b) => a + b, 0) / 200.0;
    if (currPrice > sma50 && sma50 > sma200) return 85.0;
    if (currPrice < sma50 && sma50 < sma200) return 15.0;
  }

  if (currPrice > sma50) return 70.0;
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

  // Compute Core Metrics
  const rsi = calculateRsi(prices);
  const macdData = calculateMacd(prices);
  const bbData = calculateBollingerBands(prices);
  const atr = calculateAtr(highs, lows, prices, 14);

  // Individual Scores
  const sRsi = getRsiScore(rsi);
  const sMacd = getMacdScore(macdData.macd, macdData.signal, macdData.hist);
  const sTrend = getTrendScore(prices);
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
  let buyThreshold = 65.0;
  let sellThreshold = 35.0;

  if (isBearish) {
    const shift = wTrend * 0.40;
    finalTrend = wTrend - shift;
    finalRsi = wRsi + shift;
    buyThreshold = 78.0;
    sellThreshold = 45.0;
  }

  const score = sRsi * finalRsi + sMacd * wMacd + sTrend * finalTrend + sGut * wGut;

  let action = "HOLD";
  if (score > buyThreshold) action = "BUY";
  else if (score < sellThreshold) action = "SELL";

  // Volatility stop-loss
  const risk = atr > 0 ? 2.5 * atr : currentPrice * 0.10;
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
