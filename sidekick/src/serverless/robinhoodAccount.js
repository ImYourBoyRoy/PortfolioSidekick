// ./sidekick/src/serverless/robinhoodAccount.js
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

/** Pick the highest valid equity field — Robinhood may leave portfolio_equity stale while extended_hours updates live. */
export function pickBestNetEquity(record, fields) {
  if (!record) return null;
  let best = null;
  for (const field of fields) {
    const n = parseFloat(record[field]);
    if (Number.isFinite(n) && n >= 0 && (best == null || n > best)) best = n;
  }
  return best;
}

const ACCOUNT_EQUITY_FIELDS = [
  'portfolio_equity',
  'extended_hours_portfolio_equity',
  'last_core_portfolio_equity',
  'equity',
  'extended_hours_equity',
];

const PORTFOLIO_EQUITY_FIELDS = [
  'equity',
  'extended_hours_equity',
  'last_core_equity',
  'adjusted_equity',
];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function parseMoney(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Extended-hours brokerage field often already embeds crypto — avoid double-counting. */
export function cryptoLikelyIncludedInBrokerage(acct) {
  const portfolio = parseMoney(acct?.portfolio_equity);
  const extended = parseMoney(acct?.extended_hours_portfolio_equity);
  const crypto = parseMoney(acct?.crypto_portfolio_equity);
  if (crypto == null || crypto <= 0 || portfolio == null || extended == null) return false;
  const gap = extended - portfolio;
  return Math.abs(gap - crypto) <= 10;
}

/**
 * Best net equity across /accounts/ and every /portfolios/ snapshot.
 * Never let a lower portfolio-direct value override a higher account extended-hours field.
 */
export function resolveRobinhoodNetEquity(acct, portfolioSnapshots = []) {
  const candidates = [];

  const accountBest = extractReportedNetEquity(acct);
  if (accountBest != null) candidates.push({ value: accountBest, source: 'accounts' });

  for (const row of portfolioSnapshots) {
    const pfBest = extractReportedNetEquityFromPortfolio(row?.portfolio);
    if (pfBest != null) candidates.push({ value: pfBest, source: row.source || 'portfolio' });
  }

  // Crypto can be reported separately from stock portfolio_equity on the same account.
  const crypto = parseMoney(acct?.crypto_portfolio_equity);
  const brokerageCore = pickBestNetEquity(acct, ACCOUNT_EQUITY_FIELDS);
  if (crypto != null && crypto > 0 && brokerageCore != null && !cryptoLikelyIncludedInBrokerage(acct)) {
    candidates.push({ value: round2(brokerageCore + crypto), source: 'accounts+crypto' });
  }

  if (!candidates.length) return { equity: null, source: 'none' };
  const winner = candidates.reduce((best, row) => (row.value > best.value ? row : best), candidates[0]);
  return { equity: winner.value, source: winner.source };
}

/** Pick the investing account Robinhood users typically see in the app header. */
export function selectPrimaryRobinhoodAccount(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const active = results.filter((acct) => acct?.permanently_deactivated !== true && acct?.deactivated !== true);
  const pool = active.length > 0 ? active : results;
  return pool.reduce((best, acct) => {
    const eq = pickBestNetEquity(acct, ACCOUNT_EQUITY_FIELDS) || 0;
    const bestEq = pickBestNetEquity(best, ACCOUNT_EQUITY_FIELDS) || 0;
    return eq >= bestEq ? acct : best;
  }, pool[0]);
}

export function extractReportedNetEquity(acct) {
  return pickBestNetEquity(acct, ACCOUNT_EQUITY_FIELDS);
}

/** Margin accounts often omit equity on /accounts/ — it lives on /portfolios/. */
export function extractReportedNetEquityFromPortfolio(portfolio) {
  return pickBestNetEquity(portfolio, PORTFOLIO_EQUITY_FIELDS);
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
  const equity = resolveRobinhoodNetEquity(acct, portfolio ? [{ portfolio, source: 'portfolio' }] : []).equity
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
