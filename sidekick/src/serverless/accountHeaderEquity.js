// ./sidekick/src/serverless/accountHeaderEquity.js
/**
 * Central resolver for Robinhood account header equity (authoritative net worth).
 * Priority-ordered field selection — manual reconstruction is diagnostic-only fallback.
 *
 * Created by: Roy Dawson IV
 */

import {
  isMoney,
  moneyAdd,
  moneyAbs,
  moneyFormat,
  moneyFromNumber,
  moneyFromString,
  moneySub,
  MONEY_NULL,
} from './money.js';
import { pickBestNetEquity, resolveRobinhoodNetEquity } from './robinhoodAccount.js';

const UNIFIED_TIERS = new Set(['unified-extended', 'unified-regular']);

const UNIFIED_EXTENDED_FIELDS = [
  'total_extended_hours_equity',
  'phoenix_extended_hours_equity',
  'unified_extended_hours_equity',
  'total_extended_hours_portfolio_equity',
];

const UNIFIED_REGULAR_FIELDS = [
  'total_equity',
  'phoenix_equity',
  'unified_equity',
  'total_portfolio_equity',
];

const PRIORITY_RULES = [
  { tier: 'unified-extended', fields: UNIFIED_EXTENDED_FIELDS, session: 'extended' },
  { tier: 'unified-regular', fields: UNIFIED_REGULAR_FIELDS, session: 'regular' },
  { tier: 'account-extended', fields: ['extended_hours_portfolio_equity', 'extended_hours_equity'], session: 'extended', records: ['account'] },
  { tier: 'account-regular', fields: ['portfolio_equity', 'equity'], session: 'regular', records: ['account'] },
  { tier: 'portfolio-extended', fields: ['extended_hours_equity', 'extended_hours_portfolio_equity'], session: 'extended', records: ['portfolio'] },
  { tier: 'portfolio-regular', fields: ['equity', 'adjusted_equity'], session: 'regular', records: ['portfolio'] },
];

function recordMap({ account, portfolio, unifiedAccount }) {
  return {
    unified: unifiedAccount || account || null,
    account: account || null,
    portfolio: portfolio || null,
  };
}

function pickMoneyField(record, field) {
  if (!record || field == null) return MONEY_NULL;
  return moneyFromString(record[field]);
}

function scanRecordsForField(records, field) {
  for (const row of records) {
    const value = pickMoneyField(row.record, field);
    if (isMoney(value)) {
      return {
        value,
        source: row.source,
        sourceField: field,
      };
    }
  }
  return null;
}

function recordsForRule(rule, maps) {
  if (rule.records?.includes('account') && maps.account) {
    return [{ record: maps.account, source: 'accounts' }];
  }
  if (rule.records?.includes('portfolio') && maps.portfolio) {
    return [{ record: maps.portfolio, source: 'portfolios' }];
  }
  const unifiedRows = [];
  if (maps.unified) unifiedRows.push({ record: maps.unified, source: 'unified' });
  if (maps.account) unifiedRows.push({ record: maps.account, source: 'accounts' });
  if (maps.portfolio) unifiedRows.push({ record: maps.portfolio, source: 'portfolios' });
  return unifiedRows;
}

function extractSessionEquity(maps) {
  const regular = scanRecordsForField(
    [
      { record: maps.account, source: 'accounts' },
      { record: maps.portfolio, source: 'portfolios' },
    ].filter((row) => row.record),
    'portfolio_equity',
  ) || scanRecordsForField(
    [{ record: maps.portfolio, source: 'portfolios' }].filter((row) => row.record),
    'equity',
  );

  const extended = scanRecordsForField(
    [
      { record: maps.account, source: 'accounts' },
      { record: maps.portfolio, source: 'portfolios' },
    ].filter((row) => row.record),
    'extended_hours_portfolio_equity',
  ) || scanRecordsForField(
    [
      { record: maps.account, source: 'accounts' },
      { record: maps.portfolio, source: 'portfolios' },
    ].filter((row) => row.record),
    'extended_hours_equity',
  );

  return {
    regularHoursEquity: regular?.value || MONEY_NULL,
    extendedHoursEquity: extended?.value || MONEY_NULL,
  };
}

