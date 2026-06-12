// ./sidekick/src/serverless/liveQuotes.js
/**
 * Live quote refresh with Robinhood batch quotes (when authenticated), Yahoo fallback
 * for sandbox, and a simple request budget to stay under unofficial API limits (~60/min).
 *
 * Created by: Roy Dawson IV
 */

import { localDb } from './database';
import { fetchPublicQuote } from './robinhood';
import { classifySector, computeSectorConcentrations } from './portfolioConstants';
import { enrichHoldingsWithAdvisor } from './holdingAdvisor';
import {
  fetchRobinhoodAccountSummary,
  fetchRobinhoodLiveQuotes,
  fetchRobinhoodPositionMarks,
  resolveActiveRobinhoodSession,
  waitForRobinhoodSession,
} from './robinhoodAuth';
import {
  attachHoldingIntegrity,
  coerceLivePrice,
  isQuoteUnsupportedSymbol,
} from './dataIntegrity';
/** Community-safe ceiling — Robinhood publishes no official stock API limits. */
export const RH_REQUESTS_PER_MINUTE = 50;

export const PULSE_PRESETS = {
  relaxed: { label: 'Relaxed', sec: 60, hint: 'Safest — ~1 refresh/min' },
  balanced: { label: 'Balanced', sec: 30, hint: 'Default — typical app cadence' },
  live: { label: 'Active', sec: 15, hint: 'Fresher dashboard quotes' },
  turbo: { label: 'Turbo', sec: 10, hint: 'Fastest — use with fewer holdings' },
};

const requestTimestamps = [];

export function getPulseIntervalMs(settings = {}) {
  const preset = PULSE_PRESETS[settings.pulsePreset];
  if (preset) return preset.sec * 1000;
  const custom = Number(settings.pulseIntervalSec);
  if (Number.isFinite(custom) && custom >= 10 && custom <= 120) {
    return custom * 1000;
  }
  return PULSE_PRESETS.balanced.sec * 1000;
}

function pruneRequestLog() {
  const cutoff = Date.now() - 60_000;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
}

export function rhRequestBudgetRemaining() {
  pruneRequestLog();
  return Math.max(0, RH_REQUESTS_PER_MINUTE - requestTimestamps.length);
}

