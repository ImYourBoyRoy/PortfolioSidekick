// ./sidekick/src/serverless/marketRegime.js
/**
 * Live market regime from public Yahoo quotes (SPY, QQQ, VIX).
 * Cross-platform: uses shared yahooQuotes transport (Capacitor / Tauri / fetch).
 *
 * Created by: Roy Dawson IV
 */

import { fetchPublicHistoricalPrices } from './robinhood';
import { fetchPublicQuote } from './yahooQuotes';

const REGIME_CACHE_MS = 5 * 60 * 1000;
let regimeCache = { at: 0, data: null };

function sma200(closes) {
  if (!closes || closes.length < 200) return null;
  const slice = closes.slice(-200);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / 200;
}

function classifyRegime({ spyPrice, spySma200, qqqPrice, qqqSma200, vix }) {
  const spyAbove = spyPrice != null && spySma200 != null ? spyPrice >= spySma200 : null;
  const qqqAbove = qqqPrice != null && qqqSma200 != null ? qqqPrice >= qqqSma200 : null;

  let regime = 'NEUTRAL';
  if (vix != null && vix >= 28) regime = 'BEARISH';
  else if (vix != null && vix >= 22) regime = 'CAUTIOUS';
  else if (spyAbove === false || qqqAbove === false) regime = 'CAUTIOUS';
  else if (spyAbove === true && qqqAbove === true && vix != null && vix < 20) regime = 'BULLISH';
  else if (spyAbove === true && qqqAbove === true) regime = 'NEUTRAL';

  return {
    regime,
    regime_status: regime === 'CAUTIOUS' ? 'BEARISH' : regime,
    vix,
    spy_above_200: spyAbove,
    qqq_above_200: qqqAbove,
    spy_price: spyPrice,
    qqq_price: qqqPrice,
    regime_is_estimate: false,
    tag: regimeTag(regime, vix),
  };
}

function regimeTag(regime, vix) {
  if (regime === 'BULLISH') return 'Risk-on tape';
  if (regime === 'BEARISH') return 'Risk-off / elevated fear';
  if (regime === 'CAUTIOUS') return 'Event-risk / fragile breadth';
  if (vix != null && vix >= 20) return 'Volatility elevated — size down';
  return 'Mixed regime — favor falsifiers over conviction';
}

/**
 * @param {{ forceRefresh?: boolean }} [options]
 */
export async function fetchLiveMarketRegime(options = {}) {
  const now = Date.now();
  if (!options.forceRefresh && regimeCache.data && now - regimeCache.at < REGIME_CACHE_MS) {
    return regimeCache.data;
  }

  try {
    const [spyHist, qqqHist, vixPrice, spyQuote, qqqQuote] = await Promise.all([
      fetchPublicHistoricalPrices('SPY', 'year'),
      fetchPublicHistoricalPrices('QQQ', 'year'),
      fetchPublicQuote('^VIX'),
      fetchPublicQuote('SPY'),
      fetchPublicQuote('QQQ'),
    ]);

    const spyCloses = spyHist.map((d) => parseFloat(d.close_price)).filter((n) => Number.isFinite(n));
    const qqqCloses = qqqHist.map((d) => parseFloat(d.close_price)).filter((n) => Number.isFinite(n));
    const spyPrice = spyQuote ?? spyCloses[spyCloses.length - 1] ?? null;
    const qqqPrice = qqqQuote ?? qqqCloses[qqqCloses.length - 1] ?? null;

    const result = {
      ...classifyRegime({
        spyPrice,
        spySma200: sma200(spyCloses),
        qqqPrice,
        qqqSma200: sma200(qqqCloses),
        vix: vixPrice,
      }),
      fetched_at: new Date().toISOString(),
      source: 'yahoo_live',
    };

    regimeCache = { at: now, data: result };
    return result;
  } catch (err) {
    console.warn('[Regime] Live fetch failed:', err.message);
    return {
      regime: null,
      regime_status: null,
      vix: null,
      spy_above_200: null,
      qqq_above_200: null,
      regime_is_estimate: true,
      tag: 'Regime unavailable — treat scenarios as lower confidence',
      fetched_at: new Date().toISOString(),
      source: 'fallback',
    };
  }
}

/** Sync read of last cached regime (for offline UI). */
export function getCachedMarketRegime() {
  return regimeCache.data || {
    regime: null,
    regime_status: null,
    vix: null,
    spy_above_200: null,
    qqq_above_200: null,
    regime_is_estimate: true,
    tag: 'Regime not loaded yet',
    source: 'none',
  };
}

/**
 * Confidence adjustment from regime for Scenario Oracle.
 * @param {object|null} regime
 * @returns {{ penalty: number, reasons: string[] }}
 */
export function regimeConfidenceAdjust(regime) {
  if (!regime || regime.regime_is_estimate) {
    return { penalty: 0, reasons: [] };
  }
  const reasons = [];
  let penalty = 0;
  if (regime.regime === 'BEARISH' || regime.regime_status === 'BEARISH') {
    penalty += 12;
    reasons.push(`Risk-off regime (VIX ${regime.vix?.toFixed?.(1) ?? '—'}) — growth catalysts need extra confirmation`);
  } else if (regime.regime === 'CAUTIOUS') {
    penalty += 7;
    reasons.push('Cautious regime — binary macro weeks punish weak conviction names');
  }
  if (regime.spy_above_200 === false) {
    penalty += 5;
    reasons.push('SPY below 200-day — broad market tailwind is limited');
  }
  return { penalty, reasons };
}
