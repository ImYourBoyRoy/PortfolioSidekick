// ./frontend/src/sidekickClient.js
/**
 * Unified platform transport for Portfolio Sidekick.
 * Desktop production: pywebview IPC (no HTTP).
 * Android: native Robinhood plugin + local serverless DB.
 * Dev: loopback HTTP with local session header.
 */

import { Capacitor } from '@capacitor/core';
import { localDb } from './serverless/database';
import {
  evolveWeights,
  generateViabilityForecast,
  generateRecommendation,
} from './serverless/advisor';
import { calculateMarketStrength } from './serverless/strength';
import { fetchPublicHistoricalPrices, fetchPublicQuote } from './serverless/robinhood';

const DEV_API_BASE = 'http://127.0.0.1:8000';
let _devSessionToken = null;

export function getRuntimeMode() {
  if (typeof window !== 'undefined' && window.pywebview?.api?.api_call) {
    return 'desktop-ipc';
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return 'android-native';
  }
  return 'dev-http';
}

export function isAndroidNative() {
  return getRuntimeMode() === 'android-native';
}

export function isDesktopIpc() {
  return getRuntimeMode() === 'desktop-ipc';
}

async function ensureDevSession() {
  if (_devSessionToken) return _devSessionToken;
  try {
    const res = await fetch('http://127.0.0.1:8000/api/dev/session');
    if (res.ok) {
      const data = await res.json();
      _devSessionToken = data.token;
      return _devSessionToken;
    }
  } catch (_) {}
  return null;
}

async function desktopIpcFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const fullPath = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`;
  const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;
  const raw = await window.pywebview.api.api_call(method, fullPath, body);
  const parsed = JSON.parse(raw);
  if (!parsed.ok) {
    const err = new Error(typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error));
    err.status = parsed.status;
    throw err;
  }
  return {
    ok: true,
    status: parsed.status,
    json: async () => parsed.data,
  };
}

async function devHttpFetch(path, options = {}) {
  const token = await ensureDevSession();
  const url = path.startsWith('http') ? path : `${DEV_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = { ...(options.headers || {}) };
  if (token) headers['X-Sidekick-Local-Session'] = token;
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...options, headers });
}

async function getRobinhoodPlugin() {
  const { RobinhoodSession } = await import('./plugins/robinhood-session');
  return RobinhoodSession;
}

