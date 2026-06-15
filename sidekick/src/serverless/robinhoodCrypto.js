// ./sidekick/src/serverless/robinhoodCrypto.js
/**
 * Robinhood crypto holdings via nummus session API (no official crypto API key).
 * Created by: Roy Dawson IV
 */

import { fetchPublicCryptoQuote } from './yahooQuotes.js';
import {
  isMoney,
  moneyAdd,
  moneyFormat,
  moneyFromNumber,
  moneyFromProduct,
  moneyFromString,
  moneySub,
  MONEY_NULL,
} from './money.js';

const CRYPTO_LOAD_WARNING =
  'Crypto holdings could not be loaded. Account header may not reconcile with Robinhood.';

function isResourceUrl(value) {
  return typeof value === 'string' && value.startsWith('http');
}

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

function holdingQuantity(holding) {
  const raw = holding?.quantity_available ?? holding?.quantity;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? String(raw) : null;
}

function mergeCostBasisRows(rows = []) {
  let total = 0n;
  let any = false;
  for (const row of rows) {
    const basis = moneyFromString(row?.direct_cost_basis ?? row?.cost_basis);
    if (isMoney(basis)) {
      total += basis.cents;
      any = true;
    }
  }
  return any ? { cents: total } : MONEY_NULL;
}

export function resolveCryptoAssetCode(holding) {
  const currency = holding?.currency || {};
  return String(
    currency.code
    || currency.asset_currency
    || holding?.asset_currency
    || holding?.currency_code
    || '',
  ).toUpperCase();
}

async function fetchPaginatedResults(initialUrl, requestGet, auth) {
  const rows = [];
  let nextUrl = initialUrl;
  let guard = 0;
  while (nextUrl && guard < 20) {
    guard += 1;
    const data = await requestGet(nextUrl, auth);
    if (!data) break;
    rows.push(...(data.results || []));
    nextUrl = data.next || null;
  }
  return rows;
}

async function hydrateHoldingRow(holding, requestGet, auth) {
  let row = { ...holding };

  if (isResourceUrl(row.currency)) {
    try {
      const currency = await requestGet(row.currency, auth);
      if (currency) row.currency = currency;
    } catch (err) {
      console.warn('[RobinhoodCrypto] currency fetch failed:', err?.message || err);
    }
  }

  if (isResourceUrl(row.currency_pair)) {
    try {
      const pair = await requestGet(row.currency_pair, auth);
      if (pair?.id) row.currency_pair_id = pair.id;
      if (pair?.asset_currency?.code && !row.currency) row.currency = pair.asset_currency;
    } catch (err) {
      console.warn('[RobinhoodCrypto] currency_pair fetch failed:', err?.message || err);
    }
  }

  return row;
}

async function resolveCostBasis(holding, requestGet, auth) {
  const inline = holding?.cost_bases;
  if (Array.isArray(inline) && inline.length > 0) {
    const objectRows = inline.filter((row) => row && typeof row === 'object');
    if (objectRows.length > 0) {
      const merged = mergeCostBasisRows(objectRows);
      if (isMoney(merged)) return merged;
    }
    const fetched = [];
    for (const row of inline) {
      if (isResourceUrl(row)) {
        try {
          const data = await requestGet(row, auth);
          if (data) fetched.push(data);
        } catch (err) {
          console.warn('[RobinhoodCrypto] cost basis fetch failed:', err?.message || err);
        }
      }
    }
    if (fetched.length > 0) return mergeCostBasisRows(fetched);
  }

  const singular = moneyFromString(holding?.cost_basis);
  if (isMoney(singular)) return singular;

  return MONEY_NULL;
}

/**
 * Map asset codes (BTC) to Robinhood forex currency-pair ids used by marketdata quotes.
 */
