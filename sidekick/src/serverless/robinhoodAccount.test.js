// ./sidekick/src/serverless/robinhoodAccount.test.js
import { describe, expect, it } from 'vitest';
import {
  extractReportedNetEquity,
  extractReportedNetEquityFromPortfolio,
  pickBestNetEquity,
  resolveRobinhoodNetEquity,
} from './robinhoodAccount.js';

describe('pickBestNetEquity', () => {
  it('prefers the highest valid equity field when extended hours is live', () => {
    const acct = {
      portfolio_equity: '43676.91',
      extended_hours_portfolio_equity: '44491.46',
    };
    expect(extractReportedNetEquity(acct)).toBe(44491.46);
  });

  it('uses portfolio snapshot extended hours when core equity is stale', () => {
    const portfolio = {
      equity: '43600.00',
      extended_hours_equity: '44450.25',
    };
    expect(extractReportedNetEquityFromPortfolio(portfolio)).toBe(44450.25);
  });

  it('returns null when no equity fields are present', () => {
    expect(pickBestNetEquity({}, ['portfolio_equity', 'equity'])).toBeNull();
  });

  it('does not let a lower portfolio-direct snapshot override account extended hours', () => {
    const acct = {
      portfolio_equity: '43900.00',
      extended_hours_portfolio_equity: '44490.92',
    };
    const portfolios = [{ portfolio: { equity: '43900.42' }, source: 'portfolio-direct' }];
    expect(resolveRobinhoodNetEquity(acct, portfolios)).toEqual({
      equity: 44490.92,
      source: 'accounts',
    });
  });

  it('adds crypto_portfolio_equity when brokerage fields omit crypto', () => {
    const acct = {
      portfolio_equity: '43900.42',
      crypto_portfolio_equity: '590.50',
    };
    expect(resolveRobinhoodNetEquity(acct, []).equity).toBe(44490.92);
  });
});
