// ./sidekick/src/serverless/portfolioDiagnostics.js
/**
 * Equity reconciliation diagnostics — captures Robinhood account/position API
 * snapshots (no secrets) and compares them to Sidekick computed totals.
 * Writes equity_debug.json beside the portable executable for support handoff.
 *
 * Created by: Roy Dawson IV
 */

import { APP_VERSION } from '../lib/appVersion';
import { localDb } from './database';
import { attachHoldingIntegrity, isQuoteUnsupportedSymbol } from './dataIntegrity';
import { refreshPortfolioPrices } from './liveQuotes';
import { fetchRobinhoodLiveQuotes } from './robinhoodAuth';
import { accountNumberFromRecord, buildRobinhoodCashBreakdown } from './robinhoodAccount.js';
import {
  selectPrimaryPortfolio,
  selectPrimaryRobinhoodAccount,
} from './robinhoodAccount.js';
import { resolveAccountHeaderEquity } from './accountHeaderEquity.js';
import { moneyFromNumber, moneyToNumber } from './money.js';
import { authHeader, buildRhUrls, requestGet } from './robinhoodAuthCore.js';
import { resolveActiveRobinhoodSession, robinhoodStatus } from './robinhoodAuth';
import {
  getPortableDataDirectory,
  isPortableDesktop,
  writeStorageFile,
} from './storagePaths';

const PORTFOLIO_EQUITY_FIELDS = [
  'equity',
  'extended_hours_equity',
  'last_core_equity',
  'adjusted_equity',
  'market_value',
  'uninvested',
  'deposit_holding',
];

