// ./frontend/src/serverless/yahooQuotes.js
/**
 * Yahoo Finance public quote fetch — shared by robinhood sync and holdings enrichment.
 */

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
    // Fall through to webview fetch.
  }
  const res = await fetch(url, { headers: YAHOO_QUOTE_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
