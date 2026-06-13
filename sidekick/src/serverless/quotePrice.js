// ./sidekick/src/serverless/quotePrice.js
/**
 * Normalize live price fields from Robinhood quote payloads.
 * Created by: Roy Dawson IV
 */

const RH_PRICE_FIELDS_EXTENDED = [
  'last_extended_hours_trade_price',
  'extended_hours_mark_price',
  'adjusted_extended_hours_mark_price',
];

const RH_PRICE_FIELDS_REGULAR = [
  'last_trade_price',
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

function pickFromFields(quote, fields) {
  if (!quote) return null;
  for (const field of fields) {
    const price = pickPositiveNumber(quote[field]);
    if (price != null) return price;
  }
  return null;
}

/** Extract best available live price from a Robinhood quote object. */
export function extractRobinhoodQuotePrice(quote, { preferExtendedHours = false } = {}) {
  if (!quote) return null;
  if (preferExtendedHours) {
    const ext = pickFromFields(quote, RH_PRICE_FIELDS_EXTENDED);
    if (ext != null) return ext;
  }
  const regular = pickFromFields(quote, RH_PRICE_FIELDS_REGULAR);
  if (regular != null) return regular;
  if (!preferExtendedHours) {
    return pickFromFields(quote, RH_PRICE_FIELDS_EXTENDED);
  }
  return null;
}

/** Parse batch quote API payload — handles `results[]`, order-aligned rows, or a single quote. */
export function parseRobinhoodBatchQuotes(data, symbolsOrder = [], options = {}) {
  const prices = {};
  const items = Array.isArray(data?.results)
    ? data.results
    : (data?.symbol ? [data] : []);
  for (let i = 0; i < items.length; i += 1) {
    const q = items[i];
    if (!q || typeof q === 'string') continue;
    const symbol = q.symbol || symbolsOrder[i];
    const price = extractRobinhoodQuotePrice(q, options);
    if (symbol && price != null) prices[String(symbol).toUpperCase()] = price;
  }
  return prices;
}
