// ./frontend/src/serverless/dataIntegrity.js
/**
 * Guards against presenting cost basis, demo seeds, or synthetic math as live market data.
 * Created by: Roy Dawson IV
 */

/** True when current price equals avg cost — often means quote fetch failed. */
export function isCostBasisMasqueradingAsLive(currentPrice, avgBuyPrice) {
  const current = Number(currentPrice);
  const avg = Number(avgBuyPrice);
  if (!Number.isFinite(current) || !Number.isFinite(avg) || avg <= 0) return false;
  const tolerance = Math.max(0.01, avg * 0.0001);
  return Math.abs(current - avg) <= tolerance;
}

/** Accept only a verified live quote; never substitute cost basis. */
export function coerceLivePrice(candidate, avgBuyPrice) {
  const price = Number(candidate);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (isCostBasisMasqueradingAsLive(price, avgBuyPrice)) return null;
  return price;
}

/** Warrants and special symbols rarely have public quote feeds. */
export function isQuoteUnsupportedSymbol(ticker) {
  const t = String(ticker || '').toUpperCase().trim();
  if (!t) return true;
  return /[\^]/.test(t) || t.endsWith('.WS');
}

const MAX_QUOTE_DIVERGENCE = 0.1;

/**
 * Prefer Robinhood when it agrees with Yahoo; when they diverge sharply, trust Yahoo.
 * Prevents bad RH batch marks (e.g. inflated AMD) from sticking because Yahoo was skipped.
 */
export function reconcileLiveQuotes(robinhoodPrice, yahooPrice, avgBuyPrice) {
  const rh = coerceLivePrice(robinhoodPrice, avgBuyPrice);
  const yh = coerceLivePrice(yahooPrice, avgBuyPrice);
  if (rh == null && yh == null) return { price: null, source: null };
  if (rh == null) return { price: yh, source: 'yahoo' };
  if (yh == null) return { price: rh, source: 'robinhood' };
  const diff = Math.abs(rh - yh) / Math.max(rh, yh);
  if (diff > MAX_QUOTE_DIVERGENCE) {
    return { price: yh, source: 'yahoo-crosscheck' };
  }
  return { price: rh, source: 'robinhood' };
}

/** Classify quote state — warrants are non-quotable, not "stale". */
export function classifyQuoteStatus(holding) {
  if (isQuoteUnsupportedSymbol(holding?.ticker)) {
    const hasPositionMark = Number(holding?.current_price) > 0 && holding?.quote_status === 'position_equity';
    return hasPositionMark ? 'position_equity' : 'non_quotable';
  }
  const current = holding?.current_price;
  const avg = holding?.avg_buy_price;
  const missing = current == null || !(Number(current) > 0);
  if (holding?.price_stale === true || missing || isCostBasisMasqueradingAsLive(current, avg)) {
    return 'stale';
  }
  return 'live';
}

export function isQuotableStale(holding) {
  return classifyQuoteStatus(holding) === 'stale';
}

export function attachHoldingIntegrity(holding, priceSource = 'unknown') {
  const quoteStatus = classifyQuoteStatus(holding);
  const stale = quoteStatus === 'stale';
  return {
    ...holding,
    price_source: holding?.price_source || priceSource,
    quote_status: quoteStatus,
    price_stale: stale,
    non_quotable: quoteStatus === 'non_quotable' || quoteStatus === 'position_equity',
    advisor_is_estimate: holding?.advisor_is_estimate === true,
  };
}
