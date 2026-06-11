// ./sidekick/src/serverless/robinhood.js
/**
 * Portfolio Sidekick Robinhood Client & Yahoo Finance public quote integrations.
 * Robinhood auth uses platform-native transports (desktop Rust / Android plugin / dev HTTP).
 *
 * Created by: Roy Dawson IV
 */

import { localDb } from './database';
import { sidekickFetch } from '../lib/sidekickClient';
import { isSandboxUsername } from './authUtils';
import { mockChartBasePrice } from './portfolioConstants';
import { robinhoodLogin, robinhoodLogout as rhLogout } from './robinhoodAuth';
import { fetchPublicQuote, fetchYahooChartJson } from './yahooQuotes.js';

export { fetchPublicQuote } from './yahooQuotes.js';

const generateMockHistoricals = (ticker, count = 100) => {
  const basePrice = mockChartBasePrice(ticker);
  const history = [];
  let currentPrice = basePrice * 0.9;
  for (let i = 0; i < count; i++) {
    const changePercent = (Math.random() - 0.47) * 0.04;
    const open = currentPrice;
    const close = currentPrice * (1 + changePercent);
    const high = Math.max(open, close) * (1 + Math.random() * 0.015);
    const low = Math.min(open, close) * (1 - Math.random() * 0.015);
    currentPrice = close;
    const d = new Date();
    d.setDate(d.getDate() - (count - i));
    history.push({
      begins_at: d.toISOString(),
      open_price: Math.round(open * 100) / 100,
      close_price: Math.round(close * 100) / 100,
      high_price: Math.round(high * 100) / 100,
      low_price: Math.round(low * 100) / 100,
      volume: Math.floor(100000 + Math.random() * 900000),
    });
  }
  return history;
};

function parseYahooHistoricalSeries(data) {
  const result = data?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) return [];
  const formatted = [];
  for (let i = 0; i < timestamps.length; i++) {
    const closePrice = quote.close[i];
    if (closePrice === null || closePrice === undefined) continue;
    const d = new Date(timestamps[i] * 1000);
    formatted.push({
      begins_at: d.toISOString(),
      open_price: quote.open[i] ?? closePrice,
      close_price: closePrice,
      high_price: quote.high[i] ?? closePrice,
      low_price: quote.low[i] ?? closePrice,
      volume: parseInt(quote.volume[i] ?? 0, 10),
    });
  }
  return formatted;
}

export const fetchPublicHistoricalPrices = async (ticker, span = 'year', options = {}) => {
  const allowSynthetic = options.allowSynthetic === true;
  const formattedTicker = ticker.toUpperCase().trim();
  const range = span === 'year' ? '1y' : (span === 'month' ? '1mo' : '5d');
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${formattedTicker}?range=${range}&interval=1d`;
      const data = await fetchYahooChartJson(url);
      const formatted = parseYahooHistoricalSeries(data);
      if (formatted.length === 0) throw new Error('Empty history returned.');
      return formatted;
    } catch (err) {
      console.warn(`[Robinhood] Yahoo history failed for ${formattedTicker} via ${host}: ${err.message}`);
    }
  }
  if (!allowSynthetic) {
    console.warn(`[Robinhood] Yahoo history exhausted for ${formattedTicker}. No synthetic fallback (live integrity mode).`);
    return [];
  }
  const count = span === 'year' ? 120 : (span === 'month' ? 22 : 5);
  return generateMockHistoricals(formattedTicker, count);
};

// ─────────────────────────────────────────────────────────────
// Platform-native Robinhood authenticator (embedded serverless API)
// ─────────────────────────────────────────────────────────────

export const robinhoodClient = {
  login: async (profileId, username, password, mfaCode = null, options = {}) => {
    if (isSandboxUsername(username)) {
      return {
        status: 'success',
        mode: 'sandbox',
        message: 'Connected to Sandbox Profile! Using Yahoo Finance quotes.',
      };
    }

    try {
      const data = await robinhoodLogin(
        parseInt(profileId, 10),
        username,
        password,
        mfaCode || null,
        { continueMfa: options.continueMfa === true }
      );
      if (data.status === 'success') {
        localDb.setRobinhoodUsername(parseInt(profileId, 10), username);
      }
      return data;
    } catch (err) {
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        throw new Error('Could not reach Robinhood from this device. Check your internet connection and try again.', { cause: err });
      }
      throw err;
    }
  },

  syncHoldings: async (profileId, isSandbox = false) => {
    try {
      const res = await sidekickFetch('/portfolio/sync', {
        method: 'POST',
        body: JSON.stringify({ profile_id: parseInt(profileId, 10) }),
      });
      if (!res.ok) {
        const errObj = await res.json().catch(() => ({}));
        throw new Error(errObj.detail || errObj.message || 'Sync server returned error status.');
      }
      const data = await res.json();

      if (data.holdings && Array.isArray(data.holdings)) {
        const hidden = new Set(localDb.getHiddenTickers(profileId));
        const visibleHoldings = data.holdings.filter(
          (h) => !hidden.has(String(h.ticker).toUpperCase()),
        );
        localDb.logHoldingsSyncDiff(profileId, visibleHoldings);
        for (const h of visibleHoldings) {
          const livePrice = h.price_stale ? null : h.current_price;
          localDb.updateHolding(profileId, h.ticker, h.shares, h.avg_buy_price, livePrice, { replacePrice: true });
        }
        if (localDb.getActions(profileId).length === 0) {
          localDb.seedShadowCoachFromHoldings(profileId);
        }
        const settings = localDb.getSettings();
        if (settings.autoHideWarrants !== false) {
          const { isQuoteUnsupportedSymbol } = await import('./dataIntegrity.js');
          for (const h of data.holdings) {
            if (isQuoteUnsupportedSymbol(h.ticker)) {
              localDb.hideTicker(profileId, h.ticker);
            }
          }
        }
      }

      return data;
    } catch (err) {
      if (!isSandbox) {
        if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
          throw new Error('Could not reach Robinhood from this device. Check your connection and sign in again.', { cause: err });
        }
        throw err;
      }
      const current = localDb.getHoldings(profileId);
      let count = 0;
      for (const h of current) {
        const livePrice = await fetchPublicQuote(h.ticker);
        const price = livePrice != null && livePrice > 0 ? livePrice : h.current_price;
        localDb.updateHolding(profileId, h.ticker, h.shares, h.avg_buy_price, price);
        count++;
      }
      return { status: 'success', synced_count: count };
    }
  },

  logout: async (profileId, isSandbox = false) => {
    if (isSandbox) {
      return { status: 'success', message: 'Successfully logged out of Sandbox Profile locally.' };
    }
    try {
      const data = await rhLogout(parseInt(profileId, 10));
      localDb.clearRobinhoodUsername(parseInt(profileId, 10));
      return data;
    } catch (err) {
      throw new Error(err.message || 'Failed to log out securely.', { cause: err });
    }
  },
};
