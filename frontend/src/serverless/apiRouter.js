// ./frontend/src/serverless/apiRouter.js
/**
 * Unified in-process API router for all platforms (Android, Tauri desktop, dev).
 * Replaces Python FastAPI + robin_stocks for every /api/* route the UI calls.
 * Robinhood auth uses embedded robinhoodAuth.js; persistence uses localDb + vault plugin.
 *
 * Created by: Roy Dawson IV
 */

import { localDb } from './database';
import {
  evolveWeights,
  generateViabilityForecast,
  generateRecommendation,
} from './advisor';
import { calculateMarketStrength } from './strength';
import { fetchPublicHistoricalPrices, fetchPublicQuote } from './robinhood';
import {
  robinhoodLogin,
  robinhoodLogout,
  robinhoodStatus,
  robinhoodSyncHoldings,
} from './robinhoodAuth';

function pluginErrorMessage(err, fallback) {
  if (!err) return fallback;
  const msg = err.message || err.errorMessage || (typeof err === 'string' ? err : '');
  return msg && msg.trim() ? msg : fallback;
}

/**
 * Drop-in fetch response shape used by sidekickFetch consumers.
 */
export async function serverlessApiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const base = path.split('?')[0];
  const params = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');

  if (base === '/api/auth/login' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    let data;
    try {
      data = await robinhoodLogin(
        body.profile_id,
        body.username,
        body.password,
        body.mfa_code || null
      );
    } catch (e) {
      data = { status: 'error', mode: 'live', message: pluginErrorMessage(e, 'Robinhood login failed.') };
    }
    if (data.status === 'success' && data.mode !== 'sandbox') {
      localDb.setRobinhoodUsername(body.profile_id, body.username);
    }
    return { ok: true, status: 200, json: async () => data };
  }

  if (base === '/api/auth/logout' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    let data;
    try {
      data = await robinhoodLogout(body.profile_id);
    } catch (e) {
      data = { status: 'error', message: pluginErrorMessage(e, 'Logout failed.') };
    }
    return { ok: true, status: 200, json: async () => data };
  }

  if (base === '/api/auth/status' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    let data;
    try {
      data = await robinhoodStatus(profileId);
    } catch {
      data = { authenticated: false };
    }
    return { ok: true, status: 200, json: async () => data };
  }

  if (base === '/api/portfolio/sync' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    try {
      const data = await robinhoodSyncHoldings(body.profile_id);
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
    } catch (e) {
      return {
        ok: false,
        status: 502,
        json: async () => ({ status: 'error', detail: pluginErrorMessage(e, 'Sync failed.') }),
      };
    }
  }

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
    await robinhoodLogout(id).catch(() => {});
    return { ok: true, status: 200, json: async () => ({ status: 'success' }) };
  }

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
      } catch {
        // Keep last known price when live quote fetch fails.
      }
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
    const status = await robinhoodStatus(profileId);
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

  throw new Error(`Serverless route not implemented: ${method} ${path}`);
}
