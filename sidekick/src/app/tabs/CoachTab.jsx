// ./sidekick/src/app/tabs/CoachTab.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { TrendingUp, Info, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';
import CoachSVGChart from '../chart/CoachSVGChart';

export default function CoachTab() {
  const s = useSidekick();

  return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div className="glass-card chart-card-container">
            <div className="chart-header-row">
              <div>
                <div className="chart-title-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => s.handleCycleTicker(-1)}
                      className="font-size-btn"
                      style={{ padding: '6px 10px', borderRadius: '8px', minWidth: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Previous Asset (Back)"
                    >
                      <ChevronLeft style={{ width: 14, height: 14 }} />
                    </button>
                    
                    <select
                      value={s.selectedTicker.toUpperCase()}
                      onChange={(e) => s.setSelectedTicker(e.target.value)}
                      className="sector-dropdown"
                      style={{ padding: '5px 24px 5px 12px', minWidth: '100px', cursor: 'pointer', fontFamily: 'var(--font-heading)', fontWeight: '900', fontSize: '12px', height: '30px' }}
                    >
                      {s.allAvailableTickers.map(ticker => (
                        <option key={ticker} value={ticker}>{ticker}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => s.handleCycleTicker(1)}
                      className="font-size-btn"
                      style={{ padding: '6px 10px', borderRadius: '8px', minWidth: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Next Asset (Next)"
                    >
                      <ChevronRight style={{ width: 14, height: 14 }} />
                    </button>
                  </div>

                  <h3 className="chart-main-title" style={{ margin: 0 }}>{s.selectedTicker} Market Analysis</h3>
                  <span className="chart-timeframe-tag">1-Year History</span>
                </div>
                <p className="chart-sub-guide">Move your cursor across the chart path for precise hover pricing statistics. Cycle assets using next/back arrows or dropdown.</p>
              </div>

              {/* Technical Indicator overlays toggles */}
              <div className="overlays-toggles-bar">
                <button
                  onClick={() => s.setIsCoachMode(!s.isCoachMode)}
                  className={`overlay-toggle-btn ${s.isCoachMode ? 'overlay-toggle-btn-coach-active' : ''}`}
                >
                  <Sparkles style={{ width: 12, height: 12 }} />
                  {s.isCoachMode ? "Coach On" : "Coach Off"}
                </button>
                <div style={{ height: 14, width: 1, backgroundColor: 'rgba(255,255,255,0.08)', margin: '0 4px' }}></div>
                <button
                  onClick={() => s.setChartOverlays(prev => ({ ...prev, sma50: !prev.sma50 }))}
                  className={`overlay-toggle-btn ${s.chartOverlays.sma50 ? 'overlay-toggle-btn-active-sma' : ''}`}
                >
                  SMA 50
                </button>
                <button
                  onClick={() => s.setChartOverlays(prev => ({ ...prev, bollinger: !prev.bollinger }))}
                  className={`overlay-toggle-btn ${s.chartOverlays.bollinger ? 'overlay-toggle-btn-active-bb' : ''}`}
                >
                  Bollinger
                </button>
                <button
                  onClick={() => s.setChartOverlays(prev => ({ ...prev, signals: !prev.signals }))}
                  className={`overlay-toggle-btn ${s.chartOverlays.signals ? 'overlay-toggle-btn-active-sig' : ''}`}
                >
                  Signals
                </button>
              </div>
            </div>

            {/* Interactive SVG Chart block */}
            <div className="svg-canvas-box">
              <CoachSVGChart />
              <div className="chart-ticks-legend">
                <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f59e0b' }}></span> SMA 50 Average</span>
                <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-buy)' }}></span> Buy Trigger</span>
                <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-sell)' }}></span> Sell Trigger</span>
              </div>
            </div>
          </div>

          {/* Expanded Visual Coach Academy Breakdown */}
          {s.advisorData?.scores && s.advisorData?.metrics ? (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="academy-section-header">
                <Sparkles style={{ width: 18, height: 18, color: '#34d399' }} />
                <h3 className="academy-title">Visual Coach Academy : Quantitative Signals</h3>
              </div>

              <div className="coach-grid">
                {/* RSI Indicator Card */}
                <div className="glass-card academy-card">
                  <div className="academy-card-top">
                    <span className="academy-card-label" style={{ color: '#38bdf8' }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#38bdf8' }}></span>
                      Relative Strength Index (Wilder RSI)
                    </span>
                    <span className={`academy-card-score ${
                      s.advisorData.scores.rsi_score >= 60 ? 'score-buy-badge' : 
                      s.advisorData.scores.rsi_score <= 40 ? 'score-sell-badge' : 'score-hold-badge'
                    }`}>
                      Score: {s.advisorData.scores.rsi_score.toFixed(0)}/100
                    </span>
                  </div>
                  
                  <div className="academy-card-middle">
                    <span className="academy-card-val">{s.advisorData.metrics.rsi}</span>
                    <span className="academy-card-unit">Value</span>
                    <span className="academy-card-weight">Factor weight: {(s.advisorData.weights.rsi_weight * 100).toFixed(0)}%</span>
                  </div>

                  {s.isCoachMode && (
                    <div className="academy-card-coach-explanation">
                      <strong>🎓 Coach Explanation:</strong> {s.advisorData.metrics.rsi < 35 
                        ? `The RSI is low at ${s.advisorData.metrics.rsi}. This indicates that panic sellers have oversold ${s.selectedTicker}. Like a compressed metal coil, it is highly primed to bounce back up (Oversold -> BUY opportunity!).`
                        : s.advisorData.metrics.rsi > 65 
                        ? `The RSI is high at ${s.advisorData.metrics.rsi}. Buying sentiment is extremely excited. Like a runner gasping for breath, the stock is tired and likely to experience a healthy pullback soon (Overbought -> SELL risk).`
                        : `The RSI is at a balanced ${s.advisorData.metrics.rsi}. Market sentiment is stable and matching fair valuation boundaries (HOLD).`}
                    </div>
                  )}
                </div>

                {/* MACD Momentum Card */}
                <div className="glass-card academy-card">
                  <div className="academy-card-top">
                    <span className="academy-card-label" style={{ color: '#c084fc' }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#c084fc' }}></span>
                      MACD Momentum Speed Index
                    </span>
                    <span className={`academy-card-score ${
                      s.advisorData.scores.macd_score >= 60 ? 'score-buy-badge' : 
                      s.advisorData.scores.macd_score <= 40 ? 'score-sell-badge' : 'score-hold-badge'
                    }`}>
                      Score: {s.advisorData.scores.macd_score.toFixed(0)}/100
                    </span>
                  </div>
                  
                  <div className="academy-card-middle">
                    <span className="academy-card-val">{s.advisorData.metrics.macd}</span>
                    <span className="academy-card-unit">Histogram</span>
                    <span className="academy-card-weight">Factor weight: {(s.advisorData.weights.macd_weight * 100).toFixed(0)}%</span>
                  </div>

                  {s.isCoachMode && (
                    <div className="academy-card-coach-explanation">
                      <strong>🎓 Coach Explanation:</strong> {s.advisorData.metrics.macd > 0 
                        ? `MACD is positive (${s.advisorData.metrics.macd}), showing short-term price momentum is turning faster than the long-term trend. Think of it like pressing the gas pedal on your car!`
                        : `MACD is cooling off (${s.advisorData.metrics.macd}). Momentum is starting to lose speed up a hill as gravity pulls it down.`}
                    </div>
                  )}
                </div>

                {/* SMA Trend Card */}
                <div className="glass-card academy-card">
                  <div className="academy-card-top">
                    <span className="academy-card-label" style={{ color: '#fbbf24' }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#fbbf24' }}></span>
                      Moving Average Support Lines
                    </span>
                    <span className={`academy-card-score ${
                      s.advisorData.scores.trend_score >= 60 ? 'score-buy-badge' : 
                      s.advisorData.scores.trend_score <= 40 ? 'score-sell-badge' : 'score-hold-badge'
                    }`}>
                      Score: {s.advisorData.scores.trend_score.toFixed(0)}/100
                    </span>
                  </div>
                  
                  <div className="academy-card-middle">
                    <span className="academy-card-val" style={{ fontSize: '1.25rem' }}>
                      {s.advisorData.scores.trend_score >= 60 ? 'Trading Above SMA' : 'Trading Below SMA'}
                    </span>
                    <span className="academy-card-weight">Factor weight: {(s.advisorData.weights.trend_weight * 100).toFixed(0)}%</span>
                  </div>

                  {s.isCoachMode && (
                    <div className="academy-card-coach-explanation">
                      <strong>🎓 Coach Explanation:</strong> {s.advisorData.scores.trend_score >= 60 
                        ? `The stock is currently trading above its 50-day average line. This is a support level—the market has the wind at its back, signaling positive structural health!`
                        : `The price has dipped below the 50-day average line. Gravity is pulling the trend down. Exercise caution as sellers hold technical control.`}
                    </div>
                  )}
                </div>

                {/* Gut Guess Card */}
                <div className="glass-card academy-card">
                  <div className="academy-card-top">
                    <span className="academy-card-label" style={{ color: '#f472b6' }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f472b6' }}></span>
                      Intuitive User Gut Prediction Factor
                    </span>
                    <span className={`academy-card-score ${
                      s.advisorData.scores.gut_score >= 60 ? 'score-buy-badge' : 
                      s.advisorData.scores.gut_score <= 40 ? 'score-sell-badge' : 'score-hold-badge'
                    }`}>
                      Score: {s.advisorData.scores.gut_score.toFixed(0)}/100
                    </span>
                  </div>
                  
                  <div className="academy-card-middle">
                    <span className="academy-card-val" style={{ fontSize: '1.25rem' }}>
                      Self-Evolution Calibrated
                    </span>
                    <span className="academy-card-weight">Factor weight: {(s.advisorData.weights.gut_weight * 100).toFixed(0)}%</span>
                  </div>

                  {s.isCoachMode && (
                    <div className="academy-card-coach-explanation">
                      <strong>🎓 Coach Explanation:</strong> The Oracle tracks your price predictions in SQLite. As your gut guesses prove accurate, the system **automatically expands your Gut Weight** dynamically, cementing your personal trading intuition into the advisor algorithm!
                    </div>
                  )}
                </div>
              </div>

              {/* Multi-Timeframe Epoch Backtest Scorecard */}
              {s.evolutionMetrics && (
                <div className="glass-card animate-fade-in" style={{ padding: '20px', border: '1px solid rgba(139, 92, 246, 0.25)', backgroundColor: 'rgba(139, 92, 246, 0.02)', display: 'flex', flexDirection: 'column', gap: 14, marginTop: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles style={{ width: 16, height: 16, color: 'var(--color-oracle)' }} />
                    <strong style={{ fontSize: '11px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Multi-Timeframe Stress-Test Scorecard
                    </strong>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Epoch 1: Immediate Swing (30d)</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: '6px', fontSize: '9.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Wilder RSI Yield:</span>
                          <strong style={{ color: s.evolutionMetrics.immediate.rsi >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {s.evolutionMetrics.immediate.rsi >= 0 ? '+' : ''}{s.evolutionMetrics.immediate.rsi}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>MACD Momentum:</span>
                          <strong style={{ color: s.evolutionMetrics.immediate.macd >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {s.evolutionMetrics.immediate.macd >= 0 ? '+' : ''}{s.evolutionMetrics.immediate.macd}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Trend SMA support:</span>
                          <strong style={{ color: s.evolutionMetrics.immediate.trend >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {s.evolutionMetrics.immediate.trend >= 0 ? '+' : ''}{s.evolutionMetrics.immediate.trend}%
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <span style={{ fontSize: '8px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Epoch 2: Macro Trend (180d)</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: '6px', fontSize: '9.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Wilder RSI Yield:</span>
                          <strong style={{ color: s.evolutionMetrics.macro.rsi >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {s.evolutionMetrics.macro.rsi >= 0 ? '+' : ''}{s.evolutionMetrics.macro.rsi}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>MACD Momentum:</span>
                          <strong style={{ color: s.evolutionMetrics.macro.macd >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {s.evolutionMetrics.macro.macd >= 0 ? '+' : ''}{s.evolutionMetrics.macro.macd}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Trend SMA support:</span>
                          <strong style={{ color: s.evolutionMetrics.macro.trend >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {s.evolutionMetrics.macro.trend >= 0 ? '+' : ''}{s.evolutionMetrics.macro.trend}%
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(244,63,94,0.02)', border: '1px solid rgba(244,63,94,0.08)' }}>
                      <span style={{ fontSize: '8px', color: '#fb7185', display: 'block', textTransform: 'uppercase', fontWeight: '800' }}>Epoch 3: Volatility Stress (Drawdown)</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: '6px', fontSize: '9.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Wilder RSI Yield:</span>
                          <strong style={{ color: s.evolutionMetrics.stress.rsi >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {s.evolutionMetrics.stress.rsi >= 0 ? '+' : ''}{s.evolutionMetrics.stress.rsi}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>MACD Momentum:</span>
                          <strong style={{ color: s.evolutionMetrics.stress.macd >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {s.evolutionMetrics.stress.macd >= 0 ? '+' : ''}{s.evolutionMetrics.stress.macd}%
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Trend SMA support:</span>
                          <strong style={{ color: s.evolutionMetrics.stress.trend >= 0 ? 'var(--color-buy)' : 'var(--color-sell)' }}>
                            {s.evolutionMetrics.stress.trend >= 0 ? '+' : ''}{s.evolutionMetrics.stress.trend}%
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Force evolve action */}
              <div className="evolution-footer-bar">
                <div className="evolution-footer-text-box">
                  <Info style={{ width: 16, height: 16 }} />
                  <span>Advisor weights auto-calibrate based on trade backtests</span>
                </div>
                <button
                  onClick={s.handleForceEvolve}
                  disabled={s.loading}
                  className="btn-evolve"
                >
                  <Sparkles style={{ width: 14, height: 14 }} />
                  Force Evolve Weights
                </button>
              </div>
            </section>
          ) : (
            <div className="glass-card" style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <TrendingUp style={{ width: 20, height: 20 }} />
              </div>
              <p style={{ fontSize: '12px' }}>Coach data pending stock selection.</p>
            </div>
          )}
        </div>
  );
}