async function androidNativeFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const base = path.split('?')[0];
  const params = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');

  // Robinhood auth routes → native plugin
  if (base === '/api/auth/login' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const plugin = await getRobinhoodPlugin();
    const data = await plugin.login({
      profileId: body.profile_id,
      username: body.username,
      password: body.password,
      mfaCode: body.mfa_code || null,
    });
    if (data.status === 'success' && data.mode !== 'sandbox') {
      const profiles = localDb.getProfiles();
      const p = profiles.find((x) => x.id === body.profile_id);
      if (p) {
        p.robinhood_username = body.username;
        localStorage.setItem('st_profiles', JSON.stringify(profiles));
      }
    }
    return { ok: true, status: 200, json: async () => data };
  }
  if (base === '/api/auth/logout' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const plugin = await getRobinhoodPlugin();
    const data = await plugin.logout({ profileId: body.profile_id });
    return { ok: true, status: 200, json: async () => data };
  }
  if (base === '/api/auth/status' && method === 'GET') {
    const plugin = await getRobinhoodPlugin();
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    const data = await plugin.getStatus({ profileId });
    return { ok: true, status: 200, json: async () => data };
  }
  if (base === '/api/portfolio/sync' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const plugin = await getRobinhoodPlugin();
    const data = await plugin.syncHoldings({ profileId: body.profile_id });
    if (data.holdings && Array.isArray(data.holdings)) {
      for (const h of data.holdings) {
        localDb.updateHolding(body.profile_id, h.ticker, h.shares, h.avg_buy_price, h.current_price);
      }
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        status: data.status || 'success',
        synced_count: data.synced_count ?? 0,
        holdings: data.holdings,
      }),
    };
  }

  // Profiles
  if (base === '/api/profiles' && method === 'GET') {
    const profiles = localDb.getProfiles().map((p) => ({
      ...p,
      robinhood_username: p.robinhood_username || null,
    }));
    return { ok: true, status: 200, json: async () => profiles };
  }
  if (base === '/api/profiles' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const created = localDb.createProfile(body.name);
    return { ok: true, status: 200, json: async () => created };
  }
  if (base.startsWith('/api/profiles/') && method === 'DELETE') {
    const id = parseInt(base.split('/').pop(), 10);
    localDb.deleteProfile(id);
    const plugin = await getRobinhoodPlugin();
    await plugin.logout({ profileId: id }).catch(() => {});
    return { ok: true, status: 200, json: async () => ({ status: 'success' }) };
  }

  // Holdings
  if (base === '/api/portfolio/holdings' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    const rows = localDb.getHoldings(profileId);
    let totalEquity = 0;
    let totalCost = 0;
    const portfolio = [];
    for (const h of rows) {
      let price = h.current_price;
      try {
        price = await fetchPublicQuote(h.ticker);
        localDb.updateHolding(profileId, h.ticker, h.shares, h.avg_buy_price, price);
      } catch (_) {}
      const value = h.shares * price;
      const cost = h.shares * h.avg_buy_price;
      totalEquity += value;
      totalCost += cost;
      portfolio.push({
        ticker: h.ticker,
        shares: h.shares,
        avg_buy_price: h.avg_buy_price,
        current_price: price,
        total_value: Math.round(value * 100) / 100,
        total_cost: Math.round(cost * 100) / 100,
        pnl: Math.round((value - cost) * 100) / 100,
        pnl_pct: cost > 0 ? Math.round(((value - cost) / cost) * 10000) / 100 : 0,
        advisor_score: 50,
        advisor_action: 'HOLD',
        sector: 'Other/Speculative',
      });
    }
    const plugin = await getRobinhoodPlugin();
    const status = await plugin.getStatus({ profileId });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        holdings: portfolio,
        total_equity: Math.round(totalEquity * 100) / 100,
        total_cost: Math.round(totalCost * 100) / 100,
        overall_pnl: Math.round((totalEquity - totalCost) * 100) / 100,
        overall_pnl_pct: totalCost > 0 ? Math.round(((totalEquity - totalCost) / totalCost) * 10000) / 100 : 0,
        sector_concentrations: {},
        mode: status.authenticated ? 'live' : 'sandbox',
      }),
    };
  }

  if (base === '/api/portfolio/holdings' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const price = body.current_price || body.avg_buy_price;
    localDb.updateHolding(body.profile_id, body.ticker, body.shares, body.avg_buy_price, price);
    return { ok: true, status: 200, json: async () => ({ status: 'success', ticker: body.ticker }) };
  }

  if (base === '/api/portfolio/holdings/clear' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const rows = localDb.getHoldings(body.profile_id);
    for (const h of rows) {
      localDb.updateHolding(body.profile_id, h.ticker, 0, h.avg_buy_price, h.current_price);
    }
    return { ok: true, status: 200, json: async () => ({ status: 'success' }) };
  }

  if (base === '/api/advisor/market-strength' && method === 'GET') {
    const timeframe = params.get('timeframe') || 'day';
    const sector = params.get('sector') || 'all';
    return { ok: true, status: 200, json: async () => calculateMarketStrength(timeframe, sector) };
  }

  if (base === '/api/stocks/history' && method === 'GET') {
    const ticker = params.get('ticker');
    const span = params.get('span') || 'year';
    const data = await fetchPublicHistoricalPrices(ticker, span);
    return { ok: true, status: 200, json: async () => data };
  }

  if (base === '/api/advisor/recommendation' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '1', 10);
    const ticker = params.get('ticker');
    const price = await fetchPublicQuote(ticker);
    const history = await fetchPublicHistoricalPrices(ticker, 'year');
    const rec = generateRecommendation(profileId, ticker, history, price);
    return { ok: true, status: 200, json: async () => rec };
  }

  if (base === '/api/advisor/viability' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '1', 10);
    const ticker = params.get('ticker');
    const price = await fetchPublicQuote(ticker);
    const history = await fetchPublicHistoricalPrices(ticker, 'year');
    const forecast = generateViabilityForecast(profileId, ticker, history, price);
    return { ok: true, status: 200, json: async () => forecast };
  }

  if (base === '/api/advisor/evolve' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const history = await fetchPublicHistoricalPrices(body.ticker, 'year');
    const res = evolveWeights(body.profile_id, body.ticker, history);
    return { ok: true, status: 200, json: async () => res };
  }

  // Watchlist
  if (base === '/api/watchlist' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    const items = localDb.getWatchlist(profileId);
    return { ok: true, status: 200, json: async () => items };
  }
  if (base === '/api/watchlist' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    localDb.addToWatchlist(body.profile_id, body.ticker, body.notes || '');
    return { ok: true, status: 200, json: async () => ({ status: 'success', ticker: body.ticker }) };
  }
  if (base.startsWith('/api/watchlist/') && method === 'DELETE') {
    const parts = base.split('/');
    const profileId = parseInt(parts[3], 10);
    const ticker = parts[4];
    localDb.removeFromWatchlist(profileId, ticker);
    return { ok: true, status: 200, json: async () => ({ status: 'success' }) };
  }

  // Guesses
  if (base === '/api/guesses' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    const data = localDb.getGuesses(profileId);
    return { ok: true, status: 200, json: async () => data };
  }
  if (base === '/api/guesses' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const price = await fetchPublicQuote(body.ticker);
    const guess = localDb.createGuess(body.profile_id, body.ticker, body.target_price, price, body.timeframe_days);
    return { ok: true, status: 200, json: async () => ({ status: 'success', guess_id: guess.id }) };
  }

  if (base === '/api/guesses/analytics' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    const { completed } = localDb.getGuesses(profileId);
    if (!completed.length) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          overall_accuracy: 50.0,
          completed_count: 0,
          archetype: 'Oracle Apprentice',
          archetype_desc: 'No resolved price guesses yet.',
          details: { short_term: 50.0, long_term: 50.0 },
        }),
      };
    }
    const hits = completed.filter((g) => g.status === 'hit').length;
    const overall = (hits / completed.length) * 100;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        overall_accuracy: Math.round(overall * 10) / 10,
        completed_count: completed.length,
        archetype: overall > 65 ? 'Tactical Value Seeker' : 'Oracle Apprentice',
        archetype_desc: 'Analytics derived from on-device guess history.',
        details: { short_term: Math.round(overall * 10) / 10, long_term: Math.round(overall * 10) / 10 },
      }),
    };
  }

  if (base === '/api/shadow-coach/insights' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    return { ok: true, status: 200, json: async () => localDb.analyzeActions(profileId) };
  }
  if (base === '/api/shadow-coach/actions' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    return { ok: true, status: 200, json: async () => localDb.getActions(profileId) };
  }

  if (base === '/api/strategy/brackets' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    const ticker = params.get('ticker');
    const price = await fetchPublicQuote(ticker);
    const history = await fetchPublicHistoricalPrices(ticker, 'year');
    const rec = generateRecommendation(profileId, ticker, history, price);
    const holdings = localDb.getHoldings(profileId).find((h) => h.ticker === ticker.toUpperCase());
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ticker,
        current_price: price,
        owned_shares: holdings?.shares || 0,
        avg_buy_price: holdings?.avg_buy_price || 0,
        advisor_score: rec.score,
        advisor_action: rec.action,
        scale_out_profit_blueprint: [],
        scale_in_dca_blueprint: [],
        stop_loss_price: Math.round(price * 0.9 * 100) / 100,
        risk_to_reward_ratio: 1.5,
        is_asymmetric_risk: false,
        regime_status: 'BULLISH',
        vix_value: 15,
        atr: 0,
        buy_threshold: 65,
        sell_threshold: 35,
        sector: 'Other/Speculative',
      }),
    };
  }

  throw new Error(`Android native route not implemented: ${method} ${path}`);
}

/**
 * Drop-in fetch replacement for App.jsx API calls.
 * Path should be like `/profiles` or `/portfolio/holdings?profile_id=1` (with or without /api prefix).
 */
export async function sidekickFetch(path, options = {}) {
  const normalized = path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`;
  const mode = getRuntimeMode();

  if (mode === 'desktop-ipc') {
    return desktopIpcFetch(normalized, options);
  }
  if (mode === 'android-native') {
    return androidNativeFetch(normalized, options);
  }
  return devHttpFetch(normalized, options);
}