export async function loadCryptoCurrencyPairIndex(requestGet, auth, urls) {
  const byCode = {};
  const bySymbol = {};
  try {
    const pairs = await fetchPaginatedResults(urls.cryptoCurrencyPairs, requestGet, auth);
    for (const pair of pairs) {
      const code = String(
        pair?.asset_currency?.code
        || pair?.symbol?.split?.('-')?.[0]
        || '',
      ).toUpperCase();
      if (code && pair?.id) byCode[code] = pair.id;
      const symbol = String(pair?.symbol || '').toUpperCase();
      if (symbol && pair?.id) bySymbol[symbol] = pair.id;
    }
  } catch (err) {
    console.warn('[RobinhoodCrypto] currency_pairs fetch failed:', err?.message || err);
  }
  return { byCode, bySymbol };
}

export function resolveCurrencyPairId(holding, pairIndex = {}) {
  const byCode = pairIndex.byCode || pairIndex;
  const bySymbol = pairIndex.bySymbol || {};
  const code = resolveCryptoAssetCode(holding);
  const symbol = code ? `${code}-USD` : '';
  return holding?.currency_pair_id
    || (symbol ? bySymbol[symbol] : null)
    || (code ? byCode[code] : null)
    || holding?.currency?.currency_pair_id
    || null;
}

/**
 * @param {object} holding Raw nummus holding row
 * @param {object|null} quote Forex quote payload
 * @param {import('./money.js').Money|null} [costBasis]
 * @param {number|null} [fallbackPrice] Yahoo/public mark when RH forex is unavailable
 */
export function normalizeCryptoHolding(holding, quote = null, costBasis = MONEY_NULL, fallbackPrice = null) {
  const code = resolveCryptoAssetCode(holding);
  const quantity = holdingQuantity(holding);
  const priced = pickCryptoPrice(quote);
  let price = priced.price;
  let priceSource = priced.source;

  if (!isMoney(price) && fallbackPrice != null && Number.isFinite(fallbackPrice) && fallbackPrice > 0) {
    price = moneyFromNumber(fallbackPrice);
    priceSource = 'yahoo_usd';
  }

  let equity = moneyFromString(holding?.equity ?? holding?.market_value);
  let equitySource = 'holding_equity';
  if (!isMoney(equity) && isMoney(price) && quantity != null) {
    equity = moneyFromProduct(quantity, moneyFormat(price));
    equitySource = priceSource;
  }

  const basis = isMoney(costBasis) ? costBasis : mergeCostBasisRows(
    Array.isArray(holding?.cost_bases) ? holding.cost_bases.filter((row) => row && typeof row === 'object') : [],
  );
  const pnl = isMoney(equity) && isMoney(basis) ? moneySub(equity, basis) : MONEY_NULL;

  return {
    id: holding?.id || null,
    currencyCode: code,
    name: holding?.currency?.name || null,
    quantity,
    markPrice: moneyFormat(price),
    bidPrice: moneyFormat(moneyFromString(quote?.bid_price)),
    askPrice: moneyFormat(moneyFromString(quote?.ask_price)),
    equity: moneyFormat(equity),
    costBasis: moneyFormat(basis),
    investedAmount: moneyFormat(basis),
    averageBuyPrice: null,
    pnl: moneyFormat(pnl),
    updatedAt: holding?.updated_at || holding?.created_at || null,
    source: equitySource,
    priceSource,
  };
}

export function sumCryptoEquity(holdings = []) {
  const parts = holdings
    .map((h) => moneyFromString(h.equity))
    .filter(isMoney);
  return parts.length ? moneyAdd(...parts) : MONEY_NULL;
}

async function fetchForexQuote(pairId, { requestGet, auth, urls }) {
  if (!pairId) return null;
  try {
    return await requestGet(urls.forexQuoteById(pairId), auth);
  } catch (err) {
    console.warn(`[RobinhoodCrypto] forex quote ${pairId} failed:`, err?.message || err);
    return null;
  }
}