function buildManualTotal(manualBreakdown = {}) {
  const parts = [
    manualBreakdown.cash,
    manualBreakdown.stockEquity,
    manualBreakdown.cryptoEquity,
    manualBreakdown.optionEquity,
    manualBreakdown.otherVerifiedComponents,
  ].filter(isMoney);
  if (!parts.length) return MONEY_NULL;
  return moneyAdd(...parts);
}

function pickCryptoAddon(account, manualBreakdown = {}) {
  if (isMoney(manualBreakdown.cryptoEquity)) return manualBreakdown.cryptoEquity;
  return moneyFromString(account?.crypto_portfolio_equity);
}

/**
 * Brokerage-only account fields often omit crypto; pick the candidate that best matches manual totals.
 */
export function augmentSelectedEquityWithCrypto(selected, account, manualBreakdown = {}) {
  if (!selected || UNIFIED_TIERS.has(selected.tier)) return selected;

  const cryptoAddon = pickCryptoAddon(account, manualBreakdown);
  if (!isMoney(cryptoAddon)) return selected;

  const candidates = [selected];

  candidates.push({
    ...selected,
    value: moneyAdd(selected.value, cryptoAddon),
    sourceField: `${selected.sourceField}+crypto_portfolio_equity`,
    tier: `${selected.tier}+crypto`,
  });

  const brokerageBest = moneyFromNumber(pickBestNetEquity(account, [
    'extended_hours_portfolio_equity',
    'portfolio_equity',
    'last_core_portfolio_equity',
    'equity',
    'extended_hours_equity',
  ]) ?? NaN);
  if (isMoney(brokerageBest)) {
    candidates.push({
      ...selected,
      value: moneyAdd(brokerageBest, cryptoAddon),
      source: 'accounts',
      sourceField: 'brokerage_best+crypto_portfolio_equity',
      tier: 'accounts+brokerage_crypto',
      session: selected.session,
    });
  }

  const coreEquity = moneyFromString(account?.portfolio_equity)
    || moneyFromString(account?.last_core_portfolio_equity);
  if (isMoney(coreEquity)) {
    candidates.push({
      ...selected,
      value: moneyAdd(coreEquity, cryptoAddon),
      source: 'accounts',
      sourceField: 'portfolio_equity+crypto_portfolio_equity',
      tier: 'accounts+crypto',
      session: selected.session,
    });
  }

  const manualTotal = buildManualTotal(manualBreakdown);
  if (isMoney(manualTotal) && manualBreakdown.cryptoLoaded) {
    return candidates.reduce((best, row) => {
      const bestDelta = moneyAbs(moneySub(best.value, manualTotal));
      const rowDelta = moneyAbs(moneySub(row.value, manualTotal));
      return rowDelta.cents < bestDelta.cents ? row : best;
    }, candidates[0]);
  }

  if (isMoney(moneyFromString(account?.crypto_portfolio_equity))) {
    return candidates.reduce((best, row) => (
      row.value.cents > best.value.cents ? row : best
    ), candidates[0]);
  }

  return selected;
}

/**
 * @param {object} input
 * @param {object|null} input.account
 * @param {object|null} input.portfolio
 * @param {object[]} [input.portfolioList]
 * @param {object|null} [input.unifiedAccount]
 * @param {'regular'|'extended'|'auto'} [input.marketSession]
 * @param {object} [input.manualBreakdown]
 */
