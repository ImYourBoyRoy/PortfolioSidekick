// ./sidekick/src/serverless/quotePrice.js
/**
 * Normalize live price fields from Robinhood quote payloads.
 * Created by: Roy Dawson IV
 */

const RH_PRICE_FIELDS = [
  'last_trade_price',
  'last_extended_hours_trade_price',
  'mark_price',
  'adjusted_mark_price',
  'bid_price',
  'ask_price',
  'previous_close',
  'adjusted_previous_close',
];

function pickPositiveNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Extract best available live price from a Robinhood quote object. */
export function extractRobinhoodQuotePrice(quote) {
  if (!quote) return null;
  for (const field of RH_PRICE_FIELDS) {
    const price = pickPositiveNumber(quote[field]);
    if (price != null) return price;
  }
  return null;
}

/** Parse batch quote API payload — handles `results[]`, order-aligned rows, or a single quote. */
export function parseRobinhoodBatchQuotes(data, symbolsOrder = []) {
  const prices = {};
  const items = Array.isArray(data?.results)
    ? data.results
    : (data?.symbol ? [data] : []);
  for (let i = 0; i < items.length; i += 1) {
    const q = items[i];
    if (!q || typeof q === 'string') continue;
    const symbol = q.symbol || symbolsOrder[i];
    const price = extractRobinhoodQuotePrice(q);
    if (symbol && price != null) prices[String(symbol).toUpperCase()] = price;
  }
  return prices;
}
