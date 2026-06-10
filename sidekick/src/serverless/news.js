// ./sidekick/src/serverless/news.js
/**
 * Portfolio Sidekick Serverless Market News
 * Fetches recent major-market headlines directly from the public Yahoo Finance
 * search endpoint (same HTTPS host already used for quotes — works on desktop
 * and Android native without an external server). Headlines are de-duplicated and grouped
 * into Today / This Week / This Month / This Year buckets.
 *
 * Inputs:  optional list of extra ticker symbols (e.g. the user's holdings/watchlist).
 * Outputs: { buckets: { today, week, month, year }, total, fetchedAt }.
 *
 * Created by: Roy Dawson IV
 */

import { nativeHttpGet } from './nativeHttp.js';

// Broad market proxies always queried so there is meaningful macro coverage
// even when the user has no holdings yet.
const MARKET_SYMBOLS = ['^GSPC', '^IXIC', '^DJI', 'SPY', 'QQQ'];

const DAY_MS = 86400000;

const normalizeItem = (raw) => {
  const ts = raw.providerPublishTime ? raw.providerPublishTime * 1000 : Date.now();
  return {
    id: raw.uuid || raw.link || `${raw.title}-${ts}`,
    title: (raw.title || '').trim(),
    publisher: raw.publisher || 'Market Wire',
    link: raw.link || '',
    timestamp: ts,
    relatedTickers: Array.isArray(raw.relatedTickers) ? raw.relatedTickers.slice(0, 4) : [],
  };
};

const bucketByRecency = (items) => {
  const now = Date.now();
  const buckets = { today: [], week: [], month: [], year: [] };
  for (const item of items) {
    const age = now - item.timestamp;
    if (age <= DAY_MS) buckets.today.push(item);
    else if (age <= 7 * DAY_MS) buckets.week.push(item);
    else if (age <= 31 * DAY_MS) buckets.month.push(item);
    else buckets.year.push(item);
  }
  return buckets;
};

/**
 * Fetch and group recent market news.
 * @param {string[]} extraSymbols - additional tickers (holdings/watchlist) to enrich coverage.
 * @returns {Promise<{buckets: object, total: number, fetchedAt: number, error?: string}>}
 */
export const fetchMarketNews = async (extraSymbols = []) => {
  const symbols = [...new Set([...MARKET_SYMBOLS, ...extraSymbols.map((s) => s.toUpperCase())])].slice(0, 10);

  const collected = [];
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=12&quotesCount=0&enableFuzzyQuery=false&recommendCount=0`;
        const data = await nativeHttpGet(url, { timeoutMs: 20000 });
        if (!data) return;
        if (Array.isArray(data.news)) {
          for (const n of data.news) collected.push(normalizeItem(n));
        }
      } catch {
        // Per-symbol failures are non-fatal; other symbols may still resolve.
      }
    })
  );

  // De-duplicate by id (and by title as a fallback) then sort newest-first.
  const seen = new Set();
  const unique = [];
  for (const item of collected) {
    const key = item.id || item.title.toLowerCase();
    if (!item.title || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  unique.sort((a, b) => b.timestamp - a.timestamp);

  if (unique.length === 0) {
    return {
      buckets: { today: [], week: [], month: [], year: [] },
      total: 0,
      fetchedAt: Date.now(),
      error: 'Live market news is unavailable right now. Check your connection and try again.',
    };
  }

  return {
    buckets: bucketByRecency(unique),
    total: unique.length,
    fetchedAt: Date.now(),
  };
};

export const formatNewsTime = (timestamp, now = Date.now()) => {
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};
