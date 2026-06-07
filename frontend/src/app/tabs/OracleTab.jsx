// ./frontend/src/app/tabs/OracleTab.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { Calendar, CheckCircle, Sparkles, Brain, Activity, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { useSidekick } from '../context/SidekickContext';

export default function OracleTab() {
  const s = useSidekick();

  return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Sub-Tab Navigation inside Oracle */}
          <div className="viability-sub-tabs-wrapper animate-fade-in">
            <div className="viability-sub-tabs">
              <button
                onClick={() => s.setPredictionTab("viability")}
                className={`viability-sub-tab-btn ${s.predictionTab === "viability" ? "viability-sub-tab-btn-active" : ""}`}
              >
                <Sparkles style={{ width: 14, height: 14 }} />
                Trade Horizon Viability Oracle
              </button>
              <button
                onClick={() => s.setPredictionTab("intuition")}
                className={`viability-sub-tab-btn ${s.predictionTab === "intuition" ? "viability-sub-tab-btn-active" : ""}`}
              >
                <Brain style={{ width: 14, height: 14 }} />
                Intuition Tracker & Archetypes
              </button>
            </div>
          </div>

          {s.predictionTab === "intuition" && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {/* Top banner: Oracle Behavioral Archetype Certificate */}
              {s.analytics ? (
                <div className="glass-card oracle-certificate-card">
                  <div>
                    <span className="cert-meta-label">Your Cognitive Oracle Archetype</span>
                    <h3 className="cert-title">{s.analytics.archetype}</h3>
                    <p className="cert-desc">{s.analytics.archetype_desc}</p>
                  </div>
                  
                  <div className="cert-stats-board">
                    <div className="cert-stat-item">
                      <span className="cert-stat-label">Short-Term (7-14d)</span>
                      <strong className="cert-stat-val">
                        {s.analytics.details?.short_term != null ? `${s.analytics.details.short_term.toFixed(0)}% Hit` : '—'}
                      </strong>
                    </div>
                    <div className="cert-stat-line-spacer"></div>
                    <div className="cert-stat-item">
                      <span className="cert-stat-label">Long-Term (90d+)</span>
                      <strong className="cert-stat-val">
                        {s.analytics.details?.long_term != null ? `${s.analytics.details.long_term.toFixed(0)}% Hit` : '—'}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="glass-card" style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                  No price prediction analytics generated yet. Submit a guess below to analyze your archetype!
                </div>
              )}

              {/* Double Columns layout: Left Launcher Form, Right Guess Timeline logs */}
              <div className="oracle-grid">
                {/* Guess creator Form */}
                <div className="glass-card predictor-form-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Target style={{ width: 18, height: 18, color: '#a78bfa' }} />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#fff' }}>Create Gut Predictor Guess</h3>
                  </div>
                  <p className="holdings-subtitle" style={{ marginBottom: 24 }}>Test your intuition for {s.selectedTicker} by submitting a future target price. SQLite automatically resolution-tracks it against live markets.</p>

                  <form onSubmit={s.handleCreateGuess} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="input-group">
                      <label className="input-label">Target Price ($) for {s.selectedTicker}</label>
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. 245.00"
                        value={s.guessForm.target_price}
                        onChange={(e) => s.setGuessForm(prev => ({ ...prev, target_price: e.target.value }))}
                        className="form-input-text"
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label">Target Time Horizon</label>
                      <select
                        value={s.guessForm.timeframe_days}
                        onChange={(e) => s.setGuessForm(prev => ({ ...prev, timeframe_days: e.target.value }))}
                        className="form-input-text"
                        style={{ cursor: 'pointer' }}
                      >
                        <option value={7}>7 Days (Short Swing)</option>
                        <option value={14}>14 Days (Swing Trade)</option>
                        <option value={30}>30 Days (Standard Month)</option>
                        <option value={90}>90 Days (Quarter Outlook)</option>
                        <option value={180}>180 Days (Half Year Target)</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="btn-evolve"
                      style={{ width: '100%', padding: '12px', justifyContent: 'center', marginTop: '8px' }}
                    >
                      Deploy Prediction to Database
                    </button>
                  </form>
                </div>

                {/* Timeline lists */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Active list */}
                  <div className="glass-card predictions-timeline-card bg-gradient-to-b from-[#11151e] to-[#0e121a]">
                    <span className="predictions-timeline-title-row">
                      Active Price Timeline Guesses ({s.guesses.pending.length})
                    </span>
                    
                    <div className="predictions-scroll-container">
                      {s.guesses.pending.map(g => (
                        <div key={g.id} className="active-guess-tile">
                          <div className="active-guess-row-1">
                            <span style={{ fontSize: '13px', fontWeight: '900' }}>{g.ticker}</span>
                            <span style={{ color: '#a78bfa' }}>Target: ${g.target_price.toFixed(2)}</span>
                          </div>
                          
                          <div className="active-guess-row-2">
                            <span>Original: ${g.initial_price.toFixed(2)}</span>
                            <span>Market: ${g.current_price.toFixed(2)}</span>
                          </div>
                          
                          <div className="active-guess-row-3">
                            <span className={g.deviation_pct >= 0 ? 'deviation-value-pos' : 'deviation-value-neg'}>
                              {g.deviation_pct >= 0 ? '+' : ''}{g.deviation_pct.toFixed(1)}% Deviation
                            </span>
                            <span className="active-guess-resolve-date">
                              <Calendar style={{ width: 12, height: 12 }} />
                              Resolve: {g.target_date}
                            </span>
                          </div>
                        </div>
                      ))}
                      {s.guesses.pending.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', border: '1px dashed rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                          No active price predictions currently logged. Submit a guess on the left!
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resolved archives list */}
                  <div className="glass-card predictions-timeline-card bg-gradient-to-b from-[#11151e] to-[#0e121a]">
                    <span className="predictions-timeline-title-row">
                      Completed Prediction Logs ({s.guesses.completed.length})
                    </span>
                    
                    <div className="predictions-scroll-container" style={{ maxHeight: '200px' }}>
                      {s.guesses.completed.map(g => (
                        <div key={g.id} className="resolved-guess-archive-tile">
                          <div>
                            <div className="archive-title-badge-row">
                              <span style={{ fontSize: '13px', fontWeight: '900' }}>{g.ticker}</span>
                              <span className={`archive-pill-status ${g.status === 'hit' ? 'archive-pill-status-hit' : 'archive-pill-status-missed'}`}>
                                {g.status.toUpperCase()}
                              </span>
                            </div>
                            <div className="archive-metrics-row">
                              Target: ${g.target_price.toFixed(2)} | Resolved Price: ${g.actual_end_price?.toFixed(2)}
                            </div>
                          </div>
                          <span className="archive-date-td">{g.resolved_at}</span>
                        </div>
                      ))}
                      {s.guesses.completed.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)', fontSize: '11px' }}>
                          No resolved predictions in archives yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {s.predictionTab === "viability" && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Horizon Selectors */}
              <div className="viability-horizon-pills">
                <button
                  onClick={() => s.setViabilityHorizon("day")}
                  className={`viability-horizon-pill ${s.viabilityHorizon === "day" ? "viability-horizon-pill-active" : ""}`}
                >
                  🌅 Day Horizon (24h Outlook)
                </button>
                <button
                  onClick={() => s.setViabilityHorizon("week")}
                  className={`viability-horizon-pill ${s.viabilityHorizon === "week" ? "viability-horizon-pill-active" : ""}`}
                >
                  📅 Week Horizon (Swing Outlook)
                </button>
                <button
                  onClick={() => s.setViabilityHorizon("month")}
                  className={`viability-horizon-pill ${s.viabilityHorizon === "month" ? "viability-horizon-pill-active" : ""}`}
                >
                  🌌 Month Horizon (Macro Outlook)
                </button>
              </div>

              {s.viabilityData ? (() => {
                const forecast = s.viabilityData[s.viabilityHorizon];
                if (!forecast) return null;

                // Dynamic UI Math matching active sliders
                const sRsi = forecast.rsi_score;
                const sMacd = forecast.macd_score;
                const sTrend = forecast.trend_score;

                const totalW = s.viabilityWeights.rsi + s.viabilityWeights.macd + s.viabilityWeights.trend;
                const wRsi = totalW > 0 ? s.viabilityWeights.rsi / totalW : 0.35;
                const wMacd = totalW > 0 ? s.viabilityWeights.macd / totalW : 0.35;
                const wTrend = totalW > 0 ? s.viabilityWeights.trend / totalW : 0.30;

                const dynamicScore = Math.round((sRsi * wRsi + sMacd * wMacd + sTrend * wTrend) * 10) / 10;
                
                const isBear = (s.advisorData?.regime_status || forecast.regime_status) === "BEARISH";
                const buyH = isBear ? 78.0 : 65.0;
                const sellH = isBear ? 45.0 : 35.0;

                let dynamicAction;
                let actionColor = "var(--text-muted)";
                let glowColor;

                if (dynamicScore >= 80) {
                  dynamicAction = "STRONG BUY";
                  actionColor = "var(--text-highlight-green)";
                  glowColor = "rgba(16, 185, 129, 0.15)";
                } else if (dynamicScore >= buyH) {
                  dynamicAction = "BUY";
                  actionColor = "#34d399";
                  glowColor = "rgba(52, 211, 153, 0.1)";
                } else if (dynamicScore < 20) {
                  dynamicAction = "STRONG SELL";
                  actionColor = "var(--metric-pnl-neg)";
                  glowColor = "rgba(244, 63, 94, 0.15)";
                } else if (dynamicScore < sellH) {
                  dynamicAction = "SELL";
                  actionColor = "#f87171";
                  glowColor = "rgba(248, 113, 113, 0.1)";
                } else {
                  dynamicAction = "HOLD";
                  actionColor = "var(--text-highlight-purple)";
                  glowColor = "rgba(167, 139, 250, 0.08)";
                }

                // Arc Math for SVG Donut Gauge
                const radius = 50;
                const stroke = 8;
                const normalizedRadius = radius - stroke * 2;
                const circumference = normalizedRadius * 2 * Math.PI;
                const strokeDashoffset = circumference - (dynamicScore / 100) * circumference;

                // Handle single-click database commit
                const handleCommitHorizonGuess = async () => {
                  try {
                    let targetVal = forecast.exit_target;
                    let timeframeDays = s.viabilityHorizon === "day" ? 1 : (s.viabilityHorizon === "week" ? 14 : 90);
                    
                    if (s.isSandbox) {
                      s.localDb.createGuess(s.activeProfile.id, s.selectedTicker, targetVal, s.chartData.length > 0 ? s.chartData[s.chartData.length - 1].close_price : 100.0, timeframeDays);
                      s.alert(`Successfully committed ${s.selectedTicker} horizon prediction. Target Exit $${targetVal} logged locally!`);
                    } else {
                      const res = await s.sidekickFetch(`/guesses`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          profile_id: s.activeProfile.id,
                          ticker: s.selectedTicker.toUpperCase().trim(),
                          target_price: targetVal,
                          timeframe_days: timeframeDays
                        })
                      });
                      if (!res.ok) throw new Error("Failed to save backend prediction");
                      s.alert(`Successfully committed ${s.selectedTicker} horizon prediction. Target Exit $${targetVal} logged in SQLite!`);
                    }
                    // Refresh s.guesses
                    const updatedG = s.isSandbox ? s.localDb.getGuesses(s.activeProfile.id) : await (await s.sidekickFetch(`/guesses?profile_id=${s.activeProfile.id}`)).json();
                    s.setGuesses(updatedG);
                    const updatedA = s.isSandbox ? s.localDb.getAnalytics(s.activeProfile.id) : await (await s.sidekickFetch(`/guesses/analytics?profile_id=${s.activeProfile.id}`)).json();
                    s.setAnalytics(updatedA);
                  } catch (err) {
                    console.error("Failed to commit prediction:", err);
                    s.alert("Error saving prediction. Check logs.");
                  }
                };

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 24 }} className="oracle-grid animate-fade-in">
                    {/* Left Column: Viability Scoring Gauge & Targets */}
                    <div className="glass-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${actionColor}2a`, boxShadow: `0 0 20px ${glowColor}` }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '950', color: '#fff', textAlign: 'center' }}>
                          Viability Scoring Deck — {s.selectedTicker}
                        </h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: '9.5px', color: 'var(--text-muted)', textAlign: 'center' }}>
                          Calculated for {s.viabilityHorizon.toUpperCase()} horizon trading cycles
                        </p>
                      </div>

                      {/* Donut Gauge */}
                      <div className="viability-gauge-container">
                        <svg height={radius * 2} width={radius * 2} className="viability-gauge-svg">
                          <circle
                            stroke="rgba(255,255,255,0.02)"
                            fill="transparent"
                            strokeWidth={stroke}
                            r={normalizedRadius}
                            cx={radius}
                            cy={radius}
                          />
                          <circle
                            stroke={actionColor}
                            fill="transparent"
                            strokeWidth={stroke}
                            strokeDasharray={circumference + ' ' + circumference}
                            style={{ strokeDashoffset }}
                            strokeLinecap="round"
                            r={normalizedRadius}
                            cx={radius}
                            cy={radius}
                          />
                        </svg>
                        <div className="viability-score-text-box">
                          <span className="viability-score-text" style={{ textShadow: `0 0 15px ${actionColor}66` }}>
                            {dynamicScore.toFixed(0)}%
                          </span>
                          <span className="viability-score-label">Viability</span>
                        </div>
                      </div>

                      {/* Verdict panel */}
                      <div className="viability-verdict-row">
                        <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horizon Recommendation</span>
                        <h3 className="viability-verdict-title" style={{ color: actionColor, textShadow: `0 0 10px ${actionColor}33` }}>
                          {dynamicAction}
                        </h3>
                      </div>

                      {/* Entry and Exit targets */}
                      <div className="viability-targets-deck">
                        <div className="viability-target-card">
                          <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Accumulation Range</span>
                          <div className="viability-target-val">${forecast.entry_low.toFixed(2)} - ${forecast.entry_high.toFixed(2)}</div>
                          <span style={{ fontSize: '7.5px', color: 'var(--text-secondary)' }}>Best DCA zone</span>
                        </div>
                        <div className="viability-target-card">
                          <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Take Profit Target</span>
                          <div className="viability-target-val">${forecast.exit_target.toFixed(2)}</div>
                          <span style={{ fontSize: '7.5px', color: 'var(--text-secondary)' }}>Exit objective</span>
                        </div>
                      </div>

                      {/* Volatility limits */}
                      <div style={{ display: 'flex', gap: 16, fontSize: '9px', color: 'var(--text-muted)', borderTop: '1px dashed rgba(255,255,255,0.03)', paddingTop: 12, width: '100%', justifyContent: 'center' }}>
                        <span>Stop Loss: <strong style={{ color: '#fff' }}>${forecast.stop_loss.toFixed(2)}</strong></span>
                        <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.05)' }}></div>
                        <span>Risk/Reward: <strong style={{ color: '#fff' }}>{forecast.risk_to_reward_ratio.toFixed(2)}x</strong></span>
                      </div>
                    </div>

                    {/* Right Column: AI Technical Rationales & Collapsible Modifiers */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div className="glass-card" style={{ padding: 24, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <Activity style={{ width: 18, height: 18, color: 'var(--color-oracle)' }} />
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '950', color: '#fff' }}>
                              Quantitative Technical Rationales
                            </h4>
                          </div>
                          
                          <div className="viability-rationales-list">
                            {forecast.rationales.map((rat, idx) => (
                              <div key={idx} className="viability-rationale-item">
                                <CheckCircle className="viability-rationale-icon" style={{ width: 12, height: 12, color: actionColor }} />
                                <span>{rat}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Collapsible Advanced Technical DNA panel */}
                        <div className="viability-dna-accordion">
                          <button
                            onClick={() => s.setIsDnaOpen(!s.isDnaOpen)}
                            className="viability-dna-toggle-btn"
                          >
                            <span>🔬 Advanced Technical DNA & Weight biases</span>
                            {s.isDnaOpen ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
                          </button>

                          {s.isDnaOpen && (
                            <div className="viability-dna-grid">
                              {/* Left side: Technical DNA Indicators meters */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className="viability-indicator-subcard" data-tooltip="Relative Strength Index (0-100) measures rapid momentum. Under 30 is oversold (prime entry), over 70 is overbought (profit-take risk).">
                                  <div className="viability-indicator-label-row">
                                    <span>Relative Strength Index ({s.viabilityHorizon === "day" ? 7 : (s.viabilityHorizon === "week" ? 14 : 21)})</span>
                                    <span style={{ color: '#fff' }}>{forecast.rsi_value.toFixed(1)}</span>
                                  </div>
                                  <div className="viability-progress-bar-bg">
                                    <div
                                      className="viability-progress-bar-fill"
                                      style={{ width: `${forecast.rsi_value}%`, background: forecast.rsi_value < 30 ? 'var(--text-highlight-green)' : (forecast.rsi_value > 70 ? 'var(--metric-pnl-neg)' : 'var(--color-oracle)') }}
                                    ></div>
                                  </div>
                                </div>

                                <div className="viability-indicator-subcard" data-tooltip="Moving Average Convergence Divergence measures trend expansion. Positive histogram indicates upward swing power; negative indicates downside acceleration.">
                                  <div className="viability-indicator-label-row">
                                    <span>MACD Histogram Momentum</span>
                                    <span style={{ color: '#fff' }}>{forecast.macd_hist.toFixed(3)}</span>
                                  </div>
                                  <div className="viability-progress-bar-bg">
                                    <div
                                      className="viability-progress-bar-fill"
                                      style={{ width: `${Math.min(100, Math.max(0, 50 + forecast.macd_hist * 100))}%`, background: forecast.macd_hist >= 0 ? 'var(--text-highlight-green)' : 'var(--metric-pnl-neg)' }}
                                    ></div>
                                  </div>
                                </div>

                                <div className="viability-indicator-subcard" data-tooltip="Measures short vs long period moving average alignment. Day relies on hyper-reactive 10-EMA, Week relies on 20-EMA/50-SMA crossovers, Month monitors macro Golden/Death Crosses.">
                                  <div className="viability-indicator-label-row">
                                    <span>Moving Average Crossings</span>
                                    <span style={{ color: '#fff' }}>{forecast.trend_score.toFixed(0)}/100</span>
                                  </div>
                                  <div className="viability-progress-bar-bg">
                                    <div
                                      className="viability-progress-bar-fill"
                                      style={{ width: `${forecast.trend_score}%`, background: forecast.trend_score >= 60 ? 'var(--text-highlight-green)' : 'var(--metric-pnl-neg)' }}
                                    ></div>
                                  </div>
                                </div>
                              </div>

                              {/* Right side: Weight Modifiers Sliders panel */}
                              <div className="viability-slider-panel">
                                <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800' }}>Tweak Quantitative Weight biases</span>
                                
                                <div className="viability-slider-row" data-tooltip="Increase this weight to make your oracle score highly reactive to immediate overbought or oversold conditions.">
                                  <div className="viability-slider-labels">
                                    <span>RSI Bias Weight</span>
                                    <span className="viability-slider-val">{s.viabilityWeights.rsi}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={s.viabilityWeights.rsi}
                                    onChange={(e) => {
                                      let val = parseInt(e.target.value);
                                      s.setViabilityWeights(prev => ({ ...prev, rsi: val }));
                                    }}
                                    className="viability-slider-input"
                                  />
                                </div>

                                <div className="viability-slider-row" data-tooltip="Increase this weight to prioritize technical trend crossovers and momentum strength over raw overbought metrics.">
                                  <div className="viability-slider-labels">
                                    <span>MACD Bias Weight</span>
                                    <span className="viability-slider-val">{s.viabilityWeights.macd}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={s.viabilityWeights.macd}
                                    onChange={(e) => {
                                      let val = parseInt(e.target.value);
                                      s.setViabilityWeights(prev => ({ ...prev, macd: val }));
                                    }}
                                    className="viability-slider-input"
                                  />
                                </div>

                                <div className="viability-slider-row" data-tooltip="Increase this weight to bias the score towards structural moving average alignments (Golden Crosses and standard support levels).">
                                  <div className="viability-slider-labels">
                                    <span>Trend / MAs Bias Weight</span>
                                    <span className="viability-slider-val">{s.viabilityWeights.trend}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={s.viabilityWeights.trend}
                                    onChange={(e) => {
                                      let val = parseInt(e.target.value);
                                      s.setViabilityWeights(prev => ({ ...prev, trend: val }));
                                    }}
                                    className="viability-slider-input"
                                  />
                                </div>

                                <button
                                  onClick={() => s.setViabilityWeights({ rsi: 35, macd: 35, trend: 30 })}
                                  className="font-size-btn viability-reset-weights-btn"
                                  style={{ marginTop: 4, width: 'fit-content' }}
                                >
                                  Reset Weights to Default (35/35/30)
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Commit prediction button */}
                        <button
                          onClick={handleCommitHorizonGuess}
                          className="viability-log-guess-btn"
                        >
                          <Target style={{ width: 14, height: 14 }} />
                          Log Exit Target (${forecast.exit_target.toFixed(2)}) as Horizon Gut Guess
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="glass-card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                  Quantifying technical metrics and viability indices for {s.selectedTicker}...
                </div>
              )}
            </div>
          )}
        </div>
  );
}
