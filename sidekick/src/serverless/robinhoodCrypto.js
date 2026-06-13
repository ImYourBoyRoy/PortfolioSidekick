// ./sidekick/src/serverless/robinhoodCrypto.js
/**
 * Robinhood crypto holdings via nummus session API (no official crypto API key).
 * Created by: Roy Dawson IV
 */

import {
  isMoney,
  moneyAdd,
  moneyFormat,
  moneyFromProduct,
  moneyFromString,
  moneySub,
  MONEY_NULL,
} from './money.js';

const CRYPTO_LOAD_WARNING =
  'Crypto holdings could not be loaded. Account header may not reconcile with Robinhood.';

function pickCryptoPrice(quote) {
  if (!quote) return { price: MONEY_NULL, source: 'missing' };
  const mark = moneyFromString(quote.mark_price);
  if (isMoney(mark)) return { price: mark, source: 'mark_price' };

  const bid = moneyFromString(quote.bid_price);
  const ask = moneyFromString(quote.ask_price);
  if (isMoney(bid) && isMoney(ask)) {
    const midCents = (bid.cents + ask.cents) / 2n;
    return { price: { cents: midCents }, source: 'bid_ask_midpoint' };
  }

  const last = moneyFromString(quote.last_trade_price);
  if (isMoney(last)) return { price: last, source: 'last_trade_price' };

  return { price: MONEY_NULL, source: 'missing' };
}

function normalizeCostBasis(costBases) {
  if (!Array.isArray(costBases) || costBases.length === 0) return MONEY_NULL;
  let total = 0n;
  let any = false;
  for (const row of costBases) {
    const basis = moneyFromString(row?.direct_cost_basis ?? row?.cost_basis);
    if (isMoney(basis)) {
      total += basis.cents;
      any = true;
    }
  }
  return any ? { cents: total } : MONEY_NULL;
}

/**
 * @param {object} holding Raw nummus holding row
 * @param {object|null} quote Forex quote payload
 */
export function normalizeCryptoHolding(holding, quote = null) {
  const currency = holding?.currency || {};
  const code = String(currency.code || currency.asset_currency || '').toUpperCase();
  const quantity = holding?.quantity;
  const priced = pickCryptoPrice(quote);
  let equity = moneyFromString(holding?.equity ?? holding?.market_value);
  let equitySource = 'holding_equity';
  if (!isMoney(equity) && isMoney(priced.price)) {
    equity = moneyFromProduct(quantity, moneyFormat(priced.price));
    equitySource = priced.source;
  }
  const costBasis = normalizeCostBasis(holding?.cost_bases);
  const pnl = isMoney(equity) && isMoney(costBasis) ? moneySub(equity, costBasis) : MONEY_NULL;

  return {
    id: holding?.id || null,
    currencyCode: code,
    name: currency.name || null,
    quantity: quantity != null ? String(quantity) : null,
    markPrice: moneyFormat(priced.price),
    bidPrice: moneyFormat(moneyFromString(quote?.bid_price)),
    askPrice: moneyFormat(moneyFromString(quote?.ask_price)),
    equity: moneyFormat(equity),
    costBasis: moneyFormat(costBasis),
    averageBuyPrice: null,
    pnl: moneyFormat(pnl),
    updatedAt: holding?.updated_at || holding?.created_at || null,
    source: equitySource,
    priceSource: priced.source,
  };
}

export function sumCryptoEquity(holdings = []) {
  const parts = holdings
    .map((h) => moneyFromString(h.equity))
    .filter(isMoney);
  return parts.length ? moneyAdd(...parts) : MONEY_NULL;
}

/**
 * Fetch crypto holdings + quotes using an authenticated Robinhood session.
 */
export async function fetchRobinhoodCryptoHoldings(session, { requestGet, authHeader, urls }) {
  if (!session) {
    return {
      holdings: [],
      loaded: false,
      totalEquity: MONEY_NULL,
      warning: CRYPTO_LOAD_WARNING,
      error: 'No session',
    };
  }

  const auth = authHeader(session);
  let rawHoldings;
  try {
    const data = await requestGet(urls.nummusHoldings, auth);
    rawHoldings = (data?.results || []).filter((row) => parseFloat(row?.quantity || '0') > 0);
  } catch (err) {
    return {
      holdings: [],
      loaded: false,
      totalEquity: MONEY_NULL,
      warning: CRYPTO_LOAD_WARNING,
      error: err?.message || String(err),
    };
  }

  const quoteById = {};
  const pairIds = [...new Set(rawHoldings.map((h) => h?.currency?.id).filter(Boolean))];
  if (pairIds.length > 0) {
    const chunkSize = 20;
    for (let i = 0; i < pairIds.length; i += chunkSize) {
      const chunk = pairIds.slice(i, i + chunkSize);
      try {
        const quotes = await requestGet(urls.forexQuotes(chunk), auth);
        for (const q of (quotes?.results || [])) {
          if (q?.id) quoteById[q.id] = q;
        }
      } catch (err) {
        console.warn('[RobinhoodCrypto] forex quote batch failed:', err?.message || err);
      }
    }
  }

  const holdings = rawHoldings.map((row) => {
    const pairId = row?.currency?.id;
    return normalizeCryptoHolding(row, pairId ? quoteById[pairId] : null);
  });

  return {
    holdings,
    loaded: true,
    totalEquity: sumCryptoEquity(holdings),
    warning: null,
    error: null,
  };
}

export async function probeRobinhoodOptionPositions(session, { requestGet, authHeader, urls }) {
  if (!session) {
    return { loaded: false, count: 0, equity: MONEY_NULL, warning: null };
  }
  try {
    const data = await requestGet(urls.optionPositions, authHeader(session));
    const rows = (data?.results || []).filter((p) => parseFloat(p?.quantity || '0') !== 0);
    if (rows.length === 0) {
      return { loaded: true, count: 0, equity: MONEY_NULL, warning: null };
    }
    return {
      loaded: true,
      count: rows.length,
      equity: MONEY_NULL,
      warning: 'Options positions detected — options equity is not yet included in manual reconciliation.',
    };
  } catch (err) {
    return {
      loaded: false,
      count: 0,
      equity: MONEY_NULL,
      warning: `Options positions unavailable: ${err?.message || err}`,
    };
  }
}
