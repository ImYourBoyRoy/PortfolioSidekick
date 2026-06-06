// ./frontend/src/serverless/robinhood.js
/**
 * Portfolio Sidekick Robinhood Client & Yahoo Finance public quote integrations.
 * Robinhood auth uses platform-native transports (desktop IPC / Android plugin / dev HTTP).
 * Never routes credentials through configurable remote backend URLs.
 *
 * Created by: Roy Dawson IV
 */

import { localDb } from './database';
import { sidekickFetch, isServerlessBackend } from '../sidekickClient';

// ─────────────────────────────────────────────────────────────
// Public Yahoo Finance (HTTPS only)
// ─────────────────────────────────────────────────────────────

export const fetchPublicQuote = async (ticker) => {
  const formattedTicker = ticker.toUpperCase().trim();
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedTicker}?range=1d&interval=1m`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Yahoo Finance quote fetch failed.");
    const data = await res.json();
    const price = data.chart.result[0].meta.regularMarketPrice;
    return parseFloat(price);
  } catch (err) {
    console.warn(`[WARNING] Failed to fetch quote for ${formattedTicker}: ${err.message}. Using seed value.`);
    const defaults = {
      "QBTS": 30.16, "RGTI": 23.86, "ZYNE": 100.31, "SLRC": 12.98,
      "ARKK": 82.28, "NVDA": 210.85, "AMD": 511.16, "IONQ": 71.76,
      "AVGO": 465.16, "PLTR": 171.18, "TSM": 413.86, "INTC": 109.65,
      "NUKZ": 2.40, "NLR": 132.47, "SPY": 510.50, "QQQ": 435.20, "VIX": 14.85
    };
    return defaults[formattedTicker] || 100.0;
  }
};

const generateMockHistoricals = (ticker, count = 100) => {
  const defaults = {
    "QBTS": 30.16, "RGTI": 23.86, "ZYNE": 100.31, "SLRC": 12.98,
    "ARKK": 82.28, "NVDA": 210.85, "AMD": 511.16, "IONQ": 71.76,
    "AVGO": 465.16, "PLTR": 171.18, "TSM": 413.86, "INTC": 109.65,
    "NUKZ": 2.40, "NLR": 132.47, "SPY": 510.50, "QQQ": 435.20, "VIX": 14.85
  };
  const basePrice = defaults[ticker.toUpperCase()] || 100.0;
  const history = [];
  let currentPrice = basePrice * 0.90;
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
      volume: Math.floor(100000 + Math.random() * 900000)
    });
  }
  return history;
};

export const fetchPublicHistoricalPrices = async (ticker, span = "year") => {
  const formattedTicker = ticker.toUpperCase().trim();
  try {
    const range = span === "year" ? "1y" : (span === "month" ? "1mo" : "5d");
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedTicker}?range=${range}&interval=1d`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Yahoo Finance historical fetch failed.");
    const data = await res.json();
    const result = data.chart.result[0];
    const timestamps = result.timestamp || [];
    const quote = result.indicators.quote[0];
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
        volume: parseInt(quote.volume[i] ?? 0)
      });
    }
    if (formatted.length === 0) throw new Error("Empty history returned.");
    return formatted;
  } catch (err) {
    console.warn(`[WARNING] Failed to fetch historicals for ${formattedTicker}: ${err.message}. Generating mock data.`);
    const count = span === "year" ? 120 : (span === "month" ? 22 : 5);
    return generateMockHistoricals(formattedTicker, count);
  }
};

// ─────────────────────────────────────────────────────────────
// Platform-native Robinhood authenticator
// ─────────────────────────────────────────────────────────────

export const robinhoodClient = {
  login: async (profileId, username, password, mfaCode = null, options = {}) => {
    if (username.toLowerCase() === "sandbox" || username.toLowerCase() === "example" || username.toLowerCase().includes("test")) {
      return {
        status: "success",
        mode: "sandbox",
        message: "Successfully connected to Sandbox Profile! Using Yahoo Finance quotes."
      };
    }

    try {
      const res = await sidekickFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          profile_id: parseInt(profileId),
          username,
          password,
          mfa_code: mfaCode || null,
          continue_mfa: options.continueMfa === true,
        })
      });
      if (!res.ok) {
        const errObj = await res.json().catch(() => ({}));
        throw new Error(errObj.detail || errObj.message || "Authentication failed.");
      }
      const data = await res.json();
      if (data.status === "success" && isServerlessBackend()) {
        localDb.setRobinhoodUsername(parseInt(profileId, 10), username);
      }
      return data;
    } catch (err) {
      if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        throw new Error("Could not reach Robinhood from this device. Check your internet connection and try again.", { cause: err });
      }
      throw err;
    }
  },

  syncHoldings: async (profileId, isSandbox = false) => {
    try {
      const res = await sidekickFetch("/portfolio/sync", {
        method: "POST",
        body: JSON.stringify({ profile_id: parseInt(profileId) })
      });
      if (!res.ok) {
        const errObj = await res.json().catch(() => ({}));
        throw new Error(errObj.detail || errObj.message || "Sync server returned error status.");
      }
      const data = await res.json();

      if (data.holdings && Array.isArray(data.holdings)) {
        for (const h of data.holdings) {
          localDb.updateHolding(profileId, h.ticker, h.shares, h.avg_buy_price, h.current_price);
        }
      }

      return data;
    } catch (err) {
      if (!isSandbox) {
        if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
          throw new Error("Could not reach Robinhood from this device. Check your connection and sign in again.", { cause: err });
        }
        throw err;
      }
      const current = localDb.getHoldings(profileId);
      let count = 0;
      for (const h of current) {
        const livePrice = await fetchPublicQuote(h.ticker);
        localDb.updateHolding(profileId, h.ticker, h.shares, h.avg_buy_price, livePrice);
        count++;
      }
      return { status: "success", synced_count: count };
    }
  },

  logout: async (profileId, isSandbox = false) => {
    if (isSandbox) {
      return { status: "success", message: "Successfully logged out of Sandbox Profile locally." };
    }
    try {
      const res = await sidekickFetch("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ profile_id: parseInt(profileId) })
      });
      if (!res.ok) throw new Error("Logout failed.");
      const data = await res.json();
      if (isServerlessBackend()) {
        localDb.clearRobinhoodUsername(parseInt(profileId, 10));
      }
      return data;
    } catch (err) {
      throw new Error(err.message || "Failed to log out securely.", { cause: err });
    }
  }
};
