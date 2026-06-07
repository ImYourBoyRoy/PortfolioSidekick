// ./frontend/src/serverless/portfolioConstants.js
/**
 * Single source of truth for demo seed holdings, sector tags, and sandbox-only chart baselines.
 * Never used as live quote fallbacks — real prices come from Robinhood or Yahoo only.
 *
 * Created by: Roy Dawson IV
 */

/** Demo portfolio for onboarding / seed-mock-assets (shares + cost basis + last-known demo price). */
export const DEMO_HOLDINGS_SEED = [
  { ticker: 'NVDA', shares: 120, avg_buy_price: 110.5, default_price: 122.45 },
  { ticker: 'AMD', shares: 60, avg_buy_price: 145.0, default_price: 150.2 },
  { ticker: 'PLTR', shares: 250, avg_buy_price: 21.0, default_price: 34.5 },
  { ticker: 'MSFT', shares: 35, avg_buy_price: 380.0, default_price: 415.0 },
  { ticker: 'AAPL', shares: 45, avg_buy_price: 170.0, default_price: 190.0 },
  { ticker: 'AMZN', shares: 80, avg_buy_price: 150.0, default_price: 180.0 },
  { ticker: 'TSLA', shares: 50, avg_buy_price: 190.0, default_price: 175.0 },
  { ticker: 'QBTS', shares: 100, avg_buy_price: 12.0, default_price: 15.5 },
  { ticker: 'RGTI', shares: 80, avg_buy_price: 14.0, default_price: 16.8 },
  { ticker: 'NUKZ', shares: 200, avg_buy_price: 2.5, default_price: 2.8 },
];

export const SHADOW_COACH_SEED_TICKERS = ['NVDA', 'AMD', 'PLTR', 'MSFT', 'TSLA'];

const TECH = new Set(['NVDA', 'AAPL', 'MSFT', 'AMD', 'AVGO', 'PLTR', 'TSM', 'INTC', 'AMZN', 'TSLA']);
const QUANTUM = new Set(['QBTS', 'RGTI', 'IONQ']);
const ENERGY = new Set(['NUKZ']);

export function classifySector(ticker) {
  const t = String(ticker || '').toUpperCase();
  if (TECH.has(t)) return 'Technology';
  if (QUANTUM.has(t)) return 'Quantum Tech';
  if (ENERGY.has(t)) return 'Nuclear Energy';
  return 'Index/Diversified';
}

export function computeSectorConcentrations(holdings, equityDenominator) {
  const totals = {};
  for (const h of holdings) {
    const sector = classifySector(h.ticker);
    const value = (h.shares || 0) * (h.current_price || 0);
    totals[sector] = (totals[sector] || 0) + value;
  }
  const denom = equityDenominator > 0 ? equityDenominator : 0;
  const out = {};
  for (const [sector, value] of Object.entries(totals)) {
    out[sector] = denom > 0 ? Math.round((value / denom) * 10000) / 100 : 0;
  }
  return out;
}

/** Sandbox-only synthetic chart baseline when Yahoo history is unavailable. */
export function mockChartBasePrice(ticker) {
  const t = String(ticker || '').toUpperCase();
  const bases = {
    QBTS: 30, RGTI: 24, ARKK: 55, NVDA: 120, AMD: 150, IONQ: 42,
    AVGO: 180, PLTR: 35, TSM: 140, INTC: 22, NUKZ: 2.4, SPY: 510, QQQ: 435,
  };
  return bases[t] ?? 100;
}

