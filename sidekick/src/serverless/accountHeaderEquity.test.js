// ./sidekick/src/serverless/accountHeaderEquity.test.js
import { describe, expect, it } from 'vitest';
import { resolveAccountHeaderEquity } from './accountHeaderEquity.js';
import {
  moneyFormat,
  moneyFromNumber,
  moneyFromProduct,
  moneyFromString,
} from './money.js';

describe('resolveAccountHeaderEquity', () => {
  it('stock-only account uses account-level field', () => {
    const account = { portfolio_equity: '43900.42' };
    const resolved = resolveAccountHeaderEquity({
      account,
      manualBreakdown: {
        stockEquity: moneyFromString('43900.42'),
        cash: moneyFromNumber(0),
        cryptoLoaded: true,
      },
    });
    expect(moneyFormat(resolved.value)).toBe('43900.42');
    expect(resolved.source).toBe('accounts');
    expect(resolved.sourceField).toBe('portfolio_equity');
  });

  it('stock + crypto manual breakdown reconciles to extended-hours header', () => {
    const account = {
      portfolio_equity: '43900.42',
      extended_hours_portfolio_equity: '44492.78',
    };
    const resolved = resolveAccountHeaderEquity({
      account,
      marketSession: 'extended',
      manualBreakdown: {
        stockEquity: moneyFromString('43900.42'),
        cryptoEquity: moneyFromString('592.36'),
        cash: moneyFromNumber(0),
        cryptoLoaded: true,
      },
    });
    expect(moneyFormat(resolved.value)).toBe('44492.78');
    expect(resolved.session).toBe('extended');
    expect(resolved.reconciliation.differenceBetweenSelectedAndManual).toBe('0.00');
    expect(resolved.reconciliation.manualCryptoEquity).toBe('592.36');
  });

  it('prefers extended-hours over regular portfolio equity', () => {
    const account = {
      portfolio_equity: '43900.42',
      extended_hours_portfolio_equity: '44492.78',
    };
    const resolved = resolveAccountHeaderEquity({ account });
    expect(moneyFormat(resolved.value)).toBe('44492.78');
    expect(resolved.sourceField).toBe('extended_hours_portfolio_equity');
    expect(resolved.reconciliation.regularHoursEquity).toBe('43900.42');
    expect(resolved.reconciliation.extendedHoursEquity).toBe('44492.78');
  });

  it('missing crypto endpoint keeps header but warns on manual crypto unknown', () => {
    const account = { extended_hours_portfolio_equity: '44492.78' };
    const resolved = resolveAccountHeaderEquity({
      account,
      manualBreakdown: {
        stockEquity: moneyFromString('43900.42'),
        cryptoEquity: null,
        cash: moneyFromNumber(0),
        cryptoLoaded: false,
        cryptoLoadWarning: 'Crypto holdings could not be loaded. Account header may not reconcile with Robinhood.',
      },
    });
    expect(moneyFormat(resolved.value)).toBe('44492.78');
    expect(resolved.reconciliation.cryptoLoadWarning).toContain('Crypto holdings could not be loaded');
  });

  it('does not add pending dividends to header selection', () => {
    const account = { portfolio_equity: '1000.00' };
    const resolved = resolveAccountHeaderEquity({
      account,
      manualBreakdown: {
        stockEquity: moneyFromString('900.00'),
        cash: moneyFromNumber(100),
        pendingDividends: moneyFromNumber(50),
        cryptoLoaded: true,
      },
    });
    expect(moneyFormat(resolved.value)).toBe('1000.00');
    expect(resolved.reconciliation.pendingDividends).toBe('50.00');
  });

  it('falls back to manual total when no RH equity fields exist', () => {
    const resolved = resolveAccountHeaderEquity({
      account: {},
      manualBreakdown: {
        stockEquity: moneyFromString('100.00'),
        cryptoEquity: moneyFromString('25.50'),
        cash: moneyFromNumber(10),
        cryptoLoaded: true,
      },
    });
    expect(moneyFormat(resolved.value)).toBe('135.50');
    expect(resolved.source).toBe('manual');
    expect(resolved.warnings[0]).toContain('manual diagnostic total');
  });
});

describe('money precision', () => {
  it('avoids float artifacts on integer-friendly product totals', () => {
    const equity = moneyFromProduct('1', '592.36');
    expect(moneyFormat(equity)).toBe('592.36');
  });
});
