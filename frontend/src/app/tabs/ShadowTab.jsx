// ./frontend/src/app/tabs/ShadowTab.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { RefreshCw, Plus, Minus, Sparkles, Eye, History, ArrowUpRight, ArrowDownRight, Repeat } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

export default function ShadowTab() {
  const s = useSidekick();

  return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* Shadow Coach Hero Banner */}
          <div className="glass-card shadow-coach-hero">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="shadow-coach-icon-box">
                <Eye style={{ width: 22, height: 22, color: '#fff' }} />
              </div>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'calc(1.35rem + var(--font-size-offset, 0px))', fontWeight: 900, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
                  Shadow Coach
                </h2>
                <p style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)', marginTop: 2 }}>
                  I watch every move you make — buys, sells, adjustments — and learn from your patterns to help you grow.
                </p>
              </div>
            </div>
            {/* Time Filter Pills */}
            <div className="coach-time-filters">
              {["7d", "30d", "90d", "all"].map(f => (
                <button
                  key={f}
                  onClick={() => s.setCoachTimeFilter(f)}
                  className={`coach-filter-pill ${s.coachTimeFilter === f ? 'coach-filter-active' : ''}`}
                >
                  {f === "all" ? "All Time" : f === "7d" ? "7 Days" : f === "30d" ? "30 Days" : "90 Days"}
                </button>
              ))}
            </div>
          </div>

          {s.coachLoading ? (
            <div className="shadow-coach-grid">
              {/* LEFT COLUMN: Shimmering Metrics Skeleton */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Win Rate Ring Shimmer */}
                <div className="glass-card shadow-metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="skeleton-shimmer" style={{ width: '120px', height: '14px', borderRadius: '4px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginTop: '12px' }}>
                    <div className="skeleton-shimmer" style={{ width: '90px', height: '90px', borderRadius: '50%' }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div className="skeleton-shimmer" style={{ width: '90%', height: '12px', borderRadius: '4px' }} />
                      <div className="skeleton-shimmer" style={{ width: '70%', height: '12px', borderRadius: '4px' }} />
                      <div className="skeleton-shimmer" style={{ width: '50%', height: '12px', borderRadius: '4px' }} />
                    </div>
                  </div>
                </div>

                {/* Volumes Bar Shimmer */}
                <div className="glass-card shadow-metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="skeleton-shimmer" style={{ width: '80px', height: '14px', borderRadius: '4px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div className="skeleton-shimmer" style={{ width: '20px', height: '20px', borderRadius: '4px' }} />
                        <div className="skeleton-shimmer" style={{ flex: 1, height: '8px', borderRadius: '4px' }} />
                        <div className="skeleton-shimmer" style={{ width: '30px', height: '12px', borderRadius: '4px' }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Shimmering Insights Timeline Skeleton */}
              <div className="glass-card shadow-insights-card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="skeleton-shimmer" style={{ width: '160px', height: '16px', borderRadius: '4px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '12px', padding: '14px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
                      <div className="skeleton-shimmer" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div className="skeleton-shimmer" style={{ height: '12px', width: '90%', borderRadius: '4px' }} />
                        <div className="skeleton-shimmer" style={{ height: '8px', width: '60%', borderRadius: '4px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : s.actionHistory.length === 0 ? (
            <div className="tab-empty-placeholder-card animate-fade-in" style={{ marginTop: 0 }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Eye className="animate-pulse" style={{ width: 28, height: 28, color: 'var(--color-oracle)' }} />
              </div>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '950', color: '#fff', letterSpacing: '-0.01em' }}>
                  No Behavioral Data Logged Yet
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '480px', lineHeight: '1.6' }}>
                  Shadow Coach learns from your active trades (buys, sells, adjustments) and gut predictions, automatically mapping your behavioral patterns to deliver personalized win rates and archetypes.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', borderTop: '1px solid var(--border-light)', paddingTop: 20, width: '100%' }}>
                <button
                  onClick={() => s.openRobinhoodLogin()}
                  className="glowing-sync-cta"
                  style={{ margin: 0, width: 'auto' }}
                >
                  <RefreshCw style={{ width: 14, height: 14 }} />
                  Connect Robinhood Account
                </button>
                <button
                  onClick={s.handleSeedMockAssets}
                  className="font-size-btn"
                  style={{ padding: '12px 20px', borderRadius: '12px' }}
                >
                  <Sparkles style={{ width: 14, height: 14 }} />
                  Seed Sandbox Assets
                </button>
              </div>
            </div>
          ) : s.shadowCoachData ? (
            <div className="shadow-coach-grid">
              {/* LEFT COLUMN: Behavioral Metrics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Win Rate Ring */}
                <div className="glass-card shadow-metric-card">
                  <span className="metric-label" style={{ fontSize: 'calc(10px + var(--font-size-offset, 0px))' }}>Trade Win Rate</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 12 }}>
                    <div className="shadow-win-ring-container">
                      <svg width="110" height="110" viewBox="0 0 110 110">
                        <circle cx="55" cy="55" r="46" stroke="rgba(255,255,255,0.06)" strokeWidth="8" fill="none" />
                        <circle
                          cx="55" cy="55" r="46"
                          stroke={s.shadowCoachData.win_rate >= 60 ? '#10b981' : s.shadowCoachData.win_rate >= 40 ? '#f59e0b' : '#f43f5e'}
                          strokeWidth="8"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={`${(s.shadowCoachData.win_rate / 100) * 289} 289`}
                          transform="rotate(-90 55 55)"
                          style={{ transition: 'stroke-dasharray 1s ease-out' }}
                        />
                        <text x="55" y="50" textAnchor="middle" fill="var(--text-primary)" fontFamily="var(--font-heading)" fontWeight="900" fontSize="calc(22px + var(--font-size-offset, 0px))">
                          {s.shadowCoachData.win_rate}%
                        </text>
                        <text x="55" y="68" textAnchor="middle" fill="var(--text-muted)" fontSize="calc(9px + var(--font-size-offset, 0px))">
                          WIN RATE
                        </text>
                      </svg>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="shadow-stat-mini">
                        <ArrowUpRight style={{ width: 14, height: 14, color: '#10b981' }} />
                        <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>Avg Win</span>
                        <span style={{ fontSize: 'calc(14px + var(--font-size-offset, 0px))', fontWeight: 800, color: '#10b981' }}>+{s.shadowCoachData.avg_win_pct}%</span>
                      </div>
                      <div className="shadow-stat-mini">
                        <ArrowDownRight style={{ width: 14, height: 14, color: '#f43f5e' }} />
                        <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>Avg Loss</span>
                        <span style={{ fontSize: 'calc(14px + var(--font-size-offset, 0px))', fontWeight: 800, color: '#f43f5e' }}>-{s.shadowCoachData.avg_loss_pct}%</span>
                      </div>
                      <div className="shadow-stat-mini">
                        <Repeat style={{ width: 14, height: 14, color: 'var(--color-oracle)' }} />
                        <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>Total</span>
                        <span style={{ fontSize: 'calc(14px + var(--font-size-offset, 0px))', fontWeight: 800, color: 'var(--text-primary)' }}>{s.shadowCoachData.total_actions}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Volume Breakdown */}
                <div className="glass-card shadow-metric-card">
                  <span className="metric-label" style={{ fontSize: 'calc(10px + var(--font-size-offset, 0px))' }}>Action Breakdown</span>
                  <div className="shadow-volume-bars">
                    {[
                      { label: "Buys", count: s.shadowCoachData.buys, color: "#10b981", icon: <Plus style={{ width: 12, height: 12 }} /> },
                      { label: "Sells", count: s.shadowCoachData.sells, color: "#f43f5e", icon: <Minus style={{ width: 12, height: 12 }} /> },
                      { label: "Adjusts", count: s.shadowCoachData.adjusts, color: "#8b5cf6", icon: <Repeat style={{ width: 12, height: 12 }} /> }
                    ].map(item => (
                      <div key={item.label} className="shadow-volume-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }}>
                          <span style={{ color: item.color }}>{item.icon}</span>
                          <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>{item.label}</span>
                        </div>
                        <div className="shadow-bar-track">
                          <div
                            className="shadow-bar-fill"
                            style={{
                              width: `${s.shadowCoachData.total_actions > 0 ? (item.count / s.shadowCoachData.total_actions * 100) : 0}%`,
                              backgroundColor: item.color
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 'calc(12px + var(--font-size-offset, 0px))', fontWeight: 700, color: 'var(--text-primary)', minWidth: 24, textAlign: 'right' }}>
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Most Traded Tickers */}
                {s.shadowCoachData.most_traded && s.shadowCoachData.most_traded.length > 0 && (
                  <div className="glass-card shadow-metric-card">
                    <span className="metric-label" style={{ fontSize: 'calc(10px + var(--font-size-offset, 0px))' }}>Most Traded Tickers</span>
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {s.shadowCoachData.most_traded.map((t, i) => (
                        <div key={t.ticker} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            fontSize: 'calc(10px + var(--font-size-offset, 0px))',
                            fontWeight: 800,
                            color: i === 0 ? '#fbbf24' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--text-muted)',
                            minWidth: 18
                          }}>
                            #{i + 1}
                          </span>
                          <span style={{ fontSize: 'calc(13px + var(--font-size-offset, 0px))', fontWeight: 700, color: 'var(--text-primary)', minWidth: 60 }}>{t.ticker}</span>
                          <div className="shadow-bar-track" style={{ flex: 1 }}>
                            <div
                              className="shadow-bar-fill"
                              style={{
                                width: `${(t.count / s.shadowCoachData.most_traded[0].count * 100)}%`,
                                background: 'linear-gradient(90deg, var(--color-oracle), #6366f1)'
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>{t.count} actions</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: Coaching Insights + Action Timeline */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Coaching Insights */}
                <div className="glass-card shadow-insights-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Sparkles style={{ width: 16, height: 16, color: '#fbbf24' }} />
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'calc(1.1rem + var(--font-size-offset, 0px))', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Your Coaching Insights
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {s.shadowCoachData.insights && s.shadowCoachData.insights.map((insight, idx) => (
                      <div
                        key={idx}
                        className={`shadow-insight-tile shadow-insight-${insight.type}`}
                      >
                        <span style={{ fontSize: 'calc(16px + var(--font-size-offset, 0px))' }}>{insight.icon}</span>
                        <p style={{ fontSize: 'calc(12px + var(--font-size-offset, 0px))', lineHeight: 1.55, color: 'var(--text-primary)', margin: 0 }}>
                          {insight.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action History Timeline */}
                <div className="glass-card shadow-timeline-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <History style={{ width: 16, height: 16, color: 'var(--color-oracle)' }} />
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'calc(1.1rem + var(--font-size-offset, 0px))', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Action History
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 'calc(10px + var(--font-size-offset, 0px))', color: 'var(--text-muted)' }}>
                      {s.actionHistory.length} actions
                    </span>
                  </div>
                  <div className="shadow-timeline-scroll">
                    {s.actionHistory.length > 0 ? s.actionHistory.map((action, idx) => {
                      const actionColor = action.action_type === "buy" ? "#10b981"
                        : action.action_type === "sell" ? "#f43f5e"
                        : "#8b5cf6";
                      const actionIcon = action.action_type === "buy" ? <ArrowUpRight style={{ width: 14, height: 14 }} />
                        : action.action_type === "sell" ? <ArrowDownRight style={{ width: 14, height: 14 }} />
                        : <Repeat style={{ width: 14, height: 14 }} />;
                      const timeAgo = (() => {
                        const days = Math.floor((Date.now() - new Date(action.timestamp).getTime()) / 86400000);
                        if (days === 0) return "Today";
                        if (days === 1) return "Yesterday";
                        if (days < 7) return `${days}d ago`;
                        if (days < 30) return `${Math.floor(days / 7)}w ago`;
                        return `${Math.floor(days / 30)}mo ago`;
                      })();

                      return (
                        <div key={action.id || idx} className="shadow-timeline-item">
                          <div className="shadow-timeline-dot" style={{ backgroundColor: actionColor, boxShadow: `0 0 8px ${actionColor}` }} />
                          {idx < s.actionHistory.length - 1 && <div className="shadow-timeline-line" />}
                          <div className="shadow-timeline-content">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: actionColor }}>{actionIcon}</span>
                              <span style={{
                                fontSize: 'calc(11px + var(--font-size-offset, 0px))',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                color: actionColor,
                                letterSpacing: '0.5px'
                              }}>
                                {action.action_type}
                              </span>
                              <span style={{ fontSize: 'calc(13px + var(--font-size-offset, 0px))', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {action.ticker}
                              </span>
                              <span style={{ marginLeft: 'auto', fontSize: 'calc(10px + var(--font-size-offset, 0px))', color: 'var(--text-muted)' }}>
                                {timeAgo}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                              <span style={{ fontSize: 'calc(11px + var(--font-size-offset, 0px))', color: 'var(--text-secondary)' }}>
                                {action.shares} shares @ ${parseFloat(action.price).toFixed(2)}
                              </span>
                              {action.metadata && action.metadata.pnl_pct !== undefined && (
                                <span style={{
                                  fontSize: 'calc(11px + var(--font-size-offset, 0px))',
                                  fontWeight: 700,
                                  color: action.metadata.pnl_pct >= 0 ? '#10b981' : '#f43f5e'
                                }}>
                                  {action.metadata.pnl_pct >= 0 ? '+' : ''}{action.metadata.pnl_pct}%
                                </span>
                              )}
                            </div>
                            {action.metadata && action.metadata.reason && (
                              <p style={{ fontSize: 'calc(10px + var(--font-size-offset, 0px))', color: 'var(--text-muted)', margin: '4px 0 0', fontStyle: 'italic' }}>
                                "{action.metadata.reason}"
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }) : (
                      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'calc(11px + var(--font-size-offset, 0px))' }}>
                        <Eye style={{ width: 24, height: 24, opacity: 0.3, margin: '0 auto 8px' }} />
                        <p>No actions recorded yet. Start trading to see your behavioral patterns emerge.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
              <Eye style={{ width: 40, height: 40, color: 'var(--text-muted)', margin: '0 auto 16px', opacity: 0.4 }} />
              <p style={{ fontSize: 'calc(12px + var(--font-size-offset, 0px))', color: 'var(--text-muted)' }}>
                Shadow Coach is waiting. Once you start making trades, it will analyze your patterns and provide personalized coaching insights.
              </p>
            </div>
          )}
        </div>
  );
}
