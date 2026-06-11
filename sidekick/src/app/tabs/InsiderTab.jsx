// ./sidekick/src/app/tabs/InsiderTab.jsx
/**
 * Congressional & insider STOCK Act disclosures — House Clerk + Senate eFD.
 */
import { RefreshCw, Landmark, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

export default function InsiderTab() {
  const s = useSidekick();

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="glass-card" style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Landmark style={{ width: 18, height: 18, color: '#34d399' }} />
            Congressional &amp; Insider Movers
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)', maxWidth: 560, lineHeight: 1.5 }}>
            Official House &amp; Senate STOCK Act filings for Pelosi, Tuberville, Gottheimer, and other tracked officials.
            New trades may not appear for up to {s.STOCK_ACT_MAX_LAG_DAYS} days after the transaction.
          </p>
          {s.congressSyncStatus?.label && (
            <p style={{ margin: '6px 0 0 0', fontSize: '10px', color: 'var(--text-secondary)', maxWidth: 560 }}>
              {s.congressSyncStatus.label}
              {s.congressSyncStatus.absoluteSynced ? (
                <span style={{ color: 'var(--text-muted)' }}> ({s.congressSyncStatus.absoluteSynced})</span>
              ) : null}
            </p>
          )}
        </div>
        <button
          onClick={() => s.loadCongressTrades(true)}
          disabled={s.congressLoading}
          className="btn-primary"
          style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 800, borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: s.congressLoading ? 0.6 : 1 }}
        >
          <RefreshCw className={s.congressLoading ? 'animate-spin' : ''} style={{ width: 13, height: 13 }} />
          {s.congressLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {s.congressData?.disclaimer && (
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            padding: '10px 12px',
            lineHeight: 1.55,
            borderRadius: 10,
            border: '1px solid rgba(52,211,153,0.15)',
            background: 'rgba(52,211,153,0.04)',
          }}
        >
          <strong style={{ color: '#34d399' }}>Disclosure timing:</strong> {s.congressData.disclaimer}
        </div>
      )}

      {s.congressData?.warnings?.length > 0 && (
        <div className="glass-card" style={{ padding: 14, fontSize: '11px', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>
          Some sources were unavailable — showing partial results.
          <div style={{ marginTop: 6, fontSize: '10px', color: 'var(--text-muted)' }}>
            {s.congressData.warnings.join(' ')}
          </div>
        </div>
      )}

      {s.congressLoading && !s.congressData && (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          <RefreshCw className="animate-spin" style={{ width: 22, height: 22, marginBottom: 10 }} />
          <div>Querying House Clerk &amp; Senate eFD (official STOCK Act sources)…</div>
          <div style={{ marginTop: 6, fontSize: '10px' }}>First load can take up to a minute while PTR filings are parsed.</div>
        </div>
      )}

      {s.congressData?.error && s.congressData.trades?.length === 0 && (
        <div className="glass-card" style={{ padding: 28, textAlign: 'center', color: '#fbbf24', fontSize: '12px', border: '1px solid rgba(245,158,11,0.2)' }}>
          {s.congressData.error}
        </div>
      )}

      {s.congressData && s.congressData.trades?.length > 0 && (
        <div className="glass-card" style={{ padding: 18 }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', fontWeight: 900, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tracked officials · {s.congressData.total} recent filing{s.congressData.total === 1 ? '' : 's'}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {s.congressData.trades.map((trade) => {
              const isBuy = trade.type === 'buy';
              const TypeIcon = isBuy ? TrendingUp : TrendingDown;
              const typeColor = isBuy ? '#34d399' : '#f87171';
              return (
                <button
                  key={trade.id}
                  onClick={() => trade.ptrLink && s.openNewsLink(trade.ptrLink)}
                  style={{
                    textAlign: 'left',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-light, rgba(255,255,255,0.06))',
                    borderRadius: 10,
                    padding: '12px 14px',
                    cursor: trade.ptrLink ? 'pointer' : 'default',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 8,
                    alignItems: 'start',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#fff' }}>
                      {trade.politician}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600, marginLeft: 6 }}>
                        · {trade.chamber === 'house' ? 'House' : 'Senate'}
                      </span>
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {trade.ticker ? (
                        <strong style={{ color: '#c4b5fd' }}>{trade.ticker}</strong>
                      ) : (
                        <span>{trade.asset || 'Asset'}</span>
                      )}
                      {trade.asset && trade.ticker ? ` — ${trade.asset}` : ''}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Disclosed {s.formatCongressTradeDate(trade.disclosureDate)}
                      {trade.transactionDate ? ` · Traded ${s.formatCongressTradeDate(trade.transactionDate)}` : ''}
                      {trade.owner ? ` · ${trade.owner}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '10px', fontWeight: 800, color: typeColor, textTransform: 'uppercase' }}>
                      <TypeIcon style={{ width: 12, height: 12 }} />
                      {trade.type}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>{trade.amount}</span>
                    {trade.ptrLink && <ExternalLink style={{ width: 11, height: 11, color: 'var(--text-muted)' }} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {s.congressData && !s.congressData.error && s.congressData.trades?.length === 0 && !s.congressLoading && (
        <div className="glass-card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          No recent disclosures for tracked officials in the last 120 days.
        </div>
      )}
    </div>
  );
}