async function fetchForexQuoteBatch(pairIds, { requestGet, auth, urls }) {
  const quoteById = {};
  if (!pairIds.length) return quoteById;

  const chunkSize = 10;
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

  for (const pairId of pairIds) {
    if (!quoteById[pairId]) {
      const single = await fetchForexQuote(pairId, { requestGet, auth, urls });
      if (single?.id) quoteById[single.id] = single;
      else if (single) quoteById[pairId] = single;
    }
  }

  return quoteById;
}

async function resolveQuoteForHolding(holding, pairIndex, quoteById, { requestGet, auth, urls }) {
  const pairId = resolveCurrencyPairId(holding, pairIndex);
  if (pairId && quoteById[pairId]) return quoteById[pairId];

  if (pairId) {
    const single = await fetchForexQuote(pairId, { requestGet, auth, urls });
    if (single) return single;
  }

  const code = resolveCryptoAssetCode(holding);
  if (!code) return null;

  const symbolPairId = pairIndex.bySymbol?.[`${code}-USD`] || pairIndex.byCode?.[code];
  if (symbolPairId && quoteById[symbolPairId]) return quoteById[symbolPairId];
  if (symbolPairId) {
    const single = await fetchForexQuote(symbolPairId, { requestGet, auth, urls });
    if (single) return single;
  }

  return null;
}

function reconcileCryptoTotal(holdings, accountCryptoEquity) {
  const summed = sumCryptoEquity(holdings);
  const accountTotal = moneyFromString(accountCryptoEquity);
  if (!isMoney(accountTotal)) return summed;
  if (!isMoney(summed)) return accountTotal;
  return summed.cents >= accountTotal.cents ? summed : accountTotal;
}

/**
 * Fetch crypto holdings + quotes using an authenticated Robinhood session.
 */
export async function fetchRobinhoodCryptoHoldings(session, {
  requestGet,
  authHeader,
  urls,
  accountCryptoEquity = null,
}) {
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
    rawHoldings = await fetchPaginatedResults(urls.nummusHoldings, requestGet, auth);
    rawHoldings = rawHoldings.filter((row) => parseFloat(holdingQuantity(row) || '0') > 0);
  } catch (err) {
    return {
      holdings: [],
      loaded: false,
      totalEquity: MONEY_NULL,
      warning: CRYPTO_LOAD_WARNING,
      error: err?.message || String(err),
    };
  }

  const hydrated = [];
  for (const row of rawHoldings) {
    hydrated.push(await hydrateHoldingRow(row, requestGet, auth));
  }

  const pairIndex = await loadCryptoCurrencyPairIndex(requestGet, auth, urls);
  const pairIds = [...new Set(hydrated.map((h) => resolveCurrencyPairId(h, pairIndex)).filter(Boolean))];
  const quoteById = await fetchForexQuoteBatch(pairIds, { requestGet, auth, urls });

  const holdings = [];
  for (const row of hydrated) {
    const costBasis = await resolveCostBasis(row, requestGet, auth);
    const quote = await resolveQuoteForHolding(row, pairIndex, quoteById, { requestGet, auth, urls });
    let priced = pickCryptoPrice(quote);
    let fallbackPrice = null;
    if (!isMoney(priced.price)) {
      const code = resolveCryptoAssetCode(row);
      fallbackPrice = code ? await fetchPublicCryptoQuote(code) : null;
    }
    holdings.push(normalizeCryptoHolding(row, quote, costBasis, fallbackPrice));
  }

  const totalEquity = reconcileCryptoTotal(holdings, accountCryptoEquity);
  const missingEquity = holdings.some((row) => row.equity == null);
  const usedAccountTotal = isMoney(totalEquity)
    && isMoney(moneyFromString(accountCryptoEquity))
    && sumCryptoEquity(holdings).cents < moneyFromString(accountCryptoEquity).cents;

  let warning = null;
  if (missingEquity && holdings.length > 0) {
    warning = usedAccountTotal
      ? 'Per-asset crypto marks unavailable — using Robinhood account crypto total.'
      : 'Some crypto positions are missing live marks — totals may be incomplete.';
  }

  return {
    holdings,
    loaded: true,
    totalEquity,
    warning,
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
