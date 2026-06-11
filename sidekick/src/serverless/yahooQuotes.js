// ./sidekick/src/serverless/yahooQuotes.js
/**
 * Yahoo Finance public quote fetch — shared by robinhood sync and holdings enrichment.
 * Cross-platform: Tauri native HTTP → CapacitorHttp (Android) → fetch.
 *
 * Created by: Roy Dawson IV
 */

import { Capacitor } from '@capacitor/core';

const YAHOO_QUOTE_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; PortfolioSidekick/1.7; +https://github.com/imyourboyroy)',
};

function parseYahooChartPrice(data) {
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const candidates = [
    meta.regularMarketPrice,
    meta.postMarketPrice,
    meta.preMarketPrice,
    meta.previousClose,
  ];
  for (const value of candidates) {
    const price = parseFloat(value);
    if (Number.isFinite(price) && price > 0) return price;
  }
  return null;
}

export async function fetchYahooChartJson(url) {
  try {
    const { isTauri, invoke } = await import('@tauri-apps/api/core');
    if (await isTauri()) {
      const result = await invoke('rh_http_request', {
        method: 'GET',
        url,
        headers: YAHOO_QUOTE_HEADERS,
        body: null,
        jsonBody: null,
      });
      if (!result?.body) throw new Error('Empty Yahoo response body');
      return JSON.parse(result.body);
    }
  } catch {
    // Fall through to Capacitor / fetch.
  }

  if (Capacitor.isNativePlatform()) {
    const { CapacitorHttp } = await import('@capacitor/core');
    const res = await CapacitorHttp.get({
      url,
      headers: YAHOO_QUOTE_HEADERS,
      connectTimeout: 30000,
      readTimeout: 30000,
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    return JSON.parse(text);
  }

  const res = await fetch(url, { headers: YAHOO_QUOTE_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Day change % from Yahoo chart meta (live strength deck). */
export function parseYahooDayChangePct(data) {
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const price = parseYahooChartPrice(data);
  const prev = parseFloat(meta.chartPreviousClose ?? meta.previousClose);
  if (!Number.isFinite(price) || !Number.isFinite(prev) || prev <= 0) return null;
  return round2(((price - prev) / prev) * 100);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export async function fetchYahooDaySnapshot(ticker) {
  const formattedTicker = ticker.toUpperCase().trim();
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${formattedTicker}?range=1d&interval=1m`;
      const data = await fetchYahooChartJson(url);
      const price = parseYahooChartPrice(data);
      const change_pct = parseYahooDayChangePct(data);
      if (price == null) throw new Error('No price in chart payload');
      return { ticker: formattedTicker, price, change_pct: change_pct ?? 0 };
    } catch (err) {
      console.warn(`[Yahoo] Day snapshot failed for ${formattedTicker} via ${host}: ${err.message}`);
    }
  }
  return null;
}

export async function fetchPublicQuote(ticker) {
  const formattedTicker = ticker.toUpperCase().trim();
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${formattedTicker}?range=1d&interval=1m`;
      const data = await fetchYahooChartJson(url);
      const price = parseYahooChartPrice(data);
      if (price != null) return price;
      throw new Error('No live price in Yahoo chart payload.');
    } catch (err) {
      console.warn(`[Robinhood] Yahoo quote failed for ${formattedTicker} via ${host}: ${err.message}`);
    }
  }
  return null;
}
