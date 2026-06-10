// ./sidekick/src/serverless/apiRouter.js
/**
 * Unified in-process API router for all platforms (Android, Tauri desktop, dev).
 * Embedded /api/* router — all UI data and Robinhood orchestration (no external server).
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
import { refreshPortfolioPrices } from './liveQuotes';
import { buildPortfolioDiagnostics, persistEquityDebugDump } from './portfolioDiagnostics';
import { buildGuessAnalytics } from './guessAnalytics';
import { coerceLivePrice, isQuoteUnsupportedSymbol } from './dataIntegrity';
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
        body.mfa_code || null,
        { continueMfa: body.continue_mfa === true }
      );
    } catch (e) {
      data = { status: 'error', mode: 'live', message: pluginErrorMessage(e, 'Robinhood login failed.') };
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
          const livePrice = h.price_stale ? null : h.current_price;
          localDb.updateHolding(
            body.profile_id,
            h.ticker,
            h.shares,
            h.avg_buy_price,
            livePrice,
            { replacePrice: true },
          );
        }
      }
      const settings = localDb.getSettings();
      const autoHideWarrants = settings.autoHideWarrants !== false;
      if (autoHideWarrants && Array.isArray(data.holdings)) {
        for (const h of data.holdings) {
          if (isQuoteUnsupportedSymbol(h.ticker)) {
            localDb.hideTicker(body.profile_id, h.ticker);
          }
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
    const payload = await refreshPortfolioPrices(profileId);
    return { ok: true, status: 200, json: async () => payload };
  }

  if (base === '/api/portfolio/diagnostics' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    const save = params.get('save') === '1' || params.get('save') === 'true';
    try {
      if (save) {
        const dump = await persistEquityDebugDump(profileId);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            saved_to: dump.hint,
            filename: dump.filename,
            report: dump.report,
          }),
        };
      }
      const report = await buildPortfolioDiagnostics(profileId);
      return { ok: true, status: 200, json: async () => ({ status: 'success', report }) };
    } catch (err) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ status: 'error', detail: err?.message || String(err) }),
      };
    }
  }

  if (base === '/api/portfolio/holdings' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    let price = body.current_price;
    if (!(Number(price) > 0)) {
      const quoted = await fetchPublicQuote(body.ticker);
      price = quoted;
    }
    if (!(Number(price) > 0)) {
      return {
        ok: false,
        status: 422,
        json: async () => ({
          status: 'error',
          detail: `Live quote required for ${body.ticker}. Cost basis cannot be used as market price.`,
        }),
      };
    }
    localDb.updateHolding(body.profile_id, body.ticker, body.shares, body.avg_buy_price, price);
    return { ok: true, status: 200, json: async () => ({ status: 'success', ticker: body.ticker }) };
  }

  if (base === '/api/portfolio/holdings/hide' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const profileId = parseInt(body.profile_id || '0', 10);
    const ticker = String(body.ticker || '').toUpperCase().trim();
    if (!profileId || !ticker) {
      return { ok: false, status: 400, json: async () => ({ detail: 'profile_id and ticker required' }) };
    }
    const hidden = localDb.hideTicker(profileId, ticker);
    return { ok: true, status: 200, json: async () => ({ status: 'success', hidden }) };
  }

  if (base === '/api/portfolio/holdings/unhide' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const profileId = parseInt(body.profile_id || '0', 10);
    const ticker = String(body.ticker || '').toUpperCase().trim();
    if (!profileId || !ticker) {
      return { ok: false, status: 400, json: async () => ({ detail: 'profile_id and ticker required' }) };
    }
    const hidden = localDb.unhideTicker(profileId, ticker);
    return { ok: true, status: 200, json: async () => ({ status: 'success', hidden }) };
  }

  if (base === '/api/portfolio/holdings/hidden' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    if (!profileId) {
      return { ok: false, status: 400, json: async () => ({ detail: 'profile_id required' }) };
    }
    const hidden = localDb.getHiddenTickers(profileId);
    return { ok: true, status: 200, json: async () => ({ hidden }) };
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
    const ticker = String(params.get('ticker') || '').toUpperCase();
    const holding = localDb.getHoldings(profileId).find((h) => h.ticker.toUpperCase() === ticker);
    const quotePrice = await fetchPublicQuote(ticker);
    let price = coerceLivePrice(quotePrice, holding?.avg_buy_price);
    if (price == null && holding?.current_price > 0 && !holding?.price_stale) {
      price = coerceLivePrice(holding.current_price, holding.avg_buy_price);
    }
    if (!(Number(price) > 0)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ticker,
          insufficient_data: true,
          action: null,
          score: null,
          message: 'Live quote required before advisor scoring.',
        }),
      };
    }
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
    return {
      ok: true,
      status: 200,
      json: async () => buildGuessAnalytics(localDb.getGuesses(profileId)),
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

  if (base === '/api/shadow-coach/actions' && method === 'POST') {
    const body = JSON.parse(options.body || '{}');
    const row = localDb.logAction(
      body.profile_id,
      body.action_type,
      body.ticker,
      body.shares,
      body.price,
      { notes: body.notes, source: body.source || 'api' }
    );
    return { ok: true, status: 200, json: async () => ({ status: 'success', action: row }) };
  }

  if (base === '/api/strategy/brackets' && method === 'GET') {
    const profileId = parseInt(params.get('profile_id') || '0', 10);
    const ticker = params.get('ticker');
    const holdings = localDb.getHoldings(profileId).find((h) => h.ticker === ticker.toUpperCase());
    const quoted = await fetchPublicQuote(ticker);
    const price = quoted != null && quoted > 0 ? quoted : (holdings?.current_price > 0 ? holdings.current_price : null);
    if (!(Number(price) > 0)) {
      return {
        ok: false,
        status: 422,
        json: async () => ({
          status: 'error',
          detail: `Live quote required for ${ticker} before strategy brackets can be computed.`,
        }),
      };
    }
    const history = await fetchPublicHistoricalPrices(ticker, 'year');
    const rec = generateRecommendation(profileId, ticker, history, price);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ticker,
        current_price: price,
        owned_shares: holdings?.shares || 0,
        avg_buy_price: holdings?.avg_buy_price || 0,
        advisor_score: rec.insufficient_data ? null : rec.score,
        advisor_action: rec.insufficient_data ? null : rec.action,
        advisor_is_estimate: false,
        scale_out_profit_blueprint: [],
        scale_in_dca_blueprint: [],
        stop_loss_price: Math.round(price * 0.9 * 100) / 100,
        risk_to_reward_ratio: 1.5,
        is_asymmetric_risk: false,
        regime_status: rec.regime_status || null,
        regime_is_estimate: rec.regime_is_estimate === true,
        vix_value: rec.vix_value,
        atr: 0,
        buy_threshold: 65,
        sell_threshold: 35,
        sector: 'Other/Speculative',
      }),
    };
  }

  throw new Error(`Serverless route not implemented: ${method} ${path}`);
}
