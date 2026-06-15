// ./sidekick/src/serverless/robinhoodCrypto.test.js
import { describe, expect, it, vi } from 'vitest';
import {
  loadCryptoCurrencyPairIndex,
  normalizeCryptoHolding,
  resolveCryptoAssetCode,
  resolveCurrencyPairId,
  sumCryptoEquity,
} from './robinhoodCrypto.js';

describe('resolveCurrencyPairId', () => {
  it('prefers currency_pairs map over raw currency.id', () => {
    const holding = {
      currency: { id: 'asset-currency-id', code: 'BTC' },
    };
    const pairIndex = { byCode: { BTC: 'pair-btc-usd' }, bySymbol: { 'BTC-USD': 'pair-btc-usd' } };
    expect(resolveCurrencyPairId(holding, pairIndex)).toBe('pair-btc-usd');
  });

  it('does not fall back to currency.id (asset id is not a forex pair id)', () => {
    const holding = {
      currency: { id: 'asset-currency-id', code: 'BTC' },
    };
    expect(resolveCurrencyPairId(holding, { byCode: {}, bySymbol: {} })).toBeNull();
  });
});

describe('resolveCryptoAssetCode', () => {
  it('reads code from hydrated currency object', () => {
    expect(resolveCryptoAssetCode({ currency: { code: 'eth' } })).toBe('ETH');
  });
});

describe('normalizeCryptoHolding', () => {
  it('prices equity from forex mark_price and quantity', () => {
    const row = normalizeCryptoHolding(
      { quantity: '0.5', currency: { code: 'BTC' } },
      { mark_price: '100000.00' },
      { cents: 40000n },
    );
    expect(row.equity).toBe('50000.00');
    expect(row.investedAmount).toBe('400.00');
    expect(row.priceSource).toBe('mark_price');
  });

  it('falls back to Yahoo USD quote when RH forex quote is missing', () => {
    const row = normalizeCryptoHolding(
      { quantity: '2', currency: { code: 'ETH' } },
      null,
      { cents: 10000n },
      3000,
    );
    expect(row.markPrice).toBe('3000.00');
    expect(row.equity).toBe('6000.00');
    expect(row.priceSource).toBe('yahoo_usd');
  });

  it('uses inline cost_bases direct_cost_basis when present', () => {
    const row = normalizeCryptoHolding(
      {
        quantity: '1',
        currency: { code: 'ETH' },
        cost_bases: [{ direct_cost_basis: '2500.00' }, { direct_cost_basis: '125.50' }],
      },
      { mark_price: '3000.00' },
    );
    expect(row.investedAmount).toBe('2625.50');
    expect(row.equity).toBe('3000.00');
  });
});

describe('sumCryptoEquity', () => {
  it('sums normalized holding equity strings', () => {
    const total = sumCryptoEquity([
      { equity: '100.25' },
      { equity: '50.75' },
    ]);
    expect(total.cents).toBe(15100n);
  });
});

describe('loadCryptoCurrencyPairIndex', () => {
  it('indexes asset codes and symbols from nummus currency_pairs', async () => {
    const index = await loadCryptoCurrencyPairIndex(
      async () => ({
        results: [
          { id: 'pair-1', asset_currency: { code: 'BTC' }, symbol: 'BTC-USD' },
          { id: 'pair-2', asset_currency: { code: 'ETH' }, symbol: 'ETH-USD' },
        ],
      }),
      {},
      { cryptoCurrencyPairs: 'https://nummus.robinhood.com/currency_pairs/' },
    );
    expect(index).toEqual({
      byCode: { BTC: 'pair-1', ETH: 'pair-2' },
      bySymbol: { 'BTC-USD': 'pair-1', 'ETH-USD': 'pair-2' },
    });
  });
});

describe('fetchRobinhoodCryptoHoldings hydration', () => {
  it('hydrates currency URL references before resolving quotes', async () => {
    const { fetchRobinhoodCryptoHoldings } = await import('./robinhoodCrypto.js');
    const requestGet = vi.fn(async (url) => {
      if (url.includes('/holdings/')) {
        return {
          results: [{
            quantity: '1.5',
            currency: 'https://nummus.robinhood.com/currencies/btc/',
            cost_bases: ['https://nummus.robinhood.com/cost_bases/abc/'],
          }],
        };
      }
      if (url.includes('/currencies/')) {
        return { code: 'BTC', name: 'Bitcoin' };
      }
      if (url.includes('/cost_bases/')) {
        return { direct_cost_basis: '100.00' };
      }
      if (url.includes('/currency_pairs/')) {
        return { results: [{ id: 'pair-btc', asset_currency: { code: 'BTC' }, symbol: 'BTC-USD' }] };
      }
      if (url.includes('/marketdata/forex/quotes/pair-btc')) {
        return { id: 'pair-btc', mark_price: '50000.00' };
      }
      return null;
    });

    const result = await fetchRobinhoodCryptoHoldings(
      { access_token: 'token' },
      {
        requestGet,
        authHeader: () => 'Bearer token',
        urls: {
          nummusHoldings: 'https://nummus.robinhood.com/holdings/',
          cryptoCurrencyPairs: 'https://nummus.robinhood.com/currency_pairs/',
          forexQuoteById: (id) => `https://api.robinhood.com/marketdata/forex/quotes/${id}/`,
          forexQuotes: (ids) => `https://api.robinhood.com/marketdata/forex/quotes/?ids=${ids.join(',')}`,
        },
        accountCryptoEquity: '75000.00',
      },
    );

    expect(result.holdings[0].currencyCode).toBe('BTC');
    expect(result.holdings[0].investedAmount).toBe('100.00');
    expect(result.holdings[0].equity).toBe('75000.00');
    expect(result.totalEquity.cents).toBe(7500000n);
  });
});
