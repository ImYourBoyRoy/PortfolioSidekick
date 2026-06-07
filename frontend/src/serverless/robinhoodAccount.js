// ./frontend/src/serverless/robinhoodAccount.js
/**
 * Robinhood account selection and equity field helpers (no auth/session deps).
 * Created by: Roy Dawson IV
 */

function pickPositive(...values) {
  for (const value of values) {
    const n = parseFloat(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/** Pick the investing account Robinhood users typically see in the app header. */
export function selectPrimaryRobinhoodAccount(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const active = results.filter((acct) => acct?.permanently_deactivated !== true && acct?.deactivated !== true);
  const pool = active.length > 0 ? active : results;
  return pool.reduce((best, acct) => {
    const eq = pickPositive(
      acct.portfolio_equity,
      acct.extended_hours_portfolio_equity,
      acct.equity,
    ) || 0;
    const bestEq = pickPositive(
      best?.portfolio_equity,
      best?.extended_hours_portfolio_equity,
      best?.equity,
    ) || 0;
    return eq >= bestEq ? acct : best;
  }, pool[0]);
}

export function extractReportedNetEquity(acct) {
  if (!acct) return null;
  return pickPositive(
    acct.portfolio_equity,
    acct.extended_hours_portfolio_equity,
    acct.last_core_portfolio_equity,
    acct.equity,
    acct.extended_hours_equity,
  );
}

/** Margin accounts often omit equity on /accounts/ — it lives on /portfolios/. */
export function extractReportedNetEquityFromPortfolio(portfolio) {
  if (!portfolio) return null;
  return pickPositive(
    portfolio.equity,
    portfolio.extended_hours_equity,
    portfolio.last_core_equity,
    portfolio.adjusted_equity,
    portfolio.market_value,
  );
}

export function selectPrimaryPortfolio(results, preferredUrl = null) {
  if (!Array.isArray(results) || results.length === 0) return null;
  if (preferredUrl) {
    const match = results.find((p) => p?.url === preferredUrl || preferredUrl.includes(String(p?.id || '')));
    if (match) return match;
  }
  return results.reduce((best, portfolio) => {
    const eq = extractReportedNetEquityFromPortfolio(portfolio) || 0;
    const bestEq = extractReportedNetEquityFromPortfolio(best) || 0;
    return eq >= bestEq ? portfolio : best;
  }, results[0]);
}

export function extractPortfolioCash(acct) {
  if (!acct) return 0;
  return pickPositive(
    acct.portfolio_cash,
    acct.cash_available_for_withdrawal,
    acct.cash,
    acct.cash_held_for_orders,
  ) || 0;
}

/** Account number from Robinhood account `url` (…/accounts/{id}/). */
export function accountNumberFromRecord(acct) {
  if (!acct) return null;
  const raw = acct.account_number || acct.rhs_account_number || acct.url || acct.account;
  if (!raw) return null;
  const text = String(raw);
  const match = text.match(/accounts\/([^/]+)/i);
  if (match) return match[1];
  if (text.includes('/')) return text.replace(/\/$/, '').split('/').pop() || null;
  return text.trim() || null;
}

export function buildRobinhoodCashBreakdown(acct, portfolio = null) {
  const margin = acct?.margin_balances || {};
  const cash = extractPortfolioCash(acct);
  const marketValue = pickPositive(portfolio?.market_value, portfolio?.extended_hours_market_value) || 0;
  const equity = extractReportedNetEquityFromPortfolio(portfolio)
    || extractReportedNetEquity(acct)
    || 0;
  return {
    cash,
    buying_power: pickPositive(
      margin.buying_power,
      margin.unallocated_margin_cash,
      acct?.buying_power,
    ),
    cash_held_for_orders: pickPositive(acct?.cash_held_for_orders, margin.cash_held_for_orders) || 0,
    uncleared_deposits: pickPositive(acct?.uncleared_deposits, margin.uncleared_deposits) || 0,
    portfolio_market_value: marketValue,
    portfolio_equity: equity,
    equity_minus_market_and_cash: equity > 0 ? Math.round((equity - marketValue - cash) * 100) / 100 : null,
  };
}
