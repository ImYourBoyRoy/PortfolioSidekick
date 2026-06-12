// ./sidekick/src/serverless/holdingAdvisor.js
/**
 * Real advisor scores for portfolio holdings via generateRecommendation + Yahoo history.
 * History is cached separately from price so quote pulses do not re-fetch year charts.
 *
 * Created by: Roy Dawson IV
 */

import { generateRecommendation } from './advisor';
import { fetchPublicHistoricalPrices } from './robinhood';

const HISTORY_CACHE_MS = 60 * 60 * 1000;
const ADVISOR_CACHE_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 180;
const historyCache = new Map();
const advisorCache = new Map();

function lruSet(map, key, value) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > MAX_CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
}

async function mapPool(items, mapper, concurrency = 4) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await mapper(items[i], i);
    }
  }
  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function unavailable(reason) {
  return {
    advisor_score: null,
    advisor_action: null,
    advisor_is_estimate: false,
    advisor_unavailable: true,
    advisor_reason: reason,
  };
}

export async function getCachedTickerHistory(ticker, { force = false } = {}) {
  const key = String(ticker || '').toUpperCase();
  if (!force) {
    const cached = historyCache.get(key);
    if (cached && Date.now() - cached.at < HISTORY_CACHE_MS) {
      return cached.data;
    }
  }
  const history = await fetchPublicHistoricalPrices(key, 'year');
  lruSet(historyCache, key, { at: Date.now(), data: history });
  return history;
}

/**
 * Resolve BUY/HOLD/SELL from live price history for one holding.
 */
export async function resolveHoldingAdvisor(profileId, holding, { force = false } = {}) {
  if (holding?.non_quotable || holding?.quote_status === 'non_quotable') {
    return unavailable('Untradeable symbol — no public quote or advisor model.');
  }
  if (holding?.price_stale || !(Number(holding?.current_price) > 0)) {
    return unavailable('Live quote required before advisor scoring.');
  }

  const ticker = String(holding.ticker || '').toUpperCase();
  const cacheKey = `${profileId}:${ticker}`;
  if (!force) {
    const cached = advisorCache.get(cacheKey);
    if (cached && Date.now() - cached.at < ADVISOR_CACHE_MS && cached.price === holding.current_price) {
      return cached.data;
    }
  }

  const history = await getCachedTickerHistory(ticker, { force });
  const rec = generateRecommendation(profileId, ticker, history, holding.current_price);

  if (rec.insufficient_data || rec.score == null || rec.action == null) {
    const data = unavailable(rec.message || 'Insufficient history for advisor model.');
    lruSet(advisorCache, cacheKey, { at: Date.now(), price: holding.current_price, data });
    return data;
  }

  const data = {
    advisor_score: rec.score,
    advisor_action: rec.action,
    advisor_is_estimate: false,
    advisor_unavailable: false,
    advisor_reason: null,
  };
  lruSet(advisorCache, cacheKey, { at: Date.now(), price: holding.current_price, data });
  return data;
}

/** Attach advisor fields to holdings that have verified live prices. */
export async function enrichHoldingsWithAdvisor(profileId, holdings, options = {}) {
  const eligible = holdings.filter((h) => !h.price_stale && Number(h.current_price) > 0);
  const advisorRows = await mapPool(
    eligible,
    (h) => resolveHoldingAdvisor(profileId, h, options),
    options.concurrency ?? 4,
  );
  const byTicker = new Map(eligible.map((h, i) => [h.ticker.toUpperCase(), advisorRows[i]]));
  return holdings.map((h) => {
    const advisor = byTicker.get(h.ticker.toUpperCase()) || unavailable(
      h.price_stale ? 'Stale quote — sync or refresh prices first.' : 'Advisor not computed.',
    );
    return { ...h, ...advisor };
  });
}

export function clearAdvisorCache() {
  advisorCache.clear();
  historyCache.clear();
}
