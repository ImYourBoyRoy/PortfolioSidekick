// ./sidekick/src/serverless/news.js
/**
 * Market news via Yahoo Finance search API + RSS fallback (Android-safe native HTTP).
 */
import { nativeHttpGet, nativeHttpGetText } from './nativeHttp.js';

const MARKET_SYMBOLS = ['^GSPC', '^IXIC', '^DJI', 'SPY', 'QQQ'];
const DAY_MS = 86400000;

const YAHOO_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const normalizeItem = (raw) => {
  const ts = raw.providerPublishTime ? raw.providerPublishTime * 1000 : (raw.timestamp || Date.now());
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

function parseRssItems(xmlText, symbol) {
  if (!xmlText || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  const items = [...doc.querySelectorAll('item')];
  return items.map((node) => {
    const title = node.querySelector('title')?.textContent?.trim() || '';
    const link = node.querySelector('link')?.textContent?.trim() || '';
    const pub = node.querySelector('pubDate')?.textContent?.trim() || '';
    const ts = pub ? Date.parse(pub) : Date.now();
    return normalizeItem({
      title,
      link,
      publisher: 'Yahoo Finance',
      providerPublishTime: Math.floor(ts / 1000),
      relatedTickers: [symbol.replace('^', '')],
    });
  }).filter((i) => i.title);
}

async function fetchYahooSearchNews(sym) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const url = `https://${host}/v1/finance/search?q=${encodeURIComponent(sym)}&newsCount=12&quotesCount=0&enableFuzzyQuery=false&recommendCount=0`;
      const data = await nativeHttpGet(url, { timeoutMs: 20000, headers: YAHOO_HEADERS });
      if (Array.isArray(data?.news)) {
        return data.news.map(normalizeItem);
      }
    } catch {
      // Try next host.
    }
  }
  return [];
}

async function fetchYahooRssNews(sym) {
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`;
    const xml = await nativeHttpGetText(url, { timeoutMs: 20000, headers: YAHOO_HEADERS });
    return parseRssItems(xml, sym);
  } catch {
    return [];
  }
}

export const fetchMarketNews = async (extraSymbols = []) => {
  const symbols = [...new Set([...MARKET_SYMBOLS, ...extraSymbols.map((s) => s.toUpperCase())])].slice(0, 10);
  const collected = [];

  await Promise.all(symbols.map(async (sym) => {
    const fromSearch = await fetchYahooSearchNews(sym);
    collected.push(...fromSearch);
    if (fromSearch.length === 0) {
      collected.push(...await fetchYahooRssNews(sym));
    }
  }));

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
