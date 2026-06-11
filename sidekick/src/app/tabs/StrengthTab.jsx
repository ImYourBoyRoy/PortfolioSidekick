// ./sidekick/src/app/tabs/StrengthTab.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { TrendingUp, TrendingDown, ShieldAlert, Plus, X, CheckCircle, Sparkles, AlertOctagon, AlertTriangle, Award, ArrowUpRight, ArrowDownRight, Repeat, Calendar } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';
import { classifyHoldingZone, formatAdvisorScore, hasAdvisorScore } from '../utils/holdingDisplay';
import { formatCatalystCountdown } from '../../serverless/catalystWatch';

export default function StrengthTab() {
  const s = useSidekick();

  return (
        <div className="strength-analyzer-container animate-fade-in">
          {/* Section 1: Owned Asset Structural Classification Deck */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: '950', color: '#fff', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Award className="w-5 h-5 text-violet-400" />
              Owned Asset Classification Deck
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
              Technical conviction zones (Keep / Monitor / Abort). Catalyst watches can soften Abort into <strong style={{ color: '#fbbf24' }}>Catalyst Hold</strong> when you are prepping for a forward event.
            </p>
            {s.marketStrengthData?.data_synthetic && (
              <p style={{ fontSize: '10px', color: '#fbbf24', margin: '0 0 20px 0', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(251, 191, 36, 0.35)', background: 'rgba(251, 191, 36, 0.08)' }}>
                Market strength leaderboard below is simulated for exploration — not live exchange data.
              </p>
            )}

            {s.holdings.length === 0 ? (
              <div className="tab-empty-placeholder-card" style={{ padding: '32px 16px', textAlign: 'center' }}>
                <ShieldAlert style={{ width: 36, height: 36, color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
                <h4 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>No Holdings Found to Analyze</h4>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 16px' }}>
                  Seed popular mock assets to explore the classification deck immediately, or connect your Robinhood account.
                </p>
                <button
                  onClick={s.handleSeedMockAssets}
                  className="btn-base btn-primary font-size-btn"
                  style={{ margin: '0 auto' }}
                >
                  <Sparkles style={{ width: 12, height: 12 }} />
                  Seed Sandbox Assets
                </button>
              </div>
            ) : (
              <div className="strength-classifier-grid">
                {/* 🟢 Keep Zone */}
                {(() => {
                  const keeps = s.holdings.filter(h => hasAdvisorScore(h) && h.advisor_score >= 65);
                  return (
                    <div className="zone-card keep-card-outline">
                      <div className="zone-header">
                        <div className="zone-title keep-title">
                          <CheckCircle style={{ width: 16, height: 16 }} />
                          Keep Zone
                        </div>
                        <span className="zone-badge">{keeps.length} {keeps.length === 1 ? 'Asset' : 'Assets'}</span>
                      </div>
                      <div className="zone-asset-list">
                        {keeps.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', margin: 'auto 0' }}>
                            No holdings in Keep Zone.
                          </div>
                        ) : (
                          keeps.map(h => (
                            <div key={h.id} className="zone-asset-row">
                              <div className="zone-asset-meta">
                                <div className="asset-symbol-block">
                                  <span className="asset-symbol-text">{h.ticker}</span>
                                  <span className="asset-shares-text">{h.shares} Shares @ ${h.avg_buy_price.toFixed(2)}</span>
                                </div>
                                <div className="asset-score-badge keep-score">
                                  {formatAdvisorScore(h)}
                                </div>
                              </div>
                              <div className="zone-asset-actions">
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  Val: ${(h.shares * h.current_price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </span>
                                <button
                                  onClick={() => {
                                    s.setSelectedTicker(h.ticker);
                                    s.setActiveTab("coach");
                                    s.showToast("info", `Analyzing ${h.ticker} charts...`);
                                  }}
                                  className="zone-action-btn zone-bracket-btn"
                                >
                                  <TrendingUp style={{ width: 10, height: 10 }} />
                                  Chart
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 🟡 Monitor Zone */}
                {(() => {
                  const monitors = s.holdings.filter(h => hasAdvisorScore(h) && h.advisor_score >= 35 && h.advisor_score < 65);
                  return (
                    <div className="zone-card monitor-card-outline">
                      <div className="zone-header">
                        <div className="zone-title monitor-title">
                          <AlertTriangle style={{ width: 16, height: 16 }} />
                          Monitor Zone
                        </div>
                        <span className="zone-badge">{monitors.length} {monitors.length === 1 ? 'Asset' : 'Assets'}</span>
                      </div>
                      <div className="zone-asset-list">
                        {monitors.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', margin: 'auto 0' }}>
                            No holdings in Monitor Zone.
                          </div>
                        ) : (
                          monitors.map(h => (
                            <div key={h.id} className="zone-asset-row">
                              <div className="zone-asset-meta">
                                <div className="asset-symbol-block">
                                  <span className="asset-symbol-text">{h.ticker}</span>
                                  <span className="asset-shares-text">{h.shares} Shares @ ${h.avg_buy_price.toFixed(2)}</span>
                                </div>
                                <div className="asset-score-badge monitor-score">
                                  {formatAdvisorScore(h)}
                                </div>
                              </div>
                              <div className="zone-asset-actions">
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  Val: ${(h.shares * h.current_price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </span>
                                <button
                                  onClick={() => {
                                    s.setSelectedTicker(h.ticker);
                                    s.setActiveTab("strategy");
                                    s.showToast("info", `Initiating Shift Planner for ${h.ticker}...`);
                                  }}
                                  className="zone-action-btn zone-shift-btn"
                                >
                                  <Repeat style={{ width: 10, height: 10 }} />
                                  Shift
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 🟡 Catalyst Hold Zone */}
                {(() => {
                  const catalystHolds = s.holdings.filter((h) => {
                    if (!hasAdvisorScore(h)) return false;
                    const { effective } = classifyHoldingZone(h, s.catalystWatches);
                    return effective === 'catalyst_hold';
                  });
                  if (catalystHolds.length === 0) return null;
                  return (
                    <div className="zone-card" style={{ border: '1px solid rgba(251, 191, 36, 0.35)', background: 'rgba(251, 191, 36, 0.04)' }}>
                      <div className="zone-header">
                        <div className="zone-title" style={{ color: '#fbbf24' }}>
                          <Sparkles style={{ width: 16, height: 16 }} />
                          Catalyst Hold
                        </div>
                        <span className="zone-badge">{catalystHolds.length}</span>
                      </div>
                      <div className="zone-asset-list">
                        {catalystHolds.map((h) => {
                          const { catalyst } = classifyHoldingZone(h, s.catalystWatches);
                          return (
                            <div key={h.id} className="zone-asset-row">
                              <div className="zone-asset-meta">
                                <div className="asset-symbol-block">
                                  <span className="asset-symbol-text">{h.ticker}</span>
                                  <span className="asset-shares-text" style={{ color: '#fcd34d' }}>
                                    {catalyst?.title} · {formatCatalystCountdown(catalyst)}
                                  </span>
                                </div>
                                <div className="asset-score-badge" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                                  <span style={{ fontSize: '8px', display: 'block' }}>Tech</span>
                                  {formatAdvisorScore(h)}
                                </div>
                              </div>
                              <div className="zone-asset-actions">
                                <button
                                  type="button"
                                  onClick={() => s.openCatalystModal(h.ticker, catalyst)}
                                  className="zone-action-btn zone-shift-btn"
                                  style={{ color: '#fbbf24' }}
                                >
                                  Edit watch
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { s.setSelectedTicker(h.ticker); s.setActiveTab('strategy'); }}
                                  className="zone-action-btn zone-shift-btn"
                                >
                                  Forward prep
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 🔴 Abort Zone */}
                {(() => {
                  const aborts = s.holdings.filter((h) => {
                    if (!hasAdvisorScore(h) || h.advisor_score >= 35) return false;
                    const { effective } = classifyHoldingZone(h, s.catalystWatches);
                    return effective === 'abort';
                  });
                  return (
                    <div className="zone-card abort-card-outline">
                      <div className="zone-header">
                        <div className="zone-title abort-title">
                          <AlertOctagon style={{ width: 16, height: 16 }} />
                          Abort Zone
                        </div>
                        <span className="zone-badge">{aborts.length} {aborts.length === 1 ? 'Asset' : 'Assets'}</span>
                      </div>
                      <div className="zone-asset-list">
                        {aborts.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', margin: 'auto 0' }}>
                            Zero pure Abort flags. Catalyst holds may still show above.
                          </div>
                        ) : (
                          aborts.map(h => (
                            <div key={h.id} className="zone-asset-row">
                              <div className="zone-asset-meta">
                                <div className="asset-symbol-block">
                                  <span className="asset-symbol-text">{h.ticker}</span>
                                  <span className="asset-shares-text">{h.shares} Shares @ ${h.avg_buy_price.toFixed(2)}</span>
                                </div>
                                <div className="asset-score-badge abort-score" title="Advisor conviction score (0–100). Below 35 suggests reducing exposure.">
                                  <span style={{ fontSize: '8px', display: 'block', opacity: 0.85 }}>Conviction</span>
                                  {formatAdvisorScore(h)}
                                </div>
                              </div>
                              <div className="zone-asset-actions">
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  Val: ${(h.shares * h.current_price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                </span>
                                <div className="ranker-action-triggers">
                                  <button
                                    type="button"
                                    onClick={() => s.openCatalystModal(h.ticker)}
                                    className="zone-action-btn zone-shift-btn"
                                    style={{ color: '#fbbf24' }}
                                  >
                                    <Sparkles style={{ width: 10, height: 10 }} />
                                    Catalyst
                                  </button>
                                  <button
                                    onClick={() => {
                                      s.setSelectedTicker(h.ticker);
                                      s.setActiveTab("strategy");
                                    }}
                                    className="zone-action-btn zone-shift-btn"
                                    style={{ color: '#fb7185' }}
                                  >
                                    <Repeat style={{ width: 10, height: 10 }} />
                                    Shift
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {s.activeCatalystWatches?.length > 0 && (
              <div className="glass-card" style={{ marginTop: 16, padding: 16, border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: 900, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar style={{ width: 14, height: 14 }} />
                  Active Catalyst Watches
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {s.activeCatalystWatches.map((c) => (
                    <div key={c.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ color: '#fff', fontSize: '12px' }}>{c.ticker}</strong>
                        <span style={{ fontSize: '10px', color: '#fcd34d' }}>{formatCatalystCountdown(c)}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 4 }}>{c.title}</div>
                      {(c.associated_tickers || []).length > 0 && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {c.associated_tickers.map((t) => (
                            <span key={t} style={{ fontSize: '9px', padding: '2px 6px', borderRadius: 6, background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', fontWeight: 800 }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {s.holdings.length > 0 && s.wisestReallocationPicks?.length > 0 && (
              <div className="glass-card" style={{ marginTop: 16, padding: 16, border: '1px solid rgba(52,211,153,0.2)', background: 'rgba(16,185,129,0.04)' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '12px', fontWeight: 900, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ArrowUpRight style={{ width: 14, height: 14 }} />
                  Top 5 Shift Targets (Day + Week + Month)
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Highest composite conviction outside your current holdings — use when exiting Abort-zone names like ARKK.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {s.wisestReallocationPicks.map((pick, idx) => (
                    <div key={pick.ticker} className="zone-asset-row" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '10px 12px' }}>
                      <div className="zone-asset-meta">
                        <div className="asset-symbol-block">
                          <span className="asset-symbol-text">#{idx + 1} {pick.ticker}</span>
                          <span className="asset-shares-text">{pick.name}</span>
                        </div>
                        <div className="asset-score-badge" style={{ background: 'rgba(16,185,129,0.12)', color: '#6ee7b7' }}>
                          <span style={{ fontSize: '8px', display: 'block' }}>Composite</span>
                          {pick.composite_score}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: '9px', color: 'var(--text-muted)', marginTop: 6, flexWrap: 'wrap' }}>
                        <span>Day: {pick.day_pct > 0 ? '+' : ''}{pick.day_pct}%</span>
                        <span>Week: {pick.week_pct > 0 ? '+' : ''}{pick.week_pct}%</span>
                        <span>Month: {pick.month_pct > 0 ? '+' : ''}{pick.month_pct}%</span>
                        <button
                          type="button"
                          onClick={() => {
                            s.setSelectedTicker(pick.ticker);
                            s.setActiveTab('strategy');
                            s.showToast('info', `Review shift plan for ${pick.ticker}`);
                          }}
                          className="zone-action-btn zone-shift-btn"
                          style={{ marginLeft: 'auto' }}
                        >
                          <Repeat style={{ width: 10, height: 10 }} />
                          Plan Shift
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Market Strength Leaderboards */}
          <div className="market-leaderboards-card">
            <div className="leaderboards-header-row">
              <div className="leaderboards-title-block">
                <h4 className="leaderboards-title">Curated Market Strength Leaderboards</h4>
                <p className="leaderboards-desc">
                  Scans a stable universe of 35 institutional assets to identify the top 15 gainers and worst 15 decliners.
                </p>
              </div>

              <div className="leaderboards-filters">
                <div className="timeframe-pills">
                  {["day", "week", "month", "year", "5years"].map(tf => (
                    <button
                      key={tf}
                      onClick={() => s.setStrengthTimeframe(tf)}
                      className={`timeframe-pill ${s.strengthTimeframe === tf ? 'timeframe-pill-active' : ''}`}
                    >
                      {tf === "5years" ? "5 Years" : tf.toUpperCase()}
                    </button>
                  ))}
                </div>

                <select
                  value={s.strengthSector}
                  onChange={(e) => s.setStrengthSector(e.target.value)}
                  className="sector-dropdown"
                >
                  <option value="all">All Sectors</option>
                  <option value="technology">Technology Sector</option>
                  <option value="quantum">Quantum Sector</option>
                  <option value="energy">Nuclear Energy</option>
                  <option value="etf">ETFs & Diversified</option>
                </select>
              </div>
            </div>

            {s.strengthLoading ? (
              <div className="ranker-columns-deck">
                {/* Skeletal Gainers Column */}
                <div className="ranker-column">
                  <div className="column-label gainer-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp style={{ width: 14, height: 14 }} />
                    Scanning Market Gainers...
                  </div>
                  <div className="ranker-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}>
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <div key={idx} className="ranker-item" style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
                        <div className="skeleton-shimmer" style={{ width: '28px', height: '14px', borderRadius: '4px' }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div className="skeleton-shimmer" style={{ height: '12px', width: '80%', borderRadius: '4px' }} />
                          <div className="skeleton-shimmer" style={{ height: '8px', width: '40%', borderRadius: '4px' }} />
                        </div>
                        <div className="skeleton-shimmer" style={{ width: '60px', height: '16px', borderRadius: '8px' }} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Skeletal Decliners Column */}
                <div className="ranker-column">
                  <div className="column-label decliner-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingDown style={{ width: 14, height: 14 }} />
                    Scanning Market Decliners...
                  </div>
                  <div className="ranker-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}>
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <div key={idx} className="ranker-item" style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
                        <div className="skeleton-shimmer" style={{ width: '28px', height: '14px', borderRadius: '4px' }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div className="skeleton-shimmer" style={{ height: '12px', width: '70%', borderRadius: '4px' }} />
                          <div className="skeleton-shimmer" style={{ height: '8px', width: '50%', borderRadius: '4px' }} />
                        </div>
                        <div className="skeleton-shimmer" style={{ width: '60px', height: '16px', borderRadius: '8px' }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : s.marketStrengthData ? (
              <div className="ranker-columns-deck">
                {/* Column 1: Top 15 Gainers */}
                <div className="ranker-column">
                  <div className="column-label gainer-label">
                    <TrendingUp style={{ width: 14, height: 14 }} />
                    Top 15 Gainers ({s.marketStrengthData.top_gainers.length})
                  </div>
                  <div className="ranker-list">
                    {s.marketStrengthData.top_gainers.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                        No gainers fit filters.
                      </div>
                    ) : (
                      s.marketStrengthData.top_gainers.map((item, idx) => (
                        <div key={item.ticker} className="ranker-item gainer-item animate-fade-in">
                          <div className="ranker-asset-info">
                            <span className="ranker-position-idx">#{idx + 1}</span>
                            <div className="ranker-ticker-details">
                              <span className="ranker-ticker-symbol">{item.ticker}</span>
                              <span className="ranker-ticker-name" title={item.name}>{item.name}</span>
                            </div>
                          </div>
                          <div className="ranker-price-returns">
                            <div className="ranker-price-col">
                              <span className="ranker-price-value">${item.price.toFixed(2)}</span>
                              <span className="ranker-price-change ranker-gainer-pct">
                                <ArrowUpRight style={{ width: 10, height: 10 }} />
                                +{item.change_pct.toFixed(2)}%
                              </span>
                            </div>
                            <div className="ranker-action-triggers">
                              <button
                                onClick={() => {
                                  if (s.sandboxWatchlist.some(w => w.ticker === item.ticker)) {
                                    s.showToast("warning", `${item.ticker} is already in your Acquisition Sandbox!`);
                                    return;
                                  }
                                  const newTarget = {
                                    ticker: item.ticker,
                                    name: item.name,
                                    price: item.price,
                                    targetPrice: item.price
                                  };
                                  s.setSandboxWatchlist(prev => [...prev, newTarget]);
                                  s.showToast("success", `Added ${item.ticker} to Acquisition Sandbox!`);
                                }}
                                className="ranker-trigger-btn"
                                title="Add to Sandbox Watchlist"
                              >
                                <Plus style={{ width: 12, height: 12 }} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Column 2: Worst 15 Decliners */}
                <div className="ranker-column">
                  <div className="column-label decliner-label">
                    <TrendingDown style={{ width: 14, height: 14 }} />
                    Worst 15 Decliners ({s.marketStrengthData.worst_decliners.length})
                  </div>
                  <div className="ranker-list">
                    {s.marketStrengthData.worst_decliners.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                        No decliners fit filters.
                      </div>
                    ) : (
                      s.marketStrengthData.worst_decliners.map((item, idx) => (
                        <div key={item.ticker} className="ranker-item decliner-item animate-fade-in">
                          <div className="ranker-asset-info">
                            <span className="ranker-position-idx">#{idx + 1}</span>
                            <div className="ranker-ticker-details">
                              <span className="ranker-ticker-symbol">{item.ticker}</span>
                              <span className="ranker-ticker-name" title={item.name}>{item.name}</span>
                            </div>
                          </div>
                          <div className="ranker-price-returns">
                            <div className="ranker-price-col">
                              <span className="ranker-price-value">${item.price.toFixed(2)}</span>
                              <span className="ranker-price-change ranker-decliner-pct">
                                <ArrowDownRight style={{ width: 10, height: 10 }} />
                                {item.change_pct.toFixed(2)}%
                              </span>
                            </div>
                            <div className="ranker-action-triggers">
                              <button
                                onClick={() => {
                                  if (s.sandboxWatchlist.some(w => w.ticker === item.ticker)) {
                                    s.showToast("warning", `${item.ticker} is already in your Acquisition Sandbox!`);
                                    return;
                                  }
                                  const newTarget = {
                                    ticker: item.ticker,
                                    name: item.name,
                                    price: item.price,
                                    targetPrice: item.price
                                  };
                                  s.setSandboxWatchlist(prev => [...prev, newTarget]);
                                  s.showToast("success", `Added ${item.ticker} to Acquisition Sandbox!`);
                                }}
                                className="ranker-trigger-btn"
                                title="Add to Sandbox Watchlist"
                              >
                                <Plus style={{ width: 12, height: 12 }} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Section 3: Simulated Target Portfolio (Acquisition Sandbox) */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: '950', color: '#fff', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sparkles className="w-5 h-5 text-violet-400" />
              Acquisition Sandbox & Shift Simulator
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 20px 0' }}>
              Compile a virtual watch list of stocks you want to enter, set target buy prices, and simulate shifting capital from weak owned holdings to strong sandbox allocations.
            </p>

            <div className="sandbox-deck-grid">
              <div className="sandbox-main-panel">
                <div className="sandbox-input-deck">
                  <input
                    type="text"
                    value={s.newSandboxTicker}
                    onChange={(e) => s.setNewSandboxTicker(e.target.value.toUpperCase())}
                    placeholder="ENTER TICKER (e.g. QBTS)"
                    className="sandbox-input-field"
                  />
                  <input
                    type="number"
                    value={s.newSandboxTargetPrice}
                    onChange={(e) => s.setNewSandboxTargetPrice(e.target.value)}
                    placeholder="TARGET BUY PRICE ($)"
                    className="sandbox-input-field"
                  />
                  <button
                    onClick={async () => {
                      if (!s.newSandboxTicker.trim()) {
                        s.showToast("error", "Please specify a ticker.");
                        return;
                      }
                      if (s.sandboxWatchlist.some(w => w.ticker === s.newSandboxTicker)) {
                        s.showToast("warning", `${s.newSandboxTicker} is already in your Acquisition Sandbox.`);
                        return;
                      }
                      try {
                        let price = 100.0;
                        try {
                          const res = await s.sidekickFetch(`/stocks/history?ticker=${s.newSandboxTicker}&span=day`);
                          if (res.ok) {
                            const quotes = await res.json();
                            if (quotes.length > 0) price = quotes[quotes.length - 1].close_price;
                          }
                        } catch {
                          const pubQ = await s.fetchPublicQuote(s.newSandboxTicker);
                          if (pubQ) price = pubQ;
                        }
                        const newTarget = {
                          ticker: s.newSandboxTicker,
                          name: `${s.newSandboxTicker} Corporation`,
                          price: price,
                          targetPrice: s.newSandboxTargetPrice ? parseFloat(s.newSandboxTargetPrice) : price
                        };
                        s.setSandboxWatchlist(prev => [...prev, newTarget]);
                        s.setNewSandboxTicker("");
                        s.setNewSandboxTargetPrice("");
                        s.showToast("success", `Added ${newTarget.ticker} to Acquisition Sandbox!`);
                      } catch (err) {
                        s.showToast("error", `Failed to resolve ticker details: ${err.message}`);
                      }
                    }}
                    className="btn-base btn-primary sandbox-add-btn"
                  >
                    <Plus style={{ width: 14, height: 14 }} />
                    Add Candidate
                  </button>
                </div>

                <div className="sandbox-watchlist-table">
                  <div className="sandbox-table-header">
                    <span>Ticker</span>
                    <span>Live Price</span>
                    <span>Target Price</span>
                    <span>Status vs Target</span>
                    <span>Remove</span>
                  </div>
                  <div className="sandbox-table-body">
                    {s.sandboxWatchlist.length === 0 ? (
                      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11.5px', gridColumn: 'span 5' }}>
                        No candidates added yet. Click the "+" button on the market lists or enter a ticker above to populate your acquisition targets!
                      </div>
                    ) : (
                      s.sandboxWatchlist.map(item => {
                        const distPct = item.price > 0 ? ((item.price - item.targetPrice) / item.targetPrice) * 100 : 0;
                        const reached = item.price <= item.targetPrice;
                        return (
                          <div key={item.ticker} className="sandbox-table-row">
                            <span className="sandbox-target-ticker">{item.ticker}</span>
                            <span className="sandbox-target-price">${item.price.toFixed(2)}</span>
                            <span>
                              <input
                                type="number"
                                value={item.targetPrice}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  s.setSandboxWatchlist(prev => prev.map(w => w.ticker === item.ticker ? { ...w, targetPrice: val } : w));
                                }}
                                className="sandbox-price-input"
                              />
                            </span>
                            <span style={{ fontWeight: '700', color: reached ? '#34d399' : '#fbbf24' }}>
                              {reached ? "🎯 Target Triggered" : `${distPct.toFixed(1)}% above target`}
                            </span>
                            <span>
                              <button
                                onClick={() => {
                                  s.setSandboxWatchlist(prev => prev.filter(w => w.ticker !== item.ticker));
                                  s.showToast("info", `Removed ${item.ticker} from sandbox.`);
                                }}
                                className="sandbox-delete-btn"
                              >
                                <X style={{ width: 12, height: 12 }} />
                              </button>
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="sandbox-simulation-sidebar">
                {(() => {
                  const weakAssetsCount = s.holdings.filter(h => hasAdvisorScore(h) && h.advisor_score < 55).length;
                  const targetsReady = s.sandboxWatchlist.filter(w => w.price <= w.targetPrice).length;
                  
                  let score = 50;
                  let verdict = "NEUTRAL SHIFT";
                  let badgeClass = "viability-badge-med";
                  let scoreClass = "viability-score-med";
                  let textDesc = "Strategic balance. Monitor technical entry flags on your target candidates before transferring capital from your active holdings.";

                  if (s.sandboxWatchlist.length > 0) {
                    if (weakAssetsCount > 0 && targetsReady > 0) {
                      score = 88;
                      verdict = "STRONG STRATEGIC SHIFT";
                      badgeClass = "viability-badge-high";
                      scoreClass = "viability-score-high";
                      textDesc = "Highly viable! You have vulnerable assets in downtrends, and target candidates that have hit their entry support bounds. Shifting capital is strongly recommended.";
                    } else if (weakAssetsCount > 0) {
                      score = 68;
                      verdict = "ACCUMULATE ENTRIES";
                      badgeClass = "viability-badge-med";
                      scoreClass = "viability-score-med";
                      textDesc = "Strategic potential exists. You have weak holdings to purge, but sandbox candidates are still trading slightly above target entry prices. Scale in slowly.";
                    } else if (targetsReady > 0) {
                      score = 42;
                      verdict = "STABLE HOLDINGS";
                      badgeClass = "viability-badge-low";
                      scoreClass = "viability-score-low";
                      textDesc = "Caution: Your active holdings are structurally sound and in keep zones. Avoid exiting strong uptrends to buy highly volatile speculative targets.";
                    }
                  }

                  return (
                    <div className="sandbox-card" style={{ background: 'rgba(139, 92, 246, 0.03)', borderColor: 'var(--border-glow)' }}>
                      <div className="sandbox-card-title" style={{ color: 'var(--color-oracle)' }}>Shift Viability Index</div>
                      <div className="viability-index-dial">
                        <span className={`viability-index-score ${scoreClass}`}>{score}%</span>
                        <span className={`viability-index-verdict ${badgeClass}`}>{verdict}</span>
                      </div>
                      <p style={{ fontSize: '10.5px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: '1.5', margin: '4px 0 0 0' }}>
                        {textDesc}
                      </p>
                    </div>
                  );
                })()}

                <div className="sandbox-card">
                  <div className="sandbox-card-title">Yield Simulator Preview</div>
                  
                  {(() => {
                    const weakHoldings = s.holdings.filter(h => hasAdvisorScore(h) && h.advisor_score < 50);
                    const totalCapitalToShift = weakHoldings.reduce((sum, h) => sum + h.total_value, 0);
                    const projectedYield = totalCapitalToShift * 0.185;

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="sandbox-metric-row">
                          <span className="sandbox-metric-label">Vulnerable Capital (Abort/Monitor):</span>
                          <span className="sandbox-metric-value" style={{ color: '#fb7185' }}>
                            ${totalCapitalToShift.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                        <div className="sandbox-metric-row">
                          <span className="sandbox-metric-label">Candidates in Entry Bounds:</span>
                          <span className="sandbox-metric-value sandbox-metric-positive">
                            {s.sandboxWatchlist.filter(w => w.price <= w.targetPrice).length} / {s.sandboxWatchlist.length}
                          </span>
                        </div>
                        <div className="sandbox-metric-row" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: 10 }}>
                          <span className="sandbox-metric-label" style={{ fontWeight: '800' }}>Projected Shift Yield (Quarterly):</span>
                          <span className="sandbox-metric-value sandbox-metric-positive" style={{ fontSize: '13px' }}>
                            +${projectedYield.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                        
                        <button
                          onClick={() => {
                            if (totalCapitalToShift === 0) {
                              s.showToast("warning", "No weak holdings found to shift from.");
                              return;
                            }
                            s.setActiveTab("strategy");
                            s.showToast("success", "Loaded vulnerable holdings into Shift Planner!");
                          }}
                          className="btn-base btn-primary font-size-btn"
                          style={{ width: '100%', marginTop: 8 }}
                        >
                          <Repeat style={{ width: 12, height: 12 }} />
                          Trigger Strategy Rebalance
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
  );
}
