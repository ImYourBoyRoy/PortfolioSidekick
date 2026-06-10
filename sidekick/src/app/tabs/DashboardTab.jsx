// ./sidekick/src/app/tabs/DashboardTab.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { TrendingUp, TrendingDown, LayoutDashboard, RefreshCw, Plus, Info, Sliders, Sparkles, Clipboard, Brain, MousePointerClick, ChevronDown, ChevronUp } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';
import { formatAdvisorAction, formatAdvisorScore, formatQuoteStatusLabel, hasAdvisorScore, isNonQuotableHolding, normalizeAdvisorForUi } from '../utils/holdingDisplay';

export default function DashboardTab() {
  const s = useSidekick();
  const holdingRow = s.holdings.find((h) => h.ticker.toUpperCase() === s.selectedTicker.toUpperCase());
  const apiAdvisor = normalizeAdvisorForUi(s.advisorData);
  const selectedAdvisor = apiAdvisor
    ? {
      advisor_action: apiAdvisor.action,
      advisor_score: apiAdvisor.score,
      advisor_unavailable: false,
      price_stale: false,
    }
    : holdingRow;

  const restoringPortfolio = s.holdings.length === 0 && (
    s.portfolioBootstrapping
    || s.syncing
    || (s.hasCachedRobinhoodSession && !s.isSandbox)
  );
  const showOnboardingHero = s.holdings.length === 0 && !restoringPortfolio;

  return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {restoringPortfolio ? (
            <div className="glass-card animate-fade-in onboarding-hero-card" style={{ padding: '48px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, maxWidth: '720px', margin: '20px auto', border: '1px solid rgba(16, 185, 129, 0.2)', boxShadow: '0 0 30px rgba(16, 185, 129, 0.06)', borderRadius: '24px', textAlign: 'center' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw className="animate-spin" style={{ width: 32, height: 32, color: '#34d399' }} />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '950', color: '#fff', margin: 0 }}>
                Restoring Your Portfolio
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '480px', lineHeight: '1.6', margin: 0 }}>
                A secure Robinhood session is already saved on this device. We are loading holdings and refreshing live quotes — no need to sign in again.
              </p>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>
                On slower systems this can take a few seconds. Please wait before tapping Connect or Sync.
              </p>
            </div>
          ) : showOnboardingHero ? (
            <div className="glass-card animate-fade-in onboarding-hero-card" style={{ padding: '48px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, maxWidth: '1280px', margin: '20px auto', border: '1px dashed rgba(167, 139, 250, 0.25)', boxShadow: '0 0 30px rgba(139, 92, 246, 0.05)', borderRadius: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(167, 139, 250, 0.05)', border: '1px solid rgba(167, 139, 250, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(167, 139, 250, 0.1)' }}>
                  <Brain className="animate-pulse" style={{ width: 40, height: 40, color: 'var(--color-oracle)' }} />
                </div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: '950', color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                  Begin Your Local Portfolio Journey
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '550px', lineHeight: '1.6', margin: 0 }}>
                  This profile is currently naked. Connect your portfolio to unlock high-fidelity technical charting, multi-horizon advisor scorers, tactical rebalancing preview tools, and the Shadow Coach AI behavioral analyzer.
                </p>
              </div>

              {/* Grid of pathways */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, width: '100%' }}>
                <div className="viability-target-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', padding: 20, background: 'rgba(16, 185, 129, 0.01)', border: '1px solid rgba(16, 185, 129, 0.08)' }}>
                  <span style={{ fontSize: '9px', color: '#34d399', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pathway 1 — Recommended</span>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '850', color: '#fff' }}>Robinhood Local Sync</h4>
                  <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    🔒 100% private handshake. OAuth tokens are stored in an AES-256 encrypted vault beside the executable; passwords are never saved.
                  </p>
                </div>

                <div className="viability-target-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', padding: 20, background: 'rgba(167, 139, 250, 0.01)', border: '1px solid rgba(167, 139, 250, 0.08)' }}>
                  <span style={{ fontSize: '9px', color: 'var(--color-oracle)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pathway 2 — Swift</span>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '850', color: '#fff' }}>Clipboard Paste Import</h4>
                  <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    Copy holding lists directly from Robinhood's web portal or email. Our regex parsing captures average cost and shares instantly.
                  </p>
                </div>

                <div className="viability-target-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', padding: 20, background: 'rgba(255, 255, 255, 0.01)', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pathway 3 — Risk-Free</span>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '850', color: '#fff' }}>Mock Sandbox Mode</h4>
                  <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    Generate mock positions for popular stocks like AMD, NVIDIA, and Palantir to test the rebalancing calculators immediately.
                  </p>
                </div>
              </div>

              {/* Sync Guidance Informational Callout */}
              <div 
                className="glass-card animate-fade-in" 
                style={{ 
                  width: '100%', 
                  padding: '14px 20px', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(167, 139, 250, 0.15)', 
                  backgroundColor: 'rgba(139, 92, 246, 0.02)',
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 12, 
                  textAlign: 'left'
                }}
              >
                <Info style={{ width: 18, height: 18, color: 'var(--color-oracle)', flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  <strong>💡 Sync Note:</strong> The optional Robinhood link retrieves active stock and ETF positions. Option contracts, cryptocurrencies, or cash-only balances will not populate the holdings grid, but you can always seed mock assets or adjust profile rows manually to track custom lists offline!
                </p>
              </div>

              {/* Call to Action Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', width: '100%', borderTop: '1px solid var(--border-light)', paddingTop: 24 }}>
                <button
                  type="button"
                  onClick={() => s.openRobinhoodLogin()}
                  className="glowing-sync-cta"
                  style={{ margin: 0, width: 'auto', touchAction: 'manipulation' }}
                >
                  <RefreshCw style={{ width: 14, height: 14 }} />
                  Connect Robinhood Account for Tracking
                </button>

                <button
                  onClick={() => s.setIsImportOpen(true)}
                  className="font-size-btn"
                  style={{ padding: '12px 20px', borderRadius: '12px' }}
                >
                  <Clipboard style={{ width: 14, height: 14 }} />
                  Paste Clipboard Assets
                </button>

                <button
                  onClick={s.handleSeedMockAssets}
                  className="font-size-btn"
                  style={{ padding: '12px 20px', borderRadius: '12px' }}
                >
                  <Sparkles style={{ width: 14, height: 14 }} />
                  Seed Sandbox Mock Assets
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Main Account Metrics Summary Row */}
              <section className="metrics-deck">
                <div className="glass-card metric-card" data-tooltip={s.summary.equity_source === 'robinhood'
                  ? 'Net equity pulled from your linked Robinhood account (portfolio_equity) — matches the Robinhood app header.'
                  : 'Combined value of tracked stock positions plus cash. Link Robinhood for the exact app-reported net equity.'}>
                  <span className="metric-label">Account Net Equity</span>
                  <div>
                    <h2 className="metric-value">
                      ${s.summary.total_equity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </h2>
                    {!s.isSandbox && s.summary.equity_source === 'robinhood' && (
                      <p style={{ margin: '6px 0 0', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        Robinhood-reported net equity
                        {s.summary.rh_cash_breakdown && (
                          <span style={{ display: 'block', marginTop: 4, color: '#94a3b8', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                            Cash {s.formatCurrency(s.summary.rh_cash_breakdown.cash || 0)}
                            {s.summary.rh_cash_breakdown.buying_power != null && (
                              <> · Buying power {s.formatCurrency(s.summary.rh_cash_breakdown.buying_power)}</>
                            )}
                            {s.summary.rh_cash_breakdown.pending_dividends > 0 && (
                              <> · Pending dividends {s.formatCurrency(s.summary.rh_cash_breakdown.pending_dividends)}</>
                            )}
                            {s.summary.rh_cash_breakdown.cash_held_for_orders > 0 && (
                              <> · Held for orders {s.formatCurrency(s.summary.rh_cash_breakdown.cash_held_for_orders)}</>
                            )}
                          </span>
                        )}
                        {Math.abs(s.summary.quote_marks_delta || 0) >= 1 && (
                          <span style={{ display: 'block', marginTop: 4, color: '#94a3b8', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                            Quote-based sum: {s.formatCurrency(s.summary.quote_marks_equity || 0)}
                            {' — '}
                            {(s.summary.quote_marks_delta || 0) < 0
                              ? `${s.formatCurrency(Math.abs(s.summary.quote_marks_delta))} above RH net (per-share quotes vs RH position marks)`
                              : `${s.formatCurrency(s.summary.quote_marks_delta)} below RH net`}
                          </span>
                        )}
                      </p>
                    )}
                    <div className="live-indicator-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        data-tooltip={s.summary.quote_mark_label || (s.isSandbox
                          ? 'Public Yahoo quotes — link Robinhood for marks that match the app.'
                          : 'Price marks for holdings in the table below.')}
                      >
                        <div className={!s.isSandbox && s.summary.has_verified_live_prices ? 'pulse-live' : 'pulse-stale-dot'}></div>
                        <span className="live-text" style={{ color: !s.isSandbox && s.summary.has_verified_live_prices ? undefined : '#fbbf24' }}>
                          {s.summary.quote_mark_label
                            || (s.summary.stale_price_count > 0
                              ? `Quote refresh needed (${s.summary.stale_price_count} quotable stale)`
                              : (s.isSandbox ? 'Public quotes (Yahoo)' : 'Awaiting verified quotes'))}
                        </span>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.12)' }}>•</span>
                      {s.isSyncStale() ? (
                        <div 
                          style={{ display: 'flex', alignItems: 'center', gap: 5 }} 
                          data-tooltip="Portfolio data is older than 5 minutes. Sync with Robinhood in the header to fetch the absolute latest stats!"
                        >
                          <div className="pulse-stale-dot animate-pulse" style={{ width: 6, height: 6, backgroundColor: '#fbbf24', borderRadius: '50%', boxShadow: '0 0 8px #fbbf24' }}></div>
                          <span style={{ fontSize: '9px', color: '#fbbf24', fontWeight: '800', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                            Sync Stale ({s.formatLastSync()})
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 6, height: 6, backgroundColor: '#34d399', borderRadius: '50%', opacity: 0.8 }}></div>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '600' }}>
                            Synced {s.formatLastSync()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="metric-subtext">Localized data protection active</span>
                </div>

                <div className="glass-card metric-card" data-tooltip="The actual total cash value originally spent to purchase your current assets (average cost multiplied by share volume).">
                  <span className="metric-label">Capital Deployed</span>
                  <div>
                    <h2 className="metric-value" style={{ color: 'var(--text-secondary)' }}>
                      ${s.summary.total_cost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </h2>
                  </div>
                  <span className="metric-subtext">Total original cost basis</span>
                </div>

                <div className="glass-card metric-card" data-tooltip="Unrealized gain/loss on visible holdings vs imported average cost — independent of Robinhood net equity header.">
                  <span className="metric-label">Position P&L (Unrealized)</span>
                  <div>
                    <h2 className={`metric-value ${s.summary.overall_pnl >= 0 ? 'metric-pnl-pos' : 'metric-pnl-neg'}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {s.summary.overall_pnl >= 0 ? <TrendingUp style={{ width: 24, height: 24 }} /> : <TrendingDown style={{ width: 24, height: 24 }} />}
                      {s.summary.overall_pnl >= 0 ? '+' : ''}${s.summary.overall_pnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </h2>
                    <span className={`metric-subtext ${s.summary.overall_pnl >= 0 ? 'text-highlight-green' : 'metric-pnl-neg'}`} style={{ fontWeight: '800', textTransform: 'none' }}>
                      {s.summary.overall_pnl >= 0 ? '+' : ''}{s.summary.overall_pnl_pct.toFixed(2)}% vs cost basis
                    </span>
                  </div>
                  <span className="metric-subtext">Sum of holding marks minus imported cost</span>
                </div>
              </section>

              {/* Main Portfolio Grid: Left Holdings, Right Selected Quick Snapshot */}
              <div className="dashboard-grid">
                {/* Holdings list */}
                <div className="glass-card holdings-container">
                  <div className="holdings-header">
                    <div>
                      <h3 className="holdings-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <LayoutDashboard className="w-4 h-4 text-violet-400" />
                        Current Portfolio Holdings
                      </h3>
                      <p className="holdings-subtitle">Active assets loaded from Robinhood or Manual SQLite. Click a ticker row to analyze.</p>
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table className="asset-table">
                      <thead>
                        <tr>
                          <th style={{ width: '12%', textAlign: 'left' }}>Ticker</th>
                          <th style={{ width: '14%', textAlign: 'right' }}>Shares</th>
                          <th style={{ width: '14%', textAlign: 'right' }}>Avg Cost</th>
                          <th style={{ width: '14%', textAlign: 'right' }}>Current Price</th>
                          <th style={{ width: '16%', textAlign: 'right' }}>Equity Value</th>
                          <th style={{ width: '15%', textAlign: 'center' }}>Return (PnL)</th>
                          <th style={{ width: '15%', textAlign: 'center' }}>Advisor Verdict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.holdings.map(h => (
                          <tr 
                            key={h.id}
                            onClick={() => s.setSelectedTicker(h.ticker)}
                            className={`${s.selectedTicker.toUpperCase() === h.ticker.toUpperCase() ? 'tr-selected' : ''} row-${(h.advisor_action || 'HOLD').toLowerCase()}`}
                            style={{ cursor: 'pointer' }}
                          >
                            <td className="ticker-td" style={{ color: 'var(--color-oracle)', fontWeight: '950' }}>{h.ticker}</td>
                            <td className="numeric-td">{h.shares.toLocaleString()}</td>
                            <td className="numeric-td">{s.formatCurrency(h.avg_buy_price)}</td>
                            <td className="numeric-td" style={{ color: h.price_stale || h.quote_status === 'non_quotable' ? '#fbbf24' : (String(h.price_source || '').includes('yahoo') && !s.isSandbox ? '#fbbf24' : '#fff'), fontWeight: '800' }}>
                              {h.quote_status === 'non_quotable' ? '—' : (h.price_stale ? '—' : s.formatCurrency(h.current_price))}
                              {!s.isSandbox && String(h.price_source || '').includes('yahoo') && !h.price_stale && (
                                <span style={{ display: 'block', fontSize: '8px', fontWeight: 800, color: '#fbbf24', letterSpacing: '0.04em' }}>Yahoo</span>
                              )}
                            </td>
                            <td className="numeric-td" style={{ color: '#a78bfa', fontWeight: '800' }}>
                              {h.quote_status === 'non_quotable' ? '—' : (h.price_stale ? '—' : s.formatCurrency(h.total_value))}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {formatQuoteStatusLabel(h) ? (
                                <span className="badge badge-hold" style={{ padding: '2px 8px', fontSize: '9px', fontWeight: '900' }}>{formatQuoteStatusLabel(h)}</span>
                              ) : h.price_stale || h.pnl_pct == null ? (
                                <span className="badge badge-hold" style={{ padding: '2px 8px', fontSize: '9px', fontWeight: '900' }}>Pending quote</span>
                              ) : (
                                <span className={`badge ${h.pnl >= 0 ? 'badge-buy' : 'badge-sell'}`} style={{ padding: '2px 8px', fontSize: '9px', fontWeight: '900' }}>
                                  {h.pnl >= 0 ? '▲ +' : '▼ '}{h.pnl_pct.toFixed(1)}%
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {hasAdvisorScore(h) ? (
                                <span className={`badge ${h.advisor_action === 'BUY' ? 'badge-buy' : h.advisor_action === 'SELL' ? 'badge-sell' : 'badge-hold'}`} style={{ padding: '4px 10px', fontSize: '9px', fontWeight: '900' }}>
                                  {formatAdvisorAction(h)}
                                </span>
                              ) : (
                                <span className="badge badge-hold" style={{ padding: '4px 10px', fontSize: '9px', fontWeight: '900' }}>
                                  Pending
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Selected Stock Insight */}
                <div className="glass-card selected-stock-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: '#fff' }}>{s.selectedTicker} Market Insight</h3>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Real-time advisor analysis</span>
                    </div>
                    {hasAdvisorScore(selectedAdvisor) && (
                      <div className={`badge ${selectedAdvisor.advisor_action === 'BUY' ? 'badge-buy' : selectedAdvisor.advisor_action === 'SELL' ? 'badge-sell' : 'badge-hold'}`} style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '900' }}>
                        {formatAdvisorAction(selectedAdvisor)}
                      </div>
                    )}
                  </div>

                  {hasAdvisorScore(selectedAdvisor) ? (
                    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                      
                      {/* Radial Gauge Visual */}
                      <div className="radial-container" style={{ margin: '0 auto', position: 'relative', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg height="130" width="130" style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}>
                          {/* Track Circle */}
                          <circle
                            stroke="rgba(255, 255, 255, 0.02)"
                            fill="transparent"
                            strokeWidth="9"
                            r="50"
                            cx="65"
                            cy="65"
                          />
                          {/* Glowing Background Glow Circle */}
                          <circle
                            stroke={selectedAdvisor.advisor_action === 'BUY' ? 'rgba(16, 185, 129, 0.15)' : selectedAdvisor.advisor_action === 'SELL' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(251, 191, 36, 0.15)'}
                            fill="transparent"
                            strokeWidth="9"
                            r="50"
                            cx="65"
                            cy="65"
                            strokeDasharray={`${2 * Math.PI * 50}`}
                            strokeDashoffset={`${2 * Math.PI * 50 * (1 - selectedAdvisor.advisor_score / 100)}`}
                            strokeLinecap="round"
                            style={{ filter: 'blur(5px)', transition: 'stroke-dashoffset 0.8s ease' }}
                          />
                          {/* Main Colored Progress Circle */}
                          <circle
                            stroke={selectedAdvisor.advisor_action === 'BUY' ? 'var(--color-buy)' : selectedAdvisor.advisor_action === 'SELL' ? 'var(--color-sell)' : 'var(--color-hold)'}
                            fill="transparent"
                            strokeWidth="9"
                            r="50"
                            cx="65"
                            cy="65"
                            strokeDasharray={`${2 * Math.PI * 50}`}
                            strokeDashoffset={`${2 * Math.PI * 50 * (1 - selectedAdvisor.advisor_score / 100)}`}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                          />
                        </svg>
                        <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', inset: 0 }}>
                          <span style={{ fontSize: '24px', fontWeight: '950', color: '#fff', textShadow: selectedAdvisor.advisor_action === 'BUY' ? '0 0 15px rgba(16,185,129,0.45)' : selectedAdvisor.advisor_action === 'SELL' ? '0 0 15px rgba(244,63,94,0.45)' : '0 0 15px rgba(251,191,36,0.45)' }}>
                            {formatAdvisorScore(selectedAdvisor, 0)}
                          </span>
                          <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '900', marginTop: '-3px' }}>
                            Confidence
                          </span>
                        </div>
                      </div>

                      {/* Technical DNA stats deck (Grid or beautifully spaced rows) */}
                      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div className="glass-card" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '8.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800' }}>Strength</span>
                          <span style={{ fontSize: '13px', fontWeight: '900', color: selectedAdvisor.advisor_score >= 65 ? 'var(--color-buy)' : selectedAdvisor.advisor_score >= 35 ? 'var(--color-hold)' : 'var(--color-sell)' }}>
                            {selectedAdvisor.advisor_score >= 70 ? 'Strong' : selectedAdvisor.advisor_score >= 45 ? 'Moderate' : 'Soft'}
                          </span>
                        </div>
                        <div className="glass-card" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', textAlign: 'center' }}>
                          <span style={{ fontSize: '8.5px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800' }}>Verdict</span>
                          <span style={{ fontSize: '13px', fontWeight: '900', color: selectedAdvisor.advisor_action === 'BUY' ? 'var(--color-buy)' : selectedAdvisor.advisor_action === 'SELL' ? 'var(--color-sell)' : 'var(--color-hold)' }}>
                            {selectedAdvisor.advisor_action}
                          </span>
                        </div>
                      </div>

                      {s.isCoachMode && (
                        <div className="coach-tip-bubble" style={{ width: '100%', margin: '0' }}>
                          <strong>🎓 Coach Tip:</strong> The Scoring Engine weights indicators dynamically. 
                          For <strong>{s.selectedTicker}</strong>, local parameters suggest a clear <strong>{selectedAdvisor.advisor_action}</strong> strategy based on compounding trade backtests.
                        </div>
                      )}

                      <button
                        onClick={() => s.setActiveTab("coach")}
                        className="btn-dial-chart"
                        style={{ width: '100%', margin: '0' }}
                      >
                        Open Interactive Chart
                        <MousePointerClick style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  ) : (
                    <div className="glass-card" style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <span>
                        {isNonQuotableHolding(holdingRow)
                          ? 'This warrant/special symbol has no public quote feed and cannot be traded. Hide it from the dashboard if you do not want to track it here.'
                          : (holdingRow?.price_stale
                            ? 'Live quote required before advisor analysis can run for this position.'
                            : 'Advisor analysis is computing — refresh quotes or tap Sync Account if this persists.')}
                      </span>
                      {isNonQuotableHolding(holdingRow) && (
                        <button
                          type="button"
                          onClick={() => s.handleHideHolding(s.selectedTicker)}
                          className="font-size-btn"
                          style={{ alignSelf: 'center', padding: '10px 16px', borderRadius: '10px' }}
                        >
                          Hide {s.selectedTicker} from dashboard
                        </button>
                      )}
                    </div>
                  )}

                  {/* SQLite DB manual adjustments Collapsible drawer */}
                  <div className="glass-card manual-adjustments-card">
                    <button
                      onClick={() => s.setShowManualAdjust(!s.showManualAdjust)}
                      className="collapsible-trigger-btn"
                    >
                      <span>
                        <Sliders style={{ width: 12, height: 12 }} />
                        Adjust Portfolio Row
                      </span>
                      {s.showManualAdjust ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                    </button>

                    {s.showManualAdjust && (
                      <form onSubmit={s.handleAdjustHolding} className="manual-form-grid">
                        <div className="input-group">
                          <label className="input-label">Asset Shares Qty</label>
                          <input
                            type="number"
                            step="any"
                            required
                            placeholder="e.g. 41.35"
                            value={s.holdingForm.shares}
                            onChange={(e) => s.setHoldingForm(prev => ({ ...prev, shares: e.target.value }))}
                            className="form-input-text"
                          />
                        </div>
                        <div className="input-group">
                          <label className="input-label">Average Buy Cost Basis ($)</label>
                          <input
                            type="number"
                            step="any"
                            required
                            placeholder="e.g. 212.49"
                            value={s.holdingForm.avg_buy_price}
                            onChange={(e) => s.setHoldingForm(prev => ({ ...prev, avg_buy_price: e.target.value }))}
                            className="form-input-text"
                          />
                        </div>
                        <button
                          type="submit"
                          className="btn-form-submit"
                        >
                          Update SQLite Database
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Watchlist & Buy Strategies Monitor Section */}
              <div className="glass-card holdings-container" style={{ marginTop: '0px' }}>
                <div className="holdings-header">
                  <div>
                    <h3 className="holdings-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TrendingUp className="w-4 h-4 text-violet-400" />
                      Watchlist & Buy Strategies Monitor
                    </h3>
                    <p className="holdings-subtitle">Track potential entries. Click a watched stock to instantly plot its historical technical patterns.</p>
                  </div>
                  
                  {/* Watchlist Quick-Add Form */}
                  <form onSubmit={s.handleAddToWatchlist} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      required
                      placeholder="Ticker (e.g. BTC)"
                      value={s.watchlistForm.ticker}
                      onChange={(e) => s.setWatchlistForm(prev => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
                      className="form-input-text"
                      style={{ width: '130px', padding: '6px 12px', fontSize: '11px', textTransform: 'uppercase' }}
                    />
                    <input
                      type="text"
                      placeholder="Optional Notes"
                      value={s.watchlistForm.notes || ''}
                      onChange={(e) => s.setWatchlistForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="form-input-text"
                      style={{ width: '180px', padding: '6px 12px', fontSize: '11px' }}
                    />
                    <button type="submit" className="btn-base btn-primary" style={{ padding: '6px 12px', fontSize: '11px' }}>
                      <Plus className="w-3.5 h-3.5" />
                      Add Stock
                    </button>
                  </form>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="asset-table">
                    <thead>
                      <tr>
                        <th>Ticker</th>
                        <th>Date Added</th>
                        <th style={{ textAlign: 'right' }}>Live Price</th>
                        <th style={{ textAlign: 'center' }}>Advisor Action</th>
                        <th style={{ textAlign: 'center' }}>Confidence</th>
                        <th>Buy Strategies & Timing Indicators</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.watchlist.map(w => (
                        <tr 
                          key={w.id}
                          onClick={() => s.setSelectedTicker(w.ticker)}
                          className={s.selectedTicker.toUpperCase() === w.ticker.toUpperCase() ? 'tr-selected' : ''}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="ticker-td" style={{ color: 'var(--color-oracle)' }}>{w.ticker}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{w.added_at}</td>
                          <td className="numeric-td" style={{ color: '#fff', fontWeight: '800' }}>
                            {w.current_price > 0 ? `$${w.current_price.toFixed(2)}` : 'Loading...'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`badge ${w.recommendation === 'BUY' ? 'badge-buy' : w.recommendation === 'SELL' ? 'badge-sell' : 'badge-hold'}`} style={{ padding: '4px 10px', fontSize: '9px', fontWeight: '900' }}>
                              {w.recommendation === 'BUY' ? '▲ BUY' : w.recommendation === 'SELL' ? '▼ SELL' : '◆ HOLD'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', color: '#fff', fontSize: '11px', fontWeight: '800' }}>
                            {w.score}%
                          </td>
                          <td style={{ fontSize: '11px', fontWeight: '700', color: w.timing?.includes('Oversold') || w.timing?.includes('Bounce') || w.timing?.includes('Momentum') ? 'var(--color-buy)' : 'var(--text-secondary)' }}>
                            {w.timing} {w.notes ? <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontStyle: 'italic', marginLeft: '6px' }}>— {w.notes}</span> : ''}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                s.handleRemoveFromWatchlist(w.ticker);
                              }}
                              className="btn-base btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '9px', borderColor: 'rgba(244,63,94,0.1)', color: '#fb7185' }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {s.watchlist.length === 0 && (
                        <tr key="empty-s.watchlist">
                          <td colSpan="7" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600' }}>
                            Your watchlist is currently empty. Enter a stock ticker and optional notes above to monitor for entry timings.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
  );
}
