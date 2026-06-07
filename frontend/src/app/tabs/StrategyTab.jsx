// ./frontend/src/app/tabs/StrategyTab.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { TrendingUp, ShieldAlert, RefreshCw, CheckCircle, Info, Sliders, Sparkles, Activity, Target } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';
import { hasAdvisorScore } from '../utils/holdingDisplay';

export default function StrategyTab() {
  const s = useSidekick();

  return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {/* Market Regime Status Bar */}
          {(() => {
            const regime = s.strategyBrackets?.regime_status || "BULLISH";
            const vix = s.strategyBrackets?.vix_value || 15.0;
            const spyAbove = s.strategyBrackets?.spy_above_200 !== false;
            const qqqAbove = s.strategyBrackets?.qqq_above_200 !== false;
            
            const isBearish = regime === "BEARISH";
            
            return (
              <div 
                className="glass-card animate-fade-in" 
                style={{ 
                  padding: '16px 24px', 
                  border: isBearish ? '1px solid rgba(244, 63, 94, 0.25)' : '1px solid rgba(16, 185, 129, 0.25)', 
                  boxShadow: isBearish ? '0 0 15px rgba(244, 63, 94, 0.05)' : '0 0 15px rgba(16, 185, 129, 0.05)',
                  backgroundColor: isBearish ? 'rgba(244, 63, 94, 0.02)' : 'rgba(16, 185, 129, 0.02)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 16
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: isBearish ? 'rgba(244,63,94,0.1)' : 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Activity className={isBearish ? 'text-red-400' : 'text-green-400'} style={{ width: 16, height: 16, color: isBearish ? '#fb7185' : '#34d399' }} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '950', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isBearish ? '🚨 BEARISH / HIGH-VOLATILITY REGIME ACTIVE' : '🟢 BULLISH / STABLE REGIME ACTIVE'}
                      <span 
                        style={{ 
                          fontSize: '8px', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          backgroundColor: isBearish ? 'rgba(244,63,94,0.2)' : 'rgba(16,185,129,0.2)', 
                          color: isBearish ? '#fb7185' : '#34d399', 
                          fontWeight: '800' 
                        }}
                      >
                        {isBearish ? 'VIX GUARD ENGAGED' : 'NORMAL MARKET CONDITIONS'}
                      </span>
                    </h4>
                    <p style={{ margin: '4px 0 0', fontSize: '9.5px', color: 'var(--text-secondary)' }}>
                      {isBearish 
                        ? 'Algorithmic weights dynamically shifted to mean-reversion. Buy scoring hurdle raised to 78%, and stop-loss boundaries clamped.' 
                        : 'Standard scoring weights active. Moving averages and momentum signals prioritized for maximum profit expansion.'}
                    </p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '10px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '8px', textTransform: 'uppercase' }}>CBOE VIX Price</span>
                    <strong style={{ color: isBearish ? '#fb7185' : '#34d399', fontSize: '13px' }}>{vix.toFixed(2)}</strong>
                  </div>
                  <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border-light)' }}></div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '8px', textTransform: 'uppercase' }}>SPY / QQQ SMAs</span>
                    <strong style={{ color: '#fff', fontSize: '11px' }}>
                      {spyAbove ? 'SPY Above' : 'SPY Below'} 200d | {qqqAbove ? 'QQQ Above' : 'QQQ Below'} 200d
                    </strong>
                  </div>
                </div>
              </div>
            );
          })()}
          {/* Header Description */}
          {s.holdings.length === 0 ? (
            <div className="tab-empty-placeholder-card animate-fade-in" style={{ marginTop: 0 }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sliders className="animate-pulse" style={{ width: 28, height: 28, color: 'var(--color-oracle)' }} />
              </div>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '950', color: '#fff', letterSpacing: '-0.01em' }}>
                  No Holdings In This Profile
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '480px', lineHeight: '1.6' }}>
                  To unlock the **Tactical Rebalancing Simulator**, Scale-Out profit take brackets, and Scale-In Dollar-Cost-Averaging trackers, you must have active holdings in your portfolio.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', borderTop: '1px solid var(--border-light)', paddingTop: 20, width: '100%' }}>
                <button
                  onClick={() => s.setIsLoginOpen(true)}
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
          ) : (
            <>
              {/* 1. Overall Portfolio Health Score Deck */}
          {(() => {
            const scoredHoldings = s.holdings.filter(hasAdvisorScore);
            const totalVal = scoredHoldings.reduce((sum, h) => sum + h.total_value, 0);
            const weightedScore = totalVal > 0
              ? scoredHoldings.reduce((sum, h) => sum + h.advisor_score * h.total_value, 0) / totalVal
              : null;

            let healthClass = "text-highlight-green animate-pulse";
            let healthLabel = "Excellent Structural Health";
            let healthDesc = "Your allocated capital is securely anchored in technical support zones and high-conviction buy horizons. Risk exposure is minimal!";
            if (weightedScore == null) {
              healthClass = "text-highlight-purple";
              healthLabel = "Advisor Analysis Pending";
              healthDesc = "Live quotes and price history are required before portfolio health can be scored. Sync your account or refresh prices.";
            } else if (weightedScore < 45) {
              healthClass = "metric-pnl-neg";
              healthLabel = "Vulnerable Downside Risk";
              healthDesc = "Your portfolio has significant capital allocated to assets in technical downtrends or overbought sell zones. Consider shifting funds immediately to avoid capital erosion.";
            } else if (weightedScore < 65) {
              healthClass = "text-highlight-purple";
              healthLabel = "Balanced Exposure Present";
              healthDesc = "Moderate structural allocation health. Strategic rebalancing opportunities are available to exit low-scoring holdings and capture oversold entries.";
            }

            return (
              <div className="glass-card" data-tooltip="A weighted rating (0-100%) tracking the structural alignment of your holdings. A higher rating indicates your assets reside in strong uptrends or oversold entry zones." style={{ padding: '24px 32px', border: '1px solid var(--border-glow)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '24px' }}>
                <div style={{ flex: '1 1 500px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portfolio Health Index</span>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: '950', color: '#fff', margin: '4px 0 8px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sliders className="w-6 h-6 text-violet-400" />
                    Overall Advisor Portfolio Rating
                  </h3>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                    {healthDesc}
                  </p>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', minWidth: '240px' }}>
                  <div style={{ width: '70px', height: '70px', borderRadius: '50%', border: '4px solid rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justify: 'center', position: 'relative', background: 'rgba(139, 92, 246, 0.05)', boxShadow: '0 0 15px rgba(139, 92, 246, 0.1)' }}>
                    <strong style={{ fontSize: '1.25rem', fontWeight: '950', color: '#fff' }}>
                      {weightedScore != null ? `${weightedScore.toFixed(0)}%` : '—'}
                    </strong>
                  </div>
                  <div>
                    <span className={healthClass} style={{ display: 'block', fontSize: '12px', fontWeight: '900', letterSpacing: '0.05em' }}>{healthLabel.toUpperCase()}</span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Weighted average of all local holdings scores</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 2. Tactical Opportunity Board Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            
            {/* Exit/Reduce Card Deck */}
            <div className="glass-card holdings-container" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <ShieldAlert className="w-5 h-5" style={{ color: '#fb7185' }} />
                <h4 style={{ fontSize: '1.05rem', fontWeight: '900', color: '#fff', margin: 0 }}>🚨 EXIT / REDUCE ZONE (Shift-Out Candidates)</h4>
              </div>
              <p className="holdings-subtitle" style={{ marginBottom: 20 }}>
                Identify low-performing holdings. Click "Back Out" to auto-load into the rebalancing calculator.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {s.holdings.filter(h => h.advisor_action === 'SELL' || h.pnl_pct < -5).map(h => (
                  <div key={h.id} className="active-guess-tile" style={{ borderLeft: '3px solid #fb7185', padding: '14px', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '14px', color: '#fff' }}>{h.ticker}</strong>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                          Value: {s.formatCurrency(h.total_value)} ({((h.total_value / s.summary.total_equity)*100).toFixed(0)}% alloc)
                        </span>
                      </div>
                      <span className="badge badge-sell" style={{ fontSize: '9px', padding: '4px 8px', fontWeight: '900' }}>
                        ▼ SELL (Score: {h.advisor_score}%)
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <span style={{ fontSize: '10px', color: '#fb7185', fontWeight: '700' }}>
                        Unrealized: {h.pnl >= 0 ? '▲ +' : '▼ '}{h.pnl_pct.toFixed(1)}% P&L ({s.formatCurrency(h.pnl)})
                      </span>
                      <button
                        onClick={() => {
                          s.setShifterForm(prev => ({ ...prev, sellTicker: h.ticker }));
                          s.alert(`Loaded ${h.ticker} as Sell Target! Choose a stock to buy below to complete simulation.`);
                        }}
                        className="btn-base btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '9px', fontWeight: '800', borderColor: 'rgba(244,63,94,0.2)', color: '#fb7185', borderRadius: '8px' }}
                      >
                        🚨 Back Out
                      </button>
                    </div>
                  </div>
                ))}
                {s.holdings.filter(h => h.advisor_action === 'SELL' || h.pnl_pct < -5).length === 0 && (
                  <div key="fallback-exit-opportunities" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', border: '1px dashed rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                    No immediate high-risk holdings flagged. All assets are showing solid momentum!
                  </div>
                )}
              </div>
            </div>

            {/* Entry/Expand Card Deck */}
            <div className="glass-card holdings-container" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Sparkles className="w-5 h-5" style={{ color: '#34d399' }} />
                <h4 style={{ fontSize: '1.05rem', fontWeight: '900', color: '#fff', margin: 0 }}>🚀 ENTRY / EXPAND ZONE (Shift-In Opportunities)</h4>
              </div>
              <p className="holdings-subtitle" style={{ marginBottom: 20 }}>
                Identify high-performing assets. Click "Shift Into" to auto-load and generate exit/DCA blueprints.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Grab BUY recommendation assets from holdings or s.watchlist */}
                {[
                  ...s.holdings.filter(h => h.advisor_action === 'BUY').map(h => ({ ...h, type: 'owned' })),
                  ...s.watchlist.filter(w => w.recommendation === 'BUY').map(w => ({ ...w, type: 'watched', total_value: 0 }))
                ].map((w, idx) => (
                  <div key={idx} className="active-guess-tile" style={{ borderLeft: '3px solid #34d399', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '14px', color: '#fff' }}>{w.ticker}</strong>
                        <span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', marginLeft: '8px', fontWeight: '700', textTransform: 'uppercase' }}>
                          {w.type === 'owned' ? 'Owned Asset' : 'On Watchlist'}
                        </span>
                      </div>
                      <span className="badge badge-buy" style={{ fontSize: '9px', padding: '4px 8px', fontWeight: '900' }}>
                        ▲ BUY (Score: {w.advisor_score || w.score}%)
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <span style={{ fontSize: '10px', color: '#34d399', fontWeight: '700' }}>
                        Price: {s.formatCurrency(w.current_price)} {w.timing ? `— ${w.timing.slice(0, 22)}...` : ''}
                      </span>
                      <button
                        onClick={() => {
                          s.setShifterForm(prev => ({ ...prev, buyTicker: w.ticker }));
                          s.setSelectedTicker(w.ticker);
                          s.alert(`Loaded ${w.ticker} as Buy Target! Visual blueprint generated on the right.`);
                        }}
                        className="btn-base btn-primary"
                        style={{ padding: '6px 12px', fontSize: '9px', fontWeight: '800', background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px' }}
                      >
                        🚀 Shift Into
                      </button>
                    </div>
                  </div>
                ))}
                {s.holdings.filter(h => h.advisor_action === 'BUY').length === 0 && s.watchlist.filter(w => w.recommendation === 'BUY').length === 0 && (
                  <div key="fallback-entry-opportunities" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', border: '1px dashed rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                    No extreme oversold opportunities flagged. Try adding high-beta tickers to your watchlist.
                  </div>
                )}
              </div>
            </div>

          </div>

          <div className="oracle-grid">
            {/* Shifter Optimizer Tool Card */}
            <div className="glass-card predictor-form-card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp style={{ width: 18, height: 18, color: 'var(--color-buy)' }} />
                <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#fff', margin: 0 }}>Portfolio Shift Optimizer</h4>
              </div>
              <p className="holdings-subtitle" style={{ margin: 0 }}>
                Identify underperforming assets and simulate shifting capital into high-confidence opportunities.
              </p>

              {/* Interactive Shifter Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                <div className="input-group">
                  <label className="input-label">Shift Out of (Sell Asset)</label>
                  <select
                    value={s.shifterForm.sellTicker}
                    onChange={(e) => {
                      const ticker = e.target.value;
                      s.setShifterForm(prev => ({ ...prev, sellTicker: ticker }));
                    }}
                    className="form-input-text"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Select Asset to Sell</option>
                    {s.holdings.map(h => (
                      <option key={h.id} value={h.ticker}>{h.ticker} ({h.shares} shares — ${h.total_value.toLocaleString()})</option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Shift Into (Buy Asset)</label>
                  <select
                    value={s.shifterForm.buyTicker}
                    onChange={(e) => s.setShifterForm(prev => ({ ...prev, buyTicker: e.target.value }))}
                    className="form-input-text"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="">Select Asset to Buy</option>
                    <optgroup label="Holdings">
                      {s.holdings.map(h => (
                        <option key={h.id} value={h.ticker}>{h.ticker} (${h.current_price.toFixed(2)})</option>
                      ))}
                    </optgroup>
                    <optgroup label="Watchlist">
                      {s.watchlist.map(w => (
                        <option key={w.id} value={w.ticker}>{w.ticker} (${w.current_price.toFixed(2)})</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Shift Capital Amount ($)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    value={s.shifterForm.amount}
                    onChange={(e) => s.setShifterForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="form-input-text"
                  />
                </div>

                {/* Sector Concentrations Breakdown */}
                {Object.keys(s.sectorConcentrations).length > 0 && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '800', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                      Sector Concentrations Breakdown
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {Object.entries(s.sectorConcentrations).map(([sec, pct]) => {
                        let barColor = "var(--color-hold)";
                        if (sec.includes("Tech") || sec.includes("Quantum")) barColor = "var(--color-oracle)";
                        if (pct > 25) barColor = "var(--color-sell)";
                        
                        return (
                          <div key={sec} style={{ fontSize: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', marginBottom: '3px' }}>
                              <span>{sec}</span>
                              <strong style={{ color: pct > 25 ? 'var(--color-sell)' : '#fff' }}>{pct}%</strong>
                            </div>
                            <div style={{ width: '100%', height: '4px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: barColor, borderRadius: '2px', transition: 'width 0.4s ease' }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Shifter Simulation Result Preview */}
                {(() => {
                  const sellAsset = s.holdings.find(h => h.ticker === s.shifterForm.sellTicker);
                  const buyAsset = s.holdings.find(h => h.ticker === s.shifterForm.buyTicker) || s.watchlist.find(w => w.ticker === s.shifterForm.buyTicker);
                  const amount = parseFloat(s.shifterForm.amount || 0);

                  if (sellAsset && buyAsset && amount > 0) {
                    const sellShares = Math.min(amount / sellAsset.current_price, sellAsset.shares);
                    const actualValue = sellShares * sellAsset.current_price;
                    const buyShares = actualValue / buyAsset.current_price;
                    
                    const sellSector = sellAsset.sector || "Other/Speculative";
                    const buySector = buyAsset.sector || "Other/Speculative";
                    
                    // Compute simulated sector concentrations
                    const simSectorValues = {};
                    s.holdings.forEach(h => {
                      const sec = h.sector || "Other/Speculative";
                      let val = h.total_value;
                      if (h.ticker === sellAsset.ticker) {
                        val -= actualValue;
                      }
                      if (h.ticker === buyAsset.ticker) {
                        val += actualValue;
                      }
                      simSectorValues[sec] = (simSectorValues[sec] || 0) + val;
                    });
                    
                    const isBuyAssetOwned = s.holdings.some(h => h.ticker === buyAsset.ticker);
                    if (!isBuyAssetOwned) {
                      simSectorValues[buySector] = (simSectorValues[buySector] || 0) + actualValue;
                    }
                    
                    const simSectorConcentrations = {};
                    let simTotalVal = s.summary.total_equity;
                    if (simTotalVal === 0) simTotalVal = actualValue;
                    
                    Object.entries(simSectorValues).forEach(([sec, val]) => {
                      simSectorConcentrations[sec] = (val / simTotalVal) * 100;
                    });
                    
                    const overConcentratedSectors = Object.entries(simSectorConcentrations).filter(([, pct]) => pct > 25);
                    const isCorrelatedShift = sellSector === buySector;

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: '10px' }}>
                        {/* Simulation Results Bubble */}
                        <div className="coach-tip-bubble" style={{ border: '1px solid rgba(139, 92, 246, 0.3)', backgroundColor: 'rgba(139, 92, 246, 0.05)', fontSize: '10px', margin: 0 }}>
                          <strong style={{ color: 'var(--color-oracle)', display: 'block', marginBottom: '4px', fontSize: '11px' }}>ΓÜÖ∩╕Å Rebalancer Simulation Outcome:</strong>
                          <ul style={{ paddingLeft: '14px', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <li>Sells <strong style={{ color: '#fff' }}>{sellShares.toFixed(2)} shares</strong> of {sellAsset.ticker} raising <strong style={{ color: '#fff' }}>${actualValue.toLocaleString(undefined, {maximumFractionDigits: 2})}</strong> cash.</li>
                            <li>Buys <strong style={{ color: '#fff' }}>{buyShares.toFixed(2)} shares</strong> of {buyAsset.ticker} at current quote price of ${buyAsset.current_price.toFixed(2)}.</li>
                            <li>Shifts portfolio weights by <strong style={{ color: 'var(--color-buy)' }}>+{((actualValue / s.summary.total_equity) * 100).toFixed(1)}% allocation</strong> to {buyAsset.ticker}.</li>
                          </ul>
                        </div>
                        
                        {/* Sector Correlation Warning Tag */}
                        {isCorrelatedShift && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(244, 63, 94, 0.2)', backgroundColor: 'rgba(244, 63, 94, 0.04)', color: '#fb7185', fontSize: '9px', fontWeight: '800' }}>
                            <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(244,63,94,0.15)', fontSize: '8px', color: '#fb7185' }}>CORRELATED REDIRECT</span>
                            <span>Warning: Rebalancing within the same sector ({buySector}) does not reduce structural system drawdown risk!</span>
                          </div>
                        )}
                        
                        {/* Sector Concentration Critical Warning Card */}
                        {overConcentratedSectors.map(([sec, pct]) => (
                          <div key={sec} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px', borderRadius: '10px', border: '1px solid rgba(244, 63, 94, 0.25)', backgroundColor: 'rgba(244, 63, 94, 0.04)', boxShadow: '0 0 10px rgba(244, 63, 94, 0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <ShieldAlert style={{ width: 14, height: 14, color: '#fb7185' }} />
                              <strong style={{ fontSize: '10px', color: '#fb7185', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EXPOSURE CRITICAL WARNING</strong>
                            </div>
                            <p style={{ margin: 0, fontSize: '9.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                              Sector <strong style={{ color: '#fff' }}>{sec}</strong> simulated concentration is <strong style={{ color: '#fb7185' }}>{pct.toFixed(1)}%</strong>, exceeding the safe institutional limit of 25%. High risk of correlated drawdown. Consider diversification.
                            </p>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            {/* Bracket Blueprints Card */}
            <div className="glass-card predictor-form-card" style={{ minHeight: '400px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Target style={{ width: 18, height: 18, color: 'var(--color-oracle)' }} />
                  <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#fff' }}>Bracket Blueprint Strategy</h4>
                </div>
                <select
                  value={s.selectedTicker}
                  onChange={(e) => s.setSelectedTicker(e.target.value)}
                  className="form-input-text"
                  style={{ width: '120px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                >
                  <optgroup label="Holdings">
                    {s.holdings.map(h => (
                      <option key={h.id} value={h.ticker}>{h.ticker}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Watchlist">
                    {s.watchlist.map(w => (
                      <option key={w.id} value={w.ticker}>{w.ticker}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {s.strategyLoading ? (
                <div style={{ display: 'flex', height: '300px', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw className="animate-spin w-6 h-6 mr-2" />
                  Generating institutional brackets...
                </div>
              ) : s.strategyBrackets ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  
                  {/* Score & General Advice */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-light)' }}>
                    <div>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Advisor Standing for {s.selectedTicker}</span>
                      <h5 style={{ fontSize: '13px', fontWeight: '900', color: '#fff', margin: '2px 0 0' }}>
                        {s.strategyBrackets.advisor_score}% Conviction Score → <strong style={{ color: s.strategyBrackets.advisor_action === 'BUY' ? 'var(--color-buy)' : s.strategyBrackets.advisor_action === 'SELL' ? 'var(--color-sell)' : 'var(--color-hold)' }}>{s.strategyBrackets.advisor_action}</strong>
                      </h5>
                    </div>
                    {s.strategyBrackets.owned_shares > 0 ? (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Position Details</span>
                        <strong style={{ display: 'block', fontSize: '11px', color: '#fff', margin: '2px 0 0' }}>
                          {s.strategyBrackets.owned_shares} shares @ ${s.strategyBrackets.avg_buy_price.toFixed(2)}
                        </strong>
                      </div>
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--color-oracle)', fontWeight: '800' }}>WATCHLIST MONITOR ACTIVE</span>
                    )}
                  </div>

                  {/* Risk & Stop-Loss Assessment Gauge */}
                  <div className="glass-card" style={{ padding: '16px', border: '1px solid rgba(255, 255, 255, 0.05)', backgroundColor: 'rgba(255,255,255,0.015)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Activity className="w-4.5 h-4.5" style={{ color: s.strategyBrackets.is_asymmetric_risk ? '#fb7185' : '#34d399' }} />
                      <strong style={{ fontSize: '11px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Blueprint Assessment</strong>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block' }}>ATR VOLATILITY STOP-LOSS</span>
                        <strong style={{ fontSize: '15px', color: '#fff' }}>${s.strategyBrackets.stop_loss_price.toFixed(2)}</strong>
                        <span style={{ fontSize: '8px', color: '#fb7185', display: 'block', marginTop: '2px', fontWeight: '800' }}>2.5x ATR Buffer</span>
                      </div>
                      
                      <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block' }}>RISK:REWARD RATIO</span>
                        <strong style={{ fontSize: '15px', color: s.strategyBrackets.is_asymmetric_risk ? '#fb7185' : '#34d399' }}>
                          1 : {s.strategyBrackets.risk_to_reward_ratio.toFixed(2)}
                        </strong>
                        <span style={{ fontSize: '8px', color: s.strategyBrackets.is_asymmetric_risk ? '#fb7185' : '#34d399', display: 'block', marginTop: '2px', fontWeight: '800' }}>
                          {s.strategyBrackets.is_asymmetric_risk ? 'Asymmetric Risk' : 'Optimal Swing Ratio'}
                        </span>
                      </div>
                    </div>

                    {/* Progress indicator bar for Risk-Reward */}
                    <div>
                      <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            width: `${Math.min((s.strategyBrackets.risk_to_reward_ratio / 3.0) * 100, 100)}%`, 
                            height: '100%', 
                            backgroundColor: s.strategyBrackets.is_asymmetric_risk ? 'var(--color-sell)' : 'var(--color-buy)',
                            borderRadius: '3px',
                            transition: 'width 0.4s ease'
                          }}
                        ></div>
                      </div>
                    </div>
                    
                    {/* Volatility detail labels */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-secondary)' }}>
                      <span>ATR Volatility: <strong>${s.strategyBrackets.atr.toFixed(2)}</strong></span>
                      <span>Market Regime bounds: <strong>{s.strategyBrackets.buy_threshold}% Buy / {s.strategyBrackets.sell_threshold}% Sell</strong></span>
                    </div>

                    {/* Asymmetric Risk Lockout Flag */}
                    {s.strategyBrackets.is_asymmetric_risk && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px', borderRadius: '8px', border: '1px solid rgba(244, 63, 94, 0.2)', backgroundColor: 'rgba(244, 63, 94, 0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fb7185', fontWeight: '800', fontSize: '9px' }}>
                          <ShieldAlert style={{ width: 12, height: 12 }} />
                          <span>ΓÜá∩╕Å ASYMMETRIC RISK LOCKOUT ACTIVE</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '8.5px', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                          Capital entry is disauthorized. The mathematical upside target is too low relative to volatility-buffered downside risk. Risk-to-Reward must exceed 1:1.50 to execute.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Profit Scale-Out Blueprint */}
                  <div>
                    <h5 style={{ fontSize: '11px', fontWeight: '900', color: 'var(--color-buy)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle style={{ width: 12, height: 12 }} />
                      Scale-Out Profit Targets (Profit Maximizer)
                    </h5>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {s.strategyBrackets.scale_out_profit_blueprint.map((t, idx) => (
                        <div key={idx} className="active-guess-tile" style={{ borderLeft: '3px solid var(--color-buy)', padding: '10px 14px' }}>
                          <div className="active-guess-row-1">
                            <span style={{ fontSize: '11px', fontWeight: '800' }}>{t.stage} <span style={{ color: 'var(--text-muted)', fontSize: '9px', fontWeight: 'normal' }}>({t.trigger})</span></span>
                            <span style={{ color: 'var(--color-buy)', fontWeight: '900' }}>Target: ${t.price.toFixed(2)}</span>
                          </div>
                          <div className="active-guess-row-2" style={{ fontSize: '10px', marginTop: '4px' }}>
                            <span>Shares to Sell: {t.shares_to_sell > 0 ? `${t.shares_to_sell} units` : "0 (No position)"}</span>
                            <span>Yield: {t.projected_yield > 0 ? `$${t.projected_yield.toLocaleString(undefined, {maximumFractionDigits: 2})}` : "—"}</span>
                          </div>
                          <div className="active-guess-row-3" style={{ fontSize: '9px', marginTop: '4px' }}>
                            <span className="deviation-value-pos" style={{ fontWeight: '800' }}>
                              +{t.percent_gain.toFixed(1)}% Return from Cost
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cost Scale-In DCA Blueprint */}
                  <div>
                    <h5 style={{ fontSize: '11px', fontWeight: '900', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Info style={{ width: 12, height: 12 }} />
                      Scale-In entry brackets (Risk Reducer)
                    </h5>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {s.strategyBrackets.scale_in_dca_blueprint.map((l, idx) => (
                        <div key={idx} className="active-guess-tile" style={{ borderLeft: '3px solid #6366f1', padding: '10px 14px' }}>
                          <div className="active-guess-row-1">
                            <span style={{ fontSize: '11px', fontWeight: '800' }}>{l.level} <span style={{ color: 'var(--text-muted)', fontSize: '9px', fontWeight: 'normal' }}>({l.trigger})</span></span>
                            <span style={{ color: '#818cf8', fontWeight: '900' }}>Buy Price: ${l.price.toFixed(2)}</span>
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: '9px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                            {l.desc}
                          </p>
                          <div className="active-guess-row-3" style={{ fontSize: '9px', marginTop: '4px' }}>
                            <span style={{ color: '#fb7185', fontWeight: '800' }}>
                              Dip Target: -{l.pct_dip}% below quote
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              ) : (
                <div style={{ display: 'flex', height: '300px', alignItems: 'center', justify: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                  No strategy data calculated. Ensure a profile and ticker are loaded.
                </div>
              )}
            </div>
          </div>
          </>
          )}
        </div>
  );
}