export function recordRhRequests(count = 1) {
  const now = Date.now();
  for (let i = 0; i < count; i += 1) requestTimestamps.push(now);
  pruneRequestLog();
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function applyLivePrice(profileId, holding, price, source) {
  const live = coerceLivePrice(price, holding.avg_buy_price);
  if (live == null) return false;
  localDb.updateHolding(profileId, holding.ticker, holding.shares, holding.avg_buy_price, live, { replacePrice: true });
  holding.current_price = live;
  holding.price_source = source;
  holding.price_stale = false;
  return true;
}

function isYahooPriceSource(source) {
  return String(source || '').includes('yahoo');
}

/** Count RH vs Yahoo marks on quotable holdings for UI + diagnostics. */
export function summarizeQuoteMarks(holdings, authenticated) {
  const quotable = (holdings || []).filter((h) => !isQuoteUnsupportedSymbol(h.ticker));
  const rhTickers = [];
  const yahooTickers = [];
  const staleTickers = [];

  for (const h of quotable) {
    const src = h.price_source || '';
    if (h.price_stale || h.quote_status === 'stale') staleTickers.push(h.ticker);
    else if (isYahooPriceSource(src)) yahooTickers.push(h.ticker);
    else if (src === 'robinhood') rhTickers.push(h.ticker);
  }

  let quoteSource = authenticated ? 'robinhood' : 'yahoo';
  if (authenticated) {
    if (yahooTickers.length > 0 && rhTickers.length > 0) quoteSource = 'robinhood+yahoo';
    else if (yahooTickers.length > 0 && rhTickers.length === 0) quoteSource = 'yahoo';
    else if (rhTickers.length > 0) quoteSource = 'robinhood';
    else if (staleTickers.length > 0) quoteSource = 'stale';
    else quoteSource = 'stored';
  }

  return {
    quote_source: quoteSource,
    rh_quote_count: rhTickers.length,
    yahoo_quote_count: yahooTickers.length,
    stale_quote_count: staleTickers.length,
    yahoo_fallback_tickers: yahooTickers,
    using_yahoo_fallback: authenticated && yahooTickers.length > 0,
    quote_mark_label: describeQuoteMarkLabel(quoteSource, authenticated, yahooTickers.length, rhTickers.length),
  };
}

export function describeQuoteMarkLabel(quoteSource, authenticated, yahooCount = 0, rhCount = 0) {
  if (!authenticated) return 'Public quotes (Yahoo) — link Robinhood for app marks';
  if (quoteSource === 'robinhood') return 'Robinhood live marks';
  if (quoteSource === 'robinhood+yahoo') {
    return `Robinhood marks (${rhCount}) · Yahoo fallback (${yahooCount})`;
  }
  if (quoteSource === 'yahoo' || quoteSource.includes('yahoo')) {
    return 'Yahoo fallback — tap Sync Account for Robinhood marks';
  }
  if (quoteSource === 'stale') return 'Awaiting Robinhood quotes — tap Sync Account';
  return 'Stored prices — tap Sync Account';
}

/** Apply Robinhood marks first; Yahoo only when linked session still has gaps (or offline sandbox). */
async function refreshWithRhFirst(profileId, rows, rhBatchPrices = {}, authenticated = false) {
  const targets = rows.filter((h) => !isQuoteUnsupportedSymbol(h.ticker));
  if (!targets.length) return { rhApplied: 0, yahooApplied: 0 };

  let rhApplied = 0;
  for (const h of targets) {
    const rhPrice = rhBatchPrices[h.ticker.toUpperCase()];
    if (rhPrice != null && applyLivePrice(profileId, h, rhPrice, 'robinhood')) rhApplied += 1;
  }

  const missing = targets.filter((h) => rhBatchPrices[h.ticker.toUpperCase()] == null);
  let yahooApplied = 0;
  if (missing.length > 0) {
    const concurrency = 4;
    let index = 0;
    async function worker() {
      while (index < missing.length) {
        const i = index++;
        const h = missing[i];
        if (authenticated) {
          recordRhRequests(1);
          const sym = h.ticker.toUpperCase();
          const rhRetry = await fetchRobinhoodLiveQuotes(profileId, [sym]);
          const rhPrice = rhRetry?.[sym];
          if (rhPrice != null && applyLivePrice(profileId, h, rhPrice, 'robinhood')) {
            rhApplied += 1;
            continue;
          }
        }
        const yahooPrice = await fetchPublicQuote(h.ticker);
        const yahooSource = authenticated ? 'yahoo-fallback' : 'yahoo';
        if (yahooPrice != null && applyLivePrice(profileId, h, yahooPrice, yahooSource)) yahooApplied += 1;
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, () => worker()));
  }

  return { rhApplied, yahooApplied };
}

const lastAdvisorSnapshot = new Map();

function advisorFieldsFromHolding(h) {
  return {
    advisor_score: h.advisor_score ?? null,
    advisor_action: h.advisor_action ?? null,
    advisor_is_estimate: h.advisor_is_estimate === true,
    advisor_unavailable: h.advisor_unavailable === true,
    advisor_reason: h.advisor_reason ?? null,
  };
}

function mergePulseAdvisor(preAdvisor, profileId) {
  const snap = lastAdvisorSnapshot.get(profileId);
  if (!snap || Date.now() - snap.at > 5 * 60 * 1000) return null;
  return preAdvisor.map((h) => ({
    ...h,
    ...(snap.byTicker.get(h.ticker.toUpperCase()) || unavailableAdvisorFields()),
  }));
}

function unavailableAdvisorFields() {
  return {
    advisor_score: null,
    advisor_action: null,
    advisor_is_estimate: false,
    advisor_unavailable: true,
    advisor_reason: 'Advisor refresh deferred during quote pulse.',
  };
}

function storeAdvisorSnapshot(profileId, portfolio) {
  lastAdvisorSnapshot.set(profileId, {
    at: Date.now(),
    byTicker: new Map(portfolio.map((h) => [h.ticker.toUpperCase(), advisorFieldsFromHolding(h)])),
  });
}

const pulseRefreshInFlight = new Map();

/**
 * Refresh holding prices and build portfolio summary aligned with Robinhood net equity when linked.
 * @param {number} profileId
 * @param {{ pulse?: boolean, forceAdvisor?: boolean }} [options]
 */
export async function refreshPortfolioPrices(profileId, options = {}) {
  if (options.pulse) {
    const inflight = pulseRefreshInFlight.get(profileId);
    if (inflight) return inflight;
  }
  const task = refreshPortfolioPricesInner(profileId, options);
  if (options.pulse) {
    pulseRefreshInFlight.set(profileId, task);
    task.finally(() => {
      if (pulseRefreshInFlight.get(profileId) === task) pulseRefreshInFlight.delete(profileId);
    });
  }
  return task;
}

async function refreshPortfolioPricesInner(profileId, options = {}) {
  const hiddenTickers = new Set(localDb.getHiddenTickers(profileId));
  const rows = localDb.getHoldings(profileId).filter((h) => !hiddenTickers.has(h.ticker.toUpperCase()));
  let authState = { authenticated: false };
  try {
    authState = await resolveActiveRobinhoodSession(profileId);
    if (!authState.authenticated && !options.pulse) {
      const profile = localDb.getProfiles().find((p) => p.id === profileId);
      if (profile?.robinhood_username) {
        const ready = await waitForRobinhoodSession(profileId, 10, 200);
        if (ready) authState = await resolveActiveRobinhoodSession(profileId);
      }
    }
  } catch {
    // Offline — use stored prices only.
  }

  let cashBalance = 0;
  let rhReportedEquity = null;
  let rhPortfolioMarketValue = null;
  let rhCashBreakdown = null;
  let equitySource = 'computed';
  let quoteSource = authState.authenticated ? 'robinhood' : 'yahoo';
  let rhBatchPrices = {};
  let rhPositionMarks = { bySymbol: {}, totalEquity: 0 };

  if (authState.authenticated) {
    recordRhRequests(2);
    const account = await fetchRobinhoodAccountSummary(profileId);
    if (account) {
      cashBalance = account.cash || 0;
      rhReportedEquity = account.reported_equity > 0 ? account.reported_equity : null;
      rhPortfolioMarketValue = account.portfolio_market_value > 0 ? account.portfolio_market_value : null;
      rhCashBreakdown = account.cash_breakdown || null;
    }
    rhPositionMarks = await fetchRobinhoodPositionMarks(profileId, hiddenTickers);
  }

  if (authState.authenticated && rows.length > 0) {
    const symbols = rows
      .filter((h) => !isQuoteUnsupportedSymbol(h.ticker))
      .map((h) => h.ticker.toUpperCase());
    if (symbols.length > 0) {
      recordRhRequests(Math.min(symbols.length + 1, 20));
      const livePrices = await fetchRobinhoodLiveQuotes(profileId, symbols);
      if (livePrices && Object.keys(livePrices).length > 0) {
        rhBatchPrices = livePrices;
      }
    }
  }

  await refreshWithRhFirst(profileId, rows, rhBatchPrices, authState.authenticated);

  // Second pass: RH retry first when linked; Yahoo only if still stale (sandbox uses Yahoo).
  const retryRows = localDb.getHoldings(profileId).filter((h) => !hiddenTickers.has(h.ticker.toUpperCase()));
  for (const h of retryRows) {
    if (isQuoteUnsupportedSymbol(h.ticker)) continue;
    const check = attachHoldingIntegrity(h, quoteSource);
    if (!check.price_stale) continue;

    if (authState.authenticated) {
      const sym = h.ticker.toUpperCase();
      recordRhRequests(1);
      const rhRetry = await fetchRobinhoodLiveQuotes(profileId, [sym]);
      const rhPrice = rhRetry?.[sym];
      if (rhPrice != null && applyLivePrice(profileId, h, rhPrice, 'robinhood')) continue;
    }

    if (!authState.authenticated) {
      const live = await fetchPublicQuote(h.ticker);
      if (applyLivePrice(profileId, h, live, 'yahoo')) continue;
    } else {
      const live = await fetchPublicQuote(h.ticker);
      if (applyLivePrice(profileId, h, live, 'yahoo-fallback')) continue;
    }
  }

  const freshRows = localDb.getHoldings(profileId).filter((h) => !hiddenTickers.has(h.ticker.toUpperCase()));
  let positionsEquity = 0;
  let totalCost = 0;
  let stalePriceCount = 0;
  let nonQuotableCount = 0;
  const preAdvisor = [];

  for (const h of freshRows) {
    const integrity = attachHoldingIntegrity(h, h.price_source || quoteSource);
    if (integrity.quote_status === 'stale') stalePriceCount += 1;
    if (integrity.quote_status === 'non_quotable' || integrity.quote_status === 'position_equity') {
      nonQuotableCount += 1;
    }
    const noMark = integrity.quote_status === 'stale' || integrity.quote_status === 'non_quotable';
    const positionMark = rhPositionMarks.bySymbol[h.ticker.toUpperCase()];
    let price = noMark ? 0 : (integrity.current_price || 0);
    let value = noMark ? 0 : h.shares * price;
    if (positionMark?.equity > 0) {
      value = positionMark.equity;
      if (positionMark.implied_price > 0) {
        price = positionMark.implied_price;
      }
    }
    const cost = h.shares * h.avg_buy_price;
    positionsEquity += value;
    totalCost += cost;
    const usingPositionMark = positionMark?.equity > 0;
    preAdvisor.push({
      ticker: h.ticker,
      shares: h.shares,
      avg_buy_price: h.avg_buy_price,
      current_price: noMark && !usingPositionMark ? null : round2(price),
      price_stale: integrity.price_stale && !usingPositionMark,
      quote_status: usingPositionMark ? 'position_equity' : integrity.quote_status,
      non_quotable: integrity.non_quotable === true && !usingPositionMark,
      price_source: usingPositionMark ? 'robinhood-position' : integrity.price_source,
      total_value: round2(value),
      total_cost: round2(cost),
      pnl: noMark ? null : round2(value - cost),
      pnl_pct: noMark || cost <= 0 ? null : round2(((value - cost) / cost) * 100),
      sector: classifySector(h.ticker),
    });
  }

  let portfolio = null;
  if (options.pulse && !options.forceAdvisor) {
    portfolio = mergePulseAdvisor(preAdvisor, profileId);
  }
  if (!portfolio) {
    portfolio = await enrichHoldingsWithAdvisor(profileId, preAdvisor, {
      force: options.forceAdvisor === true,
      concurrency: options.pulse ? 2 : 4,
    });
    storeAdvisorSnapshot(profileId, portfolio);
  }
  const positionPnl = round2(
    portfolio.reduce((sum, h) => sum + (Number.isFinite(h.pnl) ? h.pnl : 0), 0),
  );

  const quoteMarksEquity = round2(
    freshRows.reduce((sum, h) => {
      const integrity = attachHoldingIntegrity(h, h.price_source || quoteSource);
      if (integrity.quote_status === 'stale' || integrity.quote_status === 'non_quotable') return sum;
      return sum + h.shares * (integrity.current_price || 0);
    }, 0) + cashBalance,
  );

  let rhAlignedPositions = positionsEquity;
  if (rhPortfolioMarketValue != null && rhPortfolioMarketValue > 0) {
    rhAlignedPositions = rhPortfolioMarketValue;
  } else if (rhPositionMarks.totalEquity > 0) {
    rhAlignedPositions = rhPositionMarks.totalEquity;
  }

  const positionsPlusCash = authState.authenticated
    ? round2(rhAlignedPositions + cashBalance)
    : round2(positionsEquity + cashBalance);

  // When linked, Robinhood portfolio_equity is the authoritative net equity (matches mobile app).
  let totalEquity = positionsPlusCash;
  if (authState.authenticated && rhReportedEquity != null && rhReportedEquity > 0) {
    totalEquity = round2(rhReportedEquity);
    equitySource = 'robinhood';
  } else if (authState.authenticated) {
    equitySource = 'computed-rh-equity-missing';
  }

  const equityDenominator = totalEquity > 0 ? totalEquity : (positionsEquity > 0 ? positionsEquity : 0);
  const quotableCount = portfolio.filter((h) => !isQuoteUnsupportedSymbol(h.ticker)).length;
  const quoteMarks = summarizeQuoteMarks(portfolio, authState.authenticated);
  quoteSource = quoteMarks.quote_source;

  return {
    holdings: portfolio,
    total_equity: totalEquity,
    positions_equity: round2(positionsEquity),
    cash_balance: round2(cashBalance),
    rh_reported_equity: rhReportedEquity != null ? round2(rhReportedEquity) : null,
    rh_cash_breakdown: rhCashBreakdown,
    rh_portfolio_market_value: rhPortfolioMarketValue != null ? round2(rhPortfolioMarketValue) : null,
    computed_equity: positionsPlusCash,
    quote_marks_equity: quoteMarksEquity,
    equity_delta: rhReportedEquity != null ? round2(rhReportedEquity - positionsPlusCash) : null,
    quote_marks_delta: rhReportedEquity != null ? round2(rhReportedEquity - quoteMarksEquity) : null,
    equity_source: equitySource,
    hidden_ticker_count: hiddenTickers.size,
    non_quotable_count: nonQuotableCount,
    total_cost: round2(totalCost),
    overall_pnl: positionPnl,
    overall_pnl_pct: totalCost > 0 ? round2((positionPnl / totalCost) * 100) : 0,
    sector_concentrations: computeSectorConcentrations(freshRows, equityDenominator),
    mode: authState.authenticated ? 'live' : 'sandbox',
    quote_source: quoteSource,
    quote_mark_label: quoteMarks.quote_mark_label,
    rh_quote_count: quoteMarks.rh_quote_count,
    yahoo_quote_count: quoteMarks.yahoo_quote_count,
    yahoo_fallback_tickers: quoteMarks.yahoo_fallback_tickers,
    using_yahoo_fallback: quoteMarks.using_yahoo_fallback,
    stale_price_count: stalePriceCount,
    has_verified_live_prices: stalePriceCount === 0 && quotableCount > 0
      && (!authState.authenticated || !quoteMarks.using_yahoo_fallback),
    pulse_budget_remaining: rhRequestBudgetRemaining(),
  };
}
