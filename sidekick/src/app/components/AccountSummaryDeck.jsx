// ./sidekick/src/app/components/AccountSummaryDeck.jsx
/**
 * Robinhood account summary — header equity, component breakdown, crypto section.
 */
import { Bitcoin, Wallet, LineChart, AlertTriangle } from 'lucide-react';

export default function AccountSummaryDeck({ summary, formatCurrency, isSandbox, debugMode }) {
  if (isSandbox) return null;

  const cryptoHoldings = summary.crypto_holdings || [];
  const showCrypto = cryptoHoldings.length > 0 || summary.crypto_load_warning;
  const reconciliation = summary.equity_reconciliation;

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="glass-card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wallet style={{ width: 16, height: 16, color: '#34d399' }} />
          Account Summary
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <SummaryTile label="Stocks / ETFs" value={formatCurrency(summary.stock_market_value || 0)} />
          <SummaryTile label="Crypto" value={summary.crypto_market_value != null ? formatCurrency(summary.crypto_market_value) : '—'} />
          <SummaryTile label="Cash" value={formatCurrency(summary.cash_balance || 0)} />
          {summary.rh_cash_breakdown?.buying_power != null && (
            <SummaryTile label="Buying Power" value={formatCurrency(summary.rh_cash_breakdown.buying_power)} />
          )}
          {summary.pending_dividends > 0 && (
            <SummaryTile label="Pending Dividends" value={formatCurrency(summary.pending_dividends)} muted />
          )}
        </div>
        {summary.header_equity_session && (
          <p style={{ margin: '12px 0 0', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>
            Using: {summary.header_equity_session === 'extended' ? 'extended-hours' : 'regular-hours'} equity
            {summary.header_equity_field ? ` (${summary.header_equity_field})` : ''}
          </p>
        )}
        {(summary.equity_warnings || []).map((warning) => (
          <p key={warning} style={{ margin: '8px 0 0', fontSize: '10px', color: '#fbbf24' }}>{warning}</p>
        ))}
      </div>

      {showCrypto && (
        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bitcoin style={{ width: 16, height: 16, color: '#f59e0b' }} />
            Crypto
          </h3>
          {summary.crypto_load_warning && (
            <p style={{ fontSize: '11px', color: '#fbbf24', margin: '0 0 12px', display: 'flex', gap: 6, alignItems: 'center' }}>
              <AlertTriangle style={{ width: 14, height: 14 }} />
              {summary.crypto_load_warning}
            </p>
          )}
          {cryptoHoldings.length === 0 ? (
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>No crypto positions loaded.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="asset-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th style={{ textAlign: 'right' }}>Quantity</th>
                    <th style={{ textAlign: 'right' }}>Price</th>
                    <th style={{ textAlign: 'right' }}>Invested</th>
                    <th style={{ textAlign: 'right' }}>Equity</th>
                    {debugMode && <th>Source</th>}
                  </tr>
                </thead>
                <tbody>
                  {cryptoHoldings.map((row) => (
                    <tr key={row.id || row.currencyCode}>
                      <td className="ticker-td">{row.currencyCode}</td>
                      <td className="numeric-td">{row.quantity}</td>
                      <td className="numeric-td">{row.markPrice != null ? formatCurrency(row.markPrice) : '—'}</td>
                      <td className="numeric-td">{row.investedAmount != null ? formatCurrency(row.investedAmount) : (row.costBasis != null ? formatCurrency(row.costBasis) : '—')}</td>
                      <td className="numeric-td">{row.equity != null ? formatCurrency(row.equity) : '—'}</td>
                      {debugMode && <td style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{row.priceSource || row.source}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="glass-card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <LineChart style={{ width: 16, height: 16, color: '#a78bfa' }} />
          Cash / Buying Power
        </h3>
        <div style={{ display: 'grid', gap: 6, fontSize: '11px', color: 'var(--text-secondary)' }}>
          <div>Cash: {formatCurrency(summary.cash_balance || 0)}</div>
          {summary.rh_cash_breakdown?.buying_power != null && (
            <div>Buying power: {formatCurrency(summary.rh_cash_breakdown.buying_power)}</div>
          )}
          {summary.rh_cash_breakdown?.cash_held_for_orders > 0 && (
            <div>Cash held for orders: {formatCurrency(summary.rh_cash_breakdown.cash_held_for_orders)}</div>
          )}
          {summary.pending_dividends > 0 && (
            <div>Pending dividends (not added to header): {formatCurrency(summary.pending_dividends)}</div>
          )}
        </div>
      </div>

      {debugMode && reconciliation && (
        <div className="glass-card" style={{ padding: 20, fontSize: '10px', color: 'var(--text-secondary)' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 900, color: '#fff' }}>Equity Reconciliation</h3>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace', fontSize: '10px' }}>
            {JSON.stringify(reconciliation, null, 2)}
          </pre>
          {summary.options_warning && (
            <p style={{ marginTop: 8, color: '#fbbf24' }}>{summary.options_warning}</p>
          )}
        </div>
      )}
    </section>
  );
}

function SummaryTile({ label, value, muted = false }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: '14px', fontWeight: 900, color: muted ? 'var(--text-muted)' : '#fff' }}>{value}</div>
    </div>
  );
}
