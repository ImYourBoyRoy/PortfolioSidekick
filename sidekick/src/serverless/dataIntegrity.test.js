// ./sidekick/src/serverless/dataIntegrity.test.js
import { describe, expect, it } from 'vitest';
import {
  isQuoteUnsupportedSymbol,
  coerceLivePrice,
  isCostBasisMasqueradingAsLive,
  reconcileLiveQuotes,
} from './dataIntegrity.js';

describe('dataIntegrity', () => {
  it('flags warrant-style symbols as unsupported', () => {
    expect(isQuoteUnsupportedSymbol('ABCD.WS')).toBe(true);
    expect(isQuoteUnsupportedSymbol('NVDA')).toBe(false);
  });

  it('rejects cost basis masquerading as live quote', () => {
    expect(isCostBasisMasqueradingAsLive(10.5, 10.5)).toBe(true);
    expect(isCostBasisMasqueradingAsLive(11, 10.5)).toBe(false);
  });

  it('coerceLivePrice returns null for invalid candidates', () => {
    expect(coerceLivePrice(null, 10)).toBeNull();
    expect(coerceLivePrice(12.5, 10)).toBe(12.5);
  });

  it('reconcileLiveQuotes prefers Yahoo when Robinhood diverges sharply', () => {
    const result = reconcileLiveQuotes(200, 100, 50);
    expect(result.price).toBe(100);
    expect(result.source).toBe('yahoo-crosscheck');
  });

  it('reconcileLiveQuotes uses Robinhood when quotes agree', () => {
    const result = reconcileLiveQuotes(100.2, 100, 50);
    expect(result.price).toBe(100.2);
    expect(result.source).toBe('robinhood');
  });
});