export function resolveAccountHeaderEquity(input = {}) {
  const warnings = [];
  const account = input.account || null;
  const portfolio = input.portfolio
    || (Array.isArray(input.portfolioList) ? input.portfolioList[0] : null)
    || null;
  const unifiedAccount = input.unifiedAccount || account || null;
  const maps = recordMap({ account, portfolio, unifiedAccount });
  const sessions = extractSessionEquity(maps);

  let selected = null;
  for (const rule of PRIORITY_RULES) {
    const records = recordsForRule(rule, maps);
    for (const field of rule.fields) {
      const hit = scanRecordsForField(records, field);
      if (hit) {
        selected = { ...hit, session: rule.session, tier: rule.tier };
        break;
      }
    }
    if (selected) break;
  }

  if (selected) {
    selected = augmentSelectedEquityWithCrypto(selected, account, input.manualBreakdown);
    const rhNet = resolveRobinhoodNetEquity(
      account,
      (Array.isArray(input.portfolioList) ? input.portfolioList : []).map((portfolio) => ({
        portfolio,
        source: 'portfolios',
      })),
    );
    if (rhNet.equity != null) {
      const rhNetValue = moneyFromNumber(rhNet.equity);
      if (isMoney(rhNetValue) && (!selected || rhNetValue.cents > selected.value.cents)) {
        selected = {
          value: rhNetValue,
          source: rhNet.source,
          sourceField: 'resolveRobinhoodNetEquity',
          session: selected?.session || 'regular',
          tier: 'rh-net-equity',
        };
      }
    }
  }

  const manualTotal = buildManualTotal(input.manualBreakdown);
  if (!selected && isMoney(manualTotal)) {
    selected = {
      value: manualTotal,
      source: 'manual',
      sourceField: 'manualBreakdown',
      session: input.marketSession === 'extended' ? 'extended' : 'regular',
      tier: 'manual-fallback',
    };
    warnings.push('No Robinhood account-level equity field available — using manual diagnostic total.');
  }

  if (!selected) {
    return {
      value: MONEY_NULL,
      source: 'none',
      sourceField: null,
      session: null,
      components: input.manualBreakdown || null,
      warnings: ['Robinhood account equity unavailable.'],
      reconciliation: buildReconciliation({
        selected: null,
        sessions,
        manualBreakdown: input.manualBreakdown,
        pendingDividends: input.manualBreakdown?.pendingDividends,
      }),
    };
  }

  if (input.marketSession === 'extended' && !isMoney(sessions.extendedHoursEquity) && selected.session === 'regular') {
    warnings.push('Extended-hours equity unavailable — showing regular-hours account field.');
  }

  const reconciliation = buildReconciliation({
    selected,
    sessions,
    manualBreakdown: input.manualBreakdown,
    pendingDividends: input.manualBreakdown?.pendingDividends,
  });

  return {
    value: selected.value,
    source: selected.source,
    sourceField: selected.sourceField,
    session: selected.session,
    tier: selected.tier,
    components: input.manualBreakdown || null,
    warnings,
    reconciliation,
  };
}

function buildReconciliation({ selected, sessions, manualBreakdown = {}, pendingDividends }) {
  const manualTotal = buildManualTotal(manualBreakdown);
  const selectedValue = selected?.value || MONEY_NULL;
  const delta = isMoney(selectedValue) && isMoney(manualTotal)
    ? moneySub(selectedValue, manualTotal)
    : MONEY_NULL;

  return {
    robinhoodHeaderEquity: isMoney(sessions.extendedHoursEquity)
      ? moneyFormat(sessions.extendedHoursEquity)
      : (isMoney(sessions.regularHoursEquity) ? moneyFormat(sessions.regularHoursEquity) : null),
    selectedHeaderEquity: moneyFormat(selectedValue),
    selectedHeaderSource: selected?.source || null,
    selectedHeaderField: selected?.sourceField || null,
    selectedHeaderSession: selected?.session || null,
    regularHoursEquity: moneyFormat(sessions.regularHoursEquity),
    extendedHoursEquity: moneyFormat(sessions.extendedHoursEquity),
    manualStockEquity: moneyFormat(manualBreakdown.stockEquity),
    manualCryptoEquity: moneyFormat(manualBreakdown.cryptoEquity),
    manualOptionEquity: moneyFormat(manualBreakdown.optionEquity),
    cash: moneyFormat(manualBreakdown.cash),
    cashHeldForOrders: moneyFormat(manualBreakdown.cashHeldForOrders),
    cashHeldForOptionsCollateral: moneyFormat(manualBreakdown.cashHeldForOptionsCollateral),
    pendingDividends: moneyFormat(pendingDividends),
    manualTotalEquity: moneyFormat(manualTotal),
    differenceBetweenSelectedAndManual: moneyFormat(delta),
    optionsLoaded: manualBreakdown.optionsLoaded === true,
    cryptoLoaded: manualBreakdown.cryptoLoaded === true,
    cryptoLoadWarning: manualBreakdown.cryptoLoadWarning || null,
    optionsWarning: manualBreakdown.optionsWarning || null,
  };
}

export function serializeAccountEquityLog(resolved) {
  return {
    selectedHeaderValue: moneyFormat(resolved.value),
    selectedHeaderSource: resolved.source,
    selectedHeaderField: resolved.sourceField,
    selectedHeaderSession: resolved.session,
    ...resolved.reconciliation,
    warnings: resolved.warnings,
  };
}