const ACCOUNT_EQUITY_FIELDS = [
  'portfolio_equity',
  'extended_hours_portfolio_equity',
  'last_core_portfolio_equity',
  'equity',
  'extended_hours_equity',
  'market_value',
  'cash',
  'portfolio_cash',
  'cash_available_for_withdrawal',
  'cash_held_for_orders',
  'uncleared_deposits',
  'crypto_portfolio_equity',
  'brokerage_account_type',
  'type',
  'nickname',
  'portfolio',
  'active',
  'deactivated',
  'permanently_deactivated',
  'margin_balances',
];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function pickPositive(...values) {
  for (const value of values) {
    const n = parseFloat(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function sanitizeAccount(acct) {
  if (!acct) return null;
  const out = { account_index_hint: acct.rhs_account_number ? 'present' : 'unknown' };
  for (const key of ACCOUNT_EQUITY_FIELDS) {
    if (acct[key] !== undefined && acct[key] !== null) {
      out[key] = acct[key];
    }
  }
  if (acct.margin_balances && typeof acct.margin_balances === 'object') {
    out.margin_balances = {
      unallocated_margin_cash: acct.margin_balances.unallocated_margin_cash,
      cash: acct.margin_balances.cash,
      cash_held_for_orders: acct.margin_balances.cash_held_for_orders,
      cash_available_for_withdrawal: acct.margin_balances.cash_available_for_withdrawal,
    };
  }
  return out;
}

function sanitizePortfolio(portfolio) {
  if (!portfolio) return null;
  const out = {};
  for (const key of PORTFOLIO_EQUITY_FIELDS) {
    if (portfolio[key] !== undefined && portfolio[key] !== null) {
      out[key] = portfolio[key];
    }
  }
  return out;
}

function sanitizeAccountsPayload(data) {
  const results = Array.isArray(data?.results) ? data.results : [];
  return {
    account_count: results.length,
    accounts: results.map(sanitizeAccount),
    selected: sanitizeAccount(selectPrimaryRobinhoodAccount(results)),
  };
}

async function fetchPositionsSnapshot(profileId, session) {
  const urls = await buildRhUrls();
  const auth = authHeader(session);
  const hidden = new Set(localDb.getHiddenTickers(profileId));
  const data = await requestGet(urls.positions, auth);
  const rows = [];
  for (const pos of (data?.results || []).filter((p) => parseFloat(p.quantity || '0') > 0)) {
    const qty = parseFloat(pos.quantity || '0');
    let symbol = null;
    let positionEquity = pickPositive(pos.equity, pos.market_value);
    try {
      const instrument = await requestGet(pos.instrument, auth);
      symbol = instrument?.symbol || null;
    } catch {
      // Instrument lookup failed — still record raw position metrics.
    }
    if (positionEquity == null && pos.url) {
      try {
        const detail = await requestGet(pos.url, auth);
        positionEquity = pickPositive(detail?.equity, detail?.market_value);
      } catch {
        // Position detail equity is best-effort.
      }
    }
    rows.push({
      symbol,
      hidden: symbol ? hidden.has(String(symbol).toUpperCase()) : false,
      quantity: qty,
      average_buy_price: parseFloat(pos.average_buy_price || '0'),
      equity: positionEquity,
      market_value: pickPositive(pos.market_value),
      percentage: pos.percentage,
      instrument_url: pos.instrument,
      position_url: pos.url || null,
    });
  }
  return {
    position_count: rows.length,
    positions_equity_sum: round2(rows.reduce((sum, r) => sum + (r.equity || r.market_value || 0), 0)),
    positions: rows,
  };
}

/**
 * Build a full equity diagnostic report for one profile.
 */
export async function buildPortfolioDiagnostics(profileId) {
  const profile = localDb.getProfiles().find((p) => p.id === profileId);
  const authStatus = await robinhoodStatus(profileId);
  const authState = await resolveActiveRobinhoodSession(profileId);

  let accountsPayload = null;
  let portfoliosPayload = null;
  let positionsSnapshot = null;
  let accountFetchError = null;
  let portfoliosFetchError = null;
  let positionsFetchError = null;

  if (authState.session && authState.authenticated) {
    try {
      const urls = await buildRhUrls();
      const raw = await requestGet(urls.accounts, authHeader(authState.session));
      accountsPayload = sanitizeAccountsPayload(raw);
      const selectedAcct = selectPrimaryRobinhoodAccount(raw?.results);
      const accountNumber = accountNumberFromRecord(selectedAcct);
      try {
        if (accountNumber) {
          const direct = await requestGet(urls.portfolioByAccount(accountNumber), authHeader(authState.session));
          portfoliosPayload = {
            source: 'direct',
            account_number: accountNumber,
            selected: sanitizePortfolio(direct),
          };
        }
        if (!portfoliosPayload?.selected && selectedAcct?.portfolio) {
          const linked = await requestGet(selectedAcct.portfolio, authHeader(authState.session));
          portfoliosPayload = {
            source: 'linked',
            account_number: accountNumber,
            selected: sanitizePortfolio(linked),
          };
        }
        if (!portfoliosPayload?.selected) {
          const pfList = await requestGet(urls.portfolios, authHeader(authState.session));
          const selectedPf = selectPrimaryPortfolio(pfList?.results, selectedAcct?.portfolio);
          portfoliosPayload = {
            source: 'list',
            account_number: accountNumber,
            portfolio_count: Array.isArray(pfList?.results) ? pfList.results.length : 0,
            selected: sanitizePortfolio(selectedPf),
          };
        }
        if (selectedAcct && portfoliosPayload?.selected) {
          portfoliosPayload.cash_breakdown = buildRobinhoodCashBreakdown(selectedAcct, portfoliosPayload.selected);
        }
      } catch (err) {
        portfoliosFetchError = err?.message || String(err);
      }
    } catch (err) {
      accountFetchError = err?.message || String(err);
    }
    try {
      positionsSnapshot = await fetchPositionsSnapshot(profileId, authState.session);
    } catch (err) {
      positionsFetchError = err?.message || String(err);
    }
  }

  let rhBatchQuoteProbe = null;
  if (authState.session && authState.authenticated) {
    const quotable = localDb.getHoldings(profileId)
      .map((h) => h.ticker)
      .filter((t) => !isQuoteUnsupportedSymbol(t));
    const sample = quotable.slice(0, 8);
    if (sample.length > 0) {
      try {
        const batch = await fetchRobinhoodLiveQuotes(profileId, sample);
        rhBatchQuoteProbe = {
          requested: sample.length,
          resolved: batch ? Object.keys(batch).length : 0,
          symbols: sample,
          prices: batch || {},
        };
      } catch (err) {
        rhBatchQuoteProbe = { error: err?.message || String(err) };
      }
    }
  }

  const portfolioPayload = await refreshPortfolioPrices(profileId);
  const localHoldings = localDb.getHoldings(profileId).map((h) => {
    const integrity = attachHoldingIntegrity(h);
    return {
      ticker: h.ticker,
      shares: h.shares,
      avg_buy_price: h.avg_buy_price,
      current_price: h.current_price,
      quote_status: integrity.quote_status,
      price_stale: integrity.price_stale,
      computed_value: integrity.price_stale || integrity.quote_status === 'non_quotable'
        ? 0
        : round2(h.shares * (h.current_price || 0)),
    };
  });

  const selected = accountsPayload?.selected;
  const selectedPortfolio = portfoliosPayload?.selected;
  const rhCandidates = {
    account_portfolio_equity: selected ? pickPositive(selected.portfolio_equity) : null,
    account_extended_hours_portfolio_equity: selected
      ? pickPositive(selected.extended_hours_portfolio_equity)
      : null,
    portfolios_equity: selectedPortfolio ? pickPositive(selectedPortfolio.equity) : null,
    portfolios_extended_hours_equity: selectedPortfolio
      ? pickPositive(selectedPortfolio.extended_hours_equity)
      : null,
    picked_net_equity: (() => {
      const resolved = resolveAccountHeaderEquity({
        account: selected,
        portfolio: selectedPortfolio,
        marketSession: 'auto',
        manualBreakdown: {
          stockEquity: moneyFromNumber(portfolioPayload.positions_equity),
          cash: moneyFromNumber(portfolioPayload.cash_balance),
          pendingDividends: moneyFromNumber(portfolioPayload.pending_dividends),
        },
      });
      return moneyToNumber(resolved.value);
    })(),
    header_resolution: resolveAccountHeaderEquity({
      account: selected,
      portfolio: selectedPortfolio,
      marketSession: 'auto',
      manualBreakdown: {
        stockEquity: moneyFromNumber(portfolioPayload.positions_equity),
        cash: moneyFromNumber(portfolioPayload.cash_balance),
        cryptoEquity: moneyFromNumber(portfolioPayload.crypto_market_value),
        pendingDividends: moneyFromNumber(portfolioPayload.pending_dividends),
        cryptoLoaded: portfolioPayload.crypto_holdings != null,
        cryptoLoadWarning: portfolioPayload.crypto_load_warning,
        optionsWarning: portfolioPayload.options_warning,
      },
    }),
  };

  const report = {
    generated_at: new Date().toISOString(),
    app_version: APP_VERSION,
    profile: profile ? { id: profile.id, name: profile.name, robinhood_username: profile.robinhood_username } : null,
    auth: {
      authenticated: authStatus.authenticated,
      username: authStatus.username,
      session_resolved: authState.authenticated,
    },
    account_fetch_error: accountFetchError,
    portfolios_fetch_error: portfoliosFetchError,
    positions_fetch_error: positionsFetchError,
    robinhood_accounts: accountsPayload,
    robinhood_portfolios: portfoliosPayload,
    robinhood_positions: positionsSnapshot,
    sidekick_holdings: localHoldings,
    sidekick_summary: {
      total_equity: portfolioPayload.total_equity,
      equity_source: portfolioPayload.equity_source,
      rh_reported_equity: portfolioPayload.rh_reported_equity,
      computed_equity: portfolioPayload.computed_equity,
      quote_marks_equity: portfolioPayload.quote_marks_equity,
      quote_marks_delta: portfolioPayload.quote_marks_delta,
      rh_portfolio_market_value: portfolioPayload.rh_portfolio_market_value,
      equity_delta: portfolioPayload.equity_delta,
      positions_equity: portfolioPayload.positions_equity,
      cash_balance: portfolioPayload.cash_balance,
      stale_price_count: portfolioPayload.stale_price_count,
      non_quotable_count: portfolioPayload.non_quotable_count,
      hidden_ticker_count: portfolioPayload.hidden_ticker_count,
      quote_source: portfolioPayload.quote_source,
      quote_mark_label: portfolioPayload.quote_mark_label,
      rh_quote_count: portfolioPayload.rh_quote_count,
      yahoo_quote_count: portfolioPayload.yahoo_quote_count,
      yahoo_fallback_tickers: portfolioPayload.yahoo_fallback_tickers,
      using_yahoo_fallback: portfolioPayload.using_yahoo_fallback,
      rh_cash_breakdown: portfolioPayload.rh_cash_breakdown || null,
    },
    rh_equity_candidates: rhCandidates,
    rh_batch_quote_probe: rhBatchQuoteProbe,
    reconciliation: {
      ui_should_show: portfolioPayload.equity_source === 'robinhood'
        ? portfolioPayload.total_equity
        : portfolioPayload.computed_equity,
      tracked_positions_plus_cash: portfolioPayload.computed_equity,
      robinhood_portfolio_equity_field: rhCandidates.picked_net_equity,
      delta_tracked_vs_rh_portfolio_equity: rhCandidates.picked_net_equity != null
        ? round2((portfolioPayload.computed_equity || 0) - rhCandidates.picked_net_equity)
        : null,
      delta_ui_vs_rh_portfolio_equity: rhCandidates.picked_net_equity != null
        ? round2((portfolioPayload.total_equity || 0) - rhCandidates.picked_net_equity)
        : null,
      likely_causes: [],
    },
  };

  const causes = report.reconciliation.likely_causes;
  if (!authState.authenticated) {
    causes.push('Robinhood session not validated — equity falls back to local computed sum.');
  }
  if (accountFetchError) {
    causes.push(`Account API failed: ${accountFetchError}`);
  }
  if (portfolioPayload.equity_source !== 'robinhood') {
    causes.push('Sidekick is NOT using Robinhood net equity for the dashboard header.');
  }
  if (selected && !pickPositive(selected.portfolio_equity) && selectedPortfolio) {
    causes.push('Margin account: /accounts/ has cash only — net equity must come from /portfolios/ (now attempted).');
  }
  if (portfoliosFetchError) {
    causes.push(`Portfolios API failed: ${portfoliosFetchError}`);
  }
  if ((portfolioPayload.hidden_ticker_count || 0) > 0) {
    causes.push('Hidden tickers are excluded from the holdings grid but may still exist on Robinhood.');
  }
  if ((portfolioPayload.non_quotable_count || 0) > 0) {
    causes.push('Non-quotable symbols (e.g. warrants) are excluded from position marks unless RH position equity is present.');
  }
  if (accountsPayload?.account_count > 1) {
    causes.push(`Multiple Robinhood accounts (${accountsPayload.account_count}) — verify the selected account matches your app.`);
  }
  const delta = report.reconciliation.delta_tracked_vs_rh_portfolio_equity;
  if (delta != null && Math.abs(delta) >= 0.5) {
    const direction = delta > 0 ? 'above' : 'below';
    causes.push(
      `RH-aligned positions+cash is $${Math.abs(delta).toFixed(2)} ${direction} RH portfolio_equity.`,
    );
  }
  const quoteDelta = portfolioPayload.quote_marks_delta;
  if (quoteDelta != null && Math.abs(quoteDelta) >= 1) {
    causes.push(
      `Quote-based sum (shares × quote) differs from RH net by $${Math.abs(quoteDelta).toFixed(2)} `
      + '— holdings table uses RH position marks when available.',
    );
  }
  if (portfolioPayload.quote_source === 'yahoo' && authState.authenticated) {
    causes.push('Robinhood batch quotes did not apply — holdings may be marked with Yahoo instead of RH.');
  }
  if (rhBatchQuoteProbe?.resolved === 0 && rhBatchQuoteProbe?.requested > 0) {
    causes.push('RH batch quote probe returned zero prices — check auth.log for batch quotes resolved line.');
  }

  return report;
}

/** Persist diagnostic JSON beside the executable (data/equity_debug.json). */
export async function persistEquityDebugDump(profileId) {
  const report = await buildPortfolioDiagnostics(profileId);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const filename = 'equity_debug.json';
  await writeStorageFile(filename, new TextEncoder().encode(json));
  let dataPath = null;
  try {
    if (await isPortableDesktop()) {
      dataPath = await getPortableDataDirectory();
    }
  } catch {
    // Best-effort path hint.
  }
  return {
    report,
    filename,
    dataPath,
    hint: dataPath
      ? `${dataPath}/${filename}`
      : `data/${filename} (portable storage)`,
  };
}
